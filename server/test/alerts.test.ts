import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { favoriteTeams, fixtureEvents, fixtures, follows, notificationLog, pushTokens, users } from '../src/db/schema';
import { deliverAlerts } from '../src/poller/alerts';
import { handlePoll } from '../src/poller/handle-poll';
import { queueAlerts } from '../src/poller/queue-alerts';
import { runPoller } from '../src/poller/run-poller';
import { type ExpoMessage, type ExpoTicket, type PushSender, sendAlerts } from '../src/poller/send-alerts';
import { createTestDb } from './db';
import {
  AYARI_GOAL,
  fakePush,
  insertFixture,
  insertVarFixture,
  lastGoalIndex,
  MATCH_WITH_3_GOALS,
  noExtras,
  pollOf,
  recordedMatch,
  VAR_BASE_EVENTS,
  varPoll,
} from './poller-helpers';

let testDb: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  testDb = await createTestDb();
  await testDb.db.insert(users).values([{ id: 'user_a' }, { id: 'user_b' }]);
});
afterEach(() => testDb.close());

const PHONE = 'ExponentPushToken[phone]';
const TABLET = 'ExponentPushToken[tablet]';
const B_PHONE = 'ExponentPushToken[b-phone]';

// The poll alone: it records what is owed (flags on the event rows) and nothing else.
async function poll(response: Parameters<typeof handlePoll>[1]) {
  const ids = response.response.map((m) => m.fixture.id);
  const rows = (await testDb.db.select().from(fixtures)).filter((f) => f.apiFootballId !== null && ids.includes(f.apiFootballId));
  await handlePoll({ db: testDb.db }, response, rows.map((r) => ({ ...r, apiFootballId: r.apiFootballId! })));
}
const device = (userId: string, token: string) => testDb.db.insert(pushTokens).values({ userId, token });
const follow = (userId: string, fixtureId: number) => testDb.db.insert(follows).values({ userId, fixtureId });
const log = () => testDb.db.select().from(notificationLog);

// A pending/failed/etc. view of the outbox, for one event key shape.
const statuses = async () => (await log()).map((r) => [r.userId, r.status]).sort();

// Match 1563668 as it stood before its last goal (38'), then with it. user_a follows and has two devices.
async function trackedMatch() {
  const match = recordedMatch(MATCH_WITH_3_GOALS);
  const fixture = await insertFixture(testDb.db, match);
  await follow('user_a', fixture.id);
  await poll(pollOf(match, lastGoalIndex(match))); // first poll: backfill, nothing owed
  return { match, fixture };
}
const newGoal = (match: ReturnType<typeof recordedMatch>) => poll(pollOf(match));

// A push service for one scenario: `answer` decides the ticket for each message.
function pushWith(answer: (m: ExpoMessage) => ExpoTicket | 'throw') {
  const messages: ExpoMessage[] = [];
  let calls = 0;
  const push: PushSender = {
    send: async (batch) => {
      calls++;
      messages.push(...batch);
      const tickets = batch.map(answer);
      if (tickets.includes('throw')) throw new Error('Expo answered 500');
      return tickets as ExpoTicket[];
    },
  };
  return { push, messages, calls: () => calls };
}
const OK: ExpoTicket = { status: 'ok' };

test('an account with two devices receives two pushes for one event', async () => {
  const { match } = await trackedMatch();
  await device('user_a', PHONE);
  await device('user_a', TABLET);
  const push = fakePush();

  await newGoal(match);
  await deliverAlerts({ db: testDb.db, push });

  expect(push.messages.map((m) => m.to).sort()).toEqual([PHONE, TABLET].sort());
  expect(push.messages[0]).toMatchObject({ title: 'GOAL! Aleksandr Kovalenko', data: { kind: 'goal', homeGoals: 2, awayGoals: 1, minute: "38'" } });
  expect(await statuses()).toEqual([['user_a', 'sent']]); // one outbox row per user and event
});

