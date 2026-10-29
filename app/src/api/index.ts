/**
 * The app's only view of the backend. Today it answers from mock data. When the server exists,
 * each function becomes a call to the Hono API and nothing outside this folder changes.
 */
import { FIXTURES, LEAGUES, matchDetail, standings, TEAMS, VERSION_CONFIG } from '@/domain/mock';
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

const delay = <T,>(value: T, ms = 120): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

export const api = {
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

  teams: (query: string): Promise<Team[]> => {
    const q = query.trim().toLowerCase();
    return delay(TEAMS.filter((t) => !q || t.name.toLowerCase().includes(q) || t.code.toLowerCase() === q));
  },

  versionConfig: (): Promise<VersionConfig> => delay(VERSION_CONFIG),
};
