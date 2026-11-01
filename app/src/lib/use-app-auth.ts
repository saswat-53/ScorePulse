import { useAuth } from '@clerk/expo';

import { DEV_LOGIN_ENABLED, setDevUser, useDevUser } from './dev-login';

/** Who is signed in and how to prove it: Clerk, or the local development sign-in when that is on and in use. */
export function useAppAuth() {
  const clerk = useAuth();
  const dev = useDevUser();
  if (DEV_LOGIN_ENABLED && dev) {
    return {
      isSignedIn: true as boolean | undefined,
      userId: `user_dev_${dev}` as string | null | undefined,
      getToken: async () => `dev-${dev}` as string | null,
      signOut: async () => setDevUser(null),
      isDev: true,
    };
  }
  return { isSignedIn: clerk.isSignedIn, userId: clerk.userId, getToken: clerk.getToken, signOut: clerk.signOut, isDev: false };
}
