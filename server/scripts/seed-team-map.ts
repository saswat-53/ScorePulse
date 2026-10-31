// One-off: links football-data.org team ids to API-Football team ids (`team_map`, #7) and prints the teams it
// could not link, for a human to check. Run from server/: `npm run seed:team-map`.
// Team lists: football-data.org 2026 (the five leagues) and API-Football season 2024 (the newest the free plan
// allows), recorded under fixtures/. Add a line to OVERRIDES for each team listed as unmatched once its
// API-Football id is known.
import { readFileSync } from 'node:fs';
import { getDb } from '../src/db/client';
import { matchTeams, saveTeamMap } from '../src/sync/team-map';
import afTeamsJson from '../fixtures/api-football/teams-2024.json';
import fdTeamsJson from '../fixtures/football-data/teams.json';

// football-data.org id -> API-Football id, read off the recorded 2024 lists (names in the comments).
const OVERRIDES: Record<number, number> = {
  531: 110, // ES Troyes AC / Estac Troyes
  5721: 327, // FK Bodø/Glimt / Bodo/Glimt
  529: 94, // Stade Rennais FC 1901 / Rennes
  674: 197, // PSV / PSV Eindhoven
};

const url = readFileSync('.dev.vars', 'utf8').split('\n').find((l) => l.startsWith('DATABASE_URL'))?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
if (!url) throw new Error('DATABASE_URL is not in .dev.vars');

const fdTeams = fdTeamsJson.teams;
const { pairs, unmatched } = matchTeams(fdTeams, afTeamsJson.response.map((r) => r.team), OVERRIDES);
await saveTeamMap(getDb(url), pairs, fdTeams);
console.log(`linked ${pairs.length} of ${fdTeams.length} teams`);
console.log('unmatched (link by hand):');
for (const t of unmatched) console.log(`  ${t.id}\t${t.name}`);
