/**
 * Sample data for building the screens before the backend exists. All names, scores and
 * numbers are made up. Everything is typed against `types.ts`, the same contract the real API
 * will follow. Dates are relative to now, so "today" always has matches.
 */
import type {
  Fixture,
  FixtureStatus,
  League,
  LeagueId,
  Lineup,
  LineupPlayer,
  MatchDetail,
  MatchEvent,
  Position,
  Profile,
  StandingRow,
  Standings,
  StatRow,
  Team,
  VersionConfig,
} from './types';

export const LEAGUES: League[] = [
  { id: 'CL', name: 'Champions League', shortName: 'Champions League' },
  { id: 'PL', name: 'Premier League', shortName: 'Premier League' },
  { id: 'PD', name: 'La Liga', shortName: 'La Liga' },
  { id: 'FL1', name: 'Ligue 1', shortName: 'Ligue 1' },
  { id: 'BL1', name: 'Bundesliga', shortName: 'Bundesliga' },
];

const T = (id: number, name: string, code: string, color: string, shortName = name): Team => ({
  id,
  name,
  shortName,
  code,
  crestUrl: null,
  color,
});

export const TEAMS: Team[] = [
  T(1, 'Real Madrid', 'RMA', '#FEBE10'),
  T(2, 'Manchester City', 'MCI', '#6CABDD', 'Man City'),
  T(3, 'Bayern Munich', 'BAY', '#DC052D', 'Bayern'),
  T(4, 'Juventus', 'JUV', '#E8E8E8'),
  T(5, 'Chelsea', 'CHE', '#2F6BD6'),
  T(6, 'AC Milan', 'MIL', '#D4141C', 'Milan'),
  T(7, 'Inter', 'INT', '#1D4FA3'),
  T(8, 'Benfica', 'BEN', '#E83030'),
  T(9, 'Paris Saint-Germain', 'PSG', '#2F6BD6', 'PSG'),
  T(10, 'Newcastle United', 'NEW', '#D0D5E2', 'Newcastle'),
  T(11, 'Liverpool', 'LIV', '#C8102E'),
  T(12, 'Barcelona', 'BAR', '#A50044'),
  T(13, 'Arsenal', 'ARS', '#EF0107'),
  T(14, 'Tottenham Hotspur', 'TOT', '#9AA6C4', 'Tottenham'),
  T(15, 'Sevilla', 'SEV', '#D4141C'),
  T(16, 'Valencia', 'VAL', '#F6A800'),
  T(17, 'Lyon', 'LYO', '#1B3F94'),
  T(18, 'Borussia Dortmund', 'BVB', '#FDE100', 'Dortmund'),
  T(19, 'Manchester United', 'MUN', '#DA291C', 'Man United'),
  T(20, 'Aston Villa', 'AVL', '#7B2D52'),
  T(21, 'Brighton', 'BHA', '#3B8FE0'),
  T(22, 'West Ham', 'WHU', '#8E3B5A'),
  T(23, 'Bayer Leverkusen', 'B04', '#E32221', 'Leverkusen'),
  T(24, 'Marseille', 'OM', '#2FB5E8'),
  T(25, 'Atlético Madrid', 'ATM', '#CB3524', 'Atlético'),
  T(26, 'RB Leipzig', 'RBL', '#DD0741', 'Leipzig'),
];

export const team = (id: number): Team => {
  const found = TEAMS.find((t) => t.id === id);
  if (!found) throw new Error(`Unknown team ${id}`);
  return found;
};

/** Kickoff `dayOffset` days from today at a local time, as an ISO UTC string. */
const at = (dayOffset: number, hhmm: string): string => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

interface Seed {
  id: number;
  league: LeagueId;
  round: string;
  day: number;
  time: string;
  status: FixtureStatus;
  minute?: number;
  home: number;
  away: number;
  score?: [number, number];
  venue: string;
  tracking: 'live' | 'snapshot';
  paused?: boolean;
}

