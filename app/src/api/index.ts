/**
 * The app's only view of the backend. Sign-in (`me`), the club picker and favorites are real calls to the
 * Hono API; the rest still answers from mock data and becomes a real call as each ticket lands.
 */
import { FIXTURES, LEAGUES, matchDetail, standings, VERSION_CONFIG } from '@/domain/mock';
import type {
  Fixture,
  League,
  LeagueId,
  MatchDetail,
  Standings,
  Team,
  VersionConfig,
} from '@/domain/types';
import { dateKey } from '@/lib/dates';
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

  /** Fixtures and results for one local date, optionally for one league. */
  fixtures: (date: string, leagueId?: LeagueId): Promise<Fixture[]> =>
    delay(
      FIXTURES.filter(
        (f) => dateKey(f.kickoffUtc) === date && (!leagueId || f.leagueId === leagueId),
      ).sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc)),
    ),

  live: (leagueId?: LeagueId): Promise<Fixture[]> =>
    delay(
      FIXTURES.filter(
        (f) => (f.status === 'live' || f.status === 'halftime') && (!leagueId || f.leagueId === leagueId),
      ),
    ),

  match: (id: number): Promise<MatchDetail | null> => delay(matchDetail(id)),

  standings: (leagueId: LeagueId): Promise<Standings> => delay(standings(leagueId)),

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
