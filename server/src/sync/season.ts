import type { PollDb } from '../poller/db';
import { COMPETITIONS, type FootballData } from './football-data';
import { syncFixtures } from './snapshot';

// The one-time load of a whole season's matches (#23): the nightly sync only reaches a week back, so older results are
// not in the database, and the catch-up cannot fetch details for matches that do not exist there. Meant to run from a
// developer's machine, not in the Worker: a season is about 380 matches a league, more writing than the Worker's 10 ms
// of CPU allows.

// football-data.org counts a season by the year it starts in. European seasons start in August: from July on it is the new one.
export const currentSeason = (now: Date) => (now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1);

// Free tier: 10 requests a minute. One request per league, spaced so five of them stay well under it.
const PAUSE_MS = 7_000;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function loadSeasons(
  deps: { db: PollDb; footballData: Pick<FootballData, 'season'>; pause?: (ms: number) => Promise<void> },
  now: Date,
) {
  const pause = deps.pause ?? sleep;
  const season = currentSeason(now);
  const done: ({ code: string } & Awaited<ReturnType<typeof syncFixtures>>)[] = [];
  for (const [i, code] of COMPETITIONS.entries()) {
    if (i > 0) await pause(PAUSE_MS);
    const matches = await deps.footballData.season(code, season);
    // The same rules as the nightly sync: a polled match is not overwritten, and an unknown team is skipped and reported.
    done.push({ code, ...(await syncFixtures({ db: deps.db }, matches)) });
  }
  return done;
}
