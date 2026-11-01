import type { StoredLineupPlayer } from './db/schema';

// The parts of API-Football's `fixtures/lineups` and `fixtures/statistics` responses the app reads.
type ApiPlayer = { player: { id: number; name: string; number: number; pos: string; grid: string | null } };
export type LineupsResponse = {
  response: {
    team: { id: number };
    coach?: { name: string | null } | null;
    formation?: string | null;
    startXI: ApiPlayer[];
    substitutes: ApiPlayer[];
  }[];
};
export type StatisticsResponse = {
  response: { team: { id: number }; statistics: { type: string; value: number | string | null }[] }[];
};

export type ParsedLineup = {
  teamId: number;
  formation: string | null;
  coach: string | null;
  starters: StoredLineupPlayer[];
  substitutes: StoredLineupPlayer[];
};

const POSITIONS = new Set(['G', 'D', 'M', 'F']);

const toPlayer = ({ player }: ApiPlayer): StoredLineupPlayer => ({
  id: player.id,
  name: player.name,
  number: player.number,
  // The API gives a position for every listed player; anything unexpected is shown as a midfielder rather than dropped.
  position: (POSITIONS.has(player.pos) ? player.pos : 'M') as StoredLineupPlayer['position'],
  grid: player.grid,
});

// An empty response means the lineups are not announced yet.
export function parseLineups(res: LineupsResponse): ParsedLineup[] {
  return res.response.map((l) => ({
    teamId: l.team.id,
    formation: l.formation ?? null,
    coach: l.coach?.name ?? null,
    starters: l.startXI.map(toPlayer),
    substitutes: l.substitutes.map(toPlayer),
  }));
}

// The eight rows of the match screen, in order: our key, its label, API-Football's name for it, and whether it is a percentage.
const STATS = [
  { key: 'possession', label: 'Possession', api: 'Ball Possession', unit: '%' },
  { key: 'shots', label: 'Shots', api: 'Total Shots', unit: null },
  { key: 'shots-on-target', label: 'Shots on target', api: 'Shots on Goal', unit: null },
  { key: 'corners', label: 'Corners', api: 'Corner Kicks', unit: null },
  { key: 'fouls', label: 'Fouls', api: 'Fouls', unit: null },
  { key: 'yellow-cards', label: 'Yellow cards', api: 'Yellow Cards', unit: null },
  { key: 'offsides', label: 'Offsides', api: 'Offsides', unit: null },
  { key: 'pass-accuracy', label: 'Pass accuracy', api: 'Passes %', unit: '%' },
] as const;

// "38%" -> 38, 9 -> 9. A missing value (the API sends null for a statistic it has not counted) is 0.
const toNumber = (value: number | string | null | undefined) => {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
};

export function parseStats(res: StatisticsResponse): { teamId: number; stats: Record<string, number> }[] {
  return res.response.map((t) => {
    const byName = new Map(t.statistics.map((s) => [s.type, s.value]));
    return { teamId: t.team.id, stats: Object.fromEntries(STATS.map((s) => [s.key, toNumber(byName.get(s.api))])) };
  });
}

export const toStatRows = (home: Record<string, number>, away: Record<string, number>) =>
  STATS.map((s) => ({ key: s.key, label: s.label, home: home[s.key] ?? 0, away: away[s.key] ?? 0, unit: s.unit as '%' | null }));
