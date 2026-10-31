import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import finishedJson from '../fixtures/football-data/matches-PL-finished.json';
import next14Json from '../fixtures/football-data/matches-PL-next14.json';
import { createApp } from '../src/app';
import { favoriteTeams, fixtures, follows, pollState, users } from '../src/db/schema';
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

const next14 = next14Json as FdMatchesResponse;
// Chelsea v Manchester United, kicked off 12:30 UTC and in play in the recording; Manchester City v Brighton at 15:00 is not.
const inPlay = next14.matches.find((m) => m.status === 'IN_PLAY')!;
const notStarted = next14.matches.find((m) => m.homeTeam.id === 65)!;
const NOW = new Date('2026-10-31T13:30:00Z');

let testDb: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  testDb = await createTestDb();
  await seedTeamMap(testDb.db);
  await syncFixtures({ db: testDb.db }, finishedJson as FdMatchesResponse);
  await syncFixtures({ db: testDb.db }, next14);
  await testDb.db.insert(users).values({ id: 'user_b' });
});
afterEach(() => testDb.close());

type FixtureJson = { id: number; kickoffUtc: string; status: string; tracking: string; paused: boolean };
const env = { CLERK_SECRET_KEY: 'sk_test', MIN_APP_VERSION: '1.0.0' } as Bindings;
async function get(path: string) {
  const res = await createApp(() => testDb.db, () => NOW).request(path, { headers: { Authorization: 'Bearer token-user_a' } }, env);
  return ((await res.json()) as { fixtures: FixtureJson[] }).fixtures;
}
const fixtureOf = async (footballDataId: number) =>
  (await testDb.db.select().from(fixtures)).find((f) => f.footballDataId === footballDataId)!;
const liveMatch = async () => (await get('/live')).find((f) => f.kickoffUtc === new Date(inPlay.utcDate).toISOString());

test('the live list holds only matches in play, not finished or upcoming ones', async () => {
  const live = await get('/live');

  expect(live.map((f) => f.status)).toEqual(['live']);
  expect(live[0].kickoffUtc).toBe(new Date(inPlay.utcDate).toISOString());
});

test('a match nobody follows or favorites is a snapshot, not live-tracked', async () => {
  expect((await liveMatch())?.tracking).toBe('snapshot');
});

test('a favorite team or a follow makes the match live-tracked', async () => {
  const { db } = testDb;
  const fixture = await fixtureOf(inPlay.id);
  await db.insert(favoriteTeams).values({ userId: 'user_b', teamId: fixture.homeTeamId });
  expect((await liveMatch())?.tracking).toBe('live');

  await db.delete(favoriteTeams);
  await db.insert(follows).values({ userId: 'user_b', fixtureId: fixture.id });
  expect((await liveMatch())?.tracking).toBe('live');
});

test('a not-started match with a favorite is live-tracked too, and one without is a snapshot', async () => {
  const { db } = testDb;
  await db.insert(favoriteTeams).values({ userId: 'user_b', teamId: (await fixtureOf(notStarted.id)).homeTeamId });
  const day = (await get('/fixtures?from=2026-10-31T00:00:00Z&to=2026-11-01T00:00:00Z')).filter((f) => f.status === 'scheduled');

  expect(day.filter((f) => f.tracking === 'live')).toHaveLength(1);
  expect(day.filter((f) => f.tracking === 'snapshot').length).toBeGreaterThan(0);
});

test('at normal quota nothing is paused', async () => {
  const { db } = testDb;
  await db.insert(follows).values({ userId: 'user_b', fixtureId: (await fixtureOf(inPlay.id)).id });

  expect((await liveMatch())?.paused).toBe(false);
});

test('at low quota a follow-only match is paused, but a favorite match and a snapshot are not (ADR 0013)', async () => {
  const { db } = testDb;
  await db.insert(pollState).values({ id: 'api-football', requestsToday: 70, quotaDay: '2026-10-31', lastPolledAt: NOW });
  const fixture = await fixtureOf(inPlay.id);

  expect((await liveMatch())?.paused).toBe(false); // snapshot: nobody tracks it

  await db.insert(follows).values({ userId: 'user_b', fixtureId: fixture.id });
  expect((await liveMatch())?.paused).toBe(true); // followed only

  await db.insert(favoriteTeams).values({ userId: 'user_b', teamId: fixture.homeTeamId });
  expect((await liveMatch())?.paused).toBe(false); // a favorite keeps polling
});

test('a finished match, and a match that should have started but is still marked not started, are not live even inside the 4-hour window', async () => {
  const { db } = testDb;
  const recent = new Date(NOW.getTime() - 60 * 60_000);
  const finishedFixture = (await db.select().from(fixtures)).find((f) => f.status === 'FT')!;
  await db.update(fixtures).set({ kickoff: recent }).where(eq(fixtures.id, finishedFixture.id));
  await db.update(fixtures).set({ kickoff: recent }).where(eq(fixtures.footballDataId, notStarted.id));

  const live = await get('/live');

  expect(live.map((f) => f.status)).toEqual(['live']);
});

test('at low quota a followed match that is not in play is not shown as paused', async () => {
  const { db } = testDb;
  await db.insert(pollState).values({ id: 'api-football', requestsToday: 70, quotaDay: '2026-10-31', lastPolledAt: NOW });
  await db.insert(follows).values({ userId: 'user_b', fixtureId: (await fixtureOf(notStarted.id)).id });

  const day = await get('/fixtures?from=2026-10-31T00:00:00Z&to=2026-11-01T00:00:00Z');

  expect(day.find((f) => f.tracking === 'live' && f.status === 'scheduled')?.paused).toBe(false);
});
