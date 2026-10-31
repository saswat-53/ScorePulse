import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import standingsJson from '../fixtures/football-data/standings-PL.json';
import { createApp } from '../src/app';
import { teamMap } from '../src/db/schema';
import type { Bindings } from '../src/env';
import { syncStandings, type FdStandingsResponse } from '../src/sync/snapshot';
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
  await syncStandings({ db: testDb.db }, standingsJson as FdStandingsResponse);
});
afterEach(() => testDb.close());

type RowJson = {
  position: number;
  team: { id: number; name: string; code: string };
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  zone: string | null;
};
type StandingsJson = { leagueId: string; season: string; rows: RowJson[]; updatedAt: string | null; source: string };

const env = { CLERK_SECRET_KEY: 'sk_test', MIN_APP_VERSION: '1.0.0' } as Bindings;
async function get(path: string, authenticated = true) {
  const res = await createApp(() => testDb.db).request(
    path,
    { headers: authenticated ? { Authorization: 'Bearer token-user_a' } : {} },
    env,
  );
  return { status: res.status, body: (await res.json()) as { standings: StandingsJson } };
}

test('the stored table comes back in order with each team and the season', async () => {
  const { status, body } = await get('/standings/PL');

  expect(status).toBe(200);
  const { standings } = body;
  expect(standings).toMatchObject({ leagueId: 'PL', season: '2026/27', source: 'football-data' });
  expect(standings.rows).toHaveLength(20);
  expect(standings.rows.map((r) => r.position)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  expect(standings.rows[0]).toMatchObject({
    position: 1,
    // API-Football id of Manchester City (50), so the app can match it to a favorite.
    team: { id: 50, name: 'Manchester City FC', code: 'MCI' },
    played: 8,
    won: 7,
    drawn: 0,
    lost: 1,
    goalsFor: 20,
    goalsAgainst: 9,
    goalDifference: 11,
    points: 21,
  });
  expect(typeof standings.updatedAt).toBe('string');
});

test('the top four of a league are marked as the Champions League zone, the rest are not', async () => {
  const { rows } = (await get('/standings/PL')).body.standings;

  expect(rows.map((r) => r.zone)).toEqual(rows.map((r) => (r.position <= 4 ? 'champions-league' : null)));
});

test('a team that is not in team_map still shows, with an id that cannot collide with a real team', async () => {
  await testDb.db.delete(teamMap).where(eq(teamMap.footballDataId, 65)); // Manchester City at football-data.org

  const { rows } = (await get('/standings/PL')).body.standings;

  expect(rows[0].team).toMatchObject({ id: -65, name: 'Manchester City FC' });
});

test('a league whose table has not been synced yet is an empty table, not an error', async () => {
  const { status, body } = await get('/standings/PD');

  expect(status).toBe(200);
  expect(body.standings).toMatchObject({ leagueId: 'PD', rows: [], updatedAt: null });
});

test('an unknown league is a 400', async () => {
  expect((await get('/standings/EPL')).status).toBe(400);
});

test('standings need a signed-in user', async () => {
  expect((await get('/standings/PL', false)).status).toBe(401);
});
