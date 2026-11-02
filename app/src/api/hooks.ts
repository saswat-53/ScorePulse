import { useAppAuth } from '@/lib/use-app-auth';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import type { LeagueId } from '@/domain/types';

import { api } from './index';

export const useLeagues = () => useQuery({ queryKey: ['leagues'], queryFn: api.leagues });

/** The Clerk session token for a request. The screens using these hooks sit behind sign-in. */
function useToken() {
  const { getToken } = useAppAuth();
  return async () => (await getToken()) ?? '';
}

export const useFixtures = (date: string, leagueId?: LeagueId) => {
  const token = useToken();
  return useQuery({
    queryKey: ['fixtures', date, leagueId ?? 'all'],
    queryFn: async () => api.fixtures(await token(), date, leagueId),
    refetchInterval: 60_000, // scores and statuses change while the screen is open
  });
};

const PAGE = 30;

/** Everything ahead (`upcoming`) or already played (`results`), a page at a time, for one league or all. */
export const useFixturesScope = (scope: 'upcoming' | 'results', leagueId?: LeagueId, pageSize = PAGE) => {
  const token = useToken();
  return useInfiniteQuery({
    queryKey: ['fixtures-scope', scope, leagueId ?? 'all', pageSize],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => api.fixturesPage(await token(), scope, leagueId, pageParam, pageSize),
    getNextPageParam: (last, pages) => (last.hasMore ? pages.reduce((n, p) => n + p.fixtures.length, 0) : undefined),
    refetchInterval: 60_000,
  });
};

// The live list refreshes once a minute: the server's data changes at most every poll (5 minutes).
export const useLive = (leagueId?: LeagueId) => {
  const token = useToken();
  return useQuery({
    queryKey: ['live', leagueId ?? 'all'],
    queryFn: async () => api.live(await token(), leagueId),
    refetchInterval: 60_000,
  });
};

// A live match's timeline changes with each poll, so an open match screen refreshes once a minute.
export const useMatch = (id: number) => {
  const token = useToken();
  return useQuery({ queryKey: ['match', id], queryFn: async () => api.match(await token(), id), refetchInterval: 60_000 });
};

export const useBrowse = () => {
  const token = useToken();
  return useQuery({ queryKey: ['browse'], queryFn: async () => api.browse(await token()), staleTime: 3_600_000 });
};

export const useLeagueClubs = (code: LeagueId) => {
  const token = useToken();
  return useQuery({ queryKey: ['league-clubs', code], queryFn: async () => api.leagueClubs(await token(), code) });
};

export const useTeamFixtures = (teamId: number) => {
  const token = useToken();
  return useQuery({ queryKey: ['team', teamId], queryFn: async () => api.teamFixtures(await token(), teamId) });
};

export const useStandings = (leagueId: LeagueId) => {
  const token = useToken();
  return useQuery({ queryKey: ['standings', leagueId], queryFn: async () => api.standings(await token(), leagueId) });
};

export const useTeams = (query: string) => {
  const token = useToken();
  return useQuery({ queryKey: ['teams', query], queryFn: async () => api.teams(await token(), query) });
};

export const useVersionConfig = () =>
  useQuery({ queryKey: ['version-config'], queryFn: api.versionConfig });
