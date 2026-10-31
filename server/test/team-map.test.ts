import { expect, test } from 'vitest';
import afTeamsJson from '../fixtures/api-football/teams-2024.json';
import fdTeamsJson from '../fixtures/football-data/teams.json';
import { matchTeams } from '../src/sync/team-map';

// Recorded team lists: football-data.org 2026 (the five leagues) and API-Football season 2024 (the newest the free plan allows).
const fdTeams = fdTeamsJson.teams;
const afTeams = afTeamsJson.response.map((r) => r.team);

const apiFootballIdOf = (result: ReturnType<typeof matchTeams>, footballDataId: number) =>
  result.pairs.find((p) => p.footballDataId === footballDataId)?.apiFootballId;

test('links the same club under both providers by name', () => {
  const result = matchTeams(fdTeams, afTeams);

  expect(apiFootballIdOf(result, 57)).toBe(42); // Arsenal FC
  expect(apiFootballIdOf(result, 397)).toBe(51); // Brighton & Hove Albion FC
});

test('links a club whose names differ by a suffix or a word, such as Leeds United FC and Leeds', () => {
  const result = matchTeams(fdTeams, afTeams);

  expect(apiFootballIdOf(result, 341)).toBe(63);
});

test('does not guess from a look-alike three-letter code: LASK Linz is not Lincoln Red Imps', () => {
  const result = matchTeams(fdTeams, afTeams);

  expect(apiFootballIdOf(result, 2016)).toBeUndefined();
  expect(result.unmatched.map((t) => t.id)).toContain(2016);
});

test('an override links a team the names cannot', () => {
  const without = matchTeams(fdTeams, afTeams);
  expect(apiFootballIdOf(without, 531)).toBeUndefined(); // ES Troyes AC

  const result = matchTeams(fdTeams, afTeams, { 531: 110 }); // Estac Troyes

  expect(apiFootballIdOf(result, 531)).toBe(110);
  expect(result.unmatched.map((t) => t.id)).not.toContain(531);
});

test('every team is either linked or listed as unmatched, and no API-Football team is used twice', () => {
  const result = matchTeams(fdTeams, afTeams);

  expect(result.pairs.length + result.unmatched.length).toBe(fdTeams.length);
  const used = result.pairs.map((p) => p.apiFootballId);
  expect(new Set(used).size).toBe(used.length);
});
