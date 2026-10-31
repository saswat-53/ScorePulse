// THROWAWAY spike for the #6 CPU criterion. Runs the real runPoller once a minute against Neon, with a provider that
// serves the recorded response (3 in-play matches, as a league-filtered call would). Minute % 5:
//   0 reset (delete the goals, clear poll_state; not a sample)   1 sample: new goals, pushes
//   2 reset (clear poll_state; not a sample)                     3 sample: steady replay, 2 requests
//   4 sample: idle run (now is far before kickoff), 1 request
import { eq, inArray } from 'drizzle-orm';
import { getDb } from '../src/db/client';
import { fixtureEvents, fixtures, pollState } from '../src/db/schema';
import type { GoalPush } from '../src/poller/handle-poll';
import { runPoller } from '../src/poller/run-poller';
import recorded from '../fixtures/api-football/live-all-2026-10-29.json';

type Env = { DATABASE_URL: string };
const IN_PLAY = ['1H', '2H'];
const matches = recorded.response.filter((m) => IN_PLAY.includes(m.fixture.status.short) && m.events.some((e) => e.type === 'Goal')).slice(0, 3);
const ids = matches.map((m) => m.fixture.id);

async function run(now: Date, env: Env) {
  const db = getDb(env.DATABASE_URL);
  const mode = now.getUTCMinutes() % 5;
  if (mode === 0 || mode === 2) {
    if (mode === 0) {
      const rows = await db.select({ id: fixtures.id }).from(fixtures).where(inArray(fixtures.apiFootballId, ids));
      await db.delete(fixtureEvents).where(inArray(fixtureEvents.fixtureId, rows.map((r) => r.id)));
      await db.update(fixtures).set({ status: '2H', kickoff: new Date(now.getTime() - 50 * 60_000) }).where(inArray(fixtures.apiFootballId, ids));
    }
    await db.delete(pollState).where(eq(pollState.id, 'api-football'));
    console.log(JSON.stringify({ mode, note: 'reset, not a sample' }));
    return;
  }
  const pushes: GoalPush[] = [];
  const provider = { fetchLive: async () => ({ response: matches }) as never };
  const t = Date.now();
  await runPoller({ db, push: { send: async (p) => void pushes.push(p) }, provider }, mode === 4 ? new Date(now.getTime() - 10 * 3_600_000) : now);
  console.log(JSON.stringify({ mode, pushes: pushes.length, wallMs: Date.now() - t }));
}

export default { scheduled: async (c: ScheduledController, env: Env) => run(new Date(c.scheduledTime), env) };
