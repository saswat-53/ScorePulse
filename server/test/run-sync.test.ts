import { afterEach, beforeEach, expect, test } from 'vitest';
import next14Json from '../fixtures/football-data/matches-PL-next14.json';
import standingsJson from '../fixtures/football-data/standings-PL.json';
import { fixtures, standings } from '../src/db/schema';
import type { FootballData } from '../src/sync/football-data';
import { runSync } from '../src/sync/run-sync';
import type { FdMatchesResponse, FdStandingsResponse } from '../src/sync/snapshot';
import { createTestDb } from './db';
import { seedTeamMap } from './football-data-helpers';

let testDb: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  testDb = await createTestDb();
  await seedTeamMap(testDb.db);
});
afterEach(() => testDb.close());

// football-data.org as recorded: it answers for the Premier League only, and remembers what it was asked.
function fakeFootballData() {
  const asked: { code: string; from?: string; to?: string }[] = [];
  const footballData: FootballData = {
    matches: async (code, from, to) => (asked.push({ code, from, to }), next14Json as FdMatchesResponse),
    standings: async (code) => (asked.push({ code }), standingsJson as FdStandingsResponse),
  };
  return { asked, footballData };
}

test('each cron slot syncs one league: fixtures from 3 days back to 14 ahead, and the table', async () => {
  const { db } = testDb;
  const fake = fakeFootballData();

  await runSync({ db, footballData: fake.footballData }, 0, new Date('2026-10-31T06:00:00Z'));

  expect(fake.asked).toEqual([{ code: 'PL', from: '2026-10-28', to: '2026-11-14' }, { code: 'PL' }]);
  expect((await db.select().from(fixtures)).length).toBe(next14Json.matches.length);
  expect((await db.select().from(standings)).length).toBe(standingsJson.standings[0].table.length);
});

test('slots 1 to 4 take the other four leagues in order, and a slot past the last does nothing', async () => {
  const { db } = testDb;
  const fake = fakeFootballData();
  const now = new Date('2026-10-31T06:05:00Z');

  for (const slot of [1, 2, 3, 4, 5]) await runSync({ db, footballData: fake.footballData }, slot, now);

  expect(fake.asked.filter((a) => a.from).map((a) => a.code)).toEqual(['PD', 'FL1', 'BL1', 'CL']);
});
