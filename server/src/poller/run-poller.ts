import { and, eq, gt, inArray, lte, or, sql } from 'drizzle-orm';
import { favoriteTeams, fixtures, follows } from '../db/schema';
import { runBatch, type PollDb } from './db';
import { handlePoll, type PollResponse, type PushSender, type TrackedFixture } from './handle-poll';
import { planPoll, pollStateQuery, recordRequest } from './quota';
import {
  HALFTIME,
  HALFTIME_MINUTES,
  IN_PLAY,
  MAX_LATE_START_MINUTES,
  MAX_MATCH_HOURS,
  NOT_STARTED,
} from './status';

const minutesBefore = (now: Date, minutes: number) => new Date(now.getTime() - minutes * 60_000);

export type LiveProvider = { fetchLive(leagueIds: number[]): Promise<PollResponse> };

const hasFavorite = sql<boolean>`exists (select 1 from ${favoriteTeams} where ${favoriteTeams.teamId} in (${fixtures.homeTeamId}, ${fixtures.awayTeamId}))`;
const hasFollow = sql<boolean>`exists (select 1 from ${follows} where ${follows.fixtureId} = ${fixtures.id})`;

// Live-tracked fixtures that have kicked off and are not over: a favorite team plays or a user follows the match.
// Each comes with its reason (ADR 0013).
const dueFixturesQuery = (db: PollDb, now: Date) =>
  db
    .select({
      id: fixtures.id,
      apiFootballId: fixtures.apiFootballId,
      leagueId: fixtures.leagueId,
      homeTeamId: fixtures.homeTeamId,
      kickoff: fixtures.kickoff,
      firstPolledAt: fixtures.firstPolledAt,
      status: fixtures.status,
      homeGoals: fixtures.homeGoals,
      awayGoals: fixtures.awayGoals,
      favorite: hasFavorite.as('favorite'),
    })
    .from(fixtures)
    .where(
      and(
        gt(fixtures.kickoff, minutesBefore(now, MAX_MATCH_HOURS * 60)),
        lte(fixtures.kickoff, now),
        or(
          inArray(fixtures.status, IN_PLAY),
          and(eq(fixtures.status, NOT_STARTED), gt(fixtures.kickoff, minutesBefore(now, MAX_LATE_START_MINUTES))),
          and(eq(fixtures.status, HALFTIME), lte(fixtures.updatedAt, minutesBefore(now, HALFTIME_MINUTES))),
        ),
        or(hasFavorite, hasFollow),
      ),
    );

export async function runPoller(deps: { db: PollDb; push: PushSender; provider: LiveProvider }, now: Date) {
  // One Neon request reads the quota state and every candidate fixture.
  const [stateRows, candidates] = (await runBatch(deps.db, [pollStateQuery(deps.db), dueFixturesQuery(deps.db, now)])) as [
    Awaited<ReturnType<typeof pollStateQuery>>,
    Awaited<ReturnType<typeof dueFixturesQuery>>,
  ];
  const plan = planPoll(stateRows[0], now);
  if (!plan.canPoll) return;

  const due = candidates.filter((f) => !plan.favoritesOnly || f.favorite);
  if (due.length === 0) return;

  const live = await deps.provider.fetchLive([...new Set(due.map((f) => f.leagueId))]);
  const tracked: TrackedFixture[] = due.flatMap((f) => (f.apiFootballId === null ? [] : [{ ...f, apiFootballId: f.apiFootballId }]));
  // The request counter is written in the same batch as the poll's events.
  await handlePoll({ ...deps, now }, live, tracked, [recordRequest(deps.db, now)]);
}
