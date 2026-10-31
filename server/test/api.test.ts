import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { users } from '../src/db/schema';
import { createApp } from '../src/app';
import type { Bindings } from '../src/env';
import { createTestDb } from './db';

// Clerk stubbed: the token "token-<id>" belongs to user "<id>"; any other token is invalid. The real
// check (signature, expiry) is Clerk's, so the test only proves our wiring around it.
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

const env = { CLERK_SECRET_KEY: 'sk_test', MIN_APP_VERSION: '1.0.0' } as Bindings;
const call = (path: string, init: RequestInit = {}, token?: string) =>
  createApp(() => testDb.db).request(
    path,
    { ...init, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } },
    env,
  );

test('a valid Clerk token reaches a protected route and creates the user', async () => {
  const res = await call('/me', {}, 'token-user_a');

  expect(res.status).toBe(200);
  expect(((await res.json()) as { user: unknown }).user).toMatchObject({ id: 'user_a' });
  expect(await testDb.db.select().from(users).where(eq(users.id, 'user_a'))).toHaveLength(1);
});

test('a missing token is rejected', async () => {
  expect((await call('/me')).status).toBe(401);
});

test('an invalid token is rejected and creates no user', async () => {
  const res = await call('/me', {}, 'not-a-clerk-token');

  expect(res.status).toBe(401);
  expect(await testDb.db.select().from(users)).toEqual([]);
});

test('a public route needs no token', async () => {
  const res = await call('/health');

  expect(await res.json()).toEqual({ ok: true, minAppVersion: '1.0.0' });
});
