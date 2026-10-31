import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createApp } from '../src/app';
import { favoriteTeams, users } from '../src/db/schema';
import type { Bindings } from '../src/env';
import { createTestDb } from './db';
import { seedTeamMap } from './football-data-helpers';

vi.mock('@clerk/backend', () => ({
  verifyToken: async (token: string) => {
    if (!token.startsWith('token-')) throw new Error('invalid token');
    return { sub: token.slice('token-'.length) };
  },
}));

// API-Football team ids from the recorded 2024 team list.
const ARSENAL = 42;
const MAN_UNITED = 33;
const BRIGHTON = 51;
const LEEDS = 63;

let testDb: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  testDb = await createTestDb();
  await seedTeamMap(testDb.db);
});
afterEach(() => testDb.close());

const env = { CLERK_SECRET_KEY: 'sk_test', MIN_APP_VERSION: '1.0.0' } as Bindings;
const call = (method: string, path: string, user?: string) =>
  createApp(() => testDb.db).request(
    path,
    { method, headers: user ? { Authorization: `Bearer token-${user}` } : {} },
    env,
  );
const add = (user: string, teamId: number) => call('PUT', `/favorites/${teamId}`, user);
const favoriteIds = async (user: string) =>
  ((await (await call('GET', '/favorites', user)).json()) as { favorites: { id: number }[] }).favorites.map((f) => f.id).sort((a, b) => a - b);

test('a favorite can be added and is listed with what the app shows for a team', async () => {
  const res = await add('user_a', ARSENAL);

  expect(res.status).toBe(200);
  const body = (await (await call('GET', '/favorites', 'user_a')).json()) as { favorites: unknown[] };
  expect(body.favorites).toEqual([
    { id: ARSENAL, name: 'Arsenal FC', shortName: 'Arsenal', code: 'ARS', crestUrl: 'https://crests.football-data.org/57.png' },
  ]);
});

test('a 4th favorite is rejected with a clear error and the first 3 stay', async () => {
  for (const team of [ARSENAL, MAN_UNITED, BRIGHTON]) expect((await add('user_a', team)).status).toBe(200);

  const res = await add('user_a', LEEDS);

  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({ error: 'favorites_full', max: 3 });
  expect(await favoriteIds('user_a')).toEqual([MAN_UNITED, BRIGHTON, ARSENAL].sort((a, b) => a - b));
});

test('removing a favorite frees a slot, so changes within 3 are accepted', async () => {
  for (const team of [ARSENAL, MAN_UNITED, BRIGHTON]) await add('user_a', team);

  expect((await call('DELETE', `/favorites/${BRIGHTON}`, 'user_a')).status).toBe(204);
  expect((await add('user_a', LEEDS)).status).toBe(200);

  expect(await favoriteIds('user_a')).toEqual([ARSENAL, MAN_UNITED, LEEDS].sort((a, b) => a - b));
});

test('adding the same team twice is accepted and counts once', async () => {
  await add('user_a', ARSENAL);
  await add('user_a', ARSENAL);
  await add('user_a', MAN_UNITED);

  expect(await favoriteIds('user_a')).toEqual([ARSENAL, MAN_UNITED].sort((a, b) => a - b));
  expect((await add('user_a', BRIGHTON)).status).toBe(200); // the repeat did not use a slot
});

test('the cap is per user: two users can share teams, and one full list does not block the other', async () => {
  for (const team of [ARSENAL, MAN_UNITED, BRIGHTON]) await add('user_a', team);

  expect((await add('user_b', ARSENAL)).status).toBe(200);
  expect(await favoriteIds('user_b')).toEqual([ARSENAL]);
  expect(await favoriteIds('user_a')).toHaveLength(3);
});

test('adds that arrive together cannot get past the cap', async () => {
  const results = await Promise.all([ARSENAL, MAN_UNITED, BRIGHTON, LEEDS].map((team) => add('user_a', team)));

  expect(results.filter((r) => r.status === 200)).toHaveLength(3);
  expect(results.filter((r) => r.status === 409)).toHaveLength(1);
  expect(await favoriteIds('user_a')).toHaveLength(3);
});

test('a team that is not in team_map is rejected', async () => {
  expect((await add('user_a', 999999)).status).toBe(404);
  expect(await favoriteIds('user_a')).toEqual([]);
});

test('a team id that is not a number is rejected', async () => {
  expect((await call('PUT', '/favorites/arsenal', 'user_a')).status).toBe(400);
});

test('the favorites routes need a signed-in user', async () => {
  expect((await call('GET', '/favorites')).status).toBe(401);
  expect((await call('PUT', `/favorites/${ARSENAL}`)).status).toBe(401);
  expect((await call('DELETE', `/favorites/${ARSENAL}`)).status).toBe(401);
});

test('the database itself refuses a 4th favorite, so even adds that skip the API check cannot pass the cap', async () => {
  const { db } = testDb;
  await db.insert(users).values({ id: 'user_a' });
  const insert = (teamId: number) => db.insert(favoriteTeams).values({ userId: 'user_a', teamId });
  for (const team of [ARSENAL, MAN_UNITED, BRIGHTON]) await insert(team);

  const error = (await insert(LEEDS).then(() => null, (e: unknown) => e)) as { message: string; cause?: { message: string } } | null;

  expect(`${error?.message} ${error?.cause?.message}`).toMatch(/favorites_full/);

  expect(await favoriteIds('user_a')).toHaveLength(3);
});
