import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app';
import { fixtureEvents, fixtures, follows, pollState, pushTokens, teamMap, users } from '../src/db/schema';
import type { Bindings } from '../src/env';
import type { FdMatch } from '../src/sync/snapshot';
import { getPollStatus } from '../src/poller/quota';
import { runPoller } from '../src/poller/run-poller';
import { createTestDb } from './db';
import { fakePush, insertFixture, lastGoalIndex, MATCH_WITH_3_GOALS, noExtras, pollOf, recordedMatch } from './poller-helpers';

vi.mock('@clerk/backend', () => ({
  verifyToken: async (token: string) => {
    if (!token.startsWith('token-')) throw new Error('invalid token');
    return { sub: token.slice('token-'.length) };
  },
}));

let testDb: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  testDb = await createTestDb();
  await testDb.db.insert(users).values({ id: 'user_a' });
  await testDb.db.insert(pushTokens).values({ userId: 'user_a', token: 'ExponentPushToken[a]' });
});
afterEach(() => testDb.close());

const match = recordedMatch(MATCH_WITH_3_GOALS);
const KICKOFF = new Date('2026-10-29T19:00:00Z');
const at = (m: number) => new Date(KICKOFF.getTime() + m * 60_000);
const FD_ID = 4242;

// A live match as football-data.org reports it: score and status only.
const fdMatch = (home: number, away: number, status = 'IN_PLAY', id = FD_ID): FdMatch => ({
  id,
  utcDate: KICKOFF.toISOString(),
  status,
  competition: { code: 'PL' },
  homeTeam: { id: 1 },
  awayTeam: { id: 2 },
  score: { fullTime: { home, away } },
});

// API-Football's quota for the day of `now` is spent.
const exhaust = (now: Date) =>
  testDb.db.insert(pollState).values({ id: 'api-football', requestsToday: 100, quotaDay: now.toISOString().slice(0, 10) }).onConflictDoNothing();

function providers(scores: () => FdMatch[] | Error) {
  const apiFootball = { calls: 0, ...noExtras, fetchLive: async () => (apiFootball.calls++, pollOf(match)) };
  const fallback = {
    calls: 0,
    fetchLiveScores: async () => {
      fallback.calls++;
      const result = scores();
      if (result instanceof Error) throw result;
      return { matches: result };
    },
  };
  return { apiFootball, fallback };
}

// A followed match in play, 1-0 at the last look, as a snapshot fixture (football-data.org's id, no API-Football id).
async function followedMatch(over: Partial<typeof fixtures.$inferInsert> = {}) {
  await testDb.db.insert(teamMap).values([
    { footballDataId: 1, apiFootballId: match.teams.home.id, name: 'Arsenal FC', shortName: 'Arsenal' },
    { footballDataId: 2, apiFootballId: match.teams.away.id, name: 'Chelsea FC', shortName: 'Chelsea' },
  ]);
  const fixture = await insertFixture(testDb.db, match, {
    footballDataId: FD_ID,
    kickoff: KICKOFF,
    status: '2H',
    homeGoals: 1,
    awayGoals: 0,
    firstPolledAt: at(10),
    ...over,
  });
  await testDb.db.insert(follows).values({ userId: 'user_a', fixtureId: fixture.id });
  return fixture;
}
const row = async (id: number) => (await testDb.db.select().from(fixtures).where(eq(fixtures.id, id)))[0];
const run = (p: ReturnType<typeof providers>, now: Date, push = fakePush()) =>
  runPoller({ db: testDb.db, push, provider: p.apiFootball, fallback: p.fallback }, now).then(() => push);

test('with the quota spent, the poller asks football-data.org instead of API-Football, once every 10 minutes', async () => {
  await followedMatch();
  await exhaust(at(50));
  const p = providers(() => [fdMatch(1, 0)]);

  await run(p, at(50));
  await run(p, at(55)); // too soon
  await run(p, at(60));

  expect(p.fallback.calls).toBe(2);
  expect(p.apiFootball.calls).toBe(0);
});

test('with the quota not spent, football-data.org is not asked', async () => {
  await followedMatch();
  const p = providers(() => [fdMatch(1, 0)]);

  await run(p, at(50));

  expect(p.fallback.calls).toBe(0);
  expect(p.apiFootball.calls).toBe(1);
});

test('football-data.org is only asked while a live-tracked match is in play or due to kick off', async () => {
  const fixture = await followedMatch();
  await exhaust(at(50));
  const p = providers(() => [fdMatch(1, 0)]);

  await testDb.db.delete(follows).where(eq(follows.fixtureId, fixture.id)); // nobody tracks it any more
  await run(p, at(50));
  expect(p.fallback.calls).toBe(0);

  await testDb.db.insert(follows).values({ userId: 'user_a', fixtureId: fixture.id });
  await testDb.db.update(fixtures).set({ status: 'FT' }).where(eq(fixtures.id, fixture.id)); // over
  await run(p, at(60));
  expect(p.fallback.calls).toBe(0);
});

test('a score that goes up sends one push with the score and no scorer or minute, and the same score again sends nothing', async () => {
  const fixture = await followedMatch();
  await exhaust(at(50));
  const p = providers(() => [fdMatch(2, 0)]);

  const first = await run(p, at(50));
  const again = await run(p, at(60)); // football-data.org still says 2-0

  expect(first.messages).toHaveLength(1);
  expect(first.messages[0]).toMatchObject({ title: 'Goal: Arsenal 2-0 Chelsea', data: { kind: 'score', eventKey: `fixture:${fixture.id}:score:2-0`, scorer: null, minute: '' } });
  expect(again.messages).toEqual([]);
});

