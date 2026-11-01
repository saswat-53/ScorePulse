// One-off: loads the whole current season's matches for the five leagues, so older results exist in the database
// before the catch-up fetches their details (#23). 5 football-data.org requests, 7 seconds apart: no API-Football
// requests. Safe to run twice (nothing is stored twice). Run from server/: `npm run sync:season`.
import { readFileSync } from 'node:fs';
import { getDb } from '../src/db/client';
import { footballData } from '../src/sync/football-data';
import { loadSeasons } from '../src/sync/season';

const vars = Object.fromEntries(
  readFileSync('.dev.vars', 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.split('=')[0], l.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')]),
);
if (!vars.DATABASE_URL) throw new Error('DATABASE_URL is not in .dev.vars');
if (!vars.FOOTBALL_DATA_KEY) throw new Error('FOOTBALL_DATA_KEY is not in .dev.vars');

const done = await loadSeasons({ db: getDb(vars.DATABASE_URL), footballData: footballData(vars.FOOTBALL_DATA_KEY) }, new Date());
for (const d of done) {
  console.log(`${d.code}: ${d.inserted} stored, ${d.updated} updated, ${d.skipped.length} skipped (team not in team_map)`);
  if (d.skipped.length) console.log(`  skipped football-data.org match ids: ${d.skipped.join(', ')}`);
}
