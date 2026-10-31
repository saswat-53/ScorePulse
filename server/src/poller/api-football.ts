import type { LiveProvider } from './run-poller';

// One request for all live matches of the given leagues: `live=39-140` (ids joined by a dash).
export function apiFootball(apiKey: string): LiveProvider {
  return {
    async fetchLive(leagueIds) {
      const res = await fetch(`https://v3.football.api-sports.io/fixtures?live=${leagueIds.join('-')}`, {
        headers: { 'x-apisports-key': apiKey },
      });
      if (!res.ok) throw new Error(`API-Football answered ${res.status}`);
      return res.json();
    },
  };
}