test('the stored score and status follow football-data.org, and no events are added', async () => {
  const fixture = await followedMatch({ status: '1H' });
  await exhaust(at(50));
  const p = providers(() => [fdMatch(2, 1, 'PAUSED')]);

  await run(p, at(50));

  expect(await row(fixture.id)).toMatchObject({ status: 'HT', homeGoals: 2, awayGoals: 1 });
  expect(await testDb.db.select().from(fixtureEvents)).toEqual([]);
});

test('a score that does not go up sends nothing, and neither does a match first seen mid-game', async () => {
  const same = await followedMatch();
  const p = providers(() => [fdMatch(1, 0)]);
  await exhaust(at(50));
  expect((await run(p, at(50))).messages).toEqual([]);
  expect((await row(same.id)).homeGoals).toBe(1);

  await testDb.db.update(fixtures).set({ status: 'NS', homeGoals: null, awayGoals: null, kickoff: new Date(at(60).getTime() - 2 * 60_000) });
  const late = providers(() => [fdMatch(2, 1)]);
  expect((await run(late, at(60))).messages).toEqual([]); // seen at 2-1 for the first time: history, not news
  expect(await row(same.id)).toMatchObject({ homeGoals: 2, awayGoals: 1, status: 'LIVE' });
});

test('a score alert follows the goals toggle', async () => {
  await followedMatch();
  await testDb.db.update(users).set({ alertGoals: false });
  await exhaust(at(50));

  expect((await run(providers(() => [fdMatch(2, 0)]), at(50))).messages).toEqual([]);
});

test('a match nobody tracks is left alone even when football-data.org lists it', async () => {
  const fixture = await followedMatch();
  await exhaust(at(50));
  const p = providers(() => [fdMatch(2, 0, 'IN_PLAY', 999)]); // a different match

  await run(p, at(50));

  expect(await row(fixture.id)).toMatchObject({ homeGoals: 1, awayGoals: 0 });
});

test('when the quota resets the poller goes back to API-Football, and goals already announced as a score are not announced again', async () => {
  const fixture = await followedMatch({ homeGoals: 0, awayGoals: 0 }); // 2-0 comes in as a score: two goals announced
  await exhaust(at(50));
  const fallbackRun = providers(() => [fdMatch(2, 0)]);
  const push = (await run(fallbackRun, at(50)));
  expect(push.messages).toHaveLength(1); // "Goal: 2-0"

  // The next day API-Football is back. Its first poll after the switch carries the timeline: 2-0 is already covered.
  const tomorrow = new Date(at(50).getTime() + 24 * 3_600_000);
  await testDb.db.update(fixtures).set({ kickoff: new Date(tomorrow.getTime() - 50 * 60_000), status: '2H' }).where(eq(fixtures.id, fixture.id));
  await testDb.db.update(fixtures).set({ apiFootballId: match.fixture.id });
  const goals = match.events.map((e, i) => [e, i] as const).filter(([e]) => e.type === 'Goal');
  const covered = goals[1][1]; // up to and including the 2nd goal
  const back = {
    apiFootball: { calls: 0, ...noExtras, fetchLive: async () => pollOf(match, covered + 1) },
    fallback: fallbackRun.fallback,
  };
  const after = fakePush();
  await runPoller({ db: testDb.db, push: after, provider: back.apiFootball, fallback: back.fallback }, tomorrow);
  expect(after.messages).toEqual([]);

  // A goal after that is announced as usual.
  const later = { ...back.apiFootball, fetchLive: async () => pollOf(match) };
  await runPoller({ db: testDb.db, push: after, provider: later, fallback: back.fallback }, new Date(tomorrow.getTime() + 5 * 60_000));
  expect(after.messages.map((m) => m.data.kind)).toEqual(['goal']);
  expect(await getPollStatus(testDb.db, tomorrow)).toMatchObject({ requestsToday: 2 });
});

// --- what the app is told ---

const env = { CLERK_SECRET_KEY: 'sk_test' } as Bindings;
async function matchJson(id: number, now: Date) {
  const res = await createApp(() => testDb.db, () => now).request(`/matches/${id}`, { headers: { Authorization: 'Bearer token-user_a' } }, env);
  return ((await res.json()) as { match: { paused: boolean; limited: boolean } }).match;
}

test('while football-data.org is answering, the match says limited updates (scores only), not paused', async () => {
  const fixture = await followedMatch();
  await exhaust(at(50));
  await run(providers(() => [fdMatch(1, 0)]), at(50));

  expect(await matchJson(fixture.id, at(55))).toMatchObject({ limited: true, paused: false });
});

test('if football-data.org also fails, polling stops and the match says updates paused', async () => {
  const fixture = await followedMatch();
  await exhaust(at(50));
  const down = providers(() => new Error('football-data.org answered 429'));

  await expect(run(down, at(50))).resolves.toBeDefined(); // a failed run is a log line, not a crash
  await run(down, at(55));

  expect(await row(fixture.id)).toMatchObject({ homeGoals: 1, awayGoals: 0 });
  expect(await matchJson(fixture.id, at(55))).toMatchObject({ limited: false, paused: true });
});

test('football-data.org answering once and then failing for half an hour turns limited into paused', async () => {
  const fixture = await followedMatch();
  await exhaust(at(50));
  await run(providers(() => [fdMatch(1, 0)]), at(50));

  expect((await matchJson(fixture.id, at(60))).limited).toBe(true);
  expect(await matchJson(fixture.id, at(95))).toMatchObject({ limited: false, paused: true });
});

test('with quota left neither state is shown', async () => {
  const fixture = await followedMatch();

  expect(await matchJson(fixture.id, at(50))).toMatchObject({ limited: false, paused: false });
});