const fixture = (s: Seed): Fixture => ({
  id: s.id,
  leagueId: s.league,
  round: s.round,
  kickoffUtc: at(s.day, s.time),
  status: s.status,
  minute: s.minute ?? null,
  home: team(s.home),
  away: team(s.away),
  score: s.score ? { home: s.score[0], away: s.score[1] } : { home: null, away: null },
  venue: s.venue,
  tracking: s.tracking,
  paused: s.paused ?? false,
  updatedAt: s.tracking === 'live' ? ago(s.paused ? 6 : 1) : ago(60 * 12),
  source: s.tracking === 'live' ? 'api-football' : 'football-data',
});

const GROUP = 'Group Stage';

const SEEDS: Seed[] = [
  // Live today
  { id: 1001, league: 'CL', round: GROUP, day: 0, time: '19:00', status: 'live', minute: 67, home: 1, away: 2, score: [1, 1], venue: 'Santiago Bernabéu', tracking: 'live' },
  { id: 1002, league: 'CL', round: GROUP, day: 0, time: '19:30', status: 'live', minute: 28, home: 3, away: 4, score: [2, 0], venue: 'Allianz Arena', tracking: 'live' },
  { id: 1004, league: 'CL', round: GROUP, day: 0, time: '19:15', status: 'live', minute: 52, home: 11, away: 12, score: [1, 0], venue: 'Anfield', tracking: 'live', paused: true },
  // Upcoming
  { id: 1003, league: 'CL', round: GROUP, day: 0, time: '22:00', status: 'scheduled', home: 5, away: 6, venue: 'Stamford Bridge', tracking: 'snapshot' },
  { id: 1005, league: 'CL', round: GROUP, day: 0, time: '22:00', status: 'scheduled', home: 7, away: 8, venue: 'San Siro', tracking: 'snapshot' },
  { id: 1006, league: 'CL', round: GROUP, day: 1, time: '20:00', status: 'scheduled', home: 9, away: 10, venue: 'Parc des Princes', tracking: 'snapshot' },
  { id: 1007, league: 'PL', round: 'Matchday 9', day: 1, time: '15:00', status: 'scheduled', home: 13, away: 14, venue: 'Emirates Stadium', tracking: 'snapshot' },
  { id: 1008, league: 'PL', round: 'Matchday 9', day: 1, time: '17:30', status: 'scheduled', home: 19, away: 20, venue: 'Old Trafford', tracking: 'snapshot' },
  { id: 1009, league: 'PD', round: 'Matchday 9', day: 2, time: '21:00', status: 'scheduled', home: 12, away: 16, venue: 'Estadi Olímpic', tracking: 'snapshot' },
  { id: 1010, league: 'BL1', round: 'Matchday 7', day: 2, time: '18:30', status: 'scheduled', home: 18, away: 23, venue: 'Signal Iduna Park', tracking: 'snapshot' },
  { id: 1011, league: 'FL1', round: 'Matchday 8', day: 3, time: '21:00', status: 'scheduled', home: 24, away: 17, venue: 'Vélodrome', tracking: 'snapshot' },
  // Results, yesterday
  { id: 2001, league: 'PL', round: 'Matchday 8', day: -1, time: '15:00', status: 'finished', home: 2, away: 13, score: [2, 1], venue: 'Etihad Stadium', tracking: 'snapshot' },
  { id: 2002, league: 'PL', round: 'Matchday 8', day: -1, time: '17:30', status: 'finished', home: 11, away: 5, score: [3, 0], venue: 'Anfield', tracking: 'snapshot' },
  { id: 2003, league: 'PL', round: 'Matchday 8', day: -1, time: '19:45', status: 'finished', home: 14, away: 10, score: [1, 1], venue: 'Tottenham Hotspur Stadium', tracking: 'snapshot' },
  { id: 2004, league: 'PD', round: 'Matchday 8', day: -1, time: '18:00', status: 'finished', home: 1, away: 15, score: [2, 0], venue: 'Santiago Bernabéu', tracking: 'snapshot' },
  { id: 2005, league: 'PD', round: 'Matchday 8', day: -1, time: '20:30', status: 'finished', home: 12, away: 16, score: [1, 1], venue: 'Estadi Olímpic', tracking: 'snapshot' },
  { id: 2006, league: 'FL1', round: 'Matchday 7', day: -1, time: '21:00', status: 'finished', home: 9, away: 17, score: [3, 1], venue: 'Parc des Princes', tracking: 'snapshot' },
  // Results, two days ago
  { id: 2007, league: 'BL1', round: 'Matchday 6', day: -2, time: '18:30', status: 'finished', home: 3, away: 26, score: [4, 2], venue: 'Allianz Arena', tracking: 'snapshot' },
  { id: 2008, league: 'PL', round: 'Matchday 8', day: -2, time: '16:00', status: 'finished', home: 21, away: 22, score: [0, 2], venue: 'Amex Stadium', tracking: 'snapshot' },
];

