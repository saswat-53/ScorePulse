import { afterEach, beforeEach, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import lineupsJson from '../fixtures/api-football/lineups-everton-brighton-2024-25.json';
import statisticsJson from '../fixtures/api-football/statistics-everton-brighton-2024-25.json';
import { favoriteTeams, fixtureLineups, fixtures, fixtureStats, follows, pollState, users } from '../src/db/schema';
import { getPollStatus } from '../src/poller/quota';
import { runPoller } from '../src/poller/run-poller';
import { createTestDb } from './db';
import { fakePush, insertFixture, MATCH_WITH_3_GOALS, pollOf, recordedMatch } from './poller-helpers';

// Lineups before kickoff and statistics at halftime and full time are separate API-Football requests (#11).
// The recorded Everton v Brighton responses stand in for any match.
const EVERTON = 45;
const BRIGHTON = 51;
const KICKOFF = new Date('2026-10-29T19:00:00Z');
const at = (minutesAfterKickoff: number) => new Date(KICKOFF.getTime() + minutesAfterKickoff * 60_000);

let testDb: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  testDb = await createTestDb();
  await testDb.db.insert(users).values({ id: 'user_a' });
});
afterEach(() => testDb.close());

function fakeProvider(opts: { lineups?: object; statistics?: object; fail?: boolean } = {}) {
  const calls = { live: 0, lineups: [] as number[], statistics: [] as number[] };
  return {
    calls,
    fetchLive: async () => (calls.live++, pollOf(recordedMatch(MATCH_WITH_3_GOALS))),
    // The match is found by id but brings no statistics, so the separate final-statistics request follows.
    fetchFixture: async (id: number) => ({ response: [{ fixture: { id }, events: [] }] }),
    fetchLineups: async (id: number) => {
      calls.lineups.push(id);
      if (opts.fail) throw new Error('API-Football answered 500');
      return (opts.lineups ?? lineupsJson) as typeof lineupsJson;
    },
    fetchStatistics: async (id: number) => {
      calls.statistics.push(id);
      if (opts.fail) throw new Error('API-Football answered 500');
      return (opts.statistics ?? statisticsJson) as typeof statisticsJson;
    },
  };
}
const EMPTY = { response: [] };

const run = (provider: ReturnType<typeof fakeProvider>, now: Date) =>
  runPoller({ db: testDb.db, push: fakePush(), provider }, now);

async function followed(status: string, overrides: Partial<typeof fixtures.$inferInsert> = {}) {
  const fixture = await insertFixture(testDb.db, recordedMatch(MATCH_WITH_3_GOALS), { kickoff: KICKOFF, status, ...overrides });
  await testDb.db.insert(follows).values({ userId: 'user_a', fixtureId: fixture.id });
  return fixture;
}
const favorited = async (status: string) => {
  const fixture = await insertFixture(testDb.db, recordedMatch(MATCH_WITH_3_GOALS), { kickoff: KICKOFF, status });
  await testDb.db.insert(favoriteTeams).values({ userId: 'user_a', teamId: fixture.homeTeamId });
  return fixture;
};

async function spendRequests(used: number, now: Date) {
  await testDb.db.insert(pollState).values({ id: 'api-football', requestsToday: used, quotaDay: now.toISOString().slice(0, 10) });
}
const used = async (now: Date) => (await getPollStatus(testDb.db, now)).requestsToday;
const attempts = async (id: number) => (await testDb.db.select().from(fixtures).where(eq(fixtures.id, id)))[0];

test('fetches the lineups of a followed match about 30 minutes before kickoff, one request, and stores both teams', async () => {
  const fixture = await followed('NS');
  const provider = fakeProvider();

  await run(provider, at(-30));

  expect(provider.calls.lineups).toEqual([fixture.apiFootballId]);
  expect(provider.calls.live).toBe(0);
  const rows = await testDb.db.select().from(fixtureLineups);
  expect(rows.map((r) => r.teamId).sort()).toEqual([EVERTON, BRIGHTON]);
  expect(rows[0].starters).toHaveLength(11);
  expect(await used(at(-30))).toBe(1);
});

test('does not ask for lineups of a match hours away, or of one nobody follows', async () => {
  await followed('NS');
  await insertFixture(testDb.db, recordedMatch(1635511), { kickoff: KICKOFF, status: 'NS' });
  const provider = fakeProvider();

  await run(provider, at(-180));
  await run(provider, at(-30)); // only the followed match

  expect(provider.calls.lineups).toHaveLength(1);
});

test('asks for the lineups once: a stored lineup is not fetched again', async () => {
  await followed('NS');
  const provider = fakeProvider();

  await run(provider, at(-30));
  await run(provider, at(-25));
  await run(provider, at(-20));

  expect(provider.calls.lineups).toHaveLength(1);
});

test('lineups not announced yet are asked for again on the next beat, three tries at most', async () => {
  const fixture = await followed('NS');
  const provider = fakeProvider({ lineups: EMPTY });

  for (const minute of [-35, -30, -25, -20, -15]) await run(provider, at(minute));

  expect(provider.calls.lineups).toHaveLength(3);
  expect((await attempts(fixture.id)).lineupsAttempts).toBe(3);
  expect(await used(at(-10))).toBe(3);
});

