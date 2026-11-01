/**
 * The app's only view of the backend. Sign-in (`me`), the club picker, favorites and follows are real calls to the
 * Hono API; the rest still answers from mock data and becomes a real call as each ticket lands.
 */
import { LEAGUES } from '@/domain/mock';
import type {
  AlertSettings,
  BrowseLeague,
  BrowseTree,
  Fixture,
  League,
  LeagueId,
  MatchDetail,
  StandingRow,
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

// The server sends no team colour, so every call that carries teams adds it here, the same as the club picker does.
type WithServerTeams<T> = Omit<T, 'home' | 'away'> & { home: ServerTeam; away: ServerTeam };
const withColors = <T extends { home: Team; away: Team }>(f: WithServerTeams<T>): T => ({ ...f, home: toTeam(f.home), away: toTeam(f.away) }) as unknown as T;

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
    const body = await call<{ fixtures: WithServerTeams<Fixture>[] }>(token, `/fixtures?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${league}`);
    return body.fixtures.map(withColors<Fixture>);
  },

  /** Real call: matches in play or at halftime now. */
  live: async (token: string, leagueId?: LeagueId): Promise<Fixture[]> => {
    const body = await call<{ fixtures: WithServerTeams<Fixture>[] }>(token, `/live${leagueId ? `?league=${leagueId}` : ''}`);
    return body.fixtures.map(withColors<Fixture>);
  },

  /** Real call: one match with its timeline (empty and locked when it is not live-tracked). Null when unknown. */
  match: async (token: string, id: number): Promise<MatchDetail | null> => {
    const res = await fetch(`${API_URL}/matches/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`/matches/${id} failed: ${res.status}`);
    return withColors<MatchDetail>(((await res.json()) as { match: WithServerTeams<MatchDetail> }).match);
  },

  /** Real call: the stored table of a league. Empty until the snapshot job has synced it. */
  standings: async (token: string, leagueId: LeagueId): Promise<Standings> => {
    const { standings } = await call<{
      standings: Omit<Standings, 'updatedAt' | 'rows'> & { updatedAt: string | null; rows: (Omit<StandingRow, 'team'> & { team: ServerTeam })[] };
    }>(token, `/standings/${leagueId}`);
    return { ...standings, updatedAt: standings.updatedAt ?? '', rows: standings.rows.map((r) => ({ ...r, team: toTeam(r.team) })) };
  },

  /** Real call: the world competitions and the countries with their leagues. */
  browse: (token: string): Promise<BrowseTree> => call<BrowseTree>(token, '/browse'),

  /** Real call: the clubs in a league's newest stored table, in name order. Empty before the daily update has run. */
  leagueClubs: async (token: string, code: LeagueId): Promise<{ league: BrowseLeague; teams: Team[] }> => {
    const body = await call<{ league: BrowseLeague; teams: ServerTeam[] }>(token, `/leagues/${code}/teams`);
    return { league: body.league, teams: body.teams.map(toTeam) };
  },

  /** Real call: a team's season, from the stored tables, oldest first. Null for a team the server does not know. */
  teamFixtures: async (token: string, teamId: number): Promise<{ team: Team; fixtures: Fixture[] } | null> => {
    const res = await fetch(`${API_URL}/teams/${teamId}/fixtures`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`/teams/${teamId}/fixtures failed: ${res.status}`);
    const body = (await res.json()) as { team: ServerTeam; fixtures: WithServerTeams<Fixture>[] };
    return { team: toTeam(body.team), fixtures: body.fixtures.map(withColors<Fixture>) };
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

  /** Real call: which alerts the user wants. Goals and full time are on until changed. */
  alertSettings: async (token: string): Promise<AlertSettings> => (await call<{ alerts: AlertSettings }>(token, '/settings')).alerts,

  /** Real call: saves one or more alert toggles and returns all of them. */
  saveAlertSettings: async (token: string, changes: Partial<AlertSettings>): Promise<AlertSettings> => {
    const res = await fetch(`${API_URL}/settings`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
    if (!res.ok) throw new Error(`save settings failed: ${res.status}`);
    return ((await res.json()) as { alerts: AlertSettings }).alerts;
  },

  /** Real call: deletes the account on the server (rows first, then the Clerk user). Throws if any part failed, and a retry finishes it. */
  deleteAccount: async (token: string): Promise<void> => {
    const res = await fetch(`${API_URL}/me`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`delete account failed: ${res.status}`);
  },

  /** Real call: registers this device's push token under the signed-in account. */
  registerDevice: async (token: string, pushToken: string): Promise<void> => {
    const res = await fetch(`${API_URL}/devices`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: pushToken }),
    });
    if (!res.ok) throw new Error(`register device failed: ${res.status}`);
  },

  /** Real call: removes this device's token only. Called on sign-out, while the session token is still valid. */
  unregisterDevice: async (token: string, pushToken: string): Promise<void> => {
    const res = await fetch(`${API_URL}/devices?token=${encodeURIComponent(pushToken)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`unregister device failed: ${res.status}`);
  },

  /** Real call: the fixture ids the user follows whose match is not over. */
  follows: async (token: string): Promise<number[]> => (await call<{ follows: number[] }>(token, '/follows')).follows,

  /** Real call. `full`: the user already has 2 active follows. `over`: the match has ended. */
  follow: async (token: string, fixtureId: number): Promise<'ok' | 'full' | 'over'> => {
    const res = await fetch(`${API_URL}/follows/${fixtureId}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 409) return ((await res.json()) as { error: string }).error === 'match_over' ? 'over' : 'full';
    if (!res.ok) throw new Error(`follow failed: ${res.status}`);
    return 'ok';
  },

  unfollow: async (token: string, fixtureId: number): Promise<void> => {
    const res = await fetch(`${API_URL}/follows/${fixtureId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`unfollow failed: ${res.status}`);
  },

  /** Real call, no sign-in needed: the minimum and latest app versions and the download page, set by the owner in Neon. */
  versionConfig: async (): Promise<VersionConfig> => {
    const res = await fetch(`${API_URL}/config`);
    if (!res.ok) throw new Error(`/config failed: ${res.status}`);
    return res.json();
  },
};