export const FIXTURES: Fixture[] = SEEDS.map(fixture);

// ---------------------------------------------------------------------------------------------
// Match details

let eventSeq = 0;
const ev = (
  fixtureId: number,
  minute: number,
  teamId: number,
  type: MatchEvent['type'],
  detail: MatchEvent['detail'],
  player: string,
  related: string | null = null,
  scoreAfter: [number, number] | null = null,
): MatchEvent => ({
  id: `${fixtureId}:${minute}:${teamId}:${type}:${detail}:${++eventSeq}`,
  minute,
  extra: null,
  teamId,
  type,
  detail,
  player,
  related,
  scoreAfter: scoreAfter ? { home: scoreAfter[0], away: scoreAfter[1] } : null,
  removed: false,
});

const EVENTS: Record<number, MatchEvent[]> = {
  1001: [
    ev(1001, 21, 1, 'card', 'yellow-card', 'Aurélien Tchouaméni'),
    ev(1001, 33, 1, 'goal', 'normal-goal', 'Vinícius Júnior', 'Jude Bellingham', [1, 0]),
    ev(1001, 48, 2, 'substitution', 'substitution', 'Jack Grealish', 'Julián Álvarez'),
    ev(1001, 58, 2, 'goal', 'normal-goal', 'Phil Foden', 'Kevin De Bruyne', [1, 1]),
    ev(1001, 62, 2, 'card', 'yellow-card', 'Rúben Dias'),
    ev(1001, 67, 1, 'substitution', 'substitution', 'Rodrygo', 'Brahim Díaz'),
  ],
  1002: [
    ev(1002, 12, 3, 'goal', 'normal-goal', 'Harry Kane', 'Jamal Musiala', [1, 0]),
    ev(1002, 25, 3, 'goal', 'penalty', 'Harry Kane', null, [2, 0]),
  ],
  1004: [ev(1004, 40, 11, 'goal', 'normal-goal', 'Mohamed Salah', 'Trent Alexander-Arnold', [1, 0])],
};

const P = (
  id: number,
  name: string,
  number: number,
  position: Position,
  grid: string | null,
): LineupPlayer => ({ id, name, number, position, grid });

const rma: Lineup = {
  teamId: 1,
  formation: '4-3-3',
  coach: 'Carlo Ancelotti',
  starters: [
    P(101, 'Courtois', 1, 'G', '1:1'),
    P(102, 'Carvajal', 2, 'D', '2:1'),
    P(103, 'Militão', 3, 'D', '2:2'),
    P(104, 'Rüdiger', 22, 'D', '2:3'),
    P(105, 'Mendy', 23, 'D', '2:4'),
    P(106, 'Tchouaméni', 18, 'M', '3:1'),
    P(107, 'Valverde', 15, 'M', '3:2'),
    P(108, 'Bellingham', 5, 'M', '3:3'),
    P(109, 'Rodrygo', 11, 'F', '4:1'),
    P(110, 'Mbappé', 9, 'F', '4:2'),
    P(111, 'Vinícius', 7, 'F', '4:3'),
  ],
  substitutes: [
    P(112, 'Brahim Díaz', 21, 'M', null),
    P(113, 'Güler', 15, 'M', null),
    P(114, 'Lunin', 13, 'G', null),
    P(115, 'Camavinga', 12, 'M', null),
  ],
};

