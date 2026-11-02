import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import finishedJson from '../fixtures/football-data/matches-PL-finished.json';
import next14Json from '../fixtures/football-data/matches-PL-next14.json';
import { createApp } from '../src/app';
import type { Bindings } from '../src/env';
import { syncFixtures, type FdMatchesResponse } from '../src/sync/snapshot';
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
  await syncFixtures({ db: testDb.db }, finishedJson as FdMatchesResponse);
  await syncFixtures({ db: testDb.db }, next14Json as FdMatchesResponse);
});
afterEach(() => testDb.close());

type TeamJson = { id: number; name: string; code: string };
type FixtureJson = {
  id: number;
  leagueId: string;
  kickoffUtc: string;
  status: string;
  home: TeamJson;
  away: TeamJson;
  score: { home: number | null; away: number | null };
  tracking: string;
  paused: boolean;
  source: string;
};

const env = { CLERK_SECRET_KEY: 'sk_test' } as Bindings;
async function get(path: string, authenticated = true) {
  const res = await createApp(() => testDb.db).request(
    path,
    { headers: authenticated ? { Authorization: 'Bearer token-user_a' } : {} },
    env,
  );
  return { status: res.status, body: (await res.json()) as { fixtures: FixtureJson[] } };
}

const finished = finishedJson as FdMatchesResponse;
const next14 = next14Json as FdMatchesResponse;
const palaceNewcastle = finished.matches[0]; // Crystal Palace 0-2 Newcastle, finished
const dayOf = (iso: string) => ({ from: `${iso.slice(0, 10)}T00:00:00.000Z`, to: `${iso.slice(0, 10)}T23:59:59.999Z` });

test('a result comes back with real team names, the final score and a finished status', async () => {
  const { from, to } = dayOf(palaceNewcastle.utcDate);

  const { status, body } = await get(`/fixtures?from=${from}&to=${to}&league=PL`);

  expect(status).toBe(200);
  const result = body.fixtures.find((f) => f.kickoffUtc === new Date(palaceNewcastle.utcDate).toISOString());
  expect(result).toMatchObject({
    leagueId: 'PL',
    status: 'finished',
    score: { home: 0, away: 2 },
    source: 'football-data',
    // API-Football ids: 52 Crystal Palace, 34 Newcastle United.
    home: { id: 52, name: 'Crystal Palace FC', code: 'CRY' },
    away: { id: 34, name: 'Newcastle United FC' },
  });
});

test('an upcoming match has no score yet and is scheduled', async () => {
  const upcoming = next14.matches.find((m) => m.status === 'TIMED' || m.status === 'SCHEDULED');
  if (!upcoming) throw new Error('the recording has no upcoming match');
  const { from, to } = dayOf(upcoming.utcDate);

  const { body } = await get(`/fixtures?from=${from}&to=${to}`);

  const found = body.fixtures.find((f) => f.kickoffUtc === new Date(upcoming.utcDate).toISOString());
  expect(found).toMatchObject({ status: 'scheduled', score: { home: null, away: null } });
});

test('only fixtures inside the window come back, soonest first', async () => {
  const kickoffs = next14.matches.map((m) => m.utcDate).sort();
  const from = kickoffs[3];
  const to = kickoffs[7]; // exclusive

  const { body } = await get(`/fixtures?from=${from}&to=${to}`);

  const times = body.fixtures.map((f) => f.kickoffUtc);
  expect(times.length).toBeGreaterThan(0);
  expect(times).toEqual([...times].sort());
  expect(times.every((t) => Date.parse(t) >= Date.parse(from) && Date.parse(t) < Date.parse(to))).toBe(true);
  expect(times.map((t) => Date.parse(t))).not.toContain(Date.parse(kickoffs[7]));
});

test('the league filter narrows the list, and a league with nothing stored is empty', async () => {
  const { from, to } = { from: '2026-01-01T00:00:00Z', to: '2027-01-01T00:00:00Z' };

  const premier = await get(`/fixtures?from=${from}&to=${to}&league=PL`);
  const laLiga = await get(`/fixtures?from=${from}&to=${to}&league=PD`);

  expect(premier.body.fixtures.length).toBe(finished.matches.length + next14.matches.length);
  expect(laLiga.body.fixtures).toEqual([]);
});

test('a match in play is live', async () => {
  const inPlay = next14.matches.find((m) => m.status === 'IN_PLAY');
  if (!inPlay) throw new Error('the recording has no match in play');
  const { from, to } = dayOf(inPlay.utcDate);

  const { body } = await get(`/fixtures?from=${from}&to=${to}`);

  expect(body.fixtures.find((f) => f.kickoffUtc === new Date(inPlay.utcDate).toISOString())?.status).toBe('live');
});

test('a bad window or league is a 400, not an empty list', async () => {
  expect((await get('/fixtures')).status).toBe(400);
  expect((await get('/fixtures?from=yesterday&to=today')).status).toBe(400);
  expect((await get('/fixtures?from=2026-10-01T00:00:00Z&to=2026-10-02T00:00:00Z&league=EPL')).status).toBe(400);
});

test('fixtures need a signed-in user', async () => {
  expect((await get('/fixtures?from=2026-10-01T00:00:00Z&to=2026-10-02T00:00:00Z', false)).status).toBe(401);
});

test('upcoming is every match not started, soonest first, a page at a time', async () => {
  const kickoffs = next14.matches.filter((m) => m.status === 'TIMED' || m.status === 'SCHEDULED').map((m) => Date.parse(m.utcDate)).sort();
  const clock = new Date(kickoffs[0] - 60_000);
  const app = createApp(() => testDb.db, () => clock);
  const get2 = async (q: string) =>
    (await (await app.request(`/fixtures?scope=upcoming${q}`, { headers: { Authorization: 'Bearer token-user_a' } }, env)).json()) as { fixtures: FixtureJson[]; hasMore: boolean };

  const first = await get2('&limit=3');
  const second = await get2('&limit=3&offset=3');

  expect(first.fixtures).toHaveLength(3);
  expect(first.hasMore).toBe(true);
  const both = [...first.fixtures, ...second.fixtures];
  const times = both.map((f) => Date.parse(f.kickoffUtc));
  expect(times).toEqual([...times].sort((a, b) => a - b));
  expect(times[0]).toBeGreaterThanOrEqual(kickoffs[0]);
  expect(new Set(both.map((f) => f.id)).size).toBe(6);
  expect(both.every((f) => f.status === 'scheduled')).toBe(true);
});

test('results are every finished match, newest first, and the league filter applies', async () => {
  const res = await get('/fixtures?scope=results&limit=100&league=PL');
  const body = res.body as unknown as { fixtures: FixtureJson[]; hasMore: boolean };

  expect(body.fixtures.length).toBe(finished.matches.filter((m) => m.status === 'FINISHED').length);
  expect(body.hasMore).toBe(false);
  const times = body.fixtures.map((f) => Date.parse(f.kickoffUtc));
  expect(times).toEqual([...times].sort((a, b) => b - a));
  expect(body.fixtures.every((f) => f.status === 'finished' && f.leagueId === 'PL')).toBe(true);
  expect((await get('/fixtures?scope=results&league=PD')).body.fixtures).toEqual([]);
});

test('a bad scope or page is a 400', async () => {
  expect((await get('/fixtures?scope=soon')).status).toBe(400);
  expect((await get('/fixtures?scope=upcoming&limit=0')).status).toBe(400);
  expect((await get('/fixtures?scope=upcoming&limit=101')).status).toBe(400);
  expect((await get('/fixtures?scope=upcoming&offset=-1')).status).toBe(400);
});
