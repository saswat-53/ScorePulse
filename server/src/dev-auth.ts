import type { Bindings } from './env';

// Local development only: sign in as a made-up user without the email code, so the app can be tried on a laptop or a
// phone on the home network. It is off unless DEV_AUTH_BYPASS is exactly "true" in the Worker's own variables, which
// only `.dev.vars` on a developer's machine sets (never `wrangler.jsonc` or a deployed secret), and even then it only
// answers requests addressed to localhost or a private network address, never a public name.
const PRIVATE_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;
const DEV_TOKEN = /^dev-([a-z0-9_]{1,40})$/;

// The user id a dev token stands for, or null when the bypass does not apply.
export function devBypassUser(env: Bindings, requestUrl: string, token: string): string | null {
  if (env.DEV_AUTH_BYPASS !== 'true') return null;
  const match = DEV_TOKEN.exec(token);
  if (!match) return null;
  let host: string;
  try {
    host = new URL(requestUrl).hostname;
  } catch {
    return null;
  }
  return PRIVATE_HOST.test(host) ? `user_dev_${match[1]}` : null;
}
