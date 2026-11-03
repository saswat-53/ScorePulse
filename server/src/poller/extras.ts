import { and, eq, gt, inArray, lte, or, sql } from 'drizzle-orm';
import { fixtureEvents, fixtureLineups, fixtures, fixtureStats } from '../db/schema';
import { parseLineups, parseStats, type LineupsResponse, type StatisticsResponse } from '../lineups-stats';
import { runBatch, type PollDb, type Statement } from './db';
import { complete, eventRow, isAlertable, type RawApiEvent } from './handle-poll';
import { RateLimited } from './rate-limit';
import { planLinks, type LinkCandidate, type LiveMatch } from './link';
import { hasFavorite, hasFollow } from './run-poller';
import { HALFTIME, IN_PLAY, MAX_LATE_START_MINUTES, MAX_MATCH_HOURS, NOT_STARTED } from './status';
import { recordExtraRequests } from './quota';

// Lineups are asked for at 60, 45 and 30 minutes before kickoff, and once more at 10 if they are still missing. A try
// waits for its minute and for LINEUP_GAP_MINUTES after the one before, so tries that start late are not packed into
// consecutive beats. The gap is a minute short of 15 because a run can start a little early.
export const LINEUP_TRY_MINUTES = [60, 45, 30, 10];
export const LINEUP_GAP_MINUTES = 14;
// A followed match with no API-Football id is looked up (by date) this long before kickoff, so the id is
// there when the first lineups try is due.
export const LINK_LEAD_MINUTES = 70;
// Lookups that do not find a match, at most, before it is left alone.
export const MAX_LINK_TRIES = 2;
// Statistics and the completion fetch are tried at most this many times per match and phase, empty answers included.
export const MAX_TRIES = 3;
// Extra requests in one run, so a busy beat cannot spend a big part of the day at once.
export const MAX_EXTRA_PER_RUN = 3;
// A match is marked FT at about 100 minutes, a little before the whistle. Final statistics wait until it is surely over.
export const FINAL_STATS_AFTER_MINUTES = 110;
export const FINISHED = ['FT', 'AET', 'PEN'];
// A match still marked in play or at halftime this long after kickoff is stuck: the polls that would have moved it on
// were refused or failed, and `live=` no longer lists it. Past the late-alert window, so closing it is always silent.
export const STUCK_AFTER_MINUTES = 155;

// What a goal found only after full time may still be news: within this long after kickoff it is alerted, after it the
// timeline is filled in silently (the final score has long since reached everyone).
export const LATE_ALERT_MINUTES = 150;

// `fixtures?id=<one match>`: the match with its events, and, when the plan has them, its lineups and statistics.
export type FixtureResponse = {
  response: { fixture: { id: number; status?: { short: string } }; goals?: { home: number | null; away: number | null }; events?: RawApiEvent[]; lineups?: LineupsResponse['response']; statistics?: StatisticsResponse['response'] }[];
};

// `fixtures?date=<day>`: what the by-date lookup returns, as far as the link reads it.
export type FixturesOnResponse = { response: LiveMatch[] };

export type ExtrasProvider = {
  fetchFixturesOn(date: string): Promise<FixturesOnResponse>;
  fetchFixture(apiFootballId: number): Promise<FixtureResponse>;
  fetchLineups(apiFootballId: number): Promise<LineupsResponse>;
  fetchStatistics(apiFootballId: number): Promise<StatisticsResponse>;
};

// Written out in full: drizzle drops the table name from a column in a single-table select, and a bare `id` would
// resolve to the subquery's own table.
export const exists = (table: string, extra = sql``) =>
  sql<boolean>`exists (select 1 from ${sql.identifier(table)} where ${sql.identifier(table)}.fixture_id = "fixtures"."id" ${extra})`;

