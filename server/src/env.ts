// Bindings available to the Worker: secrets from `.dev.vars` / `wrangler secret`, plus `vars` in wrangler.jsonc.
export type Bindings = {
  DATABASE_URL: string;
  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
  SENTRY_DSN: string;
  API_FOOTBALL_KEY: string;
  FOOTBALL_DATA_KEY: string;
  // Signs Clerk's webhooks (the `whsec_...` value of the endpoint in the Clerk dashboard).
  CLERK_WEBHOOK_SECRET?: string;
};

export type Variables = {
  userId: string;
};
