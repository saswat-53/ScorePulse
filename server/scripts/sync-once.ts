// One-off: runs the snapshot sync for all five leagues once, so a local database has real fixtures and standings
// before the screens are checked. The deployed Worker does this on a cron. Run from server/: `npm run sync:once`.
import { readFileSync } from 'node:fs';
import { getDb } from '../src/db/client';
import { footballData } from '../src/sync/football-data';
import { runSync } from '../src/sync/run-sync';

const vars = Object.fromEntries(
  readFileSync('.dev.vars', 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.split('=')[0], l.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')]),
);
if (!vars.DATABASE_URL) throw new Error('DATABASE_URL is not in .dev.vars');
if (!vars.FOOTBALL_DATA_KEY) throw new Error('FOOTBALL_DATA_KEY is not in .dev.vars');

const db = getDb(vars.DATABASE_URL);
const api = footballData(vars.FOOTBALL_DATA_KEY);
const now = new Date();
// football-data.org allows 10 requests a minute and each league takes 2, so wait between leagues.
for (let slot = 0; slot < 5; slot++) {
  await runSync({ db, footballData: api }, slot, now);
  if (slot < 4) await new Promise((resolve) => setTimeout(resolve, 15_000));
}
console.log('done: fixtures and standings are stored');
