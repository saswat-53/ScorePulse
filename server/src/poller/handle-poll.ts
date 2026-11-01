import { and, eq, inArray, sql } from 'drizzle-orm';
import { fixtureEvents, fixtures } from '../db/schema';
import { runBatch, type PollDb, type Statement } from './db';
import { FULL_TIME, HALFTIME, IN_PLAY, NOT_STARTED, PRESUMED_OVER_MINUTES } from './status';

// The parts of an API-Football `fixtures?live=` response the poller reads.
export type ApiEvent = {
  time: { elapsed: number; extra: number | null };
  team: { id: number };
  player: { id: number | null; name: string | null };
  assist?: { id: number | null; name: string | null };
  type: string;
  detail: string;
};
export type PollResponse = {
  response: {
    fixture: { id: number; date?: string; status?: { short: string; elapsed?: number | null } };
    // What links a snapshot fixture to this match (#22).
    league?: { id: number };
    teams?: { home: { id: number }; away: { id: number } };
    goals?: { home: number | null; away: number | null };
    events?: ApiEvent[];
  }[];
};

// A live-tracked fixture as the poller read it before the provider call: its row, so the poll needs no lookup of its own.
export type TrackedFixture = Pick<
  typeof fixtures.$inferSelect,
  'id' | 'homeTeamId' | 'kickoff' | 'firstPolledAt' | 'status' | 'homeGoals' | 'awayGoals'
> & { apiFootballId: number };

type EventRow = typeof fixtureEvents.$inferSelect;

// A goal missing from this many consecutive polls (fixture present, goal absent) is treated as cancelled (ADR 0009).
const MISSING_POLLS_TO_REMOVE = 2;

