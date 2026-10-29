/**
 * Signed-in state, favorites, follows and alert settings. Sign-in is real (Clerk); favorites,
 * follows and alerts are still held in memory and nothing is saved. The server replaces those
 * internals later; the hook's shape stays the same.
 */
import { useAuth } from '@clerk/expo';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api } from '@/api';

import { PROFILE } from '@/domain/mock';
import { MAX_FAVORITES, type AlertSettings, type Profile } from '@/domain/types';

interface Session {
  signedIn: boolean;
  profile: Profile;
  followedIds: number[];
  signOut: () => void;
  /** Returns false when the team would exceed the favorites limit. */
  toggleFavorite: (teamId: number) => boolean;
  toggleFollow: (fixtureId: number) => void;
  setAlert: (key: keyof AlertSettings, value: boolean) => void;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, signOut: clerkSignOut, getToken } = useAuth();
  const signedIn = !!isSignedIn;
  const [profile, setProfile] = useState<Profile>(PROFILE);
  const [followedIds, setFollowedIds] = useState<number[]>([]);

  // First sign-in creates the users row on the server. Failure is non-fatal: the app still works.
  useEffect(() => {
    if (!signedIn) return;
    getToken()
      .then((token) => (token ? api.me(token) : undefined))
      .catch((e) => console.warn('/me after sign-in failed', e));
  }, [signedIn, getToken]);

  const value = useMemo<Session>(
    () => ({
      signedIn,
      profile,
      followedIds,
      signOut: () => {
        void clerkSignOut();
        setProfile(PROFILE);
        setFollowedIds([]);
      },
      toggleFavorite: (teamId) => {
        const has = profile.favoriteTeamIds.includes(teamId);
        if (!has && profile.favoriteTeamIds.length >= MAX_FAVORITES) return false;
        setProfile((p) => ({
          ...p,
          favoriteTeamIds: has
            ? p.favoriteTeamIds.filter((id) => id !== teamId)
            : [...p.favoriteTeamIds, teamId],
        }));
        return true;
      },
      toggleFollow: (fixtureId) =>
        setFollowedIds((ids) =>
          ids.includes(fixtureId) ? ids.filter((id) => id !== fixtureId) : [...ids, fixtureId],
        ),
      setAlert: (key, v) => setProfile((p) => ({ ...p, alerts: { ...p.alerts, [key]: v } })),
    }),
    [signedIn, profile, followedIds, clerkSignOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
