import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, test } from 'vitest';
import finishedJson from '../fixtures/football-data/matches-PL-finished.json';
import next14Json from '../fixtures/football-data/matches-PL-next14.json';
import { fixtureOverwrites, fixtures, teamMap } from '../src/db/schema';
import { syncFixtures, type FdMatchesResponse } from '../src/sync/snapshot';
import { createTestDb } from './db';
import { seedTeamMap } from './football-data-helpers';

let testDb: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  testDb = await createTestDb();
  await seedTeamMap(testDb.db);
});
afterEach(() => testDb.close());

const next14 = next14Json as FdMatchesResponse;
const finished = finishedJson as FdMatchesResponse;

test('a recorded response becomes fixtures with the football-data.org source', async () => {
  const { db } = testDb;

  const summary = await syncFixtures({ db }, next14);

  const rows = await db.select().from(fixtures);
  expect(rows.length).toBe(next14.matches.length);
  expect(summary).toMatchObject({ inserted: next14.matches.length, updated: 0, skipped: [] });
  const first = next14.matches[0];
  const row = rows.find((r) => r.footballDataId === first.id);
  expect(row).toMatchObject({
    source: 'football-data',
    leagueId: 39, // Premier League at API-Football
    kickoff: new Date(first.utcDate),
    apiFootballId: null,
  });
  // Fixtures keep API-Football team ids (live events carry those), translated through team_map.
  const mapped = await db.select().from(teamMap);
  const apiId = (fdId: number) => mapped.find((m) => m.footballDataId === fdId)?.apiFootballId;
  expect(row?.homeTeamId).toBe(apiId(first.homeTeam.id));
  expect(row?.awayTeamId).toBe(apiId(first.awayTeam.id));
});

test('running the sync twice with the same response changes nothing', async () => {
  const { db } = testDb;
  await syncFixtures({ db }, next14);
  const before = await db.select().from(fixtures);

  const summary = await syncFixtures({ db }, next14);

  expect(summary).toMatchObject({ inserted: 0, updated: 0, overwritten: 0 });
  expect(await db.select().from(fixtures)).toEqual(before); // every column, updatedAt included
});

test('a match with a team that is not in team_map is skipped and reported, not stored with a guess', async () => {
  const { db } = testDb;
  const match = next14.matches[0];
  await db.delete(teamMap).where(eq(teamMap.footballDataId, match.homeTeam.id));

  const involved = next14.matches.filter((m) => m.homeTeam.id === match.homeTeam.id || m.awayTeam.id === match.homeTeam.id);

  const summary = await syncFixtures({ db }, next14);

  expect(involved.length).toBeGreaterThan(0);
  expect(summary.skipped.sort()).toEqual(involved.map((m) => m.id).sort());
  expect((await db.select().from(fixtures)).length).toBe(next14.matches.length - involved.length);
});

// A fixture the live poller has been feeding: API-Football data is already in it (firstPolledAt is set).
async function makeLiveTracked(footballDataId: number, live: { status: string; homeGoals: number; awayGoals: number }) {
  await testDb.db.update(fixtures).set({ ...live, firstPolledAt: new Date() }).where(eq(fixtures.footballDataId, footballDataId));
}
const stored = async (footballDataId: number) =>
  (await testDb.db.select().from(fixtures).where(eq(fixtures.footballDataId, footballDataId)))[0];

test('a live-tracked fixture is never overwritten while the match is not finished', async () => {
  const { db } = testDb;
  const inPlay = next14.matches.find((m) => m.status === 'IN_PLAY');
  if (!inPlay) throw new Error('the recording has no match in play');
  await syncFixtures({ db }, next14);
  await makeLiveTracked(inPlay.id, { status: '2H', homeGoals: 3, awayGoals: 3 }); // not what football-data.org says

  const summary = await syncFixtures({ db }, next14);

  expect(await stored(inPlay.id)).toMatchObject({ status: '2H', homeGoals: 3, awayGoals: 3 });
  expect(summary.overwritten).toBe(0);
  expect(await db.select().from(fixtureOverwrites)).toEqual([]);
});

test('after full time a differing result replaces the live one, and the overwrite is logged once', async () => {
  const { db } = testDb;
  const match = finished.matches[0]; // Crystal Palace 0-2 Newcastle, FINISHED
  await syncFixtures({ db }, finished);
  await makeLiveTracked(match.id, { status: '2H', homeGoals: 1, awayGoals: 0 });

  const first = await syncFixtures({ db }, finished);
  const second = await syncFixtures({ db }, finished);

  expect(await stored(match.id)).toMatchObject({ status: 'FT', homeGoals: 0, awayGoals: 2 });
  expect(first.overwritten).toBe(1);
  expect(second.overwritten).toBe(0);
  const log = await db.select().from(fixtureOverwrites);
  expect(log).toHaveLength(1);
  expect(log[0]).toMatchObject({ oldHomeGoals: 1, oldAwayGoals: 0, newHomeGoals: 0, newAwayGoals: 2 });
});

test('after full time the same result is accepted without a log entry', async () => {
  const { db } = testDb;
  const match = finished.matches[0];
  await syncFixtures({ db }, finished);
  await makeLiveTracked(match.id, { status: '2H', homeGoals: 0, awayGoals: 2 }); // the poller had it right, but never saw FT

  const summary = await syncFixtures({ db }, finished);

  expect((await stored(match.id)).status).toBe('FT');
  expect(summary.overwritten).toBe(0);
  expect(await db.select().from(fixtureOverwrites)).toEqual([]);
});

test('a fixture that was never live-tracked simply follows football-data.org, with no log entry', async () => {
  const { db } = testDb;
  const match = finished.matches[0];
  await syncFixtures({ db }, finished);
  await db.update(fixtures).set({ homeGoals: 9, awayGoals: 9 }).where(eq(fixtures.footballDataId, match.id)); // stale mirror

  const summary = await syncFixtures({ db }, finished);

  expect(await stored(match.id)).toMatchObject({ homeGoals: 0, awayGoals: 2 });
  expect(summary).toMatchObject({ updated: 1, overwritten: 0 });
  expect(await db.select().from(fixtureOverwrites)).toEqual([]);
});

test('a finished match whose score football-data.org has not filled in yet does not wipe the live score', async () => {
  const { db } = testDb;
  const match = finished.matches[0];
  await syncFixtures({ db }, finished);
  await makeLiveTracked(match.id, { status: '2H', homeGoals: 0, awayGoals: 2 });
  const noScoreYet = structuredClone(finished);
  noScoreYet.matches[0].score.fullTime = { home: null, away: null };

  const summary = await syncFixtures({ db }, noScoreYet);

  expect(await stored(match.id)).toMatchObject({ homeGoals: 0, awayGoals: 2 });
  expect(summary.overwritten).toBe(0);
  expect(await db.select().from(fixtureOverwrites)).toEqual([]);
});