export async function handlePoll(
  deps: { db: PollDb; now?: Date },
  live: PollResponse,
  tracked: readonly TrackedFixture[],
  // Writes of the caller that ride in the poll's batch, so they cost no request of their own.
  sameBatchWrites: Statement[] = [],
) {
  const fixtureByApiId = new Map(tracked.map((f) => [f.apiFootballId, f]));
  const known = live.response.flatMap((match) => {
    const fixture = fixtureByApiId.get(match.fixture.id);
    return fixture ? [{ match, fixture, events: match.events ?? [] }] : [];
  });

  // `live=` stops listing a match at full time. One that was seen live and is gone 100 minutes after kickoff is over.
  const listed = new Set(live.response.map((m) => m.fixture.id));
  const now = deps.now ?? new Date();
  const over = tracked.filter(
    (f) =>
      !listed.has(f.apiFootballId) &&
      f.firstPolledAt !== null &&
      IN_PLAY.includes(f.status) &&
      now.getTime() - f.kickoff.getTime() >= PRESUMED_OVER_MINUTES * 60_000,
  );
  const markOver = over.length ? [deps.db.update(fixtures).set({ status: FULL_TIME, fullTimeAlertDue: true, updatedAt: now }).where(inArray(fixtures.id, over.map((f) => f.id)))] : [];
  // Every fixture this poll covered is now seen, whether or not the provider listed it (#15).
  // The same statement records the minute each listed match is at, so the screen can show it.
  const minutes = known.flatMap(({ match, fixture }) => (typeof match.fixture.status?.elapsed === 'number' ? [{ id: fixture.id, minute: match.fixture.status.elapsed }] : []));
  const markSeen = tracked.length
    ? [
        deps.db
          .update(fixtures)
          .set({
            lastPolledAt: now,
            ...(minutes.length && { minute: sql`case ${fixtures.id} ${sql.join(minutes.map((m) => sql`when ${m.id} then ${m.minute}`), sql` `)} else ${fixtures.minute} end` }),
          })
          .where(inArray(fixtures.id, tracked.map((f) => f.id))),
      ]
    : [];
  if (known.length === 0) {
    await runBatch(deps.db, [...markSeen, ...markOver, ...sameBatchWrites]);
    return { alertsOwed: over.length > 0 };
  }

  // Every tracked fixture's events go in with one INSERT, however many matches are on: queries are what cost CPU.
  const values = known.flatMap(({ fixture, events }) =>
    // A goal, card or substitution after the first poll is news: the alert is owed from this insert on. Earlier ones are history.
    events.map((e) => eventRow(fixture.id, e, isAlertable(e) && fixture.firstPolledAt !== null)),
  );

  // One Neon request for all the reads and writes below. It is one transaction, so if the insert fails nothing is
  // marked: the retry is still a first poll and pushes nothing stale (ADR 0002).
  const statements: Statement[] = [];
  if (values.length) statements.push(deps.db.insert(fixtureEvents).values(values).onConflictDoNothing());
  // Every stored goal of the tracked fixtures, new ones included, removed ones too (they must not count in a score).
  const goalsAt =
    statements.push(
      deps.db
        .select()
        .from(fixtureEvents)
        .where(
          and(
            inArray(fixtureEvents.fixtureId, known.map(({ fixture }) => fixture.id)),
            eq(fixtureEvents.type, 'Goal'),
            inArray(fixtureEvents.detail, [...GOAL_DETAILS]),
          ),
        ),
    ) - 1;

  // The first poll of a fixture backfills the timeline (ADR 0002); goals already in it are history, not news.
  const firstPolled = known.filter(({ fixture }) => fixture.firstPolledAt === null).map(({ fixture }) => fixture.id);
  if (firstPolled.length) {
    statements.push(deps.db.update(fixtures).set({ firstPolledAt: new Date() }).where(inArray(fixtures.id, firstPolled)));
  }
  let statusAlerts = false;
  // Status and score follow the provider, so a match at halftime or full time drops out of the next run (ADR 0016).
  for (const { match, fixture } of known) {
    const status = match.fixture.status?.short ?? fixture.status;
    const homeGoals = match.goals?.home ?? fixture.homeGoals;
    const awayGoals = match.goals?.away ?? fixture.awayGoals;
    if (status === fixture.status && homeGoals === fixture.homeGoals && awayGoals === fixture.awayGoals) continue;
    // Kickoff and full time come from the change of status, never from the events, and are owed from this statement on.
    // A match first seen well into the half is not a kickoff; one that was never in play before is not a full time.
    const kickoff = fixture.status === NOT_STARTED && IN_PLAY.includes(status) && (match.fixture.status?.elapsed ?? 0) <= KICKOFF_ALERT_MAX_MINUTE;
    const fullTime = FINISHED.includes(status) && [...IN_PLAY, HALFTIME].includes(fixture.status);
    statusAlerts ||= kickoff || fullTime;
    statements.push(
      deps.db
        .update(fixtures)
        .set({ status, homeGoals, awayGoals, updatedAt: now, ...(kickoff && { kickoffAlertDue: true }), ...(fullTime && { fullTimeAlertDue: true }) })
        .where(eq(fixtures.id, fixture.id)),
    );
  }
  statements.push(...markSeen, ...markOver, ...sameBatchWrites);

  const results = await runBatch(deps.db, statements);
  const goalRows = results[goalsAt] as EventRow[];

  const recoveredIds: number[] = [];
  const stillMissingIds: number[] = [];
  const removeIds: number[] = [];

  for (const { fixture, events } of known) {
    const stored = goalRows.filter((r) => r.fixtureId === fixture.id);
    const inResponse = events.filter(isGoal);
    const cancellations = events.filter(isGoalCancellation);

    const removedNow: EventRow[] = [];
    for (const row of stored) {
      if (row.removedAt !== null) continue;
      const cancelledByVar = cancellations.some((v) => sameGoal(row, v));
      const stillListed = inResponse.some((e) => sameEvent(row, fixture.id, e));
      if (cancelledByVar) {
        removedNow.push(row);
      } else if (stillListed) {
        if (row.missingPolls > 0) recoveredIds.push(row.id);
      } else if (events.length === 0) {
        // An empty or absent events list is the API returning nothing, not every goal vanishing: count nothing.
        continue;
      } else if (row.missingPolls + 1 >= MISSING_POLLS_TO_REMOVE) {
        removedNow.push(row);
      } else {
        stillMissingIds.push(row.id);
      }
    }
    removeIds.push(...removedNow.map((r) => r.id));
  }

  // State changes are written only when something changed, so a quiet poll adds no request.
  const stateWrites: Statement[] = [];
  if (recoveredIds.length) {
    stateWrites.push(deps.db.update(fixtureEvents).set({ missingPolls: 0 }).where(inArray(fixtureEvents.id, recoveredIds)));
  }
  if (stillMissingIds.length) {
    stateWrites.push(
      deps.db
        .update(fixtureEvents)
        .set({ missingPolls: sql`${fixtureEvents.missingPolls} + 1` })
        .where(inArray(fixtureEvents.id, stillMissingIds)),
    );
  }
  if (removeIds.length) {
    // One statement decides the alert: a goal whose alert was issued is owed a correction; one whose alert was never
    // issued (still owed, or backfilled) has nothing to correct, and an owed alert is withdrawn.
    stateWrites.push(
      deps.db
        .update(fixtureEvents)
        .set({
          removedAt: new Date(),
          correctionDue: sql`${fixtureEvents.alertState} = 'issued'`,
          alertState: sql`case when ${fixtureEvents.alertState} = 'due' then 'none' else ${fixtureEvents.alertState} end`,
        })
        .where(inArray(fixtureEvents.id, removeIds)),
    );
  }
  await runBatch(deps.db, stateWrites);
  return { alertsOwed: statusAlerts || over.length > 0 || values.some((v) => v.alertState === 'due') || removeIds.length > 0 };
}