// Live-tracked fixtures that may need lineups or statistics, with what they already have.
export const extrasQuery = (db: PollDb, now: Date) =>
  db
    .select({
      id: fixtures.id,
      apiFootballId: fixtures.apiFootballId,
      status: fixtures.status,
      kickoff: fixtures.kickoff,
      leagueId: fixtures.leagueId,
      homeTeamId: fixtures.homeTeamId,
      awayTeamId: fixtures.awayTeamId,
      lineupsAttempts: fixtures.lineupsAttempts,
      lineupsTriedAt: fixtures.lineupsTriedAt,
      linkAttempts: fixtures.linkAttempts,
      statsHtAttempts: fixtures.statsHtAttempts,
      statsFtAttempts: fixtures.statsFtAttempts,
      completedAt: fixtures.completedAt,
      completionAttempts: fixtures.completionAttempts,
      firstPolledAt: fixtures.firstPolledAt,
      favorite: hasFavorite.as('favorite'),
      hasLineups: exists('fixture_lineups').as('has_lineups'),
      hasStats: exists('fixture_stats').as('has_stats'),
      hasFinalStats: exists('fixture_stats', sql`and ${sql.identifier('fixture_stats')}.phase = 'FT'`).as('has_final_stats'),
    })
    .from(fixtures)
    .where(
      and(
        gt(fixtures.kickoff, new Date(now.getTime() - MAX_MATCH_HOURS * 3_600_000)),
        lte(fixtures.kickoff, new Date(now.getTime() + LINK_LEAD_MINUTES * 60_000)),
        or(hasFavorite, hasFollow),
      ),
    );

type Candidate = Awaited<ReturnType<typeof extrasQuery>>[number];
// What a fetch needs to know about its match. The archive (#23) has fewer columns than the poller's candidates.
type JobFixture = Pick<Candidate, 'id' | 'kickoff' | 'firstPolledAt' | 'hasLineups' | 'status'> & { apiFootballId: number };
export type Job = { kind: 'lineups' | 'final' | 'stats-ht' | 'stats-ft'; fixture: JobFixture };

// The next lineups try is due when its minute before kickoff has come and the one before it is a quarter of an hour old.
const lineupsTryDue = (f: Pick<Candidate, 'kickoff' | 'lineupsAttempts' | 'lineupsTriedAt'>, now: Date) => {
  const dueAt = LINEUP_TRY_MINUTES[f.lineupsAttempts];
  if (dueAt === undefined) return false;
  const minutesToKickoff = (f.kickoff.getTime() - now.getTime()) / 60_000;
  const sinceLast = f.lineupsTriedAt ? (now.getTime() - f.lineupsTriedAt.getTime()) / 60_000 : Infinity;
  return minutesToKickoff <= dueAt && sinceLast >= LINEUP_GAP_MINUTES;
};

// One lookup per UTC day, shared by every followed match of that day that has no id yet (whatever its league).
export type LinkLookup = { date: string; fixtures: LinkCandidate[] };

// The lookups to make now. Low quota keeps only a favorite's matches (ADR 0016).
export function pickLinkLookups(rows: Candidate[], now: Date, plan: { low: boolean; remaining: number }): LinkLookup[] {
  const budget = Math.min(MAX_EXTRA_PER_RUN, plan.remaining);
  if (budget <= 0) return [];
  const groups = new Map<string, LinkLookup>();
  for (const f of rows) {
    const minutesToKickoff = (f.kickoff.getTime() - now.getTime()) / 60_000;
    if (
      f.apiFootballId !== null ||
      f.status !== NOT_STARTED ||
      f.linkAttempts >= MAX_LINK_TRIES ||
      minutesToKickoff > LINK_LEAD_MINUTES ||
      minutesToKickoff <= -MAX_LATE_START_MINUTES ||
      (plan.low && !f.favorite)
    ) {
      continue;
    }
    const date = f.kickoff.toISOString().slice(0, 10);
    const group = groups.get(date) ?? { date, fixtures: [] };
    group.fixtures.push(f);
    groups.set(date, group);
  }
  return [...groups.values()].slice(0, budget);
}

