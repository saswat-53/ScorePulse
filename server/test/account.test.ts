import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createApp } from '../src/app';
import { favoriteTeams, fixtures, follows, notificationLog, pushTokens, users } from '../src/db/schema';
import type { Bindings } from '../src/env';
import { createTestDb } from './db';
import { insertFixture, MATCH_WITH_3_GOALS, recordedMatch } from './poller-helpers';

vi.mock('@clerk/backend', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@clerk/backend')>()),
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

// A Clerk that remembers which users it was asked to delete, and can be made to fail.
function fakeClerk(fail = false) {
  const deleted: string[] = [];
  return {
    deleted,
    deleteUser: async (id: string) => {
      if (fail) throw new Error('Clerk is down');
      deleted.push(id);
    },
  };
}

const WEBHOOK_SECRET = `whsec_${Buffer.from('a-test-secret-of-some-length').toString('base64')}`;
const env = { CLERK_SECRET_KEY: 'sk_test', CLERK_WEBHOOK_SECRET: WEBHOOK_SECRET } as Bindings;
const NOW = new Date('2026-11-01T12:00:00Z');
const app = (clerk = fakeClerk()) => createApp(() => testDb.db, () => NOW, () => clerk);

// Gives user_a everything an account holds, and user_b the same, so one deletion can be told from the other.
async function accountWithEverything(userId: string) {
  await testDb.db.insert(users).values({ id: userId });
  await testDb.db.insert(pushTokens).values({ userId, token: `ExponentPushToken[${userId}]` });
  await testDb.db.insert(favoriteTeams).values({ userId, teamId: 42 });
  const match = recordedMatch(MATCH_WITH_3_GOALS);
  const fixture = (await testDb.db.select().from(fixtures))[0] ?? (await insertFixture(testDb.db, match));
  await testDb.db.insert(follows).values({ userId, fixtureId: fixture.id });
  await testDb.db.insert(notificationLog).values({ userId, eventKey: `fixture:${fixture.id}:event:1` });
}
const rowsOf = async (userId: string) => ({
  user: (await testDb.db.select().from(users)).filter((r) => r.id === userId).length,
  tokens: (await testDb.db.select().from(pushTokens)).filter((r) => r.userId === userId).length,
  favorites: (await testDb.db.select().from(favoriteTeams)).filter((r) => r.userId === userId).length,
  follows: (await testDb.db.select().from(follows)).filter((r) => r.userId === userId).length,
  log: (await testDb.db.select().from(notificationLog)).filter((r) => r.userId === userId).length,
});
const GONE = { user: 0, tokens: 0, favorites: 0, follows: 0, log: 0 };
const KEPT = { user: 1, tokens: 1, favorites: 1, follows: 1, log: 1 };

// --- deleting your own account ---

const deleteMe = (clerk: ReturnType<typeof fakeClerk>, user = 'user_a') =>
  app(clerk).request('/me', { method: 'DELETE', headers: { Authorization: `Bearer token-${user}` } }, env);

test('deleting an account removes the user, their tokens, favorites, follows and alert log, and deletes the Clerk user', async () => {
  await accountWithEverything('user_a');
  await accountWithEverything('user_b');
  const clerk = fakeClerk();

  const res = await deleteMe(clerk);

  expect(res.status).toBe(204);
  expect(await rowsOf('user_a')).toEqual(GONE);
  expect(clerk.deleted).toEqual(['user_a']);
  expect(await rowsOf('user_b')).toEqual(KEPT); // nobody else is touched
});

test('deleting an account that has no rows yet still deletes the Clerk user', async () => {
  const clerk = fakeClerk();

  expect((await deleteMe(clerk)).status).toBe(204);

  expect(clerk.deleted).toEqual(['user_a']);
});

test('when Clerk cannot be reached the local rows are already gone and the error says so, so a retry finishes the job', async () => {
  await accountWithEverything('user_a');

  const res = await deleteMe(fakeClerk(true));

  expect(res.status).toBe(502);
  expect(await res.json()).toEqual({ error: 'clerk_delete_failed' });
  expect(await rowsOf('user_a')).toEqual(GONE);

  const clerk = fakeClerk();
  expect((await deleteMe(clerk)).status).toBe(204);
  expect(clerk.deleted).toEqual(['user_a']);
});

test('deleting an account needs a signed-in user', async () => {
  expect((await app().request('/me', { method: 'DELETE' }, env)).status).toBe(401);
});

// --- the Clerk user.deleted webhook ---

// Signs a body the way Svix does: HMAC-SHA256 of "id.timestamp.body" with the secret's decoded bytes.
function signed(body: string, opts: { id?: string; timestamp?: number; secret?: string } = {}) {
  const id = opts.id ?? 'msg_1';
  const timestamp = opts.timestamp ?? Math.floor(NOW.getTime() / 1000);
  const key = Buffer.from((opts.secret ?? WEBHOOK_SECRET).replace(/^whsec_/, ''), 'base64');
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return { 'svix-id': id, 'svix-timestamp': String(timestamp), 'svix-signature': `v1,${signature}`, 'Content-Type': 'application/json' };
}
const hook = (body: string, headers: Record<string, string>, e: Bindings = env) =>
  app().request('/webhooks/clerk', { method: 'POST', headers, body }, e);
const userDeleted = (id: string) => JSON.stringify({ type: 'user.deleted', data: { id, deleted: true, object: 'user' } });

test('a signed user.deleted event removes the local rows that remain', async () => {
  await accountWithEverything('user_a');
  await accountWithEverything('user_b');
  const body = userDeleted('user_a');

  const res = await hook(body, signed(body));

  expect(res.status).toBe(200);
  expect(await rowsOf('user_a')).toEqual(GONE);
  expect(await rowsOf('user_b')).toEqual(KEPT);
});

test('the webhook is harmless when the rows are already gone, and does not call Clerk again', async () => {
  const body = userDeleted('user_a');
  const clerk = fakeClerk();

  const res = await createApp(() => testDb.db, () => NOW, () => clerk).request('/webhooks/clerk', { method: 'POST', headers: signed(body), body }, env);

  expect(res.status).toBe(200);
  expect(clerk.deleted).toEqual([]);
});

test('an event with a wrong signature is rejected and deletes nothing', async () => {
  await accountWithEverything('user_a');
  const body = userDeleted('user_a');
  const other = `whsec_${Buffer.from('some-other-secret').toString('base64')}`;

  expect((await hook(body, signed(body, { secret: other }))).status).toBe(401);
  expect((await hook(body, { 'Content-Type': 'application/json' })).status).toBe(401);
  expect((await hook(userDeleted('user_b'), signed(body))).status).toBe(401); // signed for a different body
  expect(await rowsOf('user_a')).toEqual(KEPT);
});

test('an old signed event is rejected, so a captured one cannot be replayed later', async () => {
  await accountWithEverything('user_a');
  const body = userDeleted('user_a');
  const tenMinutesAgo = Math.floor(NOW.getTime() / 1000) - 600;

  expect((await hook(body, signed(body, { timestamp: tenMinutesAgo }))).status).toBe(401);
  expect(await rowsOf('user_a')).toEqual(KEPT);
});

test('other Clerk events are accepted and ignored', async () => {
  await accountWithEverything('user_a');
  const body = JSON.stringify({ type: 'user.created', data: { id: 'user_a' } });

  expect((await hook(body, signed(body))).status).toBe(200);
  expect(await rowsOf('user_a')).toEqual(KEPT);
});

test('without a webhook secret configured the endpoint refuses everything', async () => {
  const body = userDeleted('user_a');

  expect((await hook(body, signed(body), { CLERK_SECRET_KEY: 'sk_test' } as Bindings)).status).toBe(500);
});
