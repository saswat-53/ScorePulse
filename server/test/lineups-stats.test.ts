import { afterEach, expect, test } from 'vitest';
import lineupsJson from '../fixtures/api-football/lineups-everton-brighton-2024-25.json';
import statisticsJson from '../fixtures/api-football/statistics-everton-brighton-2024-25.json';
import { fixtureLineups, fixtures, fixtureStats } from '../src/db/schema';
import { parseLineups, parseStats, toStatRows } from '../src/lineups-stats';
import { createTestDb } from './db';

const EVERTON = 45;
const BRIGHTON = 51;

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

test('a recorded lineups response becomes one lineup per team, with starters on the grid and substitutes off it', () => {
  const lineups = parseLineups(lineupsJson);
  expect(lineups.map((l) => l.teamId).sort()).toEqual([EVERTON, BRIGHTON]);

  const everton = lineups.find((l) => l.teamId === EVERTON)!;
  expect(everton.formation).toBe('4-2-3-1');
  expect(everton.coach).toBe('S. Dyche');
  expect(everton.starters).toHaveLength(11);
  expect(everton.substitutes).toHaveLength(9);
  expect(everton.starters[0]).toEqual({ id: 2932, name: 'J. Pickford', number: 1, position: 'G', grid: '1:1' });
  expect(everton.substitutes.every((p) => p.grid === null)).toBe(true);
});

test('a lineups response with no teams (not announced yet) parses to nothing', () => {
  expect(parseLineups({ response: [] })).toEqual([]);
});

test('recorded statistics become the eight rows of the mockup, as numbers', () => {
  const stats = parseStats(statisticsJson);
  const everton = stats.find((s) => s.teamId === EVERTON)!;
  expect(everton.stats).toEqual({
    possession: 38,
    shots: 9,
    'shots-on-target': 1,
    corners: 1,
    fouls: 8,
    'yellow-cards': 1,
    offsides: 7,
    'pass-accuracy': 77,
  });
});

test('a statistic the API reports as null counts as 0', () => {
  const stats = parseStats({
    response: [{ team: { id: 1 }, statistics: [{ type: 'Corner Kicks', value: null }, { type: 'Ball Possession', value: null }] }],
  });
  expect(stats[0].stats.corners).toBe(0);
  expect(stats[0].stats.possession).toBe(0);
});

test('home and away stats combine into the rows the app shows, in mockup order, with % on possession and pass accuracy', () => {
  const [a, b] = parseStats(statisticsJson);
  const home = a.teamId === EVERTON ? a : b;
  const away = a.teamId === EVERTON ? b : a;
  const rows = toStatRows(home.stats, away.stats);

  expect(rows.map((r) => r.key)).toEqual([
    'possession',
    'shots',
    'shots-on-target',
    'corners',
    'fouls',
    'yellow-cards',
    'offsides',
    'pass-accuracy',
  ]);
  expect(rows[0]).toEqual({ key: 'possession', label: 'Possession', home: 38, away: 62, unit: '%' });
  expect(rows[3]).toEqual({ key: 'corners', label: 'Corners', home: 1, away: 5, unit: null });
});

test('lineups and stats are stored once per fixture and team, and a second save replaces the first', async () => {
  const testDb = await createTestDb();
  close = testDb.close;
  const { db } = testDb;
  const [fixture] = await db
    .insert(fixtures)
    .values({ leagueId: 39, homeTeamId: EVERTON, awayTeamId: BRIGHTON, kickoff: new Date('2025-04-12T14:00:00Z'), status: 'NS', source: 'api-football' })
    .returning();

  const [lineup] = parseLineups(lineupsJson);
  const row = { fixtureId: fixture.id, teamId: lineup.teamId, formation: lineup.formation, coach: lineup.coach, starters: lineup.starters, substitutes: lineup.substitutes };
  await db.insert(fixtureLineups).values(row);
  await db.insert(fixtureLineups).values({ ...row, formation: '4-4-2' }).onConflictDoUpdate({
    target: [fixtureLineups.fixtureId, fixtureLineups.teamId],
    set: { formation: '4-4-2' },
  });
  const lineupRows = await db.select().from(fixtureLineups);
  expect(lineupRows).toHaveLength(1);
  expect(lineupRows[0].formation).toBe('4-4-2');
  expect(lineupRows[0].starters).toHaveLength(11);

  const [stat] = parseStats(statisticsJson);
  const statRow = { fixtureId: fixture.id, teamId: stat.teamId, stats: stat.stats, phase: 'HT' as const };
  await db.insert(fixtureStats).values(statRow);
  await db.insert(fixtureStats).values(statRow).onConflictDoUpdate({
    target: [fixtureStats.fixtureId, fixtureStats.teamId],
    set: { stats: { ...stat.stats, corners: 9 } },
  });
  const statRows = await db.select().from(fixtureStats);
  expect(statRows).toHaveLength(1);
  expect(statRows[0].stats.corners).toBe(9);
});
