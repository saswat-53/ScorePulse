import { afterEach, beforeEach, expect, test } from 'vitest';
import finishedJson from '../fixtures/football-data/matches-PL-finished.json';
import { fixtures } from '../src/db/schema';
import type { FootballData } from '../src/sync/football-data';
import { currentSeason, loadSeasons } from '../src/sync/season';
import type { FdMatchesResponse } from '../src/sync/snapshot';
import { createTestDb } from './db';
import { seedTeamMap } from './football-data-helpers';

// The one-time load of a whole season's results (#23), so older matches exist before their details are fetched.
let testDb: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  testDb = await createTestDb();
  await seedTeamMap(testDb.db);
});
afterEach(() => testDb.close());

// football-data.org as recorded: the Premier League's results so far, nothing for the other four.
function fakeFootballData() {
  const asked: { code: string; season: number }[] = [];
  const footballData: Pick<FootballData, 'season'> = {
    season: async (code, season) => {
      asked.push({ code, season });
      return (code === 'PL' ? finishedJson : { matches: [] }) as FdMatchesResponse;
    },
  };
  return { asked, footballData };
}
const noPause = async () => {};

test('the season starts in July: 2026 from July 2026 to June 2027', () => {
  expect(currentSeason(new Date('2026-11-01T00:00:00Z'))).toBe(2026);
  expect(currentSeason(new Date('2027-03-15T00:00:00Z'))).toBe(2026);
  expect(currentSeason(new Date('2027-06-30T23:59:59Z'))).toBe(2026);
  expect(currentSeason(new Date('2027-07-01T00:00:00Z'))).toBe(2027);
});

test('every league is asked for once, for the current season, and its matches are stored', async () => {
  const fake = fakeFootballData();

  const done = await loadSeasons({ db: testDb.db, footballData: fake.footballData, pause: noPause }, new Date('2026-11-01T06:00:00Z'));

  expect(fake.asked).toEqual(['PL', 'PD', 'FL1', 'BL1', 'CL'].map((code) => ({ code, season: 2026 })));
  expect((await testDb.db.select().from(fixtures)).length).toBe(finishedJson.matches.length - done[0].skipped.length);
  expect(done.map((d) => d.code)).toEqual(['PL', 'PD', 'FL1', 'BL1', 'CL']);
  expect(done[0].inserted).toBeGreaterThan(0);
});

test('loading again adds nothing and changes nothing', async () => {
  const fake = fakeFootballData();
  const deps = { db: testDb.db, footballData: fake.footballData, pause: noPause };
  await loadSeasons(deps, new Date('2026-11-01T06:00:00Z'));
  const before = await testDb.db.select().from(fixtures);

  const again = await loadSeasons(deps, new Date('2026-11-01T06:05:00Z'));

  expect((await testDb.db.select().from(fixtures)).length).toBe(before.length);
  expect(again.every((d) => d.inserted === 0 && d.updated === 0)).toBe(true);
});

test('it waits between leagues, so football-data.org\'s limit of 10 requests a minute is never reached', async () => {
  const fake = fakeFootballData();
  const pauses: number[] = [];

  await loadSeasons({ db: testDb.db, footballData: fake.footballData, pause: async (ms) => void pauses.push(ms) }, new Date('2026-11-01T06:00:00Z'));

  expect(pauses).toHaveLength(4); // between five requests, not after the last
  expect(pauses.every((ms) => ms >= 6_000)).toBe(true); // at most 10 a minute
});

test('a match whose team is not in team_map is skipped and reported, not stored with a guess', async () => {
  const fake = fakeFootballData();
  const odd = { ...(finishedJson.matches[0] as object), id: 999001, homeTeam: { id: 123456789 } } as FdMatchesResponse['matches'][number];
  fake.footballData.season = async (code) => ({ matches: code === 'PL' ? [odd] : [] }) as FdMatchesResponse;

  const done = await loadSeasons({ db: testDb.db, footballData: fake.footballData, pause: noPause }, new Date('2026-11-01T06:00:00Z'));

  expect(done[0].skipped).toEqual([999001]);
  expect(await testDb.db.select().from(fixtures)).toEqual([]);
});