test('a failed lineups request is counted against the quota and the tries, and does not stop the run', async () => {
  const fixture = await followed('NS');
  const provider = fakeProvider({ fail: true });

  await run(provider, at(-30));

  expect(await used(at(-30))).toBe(1);
  expect((await attempts(fixture.id)).lineupsAttempts).toBe(1);
});

test('extra requests do not move the live poll off its 5-minute beat', async () => {
  await followed('NS');
  const provider = fakeProvider();

  await run(provider, at(-2)); // lineups fetched
  await run(provider, at(0)); // kickoff: the live poll must still run

  expect(provider.calls.live).toBe(1);
});

test('fetches statistics once at halftime and stores them as halftime numbers', async () => {
  const fixture = await followed('HT');
  const provider = fakeProvider();

  await run(provider, at(47));
  await run(provider, at(52));

  expect(provider.calls.statistics).toEqual([fixture.apiFootballId]);
  const rows = await testDb.db.select().from(fixtureStats);
  expect(rows.map((r) => [r.teamId, r.phase]).sort()).toEqual([[EVERTON, 'HT'], [BRIGHTON, 'HT']]);
  expect(rows.find((r) => r.teamId === EVERTON)!.stats.possession).toBe(38);
});

test('fetches the final statistics after full time and they replace the halftime ones', async () => {
  const fixture = await followed('FT');
  await testDb.db.insert(fixtureStats).values({ fixtureId: fixture.id, teamId: EVERTON, stats: { possession: 1 }, phase: 'HT' });
  const provider = fakeProvider();

  await run(provider, at(112));
  await run(provider, at(117));

  expect(provider.calls.statistics).toHaveLength(1);
  const rows = await testDb.db.select().from(fixtureStats);
  expect(rows).toHaveLength(2);
  expect(rows.every((r) => r.phase === 'FT')).toBe(true);
  expect(rows.find((r) => r.teamId === EVERTON)!.stats.possession).toBe(38);
});

test('does not fetch final statistics before the match can be over', async () => {
  await followed('FT'); // marked over at about 100 minutes, a little before the whistle
  const provider = fakeProvider();

  await run(provider, at(100));

  expect(provider.calls.statistics).toEqual([]);
});

test('statistics that come back empty are asked for again, three tries at most', async () => {
  const fixture = await followed('HT');
  const provider = fakeProvider({ statistics: EMPTY });

  for (const minute of [46, 51, 56, 61]) await run(provider, at(minute));

  expect(provider.calls.statistics).toHaveLength(3);
  expect((await attempts(fixture.id)).statsHtAttempts).toBe(3);
});

test('makes at most three extra requests in one run, lineups before statistics, and finishes the rest on the next run', async () => {
  await followed('NS');
  for (const id of [1635511, 1593155, 1605324]) {
    const f = await insertFixture(testDb.db, recordedMatch(id), { kickoff: KICKOFF, status: 'NS' });
    await testDb.db.insert(follows).values({ userId: 'user_a', fixtureId: f.id });
  }
  const provider = fakeProvider();

  await run(provider, at(-30));
  expect(provider.calls.lineups).toHaveLength(3);
  await run(provider, at(-25));
  expect(provider.calls.lineups).toHaveLength(4);
});

test('at low quota statistics are not fetched and lineups only for favorites, once', async () => {
  const fav = await favorited('NS');
  await followed('HT', { apiFootballId: 777, homeTeamId: 9, awayTeamId: 8 });
  await spendRequests(70, at(-30));
  const provider = fakeProvider({ lineups: EMPTY });

  await run(provider, at(-30));
  await run(provider, at(-25));

  expect(provider.calls.statistics).toEqual([]);
  expect(provider.calls.lineups).toEqual([fav.apiFootballId]); // asked once, no retry
});

test('at low quota a match that is only followed gets no lineup request', async () => {
  await followed('NS');
  await spendRequests(70, at(-30));
  const provider = fakeProvider();

  await run(provider, at(-30));

  expect(provider.calls.lineups).toEqual([]);
});

test('with the quota spent, no extra request is made', async () => {
  await followed('NS');
  await spendRequests(100, at(-30));
  const provider = fakeProvider();

  await run(provider, at(-30));

  expect(provider.calls.lineups).toEqual([]);
  expect(await used(at(-30))).toBe(100);
});

test('extras never push the day past the 100-request limit', async () => {
  for (const id of [1635511, 1593155, 1605324]) {
    const f = await insertFixture(testDb.db, recordedMatch(id), { kickoff: KICKOFF, status: 'NS' });
    await testDb.db.insert(favoriteTeams).values({ userId: 'user_a', teamId: f.homeTeamId });
  }
  await spendRequests(98, at(-30));
  const provider = fakeProvider();

  await run(provider, at(-30));

  expect(provider.calls.lineups).toHaveLength(2);
  expect(await used(at(-30))).toBe(100);
});
