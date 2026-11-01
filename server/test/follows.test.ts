import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app';
import { fixtureEvents, fixtures, follows, users } from '../src/db/schema';
import type { Bindings } from '../src/env';
import { getPollStatus } from '../src/poller/quota';
import { runPoller } from '../src/poller/run-poller';
import { createTestDb } from './db';
import { fakePush, insertFixture, MATCH_WITH_3_GOALS, MATCH_WITH_OWN_GOAL, noExtras, pollOf, recordedMatch } from './poller-helpers';

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

const env = { CLERK_SECRET_KEY: 'sk_test', MIN_APP_VERSION: '1.0.0' } as Bindings;
const call = (method: string, path: string, user?: string) =>
  createApp(() => testDb.db).request(path, { method, headers: user ? { Authorization: `Bearer token-${user}` } : {} }, env);
const follow = (user: string, fixtureId: number) => call('PUT', `/follows/${fixtureId}`, user);
const unfollow = (user: string, fixtureId: number) => call('DELETE', `/follows/${fixtureId}`, user);
const followedIds = async (user: string) =>
  ((await (await call('GET', '/follows', user)).json()) as { follows: number[] }).follows.sort((a, b) => a - b);

// Fixtures are placed around the real clock, because "active" is judged by the database's own clock.
const minutesFromNow = (m: number) => new Date(Date.now() + m * 60_000);
const RECORDED = [MATCH_WITH_3_GOALS, MATCH_WITH_OWN_GOAL, 1593155, 1605324];
async function matches(count: number, overrides: Partial<typeof fixtures.$inferInsert> = {}) {
  const rows = [];
  for (const id of RECORDED.slice(0, count)) {
    rows.push(await insertFixture(testDb.db, recordedMatch(id), { kickoff: minutesFromNow(60), status: 'NS', ...overrides }));
  }
  return rows;
}

test('a follow is saved and listed for the user who made it, and only for them', async () => {
  const [a, b] = await matches(2);

  expect((await follow('user_a', a.id)).status).toBe(200);
  expect((await follow('user_b', b.id)).status).toBe(200);

  expect(await followedIds('user_a')).toEqual([a.id]);
  expect(await followedIds('user_b')).toEqual([b.id]);
});

test('following the same match twice is accepted and uses one slot', async () => {
  const [a, b, c] = await matches(3);

  await follow('user_a', a.id);
  await follow('user_a', a.id);
  await follow('user_a', b.id);

  expect(await followedIds('user_a')).toEqual([a.id, b.id]);
  expect((await follow('user_a', a.id)).status).toBe(200); // already followed: fine even with the slots full
  expect((await follow('user_a', c.id)).status).toBe(409);
});

test('a 3rd active follow is rejected with a clear error and the first 2 stay', async () => {
  const [a, b, c] = await matches(3);
  await follow('user_a', a.id);
  await follow('user_a', b.id);

  const res = await follow('user_a', c.id);

  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({ error: 'follows_full', max: 2 });
  expect(await followedIds('user_a')).toEqual([a.id, b.id]);
});

test('unfollowing frees a slot', async () => {
  const [a, b, c] = await matches(3);
  await follow('user_a', a.id);
  await follow('user_a', b.id);

  expect((await unfollow('user_a', a.id)).status).toBe(204);

  expect((await follow('user_a', c.id)).status).toBe(200);
  expect(await followedIds('user_a')).toEqual([b.id, c.id]);
});

test('a follow ends at full time: it frees its slot and leaves the list, so another match can be followed', async () => {
  const [a, b, c] = await matches(3);
  await follow('user_a', a.id);
  await follow('user_a', b.id);
  expect((await follow('user_a', c.id)).status).toBe(409);

  await testDb.db.update(fixtures).set({ status: 'FT', kickoff: minutesFromNow(-120) }).where(eq(fixtures.id, a.id));

  expect(await followedIds('user_a')).toEqual([b.id]);
  expect((await follow('user_a', c.id)).status).toBe(200);
  expect(await followedIds('user_a')).toEqual([b.id, c.id]);
});

test('a match that is more than a match long past kickoff counts as over even if its status was never updated', async () => {
  const [a, b, c] = await matches(3);
  await follow('user_a', a.id);
  await follow('user_a', b.id);

  await testDb.db.update(fixtures).set({ status: '2H', kickoff: minutesFromNow(-5 * 60) }).where(eq(fixtures.id, a.id));

  expect((await follow('user_a', c.id)).status).toBe(200);
});

test('the cap is per user: one user at 2 does not block another', async () => {
  const [a, b, c] = await matches(3);
  await follow('user_a', a.id);
  await follow('user_a', b.id);

  expect((await follow('user_b', c.id)).status).toBe(200);
  expect((await follow('user_b', a.id)).status).toBe(200); // sharing a match is fine
});

