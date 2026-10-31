// THROWAWAY: where does one poll spend CPU? Runs runPoller on PGlite many times, for a CPU profile (node --cpu-prof).
import { favoriteTeams, fixtures, follows, users } from '../src/db/schema';
import { runPoller } from '../src/poller/run-poller';
import { createTestDb } from '../test/db';
import recorded from '../fixtures/api-football/live-all-2026-10-29.json';

const matches = recorded.response.filter((m) => ['1H', '2H'].includes(m.fixture.status.short) && m.events.some((e) => e.type === 'Goal')).slice(0, 3);
const { db } = await createTestDb();
await db.insert(users).values({ id: 'u' });
const KICK = new Date('2026-10-29T19:00:00Z');
for (const m of matches) {
  const [f] = await db.insert(fixtures).values({ apiFootballId: m.fixture.id, leagueId: m.league.id, homeTeamId: m.teams.home.id, awayTeamId: m.teams.away.id, kickoff: KICK, status: '2H', source: 'x', firstPolledAt: new Date() }).returning();
  await db.insert(follows).values({ userId: 'u', fixtureId: f.id });
}
void favoriteTeams;
const provider = { fetchLive: async () => ({ response: matches }) as never };
const push = { send: async () => {} };
let t = KICK.getTime() + 50 * 60_000;
await runPoller({ db, push, provider }, new Date(t)); // first run stores the events
const N = 300;
const start = process.cpuUsage();
for (let i = 0; i < N; i++) { t += 6 * 60_000; await runPoller({ db, push, provider }, new Date(t)); }
const used = process.cpuUsage(start);
console.log('steady polls', N, 'cpu ms each (incl. PGlite):', ((used.user + used.system) / 1000 / N).toFixed(2));
