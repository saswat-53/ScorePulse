import { verifyToken } from '@clerk/backend';
import * as Sentry from '@sentry/cloudflare';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { getDb } from './db/client';
import { users } from './db/schema';
import type { Bindings, Variables } from './env';

type AppEnv = { Bindings: Bindings; Variables: Variables };

// Verifies the Clerk session token sent by the app as `Authorization: Bearer <token>`.
const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return c.json({ error: 'Missing token' }, 401);

  // Clerk v3 returns `{ data, errors }` instead of throwing, so narrow on the result before using it.
  const result = await verifyToken(token, { secretKey: c.env.CLERK_SECRET_KEY });
  if (result.errors) return c.json({ error: 'Invalid token' }, 401);

  // The payload type resolves to `unknown` under this TS setup, so read `sub` (the Clerk user id) explicitly.
  const userId = (result.data as { sub?: string }).sub;
  if (!userId) return c.json({ error: 'Invalid token' }, 401);

  c.set('userId', userId);
  await next();
});

const app = new Hono<AppEnv>()
  // Public: uptime check and the app's launch-time version gate.
  .get('/health', (c) => c.json({ ok: true, minAppVersion: c.env.MIN_APP_VERSION }))

  // Protected: creates the users row on first sign-in, then reads it back from Neon.
  // This one call proves the chain: app -> Clerk token -> Worker -> Neon.
  .get('/me', requireAuth, async (c) => {
    const db = getDb(c.env.DATABASE_URL);
    const userId = c.get('userId');
    await db.insert(users).values({ id: userId }).onConflictDoNothing();
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    return c.json({ user });
  })

  // Phase 1 only: a deliberate error to confirm Sentry receives server exceptions.
  // Behind auth so strangers cannot burn the Sentry event quota. Remove before launch.
  .get('/debug/sentry', requireAuth, () => {
    throw new Error('ScorePulse server test error (Phase 1 Sentry check)');
  });

// The app imports this type only (`import type { AppType }`) for a typed Hono client.
export type AppType = typeof app;

export default Sentry.withSentry(
  (env: Bindings) => ({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 0.1,
  }),
  {
    fetch: app.fetch,

    // Phase 1: proves the cron trigger fires. Phase 4 replaces this with the poller,
    // which reads `poll_state` and exits at once unless a poll is due.
    async scheduled(controller) {
      console.log(`cron fired at ${new Date(controller.scheduledTime).toISOString()}`);
    },
  } satisfies ExportedHandler<Bindings>,
);
