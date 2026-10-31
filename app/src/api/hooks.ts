import { useAuth } from '@clerk/expo';
import { useQuery } from '@tanstack/react-query';

import type { LeagueId } from '@/domain/types';

import { api } from './index';

export const useLeagues = () => useQuery({ queryKey: ['leagues'], queryFn: api.leagues });

/** The Clerk session token for a request. The screens using these hooks sit behind sign-in. */
function useToken() {
  const { getToken } = useAuth();
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
