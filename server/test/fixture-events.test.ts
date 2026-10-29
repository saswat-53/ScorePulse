import { afterEach, expect, test } from 'vitest';
import { fixtureEvents, fixtures } from '../src/db/schema';
import { createTestDb } from './db';

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

async function withFixture() {
  const test = await createTestDb();
  close = test.close;
  const [fixture] = await test.db
    .insert(fixtures)
    .values({
      leagueId: 39,
      homeTeamId: 1,
      awayTeamId: 2,
      kickoff: new Date('2026-10-29T16:00:00Z'),
      status: '1H',
      source: 'api-football',
    })
    .returning();
  return { db: test.db, fixtureId: fixture.id };
}

test('the same event inserted twice, with NULL extra minute and NULL player, is stored once', async () => {
  const { db, fixtureId } = await withFixture();
  const event = {
    fixtureId,
    elapsed: 20,
    extra: null,
    teamId: 1,
    playerId: null,
    type: 'Goal',
    detail: 'Normal Goal',
  };

  await db.insert(fixtureEvents).values(event).onConflictDoNothing();
  await db.insert(fixtureEvents).values(event).onConflictDoNothing();

  expect(await db.select().from(fixtureEvents)).toHaveLength(1);
});

test('events that differ in one key column are both stored', async () => {
  const { db, fixtureId } = await withFixture();
  const goal = { fixtureId, elapsed: 20, extra: null, teamId: 1, playerId: null, type: 'Goal', detail: 'Normal Goal' };

  await db.insert(fixtureEvents).values(goal).onConflictDoNothing();
  await db.insert(fixtureEvents).values({ ...goal, extra: 2 }).onConflictDoNothing();
  await db.insert(fixtureEvents).values({ ...goal, detail: 'Penalty' }).onConflictDoNothing();

  expect(await db.select().from(fixtureEvents)).toHaveLength(3);
});
