import { afterEach, beforeEach, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import lineupsJson from '../fixtures/api-football/lineups-everton-brighton-2024-25.json';
import statisticsJson from '../fixtures/api-football/statistics-everton-brighton-2024-25.json';
import varJson from '../fixtures/api-football/var-everton-brighton-2024-25.json';
import { favoriteTeams, fixtureEvents, fixtureLineups, fixtures, fixtureStats, follows, pollState, pushTokens, users } from '../src/db/schema';
import { handlePoll, type PollResponse } from '../src/poller/handle-poll';
import { runPoller } from '../src/poller/run-poller';
import { createTestDb } from './db';
import { fakePush, insertVarFixture, noExtras, VAR_MATCH, varPoll } from './poller-helpers';

// After full time a followed match is fetched once more by id (#24): `live=` stops listing it at the whistle, so the
// last poll can be minutes short of the end. The recorded Everton v Brighton stands in for any match.
const match = varJson.response[0];
const allEvents = match.events as NonNullable<PollResponse['response'][number]['events']>;
const lastGoal = allEvents.map((e, i) => [e, i] as const).filter(([e]) => e.type === 'Goal').at(-1)![1];
const KICKOFF = new Date(match.fixture.date);
const at = (m: number) => new Date(KICKOFF.getTime() + m * 60_000);

let testDb: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  testDb = await createTestDb();
  await testDb.db.insert(users).values([{ id: 'user_a' }, { id: 'user_b' }]);
  await testDb.db.insert(pushTokens).values([{ userId: 'user_a', token: 'ExponentPushToken[a]' }, { userId: 'user_b', token: 'ExponentPushToken[b]' }]);
});
afterEach(() => testDb.close());

// The by-id response: the match with all its events, and (when asked) its lineups and statistics.
const byId = (opts: { withExtras?: boolean } = { withExtras: true }) => ({
  response: [{ ...match, events: allEvents, ...(opts.withExtras ? { lineups: lineupsJson.response, statistics: statisticsJson.response } : { lineups: [], statistics: [] }) }],
});

function provider(opts: { response?: object; fail?: boolean } = {}) {
  const calls = { fixture: [] as number[], statistics: 0, lineups: 0 };
  return {
    calls,
    ...noExtras,
    fetchLive: async () => ({ response: [] }),
    fetchFixture: async (id: number) => {
      calls.fixture.push(id);
      if (opts.fail) throw new Error('API-Football answered 500');
      return (opts.response ?? byId()) as never;
    },
    fetchStatistics: async () => (calls.statistics++, { response: [] }),
    fetchFixturesOn: async () => ({ response: [] }),
    fetchLineups: async () => (calls.lineups++, { response: [] }),
  };
}

// A followed match that finished, as the poller left it: every event but the last goal.
async function finishedMatch(over: Partial<typeof fixtures.$inferInsert> = {}, followers = ['user_a']) {
  const fixture = await insertVarFixture(testDb.db);
  await testDb.db.update(fixtures).set({ status: 'FT', ...over }).where(eq(fixtures.id, fixture.id));
  for (const userId of followers) await testDb.db.insert(follows).values({ userId, fixtureId: fixture.id });
  const earlier = allEvents.filter((_, i) => i !== lastGoal);
  const row = (await testDb.db.select().from(fixtures))[0];
  const tracked = [{ ...row, apiFootballId: row.apiFootballId!, firstPolledAt: null }];
  await handlePoll({ db: testDb.db, now: at(80) }, varPoll(earlier), tracked); // first poll: backfill
  await testDb.db.update(fixtures).set({ firstPolledAt: at(10), ...over }).where(eq(fixtures.id, fixture.id));
  return fixture;
}
const events = async () => testDb.db.select().from(fixtureEvents);
const row = async (id: number) => (await testDb.db.select().from(fixtures).where(eq(fixtures.id, id)))[0];
const run = (p: ReturnType<typeof provider>, now: Date) => {
  const push = fakePush();
  return runPoller({ db: testDb.db, push, provider: p }, now).then(() => push);
};
const spend = (used: number, now: Date) =>
  testDb.db.insert(pollState).values({ id: 'api-football', requestsToday: used, quotaDay: now.toISOString().slice(0, 10) });

test('a goal that came after the last poll is in the timeline once the match is over', async () => {
  const fixture = await finishedMatch();
  expect(await events()).toHaveLength(allEvents.length - 1);

  await run(provider(), at(112));

  expect(await events()).toHaveLength(allEvents.length);
  expect((await row(fixture.id)).completedAt).toBeInstanceOf(Date);
});

