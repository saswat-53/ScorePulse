import { and, eq, inArray, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from '../db/schema';
import { fixtureEvents, fixtures } from '../db/schema';

// Works with the Neon HTTP driver in the Worker and PGlite in tests.
type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export type GoalPush = {
  kind: 'goal' | 'goal_removed';
  fixtureId: number;
  // `fixture:{id}:event:{eventId}` for a goal, with `:removed` appended for its correction (ADR 0009).
  eventKey: string;
  // Null on a correction: the stored row does not keep the scorer's name.
  scorer: string | null;
  minute: string;
  // The score after this push: with the new goal counted, or with the cancelled goal taken out.
  homeGoals: number;
  awayGoals: number;
};
export type PushSender = { send(push: GoalPush): Promise<void> };

// The parts of an API-Football `fixtures?live=` response the poller reads.
type ApiEvent = {
  time: { elapsed: number; extra: number | null };
  team: { id: number };
  player: { id: number | null; name: string | null };
  type: string;
  detail: string;
};
export type PollResponse = { response: { fixture: { id: number }; events?: ApiEvent[] }[] };

type EventRow = typeof fixtureEvents.$inferSelect;

// A goal missing from this many consecutive polls (fixture present, goal absent) is treated as cancelled (ADR 0009).
const MISSING_POLLS_TO_REMOVE = 2;

export async function handlePoll(
  deps: { db: Db; push: PushSender },
  live: PollResponse,
  liveTrackedIds: ReadonlySet<number>,
) {
  const tracked = live.response.filter((m) => liveTrackedIds.has(m.fixture.id));
  if (tracked.length === 0) return;
  // One query for every tracked fixture, not one per match: each query is a subrequest and CPU.
  const rows = await deps.db
    .select()
    .from(fixtures)
    .where(inArray(fixtures.apiFootballId, tracked.map((m) => m.fixture.id)));
  const fixtureByApiId = new Map(rows.map((f) => [f.apiFootballId, f]));

  const known = tracked.flatMap((match) => {
    const fixture = fixtureByApiId.get(match.fixture.id);
    return fixture ? [{ match, fixture, events: match.events ?? [] }] : [];
  });

  // Every tracked fixture's events go in with one INSERT, however many matches are on: queries are what cost CPU.
  const values = known.flatMap(({ fixture, events }) =>
    events.map((e) => ({
      fixtureId: fixture.id,
      elapsed: e.time.elapsed,
      extra: e.time.extra,
      teamId: e.team.id,
      playerId: e.player.id,
      type: e.type,
      detail: e.detail,
    })),
  );
  const inserted = values.length
    ? await deps.db.insert(fixtureEvents).values(values).onConflictDoNothing().returning()
    : [];

  // The first poll of a fixture backfills the timeline (ADR 0002); goals already in it are history, not news.
  // Marked after the insert: if the insert fails, the retry is still a first poll and pushes nothing stale.
  const firstPolled = known.filter(({ fixture }) => fixture.firstPolledAt === null).map(({ fixture }) => fixture.id);
  if (firstPolled.length) {
    await deps.db.update(fixtures).set({ firstPolledAt: new Date() }).where(inArray(fixtures.id, firstPolled));
  }

  // Every stored goal of the tracked fixtures, new ones included, removed ones too (they must not count in a score).
  const goalRows = known.length
    ? await deps.db
        .select()
        .from(fixtureEvents)
        .where(
          and(
            inArray(fixtureEvents.fixtureId, known.map(({ fixture }) => fixture.id)),
            eq(fixtureEvents.type, 'Goal'),
            inArray(fixtureEvents.detail, [...GOAL_DETAILS]),
          ),
        )
    : [];

  const recoveredIds: number[] = [];
  const stillMissingIds: number[] = [];
  const removeIds: number[] = [];
  const insertedIds = new Set(inserted.map((r) => r.id));

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
    const removedIds = new Set(removedNow.map((r) => r.id));
    const isRemoved = (r: EventRow) => r.removedAt !== null || removedIds.has(r.id);

    if (fixture.firstPolledAt === null) continue; // backfill: store and update state, send nothing

    // Walk the events in order so each new goal carries the score as it stood right after it.
    const score = { home: 0, away: 0 };
    for (const e of inResponse) {
      const row = stored.find((r) => sameEvent(r, fixture.id, e));
      if (row && isRemoved(row)) continue;
      credit(score, fixture.homeTeamId, e.team.id);

      // A goal that arrived and was cancelled in the same poll was never announced: nothing to send or correct.
      if (!row || !insertedIds.has(row.id) || removedIds.has(row.id)) continue;
      await deps.push.send({
        kind: 'goal',
        fixtureId: fixture.id,
        eventKey: `fixture:${fixture.id}:event:${row.id}`,
        scorer: e.player.name,
        minute: formatMinute(e.time),
        homeGoals: score.home,
        awayGoals: score.away,
      });
    }

    // One correction per removed goal, with the score from the goals still standing.
    const standing = { home: 0, away: 0 };
    for (const r of stored) if (!isRemoved(r)) credit(standing, fixture.homeTeamId, r.teamId);
    for (const row of removedNow) {
      if (insertedIds.has(row.id)) continue;
      await deps.push.send({
        kind: 'goal_removed',
        fixtureId: fixture.id,
        eventKey: `fixture:${fixture.id}:event:${row.id}:removed`,
        scorer: null,
        minute: formatMinute({ elapsed: row.elapsed, extra: row.extra }),
        homeGoals: standing.home,
        awayGoals: standing.away,
      });
    }
  }

  // State changes are written only when something changed, so a quiet poll adds no writes.
  if (recoveredIds.length) {
    await deps.db.update(fixtureEvents).set({ missingPolls: 0 }).where(inArray(fixtureEvents.id, recoveredIds));
  }
  if (stillMissingIds.length) {
    await deps.db
      .update(fixtureEvents)
      .set({ missingPolls: sql`${fixtureEvents.missingPolls} + 1` })
      .where(inArray(fixtureEvents.id, stillMissingIds));
  }
  if (removeIds.length) {
    await deps.db.update(fixtureEvents).set({ removedAt: new Date() }).where(inArray(fixtureEvents.id, removeIds));
  }
}

// `team` on an event is the side credited with the goal, own goals included (checked against the recorded response).
const GOAL_DETAILS = new Set(['Normal Goal', 'Penalty', 'Own Goal']);

const isGoal = (e: ApiEvent) => e.type === 'Goal' && GOAL_DETAILS.has(e.detail);

// Recorded VAR wording (2024-25 Everton v Brighton): type "Var", detail "Goal cancelled". "Penalty cancelled" is a
// different event (a penalty, not a goal) and is not matched. "Goal Disallowed ..." is the other known form, unverified.
const isGoalCancellation = (e: ApiEvent) => e.type === 'Var' && /^goal\s+(cancell?ed|disallowed)/i.test(e.detail);

const credit = (score: { home: number; away: number }, homeTeamId: number, scoringTeamId: number) => {
  if (scoringTeamId === homeTeamId) score.home++;
  else score.away++;
};

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

const formatMinute = (t: { elapsed: number; extra: number | null }) => `${t.elapsed}${t.extra ? `+${t.extra}` : ''}'`;
