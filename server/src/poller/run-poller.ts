import { and, eq, gt, inArray, lte, or, sql } from 'drizzle-orm';
import { favoriteTeams, fixtureEvents, fixtures, follows } from '../db/schema';
import { runBatch, type PollDb } from './db';
import { extrasQuery, fetchExtras, pickJobs, type ExtrasProvider } from './extras';
import { deliverAlerts } from './alerts';
import { handlePoll, type PollResponse, type TrackedFixture } from './handle-poll';
import { sendableCountQuery, type PushSender } from './send-alerts';
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

// Rows with an alert owed: a count in the first read, so a quiet run adds no request.
const owedAlertsQuery = (db: PollDb) =>
  db
    .select({ count: sql<number>`count(*)::int` })
    .from(fixtureEvents)
    .where(or(eq(fixtureEvents.alertState, 'due'), eq(fixtureEvents.correctionDue, true)));

export type LiveProvider = { fetchLive(leagueIds: number[]): Promise<PollResponse> } & ExtrasProvider;

export const hasFavorite = sql<boolean>`exists (select 1 from ${favoriteTeams} where ${favoriteTeams.teamId} in (${fixtures.homeTeamId}, ${fixtures.awayTeamId}))`;
export const hasFollow = sql<boolean>`exists (select 1 from ${follows} where ${follows.fixtureId} = ${fixtures.id})`;

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
  // One Neon request reads the quota state, every candidate fixture and the fixtures that may need lineups or statistics.
  const [stateRows, candidates, extraRows, owedRows, sendableRows] = (await runBatch(deps.db, [
    pollStateQuery(deps.db),
    dueFixturesQuery(deps.db, now),
    extrasQuery(deps.db, now),
    owedAlertsQuery(deps.db),
    sendableCountQuery(deps.db),
  ])) as [
    Awaited<ReturnType<typeof pollStateQuery>>,
    Awaited<ReturnType<typeof dueFixturesQuery>>,
    Awaited<ReturnType<typeof extrasQuery>>,
    Awaited<ReturnType<typeof owedAlertsQuery>>,
    Awaited<ReturnType<typeof sendableCountQuery>>,
  ];
  const plan = planPoll(stateRows[0], now);

  let alertsOwed = owedRows[0].count > 0 || sendableRows[0].count > 0; // left over from an earlier run
  const due = plan.canPoll ? candidates.filter((f) => !plan.favoritesOnly || f.favorite) : [];
  if (due.length > 0) {
    const live = await deps.provider.fetchLive([...new Set(due.map((f) => f.leagueId))]);
    const tracked: TrackedFixture[] = due.flatMap((f) => (f.apiFootballId === null ? [] : [{ ...f, apiFootballId: f.apiFootballId }]));
    // The request counter is written in the same batch as the poll's events.
    const polled = await handlePoll({ db: deps.db, now }, live, tracked, [recordRequest(deps.db, now)]);
    alertsOwed ||= polled.alertsOwed;
  }

  // Lineups and statistics come after the live poll, from what is left of the day's quota.
  const jobs = pickJobs(extraRows, now, { low: plan.low, remaining: plan.remaining - (due.length > 0 ? 1 : 0) });
  await fetchExtras(deps, jobs, now);

  // Goals and corrections the poll owes, or an earlier run left unsent: write them as pending rows, then send (#13).
  if (alertsOwed) await deliverAlerts(deps);
}
