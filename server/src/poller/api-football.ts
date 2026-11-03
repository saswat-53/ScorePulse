import type { LineupsResponse, StatisticsResponse } from '../lineups-stats';
import type { FixtureResponse, FixturesOnResponse } from './extras';
import type { PollResponse } from './handle-poll';
import { RateLimited } from './rate-limit';
import type { LiveProvider } from './run-poller';

const BASE = 'https://v3.football.api-sports.io';

// `fixtures?live=` takes ids joined by a dash and rejects a single one (answering 200 with an error and no matches).
export const liveLeagues = (leagueIds: number[]) => (leagueIds.length === 1 ? `${leagueIds[0]}-${leagueIds[0]}` : leagueIds.join('-'));

export function apiFootball(apiKey: string): LiveProvider {
  const get = async (path: string) => {
    const res = await fetch(`${BASE}/${path}`, { headers: { 'x-apisports-key': apiKey } });
    if (!res.ok) throw new Error(`API-Football answered ${res.status}`);
    const body = (await res.json()) as { errors?: object };
    // A refused request still answers 200, with the reason in `errors` (an empty list when all is well) and no matches.
    // The callers read that as "nothing here", so the reason is logged where it can be found.
    if (body?.errors && Object.keys(body.errors).length > 0) {
      console.error(`API-Football ${path}: ${JSON.stringify(body.errors)}`);
      if ('rateLimit' in body.errors) throw new RateLimited(path);
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
