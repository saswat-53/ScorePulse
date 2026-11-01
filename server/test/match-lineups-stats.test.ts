import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import lineupsJson from '../fixtures/api-football/lineups-everton-brighton-2024-25.json';
import statisticsJson from '../fixtures/api-football/statistics-everton-brighton-2024-25.json';
import { createApp } from '../src/app';
import { fixtureEvents, fixtureLineups, fixtures, fixtureStats, follows, teamMap, users } from '../src/db/schema';
import type { Bindings } from '../src/env';
import { parseLineups, parseStats } from '../src/lineups-stats';
import { createTestDb } from './db';

vi.mock('@clerk/backend', () => ({
  verifyToken: async (token: string) => {
    if (!token.startsWith('token-')) throw new Error('invalid token');
    return { sub: token.slice('token-'.length) };
  },
}));

const EVERTON = 45;
const BRIGHTON = 51;

let testDb: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  testDb = await createTestDb();
  await testDb.db.insert(users).values({ id: 'user_a' });
});
afterEach(() => testDb.close());

type Player = { id: number; name: string; number: number; position: string; grid: string | null };
type LineupJson = { teamId: number; formation: string | null; coach: string | null; starters: Player[]; substitutes: Player[] };
type StatJson = { key: string; label: string; home: number; away: number; unit: string | null };

const env = { CLERK_SECRET_KEY: 'sk_test' } as Bindings;
async function getMatch(id: number) {
  const res = await createApp(() => testDb.db).request(`/matches/${id}`, { headers: { Authorization: 'Bearer token-user_a' } }, env);
  return (await res.json()) as { match: { lineups: LineupJson[] | null; stats: StatJson[] | null } };
}

// Everton (home) v Brighton, kicked off and followed, so it is live-tracked.
async function trackedMatch() {
  await testDb.db.insert(teamMap).values([
    { footballDataId: 1, apiFootballId: EVERTON, name: 'Everton' },
    { footballDataId: 2, apiFootballId: BRIGHTON, name: 'Brighton' },
  ]);
  const [fixture] = await testDb.db
    .insert(fixtures)
    .values({ apiFootballId: 1208024, leagueId: 39, homeTeamId: EVERTON, awayTeamId: BRIGHTON, kickoff: new Date('2025-04-12T14:00:00Z'), status: '2H', source: 'api-football' })
    .returning();
  await testDb.db.insert(follows).values({ userId: 'user_a', fixtureId: fixture.id });
  return fixture;
}
const storeLineups = (fixtureId: number, teams = [EVERTON, BRIGHTON]) =>
  testDb.db.insert(fixtureLineups).values(parseLineups(lineupsJson).filter((l) => teams.includes(l.teamId)).map((l) => ({ fixtureId, ...l })));
const storeStats = (fixtureId: number, teams = [EVERTON, BRIGHTON]) =>
  testDb.db.insert(fixtureStats).values(parseStats(statisticsJson).filter((s) => teams.includes(s.teamId)).map((s) => ({ fixtureId, ...s, phase: 'HT' as const })));

// Recorded substitutions of this match: Doucouré off for Ndiaye (Everton, 63'), Calvert-Lewin off for Beto (Everton, 76').
const substitution = (fixtureId: number, elapsed: number, teamId: number, playerId: number, off: string, on: string) =>
  testDb.db.insert(fixtureEvents).values({ fixtureId, elapsed, teamId, playerId, playerName: off, assistName: on, type: 'subst', detail: 'Substitution 1' });

const everton = (lineups: LineupJson[] | null) => lineups!.find((l) => l.teamId === EVERTON)!;

test('a live-tracked match returns both lineups, with formation, coach, starters and substitutes', async () => {
  const fixture = await trackedMatch();
  await storeLineups(fixture.id);

  const { match } = await getMatch(fixture.id);

  expect(match.lineups!.map((l) => l.teamId)).toEqual([EVERTON, BRIGHTON]); // home first
  expect(everton(match.lineups)).toMatchObject({ formation: '4-2-3-1', coach: 'S. Dyche' });
  expect(everton(match.lineups).starters).toHaveLength(11);
  expect(everton(match.lineups).substitutes).toHaveLength(9);
});

