/**
 * Signed-in state, favorites, follows and alert settings. Held in memory for now: sign-in is a
 * stub and nothing is saved. Clerk and the server replace the internals later; the hook's shape
 * stays the same.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { PROFILE } from '@/domain/mock';
import { MAX_FAVORITES, type AlertSettings, type Profile } from '@/domain/types';

interface Session {
  signedIn: boolean;
  profile: Profile;
  followedIds: number[];
  signIn: () => void;
  signOut: () => void;
  /** Returns false when the team would exceed the favorites limit. */
  toggleFavorite: (teamId: number) => boolean;
  toggleFollow: (fixtureId: number) => void;
  setAlert: (key: keyof AlertSettings, value: boolean) => void;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(false);
  const [profile, setProfile] = useState<Profile>(PROFILE);
  const [followedIds, setFollowedIds] = useState<number[]>([]);

  const value = useMemo<Session>(
    () => ({
      signedIn,
      profile,
      followedIds,
      signIn: () => setSignedIn(true),
      signOut: () => {
        setSignedIn(false);
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
    [signedIn, profile, followedIds],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
