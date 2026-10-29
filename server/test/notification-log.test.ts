import { afterEach, expect, test } from 'vitest';
import { notificationLog, users } from '../src/db/schema';
import { createTestDb } from './db';

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

async function withUsers() {
  const testDb = await createTestDb();
  close = testDb.close;
  await testDb.db.insert(users).values([{ id: 'user_a' }, { id: 'user_b' }]);
  return testDb.db;
}

test('the same user and event key logged twice is stored once', async () => {
  const db = await withUsers();
  const sent = { userId: 'user_a', eventKey: 'fixture:1:event:7' };

  await db.insert(notificationLog).values(sent).onConflictDoNothing();
  await db.insert(notificationLog).values(sent).onConflictDoNothing();

  expect(await db.select().from(notificationLog)).toHaveLength(1);
});

test('the same event key for a different user is a separate row', async () => {
  const db = await withUsers();

  await db.insert(notificationLog).values({ userId: 'user_a', eventKey: 'fixture:1:event:7' }).onConflictDoNothing();
  await db.insert(notificationLog).values({ userId: 'user_b', eventKey: 'fixture:1:event:7' }).onConflictDoNothing();

  expect(await db.select().from(notificationLog)).toHaveLength(2);
});
