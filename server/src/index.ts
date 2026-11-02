import * as Sentry from '@sentry/cloudflare';
import { getDb } from './db/client';
import { createApp } from './app';
import { apiFootball } from './poller/api-football';
import { runArchive } from './poller/archive';
import { expoPush } from './poller/expo';
import { runPoller } from './poller/run-poller';
import { routeScheduled } from './schedule';
import { footballData } from './sync/football-data';
import { runSync } from './sync/run-sync';
import type { Bindings } from './env';

const app = createApp((env) => getDb(env.DATABASE_URL));

export default Sentry.withSentry(
  (env: Bindings) => ({
    // No DSN on a developer's machine (DEV_AUTH_BYPASS is only ever set in .dev.vars), so local errors stay out of Sentry.
    dsn: env.DEV_AUTH_BYPASS === 'true' ? undefined : env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    // No IP address or other user identity goes out with a report (#18).
    dataCollection: { userInfo: false },
  }),
  {
    fetch: app.fetch,

    async scheduled(controller, env) {
      const now = new Date(controller.scheduledTime);
      const db = getDb(env.DATABASE_URL);
      const route = routeScheduled(controller.cron, now);
      // The snapshot sync runs five times, five minutes apart, one league each (wrangler.jsonc).
      if (route.job === 'sync') {
        await runSync({ db, footballData: footballData(env.FOOTBALL_DATA_KEY) }, route.slot, now);
        return;
      }
      // The rest of the early morning, when nothing is live: fetch the details of one finished match (#23).
      if (route.job === 'archive') {
        await runArchive({ db, provider: apiFootball(env.API_FOOTBALL_KEY) }, now);
        return;
      }
      // The poller's crons only fire in the matchday windows; the poller itself decides whether a run is due.
      await runPoller(
        {
          db,
          push: expoPush(),
          provider: apiFootball(env.API_FOOTBALL_KEY),
          fallback: { fetchLiveScores: () => footballData(env.FOOTBALL_DATA_KEY).liveScores() },
        },
        now,
      );
    },
  } satisfies ExportedHandler<Bindings>,
);