// Makes the lookups, one request each, and links every match they list (the exact-match rule of #22). A match a lookup
// does not list, or a lookup that fails, costs the match one of its tries. Returns the new ids by fixture.
export async function fetchLinks(deps: { db: PollDb; provider: ExtrasProvider }, lookups: LinkLookup[], now: Date) {
  const { db, provider } = deps;
  const linked = new Map<number, number>();
  const writes: Statement[] = [];
  let made = 0;
  let refused = false;

  for (const { date, fixtures: wanted } of lookups) {
    let links: { fixtureId: number; apiFootballId: number }[] = [];
    try {
      made++;
      links = planLinks(wanted, (await provider.fetchFixturesOn(date)).response).links;
    } catch (error) {
      // Refused for rate limit: the day was not looked up, so it costs no try and no request, and the run stops.
      if (error instanceof RateLimited) {
        made--;
        refused = true;
        break;
      }
      console.error(`lookup of ${date}: ${error instanceof Error ? error.message : error}`);
    }
    const found = new Set(links.map((l) => l.fixtureId));
    for (const l of links) {
      linked.set(l.fixtureId, l.apiFootballId);
      // The `not exists` keeps the id unique if another fixture already holds it.
      writes.push(
        db
          .update(fixtures)
          .set({ apiFootballId: l.apiFootballId })
          .where(and(eq(fixtures.id, l.fixtureId), sql`not exists (select 1 from fixtures other where other.api_football_id = ${l.apiFootballId})`)),
      );
    }
    const missed = wanted.filter((f) => !found.has(f.id)).map((f) => f.id);
    if (missed.length) {
      writes.push(db.update(fixtures).set({ linkAttempts: sql`${fixtures.linkAttempts} + 1` }).where(inArray(fixtures.id, missed)));
    }
  }
  if (made > 0) {
    writes.push(recordExtraRequests(db, now, made));
    await runBatch(db, writes);
  }
  return { linked, refused };
}

// What to fetch now, most useful first: lineups (favorites first), the match completed by id, then final statistics,
// then halftime ones.
// Low quota keeps only the first try of a favorite's lineups; statistics wait for a better day (ADR 0016).
export function pickJobs(rows: Candidate[], now: Date, plan: { low: boolean; remaining: number }): Job[] {
  const budget = Math.min(MAX_EXTRA_PER_RUN, plan.remaining);
  if (budget <= 0) return [];
  const minutesToKickoff = (f: Candidate) => (f.kickoff.getTime() - now.getTime()) / 60_000;
  const tracked = rows.filter((f): f is Candidate & { apiFootballId: number } => f.apiFootballId !== null);

  const lineups = tracked
    .filter(
      (f) =>
        // Not started, or already in play with the lineups missed (a match first tracked after kickoff).
        ((f.status === NOT_STARTED && minutesToKickoff(f) > -MAX_LATE_START_MINUTES) || [...IN_PLAY, HALFTIME].includes(f.status)) &&
        !f.hasLineups &&
        lineupsTryDue(f, now) &&
        (!plan.low || (f.favorite && f.lineupsAttempts === 0)),
    )
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.kickoff.getTime() - b.kickoff.getTime())
    .map((fixture): Job => ({ kind: 'lineups', fixture }));
  if (plan.low) return lineups.slice(0, budget);

  const stuck = (f: Candidate) => [...IN_PLAY, HALFTIME].includes(f.status) && -minutesToKickoff(f) >= STUCK_AFTER_MINUTES;
  const over = (f: Candidate) => (FINISHED.includes(f.status) && -minutesToKickoff(f) >= FINAL_STATS_AFTER_MINUTES) || stuck(f);
  // One fetch by id once the match is over fills in what the last poll missed (#24), and brings the final lineups and
  // statistics when the plan returns them.
  const completion = tracked
    .filter((f) => over(f) && f.completedAt === null && f.completionAttempts < MAX_TRIES)
    .map((fixture): Job => ({ kind: 'final', fixture }));
  // The separate final-statistics request only follows when the completion fetch did not bring them.
  const finalStats = tracked
    .filter(
      (f) =>
        over(f) &&
        !f.hasFinalStats &&
        f.statsFtAttempts < MAX_TRIES &&
        (f.completedAt !== null || f.completionAttempts >= MAX_TRIES),
    )
    .map((fixture): Job => ({ kind: 'stats-ft', fixture }));
  const halftimeStats = tracked
    .filter((f) => f.status === HALFTIME && !f.hasStats && f.statsHtAttempts < MAX_TRIES)
    .map((fixture): Job => ({ kind: 'stats-ht', fixture }));
  return [...lineups, ...completion, ...finalStats, ...halftimeStats].slice(0, budget);
}

