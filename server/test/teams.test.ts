import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createApp } from '../src/app';
import type { Bindings } from '../src/env';
import { createTestDb } from './db';
import { seedTeamMap } from './football-data-helpers';

vi.mock('@clerk/backend', () => ({
  verifyToken: async (token: string) => {
    if (!token.startsWith('token-')) throw new Error('invalid token');
    return { sub: token.slice('token-'.length) };
  },
}));

let testDb: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  testDb = await createTestDb();
  await seedTeamMap(testDb.db);
});
afterEach(() => testDb.close());

type TeamRow = { id: number; name: string; shortName: string; code: string; crestUrl: string | null };
const env = { CLERK_SECRET_KEY: 'sk_test', MIN_APP_VERSION: '1.0.0' } as Bindings;
const teams = async (query = '') => {
  const res = await createApp(() => testDb.db).request(`/teams${query}`, { headers: { Authorization: 'Bearer token-user_a' } }, env);
  return { status: res.status, body: (await res.json()) as { teams: TeamRow[] } };
};

test('a search finds a club by part of its name, in any case, with what the picker shows', async () => {
  const { body } = await teams('?q=arsen');

  expect(body.teams).toEqual([
    { id: 42, name: 'Arsenal FC', shortName: 'Arsenal', code: 'ARS', crestUrl: 'https://crests.football-data.org/57.png' },
  ]);
});

test('a search also finds a club by its short name or its three-letter code', async () => {
  expect((await teams('?q=man%20city')).body.teams.map((t) => t.name)).toContain('Manchester City FC');
  expect((await teams('?q=MCI')).body.teams.map((t) => t.name)).toEqual(['Manchester City FC']);
});

test('without a search the first page of clubs comes back in name order', async () => {
  const { body } = await teams();

  expect(body.teams.length).toBeGreaterThan(5);
  expect(body.teams.map((t) => t.name)).toEqual([...body.teams.map((t) => t.name)].sort());
});

test('a search with no match returns an empty list, not an error', async () => {
  const { status, body } = await teams('?q=zzzzzz');

  expect(status).toBe(200);
  expect(body.teams).toEqual([]);
});

test('the team list needs a signed-in user', async () => {
  const res = await createApp(() => testDb.db).request('/teams', {}, env);

  expect(res.status).toBe(401);
});