test('the late goal is alerted once, like any goal', async () => {
  await finishedMatch();
  const p = provider();

  const first = await run(p, at(112));
  const again = await run(p, at(117));

  expect(first.messages.map((m) => m.data.kind)).toEqual(['goal']);
  expect(again.messages).toEqual([]);
});

test('the request is made once per match, however many users follow it', async () => {
  const fixture = await finishedMatch({}, ['user_a', 'user_b']);
  const p = provider();

  await run(p, at(112));
  await run(p, at(117));
  await run(p, at(122));

  expect(p.calls.fixture).toEqual([match.fixture.id]);
  expect((await row(fixture.id)).completedAt).not.toBeNull();
});

test('it waits until the match can be over, as the final statistics do', async () => {
  await finishedMatch();
  const p = provider();

  await run(p, at(100)); // marked finished a little before the whistle

  expect(p.calls.fixture).toEqual([]);
});

test('final lineups and statistics from the same response replace the halftime ones, with no separate statistics request', async () => {
  const fixture = await finishedMatch();
  await testDb.db.insert(fixtureStats).values({ fixtureId: fixture.id, teamId: 45, stats: { possession: 1 }, phase: 'HT' });
  const p = provider();

  await run(p, at(112));
  await run(p, at(117));

  const stats = await testDb.db.select().from(fixtureStats);
  expect(stats.every((s) => s.phase === 'FT')).toBe(true);
  expect(stats.find((s) => s.teamId === 45)!.stats.possession).toBe(38);
  expect(await testDb.db.select().from(fixtureLineups)).toHaveLength(2);
  expect(p.calls.statistics).toBe(0);
});

test('when the response carries no statistics, the separate final-statistics request still follows', async () => {
  await finishedMatch();
  const p = provider({ response: byId({ withExtras: false }) });

  await run(p, at(112));
  await run(p, at(117));

  expect(p.calls.fixture).toHaveLength(1);
  expect(p.calls.statistics).toBe(1);
});

test('with the quota low or spent, the request is not made', async () => {
  await finishedMatch();
  await spend(70, at(112));
  const low = provider();
  await run(low, at(112));
  expect(low.calls.fixture).toEqual([]);

  await testDb.db.update(pollState).set({ requestsToday: 100 });
  const spent = provider();
  await run(spent, at(120));
  expect(spent.calls.fixture).toEqual([]);
});

test('a failed request leaves what the match had, and stops after 3 tries', async () => {
  const fixture = await finishedMatch();
  const p = provider({ fail: true });

  for (const minute of [112, 117, 122, 127, 132]) await run(p, at(minute));

  expect(p.calls.fixture).toHaveLength(3);
  expect(await events()).toHaveLength(allEvents.length - 1);
  expect(await row(fixture.id)).toMatchObject({ completionAttempts: 3, completedAt: null });
});

test('an empty answer counts as a try and is asked again, not taken as the match having no events', async () => {
  const fixture = await finishedMatch();
  const p = provider({ response: { response: [] } });

  await run(p, at(112));

  expect(await row(fixture.id)).toMatchObject({ completionAttempts: 1, completedAt: null });
});

test('events found long after the match are stored without an alert', async () => {
  await finishedMatch();
  const p = provider();

  const push = await run(p, at(200)); // more than 2.5 hours after kickoff: too late to be news

  expect(await events()).toHaveLength(allEvents.length);
  expect(push.messages).toEqual([]);
});

test('a match nobody followed before full time gets no alert for events it only now stores', async () => {
  await finishedMatch({ firstPolledAt: null });
  await testDb.db.update(fixtures).set({ firstPolledAt: null });
  const p = provider();

  const push = await run(p, at(112));

  expect(await events()).toHaveLength(allEvents.length);
  expect(push.messages).toEqual([]);
});

test('a match nobody tracks is not fetched', async () => {
  const fixture = await finishedMatch();
  await testDb.db.delete(follows).where(eq(follows.fixtureId, fixture.id));
  await testDb.db.delete(favoriteTeams);
  const p = provider();

  await run(p, at(112));

  expect(p.calls.fixture).toEqual([]);
});

test('the request is for this match, by its API-Football id', async () => {
  await finishedMatch();
  const p = provider();

  await run(p, at(112));

  expect(p.calls.fixture).toEqual([VAR_MATCH]);
});
