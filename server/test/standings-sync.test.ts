import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, test } from 'vitest';
import standingsJson from '../fixtures/football-data/standings-PL.json';
import { standings } from '../src/db/schema';
import { syncStandings, type FdStandingsResponse } from '../src/sync/snapshot';
import { createTestDb } from './db';

let testDb: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  testDb = await createTestDb();
});
afterEach(() => testDb.close());

const recorded = standingsJson as FdStandingsResponse;
const top = recorded.standings[0].table[0]; // Manchester City FC, 21 points from 8 played

test('a recorded table becomes one standings row per team with the football-data.org source', async () => {
  const { db } = testDb;

  await syncStandings({ db }, recorded);

  const rows = await db.select().from(standings);
  expect(rows.length).toBe(recorded.standings[0].table.length);
  expect(rows.find((r) => r.teamId === top.team.id)).toMatchObject({
    competition: 'PL',
    season: 2026,
    position: 1,
    teamName: 'Manchester City FC',
    played: 8,
    won: 7,
    drawn: 0,
    lost: 1,
    goalsFor: 20,
    goalsAgainst: 9,
    points: 21,
    source: 'football-data',
  });
});

test('running the sync twice with the same table changes nothing', async () => {
  const { db } = testDb;
  await syncStandings({ db }, recorded);
  const before = await db.select().from(standings);

  const summary = await syncStandings({ db }, recorded);

  expect(summary).toEqual({ inserted: 0, updated: 0 });
  expect(await db.select().from(standings)).toEqual(before);
});

test('a team whose numbers changed is updated, and only that team', async () => {
  const { db } = testDb;
  await syncStandings({ db }, recorded);
  const next = structuredClone(recorded);
  next.standings[0].table[0].points = 24;
  next.standings[0].table[0].playedGames = 9;

  const summary = await syncStandings({ db }, next);

  expect(summary).toEqual({ inserted: 0, updated: 1 });
  const [row] = await db.select().from(standings).where(eq(standings.teamId, top.team.id));
  expect(row).toMatchObject({ points: 24, played: 9 });
});
