import { and, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { favoriteTeams, fixtureEvents, fixtures, follows } from '../db/schema';
import { runBatch, type PollDb } from './db';
import { extrasQuery, fetchExtras, fetchLinks, pickJobs, pickLinkLookups, type ExtrasProvider } from './extras';
import { planLinks } from './link';
import { deliverAlerts } from './alerts';
import { handlePoll, type PollResponse, type TrackedFixture } from './handle-poll';
import { sendableCountQuery, type PushSender } from './send-alerts';
import { applyFallbackScores, type ScoreProvider } from './fallback';
import { FALLBACK_STATE_ID, planFallback, planPoll, pollStateQuery, recordRequest } from './quota';
import {
  HALFTIME,
  HALFTIME_MINUTES,
  IN_PLAY,
  POLL_LATE_START_MINUTES,
  MAX_MATCH_HOURS,
  NOT_STARTED,
} from './status';

const minutesBefore = (now: Date, minutes: number) => new Date(now.getTime() - minutes * 60_000);

// Alerts owed, from events and from a change of status: a count in the first read, so a quiet run adds no request.
const owedAlertsQuery = (db: PollDb) =>
  db.select({
    count: sql<number>`(select count(*) from fixture_events where alert_state = 'due' or correction_due) + (select count(*) from fixtures where kickoff_alert_due or full_time_alert_due or score_alert_due)`.mapWith(Number),
  }).from(sql`(select 1) as one`);

// Fixtures still without an API-Football id that could be in play now. The live response lists every match of the
// polled leagues, so each one it matches gets its id for free; the archive needs those ids later (#23). Only the link is
// made here: storing the events of matches nobody tracks would make the poll heavier, and it is already near its CPU cap.
const LINK_WINDOW_AHEAD_MINUTES = 30;
const unlinkedQuery = (db: PollDb, now: Date) =>
  db
    .select({ id: fixtures.id, leagueId: fixtures.leagueId, homeTeamId: fixtures.homeTeamId, awayTeamId: fixtures.awayTeamId, kickoff: fixtures.kickoff })
    .from(fixtures)
    .where(
      and(
        isNull(fixtures.apiFootballId),
        gt(fixtures.kickoff, minutesBefore(now, MAX_MATCH_HOURS * 60)),
        lte(fixtures.kickoff, new Date(now.getTime() + LINK_WINDOW_AHEAD_MINUTES * 60_000)),
      ),
    );

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
      footballDataId: fixtures.footballDataId,
      leagueId: fixtures.leagueId,
      homeTeamId: fixtures.homeTeamId,
      awayTeamId: fixtures.awayTeamId,
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
          and(eq(fixtures.status, NOT_STARTED), gt(fixtures.kickoff, minutesBefore(now, POLL_LATE_START_MINUTES))),
          and(eq(fixtures.status, HALFTIME), lte(fixtures.updatedAt, minutesBefore(now, HALFTIME_MINUTES))),
        ),
        or(hasFavorite, hasFollow),
      ),
    );