// Runs the jobs one request each and saves everything, with the request count, in one batch. An empty or failed
// answer still costs the request and a try, so a match whose data never comes is not asked for all day.
export async function fetchExtras(deps: { db: PollDb; provider: ExtrasProvider }, jobs: Job[], now: Date): Promise<boolean> {
  if (jobs.length === 0) return false;
  const { db, provider } = deps;
  const writes: Statement[] = [];
  let alertsOwed = false;
  let made = 0;

  for (const { kind, fixture } of jobs) {
    const id = fixture.apiFootballId;
    try {
      made++;
      if (kind === 'final') {
        const item = (await provider.fetchFixture(id)).response[0];
        if (!item) throw new Error('not found');
        // A goal, card or substitution the last poll never saw happened after it, so it is news if the match has only
        // just ended and the poller was following it. Older than that, or never followed live, it is stored quietly.
        const news = fixture.firstPolledAt !== null && now.getTime() - fixture.kickoff.getTime() <= LATE_ALERT_MINUTES * 60_000;
        const rows = complete(item.events ?? []).map((e) => eventRow(fixture.id, e, news && isAlertable(e)));
        if (rows.length) writes.push(db.insert(fixtureEvents).values(rows).onConflictDoNothing());
        alertsOwed ||= rows.some((r) => r.alertState === 'due');

        const lineups = parseLineups({ response: item.lineups ?? [] });
        if (lineups.length && !fixture.hasLineups) writes.push(upsertLineups(db, fixture.id, lineups, now));
        const stats = parseStats({ response: item.statistics ?? [] });
        if (stats.length) writes.push(upsertStats(db, fixture.id, stats, 'FT', now));
        // A match the polls left in play or at halftime takes its final status and score from this answer, silently.
        const finalStatus = item.fixture.status?.short;
        const closes = finalStatus !== undefined && FINISHED.includes(finalStatus) && !FINISHED.includes(fixture.status);
        writes.push(
          db
            .update(fixtures)
            .set({ completedAt: now, ...(closes && { status: finalStatus, homeGoals: item.goals?.home ?? null, awayGoals: item.goals?.away ?? null, updatedAt: now }) })
            .where(eq(fixtures.id, fixture.id)),
        );
      } else if (kind === 'lineups') {
        const lineups = parseLineups(await provider.fetchLineups(id));
        if (lineups.length === 0) throw new Error('not announced');
        writes.push(upsertLineups(db, fixture.id, lineups, now));
      } else {
        const stats = parseStats(await provider.fetchStatistics(id));
        if (stats.length === 0) throw new Error('no statistics');
        writes.push(upsertStats(db, fixture.id, stats, kind === 'stats-ft' ? 'FT' : 'HT', now));
      }
    } catch (error) {
      // Refused for rate limit: nothing was asked, so no try and no request are spent, and the run stops here.
      if (error instanceof RateLimited) {
        made--;
        break;
      }
      console.error(`${kind} for fixture ${fixture.id}: ${error instanceof Error ? error.message : error}`);
      const column =
        kind === 'lineups'
          ? { lineupsAttempts: sql`${fixtures.lineupsAttempts} + 1`, lineupsTriedAt: now }
          : kind === 'final'
            ? { completionAttempts: sql`${fixtures.completionAttempts} + 1` }
            : kind === 'stats-ft'
            ? { statsFtAttempts: sql`${fixtures.statsFtAttempts} + 1` }
            : { statsHtAttempts: sql`${fixtures.statsHtAttempts} + 1` };
      writes.push(db.update(fixtures).set(column).where(eq(fixtures.id, fixture.id)));
    }
  }
  if (made > 0) {
    writes.push(recordExtraRequests(db, now, made));
    await runBatch(db, writes);
  }
  return alertsOwed;
}

// Saves a match's lineups (both teams); a second save replaces the first.
const upsertLineups = (db: PollDb, fixtureId: number, lineups: ReturnType<typeof parseLineups>, now: Date) =>
  db
    .insert(fixtureLineups)
    .values(lineups.map((l) => ({ fixtureId, ...l, updatedAt: now })))
    .onConflictDoUpdate({
      target: [fixtureLineups.fixtureId, fixtureLineups.teamId],
      set: {
        formation: sql`excluded.formation`,
        coach: sql`excluded.coach`,
        starters: sql`excluded.starters`,
        substitutes: sql`excluded.substitutes`,
        updatedAt: now,
      },
    });

// Saves a match's statistics for a phase ('HT', then 'FT' replacing it).
const upsertStats = (db: PollDb, fixtureId: number, stats: ReturnType<typeof parseStats>, phase: 'HT' | 'FT', now: Date) =>
  db
    .insert(fixtureStats)
    .values(stats.map((s) => ({ fixtureId, teamId: s.teamId, stats: s.stats, phase, updatedAt: now })))
    .onConflictDoUpdate({
      target: [fixtureStats.fixtureId, fixtureStats.teamId],
      set: { stats: sql`excluded.stats`, phase, updatedAt: now },
    });
