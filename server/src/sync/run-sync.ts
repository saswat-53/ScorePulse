import type { PollDb } from '../poller/db';
import { COMPETITIONS, type FootballData } from './football-data';
import { syncFixtures, syncStandings } from './snapshot';

// Next 14 days of fixtures (ADR 0003) plus the results of the last 7 days: a night run catches final scores, and the
// app's Results strip (7 days) has something to show from the first run, not only after a week of runs.
const AHEAD_DAYS = 14;
const BEHIND_DAYS = 7;
const day = (now: Date, offset: number) => new Date(now.getTime() + offset * 86_400_000).toISOString().slice(0, 10);

// One league per cron run (the free plan caps a run at 10 ms of CPU, ADR 0004): the cron fires five times
// five minutes apart, and the slot picks the league. `slot` is 0 to 4.
export async function runSync(deps: { db: PollDb; footballData: Pick<FootballData, 'matches' | 'standings'> }, slot: number, now: Date) {
  const code = COMPETITIONS[slot];
  if (!code) return;
  const matches = await deps.footballData.matches(code, day(now, -BEHIND_DAYS), day(now, AHEAD_DAYS));
  const table = await deps.footballData.standings(code);
  const fixtures = await syncFixtures({ db: deps.db }, matches);
  const standings = await syncStandings({ db: deps.db }, table);
  console.log(JSON.stringify({ sync: code, fixtures, standings }));
}
