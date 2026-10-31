// THROWAWAY spike for the #4 CPU criterion. Runs the real handlePoll on a once-a-minute cron against Neon.
// Minute % 4: 0 = all 28 recorded matches tracked, 1 = 3 tracked (steady replay), 2 = reset (delete the goals of the
// 3 tracked matches so the next run has new goals; its CPU is not a sample), 3 = 3 tracked with new goals -> pushes.
import { getDb } from '../src/db/client';
import { fixtureEvents, fixtures } from '../src/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { handlePoll, type GoalPush } from '../src/poller/handle-poll';
import recorded from '../fixtures/api-football/live-all-2026-10-29.json';

type Env = { DATABASE_URL: string };
const THREE = [1563668, 1635511, 1640569];

async function run(minute: number, env: Env) {
  const db = getDb(env.DATABASE_URL);
  const pushes: GoalPush[] = [];
  const push = { send: async (p: GoalPush) => void pushes.push(p) };
  const mode = minute % 4;
  if (mode === 2) {
    const rows = await db.select({ id: fixtures.id }).from(fixtures).where(inArray(fixtures.apiFootballId, THREE));
    await db
      .delete(fixtureEvents)
      .where(and(inArray(fixtureEvents.fixtureId, rows.map((r) => r.id)), eq(fixtureEvents.type, 'Goal')));
    console.log(JSON.stringify({ mode, note: 'reset, not a sample' }));
    return;
  }
  const ids = new Set(mode === 0 ? recorded.response.map((m) => m.fixture.id) : THREE);
  const t = Date.now();
  await handlePoll({ db, push }, recorded as never, ids);
  console.log(JSON.stringify({ mode, tracked: ids.size, pushes: pushes.length, wallMs: Date.now() - t }));
}

export default {
  scheduled: async (c: ScheduledController, env: Env) => run(new Date(c.scheduledTime).getUTCMinutes(), env),
};