test('a substitution puts the player who came on in the place of the one who went off, and takes him off the bench', async () => {
  const fixture = await trackedMatch();
  await storeLineups(fixture.id);
  const { startXI } = lineupsJson.response.find((t) => t.team.id === EVERTON)!;
  const doucoure = startXI.find((p) => p.player.name === 'A. Doucouré')!.player;
  await substitution(fixture.id, 63, EVERTON, doucoure.id, 'A. Doucouré', 'I. Ndiaye');

  const { match } = await getMatch(fixture.id);

  const { starters, substitutes } = everton(match.lineups);
  expect(starters).toHaveLength(11);
  expect(starters.find((p) => p.name === 'A. Doucouré')).toBeUndefined();
  expect(starters.find((p) => p.name === 'I. Ndiaye')).toMatchObject({ number: 10, position: 'F', grid: doucoure.grid });
  expect(substitutes.map((p) => p.name)).not.toContain('I. Ndiaye');
  expect(substitutes).toHaveLength(8);
  // The other team is untouched.
  expect(match.lineups!.find((l) => l.teamId === BRIGHTON)!.substitutes).toHaveLength(9);
});

test('a player who came on and was substituted later goes off in turn', async () => {
  const fixture = await trackedMatch();
  await storeLineups(fixture.id);
  const { startXI } = lineupsJson.response.find((t) => t.team.id === EVERTON)!;
  const doucoure = startXI.find((p) => p.player.name === 'A. Doucouré')!.player;
  const ndiaye = lineupsJson.response.find((t) => t.team.id === EVERTON)!.substitutes.find((p) => p.player.name === 'I. Ndiaye')!.player;
  await substitution(fixture.id, 63, EVERTON, doucoure.id, 'A. Doucouré', 'I. Ndiaye');
  await substitution(fixture.id, 80, EVERTON, ndiaye.id, 'I. Ndiaye', 'Beto');

  const { starters } = everton((await getMatch(fixture.id)).match.lineups);

  expect(starters.map((p) => p.name)).toContain('Beto');
  expect(starters.map((p) => p.name)).not.toContain('I. Ndiaye');
});

test('a substitution that names nobody in the lineup leaves the lineup as it was', async () => {
  const fixture = await trackedMatch();
  await storeLineups(fixture.id);
  await substitution(fixture.id, 63, EVERTON, 1, 'Nobody', 'Nobody Else');

  const { starters, substitutes } = everton((await getMatch(fixture.id)).match.lineups);

  expect(starters).toHaveLength(11);
  expect(substitutes).toHaveLength(9);
});

test('a match whose lineups are not fetched yet has lineups null, and one team alone is returned as it is', async () => {
  const fixture = await trackedMatch();
  expect((await getMatch(fixture.id)).match.lineups).toBeNull();

  await storeLineups(fixture.id, [EVERTON]);
  expect((await getMatch(fixture.id)).match.lineups!.map((l) => l.teamId)).toEqual([EVERTON]);
});

test('stats come back as the eight rows, home against away, with the halftime numbers until the final ones replace them', async () => {
  const fixture = await trackedMatch();
  await storeStats(fixture.id);

  const { match } = await getMatch(fixture.id);

  expect(match.stats!.map((s) => s.key)).toHaveLength(8);
  expect(match.stats![0]).toEqual({ key: 'possession', label: 'Possession', home: 38, away: 62, unit: '%' });
  expect(match.stats!.find((s) => s.key === 'corners')).toMatchObject({ home: 1, away: 5 });
});

test('stats are null until both teams have them', async () => {
  const fixture = await trackedMatch();
  expect((await getMatch(fixture.id)).match.stats).toBeNull();

  await storeStats(fixture.id, [BRIGHTON]);
  expect((await getMatch(fixture.id)).match.stats).toBeNull();
});
