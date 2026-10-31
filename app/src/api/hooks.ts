import { useAuth } from '@clerk/expo';
import { useQuery } from '@tanstack/react-query';

import type { LeagueId } from '@/domain/types';

import { api } from './index';

export const useLeagues = () => useQuery({ queryKey: ['leagues'], queryFn: api.leagues });

export const useFixtures = (date: string, leagueId?: LeagueId) =>
  useQuery({ queryKey: ['fixtures', date, leagueId ?? 'all'], queryFn: () => api.fixtures(date, leagueId) });

export const useLive = (leagueId?: LeagueId) =>
  useQuery({ queryKey: ['live', leagueId ?? 'all'], queryFn: () => api.live(leagueId) });

export const useMatch = (id: number) =>
  useQuery({ queryKey: ['match', id], queryFn: () => api.match(id) });

export const useStandings = (leagueId: LeagueId) =>
  useQuery({ queryKey: ['standings', leagueId], queryFn: () => api.standings(leagueId) });

export const useTeams = (query: string) => {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ['teams', query],
    queryFn: async () => api.teams((await getToken()) ?? '', query),
  });
};

export const useVersionConfig = () =>
  useQuery({ queryKey: ['version-config'], queryFn: api.versionConfig });
