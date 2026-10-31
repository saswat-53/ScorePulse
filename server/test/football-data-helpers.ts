import afTeamsJson from '../fixtures/api-football/teams-2024.json';
import fdTeamsJson from '../fixtures/football-data/teams.json';
import { matchTeams, saveTeamMap } from '../src/sync/team-map';
import type { createTestDb } from './db';

type TestDb = Awaited<ReturnType<typeof createTestDb>>['db'];

// The team_map the sync needs, built the way production builds it: the recorded team lists, matched by name.
export async function seedTeamMap(db: TestDb) {
  const fdTeams = fdTeamsJson.teams;
  const { pairs } = matchTeams(fdTeams, afTeamsJson.response.map((r) => r.team));
  await saveTeamMap(db, pairs, fdTeams);
  return pairs;
}
