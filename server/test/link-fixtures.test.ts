import { afterEach, beforeEach, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { fixtureEvents, fixtures, follows, pushTokens, users } from '../src/db/schema';
import { planLinks, type LinkCandidate } from '../src/poller/link';
import { getPollStatus } from '../src/poller/quota';
import { runPoller } from '../src/poller/run-poller';
import { createTestDb } from './db';
import { fakePush, lastGoalIndex, MATCH_WITH_3_GOALS, noExtras, pollOf, recordedMatch } from './poller-helpers';

let testDb: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  testDb = await createTestDb();
  await testDb.db.insert(users).values({ id: 'user_a' });
  await testDb.db.insert(pushTokens).values({ userId: 'user_a', token: 'ExponentPushToken[a]' });
});
afterEach(() => testDb.close());

const match = recordedMatch(MATCH_WITH_3_GOALS);
const KICKOFF = new Date(match.fixture.date);
const at = (m: number) => new Date(KICKOFF.getTime() + m * 60_000);

// A fixture as the snapshot sync leaves it: football-data.org's id, no API-Football id.
async function snapshotFixture(overrides: Partial<typeof fixtures.$inferInsert> = {}) {
  const [row] = await testDb.db
    .insert(fixtures)
    .values({
      footballDataId: 9001,
      leagueId: match.league.id,
      homeTeamId: match.teams.home.id,
      awayTeamId: match.teams.away.id,
      kickoff: KICKOFF,
      status: 'NS',
      source: 'football-data',
      ...overrides,
    })
    .returning();
  return row;
}
const follow = (fixtureId: number) => testDb.db.insert(follows).values({ userId: 'user_a', fixtureId });
const row = async (id: number) => (await testDb.db.select().from(fixtures).where(eq(fixtures.id, id)))[0];

function provider(responses: ReturnType<typeof pollOf>[]) {
  const calls: number[][] = [];
  return { calls, ...noExtras, fetchLive: async (ids: number[]) => (calls.push(ids), responses.shift() ?? pollOf(match)) };
}

// --- through the poller ---

test('a followed snapshot fixture that goes live gets its API-Football id, and its events are stored', async () => {
  const fixture = await snapshotFixture();
  await follow(fixture.id);
  const live = provider([pollOf(match)]);

  await runPoller({ db: testDb.db, push: fakePush(), provider: live }, at(3));

  const linked = await row(fixture.id);
  expect(linked.apiFootballId).toBe(match.fixture.id);
  expect(linked.footballDataId).toBe(9001); // still the same row, both ids
  expect(linked.firstPolledAt).toBeInstanceOf(Date); // so football-data.org waits for full time (ADR 0003)
  expect((await testDb.db.select().from(fixtureEvents)).filter((e) => e.fixtureId === fixture.id)).toHaveLength(match.events.length);
});

test('after linking, a goal that arrives is alerted like on any live-tracked fixture', async () => {
  const fixture = await snapshotFixture();
  await follow(fixture.id);
  const push = fakePush();
  const live = provider([pollOf(match, lastGoalIndex(match)), pollOf(match)]);

  await runPoller({ db: testDb.db, push, provider: live }, at(3)); // linked, backfilled
  expect(push.messages).toEqual([]);
  await runPoller({ db: testDb.db, push, provider: live }, at(9)); // the 38' goal

  expect(push.messages.map((m) => m.data.kind)).toEqual(['goal']);
});

test('the link costs no request beyond the poll that was going to happen anyway', async () => {
  const fixture = await snapshotFixture();
  await follow(fixture.id);
  const live = provider([pollOf(match)]);

  await runPoller({ db: testDb.db, push: fakePush(), provider: live }, at(3));

  expect(live.calls).toHaveLength(1);
  expect((await getPollStatus(testDb.db, at(3))).requestsToday).toBe(1);
});

test('a fixture already linked is left alone', async () => {
  const fixture = await snapshotFixture({ apiFootballId: match.fixture.id });
  await follow(fixture.id);

  await runPoller({ db: testDb.db, push: fakePush(), provider: provider([pollOf(match)]) }, at(3));

  expect((await row(fixture.id)).apiFootballId).toBe(match.fixture.id);
});

