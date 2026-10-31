/**
 * Signed-in state, favorites, follows and alert settings. Sign-in and favorites are real (Clerk and the
 * server, which holds the 3-favorite cap); follows and alerts are still held in memory and nothing is saved.
 * The server replaces those internals later; the hook's shape stays the same.
 */
import { useAuth } from '@clerk/expo';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api } from '@/api';

import { PROFILE } from '@/domain/mock';
import type { AlertSettings, Profile, Team } from '@/domain/types';

interface Session {
  signedIn: boolean;
  profile: Profile;
  /** The favorite teams, with names, in the order added. */
  favoriteTeams: Team[];
  /** `loading` until the server answers, so onboarding does not flash; `error` when it could not be reached (retry). */
  favoritesStatus: 'loading' | 'ready' | 'error';
  retryFavorites: () => void;
  followedIds: number[];
  signOut: () => void;
  /** Adds or removes a favorite. Resolves false when the server refuses a 4th (the cap is the server's). */
  toggleFavorite: (team: Team) => Promise<boolean>;
  toggleFollow: (fixtureId: number) => void;
  setAlert: (key: keyof AlertSettings, value: boolean) => void;
}

const SessionContext = createContext<Session | null>(null);
const NO_TEAMS: Team[] = [];

export function SessionProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, userId, signOut: clerkSignOut, getToken } = useAuth();
  const signedIn = !!isSignedIn;
  const [profile, setProfile] = useState<Profile>(PROFILE);
  // What the server last said, and for whom. Tying it to a user id means another account (or a session that
  // expired) never sees the previous user's clubs, with no reset step to forget.
  const [loaded, setLoaded] = useState<{ userId: string; teams: Team[] } | null>(null);
  const [failed, setFailed] = useState<{ userId: string; attempt: number } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const favoriteTeams = userId && loaded?.userId === userId ? loaded.teams : NO_TEAMS;
  const favoritesStatus: Session['favoritesStatus'] =
    userId && loaded?.userId === userId ? 'ready' : failed?.userId === userId && failed?.attempt === attempt ? 'error' : 'loading';
  const [followedIds, setFollowedIds] = useState<number[]>([]);

  // First sign-in creates the users row on the server. Failure is non-fatal: the app still works.
  useEffect(() => {
    if (!signedIn) return;
    getToken()
      .then((token) => (token ? api.me(token) : undefined))
      .catch((e) => console.warn('/me after sign-in failed', e));
  }, [signedIn, getToken]);

  // The favorites live on the server. A late answer for a previous user is ignored. A failed load is shown as an
  // error with a retry, never as "no favorites": that would send the user to onboarding, or let them past it.
  useEffect(() => {
    if (!userId) return;
    let stale = false;
    getToken()
      .then((token) => (token ? api.favorites(token) : Promise.reject(new Error('no token'))))
      .then((teams) => {
        if (!stale) setLoaded({ userId, teams });
      })
      .catch((e) => {
        console.warn('favorites load failed', e);
        if (!stale) setFailed({ userId, attempt });
      });
    return () => {
      stale = true;
    };
  }, [userId, attempt, getToken]);

  const value = useMemo<Session>(
    () => ({
      signedIn,
      profile: { ...profile, favoriteTeamIds: favoriteTeams.map((t) => t.id) },
      favoriteTeams,
      favoritesStatus,
      retryFavorites: () => setAttempt((n) => n + 1),
      followedIds,
      signOut: () => {
        void clerkSignOut();
        setProfile(PROFILE);
        setFollowedIds([]);
      },
      toggleFavorite: async (team) => {
        const token = await getToken();
        if (!token) return false;
        const has = favoriteTeams.some((t) => t.id === team.id);
        // Show the change at once; undo only this team's change if the server says no or cannot be reached.
        // Functional updates, so a second tap that landed meanwhile is not wiped out.
        const apply = (adding: boolean) =>
          setLoaded((cur) => {
            if (!cur) return cur;
            const without = cur.teams.filter((t) => t.id !== team.id);
            return { ...cur, teams: adding ? [...without, team] : without };
          });
        apply(!has);
        try {
          if (has) {
            await api.removeFavorite(token, team.id);
            return true;
          }
          const accepted = await api.addFavorite(token, team.id);
          if (!accepted) apply(false);
          return accepted;
        } catch (e) {
          apply(has);
          console.warn('favorite change failed', e);
          return false;
        }
      },
      toggleFollow: (fixtureId) =>
        setFollowedIds((ids) =>
          ids.includes(fixtureId) ? ids.filter((id) => id !== fixtureId) : [...ids, fixtureId],
        ),
      setAlert: (key, v) => setProfile((p) => ({ ...p, alerts: { ...p.alerts, [key]: v } })),
    }),
    [signedIn, profile, favoriteTeams, favoritesStatus, followedIds, clerkSignOut, getToken],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
