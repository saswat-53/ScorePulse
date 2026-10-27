// Bindings available to the Worker: secrets from `.dev.vars` / `wrangler secret`, plus `vars` in wrangler.jsonc.
export type Bindings = {
  DATABASE_URL: string;
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
  SENTRY_DSN: string;
  MIN_APP_VERSION: string;
  // Added in later phases: API_FOOTBALL_KEY, FOOTBALL_DATA_KEY, CLERK_WEBHOOK_SECRET
};

export type Variables = {
  userId: string;
};
