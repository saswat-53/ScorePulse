import { useSyncExternalStore } from 'react';

// Local development only: a "Dev sign-in" that skips the email code. Both must be on: the app is a development build
// (`__DEV__`, false in a release build) and EXPO_PUBLIC_DEV_LOGIN is "true" in app/.env. The server accepts the
// resulting token only if its own DEV_AUTH_BYPASS is on and the request is local (server/src/dev-auth.ts).
export const DEV_LOGIN_ENABLED = __DEV__ && process.env.EXPO_PUBLIC_DEV_LOGIN === 'true';

const KEY = 'scorepulse.devUser';
const listeners = new Set<() => void>();
let current: string | null = null;
try {
  current = globalThis.localStorage?.getItem(KEY) ?? null; // the web build keeps it across reloads
} catch {
  current = null;
}

export const devUser = () => (DEV_LOGIN_ENABLED ? current : null);

export function setDevUser(name: string | null) {
  current = name;
  try {
    if (name) globalThis.localStorage?.setItem(KEY, name);
    else globalThis.localStorage?.removeItem(KEY);
  } catch {
    // Storage is optional: the sign-in then lasts until the app restarts.
  }
  listeners.forEach((l) => l());
}

export const useDevUser = () =>
  useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    devUser,
    devUser,
  );
