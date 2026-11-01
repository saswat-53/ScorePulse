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

const env = { CLERK_SECRET_KEY: 'sk_test' } as Bindings;
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

  expect(await res.json()).toEqual({ ok: true });
});

// The web build runs on localhost:8081 in development and asks the server's permission first (a CORS pre-flight).
// The shipped app is native and sends no origin, so only local dev origins are allowed.
const preflight = (origin: string, path = '/favorites') =>
  createApp(() => testDb.db).request(
    path,
    { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization,content-type' } },
    env,
  );

test('a pre-flight from the local web build is answered, and allows the headers and methods the app uses', async () => {
  const res = await preflight('http://localhost:8081');

  expect(res.status).toBe(204);
  expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:8081');
  expect(res.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('authorization');
  expect(res.headers.get('access-control-allow-methods')).toMatch(/PUT/);
  expect(res.headers.get('access-control-allow-methods')).toMatch(/DELETE/);
});

test('a real request from the local web build carries the allow header too', async () => {
  const res = await createApp(() => testDb.db).request('/config', { headers: { Origin: 'http://localhost:8081' } }, env);

  expect(res.status).toBe(200);
  expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:8081');
});

test('any other website is not allowed to call the API from a browser', async () => {
  for (const origin of ['https://evil.example', 'http://localhost.evil.example', 'http://192.168.1.4:8081']) {
    const res = await preflight(origin);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  }
});
