import { afterEach, beforeEach, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { compareVersions } from '../../app/src/lib/version';
import { createApp } from '../src/app';
import { appConfig } from '../src/db/schema';
import type { Bindings } from '../src/env';
import { createTestDb } from './db';

let testDb: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  testDb = await createTestDb();
});
afterEach(() => testDb.close());

const env = { CLERK_SECRET_KEY: 'sk_test' } as Bindings;
const get = async () => {
  const res = await createApp(() => testDb.db).request('/config', {}, env); // no token: the check runs before sign-in
  return { status: res.status, body: (await res.json()) as { minAppVersion: string; latestAppVersion: string; downloadPageUrl: string | null } };
};
const set = (key: string, value: string) =>
  testDb.db.insert(appConfig).values({ key, value }).onConflictDoUpdate({ target: appConfig.key, set: { value } });

test('both versions and the download page come from config values set in the database', async () => {
  await set('min_app_version', '2.0.0');
  await set('latest_app_version', '2.3.1');
  await set('download_page_url', 'https://scorepulse.example/get');

  const { status, body } = await get();

  expect(status).toBe(200);
  expect(body).toEqual({ minAppVersion: '2.0.0', latestAppVersion: '2.3.1', downloadPageUrl: 'https://scorepulse.example/get' });
});

test('the owner changes a value in the database and the next check sees it', async () => {
  await set('min_app_version', '1.0.0');
  expect((await get()).body.minAppVersion).toBe('1.0.0');

  await testDb.db.update(appConfig).set({ value: '1.4.0' }).where(eq(appConfig.key, 'min_app_version'));

  expect((await get()).body.minAppVersion).toBe('1.4.0');
});

test('the config is readable without signing in, because the gate runs before sign-in', async () => {
  expect((await get()).status).toBe(200);
});

test('a version that is missing or not a version number never blocks: it falls back to 0.0.0', async () => {
  await testDb.db.delete(appConfig);
  expect((await get()).body).toMatchObject({ minAppVersion: '0.0.0', latestAppVersion: '0.0.0', downloadPageUrl: null });

  await set('min_app_version', 'soon');
  await set('latest_app_version', '2.x');
  expect((await get()).body).toMatchObject({ minAppVersion: '0.0.0', latestAppVersion: '0.0.0' });
});

test('a fresh database starts with the versions at 1.0.0, so nothing blocks until the owner raises them', async () => {
  expect((await get()).body).toMatchObject({ minAppVersion: '1.0.0', latestAppVersion: '1.0.0' });
});

// The app's rule (ADR 0007): below the minimum blocks, below the latest nags.
const blocked = (current: string, min: string) => compareVersions(current, min) < 0;

test('a version below the minimum is blocked and one at or above is not', () => {
  expect(blocked('1.0.0', '1.1.0')).toBe(true);
  expect(blocked('1.9.9', '2.0.0')).toBe(true);
  expect(blocked('1.1.0', '1.1.0')).toBe(false);
  expect(blocked('1.10.0', '1.9.0')).toBe(false); // compared as numbers, not text
  expect(blocked('2.0', '1.9.9')).toBe(false); // a short version is padded
});

test('a minimum that is not a number cannot block', () => {
  expect(blocked('1.0.0', 'abc')).toBe(false);
});
