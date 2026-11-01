import { and, eq, gt, lte, or, sql } from 'drizzle-orm';
import { fixtureLineups, fixtures, fixtureStats } from '../db/schema';
import { parseLineups, parseStats, type LineupsResponse, type StatisticsResponse } from '../lineups-stats';
import { runBatch, type PollDb, type Statement } from './db';
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

export type ExtrasProvider = {
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
type Job = { kind: 'lineups' | 'stats-ht' | 'stats-ft'; fixture: Candidate & { apiFootballId: number } };

// What to fetch now, most useful first: lineups (favorites first), then final statistics, then halftime ones.
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

  const finalStats = tracked
    .filter(
      (f) =>
        FINISHED.includes(f.status) &&
        !f.hasFinalStats &&
        f.statsFtAttempts < MAX_TRIES &&
        -minutesToKickoff(f) >= FINAL_STATS_AFTER_MINUTES,
    )
    .map((fixture): Job => ({ kind: 'stats-ft', fixture }));
  const halftimeStats = tracked
    .filter((f) => f.status === HALFTIME && !f.hasStats && f.statsHtAttempts < MAX_TRIES)
    .map((fixture): Job => ({ kind: 'stats-ht', fixture }));
  return [...lineups, ...finalStats, ...halftimeStats].slice(0, budget);
}

// Runs the jobs one request each and saves everything, with the request count, in one batch. An empty or failed
// answer still costs the request and a try, so a match whose data never comes is not asked for all day.
export async function fetchExtras(deps: { db: PollDb; provider: ExtrasProvider }, jobs: Job[], now: Date) {
  if (jobs.length === 0) return;
  const { db, provider } = deps;
  const writes: Statement[] = [];

  for (const { kind, fixture } of jobs) {
    const id = fixture.apiFootballId;
    try {
      if (kind === 'lineups') {
        const lineups = parseLineups(await provider.fetchLineups(id));
        if (lineups.length === 0) throw new Error('not announced');
        writes.push(
          db
            .insert(fixtureLineups)
            .values(lineups.map((l) => ({ fixtureId: fixture.id, ...l, updatedAt: now })))
            .onConflictDoUpdate({
              target: [fixtureLineups.fixtureId, fixtureLineups.teamId],
              set: {
                formation: sql`excluded.formation`,
                coach: sql`excluded.coach`,
                starters: sql`excluded.starters`,
                substitutes: sql`excluded.substitutes`,
                updatedAt: now,
              },
            }),
        );
      } else {
        const stats = parseStats(await provider.fetchStatistics(id));
        if (stats.length === 0) throw new Error('no statistics');
        const phase = kind === 'stats-ft' ? ('FT' as const) : ('HT' as const);
        writes.push(
          db
            .insert(fixtureStats)
            .values(stats.map((s) => ({ fixtureId: fixture.id, teamId: s.teamId, stats: s.stats, phase, updatedAt: now })))
            .onConflictDoUpdate({
              target: [fixtureStats.fixtureId, fixtureStats.teamId],
              set: { stats: sql`excluded.stats`, phase, updatedAt: now },
            }),
        );
      }
    } catch (error) {
      console.error(`${kind} for fixture ${fixture.id}: ${error instanceof Error ? error.message : error}`);
      const column =
        kind === 'lineups'
          ? { lineupsAttempts: sql`${fixtures.lineupsAttempts} + 1` }
          : kind === 'stats-ft'
            ? { statsFtAttempts: sql`${fixtures.statsFtAttempts} + 1` }
            : { statsHtAttempts: sql`${fixtures.statsHtAttempts} + 1` };
      writes.push(db.update(fixtures).set(column).where(eq(fixtures.id, fixture.id)));
    }
  }
  writes.push(recordExtraRequests(db, now, jobs.length));
  await runBatch(db, writes);
}
