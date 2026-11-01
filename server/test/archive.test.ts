import { afterEach, beforeEach, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import lineupsJson from '../fixtures/api-football/lineups-everton-brighton-2024-25.json';
import statisticsJson from '../fixtures/api-football/statistics-everton-brighton-2024-25.json';
import varJson from '../fixtures/api-football/var-everton-brighton-2024-25.json';
import { favoriteTeams, fixtureEvents, fixtureLineups, fixtures, fixtureStats, notificationLog, pollState, users } from '../src/db/schema';
import { runArchive } from '../src/poller/archive';
import { getPollStatus } from '../src/poller/quota';
import { routeScheduled } from '../src/schedule';
import { createTestDb } from './db';
import { noExtras } from './poller-helpers';

// The morning catch-up (#23): finished matches that have no details are fetched by id, one a run, in quiet hours.
let testDb: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  testDb = await createTestDb();
  await testDb.db.insert(users).values({ id: 'user_a' });
});
afterEach(() => testDb.close());

const WEDNESDAY = new Date('2026-11-04T07:00:00Z'); // quiet: cap 50
const SATURDAY = new Date('2026-11-07T07:00:00Z'); // busy: cap 20
const DAY = 24 * 3_600_000;
const PL = 39;
const LALIGA = 140;
const BUNDESLIGA = 78;

let nextId = 5000;
async function finished(over: Partial<typeof fixtures.$inferInsert> = {}) {
  const [row] = await testDb.db
    .insert(fixtures)
    .values({
      apiFootballId: nextId++,
      leagueId: BUNDESLIGA,
      homeTeamId: 900 + nextId,
      awayTeamId: 1900 + nextId,
      kickoff: new Date(WEDNESDAY.getTime() - 3 * DAY),
      status: 'FT',
      homeGoals: 1,
      awayGoals: 0,
      source: 'football-data',
      ...over,
    })
    .returning();
  return row;
}

// What `fixtures?id=` answers for a match: the recorded Everton v Brighton, under that match's own id.
const byId = (id: number) => ({
  response: [{ ...varJson.response[0], fixture: { ...varJson.response[0].fixture, id }, lineups: lineupsJson.response, statistics: statisticsJson.response }],
});
function provider(opts: { fail?: boolean } = {}) {
  const asked: number[] = [];
  return {
    asked,
    ...noExtras,
    fetchFixture: async (id: number) => {
      asked.push(id);
      if (opts.fail) throw new Error('API-Football answered 500');
      return byId(id) as never;
    },
  };
}
const tick = (p: ReturnType<typeof provider>, now = WEDNESDAY) => runArchive({ db: testDb.db, provider: p }, now);
const used = async (now = WEDNESDAY) => (await getPollStatus(testDb.db, now)).requestsToday;
const spend = (n: number, now: Date) =>
  testDb.db.insert(pollState).values({ id: 'api-football', requestsToday: n, quotaDay: now.toISOString().slice(0, 10) });
const row = async (id: number) => (await testDb.db.select().from(fixtures).where(eq(fixtures.id, id)))[0];

test('a finished match nobody followed gets its timeline, lineups and statistics, quietly', async () => {
  const f = await finished();
  const p = provider();

  await tick(p);

  expect(p.asked).toEqual([f.apiFootballId]);
  expect(await testDb.db.select().from(fixtureEvents)).toHaveLength(varJson.response[0].events.length);
  expect(await testDb.db.select().from(fixtureLineups)).toHaveLength(2);
  expect(await testDb.db.select().from(fixtureStats)).toHaveLength(2);
  expect((await row(f.id)).completedAt).toBeInstanceOf(Date);
  expect(await used()).toBe(1);
  expect((await testDb.db.select().from(fixtureEvents)).every((e) => e.alertState === 'none')).toBe(true);
  expect(await testDb.db.select().from(notificationLog)).toEqual([]);
});

test('one match is fetched per run, newest first among equals', async () => {
  const old = await finished({ kickoff: new Date(WEDNESDAY.getTime() - 9 * DAY) });
  const recent = await finished({ kickoff: new Date(WEDNESDAY.getTime() - 1 * DAY) });
  const p = provider();

  await tick(p);
  expect(p.asked).toEqual([recent.apiFootballId]);
  await tick(p);
  expect(p.asked).toEqual([recent.apiFootballId, old.apiFootballId]);
});

test('a favorite team\'s match comes first, then a match in a favorite team\'s league, then the rest, whatever the date', async () => {
  const other = await finished({ leagueId: LALIGA, kickoff: new Date(WEDNESDAY.getTime() - 1 * DAY) }); // newest, other league
  const sameLeague = await finished({ leagueId: PL, kickoff: new Date(WEDNESDAY.getTime() - 4 * DAY) });
  const favorite = await finished({ leagueId: PL, homeTeamId: 33, kickoff: new Date(WEDNESDAY.getTime() - 20 * DAY) }); // oldest
  await testDb.db.insert(favoriteTeams).values({ userId: 'user_a', teamId: 33 });
  const p = provider();

  for (let i = 0; i < 3; i++) await tick(p);

  expect(p.asked).toEqual([favorite.apiFootballId, sameLeague.apiFootballId, other.apiFootballId]);
});

