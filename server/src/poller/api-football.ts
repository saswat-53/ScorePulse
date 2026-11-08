import type { LineupsResponse, StatisticsResponse } from '../lineups-stats';
import type { FixtureResponse, FixturesOnResponse } from './extras';
import type { PollResponse } from './handle-poll';
import { RateLimited } from './rate-limit';
import type { LiveProvider } from './run-poller';

const BASE = 'https://v3.football.api-sports.io';

// `fixtures?live=` takes ids joined by a dash and rejects a single one (answering 200 with an error and no matches).
export const liveLeagues = (leagueIds: number[]) => (leagueIds.length === 1 ? `${leagueIds[0]}-${leagueIds[0]}` : leagueIds.join('-'));

// A request refused for rate limit is tried once more after this pause, in the same run. Why the Worker's first request of
// a minute is often refused is not known; the pause shows in the logs whether the refusal is brief.
const RETRY_AFTER_REFUSAL_MS = 20_000;
// Requests of one run are at least this far apart, so three never land in the same second.
const GAP_BETWEEN_REQUESTS_MS = 1_000;
// The run's cron fires at :58, and its first requests were mostly refused at :58 and :59 but accepted from about :00 to :20.
// A first request in the last seconds of a minute, or the first seconds of the next, waits until this second.
const SETTLED_SECOND = 3;
const UNSETTLED_FROM_SECOND = 55;

// How long a request made at `at` waits to land at a settled second of the minute.
export function msUntilSettled(at: Date): number {
  const second = at.getUTCSeconds() + at.getUTCMilliseconds() / 1000;
  if (second >= UNSETTLED_FROM_SECOND) return Math.round((60 - second + SETTLED_SECOND) * 1000);
  if (second < SETTLED_SECOND) return Math.round((SETTLED_SECOND - second) * 1000);
  return 0;
}

type Options = { baseUrl?: string; retryMs?: number; gapMs?: number; sleep?: (ms: number) => Promise<unknown>; now?: () => Date };

export function apiFootball(apiKey: string, options: Options = {}): LiveProvider {
  // Requests from the Worker's shared Cloudflare address are often refused for rate limit whatever the plan has left (#26), so
  // they can go through a relay (relay/) that forwards them from another address. It takes the same paths, under /api.
  const base = (options.baseUrl || BASE).replace(/\/+$/, '');
  const retryMs = options.retryMs ?? RETRY_AFTER_REFUSAL_MS;
  const gapMs = options.gapMs ?? GAP_BETWEEN_REQUESTS_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? (() => new Date());
  // One provider serves one run, so the first request is the run's first.
  let lastAt: number | null = null;
  const pace = async () => {
    const wait = lastAt === null ? msUntilSettled(now()) : Math.max(0, gapMs - (now().getTime() - lastAt));
    if (wait > 0) await sleep(wait);
    lastAt = now().getTime();
  };
  const get = async (path: string): Promise<unknown> => {
    try {
      return await getOnce(path);
    } catch (error) {
      if (!(error instanceof RateLimited)) throw error;
      await sleep(retryMs);
      return getOnce(path);
    }
  };
  const getOnce = async (path: string) => {
    await pace();
    const headers = { 'x-apisports-key': apiKey };
    let failure = '';
    let res: Response | null =
      base === BASE
        ? await fetch(`${BASE}/${path}`, { headers })
        : await fetch(`${base}/${path}`, { headers }).catch((error) => {
            failure = String(error);
            return null;
          });
    // An answer without the relay's `x-relay` mark is the hosting platform's own (down, over its limits, misdeployed): the
    // request goes to API-Football directly, so a relay that is down costs the refusals it avoids and nothing more.
    if (!res || (base !== BASE && !res.headers.has('x-relay'))) {
      console.warn(`relay did not answer for ${path} (${res ? `status ${res.status}` : failure}): asking API-Football directly`);
      res = await fetch(`${BASE}/${path}`, { headers });
    }
    // A refusal for rate limit usually comes as a 200 (below), but sometimes as a real 429: the same refusal.
    if (res.status === 429) {
      console.warn(`API-Football ${path}: answered 429`);
      throw new RateLimited(path);
    }
    if (!res.ok) throw new Error(`API-Football answered ${res.status}`);
    const body = (await res.json()) as { errors?: object };
    // What is left of the day and of the minute, on every request, refused ones included: comparing a refusal with the
    // line before it shows whether API-Football counts a refused request against the day's 100.
    const left = (name: string) => res.headers.get(name) ?? '?';
    console.log(`API-Football ${path}: ${left('x-ratelimit-requests-remaining')} left today, ${left('x-ratelimit-remaining')} left this minute at ${now().toISOString().slice(11, 23)}`);
    // A refused request still answers 200, with the reason in `errors` (an empty list when all is well) and no matches.
    // The callers read that as "nothing here", so the reason is logged where it can be found.
    if (body?.errors && Object.keys(body.errors).length > 0) {
      // A refusal for rate limit is expected and handled (one retry, then the next beat asks again): a warning, not an error.
      const refused = 'rateLimit' in body.errors;
      (refused ? console.warn : console.error)(`API-Football ${path}: ${JSON.stringify(body.errors)}`);
      if (refused) throw new RateLimited(path);
    }
    return body;
  };
  return {
    // One request for all live matches of the given leagues: `live=39-140` (ids joined by a dash).
    fetchLive: (leagueIds) => get(`fixtures?live=${liveLeagues(leagueIds)}`) as Promise<PollResponse>,
    // One match by id, with its events and, when the plan has them, lineups and statistics (#24).
    fetchFixture: (fixtureId) => get(`fixtures?id=${fixtureId}`) as Promise<FixtureResponse>,
    // Every match of one UTC day, about 200 KB: the free plan cannot narrow it by league or team, because those need a
    // season it has no access to. It gives followed matches their id before kickoff. An answer with an error in its
    // body (a 200 all the same) is a failure, not an empty day.
    fetchFixturesOn: async (date) => {
      const body = (await get(`fixtures?date=${date}`)) as FixturesOnResponse & { errors?: unknown };
      if (body.errors && Object.keys(body.errors).length > 0) throw new Error(`API-Football: ${JSON.stringify(body.errors)}`);
      return body;
    },
    // One request each, for one match (both teams come back together).
    fetchLineups: (fixtureId) => get(`fixtures/lineups?fixture=${fixtureId}`) as Promise<LineupsResponse>,
    fetchStatistics: (fixtureId) => get(`fixtures/statistics?fixture=${fixtureId}`) as Promise<StatisticsResponse>,
  };
}