// `team` on an event is the side credited with the goal, own goals included (checked against the recorded response).
export const GOAL_DETAILS = new Set(['Normal Goal', 'Penalty', 'Own Goal']);

// A kickoff alert is only for a match seen within this many minutes of the start.
const KICKOFF_ALERT_MAX_MINUTE = 10;
const FINISHED = ['FT', 'AET', 'PEN'];

const isCard = (e: ApiEvent) => e.type === 'Card';
const isSubstitution = (e: ApiEvent) => e.type === 'subst';
// One API-Football event as the fixture_events row stored for it. `owed`: the alert for it is owed from this insert on.
export const eventRow = (fixtureId: number, e: ApiEvent, owed: boolean) => ({
  fixtureId,
  elapsed: e.time.elapsed,
  extra: e.time.extra,
  teamId: e.team.id,
  playerId: e.player.id,
  playerName: e.player.name,
  assistName: e.assist?.name ?? null,
  type: e.type,
  detail: e.detail,
  alertState: owed ? ('due' as const) : ('none' as const),
});

export const isAlertable = (e: ApiEvent) => isGoal(e) || isCard(e) || isSubstitution(e);

const isGoal = (e: ApiEvent) => e.type === 'Goal' && GOAL_DETAILS.has(e.detail);

// Recorded VAR wording (2024-25 Everton v Brighton): type "Var", detail "Goal cancelled". "Penalty cancelled" is a
// different event (a penalty, not a goal) and is not matched. "Goal Disallowed ..." is the other known form, unverified.
const isGoalCancellation = (e: ApiEvent) => e.type === 'Var' && /^goal\s+(cancell?ed|disallowed)/i.test(e.detail);

const sameEvent = (row: EventRow, fixtureId: number, e: ApiEvent) =>
  row.fixtureId === fixtureId &&
  row.elapsed === e.time.elapsed &&
  row.extra === e.time.extra &&
  row.teamId === e.team.id &&
  row.playerId === e.player.id &&
  row.type === e.type &&
  row.detail === e.detail;

// A VAR cancellation names the goal's team, player and minute but carries its own type and detail.
const sameGoal = (row: EventRow, v: ApiEvent) =>
  row.elapsed === v.time.elapsed && row.extra === v.time.extra && row.teamId === v.team.id && row.playerId === v.player.id;
