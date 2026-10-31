import { afterEach, beforeEach, expect, test } from 'vitest';
import { favoriteTeams, fixtures, follows, pollState, users } from '../src/db/schema';
import { getPollStatus } from '../src/poller/quota';
import { runPoller } from '../src/poller/run-poller';
import { createTestDb } from './db';
import { fakePush, insertFixture, MATCH_WITH_3_GOALS, MATCH_WITH_OWN_GOAL, pollOf, recordedMatch } from './poller-helpers';

let testDb: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  testDb = await createTestDb();
  await testDb.db.insert(users).values({ id: 'user_a' });
});
afterEach(() => testDb.close());

const KICKOFF = new Date('2026-10-29T19:00:00Z');
const at = (minutesAfterKickoff: number) => new Date(KICKOFF.getTime() + minutesAfterKickoff * 60_000);

function fakeProvider() {
  const requests: number[][] = [];
  return {
    requests,
    fetchLive: async (leagueIds: number[]) => {
      requests.push(leagueIds);
      return pollOf(recordedMatch(MATCH_WITH_3_GOALS));
    },
  };
}

// A match in play that a user follows (follow only, no favorite).
async function followedMatchInPlay() {
  const fixture = await insertFixture(testDb.db, recordedMatch(MATCH_WITH_3_GOALS), { kickoff: KICKOFF, status: '2H' });
  await testDb.db.insert(follows).values({ userId: 'user_a', fixtureId: fixture.id });
}

// Pretend `used` requests were already spent on the quota day of `now`.
async function spendRequests(used: number, now: Date, lastPolledAt: Date | null = null) {
  await testDb.db
    .insert(pollState)
    .values({ id: 'api-football', requestsToday: used, quotaDay: now.toISOString().slice(0, 10), lastPolledAt });
}

const run = (provider: ReturnType<typeof fakeProvider>, now: Date) =>
  runPoller({ db: testDb.db, push: fakePush(), provider }, now);

test('records each request and reports the quota left', async () => {
  await followedMatchInPlay();
  const provider = fakeProvider();

  await run(provider, at(20));
  await run(provider, at(25));

  expect(await getPollStatus(testDb.db, at(26))).toMatchObject({ requestsToday: 2, remaining: 98, paused: false });
});

test('polls every 5 minutes at normal quota, not more often', async () => {
  await followedMatchInPlay();
  const provider = fakeProvider();

  await run(provider, at(20));
  await run(provider, at(22)); // too soon
  await run(provider, at(25)); // 5 minutes after the first

  expect(provider.requests.length).toBe(2);
});

test('a cron run a few seconds early still polls on the 5-minute beat', async () => {
  await followedMatchInPlay();
  const provider = fakeProvider();

  await run(provider, at(20));
  await run(provider, new Date(at(25).getTime() - 5_000)); // the scheduler can fire a little before the minute

  expect(provider.requests.length).toBe(2);
});

test('once 70 of the 100 requests are used, the interval widens to 10 minutes and the state is paused', async () => {
  await insertFixture(testDb.db, recordedMatch(MATCH_WITH_3_GOALS), { kickoff: KICKOFF, status: '2H' });
  await testDb.db.insert(favoriteTeams).values({ userId: 'user_a', teamId: recordedMatch(MATCH_WITH_3_GOALS).teams.home.id });
  await spendRequests(70, at(20), at(20));
  const provider = fakeProvider();

  await run(provider, at(26)); // fine at normal quota, too soon at low quota
  expect(provider.requests.length).toBe(0);
  await run(provider, at(30));
  expect(provider.requests.length).toBe(1);
  expect(await getPollStatus(testDb.db, at(30))).toMatchObject({ paused: true, remaining: 29 });
});

test('at low quota only a match with a favorite team is polled; a follow-only match waits (ADR 0013)', async () => {
  const followed = recordedMatch(MATCH_WITH_OWN_GOAL);
  const favorite = recordedMatch(MATCH_WITH_3_GOALS);
  const followedFixture = await insertFixture(testDb.db, followed, { kickoff: KICKOFF, status: '2H', leagueId: 140 });
  await insertFixture(testDb.db, favorite, { kickoff: KICKOFF, status: '2H', leagueId: 39 });
  await testDb.db.insert(follows).values({ userId: 'user_a', fixtureId: followedFixture.id });
  await testDb.db.insert(favoriteTeams).values({ userId: 'user_a', teamId: favorite.teams.home.id });
  await spendRequests(70, at(20));
  const provider = fakeProvider();

  await run(provider, at(30));

  expect(provider.requests).toEqual([[39]]);
});

test('at low quota a follow-only match is not polled at all', async () => {
  await followedMatchInPlay();
  await spendRequests(70, at(20));
  const provider = fakeProvider();

  await run(provider, at(30));

  expect(provider.requests).toEqual([]);
});

test('makes no API-Football request once all 100 are used, and the state stays paused', async () => {
  await insertFixture(testDb.db, recordedMatch(MATCH_WITH_3_GOALS), { kickoff: KICKOFF, status: '2H' });
  await testDb.db.insert(favoriteTeams).values({ userId: 'user_a', teamId: recordedMatch(MATCH_WITH_3_GOALS).teams.home.id });
  await spendRequests(100, at(20));
  const provider = fakeProvider();

  await run(provider, at(40));

  expect(provider.requests).toEqual([]);
  expect(await getPollStatus(testDb.db, at(40))).toMatchObject({ paused: true, remaining: 0 });
});

test('the count starts again on a new day', async () => {
  await followedMatchInPlay();
  await spendRequests(100, at(20));
  const provider = fakeProvider();
  const nextDay = new Date(at(20).getTime() + 24 * 3_600_000);
  await testDb.db.update(fixtures).set({ kickoff: new Date(nextDay.getTime() - 20 * 60_000) });

  await run(provider, nextDay);

  expect(provider.requests.length).toBe(1);
  expect(await getPollStatus(testDb.db, nextDay)).toMatchObject({ requestsToday: 1, paused: false });
});
