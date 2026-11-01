/**
 * Signed-in state, favorites, follows and alert settings. Sign-in, favorites and follows are real (Clerk and the
 * server, which holds the 3-favorite and 2-active-follow caps); alert toggles and the push token are saved on the server too.
 * The server replaces those internals later; the hook's shape stays the same.
 */
import { useUser } from '@clerk/expo';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { api } from '@/api';

import { PROFILE } from '@/domain/mock';
import { askForPushPermission, getPushToken } from '@/lib/push';
import { useAppAuth } from '@/lib/use-app-auth';
import { MAX_ACTIVE_FOLLOWS, type AlertSettings, type Profile, type Team } from '@/domain/types';

interface Session {
  /** False until Clerk has worked out whether anyone is signed in. Until then `signedIn` is not an answer yet. */
  authLoaded: boolean;
  signedIn: boolean;
  profile: Profile;
  /** The favorite teams, with names, in the order added. */
  favoriteTeams: Team[];
  /** `loading` until the server answers, so onboarding does not flash; `error` when it could not be reached (retry). */
  favoritesStatus: 'loading' | 'ready' | 'error';
  retryFavorites: () => void;
  /** The matches the user follows that are not over. */
  followedIds: number[];
  /** False once the user has the most active follows; the control is disabled and the server would refuse anyway. */
  canFollowMore: boolean;
  signOut: () => void;
  /** Deletes the account everywhere (the server removes the data and the Clerk user), then signs out. False if it could not finish; trying again is safe. */
  deleteAccount: () => Promise<boolean>;
  /** Adds or removes a favorite. Resolves false when the server refuses a 4th (the cap is the server's). */
  toggleFavorite: (team: Team) => Promise<boolean>;
  /** Follows or unfollows. `full` and `over` are the server's refusals; `error` means it could not be reached. */
  toggleFollow: (fixtureId: number) => Promise<'ok' | 'full' | 'over' | 'error'>;
  /** Saves a toggle on the server, showing it at once and undoing it if the server cannot be reached. */
  setAlert: (key: keyof AlertSettings, value: boolean) => Promise<void>;
  /** Asks the system for notification permission and, if given, registers this device. True when alerts can arrive. */
  enableNotifications: () => Promise<boolean>;
}

const SessionContext = createContext<Session | null>(null);
const NO_TEAMS: Team[] = [];
const NO_IDS: number[] = [];

