import { afterEach, expect, test } from 'vitest';
import { fixtureEvents } from '../src/db/schema';
import { handlePoll, type PollResponse } from '../src/poller/handle-poll';
import { createTestDb } from './db';
import {
  AYARI_GOAL,
  fakePush,
  GOAL_CANCELLED,
  insertVarFixture,
  PENALTY_CANCELLED,
  VAR_BASE_EVENTS,
  VAR_MATCH,
  varPoll,
} from './poller-helpers';

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

const live = new Set([VAR_MATCH]);

// Brighton (away, team 51) lead 0-3 in the recording before the 90+3' goal; that goal makes it 0-4.
async function setupAfterAyariGoalAlert() {
  const testDb = await createTestDb();
  close = testDb.close;
  const push = fakePush();
  await insertVarFixture(testDb.db);
  await handlePoll({ db: testDb.db, push }, varPoll(VAR_BASE_EVENTS), live); // first poll: backfill
  await handlePoll({ db: testDb.db, push }, varPoll([...VAR_BASE_EVENTS, AYARI_GOAL]), live); // the 90+3' goal arrives
  expect(push.sent.map((p) => [p.kind, p.homeGoals, p.awayGoals])).toEqual([['goal', 0, 4]]);
  push.sent.length = 0;
  return { db: testDb.db, push };
}

test('a goal missing from 2 consecutive polls is marked removed and sends exactly one correction push', async () => {
  const { db, push } = await setupAfterAyariGoalAlert();

  await handlePoll({ db, push }, varPoll(VAR_BASE_EVENTS), live); // missing 1
  await handlePoll({ db, push }, varPoll(VAR_BASE_EVENTS), live); // missing 2

  const goal = (await db.select().from(fixtureEvents)).find((e) => e.playerId === AYARI_GOAL.player.id && e.type === 'Goal');
  expect(goal?.removedAt).toBeInstanceOf(Date);
  expect(push.sent).toHaveLength(1);
  expect(push.sent[0]).toMatchObject({ kind: 'goal_removed', homeGoals: 0, awayGoals: 3 });
});

const ayari = (rows: (typeof fixtureEvents.$inferSelect)[]) =>
  rows.find((e) => e.playerId === AYARI_GOAL.player.id && e.type === 'Goal');

test('a goal missing for one poll and then back sends nothing and is not marked removed', async () => {
  const { db, push } = await setupAfterAyariGoalAlert();

  await handlePoll({ db, push }, varPoll(VAR_BASE_EVENTS), live); // missing 1: the API dropped it for one response
  await handlePoll({ db, push }, varPoll([...VAR_BASE_EVENTS, AYARI_GOAL]), live); // back

  expect(push.sent).toEqual([]);
  const goal = ayari(await db.select().from(fixtureEvents));
  expect(goal?.removedAt).toBeNull();
  expect(goal?.missingPolls).toBe(0);
});

test('a goal missing for one poll, back, then missing for one more poll is still not removed', async () => {
  const { db, push } = await setupAfterAyariGoalAlert();

  await handlePoll({ db, push }, varPoll(VAR_BASE_EVENTS), live);
  await handlePoll({ db, push }, varPoll([...VAR_BASE_EVENTS, AYARI_GOAL]), live);
  await handlePoll({ db, push }, varPoll(VAR_BASE_EVENTS), live); // missing 1 again: the count restarted

  expect(push.sent).toEqual([]);
  expect(ayari(await db.select().from(fixtureEvents))?.removedAt).toBeNull();
});

test('replaying polls after a removal sends no second correction', async () => {
  const { db, push } = await setupAfterAyariGoalAlert();

  for (let i = 0; i < 5; i++) await handlePoll({ db, push }, varPoll(VAR_BASE_EVENTS), live);
  await handlePoll({ db, push }, varPoll([...VAR_BASE_EVENTS, AYARI_GOAL]), live); // it even reappears: removal is final

  expect(push.sent.filter((p) => p.kind === 'goal_removed')).toHaveLength(1);
  expect(push.sent).toHaveLength(1);
});

test('the recorded VAR "Goal cancelled" event removes the goal at once, with one correction', async () => {
  const { db, push } = await setupAfterAyariGoalAlert();
  const withVar = [...VAR_BASE_EVENTS, GOAL_CANCELLED]; // as recorded: the goal is gone and the VAR event is listed

  await handlePoll({ db, push }, varPoll(withVar), live); // one poll, no grace period

  expect(ayari(await db.select().from(fixtureEvents))?.removedAt).toBeInstanceOf(Date);
  expect(push.sent).toHaveLength(1);
  expect(push.sent[0]).toMatchObject({ kind: 'goal_removed', minute: "90+3'", homeGoals: 0, awayGoals: 3 });
  expect(push.sent[0].eventKey).toMatch(/^fixture:\d+:event:\d+:removed$/);
});

