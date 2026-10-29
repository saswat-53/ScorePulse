import { afterEach, expect, test } from 'vitest';
import { fixtureEvents, fixtures, notificationLog, pollState, users } from '../src/db/schema';
import { createTestDb } from './db';

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

test('migrations apply cleanly to an empty database and leave every core table empty and queryable', async () => {
  const test = await createTestDb();
  close = test.close;

  for (const table of [users, fixtures, fixtureEvents, notificationLog, pollState]) {
    expect(await test.db.select().from(table)).toEqual([]);
  }
});
