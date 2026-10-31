import * as Sentry from '@sentry/cloudflare';
import { getDb } from './db/client';
import { createApp } from './app';
import { apiFootball } from './poller/api-football';
import { runPoller } from './poller/run-poller';
import { footballData } from './sync/football-data';
import { runSync } from './sync/run-sync';
import type { Bindings } from './env';

// Must equal the snapshot job triggers in wrangler.jsonc.
const SYNC_CRONS = ['0,5,10,15,20 6 * * *', '30,35,40,45,50 23 * * *'];

const app = createApp((env) => getDb(env.DATABASE_URL));

export default Sentry.withSentry(
  (env: Bindings) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 0.1,
  }),
  {
    fetch: app.fetch,

    async scheduled(controller, env) {
      const now = new Date(controller.scheduledTime);
      const db = getDb(env.DATABASE_URL);
      // The morning and night snapshot jobs fire five times, five minutes apart, one league each (wrangler.jsonc).
      if (SYNC_CRONS.includes(controller.cron)) {
        await runSync({ db, footballData: footballData(env.FOOTBALL_DATA_KEY) }, (now.getUTCMinutes() % 30) / 5, now);
        return;
      }
      // The poller's crons only fire in the matchday windows; the poller itself decides whether a run is due.
      await runPoller(
        {
          db,
          // Placeholder until push delivery lands (#13): the alert is logged, not sent.
          push: { send: async (push) => console.log(JSON.stringify(push)) },
          provider: apiFootball(env.API_FOOTBALL_KEY),
        },
        now,
      );
    },
  } satisfies ExportedHandler<Bindings>,
);