test('a VAR cancellation listed next to a goal that is still in the response removes it, and replaying sends one correction', async () => {
  const { db, push } = await setupAfterAyariGoalAlert();
  const both = [...VAR_BASE_EVENTS, AYARI_GOAL, GOAL_CANCELLED];

  await handlePoll({ db, push }, varPoll(both), live);
  await handlePoll({ db, push }, varPoll(both), live); // the same removal again

  expect(push.sent.map((p) => p.kind)).toEqual(['goal_removed']);
});

test('"Penalty cancelled" is not a goal cancellation: it never removes a goal, even one with the same team, player and minute', async () => {
  const testDb = await createTestDb();
  close = testDb.close;
  const push = fakePush();
  await insertVarFixture(testDb.db);
  // Contrived on purpose: a goal by the player named in the recorded "Penalty cancelled" event, at its minute.
  const sameMinuteGoal = { ...PENALTY_CANCELLED, type: 'Goal', detail: 'Normal Goal' };
  expect(VAR_BASE_EVENTS).toContain(PENALTY_CANCELLED);
  await handlePoll({ db: testDb.db, push }, varPoll(VAR_BASE_EVENTS), live);

  await handlePoll({ db: testDb.db, push }, varPoll([...VAR_BASE_EVENTS, sameMinuteGoal]), live);

  const goal = (await testDb.db.select().from(fixtureEvents)).find((e) => e.type === 'Goal' && e.elapsed === 48);
  expect(goal?.removedAt).toBeNull();
  expect(push.sent.map((p) => p.kind)).toEqual(['goal']);
});

test('a VAR cancellation for a goal we never stored sends nothing', async () => {
  const testDb = await createTestDb();
  close = testDb.close;
  const push = fakePush();
  await insertVarFixture(testDb.db);
  await handlePoll({ db: testDb.db, push }, varPoll(VAR_BASE_EVENTS), live); // first poll
  await handlePoll({ db: testDb.db, push }, varPoll([...VAR_BASE_EVENTS, GOAL_CANCELLED]), live); // goal never listed

  expect(push.sent).toEqual([]);
});

test('a goal that arrives and is cancelled in the same poll was never announced, so nothing is sent', async () => {
  const testDb = await createTestDb();
  close = testDb.close;
  const push = fakePush();
  await insertVarFixture(testDb.db);
  await handlePoll({ db: testDb.db, push }, varPoll(VAR_BASE_EVENTS), live);
  await handlePoll({ db: testDb.db, push }, varPoll([...VAR_BASE_EVENTS, AYARI_GOAL, GOAL_CANCELLED]), live);

  expect(push.sent).toEqual([]);
});

test('a goal scored after a removal does not count the removed goal in its score', async () => {
  const { db, push } = await setupAfterAyariGoalAlert();
  await handlePoll({ db, push }, varPoll([...VAR_BASE_EVENTS, GOAL_CANCELLED]), live); // removed, 0-3
  push.sent.length = 0;
  const lateGoal = { ...AYARI_GOAL, time: { elapsed: 90, extra: 5 }, player: { id: 1, name: 'T. Striker' } };

  await handlePoll({ db, push }, varPoll([...VAR_BASE_EVENTS, GOAL_CANCELLED, lateGoal]), live);

  expect(push.sent).toHaveLength(1);
  expect(push.sent[0]).toMatchObject({ kind: 'goal', minute: "90+5'", homeGoals: 0, awayGoals: 4 });
});

test('a removed goal that the API still lists next to its VAR event does not count in the next goal\'s score', async () => {
  const { db, push } = await setupAfterAyariGoalAlert();
  await handlePoll({ db, push }, varPoll([...VAR_BASE_EVENTS, AYARI_GOAL, GOAL_CANCELLED]), live); // removed, 0-3
  push.sent.length = 0;
  const lateGoal = { ...AYARI_GOAL, time: { elapsed: 90, extra: 5 }, player: { id: 1, name: 'T. Striker' } };

  await handlePoll({ db, push }, varPoll([...VAR_BASE_EVENTS, AYARI_GOAL, GOAL_CANCELLED, lateGoal]), live);

  expect(push.sent).toHaveLength(1);
  expect(push.sent[0]).toMatchObject({ kind: 'goal', homeGoals: 0, awayGoals: 4 });
});

test('a poll whose events list is empty or missing says nothing about goals, so no goal counts as missing', async () => {
  const { db, push } = await setupAfterAyariGoalAlert();
  const noEventsKey: PollResponse = { response: [{ fixture: { id: VAR_MATCH } }] };

  for (let i = 0; i < 3; i++) {
    await handlePoll({ db, push }, varPoll([]), live); // events: []
    await handlePoll({ db, push }, noEventsKey, live); // no events key at all
  }

  expect(push.sent).toEqual([]);
  const rows = await db.select().from(fixtureEvents);
  expect(rows.filter((r) => r.type === 'Goal').every((r) => r.removedAt === null && r.missingPolls === 0)).toBe(true);
});
