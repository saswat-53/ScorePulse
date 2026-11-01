import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createApp } from '../src/app';
import { pushTokens } from '../src/db/schema';
import type { Bindings } from '../src/env';
import { createTestDb } from './db';

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

const PHONE = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const TABLET = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';

const env = { CLERK_SECRET_KEY: 'sk_test', MIN_APP_VERSION: '1.0.0' } as Bindings;
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
const register = (user: string | undefined, token: string) => call('PUT', '/devices', user, { token });
const signOutDevice = (user: string | undefined, token: string) => call('DELETE', `/devices?token=${encodeURIComponent(token)}`, user);
const stored = async () => (await testDb.db.select().from(pushTokens)).map((r) => [r.userId, r.token]).sort();

test('a device registers its push token under the signed-in account', async () => {
  const res = await register('user_a', PHONE);

  expect(res.status).toBe(200);
  expect(await stored()).toEqual([['user_a', PHONE]]);
});

test('an account can register several devices, and each gets its own row', async () => {
  await register('user_a', PHONE);
  await register('user_a', TABLET);

  expect(await stored()).toEqual([['user_a', PHONE], ['user_a', TABLET]]);
});

test('registering the same token again keeps one row', async () => {
  await register('user_a', PHONE);
  await register('user_a', PHONE);

  expect(await stored()).toEqual([['user_a', PHONE]]);
});

test('a device that signs in as someone else moves its token to that account, so the old account stops getting its alerts', async () => {
  await register('user_a', PHONE);

  await register('user_b', PHONE);

  expect(await stored()).toEqual([['user_b', PHONE]]);
});

test('signing out deletes only that device\'s token', async () => {
  await register('user_a', PHONE);
  await register('user_a', TABLET);

  const res = await signOutDevice('user_a', PHONE);

  expect(res.status).toBe(204);
  expect(await stored()).toEqual([['user_a', TABLET]]);
});

test('one account cannot delete another account\'s token', async () => {
  await register('user_a', PHONE);

  await signOutDevice('user_b', PHONE);

  expect(await stored()).toEqual([['user_a', PHONE]]);
});

test('deleting a token that is not registered is fine', async () => {
  expect((await signOutDevice('user_a', PHONE)).status).toBe(204);
});

test('a token that is not an Expo push token is rejected', async () => {
  for (const token of ['', 'abc', 'fcm:APA91b...', 'ExponentPushToken[]']) {
    expect((await register('user_a', token)).status).toBe(400);
  }
  expect((await call('PUT', '/devices', 'user_a', {})).status).toBe(400);
  expect(await stored()).toEqual([]);
});

test('the device routes need a signed-in user', async () => {
  expect((await register(undefined, PHONE)).status).toBe(401);
  expect((await signOutDevice(undefined, PHONE)).status).toBe(401);
});
