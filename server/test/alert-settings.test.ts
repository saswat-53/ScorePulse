import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createApp } from '../src/app';
import { fixtures, follows, notificationLog, pushTokens, users } from '../src/db/schema';
import type { Bindings } from '../src/env';
import { deliverAlerts } from '../src/poller/alerts';
import { handlePoll, type PollResponse } from '../src/poller/handle-poll';
import { queueAlerts } from '../src/poller/queue-alerts';
import { sendAlerts } from '../src/poller/send-alerts';
import { createTestDb } from './db';
import { fakePush, insertFixture, MATCH_WITH_3_GOALS, MATCH_WITH_OWN_GOAL, pollOf, recordedMatch } from './poller-helpers';

vi.mock('@clerk/backend', () => ({
  verifyToken: async (token: string) => {
    if (!token.startsWith('token-')) throw new Error('invalid token');
    return { sub: token.slice('token-'.length) };
  },
}));

let testDb: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  testDb = await createTestDb();
});
afterEach(() => testDb.close());

const env = { CLERK_SECRET_KEY: 'sk_test' } as Bindings;
const call = (method: string, path: string, user?: string, body?: unknown) =>
  createApp(() => testDb.db).request(
    path,
    {
      method,
      headers: { ...(user ? { Authorization: `Bearer token-${user}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    },
    env,
  );
const settings = async (user: string) => ((await (await call('GET', '/settings', user)).json()) as { alerts: Record<string, boolean> }).alerts;

// --- the settings ---

test('a new user has goals and full time on, and cards, substitutions and kickoff off', async () => {
  expect(await settings('user_a')).toEqual({ goals: true, cards: false, substitutions: false, kickoff: false, fullTime: true });
});

test('a change is saved, leaves the other settings alone, and is the same for the next read', async () => {
  await call('PUT', '/settings', 'user_a', { cards: true, goals: false });

  expect(await settings('user_a')).toEqual({ goals: false, cards: true, substitutions: false, kickoff: false, fullTime: true });
  expect(await settings('user_b')).toMatchObject({ goals: true, cards: false }); // per user
});

test('a setting that is not true or false is rejected and nothing changes', async () => {
  expect((await call('PUT', '/settings', 'user_a', { goals: 'yes' })).status).toBe(400);
  expect((await call('PUT', '/settings', 'user_a', {})).status).toBe(400);
  expect(await settings('user_a')).toMatchObject({ goals: true });
});

test('the settings routes need a signed-in user', async () => {
  expect((await call('GET', '/settings')).status).toBe(401);
  expect((await call('PUT', '/settings', undefined, { goals: true })).status).toBe(401);
});

// --- who gets which alert ---

const PHONE_A = 'ExponentPushToken[a]';
const PHONE_B = 'ExponentPushToken[b]';

async function twoFollowers(match: ReturnType<typeof recordedMatch>) {
  await testDb.db.insert(users).values([{ id: 'user_a' }, { id: 'user_b' }]);
  await testDb.db.insert(pushTokens).values([{ userId: 'user_a', token: PHONE_A }, { userId: 'user_b', token: PHONE_B }]);
  const fixture = await insertFixture(testDb.db, match);
  await testDb.db.insert(follows).values([{ userId: 'user_a', fixtureId: fixture.id }, { userId: 'user_b', fixtureId: fixture.id }]);
  return fixture;
}
async function poll(response: PollResponse) {
  const ids = response.response.map((m) => m.fixture.id);
  const rows = (await testDb.db.select().from(fixtures)).filter((f) => f.apiFootballId !== null && ids.includes(f.apiFootballId));
  await handlePoll({ db: testDb.db }, response, rows.map((r) => ({ ...r, apiFootballId: r.apiFootballId! })));
}
const kinds = (push: ReturnType<typeof fakePush>) => push.messages.map((m) => [m.to, m.data.kind]).sort();

test('a goal alert is not sent to a user who turned goals off, and still goes to the other', async () => {
  const match = recordedMatch(MATCH_WITH_3_GOALS);
  await twoFollowers(match);
  await testDb.db.update(users).set({ alertGoals: false }).where(eq(users.id, 'user_a'));
  const push = fakePush();

  await poll(pollOf(match, 5)); // first poll: backfill
  await poll(pollOf(match)); // the 38' goal
  await deliverAlerts({ db: testDb.db, push });

  expect(kinds(push)).toEqual([[PHONE_B, 'goal']]);
});

test('a card alert goes only to users who turned cards on, and names the player and the colour', async () => {
  const match = recordedMatch(MATCH_WITH_3_GOALS);
  await twoFollowers(match);
  await testDb.db.update(users).set({ alertCards: true }).where(eq(users.id, 'user_a'));
  const push = fakePush();

  await poll(pollOf(match, 4)); // first poll: the cards at 4' and 8' are history
  await poll(pollOf(match, 5)); // the yellow card at 32'
  await deliverAlerts({ db: testDb.db, push });

  expect(kinds(push)).toEqual([[PHONE_A, 'card']]);
  expect(push.messages[0]).toMatchObject({ title: 'Yellow card', data: { player: 'Matheus Alves', card: 'yellow', minute: "32'" } });
  expect(push.messages[0].body).toContain('Matheus Alves');
});

test('a substitution alert goes only to users who turned substitutions on, and names both players', async () => {
  const match = recordedMatch(MATCH_WITH_OWN_GOAL);
  const sub = match.events.findIndex((e) => e.type === 'subst');
  await twoFollowers(match);
  await testDb.db.update(users).set({ alertSubstitutions: true }).where(eq(users.id, 'user_b'));
  const push = fakePush();

  await poll(pollOf(match, sub));
  await poll(pollOf(match, sub + 1));
  await deliverAlerts({ db: testDb.db, push });

  expect(kinds(push)).toEqual([[PHONE_B, 'substitution']]);
  expect(push.messages[0].data).toMatchObject({ player: match.events[sub].player.name, related: match.events[sub].assist.name });
});

test('events from before the first poll never alert, whatever the toggles', async () => {
  const match = recordedMatch(MATCH_WITH_3_GOALS);
  await twoFollowers(match);
  await testDb.db.update(users).set({ alertCards: true, alertSubstitutions: true });
  const push = fakePush();

  await poll(pollOf(match));
  await deliverAlerts({ db: testDb.db, push });

  expect(push.messages).toEqual([]);
});

test('a toggle turned off after the alert was written but before it was sent still stops it', async () => {
  const match = recordedMatch(MATCH_WITH_3_GOALS);
  await twoFollowers(match);
  const push = fakePush();
  await poll(pollOf(match, 5));
  await poll(pollOf(match));
  await queueAlerts(testDb.db); // pending rows for both users

  await testDb.db.update(users).set({ alertGoals: false }).where(eq(users.id, 'user_a'));
  await sendAlerts(testDb.db, push);

  expect(kinds(push)).toEqual([[PHONE_B, 'goal']]);
  expect((await testDb.db.select().from(notificationLog)).find((r) => r.userId === 'user_a')?.status).toBe('skipped');
});

test('a goal correction follows the goals toggle', async () => {
  // user_a had goals on when the alert was sent and turns it off before the goal is cancelled.
  const { VAR_BASE_EVENTS, AYARI_GOAL, insertVarFixture, varPoll } = await import('./poller-helpers');
  await testDb.db.insert(users).values({ id: 'user_a' });
  await testDb.db.insert(pushTokens).values({ userId: 'user_a', token: PHONE_A });
  const fixture = await insertVarFixture(testDb.db);
  await testDb.db.insert(follows).values({ userId: 'user_a', fixtureId: fixture.id });
  const push = fakePush();
  await poll(varPoll(VAR_BASE_EVENTS));
  await poll(varPoll([...VAR_BASE_EVENTS, AYARI_GOAL]));
  await deliverAlerts({ db: testDb.db, push });

  await testDb.db.update(users).set({ alertGoals: false }).where(eq(users.id, 'user_a'));
  await poll(varPoll(VAR_BASE_EVENTS));
  await poll(varPoll(VAR_BASE_EVENTS));
  await deliverAlerts({ db: testDb.db, push });

  expect(push.messages.map((m) => m.data.kind)).toEqual(['goal']);
});

// --- kickoff and full time: from the status, never from the events ---

const withStatus = (match: ReturnType<typeof recordedMatch>, short: string, elapsed: number): PollResponse => {
  const copy = structuredClone(match);
  copy.fixture.status = { ...copy.fixture.status, short, elapsed };
  return { response: [{ ...copy, events: [] }] };
};

async function kickoffFixture(match: ReturnType<typeof recordedMatch>) {
  const fixture = await twoFollowers(match);
  await testDb.db.update(fixtures).set({ status: 'NS' }).where(eq(fixtures.id, fixture.id));
  await testDb.db.update(users).set({ alertKickoff: true }).where(eq(users.id, 'user_a'));
  return fixture;
}

test('kickoff is sent once, when the match goes from not started to in play, to users who turned it on', async () => {
  const match = recordedMatch(MATCH_WITH_3_GOALS);
  const fixture = await kickoffFixture(match);
  const push = fakePush();

  await poll(withStatus(match, '1H', 1));
  await deliverAlerts({ db: testDb.db, push });
  await poll(withStatus(match, '1H', 6)); // later polls are not a new kickoff
  await deliverAlerts({ db: testDb.db, push });

  expect(kinds(push)).toEqual([[PHONE_A, 'kickoff']]);
  expect(push.messages[0].data.eventKey).toBe(`fixture:${fixture.id}:kickoff`);
  expect(push.messages[0].title).toBe('Kick-off');
});

test('a match first seen well into the first half sends no kickoff alert', async () => {
  const match = recordedMatch(MATCH_WITH_3_GOALS);
  await kickoffFixture(match);
  const push = fakePush();

  await poll(withStatus(match, '1H', 30));
  await deliverAlerts({ db: testDb.db, push });

  expect(push.messages).toEqual([]);
});

test('full time is sent once, on by default, when an in-play match finishes, and carries the score', async () => {
  const match = recordedMatch(MATCH_WITH_3_GOALS);
  const fixture = await twoFollowers(match);
  await testDb.db.update(fixtures).set({ status: '2H' }).where(eq(fixtures.id, fixture.id));
  const push = fakePush();
  const final = withStatus(match, 'FT', 90);
  final.response[0].goals = { home: 2, away: 1 };

  await poll(final);
  await deliverAlerts({ db: testDb.db, push });
  await poll(final); // the same status again
  await deliverAlerts({ db: testDb.db, push });

  expect(kinds(push)).toEqual([[PHONE_A, 'full_time'], [PHONE_B, 'full_time']]);
  expect(push.messages[0].data).toMatchObject({ eventKey: `fixture:${fixture.id}:fulltime`, homeGoals: 2, awayGoals: 1 });
  expect(push.messages[0].title).toBe('Full time');
});

test('a match that drops out of the live list and is presumed over also sends full time', async () => {
  const match = recordedMatch(MATCH_WITH_3_GOALS);
  const fixture = await twoFollowers(match);
  await testDb.db.update(fixtures).set({ status: '2H', firstPolledAt: new Date(), kickoff: new Date(Date.now() - 105 * 60_000) }).where(eq(fixtures.id, fixture.id));
  const push = fakePush();

  await poll({ response: [] }); // not listed any more
  const [row] = await testDb.db.select().from(fixtures);
  await handlePoll({ db: testDb.db, now: new Date() }, { response: [] }, [{ ...row, apiFootballId: row.apiFootballId! }]);
  await deliverAlerts({ db: testDb.db, push });

  expect(kinds(push)).toEqual([[PHONE_A, 'full_time'], [PHONE_B, 'full_time']]);
});

test('a user who turned full time off does not get it', async () => {
  const match = recordedMatch(MATCH_WITH_3_GOALS);
  const fixture = await twoFollowers(match);
  await testDb.db.update(fixtures).set({ status: '2H' }).where(eq(fixtures.id, fixture.id));
  await testDb.db.update(users).set({ alertFullTime: false }).where(eq(users.id, 'user_b'));
  const push = fakePush();

  await poll(withStatus(match, 'FT', 90));
  await deliverAlerts({ db: testDb.db, push });

  expect(kinds(push)).toEqual([[PHONE_A, 'full_time']]);
});