test('a user who follows the match and one whose favorite team plays both get it, and a stranger does not', async () => {
  const { match, fixture } = await trackedMatch();
  await device('user_a', PHONE);
  await device('user_b', B_PHONE);
  await testDb.db.insert(favoriteTeams).values({ userId: 'user_b', teamId: fixture.homeTeamId });
  await testDb.db.insert(users).values({ id: 'user_c' });
  await device('user_c', 'ExponentPushToken[c-phone]');
  const push = fakePush();

  await newGoal(match);
  await deliverAlerts({ db: testDb.db, push });

  expect(push.messages.map((m) => m.to).sort()).toEqual([PHONE, B_PHONE].sort());
});

test('an unfollow between the poll and the send removes the user from the send', async () => {
  const { match, fixture } = await trackedMatch();
  await device('user_a', PHONE);
  const push = fakePush();
  await newGoal(match);
  await queueAlerts(testDb.db); // the pending row exists

  await testDb.db.delete(follows).where(and(eq(follows.userId, 'user_a'), eq(follows.fixtureId, fixture.id)));
  await sendAlerts(testDb.db, push);

  expect(push.messages).toEqual([]);
  expect(await statuses()).toEqual([['user_a', 'skipped']]);
});

test('an unfollow before the alert is written leaves the user out of it', async () => {
  const { match, fixture } = await trackedMatch();
  await device('user_a', PHONE);
  await testDb.db.delete(follows).where(eq(follows.fixtureId, fixture.id));
  const push = fakePush();

  await newGoal(match);
  await deliverAlerts({ db: testDb.db, push });

  expect(push.messages).toEqual([]);
  expect(await log()).toEqual([]);
});

test('a DeviceNotRegistered answer deletes that token only, and the other device still gets the alert', async () => {
  const { match } = await trackedMatch();
  await device('user_a', PHONE);
  await device('user_a', TABLET);
  const { push } = pushWith((m) => (m.to === PHONE ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : OK));

  await newGoal(match);
  await deliverAlerts({ db: testDb.db, push });

  expect((await testDb.db.select().from(pushTokens)).map((t) => t.token)).toEqual([TABLET]);
  expect((await log())[0]).toMatchObject({ status: 'sent', deliveredTo: [TABLET] });
});

test('a user whose only device is gone is skipped, not retried', async () => {
  const { match } = await trackedMatch();
  await device('user_a', PHONE);
  const { push, calls } = pushWith(() => ({ status: 'error', details: { error: 'DeviceNotRegistered' } }));

  await newGoal(match);
  await deliverAlerts({ db: testDb.db, push });
  await deliverAlerts({ db: testDb.db, push });

  expect(calls()).toBe(1);
  expect(await statuses()).toEqual([['user_a', 'skipped']]);
});

test('a run cut off after the goal was saved and before the pending rows were written loses nothing', async () => {
  const { match } = await trackedMatch();
  await device('user_a', PHONE);
  const push = fakePush();

  await newGoal(match); // the poll committed; the run then died: no pending rows
  expect(await log()).toEqual([]);
  expect((await testDb.db.select().from(fixtureEvents)).filter((e) => e.alertState === 'due')).toHaveLength(1);

  await deliverAlerts({ db: testDb.db, push }); // the next run
  await deliverAlerts({ db: testDb.db, push }); // and one more

  expect(push.messages).toHaveLength(1);
});

test('a run cut off between marking pending and sending is finished by the next run, with no duplicate', async () => {
  const { match } = await trackedMatch();
  await device('user_a', PHONE);
  const push = fakePush();
  await newGoal(match);
  await queueAlerts(testDb.db); // pending written, then the run died
  expect(await statuses()).toEqual([['user_a', 'pending']]);

  await deliverAlerts({ db: testDb.db, push });
  await deliverAlerts({ db: testDb.db, push });

  expect(push.messages).toHaveLength(1);
  expect(await statuses()).toEqual([['user_a', 'sent']]);
});

