import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createApp } from '../src/app';
import { fixtures, teamMap } from '../src/db/schema';
import type { Bindings } from '../src/env';
import { createTestDb } from './db';

vi.mock('@clerk/backend', () => ({
  verifyToken: async (token: string) => {
    if (!token.startsWith('token-')) throw new Error('invalid token');
    return { sub: token.slice('token-'.length) };
  },
}));

let testDb: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  testDb = await createTestDb();
});
afterEach(() => testDb.close());

const env = { CLERK_SECRET_KEY: 'sk_test' } as Bindings;
const get = (path: string, token = 'token-user_a') =>
  createApp(() => testDb.db).request(path, token ? { headers: { Authorization: `Bearer ${token}` } } : {}, env);
type Item = { id: number; leagueId: string; kickoffUtc: string; status: string; score: { home: number | null; away: number | null }; home: { id: number }; away: { id: number } };
const body = async (path: string) => (await (await get(path)).json()) as { team: { id: number; name: string }; fixtures: Item[] };

const UNITED = 33;
const CITY = 50;
const ARSENAL = 42;
const CHELSEA = 49;
const day = (n: number) => new Date(Date.UTC(2026, 9, n, 15, 0));

beforeEach(async () => {
  await testDb.db.insert(teamMap).values(
    [UNITED, CITY, ARSENAL, CHELSEA].map((id, i) => ({ footballDataId: 100 + i, apiFootballId: id, name: `Team ${id}`, shortName: `T${id}` })),
  );
  const row = (n: number, leagueId: number, home: number, away: number, status = 'FT') => ({
    leagueId, homeTeamId: home, awayTeamId: away, kickoff: day(n), status, homeGoals: 1, awayGoals: 0, source: 'football-data',
  });
  await testDb.db.insert(fixtures).values([
    row(3, 39, UNITED, CITY), // United at home
    row(10, 39, ARSENAL, UNITED), // United away
    row(17, 2, UNITED, CHELSEA), // United in the Champions League
    row(12, 39, ARSENAL, CHELSEA), // not United
    row(24, 39, CITY, UNITED, 'NS'), // to come
  ]);
});

test('a team\'s fixtures come back in date order, home and away, with score, status and competition, and no one else\'s', async () => {
  const { team, fixtures: list } = await body(`/teams/${UNITED}/fixtures`);

  expect(team).toMatchObject({ id: UNITED, name: `Team ${UNITED}` });
  expect(list.map((f) => f.kickoffUtc)).toEqual([day(3), day(10), day(17), day(24)].map((d) => d.toISOString()));
  expect(list.every((f) => f.home.id === UNITED || f.away.id === UNITED)).toBe(true);
  expect(list[0]).toMatchObject({ leagueId: 'PL', status: 'finished', score: { home: 1, away: 0 } });
  expect(list[2].leagueId).toBe('CL');
  expect(list[3].status).toBe('scheduled');
});

test('one competition can be asked for', async () => {
  const { fixtures: list } = await body(`/teams/${UNITED}/fixtures?league=CL`);

  expect(list.map((f) => f.leagueId)).toEqual(['CL']);
});

test('a team with no fixtures stored is an empty list, and a team that is not in team_map is a 404', async () => {
  await testDb.db.insert(teamMap).values({ footballDataId: 999, apiFootballId: 7, name: 'Quiet FC' });

  expect((await body('/teams/7/fixtures')).fixtures).toEqual([]);
  expect((await get('/teams/123456/fixtures')).status).toBe(404);
});

test('a bad team id or competition is a 400, and the page needs a signed-in user', async () => {
  expect((await get('/teams/abc/fixtures')).status).toBe(400);
  expect((await get(`/teams/${UNITED}/fixtures?league=XX`)).status).toBe(400);
  expect((await get(`/teams/${UNITED}/fixtures`, '')).status).toBe(401);
});