const mci: Lineup = {
  teamId: 2,
  formation: '4-3-3',
  coach: 'Pep Guardiola',
  starters: [
    P(201, 'Ederson', 31, 'G', '1:1'),
    P(202, 'Walker', 2, 'D', '2:1'),
    P(203, 'Dias', 3, 'D', '2:2'),
    P(204, 'Akanji', 25, 'D', '2:3'),
    P(205, 'Gvardiol', 24, 'D', '2:4'),
    P(206, 'Rodri', 16, 'M', '3:1'),
    P(207, 'De Bruyne', 17, 'M', '3:2'),
    P(208, 'Bernardo', 20, 'M', '3:3'),
    P(209, 'Foden', 47, 'F', '4:1'),
    P(210, 'Haaland', 9, 'F', '4:2'),
    P(211, 'Doku', 11, 'F', '4:3'),
  ],
  substitutes: [
    P(212, 'Álvarez', 19, 'F', null),
    P(213, 'Grealish', 10, 'F', null),
    P(214, 'Ortega', 18, 'G', null),
  ],
};

const stat = (key: string, label: string, home: number, away: number, unit: '%' | null = null): StatRow => ({
  key,
  label,
  home,
  away,
  unit,
});

const STATS: Record<number, StatRow[]> = {
  1001: [
    stat('possession', 'Possession', 54, 46, '%'),
    stat('shots', 'Shots', 11, 9),
    stat('shots-on-target', 'Shots on target', 4, 3),
    stat('corners', 'Corners', 6, 4),
    stat('fouls', 'Fouls', 9, 12),
    stat('yellow-cards', 'Yellow cards', 1, 1),
    stat('offsides', 'Offsides', 2, 3),
    stat('pass-accuracy', 'Pass accuracy', 89, 86, '%'),
  ],
};

export const matchDetail = (id: number): MatchDetail | null => {
  const base = FIXTURES.find((f) => f.id === id);
  if (!base) return null;
  return {
    ...base,
    events: EVENTS[id] ?? [],
    lineups: id === 1001 ? [rma, mci] : null,
    stats: STATS[id] ?? null,
    followed: false,
  };
};

// ---------------------------------------------------------------------------------------------
// Standings (made-up numbers, deterministic)

const WON = [6, 6, 5, 5, 4, 4, 3, 3, 2, 2];
const DRAWN = [1, 0, 2, 1, 3, 2, 3, 2, 4, 2];

const TABLE_TEAMS: Record<LeagueId, number[]> = {
  PL: [2, 13, 11, 5, 14, 10, 19, 20, 21, 22],
  PD: [1, 12, 25, 15, 16],
  FL1: [9, 24, 17],
  BL1: [3, 18, 23, 26],
  CL: [1, 2, 3, 11, 12, 9, 7, 13],
};

export const standings = (leagueId: LeagueId): Standings => {
  const rows: StandingRow[] = TABLE_TEAMS[leagueId].map((teamId, i) => {
    const won = WON[i] ?? 1;
    const drawn = DRAWN[i] ?? 1;
    const played = 8;
    const goalsFor = 20 - i * 2;
    const goalsAgainst = 7 + i;
    return {
      position: i + 1,
      team: team(teamId),
      played,
      won,
      drawn,
      lost: played - won - drawn,
      goalsFor,
      goalsAgainst,
      goalDifference: goalsFor - goalsAgainst,
      points: won * 3 + drawn,
      zone: leagueId !== 'CL' && i < 4 ? 'champions-league' : null,
    };
  });
  return { leagueId, season: '2026/27', rows, updatedAt: ago(60 * 12), source: 'football-data' };
};

// ---------------------------------------------------------------------------------------------

export const VERSION_CONFIG: VersionConfig = {
  minAppVersion: '1.0.0',
  latestAppVersion: '2.1.0',
  downloadPageUrl: 'https://scorepulse.vercel.app',
};

export const PROFILE: Profile = {
  name: 'Saswat Mohapatra',
  email: 'saswat@example.com',
  avatarUrl: null,
  favoriteTeamIds: [],
  alerts: { goals: true, cards: false, substitutions: false, kickoff: false, fullTime: true },
};
