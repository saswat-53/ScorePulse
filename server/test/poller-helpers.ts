import recorded from '../fixtures/api-football/live-all-2026-10-29.json';
import { fixtures } from '../src/db/schema';
import type { GoalPush } from '../src/poller/handle-poll';
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

export async function insertFixture(db: Awaited<ReturnType<typeof createTestDb>>['db'], match: LiveFixture) {
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
    })
    .returning();
  return row;
}

export function fakePush() {
  const sent: GoalPush[] = [];
  return { sent, send: async (push: GoalPush) => void sent.push(push) };
}
