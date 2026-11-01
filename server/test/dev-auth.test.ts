import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createApp } from '../src/app';
import { users } from '../src/db/schema';
import type { Bindings } from '../src/env';
import { createTestDb } from './db';

// Clerk is real here only for tokens that are not dev tokens: any other token is invalid.
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

const on = { CLERK_SECRET_KEY: 'sk_test', DEV_AUTH_BYPASS: 'true' } as Bindings;
const call = (token: string, env: Bindings, url = 'http://localhost:8787/me') =>
  createApp(() => testDb.db).request(url, { headers: { Authorization: `Bearer ${token}` } }, env);

// A local development sign-in without the email code (never in a deployed server).

test('with the flag on, a dev token on a local address signs in as that dev user', async () => {
  const res = await call('dev-tester', on);

  expect(res.status).toBe(200);
  expect(((await res.json()) as { user: { id: string } }).user.id).toBe('user_dev_tester');
  expect((await testDb.db.select().from(users)).map((u) => u.id)).toEqual(['user_dev_tester']);
});

test('the flag works from the home network too, which is where a phone reaches the laptop', async () => {
  for (const host of ['127.0.0.1:8787', '192.168.1.4:8787', '10.0.0.7:8787', '172.20.1.2:8787']) {
    expect((await call('dev-tester', on, `http://${host}/me`)).status).toBe(200);
  }
});

test('with the flag off or missing, a dev token is just an invalid token', async () => {
  expect((await call('dev-tester', { CLERK_SECRET_KEY: 'sk_test' } as Bindings)).status).toBe(401);
  expect((await call('dev-tester', { ...on, DEV_AUTH_BYPASS: 'false' })).status).toBe(401);
  expect((await call('dev-tester', { ...on, DEV_AUTH_BYPASS: '1' })).status).toBe(401); // only exactly "true"
  expect(await testDb.db.select().from(users)).toEqual([]);
});

test('even with the flag on, a deployed address never accepts a dev token', async () => {
  for (const url of [
    'https://scorepulse-api.workers.dev/me',
    'https://api.scorepulse.example/me',
    'http://localhost.evil.example/me',
    'http://192.168.1.4.evil.example/me',
    'http://172.40.0.1/me', // not a private range
  ]) {
    expect((await call('dev-tester', on, url)).status).toBe(401);
  }
});

test('a dev token must look like one', async () => {
  for (const token of ['dev-', 'dev-UPPER', 'dev-has space', 'dev-../x', `dev-${'a'.repeat(41)}`, 'devtester']) {
    expect((await call(token, on)).status).toBe(401);
  }
});

test('real tokens still go through Clerk as before, flag on or off', async () => {
  expect((await call('token-user_real', on)).status).toBe(200);
  expect((await call('token-user_real', { CLERK_SECRET_KEY: 'sk_test' } as Bindings)).status).toBe(200);
  expect((await call('garbage', on)).status).toBe(401);
});

test('deleting a dev account does not ask Clerk, which has no such user', async () => {
  const deleted: string[] = [];
  const app = createApp(() => testDb.db, () => new Date(), () => ({ deleteUser: async (id: string) => void deleted.push(id) }));
  await call('dev-tester', on); // creates the row

  const res = await app.request('http://localhost:8787/me', { method: 'DELETE', headers: { Authorization: 'Bearer dev-tester' } }, on);

  expect(res.status).toBe(204);
  expect(deleted).toEqual([]);
  expect(await testDb.db.select().from(users)).toEqual([]);
});
