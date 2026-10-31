import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createApp } from '../src/app';
import { fixtureEvents, follows, teamMap, users } from '../src/db/schema';
import type { Bindings } from '../src/env';
import { createTestDb } from './db';
import {
  fakePush,
  insertFixture,
  MATCH_WITH_3_GOALS,
  MATCH_WITH_OWN_GOAL,
  pollOf,
  pollOnce,
  recordedMatch,
} from './poller-helpers';

vi.mock('@clerk/backend', () => ({
  verifyToken: async (token: string) => {
    if (!token.startsWith('token-')) throw new Error('invalid token');
    return { sub: token.slice('token-'.length) };
  },
}));

let testDb: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  testDb = await createTestDb();
  await testDb.db.insert(users).values([{ id: 'user_a' }, { id: 'user_b' }]);
});
afterEach(() => testDb.close());

type EventJson = {
  id: string;
  minute: number;
  extra: number | null;
  teamId: number;
  type: string;
  detail: string;
  player: string;
  related: string | null;
  scoreAfter: { home: number; away: number } | null;
  removed: boolean;
};
type MatchJson = {
  id: number;
  status: string;
  tracking: string;
  followed: boolean;
  score: { home: number | null; away: number | null };
  home: { name: string };
  events: EventJson[];
  lineups: unknown;
  stats: unknown;
};

const env = { CLERK_SECRET_KEY: 'sk_test', MIN_APP_VERSION: '1.0.0' } as Bindings;
async function get(path: string, user = 'user_a') {
  const res = await createApp(() => testDb.db).request(path, { headers: { Authorization: `Bearer token-${user}` } }, env);
  return { status: res.status, body: (await res.json()) as { match: MatchJson } };
}

// Teams of a recorded match, so the fixture's team_map joins resolve. Names are the test's own.
async function trackedMatch(apiFootballId: number, eventCount?: number) {
  const match = recordedMatch(apiFootballId);
  await testDb.db.insert(teamMap).values([
    { footballDataId: match.teams.home.id + 100_000, apiFootballId: match.teams.home.id, name: 'Home FC' },
    { footballDataId: match.teams.away.id + 100_000, apiFootballId: match.teams.away.id, name: 'Away FC' },
  ]);
  const fixture = await insertFixture(testDb.db, match, { status: '2H' });
  await testDb.db.insert(follows).values({ userId: 'user_b', fixtureId: fixture.id }); // someone follows it: live-tracked
  await pollOnce({ db: testDb.db, push: fakePush() }, pollOf(match, eventCount));
  return { fixture, match };
}

test('a live-tracked match returns its timeline in order, with goals carrying the score after them', async () => {
  const { fixture } = await trackedMatch(MATCH_WITH_3_GOALS);

  const { status, body } = await get(`/matches/${fixture.id}`);

  expect(status).toBe(200);
  const { match } = body;
  expect(match).toMatchObject({ tracking: 'live', home: { name: 'Home FC' }, lineups: null, stats: null });
  const minutes = match.events.map((e) => e.minute);
  expect(minutes).toEqual([4, 7, 8, 17, 32, 38]);
  // Recorded: home 555 scored at 7' and 17', away 597 at 38' (final 2-1).
  const goals = match.events.filter((e) => e.type === 'goal');
  expect(goals.map((g) => g.scoreAfter)).toEqual([
    { home: 1, away: 0 },
    { home: 2, away: 0 },
    { home: 2, away: 1 },
  ]);
  expect(goals[0]).toMatchObject({ detail: 'normal-goal', player: 'Danila Kozlov', related: 'Ivan Oblyakov', removed: false });
  expect(match.events[0]).toMatchObject({ type: 'card', detail: 'yellow-card', player: 'Aleksandr Kovalenko', scoreAfter: null });
  expect(new Set(match.events.map((e) => e.id)).size).toBe(match.events.length);
});

test('a goal removed after a VAR check is hidden and no longer counts in later scores', async () => {
  const { fixture } = await trackedMatch(MATCH_WITH_3_GOALS);
  await testDb.db
    .update(fixtureEvents)
    .set({ removedAt: new Date() })
    .where(eq(fixtureEvents.elapsed, 17)); // the second home goal

  const { body } = await get(`/matches/${fixture.id}`);

  const goals = body.match.events.filter((e) => e.type === 'goal');
  expect(goals.map((g) => g.minute)).toEqual([7, 38]);
  expect(goals.map((g) => g.scoreAfter)).toEqual([
    { home: 1, away: 0 },
    { home: 1, away: 1 },
  ]);
});

test('VAR rows stay hidden until VAR events are confirmed', async () => {
  const { fixture, match } = await trackedMatch(MATCH_WITH_3_GOALS);
  await testDb.db.insert(fixtureEvents).values({
    fixtureId: fixture.id,
    elapsed: 20,
    teamId: match.teams.home.id,
    type: 'Var',
    detail: 'Goal cancelled',
  });

  const { body } = await get(`/matches/${fixture.id}`);

  expect(body.match.events.map((e) => e.type)).not.toContain('var');
  expect(body.match.events).toHaveLength(6);
});

test('an own goal counts for the side the API credits, and substitutions name who went off and who came on', async () => {
  const { fixture } = await trackedMatch(MATCH_WITH_OWN_GOAL);

  const { body } = await get(`/matches/${fixture.id}`);

  const { events } = body.match;
  const goals = events.filter((e) => e.type === 'goal');
  expect(goals.find((g) => g.detail === 'own-goal')).toBeDefined();
  // Recorded final score: home 1, away 3.
  const scored = goals.filter((g) => g.scoreAfter !== null); // a missed penalty is a goal row with no score
  expect(scored[scored.length - 1].scoreAfter).toEqual({ home: 1, away: 3 });
  expect(events.find((e) => e.minute === 32 && e.type === 'substitution')).toMatchObject({
    player: 'S. Moutoussamy',
    related: 'T. Tsingaras',
  });
});

test('a match nobody follows or favorites returns its saved info, the not-live-tracked flag and a locked timeline', async () => {
  const match = recordedMatch(MATCH_WITH_3_GOALS);
  await testDb.db.insert(teamMap).values([
    { footballDataId: 1, apiFootballId: match.teams.home.id, name: 'Home FC' },
    { footballDataId: 2, apiFootballId: match.teams.away.id, name: 'Away FC' },
  ]);
  const fixture = await insertFixture(testDb.db, match, { status: 'NS', homeGoals: null, awayGoals: null });

  const { status, body } = await get(`/matches/${fixture.id}`);

  expect(status).toBe(200);
  expect(body.match).toMatchObject({
    tracking: 'snapshot',
    status: 'scheduled',
    score: { home: null, away: null },
    followed: false,
    events: [],
    lineups: null,
    stats: null,
  });
});

test('followed says whether the signed-in user follows the match, not whether anyone does', async () => {
  const { fixture } = await trackedMatch(MATCH_WITH_3_GOALS); // user_b follows it

  expect((await get(`/matches/${fixture.id}`, 'user_a')).body.match.followed).toBe(false);
  expect((await get(`/matches/${fixture.id}`, 'user_b')).body.match.followed).toBe(true);
});

test('an unknown match is a 404 and a bad id is a 400', async () => {
  expect((await get('/matches/999999')).status).toBe(404);
  expect((await get('/matches/abc')).status).toBe(400);
});

test('the match detail needs a signed-in user', async () => {
  const res = await createApp(() => testDb.db).request('/matches/1', {}, env);

  expect(res.status).toBe(401);
});