test('a live match whose id another fixture already holds is not linked a second time', async () => {
  await snapshotFixture({ footballDataId: 1, apiFootballId: match.fixture.id, kickoff: new Date(KICKOFF.getTime() + 24 * 3_600_000) });
  const twin = await snapshotFixture({ footballDataId: 2 });
  await follow(twin.id);

  await runPoller({ db: testDb.db, push: fakePush(), provider: provider([pollOf(match)]) }, at(3));

  expect((await row(twin.id)).apiFootballId).toBeNull();
});

// --- the matching rule ---

const candidate = (over: Partial<LinkCandidate> = {}): LinkCandidate => ({
  id: 1,
  leagueId: 39,
  homeTeamId: 10,
  awayTeamId: 20,
  kickoff: new Date('2026-10-29T19:00:00Z'),
  ...over,
});
const liveMatch = (id: number, over: { league?: number; home?: number; away?: number; date?: string } = {}) => ({
  fixture: { id, date: over.date ?? '2026-10-29T19:00:00+00:00' },
  league: { id: over.league ?? 39 },
  teams: { home: { id: over.home ?? 10 }, away: { id: over.away ?? 20 } },
});

test('a fixture is linked to the live match with the same league, teams and kickoff', () => {
  const plan = planLinks([candidate()], [liveMatch(555)]);

  expect(plan.links).toEqual([{ fixtureId: 1, apiFootballId: 555 }]);
  expect(plan.unmatched).toEqual([]);
});

test('a fixture with no live match is reported, not guessed, even when teams or league nearly match', () => {
  const plan = planLinks(
    [candidate()],
    [liveMatch(1, { home: 11 }), liveMatch(2, { league: 140 }), liveMatch(3, { away: 99 }), liveMatch(4, { date: '2026-10-30T19:00:00+00:00' })],
  );

  expect(plan.links).toEqual([]);
  expect(plan.unmatched).toEqual([1]);
});

test('home and away are not interchangeable', () => {
  const plan = planLinks([candidate()], [liveMatch(555, { home: 20, away: 10 })]);

  expect(plan.links).toEqual([]);
});

test('two fixtures between the same teams in one competition are told apart by kickoff', () => {
  const firstLeg = candidate({ id: 1, kickoff: new Date('2026-10-22T19:00:00Z') });
  const secondLeg = candidate({ id: 2, kickoff: new Date('2026-10-29T19:00:00Z') });

  const plan = planLinks([firstLeg, secondLeg], [liveMatch(555)]);

  expect(plan.links).toEqual([{ fixtureId: 2, apiFootballId: 555 }]);
});

test('two fixtures that both fit one live match are ambiguous: neither is linked, both are reported', () => {
  const a = candidate({ id: 1, kickoff: new Date('2026-10-29T18:30:00Z') });
  const b = candidate({ id: 2, kickoff: new Date('2026-10-29T19:30:00Z') });

  const plan = planLinks([a, b], [liveMatch(555)]);

  expect(plan.links).toEqual([]);
  expect(plan.ambiguous.sort()).toEqual([1, 2]);
});

test('one fixture that fits two live matches is ambiguous too', () => {
  const plan = planLinks([candidate()], [liveMatch(555), liveMatch(556)]);

  expect(plan.links).toEqual([]);
  expect(plan.ambiguous).toEqual([1]);
});

test('a kickoff moved by up to two hours still matches', () => {
  expect(planLinks([candidate({ kickoff: new Date('2026-10-29T20:45:00Z') })], [liveMatch(555)]).links).toHaveLength(1);
  expect(planLinks([candidate({ kickoff: new Date('2026-10-29T21:30:00Z') })], [liveMatch(555)]).links).toEqual([]);
});

test('the fixtures of several matches are each linked to their own live match', () => {
  const plan = planLinks(
    [candidate({ id: 1 }), candidate({ id: 2, leagueId: 140, homeTeamId: 30, awayTeamId: 40 })],
    [liveMatch(555), liveMatch(777, { league: 140, home: 30, away: 40 })],
  );

  expect(plan.links).toEqual([{ fixtureId: 1, apiFootballId: 555 }, { fixtureId: 2, apiFootballId: 777 }]);
});
