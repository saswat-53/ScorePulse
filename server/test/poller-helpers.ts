import recorded from '../fixtures/api-football/live-all-2026-10-29.json';
import varMatchJson from '../fixtures/api-football/var-everton-brighton-2024-25.json';
import { inArray } from 'drizzle-orm';
import { fixtures } from '../src/db/schema';
import { type GoalPush, handlePoll, type PollResponse, type PushSender } from '../src/poller/handle-poll';
import type { createTestDb } from './db';

export type LiveResponse = typeof recorded;
export type LiveFixture = LiveResponse['response'][number];

// Recorded matches from the 2026-10-29 `live=all` response (see docs/spikes/0002-*.md).
export const MATCH_WITH_3_GOALS = 1563668; // home 555 2-1 away 597: goals at 7' and 17' (home), 38' (away)
export const MATCH_WITH_OWN_GOAL = 1635511; // home 2110 1-3 away 12260: own goal at 22' credited to 12260
const byId = new Map(recorded.response.map((f) => [f.fixture.id, f]));

export function recordedMatch(apiFootballId: number): LiveFixture {
  const match = byId.get(apiFootballId);
  if (!match) throw new Error(`no recorded match ${apiFootballId}`);
  return structuredClone(match);
}

// A response holding one match, with only its first `eventCount` events (a poll earlier in the match).
export function pollOf(match: LiveFixture, eventCount = match.events.length) {
  return { response: [{ ...structuredClone(match), events: match.events.slice(0, eventCount) }] };
}

export function lastGoalIndex(match: LiveFixture) {
  let last = -1;
  match.events.forEach((e, i) => {
    if (e.type === 'Goal') last = i;
  });
  return last;
}

export function ownGoalIndex(match: LiveFixture) {
  return match.events.findIndex((e) => e.detail === 'Own Goal');
}

export async function insertFixture(
  db: Awaited<ReturnType<typeof createTestDb>>['db'],
  match: LiveFixture,
  overrides: Partial<typeof fixtures.$inferInsert> = {},
) {
  const [row] = await db
    .insert(fixtures)
    .values({
      apiFootballId: match.fixture.id,
      leagueId: match.league.id,
      homeTeamId: match.teams.home.id,
      awayTeamId: match.teams.away.id,
      kickoff: new Date(match.fixture.date),
      status: match.fixture.status.short,
      source: 'api-football',
      ...overrides,
    })
    .returning();
  return row;
}

export function fakePush() {
  const sent: GoalPush[] = [];
  return { sent, send: async (push: GoalPush) => void sent.push(push) };
}

// Real 2024-25 Everton 0-3 Brighton (fixture 1208024): the only VAR recording we have, used as a test file only.
// Real VAR events in it: "Penalty cancelled" (48') and "Goal cancelled" (90+3', Brighton, Yasin Ayari).
// The cancelled goal itself is absent from the final list, so tests rebuild it from the VAR event (synthetic).

export const VAR_MATCH = 1208024;
const varMatch = varMatchJson.response[0];
type VarEvent = NonNullable<PollResponse['response'][number]['events']>[number];
const recordedEvents = varMatch.events as VarEvent[];
export const GOAL_CANCELLED = recordedEvents.find((e) => e.detail === 'Goal cancelled') as VarEvent;
export const PENALTY_CANCELLED = recordedEvents.find((e) => e.detail === 'Penalty cancelled') as VarEvent;
// The goal that VAR later cancelled, as an earlier poll would have shown it.
export const AYARI_GOAL: VarEvent = { ...GOAL_CANCELLED, type: 'Goal', detail: 'Normal Goal' };
// Everything in the recording except the Goal cancelled event: the match as it stood before the goal.
export const VAR_BASE_EVENTS: VarEvent[] = recordedEvents.filter((e) => e !== GOAL_CANCELLED);

export const varPoll = (events: VarEvent[]): PollResponse => ({ response: [{ fixture: { id: VAR_MATCH }, events }] });

export async function insertVarFixture(db: Awaited<ReturnType<typeof createTestDb>>['db']) {
  const [row] = await db
    .insert(fixtures)
    .values({
      apiFootballId: VAR_MATCH,
      leagueId: varMatch.league.id,
      homeTeamId: varMatch.teams.home.id,
      awayTeamId: varMatch.teams.away.id,
      kickoff: new Date(varMatch.fixture.date),
      status: '2H',
      source: 'api-football',
    })
    .returning();
  return row;
}

// One poll as the Worker makes it: the tracked fixtures are read from the database, then handed to the handler.
// `trackedApiIds` narrows which matches of the response count as live-tracked (default: all of them).
export async function pollOnce(
  deps: { db: Awaited<ReturnType<typeof createTestDb>>['db']; push: PushSender },
  response: PollResponse,
  trackedApiIds: number[] = response.response.map((m) => m.fixture.id),
) {
  const rows = await deps.db.select().from(fixtures).where(inArray(fixtures.apiFootballId, trackedApiIds));
  await handlePoll(deps, response, rows.flatMap((r) => (r.apiFootballId === null ? [] : [{ ...r, apiFootballId: r.apiFootballId }])));
}
