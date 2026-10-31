import type { FdMatchesResponse, FdStandingsResponse } from './snapshot';

// The five leagues the app covers (football-data.org free tier), in the order the nightly job takes them.
export const COMPETITIONS = ['PL', 'PD', 'FL1', 'BL1', 'CL'] as const;
export type Competition = (typeof COMPETITIONS)[number];

// Free tier: 10 requests a minute. The sync makes 2 per competition run, so one run never gets near it.
export function footballData(apiKey: string) {
  async function get<T>(path: string): Promise<T> {
    const res = await fetch(`https://api.football-data.org/v4/${path}`, { headers: { 'X-Auth-Token': apiKey } });
    if (!res.ok) throw new Error(`football-data.org answered ${res.status} for ${path}`);
    return res.json();
  }
  return {
    // Fixtures and results from `from` to `to` (YYYY-MM-DD).
    matches: (code: Competition, from: string, to: string) =>
      get<FdMatchesResponse>(`competitions/${code}/matches?dateFrom=${from}&dateTo=${to}`),
    standings: (code: Competition) => get<FdStandingsResponse>(`competitions/${code}/standings`),
  };
}
export type FootballData = ReturnType<typeof footballData>;
