import { verifyToken } from '@clerk/backend';
import { and, asc, eq, ilike, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { favoriteTeams, teamMap, users } from './db/schema';
import type { Bindings, Variables } from './env';
import { getStandings, listFixtures } from './browse';
import { isLeagueCode } from './leagues';
import { MAX_FAVORITES } from './limits';
import { MAX_MATCH_HOURS } from './poller/status';
import type { PollDb } from './poller/db';
import { getPollStatus } from './poller/quota';

const TEAMS_PAGE = 30;

// What the app shows for a team. The id is the API-Football id, which is what fixtures and live events carry.
const teamColumns = {
  id: teamMap.apiFootballId,
  name: teamMap.name,
  shortName: teamMap.shortName,
  code: teamMap.code,
  crestUrl: teamMap.crestUrl,
};

// The driver wraps the database's error, so the trigger's message can sit on the error or on its cause.
const isFavoritesFull = (e: unknown) =>
  /favorites_full/.test(`${(e as Error)?.message} ${(e as { cause?: Error })?.cause?.message}`);

type AppEnv = { Bindings: Bindings; Variables: Variables };

// Verifies the Clerk session token sent by the app as `Authorization: Bearer <token>`.
const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return c.json({ error: 'Missing token' }, 401);

  // The public verifyToken returns the token payload and throws when the token is invalid or expired.
  let userId: string | undefined;
  try {
    const payload = await verifyToken(token, { secretKey: c.env.CLERK_SECRET_KEY });
    userId = payload.sub;
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
  if (!userId) return c.json({ error: 'Invalid token' }, 401);

  c.set('userId', userId);
  await next();
});

// `getDb` is how a request gets its database: Neon in the Worker, PGlite in tests. `now` is the clock, so tests can fix it.
export function createApp(getDb: (env: Bindings) => PollDb, now: () => Date = () => new Date()) {
  return (
    new Hono<AppEnv>()
      // Public: uptime check and the app's launch-time version gate.
      .get('/health', (c) => c.json({ ok: true, minAppVersion: c.env.MIN_APP_VERSION }))

      // Public: whether polling has slowed or stopped because the day's API-Football quota is running low (#15 shows it).
      .get('/status', async (c) => c.json(await getPollStatus(getDb(c.env), new Date())))

      // Protected: creates the users row on first sign-in, then reads it back from Neon.
      // This one call proves the chain: app -> Clerk token -> Worker -> Neon.
      .get('/me', requireAuth, async (c) => {
        const db = getDb(c.env);
        const userId = c.get('userId');
        await db.insert(users).values({ id: userId }).onConflictDoNothing();
        const [user] = await db.select().from(users).where(eq(users.id, userId));
        return c.json({ user });
      })

      // Fixtures and results from stored data. The window is UTC instants (`from` inclusive, `to` exclusive): the
      // app turns the user's local day into them, so the server holds no timezone logic.
      .get('/fixtures', requireAuth, async (c) => {
        const from = new Date(c.req.query('from') ?? '');
        const to = new Date(c.req.query('to') ?? '');
        const league = c.req.query('league');
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return c.json({ error: 'invalid_window' }, 400);
        if (league !== undefined && !isLeagueCode(league)) return c.json({ error: 'invalid_league' }, 400);
        const db = getDb(c.env);
        const { paused } = await getPollStatus(db, now());
        return c.json({ fixtures: await listFixtures(db, { from, to, league }, paused) });
      })

      // Matches in play or at halftime right now.
      .get('/live', requireAuth, async (c) => {
        const league = c.req.query('league');
        if (league !== undefined && !isLeagueCode(league)) return c.json({ error: 'invalid_league' }, 400);
        const db = getDb(c.env);
        const at = now();
        const { paused } = await getPollStatus(db, at);
        // A stored status older than a match can last is stale, as the poller treats it.
        const from = new Date(at.getTime() - MAX_MATCH_HOURS * 3_600_000);
        return c.json({ fixtures: await listFixtures(db, { from, to: at, league, inPlayOnly: true }, paused) });
      })

      // The stored league table. Empty until the snapshot job has synced the league.
      .get('/standings/:league', requireAuth, async (c) => {
        const league = c.req.param('league');
        if (!isLeagueCode(league)) return c.json({ error: 'invalid_league' }, 400);
        return c.json({ standings: await getStandings(getDb(c.env), league) });
      })

      // Clubs for the picker, from team_map. `q` matches the name, short name or three-letter code.
      .get('/teams', requireAuth, async (c) => {
        const q = c.req.query('q')?.trim();
        const pattern = q ? `%${q.replace(/[\\%_]/g, '\\$&')}%` : undefined;
        const rows = await getDb(c.env)
          .select(teamColumns)
          .from(teamMap)
          .where(pattern ? or(ilike(teamMap.name, pattern), ilike(teamMap.shortName, pattern), ilike(teamMap.code, pattern)) : undefined)
          .orderBy(asc(teamMap.name))
          .limit(TEAMS_PAGE);
        return c.json({ teams: rows });
      })

      // Favorites. A team's id here is its API-Football id, which is what live events and fixtures carry;
      // the app never shows it. Counted per user (ADR 0014).
      .get('/favorites', requireAuth, async (c) => {
        const rows = await getDb(c.env)
          .select(teamColumns)
          .from(favoriteTeams)
          .innerJoin(teamMap, eq(teamMap.apiFootballId, favoriteTeams.teamId))
          .where(eq(favoriteTeams.userId, c.get('userId')));
        return c.json({ favorites: rows });
      })

      .put('/favorites/:teamId', requireAuth, async (c) => {
        const teamId = Number(c.req.param('teamId'));
        if (!Number.isInteger(teamId)) return c.json({ error: 'invalid_team' }, 400);
        const db = getDb(c.env);
        const userId = c.get('userId');

        const [team] = await db.select().from(teamMap).where(eq(teamMap.apiFootballId, teamId));
        if (!team) return c.json({ error: 'unknown_team' }, 404);

        await db.insert(users).values({ id: userId }).onConflictDoNothing();

        const [existing] = await db
          .select()
          .from(favoriteTeams)
          .where(and(eq(favoriteTeams.userId, userId), eq(favoriteTeams.teamId, teamId)));
        if (existing) return c.json({ ok: true });

        // The cap is a trigger in the database (migration 0009), so adds that arrive together cannot pass it.
        try {
          await db.insert(favoriteTeams).values({ userId, teamId }).onConflictDoNothing();
        } catch (e) {
          if (isFavoritesFull(e)) return c.json({ error: 'favorites_full', max: MAX_FAVORITES }, 409);
          throw e;
        }
        return c.json({ ok: true });
      })

      .delete('/favorites/:teamId', requireAuth, async (c) => {
        const teamId = Number(c.req.param('teamId'));
        if (!Number.isInteger(teamId)) return c.json({ error: 'invalid_team' }, 400);
        await getDb(c.env)
          .delete(favoriteTeams)
          .where(and(eq(favoriteTeams.userId, c.get('userId')), eq(favoriteTeams.teamId, teamId)));
        return c.body(null, 204);
      })

      // Phase 1 only: a deliberate error to confirm Sentry receives server exceptions.
      // Behind auth so strangers cannot burn the Sentry event quota. Remove before launch.
      .get('/debug/sentry', requireAuth, () => {
        throw new Error('ScorePulse server test error (Phase 1 Sentry check)');
      })
  );
}

// The app imports this type only (`import type { AppType }`) for a typed Hono client.
export type AppType = ReturnType<typeof createApp>;