export async function runPoller(
  // `fallback` is football-data.org: it stands in while API-Football's quota is spent (#21).
  deps: { db: PollDb; push: PushSender; provider: LiveProvider; fallback?: ScoreProvider },
  now: Date,
) {
  // One Neon request reads the quota state, every candidate fixture and the fixtures that may need lineups or statistics.
  const [stateRows, candidates, extraRows, owedRows, sendableRows, fallbackStateRows, unlinkedRows] = (await runBatch(deps.db, [
    pollStateQuery(deps.db),
    dueFixturesQuery(deps.db, now),
    extrasQuery(deps.db, now),
    owedAlertsQuery(deps.db),
    sendableCountQuery(deps.db),
    pollStateQuery(deps.db, FALLBACK_STATE_ID),
    unlinkedQuery(deps.db, now),
  ])) as [
    Awaited<ReturnType<typeof pollStateQuery>>,
    Awaited<ReturnType<typeof dueFixturesQuery>>,
    Awaited<ReturnType<typeof extrasQuery>>,
    Awaited<ReturnType<typeof owedAlertsQuery>>,
    Awaited<ReturnType<typeof sendableCountQuery>>,
    Awaited<ReturnType<typeof pollStateQuery>>,
    Awaited<ReturnType<typeof unlinkedQuery>>,
  ];
  const plan = planPoll(stateRows[0], now);

  let alertsOwed = owedRows[0].count > 0 || sendableRows[0].count > 0; // left over from an earlier run
  // Fixtures the live poll linked this run: they are in play, so they need no lookup.
  const linkedByPoll = new Set<number>();
  const due = plan.canPoll ? candidates.filter((f) => !plan.favoritesOnly || f.favorite) : [];
  if (due.length > 0) {
    const live = await deps.provider.fetchLive([...new Set(due.map((f) => f.leagueId))]);
    // A snapshot fixture has no API-Football id until it shows up in the live response: link it from there, with no
    // request of its own (#22). Whatever cannot be matched exactly is reported and left alone.
    const plan = unlinkedRows.length ? planLinks(unlinkedRows, live.response) : { links: [], unmatched: [], ambiguous: [] };
    // A tracked fixture with no live match is worth a warning; one nobody tracks that is not live right now is not.
    const dueIds = new Set(due.map((f) => f.id));
    const notLinked = plan.unmatched.filter((id) => dueIds.has(id));
    if (notLinked.length || plan.ambiguous.length) {
      console.warn(`fixtures not linked to a live match: none found for [${notLinked}], ambiguous for [${plan.ambiguous}]`);
    }
    const linkedTo = new Map(plan.links.map((l) => [l.fixtureId, l.apiFootballId]));
    linkedTo.forEach((_, id) => linkedByPoll.add(id));
    const tracked: TrackedFixture[] = due.flatMap((f) => {
      const apiFootballId = f.apiFootballId ?? linkedTo.get(f.id) ?? null;
      return apiFootballId === null ? [] : [{ ...f, apiFootballId }];
    });
    // In the poll's own batch, so a link and the events it unlocks are saved together. The `not exists` keeps the id
    // unique if another fixture already holds it.
    const linkWrites = plan.links.map((l) =>
      deps.db
        .update(fixtures)
        .set({ apiFootballId: l.apiFootballId })
        .where(and(eq(fixtures.id, l.fixtureId), sql`not exists (select 1 from fixtures other where other.api_football_id = ${l.apiFootballId})`)),
    );
    // The request counter is written in the same batch as the poll's events.
    const polled = await handlePoll({ db: deps.db, now }, live, tracked, [recordRequest(deps.db, now), ...linkWrites]);
    alertsOwed ||= polled.alertsOwed;
  }

  // The quota is spent: football-data.org gives the score and status of what is in play, every 10 minutes (ADR 0015).
  // If it fails too, nothing is polled and the app shows "updates paused"; the next beat tries again.
  if (plan.remaining === 0 && deps.fallback && candidates.length > 0 && planFallback(fallbackStateRows[0], now).canPoll) {
    try {
      const scores = await deps.fallback.fetchLiveScores();
      const applied = applyFallbackScores(deps.db, scores, candidates, now);
      await runBatch(deps.db, [...applied.statements, recordRequest(deps.db, now, FALLBACK_STATE_ID)]);
      alertsOwed ||= applied.alertsOwed;
    } catch (e) {
      console.error(`football-data.org fallback failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Lineups and statistics come after the live poll, from what is left of the day's quota.
  // A followed match with no id is looked up first, so its lineups can be asked for in this same run.
  const remaining = plan.remaining - (due.length > 0 ? 1 : 0);
  const lookups = pickLinkLookups(extraRows.filter((f) => !linkedByPoll.has(f.id)), now, { low: plan.low, remaining });
  const linked = await fetchLinks(deps, lookups, now);
  const rows = extraRows.map((f) => (linked.has(f.id) ? { ...f, apiFootballId: linked.get(f.id)! } : f));
  const jobs = pickJobs(rows, now, { low: plan.low, remaining: remaining - lookups.length });
  alertsOwed ||= await fetchExtras(deps, jobs, now);

  // Goals and corrections the poll owes, or an earlier run left unsent: write them as pending rows, then send (#13).
  if (alertsOwed) await deliverAlerts(deps);
}
