// The five leagues the app covers. The app and football-data.org call a league by its code; fixtures store
// the API-Football league id.
export const LEAGUE_CODES = ['CL', 'PL', 'PD', 'FL1', 'BL1'] as const;
export type LeagueCode = (typeof LEAGUE_CODES)[number];

export const API_FOOTBALL_LEAGUE: Record<LeagueCode, number> = { PL: 39, PD: 140, FL1: 61, BL1: 78, CL: 2 };

export const isLeagueCode = (value: string | undefined): value is LeagueCode => LEAGUE_CODES.includes(value as LeagueCode);

export const leagueCodeOf = (apiFootballLeagueId: number): LeagueCode | undefined =>
  LEAGUE_CODES.find((code) => API_FOOTBALL_LEAGUE[code] === apiFootballLeagueId);
