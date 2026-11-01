import { and, desc, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { fixtures } from '../db/schema';
import { runBatch, type PollDb } from './db';
import { exists, fetchExtras, FINISHED, MAX_TRIES, type ExtrasProvider } from './extras';
import { hasFavorite } from './run-poller';
import { DAILY_REQUESTS, planPoll, pollStateQuery } from './quota';

// The morning catch-up (#23, ADR 0017): finished matches that have no details are fetched by id, one a run, in the quiet
// hours before the matchday polling starts. It spends from the same 100 requests a day, so it stops at a line, and it
// stops sooner on Friday to Monday, when the live polling needs the most. Once nothing is missing it makes no request.
export const ARCHIVE_STOP_LINE = 50;
export const ARCHIVE_BUSY_DAY_STOP_LINE = 20;
const BUSY_DAYS = [5, 6, 0, 1]; // Friday, Saturday, Sunday, Monday (UTC weekdays)

// A match in a league where some user has a favorite team playing.
const inFavoriteLeague = sql<boolean>`exists (select 1 from fixtures f2 join favorite_teams ft on ft.team_id in (f2.home_team_id, f2.away_team_id) where f2.league_id = "fixtures"."league_id")`;

// The one match to fetch next: a favorite team's first, then one in a favorite team's league, then the rest; newest first.
const nextQuery = (db: PollDb) =>
  db
    .select({
      id: fixtures.id,
      apiFootballId: fixtures.apiFootballId,
      kickoff: fixtures.kickoff,
      firstPolledAt: fixtures.firstPolledAt,
      hasLineups: exists('fixture_lineups').as('has_lineups'),
    })
    .from(fixtures)
    .where(
      and(
        isNotNull(fixtures.apiFootballId),
        inArray(fixtures.status, FINISHED),
        isNull(fixtures.completedAt),
        lt(fixtures.completionAttempts, MAX_TRIES),
      ),
    )
    .orderBy(sql`case when ${hasFavorite} then 0 when ${inFavoriteLeague} then 1 else 2 end`, desc(fixtures.kickoff))
    .limit(1);

// One run: at most one request. Returns whether it fetched.
export async function runArchive(deps: { db: PollDb; provider: ExtrasProvider }, now: Date): Promise<boolean> {
  const [stateRows, next] = (await runBatch(deps.db, [pollStateQuery(deps.db), nextQuery(deps.db)])) as [
    Awaited<ReturnType<typeof pollStateQuery>>,
    Awaited<ReturnType<typeof nextQuery>>,
  ];
  const [match] = next;
  if (!match || match.apiFootballId === null) return false;

  const used = DAILY_REQUESTS - planPoll(stateRows[0], now).remaining;
  const stopLine = BUSY_DAYS.includes(now.getUTCDay()) ? ARCHIVE_BUSY_DAY_STOP_LINE : ARCHIVE_STOP_LINE;
  if (used >= stopLine) return false;

  // The same fetch that completes a followed match (#24). Nobody was following this one at the end, so its events are
  // stored without an alert: they are far past the late-alert window.
  await fetchExtras(deps, [{ kind: 'final', fixture: { ...match, apiFootballId: match.apiFootballId } }], now);
  return true;
}