test('queueing twice writes each pending row once', async () => {
  const { match } = await trackedMatch();
  await device('user_a', PHONE);
  await newGoal(match);

  await queueAlerts(testDb.db);
  await queueAlerts(testDb.db);

  expect(await log()).toHaveLength(1);
});

test('a row sent but not marked is sent again: the rare duplicate that is preferred to a missed alert', async () => {
  const { match } = await trackedMatch();
  await device('user_a', PHONE);
  const push = fakePush();
  await newGoal(match);
  await deliverAlerts({ db: testDb.db, push });

  await testDb.db.update(notificationLog).set({ status: 'pending', deliveredTo: [] }); // the mark never happened
  await deliverAlerts({ db: testDb.db, push });

  expect(push.messages).toHaveLength(2);
});

test('a send that fails is retried on the next run and then sent once', async () => {
  const { match } = await trackedMatch();
  await device('user_a', PHONE);
  let up = false;
  const { push, messages } = pushWith(() => (up ? OK : 'throw'));
  await newGoal(match);

  await deliverAlerts({ db: testDb.db, push });
  expect((await log())[0]).toMatchObject({ status: 'failed', attempts: 1 });

  up = true;
  await deliverAlerts({ db: testDb.db, push });
  await deliverAlerts({ db: testDb.db, push });

  expect((await log())[0].status).toBe('sent');
  expect(messages.filter((m) => m.to === PHONE)).toHaveLength(2); // one failed try, one that arrived
});

test('retries stop after 3 tries so they do not eat the day\'s quota', async () => {
  const { match } = await trackedMatch();
  await device('user_a', PHONE);
  const { push, calls } = pushWith(() => 'throw');
  await newGoal(match);

  for (let run = 0; run < 6; run++) await deliverAlerts({ db: testDb.db, push });

  expect(calls()).toBe(3);
  expect((await log())[0]).toMatchObject({ status: 'failed', attempts: 3 });
});

test('after a partial failure the retry goes only to the device that did not get it', async () => {
  const { match } = await trackedMatch();
  await device('user_a', PHONE);
  await device('user_a', TABLET);
  let tabletUp = false;
  const { push, messages } = pushWith((m) => (m.to === TABLET && !tabletUp ? { status: 'error', message: 'MessageRateExceeded', details: { error: 'MessageRateExceeded' } } : OK));
  await newGoal(match);

  await deliverAlerts({ db: testDb.db, push });
  tabletUp = true;
  await deliverAlerts({ db: testDb.db, push });

  expect(messages.map((m) => m.to).sort()).toEqual([PHONE, TABLET, TABLET].sort());
  expect((await log())[0].status).toBe('sent');
});

// --- corrections (ADR 0009) ---

// Brighton's 90+3' goal, as the VAR recording has it: alerted to user_a, who follows the match.
async function varMatchWithAlert() {
  const fixture = await insertVarFixture(testDb.db);
  await follow('user_a', fixture.id);
  await device('user_a', PHONE);
  await poll(varPoll(VAR_BASE_EVENTS)); // first poll: backfill
  await poll(varPoll([...VAR_BASE_EVENTS, AYARI_GOAL]));
  return fixture;
}
const goalMissingTwice = async () => {
  await poll(varPoll(VAR_BASE_EVENTS));
  await poll(varPoll(VAR_BASE_EVENTS));
};

test('a cancelled goal sends a correction to the users who got the goal alert, and not to others', async () => {
  const fixture = await varMatchWithAlert();
  const push = fakePush();
  await deliverAlerts({ db: testDb.db, push }); // the goal alert
  await follow('user_b', fixture.id); // follows later: never got the goal alert
  await device('user_b', B_PHONE);

  await goalMissingTwice();
  await deliverAlerts({ db: testDb.db, push });

  expect(push.messages.map((m) => [m.to, m.data.kind])).toEqual([[PHONE, 'goal'], [PHONE, 'goal_removed']]);
  expect(push.messages[1].data).toMatchObject({ homeGoals: 0, awayGoals: 3 });
});

