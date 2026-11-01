import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import standingsJson from '../fixtures/football-data/standings-PL.json';
import { createApp } from '../src/app';
import { standings, teamMap } from '../src/db/schema';
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

// Browse by world, country and league (#26): the clubs come from the stored league tables and team_map.
let testDb: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  testDb = await createTestDb();
  await seedTeamMap(testDb.db);
  await syncStandings({ db: testDb.db }, standingsJson as FdStandingsResponse);
});
afterEach(() => testDb.close());

const env = { CLERK_SECRET_KEY: 'sk_test' } as Bindings;
const get = (path: string, authenticated = true) =>
  createApp(() => testDb.db).request(path, { headers: authenticated ? { Authorization: 'Bearer token-user_a' } : {} }, env);
type Club = { id: number; name: string; shortName: string; code: string; crestUrl: string | null };
const clubs = async (path: string) => ((await (await get(path)).json()) as { league: { id: string; name: string }; teams: Club[] }).teams;

test('the tree has the world competitions, then the countries with their leagues, in name order', async () => {
  const res = await get('/browse');

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({
    world: [{ id: 'CL', name: 'Champions League' }],
    countries: [
      { name: 'England', leagues: [{ id: 'PL', name: 'Premier League' }] },
      { name: 'France', leagues: [{ id: 'FL1', name: 'Ligue 1' }] },
      { name: 'Germany', leagues: [{ id: 'BL1', name: 'Bundesliga' }] },
      { name: 'Spain', leagues: [{ id: 'PD', name: 'La Liga' }] },
    ],
  });
});

test('a league\'s clubs come from its stored table, with what the picker shows, in name order', async () => {
  const list = await clubs('/leagues/PL/teams');

  expect(list).toHaveLength(20);
  expect(list.map((c) => c.name)).toEqual([...list.map((c) => c.name)].sort((a, b) => a.localeCompare(b)));
  expect(list.find((c) => c.name === 'Arsenal FC')).toEqual({
    id: 42, name: 'Arsenal FC', shortName: 'Arsenal', code: 'ARS', crestUrl: 'https://crests.football-data.org/57.png',
  });
});

test('a club that plays in two competitions is listed under both', async () => {
  // The Champions League table, with four of the Premier League clubs in it.
  const cl = { ...standingsJson, competition: { ...standingsJson.competition, code: 'CL' }, standings: [{ ...standingsJson.standings[0], table: standingsJson.standings[0].table.slice(0, 4) }] };
  await syncStandings({ db: testDb.db }, cl as FdStandingsResponse);

  const inCl = await clubs('/leagues/CL/teams');
  const inPl = await clubs('/leagues/PL/teams');

  expect(inCl).toHaveLength(4);
  for (const club of inCl) expect(inPl.map((c) => c.id)).toContain(club.id);
});

test('a club the server cannot map to an API-Football id is left out, because it cannot be picked', async () => {
  const [first] = standingsJson.standings[0].table;
  await testDb.db.delete(teamMap).where(eq(teamMap.footballDataId, first.team.id));

  const list = await clubs('/leagues/PL/teams');

  expect(list).toHaveLength(19);
});

test('only the newest season counts: a club from last season\'s table is not listed', async () => {
  const [fdTeam] = (await testDb.db.select().from(teamMap)).filter((t) => !standingsJson.standings[0].table.some((r) => r.team.id === t.footballDataId));
  await testDb.db.insert(standings).values({
    competition: 'PL', season: 2025, teamId: fdTeam.footballDataId, teamName: fdTeam.name, position: 1,
    played: 38, won: 30, drawn: 4, lost: 4, goalsFor: 90, goalsAgainst: 30, points: 94, source: 'football-data',
  });

  const list = await clubs('/leagues/PL/teams');

  expect(list.map((c) => c.id)).not.toContain(fdTeam.apiFootballId);
});

test('before the daily update has run, a league is an empty list, not an error', async () => {
  const res = await get('/leagues/BL1/teams');

  expect(res.status).toBe(200);
  expect(((await res.json()) as { teams: Club[] }).teams).toEqual([]);
});

test('an unknown league is a 400, and both reads need a signed-in user', async () => {
  expect((await get('/leagues/XX/teams')).status).toBe(400);
  expect((await get('/browse', false)).status).toBe(401);
  expect((await get('/leagues/PL/teams', false)).status).toBe(401);
});
