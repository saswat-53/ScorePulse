import type { LineupsResponse, StatisticsResponse } from '../lineups-stats';
import type { PollResponse } from './handle-poll';
import type { LiveProvider } from './run-poller';

const BASE = 'https://v3.football.api-sports.io';

export function apiFootball(apiKey: string): LiveProvider {
  const get = async (path: string) => {
    const res = await fetch(`${BASE}/${path}`, { headers: { 'x-apisports-key': apiKey } });
    if (!res.ok) throw new Error(`API-Football answered ${res.status}`);
    return res.json();
  };
  return {
    // One request for all live matches of the given leagues: `live=39-140` (ids joined by a dash).
    fetchLive: (leagueIds) => get(`fixtures?live=${leagueIds.join('-')}`) as Promise<PollResponse>,
    // One request each, for one match (both teams come back together).
    fetchLineups: (fixtureId) => get(`fixtures/lineups?fixture=${fixtureId}`) as Promise<LineupsResponse>,
    fetchStatistics: (fixtureId) => get(`fixtures/statistics?fixture=${fixtureId}`) as Promise<StatisticsResponse>,
  };
}
