import { and, eq, gt, lte, or, sql } from 'drizzle-orm';
import { fixtureEvents, fixtureLineups, fixtures, fixtureStats } from '../db/schema';
import { parseLineups, parseStats, type LineupsResponse, type StatisticsResponse } from '../lineups-stats';
import { runBatch, type PollDb, type Statement } from './db';
import { eventRow, isAlertable, type ApiEvent } from './handle-poll';
import { hasFavorite, hasFollow } from './run-poller';
import { HALFTIME, MAX_LATE_START_MINUTES, MAX_MATCH_HOURS, NOT_STARTED } from './status';
import { recordExtraRequests } from './quota';

// Lineups usually appear 20 to 40 minutes before kickoff. Asking from 35 minutes out, on the 5-minute beat, finds them soon.
export const LINEUP_LEAD_MINUTES = 35;
// Lineups and statistics are fetched at most this many times per match and phase, empty answers included.
export const MAX_TRIES = 3;
// Extra requests in one run, so a busy beat cannot spend a big part of the day at once.
export const MAX_EXTRA_PER_RUN = 3;
// A match is marked FT at about 100 minutes, a little before the whistle. Final statistics wait until it is surely over.
export const FINAL_STATS_AFTER_MINUTES = 110;
const FINISHED = ['FT', 'AET', 'PEN'];

// What a goal found only after full time may still be news: within this long after kickoff it is alerted, after it the
// timeline is filled in silently (the final score has long since reached everyone).
export const LATE_ALERT_MINUTES = 150;

// `fixtures?id=<one match>`: the match with its events, and, when the plan has them, its lineups and statistics.
export type FixtureResponse = {
  response: { fixture: { id: number }; events?: ApiEvent[]; lineups?: LineupsResponse['response']; statistics?: StatisticsResponse['response'] }[];
};

export type ExtrasProvider = {
  fetchFixture(apiFootballId: number): Promise<FixtureResponse>;
  fetchLineups(apiFootballId: number): Promise<LineupsResponse>;
  fetchStatistics(apiFootballId: number): Promise<StatisticsResponse>;
};

// Written out in full: drizzle drops the table name from a column in a single-table select, and a bare `id` would
// resolve to the subquery's own table.
const exists = (table: string, extra = sql``) =>
  sql<boolean>`exists (select 1 from ${sql.identifier(table)} where ${sql.identifier(table)}.fixture_id = "fixtures"."id" ${extra})`;

// Live-tracked fixtures that may need lineups or statistics, with what they already have.
export const extrasQuery = (db: PollDb, now: Date) =>
  db
    .select({
      id: fixtures.id,
      apiFootballId: fixtures.apiFootballId,
      status: fixtures.status,
      kickoff: fixtures.kickoff,
      lineupsAttempts: fixtures.lineupsAttempts,
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
        lte(fixtures.kickoff, new Date(now.getTime() + LINEUP_LEAD_MINUTES * 60_000)),
        or(hasFavorite, hasFollow),
      ),
    );

type Candidate = Awaited<ReturnType<typeof extrasQuery>>[number];
type Job = { kind: 'lineups' | 'final' | 'stats-ht' | 'stats-ft'; fixture: Candidate & { apiFootballId: number } };

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
        f.status === NOT_STARTED &&
        !f.hasLineups &&
        minutesToKickoff(f) > -MAX_LATE_START_MINUTES &&
        f.lineupsAttempts < MAX_TRIES &&
        (!plan.low || (f.favorite && f.lineupsAttempts === 0)),
    )
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.kickoff.getTime() - b.kickoff.getTime())
    .map((fixture): Job => ({ kind: 'lineups', fixture }));
  if (plan.low) return lineups.slice(0, budget);

  const over = (f: Candidate) => FINISHED.includes(f.status) && -minutesToKickoff(f) >= FINAL_STATS_AFTER_MINUTES;
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

  for (const { kind, fixture } of jobs) {
    const id = fixture.apiFootballId;
    try {
      if (kind === 'final') {
        const item = (await provider.fetchFixture(id)).response[0];
        if (!item) throw new Error('not found');
        // A goal, card or substitution the last poll never saw happened after it, so it is news if the match has only
        // just ended and the poller was following it. Older than that, or never followed live, it is stored quietly.
        const news = fixture.firstPolledAt !== null && now.getTime() - fixture.kickoff.getTime() <= LATE_ALERT_MINUTES * 60_000;
        const rows = (item.events ?? []).map((e) => eventRow(fixture.id, e, news && isAlertable(e)));
        if (rows.length) writes.push(db.insert(fixtureEvents).values(rows).onConflictDoNothing());
        alertsOwed ||= rows.some((r) => r.alertState === 'due');

        const lineups = parseLineups({ response: item.lineups ?? [] });
        if (lineups.length && !fixture.hasLineups) writes.push(upsertLineups(db, fixture.id, lineups, now));
        const stats = parseStats({ response: item.statistics ?? [] });
        if (stats.length) writes.push(upsertStats(db, fixture.id, stats, 'FT', now));
        writes.push(db.update(fixtures).set({ completedAt: now }).where(eq(fixtures.id, fixture.id)));
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
      console.error(`${kind} for fixture ${fixture.id}: ${error instanceof Error ? error.message : error}`);
      const column =
        kind === 'lineups'
          ? { lineupsAttempts: sql`${fixtures.lineupsAttempts} + 1` }
          : kind === 'final'
            ? { completionAttempts: sql`${fixtures.completionAttempts} + 1` }
            : kind === 'stats-ft'
            ? { statsFtAttempts: sql`${fixtures.statsFtAttempts} + 1` }
            : { statsHtAttempts: sql`${fixtures.statsHtAttempts} + 1` };
      writes.push(db.update(fixtures).set(column).where(eq(fixtures.id, fixture.id)));
    }
  }
  writes.push(recordExtraRequests(db, now, jobs.length));
  await runBatch(db, writes);
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