test('a match is not fetched twice, and the job makes no request at all once nothing is missing', async () => {
  await finished();
  const p = provider();

  await tick(p);
  await tick(p);
  await tick(p);

  expect(p.asked).toHaveLength(1);
  expect(await used()).toBe(1);
});

test('on a busy day (Friday to Monday) it stops at 20 requests, on a quiet day at 50', async () => {
  await finished();
  await finished();

  await spend(20, SATURDAY);
  const busy = provider();
  await tick(busy, SATURDAY);
  expect(busy.asked).toEqual([]);

  await testDb.db.update(pollState).set({ requestsToday: 19 });
  await tick(busy, SATURDAY);
  expect(busy.asked).toHaveLength(1);

  await testDb.db.delete(pollState);
  await spend(20, WEDNESDAY);
  const quiet = provider();
  await tick(quiet, WEDNESDAY);
  expect(quiet.asked).toHaveLength(1); // 20 is fine on a quiet day

  await testDb.db.update(pollState).set({ requestsToday: 50 });
  await tick(quiet, WEDNESDAY);
  expect(quiet.asked).toHaveLength(1); // the 50 mark: no more
});

test('with the quota spent it does nothing', async () => {
  await finished();
  await spend(100, WEDNESDAY);
  const p = provider();

  await tick(p);

  expect(p.asked).toEqual([]);
});

test('matches it cannot fetch are left alone: no id, not finished, already done, too many failed tries', async () => {
  await finished({ apiFootballId: null });
  await finished({ status: '2H' });
  await finished({ status: 'NS' });
  await finished({ completedAt: new Date() });
  await finished({ completionAttempts: 3 });
  const p = provider();

  await tick(p);

  expect(p.asked).toEqual([]);
  expect(await used()).toBe(0);
});

test('a failed request counts as a try and the match is asked for at most 3 times', async () => {
  const f = await finished();
  const p = provider({ fail: true });

  for (let i = 0; i < 5; i++) await tick(p);

  expect(p.asked).toHaveLength(3);
  expect(await row(f.id)).toMatchObject({ completionAttempts: 3, completedAt: null });
  expect(await used()).toBe(3);
});

test('a match the poller already stored events for gets no duplicates and no alert', async () => {
  const f = await finished({ firstPolledAt: new Date(WEDNESDAY.getTime() - 3 * DAY) });
  const first = varJson.response[0].events[0];
  await testDb.db.insert(fixtureEvents).values({
    fixtureId: f.id, elapsed: first.time.elapsed, extra: first.time.extra, teamId: first.team.id, playerId: first.player.id,
    playerName: first.player.name, type: first.type, detail: first.detail,
  });
  const p = provider();

  await tick(p);

  expect(await testDb.db.select().from(fixtureEvents)).toHaveLength(varJson.response[0].events.length);
  expect((await testDb.db.select().from(fixtureEvents)).every((e) => e.alertState === 'none')).toBe(true);
});

// --- which cron beat does what ---

test('the morning cron syncs the five leagues in its first five runs, then archives', () => {
  const morning = '*/5 6-9 * * *';
  const at = (h: number, m: number) => new Date(Date.UTC(2026, 10, 4, h, m));

  expect([0, 5, 10, 15, 20].map((m) => routeScheduled(morning, at(6, m)))).toEqual([
    { job: 'sync', slot: 0 }, { job: 'sync', slot: 1 }, { job: 'sync', slot: 2 }, { job: 'sync', slot: 3 }, { job: 'sync', slot: 4 },
  ]);
  for (const [h, m] of [[6, 25], [6, 55], [7, 0], [9, 55]]) expect(routeScheduled(morning, at(h, m))).toEqual({ job: 'archive' });
});

test('the night cron syncs by minute, and the matchday crons poll', () => {
  const night = '30,35,40,45,50 23 * * *';
  expect([30, 35, 40, 45, 50].map((m) => routeScheduled(night, new Date(Date.UTC(2026, 10, 4, 23, m))))).toEqual([
    { job: 'sync', slot: 0 }, { job: 'sync', slot: 1 }, { job: 'sync', slot: 2 }, { job: 'sync', slot: 3 }, { job: 'sync', slot: 4 },
  ]);
  expect(routeScheduled('*/5 11-22 * * FRI,SAT,SUN,MON', new Date())).toEqual({ job: 'poll' });
  expect(routeScheduled('*/5 17-22 * * TUE,WED,THU', new Date())).toEqual({ job: 'poll' });
});
