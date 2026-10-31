import { afterEach, expect, test } from 'vitest';
import { fixtureEvents } from '../src/db/schema';
import { createTestDb } from './db';
import { fakePush, insertFixture, lastGoalIndex, MATCH_WITH_3_GOALS, MATCH_WITH_OWN_GOAL, ownGoalIndex, pollOf, pollOnce, recordedMatch } from './poller-helpers';

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

async function setup() {
  const testDb = await createTestDb();
  close = testDb.close;
  return { db: testDb.db, push: fakePush() };
}

test('replaying a recorded match stores each event once', async () => {
  const { db, push } = await setup();
  const match = recordedMatch(MATCH_WITH_3_GOALS);
  await insertFixture(db, match);
  const live = [MATCH_WITH_3_GOALS];

  await pollOnce({ db, push }, pollOf(match), live);
  await pollOnce({ db, push }, pollOf(match), live);

  expect(await db.select().from(fixtureEvents)).toHaveLength(match.events.length);
});

test('events for a fixture that is not live-tracked are not stored and send nothing', async () => {
  const { db, push } = await setup();
  const tracked = recordedMatch(MATCH_WITH_3_GOALS);
  const untracked = recordedMatch(MATCH_WITH_OWN_GOAL);
  await insertFixture(db, tracked);
  await insertFixture(db, untracked); // has a snapshot row, but nobody follows it
  const both = { response: [...pollOf(tracked).response, ...pollOf(untracked).response] };

  await pollOnce({ db, push }, both, [MATCH_WITH_3_GOALS]);

  const stored = await db.select().from(fixtureEvents);
  expect(stored).toHaveLength(tracked.events.length);
  expect(new Set(stored.map((e) => e.fixtureId)).size).toBe(1);
  expect(push.sent).toEqual([]);
});

test('a new goal on a later poll sends exactly one push with scorer, minute and score', async () => {
  const { db, push } = await setup();
  const match = recordedMatch(MATCH_WITH_3_GOALS);
  await insertFixture(db, match);
  const live = [MATCH_WITH_3_GOALS];
  const lastGoal = lastGoalIndex(match);

  await pollOnce({ db, push }, pollOf(match, lastGoal), live); // match as it stood before the 38' goal
  await pollOnce({ db, push }, pollOf(match), live);

  expect(push.sent).toHaveLength(1);
  expect(push.sent[0]).toMatchObject({
    scorer: 'Aleksandr Kovalenko',
    minute: "38'",
    homeGoals: 2,
    awayGoals: 1,
  });
});

test('the first poll of a fixture stores goals already scored but sends no push for them', async () => {
  const { db, push } = await setup();
  const match = recordedMatch(MATCH_WITH_3_GOALS); // already has 3 goals when first polled
  await insertFixture(db, match);

  await pollOnce({ db, push }, pollOf(match), [MATCH_WITH_3_GOALS]);

  expect(await db.select().from(fixtureEvents)).toHaveLength(match.events.length);
  expect(push.sent).toEqual([]);
});

test('a goal after a first poll that had no events yet still sends a push', async () => {
  const { db, push } = await setup();
  const match = recordedMatch(MATCH_WITH_3_GOALS);
  await insertFixture(db, match);
  const live = [MATCH_WITH_3_GOALS];

  await pollOnce({ db, push }, pollOf(match, 0), live); // kickoff: nothing has happened yet
  await pollOnce({ db, push }, pollOf(match, 2), live); // 4' card, then the 7' goal

  expect(push.sent).toHaveLength(1);
  expect(push.sent[0]).toMatchObject({ minute: "7'", homeGoals: 1, awayGoals: 0 });
});

test('replaying the same poll again sends no second push and stores nothing new', async () => {
  const { db, push } = await setup();
  const match = recordedMatch(MATCH_WITH_3_GOALS);
  await insertFixture(db, match);
  const live = [MATCH_WITH_3_GOALS];

  await pollOnce({ db, push }, pollOf(match, lastGoalIndex(match)), live);
  await pollOnce({ db, push }, pollOf(match), live);
  await pollOnce({ db, push }, pollOf(match), live);

  expect(push.sent).toHaveLength(1);
  expect(await db.select().from(fixtureEvents)).toHaveLength(match.events.length);
});

test('several goals arriving in one poll each push once, with the score as it stood after that goal', async () => {
  const { db, push } = await setup();
  const match = recordedMatch(MATCH_WITH_3_GOALS);
  await insertFixture(db, match);
  const live = [MATCH_WITH_3_GOALS];

  await pollOnce({ db, push }, pollOf(match, 0), live);
  await pollOnce({ db, push }, pollOf(match), live); // the 7', 17' and 38' goals all arrive together

  expect(push.sent.map((p) => [p.minute, p.homeGoals, p.awayGoals])).toEqual([
    ["7'", 1, 0],
    ["17'", 2, 0],
    ["38'", 2, 1],
  ]);
});

test('an own goal counts for the side credited with it, and a missed penalty is not a goal', async () => {
  const { db, push } = await setup();
  const match = recordedMatch(MATCH_WITH_OWN_GOAL); // 1-3 at the time: own goal at 22', missed penalty at 45'
  await insertFixture(db, match);
  const live = [MATCH_WITH_OWN_GOAL];

  await pollOnce({ db, push }, pollOf(match, ownGoalIndex(match)), live); // before the own goal
  await pollOnce({ db, push }, pollOf(match), live);

  expect(push.sent).toHaveLength(1);
  expect(push.sent[0]).toMatchObject({ scorer: 'D. Agyakwa', minute: "22'", homeGoals: 1, awayGoals: 3 });
});
