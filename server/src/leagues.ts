// The five leagues the app covers. The app and football-data.org call a league by its code; fixtures store
// the API-Football league id.
export const LEAGUE_CODES = ['CL', 'PL', 'PD', 'FL1', 'BL1'] as const;
export type LeagueCode = (typeof LEAGUE_CODES)[number];

export const API_FOOTBALL_LEAGUE: Record<LeagueCode, number> = { PL: 39, PD: 140, FL1: 61, BL1: 78, CL: 2 };

export const isLeagueCode = (value: string | undefined): value is LeagueCode => LEAGUE_CODES.includes(value as LeagueCode);

export const leagueCodeOf = (apiFootballLeagueId: number): LeagueCode | undefined =>
  LEAGUE_CODES.find((code) => API_FOOTBALL_LEAGUE[code] === apiFootballLeagueId);

// What the browse screens show (#26): each league's name and the country it belongs to. The Champions League has no
// country: it is the world's.
export const LEAGUE_NAME: Record<LeagueCode, string> = {
  CL: 'Champions League',
  PL: 'Premier League',
  PD: 'La Liga',
  FL1: 'Ligue 1',
  BL1: 'Bundesliga',
};
export const LEAGUE_COUNTRY: Record<LeagueCode, string | null> = { CL: null, PL: 'England', PD: 'Spain', FL1: 'France', BL1: 'Germany' };
