/**
 * The app's only view of the backend. Sign-in (`me`), the club picker and favorites are real calls to the
 * Hono API; the rest still answers from mock data and becomes a real call as each ticket lands.
 */
import { LEAGUES, matchDetail, VERSION_CONFIG } from '@/domain/mock';
import type {
  Fixture,
  League,
  LeagueId,
  MatchDetail,
  Standings,
  Team,
  VersionConfig,
} from '@/domain/types';
import { dayBoundsUtc } from '@/lib/dates';
import { teamColor } from '@/lib/team-color';

const delay = <T,>(value: T, ms = 120): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787';

interface ServerTeam {
  id: number;
  name: string;
  shortName: string;
  code: string;
  crestUrl: string | null;
}

const toTeam = (t: ServerTeam): Team => ({ ...t, color: teamColor(t.id) });

async function call<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json();
}

export const api = {
  /** Real call: creates the user's row on first sign-in and returns it. Proves app -> Clerk -> Worker -> Neon. */
  me: async (token: string): Promise<{ user: { id: string } }> => {
    const res = await fetch(`${API_URL}/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`/me failed: ${res.status}`);
    return res.json();
  },

  leagues: (): Promise<League[]> => delay(LEAGUES),

  /** Real call: fixtures and results for one local date, optionally for one league. Past dates are the results. */
  fixtures: async (token: string, date: string, leagueId?: LeagueId): Promise<Fixture[]> => {
    const { from, to } = dayBoundsUtc(date);
    const league = leagueId ? `&league=${leagueId}` : '';
    const body = await call<{ fixtures: Fixture[] }>(token, `/fixtures?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${league}`);
    return body.fixtures;
  },

  /** Real call: matches in play or at halftime now. */
  live: async (token: string, leagueId?: LeagueId): Promise<Fixture[]> => {
    const body = await call<{ fixtures: Fixture[] }>(token, `/live${leagueId ? `?league=${leagueId}` : ''}`);
    return body.fixtures;
  },

  match: (id: number): Promise<MatchDetail | null> => delay(matchDetail(id)),

  /** Real call: the stored table of a league. Empty until the snapshot job has synced it. */
  standings: async (token: string, leagueId: LeagueId): Promise<Standings> => {
    const { standings } = await call<{ standings: Omit<Standings, 'updatedAt'> & { updatedAt: string | null } }>(token, `/standings/${leagueId}`);
    return { ...standings, updatedAt: standings.updatedAt ?? '' };
  },

  /** Real call: clubs for the picker. A team's id is its API-Football id (what the server stores favorites by). */
  teams: async (token: string, query: string): Promise<Team[]> => {
    const body = await call<{ teams: ServerTeam[] }>(token, `/teams?q=${encodeURIComponent(query.trim())}`);
    return body.teams.map(toTeam);
  },

  /** Real call: the signed-in user's favorite teams. */
  favorites: async (token: string): Promise<Team[]> => {
    const body = await call<{ favorites: ServerTeam[] }>(token, '/favorites');
    return body.favorites.map(toTeam);
  },

  /** Real call. Resolves false when the server says the user already has 3 favorites. */
  addFavorite: async (token: string, teamId: number): Promise<boolean> => {
    const res = await fetch(`${API_URL}/favorites/${teamId}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 409) return false;
    if (!res.ok) throw new Error(`add favorite failed: ${res.status}`);
    return true;
  },

  removeFavorite: async (token: string, teamId: number): Promise<void> => {
    const res = await fetch(`${API_URL}/favorites/${teamId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`remove favorite failed: ${res.status}`);
  },

  versionConfig: (): Promise<VersionConfig> => delay(VERSION_CONFIG),
};