test('follows that arrive together cannot get past the cap', async () => {
  const rows = await matches(4);

  const results = await Promise.all(rows.slice(0, 3).map((f) => follow('user_a', f.id)));

  expect(results.filter((r) => r.status === 200)).toHaveLength(2);
  expect(results.filter((r) => r.status === 409)).toHaveLength(1);
  expect(await followedIds('user_a')).toHaveLength(2);
});

test('the database itself refuses a 3rd active follow, so even a write that skips the API check cannot pass the cap', async () => {
  const [a, b, c] = await matches(3);
  await testDb.db.insert(users).values({ id: 'user_a' });
  const insert = (fixtureId: number) => testDb.db.insert(follows).values({ userId: 'user_a', fixtureId });
  await insert(a.id);
  await insert(b.id);

  const error = (await insert(c.id).then(() => null, (e: unknown) => e)) as { message: string; cause?: { message: string } } | null;

  expect(`${error?.message} ${error?.cause?.message}`).toMatch(/follows_full/);
});

test('a match that is already over cannot be followed', async () => {
  const [a] = await matches(1, { status: 'FT', kickoff: minutesFromNow(-180) });

  const res = await follow('user_a', a.id);

  expect(res.status).toBe(409);
  expect(await res.json()).toEqual({ error: 'match_over' });
  expect(await followedIds('user_a')).toEqual([]);
});

test('an unknown match is a 404 and a bad id is a 400', async () => {
  expect((await follow('user_a', 999999)).status).toBe(404);
  expect((await call('PUT', '/follows/abc', 'user_a')).status).toBe(400);
  expect((await call('DELETE', '/follows/abc', 'user_a')).status).toBe(400);
});

test('the follow routes need a signed-in user', async () => {
  const [a] = await matches(1);
  expect((await call('GET', '/follows')).status).toBe(401);
  expect((await call('PUT', `/follows/${a.id}`)).status).toBe(401);
  expect((await call('DELETE', `/follows/${a.id}`)).status).toBe(401);
});

// --- what a follow does to the poller (ADR 0002) ---

function recordingProvider(match = recordedMatch(MATCH_WITH_3_GOALS)) {
  const requests: number[][] = [];
  return {
    requests,
    ...noExtras,
    fetchLive: async (leagueIds: number[]) => {
      requests.push(leagueIds);
      return pollOf(match);
    },
  };
}

test('following a match in play makes it polled, and the first poll stores the events from before the follow without alerts', async () => {
  const match = recordedMatch(MATCH_WITH_3_GOALS);
  const [fixture] = await matches(1, { kickoff: minutesFromNow(-50), status: '2H' });
  const provider = recordingProvider(match);
  const push = fakePush();

  await runPoller({ db: testDb.db, push, provider }, new Date()); // nobody tracks it yet
  expect(provider.requests).toEqual([]);

  await follow('user_a', fixture.id);
  await runPoller({ db: testDb.db, push, provider }, new Date());

  expect(provider.requests).toEqual([[match.league.id]]);
  const stored = await testDb.db.select().from(fixtureEvents).where(eq(fixtureEvents.fixtureId, fixture.id));
  expect(stored).toHaveLength(match.events.length); // the full list, goals included
  expect(push.sent).toEqual([]); // backfill is history, not news
});

test('a follow costs no provider request of its own: only the poll that follows it spends one', async () => {
  const [fixture] = await matches(1, { kickoff: minutesFromNow(-50), status: '2H' });
  const provider = recordingProvider();

  await follow('user_a', fixture.id);
  expect(provider.requests).toEqual([]);
  expect((await getPollStatus(testDb.db, new Date())).requestsToday).toBe(0);

  await runPoller({ db: testDb.db, push: fakePush(), provider }, new Date());
  expect((await getPollStatus(testDb.db, new Date())).requestsToday).toBe(1);
});

test('unfollowing the only follower stops the polling of that match from the next poll', async () => {
  const [fixture] = await matches(1, { kickoff: minutesFromNow(-50), status: '2H' });
  const provider = recordingProvider();
  await follow('user_a', fixture.id);
  await runPoller({ db: testDb.db, push: fakePush(), provider }, new Date());
  expect(provider.requests).toHaveLength(1);

  await unfollow('user_a', fixture.id);
  await runPoller({ db: testDb.db, push: fakePush(), provider }, new Date(Date.now() + 10 * 60_000));

  expect(provider.requests).toHaveLength(1);
});

test('a match another user still follows stays polled after one user unfollows', async () => {
  const [fixture] = await matches(1, { kickoff: minutesFromNow(-50), status: '2H' });
  const provider = recordingProvider();
  await follow('user_a', fixture.id);
  await follow('user_b', fixture.id);

  await unfollow('user_a', fixture.id);
  await runPoller({ db: testDb.db, push: fakePush(), provider }, new Date());

  expect(provider.requests).toHaveLength(1);
});
