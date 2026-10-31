import { afterEach, beforeEach, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { favoriteTeams, fixtures, follows, users } from '../src/db/schema';
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
const minutesAfterKickoff = (m: number) => new Date(KICKOFF.getTime() + m * 60_000);

// A provider that records every request it receives and answers with the match as recorded.
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

test('makes no provider request when nothing is live-tracked', async () => {
  const { db } = testDb;
  await insertFixture(db, recordedMatch(MATCH_WITH_3_GOALS), { kickoff: KICKOFF, status: '2H' });
  const provider = fakeProvider();

  await runPoller({ db, push: fakePush(), provider }, minutesAfterKickoff(30));

  expect(provider.requests).toEqual([]);
});

test('makes no provider request when a followed match is hours away', async () => {
  const { db } = testDb;
  const fixture = await insertFixture(db, recordedMatch(MATCH_WITH_3_GOALS), { kickoff: KICKOFF, status: 'NS' });
  await db.insert(follows).values({ userId: 'user_a', fixtureId: fixture.id });
  const provider = fakeProvider();

  await runPoller({ db, push: fakePush(), provider }, minutesAfterKickoff(-300));

  expect(provider.requests).toEqual([]);
});

test('makes exactly one league-filtered request when a followed match is in play', async () => {
  const { db } = testDb;
  const match = recordedMatch(MATCH_WITH_3_GOALS);
  const fixture = await insertFixture(db, match, { kickoff: KICKOFF, status: '2H' });
  await db.insert(follows).values({ userId: 'user_a', fixtureId: fixture.id });
  const provider = fakeProvider();

  await runPoller({ db, push: fakePush(), provider }, minutesAfterKickoff(50));

  expect(provider.requests).toEqual([[match.league.id]]);
});

test('one request covers every live-tracked match, favorite or follow, across leagues', async () => {
  const { db } = testDb;
  const first = recordedMatch(MATCH_WITH_3_GOALS);
  const second = recordedMatch(MATCH_WITH_OWN_GOAL);
  await insertFixture(db, first, { kickoff: KICKOFF, status: '1H', leagueId: 39 });
  const followed = await insertFixture(db, second, { kickoff: KICKOFF, status: '1H', leagueId: 140 });
  await db.insert(favoriteTeams).values({ userId: 'user_a', teamId: first.teams.home.id });
  await db.insert(follows).values({ userId: 'user_a', fixtureId: followed.id });
  const provider = fakeProvider();

  await runPoller({ db, push: fakePush(), provider }, minutesAfterKickoff(20));

  expect(provider.requests.length).toBe(1);
  expect([...provider.requests[0]].sort((a, b) => a - b)).toEqual([39, 140]);
});

// Each Neon request is an HTTPS round trip and costs Worker CPU (ADR 0004), so a run's requests are counted.
function requestsDuring(run: () => Promise<void>) {
  const before = testDb.requests();
  return run().then(() => testDb.requests() - before);
}

test('an idle run makes one Neon request', async () => {
  const { db } = testDb;
  const provider = fakeProvider();

  const requests = await requestsDuring(() => runPoller({ db, push: fakePush(), provider }, minutesAfterKickoff(30)));

  expect(requests).toBe(1);
});

test('a poll that brings a new goal makes two Neon requests: one to read, one to write', async () => {
  const { db } = testDb;
  const first = recordedMatch(MATCH_WITH_3_GOALS);
  const second = recordedMatch(MATCH_WITH_OWN_GOAL);
  for (const match of [first, second]) {
    const fixture = await insertFixture(db, match, { kickoff: KICKOFF, status: '2H' });
    await db.insert(follows).values({ userId: 'user_a', fixtureId: fixture.id });
  }
  const provider = {
    fetchLive: async () => ({
      response: [recordedMatch(MATCH_WITH_3_GOALS), recordedMatch(MATCH_WITH_OWN_GOAL)],
    }),
  };

  const requests = await requestsDuring(() => runPoller({ db, push: fakePush(), provider }, minutesAfterKickoff(50)));

  expect(requests).toBe(2);
});

test('stores the status and score from the poll, and a match at halftime is not polled', async () => {
  const { db } = testDb;
  const match = recordedMatch(MATCH_WITH_3_GOALS);
  const fixture = await insertFixture(db, match, { kickoff: KICKOFF, status: '1H' });
  await db.insert(follows).values({ userId: 'user_a', fixtureId: fixture.id });
  const atHalftime = { ...pollOf(match), response: [{ ...match, fixture: { ...match.fixture, status: { ...match.fixture.status, short: 'HT' } }, goals: { home: 2, away: 1 } }] };
  const provider = { requests: 0, fetchLive: async () => (provider.requests++, atHalftime) };

  await runPoller({ db, push: fakePush(), provider }, minutesAfterKickoff(45));
  await runPoller({ db, push: fakePush(), provider }, minutesAfterKickoff(50));

  const [stored] = await db.select().from(fixtures).where(eq(fixtures.id, fixture.id));
  expect(stored).toMatchObject({ status: 'HT', homeGoals: 2, awayGoals: 1 });
  expect(provider.requests).toBe(1);
});

test('polling resumes for the second half once halftime has had time to end', async () => {
  const { db } = testDb;
  const fixture = await insertFixture(db, recordedMatch(MATCH_WITH_3_GOALS), {
    kickoff: KICKOFF,
    status: 'HT',
    updatedAt: minutesAfterKickoff(47), // the poll that saw the whistle
  });
  await db.insert(follows).values({ userId: 'user_a', fixtureId: fixture.id });
  const provider = fakeProvider();

  await runPoller({ db, push: fakePush(), provider }, minutesAfterKickoff(52)); // still the break
  expect(provider.requests.length).toBe(0);
  await runPoller({ db, push: fakePush(), provider }, minutesAfterKickoff(62)); // the break is over
  expect(provider.requests.length).toBe(1);
});

test('a match still not started 30 minutes after kickoff is not polled (postponed or delayed)', async () => {
  const { db } = testDb;
  const fixture = await insertFixture(db, recordedMatch(MATCH_WITH_3_GOALS), { kickoff: KICKOFF, status: 'NS' });
  await db.insert(follows).values({ userId: 'user_a', fixtureId: fixture.id });
  const provider = fakeProvider();

  await runPoller({ db, push: fakePush(), provider }, minutesAfterKickoff(40));

  expect(provider.requests.length).toBe(0);
});

test('a match that has left the live response after 100 minutes is over, and polling for it ends', async () => {
  const { db } = testDb;
  const fixture = await insertFixture(db, recordedMatch(MATCH_WITH_3_GOALS), { kickoff: KICKOFF, status: '1H' });
  await db.insert(follows).values({ userId: 'user_a', fixtureId: fixture.id });
  let live = pollOf(recordedMatch(MATCH_WITH_3_GOALS));
  const provider = { requests: 0, fetchLive: async () => (provider.requests++, live) };

  await runPoller({ db, push: fakePush(), provider }, minutesAfterKickoff(50)); // seen live
  live = { response: [] }; // the API stops listing it at full time
  await runPoller({ db, push: fakePush(), provider }, minutesAfterKickoff(110));
  await runPoller({ db, push: fakePush(), provider }, minutesAfterKickoff(115));

  const [stored] = await db.select().from(fixtures).where(eq(fixtures.id, fixture.id));
  expect(stored.status).toBe('FT');
  expect(provider.requests).toBe(2);
});

test('a match missing from the live response before 100 minutes is not written off', async () => {
  const { db } = testDb;
  const fixture = await insertFixture(db, recordedMatch(MATCH_WITH_3_GOALS), { kickoff: KICKOFF, status: '1H' });
  await db.insert(follows).values({ userId: 'user_a', fixtureId: fixture.id });
  let live = pollOf(recordedMatch(MATCH_WITH_3_GOALS));
  const provider = { fetchLive: async () => live };

  await runPoller({ db, push: fakePush(), provider }, minutesAfterKickoff(50));
  live = { response: [] }; // an API hiccup
  await runPoller({ db, push: fakePush(), provider }, minutesAfterKickoff(60));

  const [stored] = await db.select().from(fixtures).where(eq(fixtures.id, fixture.id));
  expect(stored.status).not.toBe('FT');
});
