import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createApp } from '../src/app';
import { favoriteTeams, fixtures, follows, pollState, teamMap, users } from '../src/db/schema';
import type { Bindings } from '../src/env';
import { handlePoll } from '../src/poller/handle-poll';
import { createTestDb } from './db';
import { insertFixture, MATCH_WITH_3_GOALS, pollOf, recordedMatch } from './poller-helpers';

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

const env = { CLERK_SECRET_KEY: 'sk_test' } as Bindings;
const T = new Date('2026-10-29T19:50:00Z'); // the moment the match was last polled
const at = (m: number) => new Date(T.getTime() + m * 60_000);

async function getMatch(id: number, now: Date) {
  const res = await createApp(() => testDb.db, () => now).request(`/matches/${id}`, { headers: { Authorization: 'Bearer token-user_a' } }, env);
  return ((await res.json()) as { match: { paused: boolean; updatedAt: string; tracking: string } }).match;
}
const spend = (used: number, now: Date) =>
  testDb.db.insert(pollState).values({ id: 'api-football', requestsToday: used, quotaDay: now.toISOString().slice(0, 10) });

// A match in play that user_a follows. It was last polled at T, a quiet poll: no score or status change.
async function followedMatchPolledAt() {
  const match = recordedMatch(MATCH_WITH_3_GOALS);
  await testDb.db.insert(teamMap).values([
    { footballDataId: 1, apiFootballId: match.teams.home.id, name: 'Home FC' },
    { footballDataId: 2, apiFootballId: match.teams.away.id, name: 'Away FC' },
  ]);
  const fixture = await insertFixture(testDb.db, match, {
    kickoff: new Date(T.getTime() - 50 * 60_000),
    status: match.fixture.status.short, // as the poll will report it: a quiet poll
    homeGoals: 2,
    awayGoals: 1,
    firstPolledAt: new Date(T.getTime() - 40 * 60_000),
    updatedAt: new Date(T.getTime() - 30 * 60_000), // the last time anything changed
  });
  await testDb.db.insert(follows).values({ userId: 'user_a', fixtureId: fixture.id });
  const row = (await testDb.db.select().from(fixtures))[0];
  await handlePoll({ db: testDb.db, now: T }, pollOf(match), [{ ...row, apiFootballId: row.apiFootballId! }]);
  return fixture;
}

test('the match API says when the match was last polled, not only when its score last changed', async () => {
  const fixture = await followedMatchPolledAt();

  const match = await getMatch(fixture.id, at(1));

  expect(match.updatedAt).toBe(T.toISOString());
});

test('at normal quota a followed match in play is not paused', async () => {
  const fixture = await followedMatchPolledAt();

  expect((await getMatch(fixture.id, at(1))).paused).toBe(false);
});

test('at low quota a match only followed is paused, and the API still gives the last time it was polled', async () => {
  const fixture = await followedMatchPolledAt();
  await spend(70, at(10));

  const match = await getMatch(fixture.id, at(10));

  expect(match.paused).toBe(true);
  expect(match.updatedAt).toBe(T.toISOString());
});

test('the paused state clears when the interval returns to normal', async () => {
  const fixture = await followedMatchPolledAt();
  await spend(70, at(10));
  expect((await getMatch(fixture.id, at(10))).paused).toBe(true);

  // Quota resets at midnight UTC: the next day starts at the normal interval.
  const nextDay = new Date('2026-10-30T00:05:00Z');
  expect((await getMatch(fixture.id, nextDay)).paused).toBe(false);
});

test('a match whose team is a favorite keeps polling at low quota, so it is not paused', async () => {
  const fixture = await followedMatchPolledAt();
  await testDb.db.insert(favoriteTeams).values({ userId: 'user_b', teamId: fixture.homeTeamId });
  await spend(70, at(10));

  expect((await getMatch(fixture.id, at(10))).paused).toBe(false);
});

test('a followed match that is not in play is never shown as paused', async () => {
  const fixture = await followedMatchPolledAt();
  await testDb.db.update(fixtures).set({ status: 'NS' });
  await spend(70, at(10));

  expect((await getMatch(fixture.id, at(10))).paused).toBe(false);
});

test('a poll marks every fixture it covered as seen, even one the provider no longer lists', async () => {
  const match = recordedMatch(MATCH_WITH_3_GOALS);
  const fixture = await insertFixture(testDb.db, match, { kickoff: new Date(T.getTime() - 50 * 60_000), status: '2H', updatedAt: new Date(T.getTime() - 30 * 60_000) });
  await testDb.db.insert(teamMap).values([
    { footballDataId: 1, apiFootballId: match.teams.home.id, name: 'Home FC' },
    { footballDataId: 2, apiFootballId: match.teams.away.id, name: 'Away FC' },
  ]);
  const row = (await testDb.db.select().from(fixtures))[0];

  await handlePoll({ db: testDb.db, now: T }, { response: [] }, [{ ...row, apiFootballId: row.apiFootballId! }]);

  expect((await getMatch(fixture.id, at(1))).updatedAt).toBe(T.toISOString());
});