test('a correction is not repeated by later runs', async () => {
  await varMatchWithAlert();
  const push = fakePush();
  await deliverAlerts({ db: testDb.db, push });
  await goalMissingTwice();

  await deliverAlerts({ db: testDb.db, push });
  await deliverAlerts({ db: testDb.db, push });

  expect(push.messages.filter((m) => m.data.kind === 'goal_removed')).toHaveLength(1);
});

test('a goal cancelled while its alert is still waiting is withdrawn, with no correction for an alert never sent', async () => {
  await varMatchWithAlert();
  await queueAlerts(testDb.db); // goal alert pending, not yet sent
  const push = fakePush();

  await goalMissingTwice();
  await deliverAlerts({ db: testDb.db, push });

  expect(push.messages).toEqual([]);
  expect(await statuses()).toEqual([['user_a', 'skipped']]);
});

test('a goal cancelled before its alert was even written sends nothing at all', async () => {
  await varMatchWithAlert(); // the goal is owed but not yet queued
  const push = fakePush();

  await goalMissingTwice();
  await deliverAlerts({ db: testDb.db, push });

  expect(push.messages).toEqual([]);
  expect(await log()).toEqual([]);
});

test('a goal that was only backfilled and is removed later sends no correction, since its alert was never sent', async () => {
  const fixture = await insertVarFixture(testDb.db);
  await follow('user_a', fixture.id);
  await device('user_a', PHONE);
  await poll(varPoll([...VAR_BASE_EVENTS, AYARI_GOAL])); // first poll already has the goal: history
  const push = fakePush();

  await goalMissingTwice();
  await deliverAlerts({ db: testDb.db, push });

  expect(push.messages).toEqual([]);
  expect((await testDb.db.select().from(fixtureEvents)).find((e) => e.removedAt !== null)).toBeDefined();
});

// --- the run ---

test('a run with nothing to poll still sends alerts an earlier run left behind', async () => {
  const { match } = await trackedMatch();
  await device('user_a', PHONE);
  await newGoal(match); // saved and owed, then the run died
  const push = fakePush();
  // The fixture's kickoff is long past, so it is not due: a poll here would be a bug.
  const provider = {
    ...noExtras,
    fetchLive: async () => {
      throw new Error('nothing should be polled: the match is not in play');
    },
  };

  await runPoller({ db: testDb.db, push, provider }, new Date());

  expect(push.messages).toHaveLength(1);
});

test('a goal that arrives while the match is polled is sent in the same run', async () => {
  const match = recordedMatch(MATCH_WITH_3_GOALS);
  const now = new Date();
  const fixture = await insertFixture(testDb.db, match, { kickoff: new Date(now.getTime() - 50 * 60_000), status: '2H' });
  await follow('user_a', fixture.id);
  await device('user_a', PHONE);
  const answers = [pollOf(match, lastGoalIndex(match)), pollOf(match)];
  const provider = { ...noExtras, fetchLive: async () => answers.shift()! };
  const push = fakePush();

  await runPoller({ db: testDb.db, push, provider }, now);
  expect(push.messages).toEqual([]); // the backfill is history
  await runPoller({ db: testDb.db, push, provider }, new Date(now.getTime() + 5 * 60_000));

  expect(push.messages).toHaveLength(1);
  expect(push.messages[0].data).toMatchObject({ kind: 'goal', minute: "38'" });
});

test('a run with nothing owed and nothing pending sends nothing', async () => {
  const { match } = await trackedMatch();
  await device('user_a', PHONE);
  const push = fakePush();
  const provider = { ...noExtras, fetchLive: async () => pollOf(match) };

  await runPoller({ db: testDb.db, push, provider }, new Date());

  expect(push.messages).toEqual([]);
});