export function SessionProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, signOut: clerkSignOut, getToken: clerkGetToken, isDev } = useAppAuth();
  // Clerk can hand back a new `getToken` on every render. The loads below depend on it, so each one that saved its
  // result would re-render, get a new function and load again, without end. This one never changes: it always calls
  // the latest.
  const latestGetToken = useRef(clerkGetToken);
  useEffect(() => {
    latestGetToken.current = clerkGetToken;
  });
  const getToken = useCallback(() => latestGetToken.current(), []);
  const signedIn = !!isSignedIn;
  const { user } = useUser();
  const [profile, setProfile] = useState<Profile>(PROFILE);
  // What the server last said, and for whom. Tying it to a user id means another account (or a session that
  // expired) never sees the previous user's clubs, with no reset step to forget.
  const [loaded, setLoaded] = useState<{ userId: string; teams: Team[] } | null>(null);
  const [failed, setFailed] = useState<{ userId: string; attempt: number } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const favoriteTeams = userId && loaded?.userId === userId ? loaded.teams : NO_TEAMS;
  const favoritesStatus: Session['favoritesStatus'] =
    userId && loaded?.userId === userId ? 'ready' : failed?.userId === userId && failed?.attempt === attempt ? 'error' : 'loading';
  // Tied to a user id like the favorites, so another account never sees the previous user's follows.
  const [followed, setFollowed] = useState<{ userId: string; ids: number[] } | null>(null);
  const followedIds = userId && followed?.userId === userId ? followed.ids : NO_IDS;

  // The token this device registered, kept so signing out can remove exactly that one.
  const pushToken = useRef<string | null>(null);

  // Registers this device's push token under the signed-in account (#13). With no permission yet there is no token.
  const registerDevice = useCallback(async () => {
    const [pushed, token] = await Promise.all([getPushToken(), getToken()]);
    if (!pushed || !token) return false;
    await api.registerDevice(token, pushed);
    pushToken.current = pushed;
    return true;
  }, [getToken]);

  // A signed-in device that already has permission registers at once.
  useEffect(() => {
    if (!signedIn) return;
    registerDevice().catch((e) => console.warn('device registration failed', e));
  }, [signedIn, registerDevice]);

  // The alert toggles live on the server too, tied to the user like the favorites (#14).
  const [alertState, setAlertState] = useState<{ userId: string; alerts: AlertSettings } | null>(null);
  useEffect(() => {
    if (!userId) return;
    let stale = false;
    getToken()
      .then((token) => (token ? api.alertSettings(token) : Promise.reject(new Error('no token'))))
      .then((alerts) => {
        if (!stale) setAlertState({ userId, alerts });
      })
      .catch((e) => console.warn('alert settings load failed', e));
    return () => {
      stale = true;
    };
  }, [userId, getToken]);
  const alerts = userId && alertState?.userId === userId ? alertState.alerts : profile.alerts;

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

  // The follows live on the server too. A failed load leaves the list empty; the server still holds the cap.
  useEffect(() => {
    if (!userId) return;
    let stale = false;
    getToken()
      .then((token) => (token ? api.follows(token) : Promise.reject(new Error('no token'))))
      .then((ids) => {
        if (!stale) setFollowed({ userId, ids });
      })
      .catch((e) => console.warn('follows load failed', e));
    return () => {
      stale = true;
    };
  }, [userId, getToken]);

  const value = useMemo<Session>(
    () => ({
      authLoaded: !!isLoaded,
      signedIn,
      // The name, email and picture are the Clerk account's, not placeholders.
      profile: {
        ...profile,
        name: isDev ? 'Dev tester' : (user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? 'Your account'),
        email: isDev ? 'local development sign-in' : (user?.primaryEmailAddress?.emailAddress ?? ''),
        avatarUrl: user?.imageUrl ?? null,
        favoriteTeamIds: favoriteTeams.map((t) => t.id),
        alerts,
      },
      favoriteTeams,
      favoritesStatus,
      retryFavorites: () => setAttempt((n) => n + 1),
      followedIds,
      canFollowMore: followedIds.length < MAX_ACTIVE_FOLLOWS,
      signOut: () => {
        // This device's token goes first, while the session can still prove who is asking; then the session ends.
        // A failed delete does not block signing out: the server drops the token when Expo reports it dead.
        const pushed = pushToken.current;
        pushToken.current = null;
        void (async () => {
          try {
            const token = await getToken();
            // Waits at most 3 seconds, so a bad connection cannot trap the user signed in.
            if (token && pushed) {
              await Promise.race([api.unregisterDevice(token, pushed), new Promise((resolve) => setTimeout(resolve, 3000))]);
            }
          } catch (e) {
            console.warn('device unregistration failed', e);
          }
          await clerkSignOut();
        })();
        setProfile(PROFILE);
        setFollowed(null);
      },
      deleteAccount: async () => {
        try {
          const token = await getToken();
          if (!token) return false;
          await api.deleteAccount(token);
        } catch (e) {
          console.warn('account deletion failed', e);
          return false;
        }
        // The server removed the tokens with the account; nothing is left to unregister.
        pushToken.current = null;
        setProfile(PROFILE);
        setFollowed(null);
        await clerkSignOut().catch(() => undefined); // the Clerk user is already gone, so this may complain
        return true;
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
      toggleFollow: async (fixtureId) => {
        const token = await getToken();
        if (!token || !userId) return 'error';
        const has = followedIds.includes(fixtureId);
        // Show the change at once; undo only this match's change if the server says no or cannot be reached.
        const apply = (adding: boolean) =>
          setFollowed((cur) => {
            const ids = (cur?.userId === userId ? cur.ids : []).filter((id) => id !== fixtureId);
            return { userId, ids: adding ? [...ids, fixtureId] : ids };
          });
        apply(!has);
        try {
          if (has) {
            await api.unfollow(token, fixtureId);
            return 'ok';
          }
          const result = await api.follow(token, fixtureId);
          if (result !== 'ok') apply(false);
          return result;
        } catch (e) {
          apply(has);
          console.warn('follow change failed', e);
          return 'error';
        }
      },
      setAlert: async (key, v) => {
        const token = await getToken();
        if (!token || !userId) return;
        const before = alerts[key];
        const apply = (value: boolean) =>
          setAlertState((cur) => ({ userId, alerts: { ...(cur?.userId === userId ? cur.alerts : alerts), [key]: value } }));
        apply(v);
        try {
          await api.saveAlertSettings(token, { [key]: v });
        } catch (e) {
          apply(before);
          console.warn('alert setting failed', e);
        }
      },
      enableNotifications: async () => {
        if (!(await askForPushPermission())) return false;
        try {
          return await registerDevice();
        } catch (e) {
          console.warn('device registration failed', e);
          return false;
        }
      },
    }),
    [isLoaded, signedIn, userId, user, isDev, profile, alerts, favoriteTeams, favoritesStatus, followedIds, clerkSignOut, getToken, registerDevice],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
