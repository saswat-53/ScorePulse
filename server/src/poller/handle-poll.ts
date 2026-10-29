import { eq, inArray } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from '../db/schema';
import { fixtureEvents, fixtures } from '../db/schema';

// Works with the Neon HTTP driver in the Worker and PGlite in tests.
type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export type GoalPush = {
  fixtureId: number;
  eventKey: string;
  scorer: string | null;
  minute: string;
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

  for (const match of tracked) {
    const fixture = fixtureByApiId.get(match.fixture.id);
    if (!fixture) continue;

    const events = match.events ?? [];

    // The first poll of a fixture backfills the timeline (ADR 0002); goals already in it are history, not news.
    const isFirstPoll = fixture.firstPolledAt === null;
    if (events.length === 0) {
      if (isFirstPoll) await markPolled(deps.db, fixture.id);
      continue;
    }

    const inserted = await deps.db
      .insert(fixtureEvents)
      .values(
        events.map((e) => ({
          fixtureId: fixture.id,
          elapsed: e.time.elapsed,
          extra: e.time.extra,
          teamId: e.team.id,
          playerId: e.player.id,
          type: e.type,
          detail: e.detail,
        })),
      )
      .onConflictDoNothing()
      .returning();
    // Marked after the insert: if the insert fails, the retry is still a first poll and pushes nothing stale.
    if (isFirstPoll) await markPolled(deps.db, fixture.id);

    // Walk the events in order so each new goal carries the score as it stood right after it.
    const score = { home: 0, away: 0 };
    for (const e of events) {
      if (!COUNTS_AS_GOAL.has(e.detail) || e.type !== 'Goal') continue;
      if (e.team.id === fixture.homeTeamId) score.home++;
      else score.away++;

      const row = inserted.find((r) => sameEvent(r, fixture.id, e));
      if (!row || isFirstPoll) continue;
      await deps.push.send({
        fixtureId: fixture.id,
        eventKey: `fixture:${fixture.id}:event:${row.id}`,
        scorer: e.player.name,
        minute: formatMinute(e.time),
        homeGoals: score.home,
        awayGoals: score.away,
      });
    }
  }
}

const markPolled = (db: Db, fixtureId: number) =>
  db.update(fixtures).set({ firstPolledAt: new Date() }).where(eq(fixtures.id, fixtureId));

// `team` on an event is the side credited with the goal, own goals included (checked against the recorded response).
const COUNTS_AS_GOAL = new Set(['Normal Goal', 'Penalty', 'Own Goal']);

const sameEvent = (row: typeof fixtureEvents.$inferSelect, fixtureId: number, e: ApiEvent) =>
  row.fixtureId === fixtureId &&
  row.elapsed === e.time.elapsed &&
  row.extra === e.time.extra &&
  row.teamId === e.team.id &&
  row.playerId === e.player.id &&
  row.type === e.type &&
  row.detail === e.detail;

const formatMinute = (t: ApiEvent['time']) => `${t.elapsed}${t.extra ? `+${t.extra}` : ''}'`;
