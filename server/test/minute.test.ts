import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp } from '../src/app';
import { fixtures, follows, teamMap, users } from '../src/db/schema';
import type { Bindings } from '../src/env';
import { handlePoll, type PollResponse } from '../src/poller/handle-poll';
import { createTestDb } from './db';
import { insertFixture, MATCH_WITH_3_GOALS, pollOf, recordedMatch } from './poller-helpers';

vi.mock('@clerk/backend', () => ({
  verifyToken: async (token: string) => {
    if (!token.startsWith('token-')) throw new Error('invalid token');
    return { sub: token.slice('token-'.length) };
  },
}));

let testDb: Awaited<ReturnType<typeof createTestDb>>;
beforeEach(async () => {
  testDb = await createTestDb();
  await testDb.db.insert(users).values({ id: 'user_a' });
});
afterEach(() => testDb.close());

const env = { CLERK_SECRET_KEY: 'sk_test' } as Bindings;
const match = recordedMatch(MATCH_WITH_3_GOALS);

async function fixtureInPlay() {
  await testDb.db.insert(teamMap).values([
    { footballDataId: 1, apiFootballId: match.teams.home.id, name: 'Home FC' },
    { footballDataId: 2, apiFootballId: match.teams.away.id, name: 'Away FC' },
  ]);
  const fixture = await insertFixture(testDb.db, match, { status: '1H', firstPolledAt: new Date() });
  await testDb.db.insert(follows).values({ userId: 'user_a', fixtureId: fixture.id });
  return fixture;
}
const poll = async (response: PollResponse) => {
  const row = (await testDb.db.select().from(fixtures))[0];
  await handlePoll({ db: testDb.db, now: new Date() }, response, [{ ...row, apiFootballId: row.apiFootballId! }]);
};
const withMinute = (elapsed: number | null, short = '1H'): PollResponse => {
  const copy = structuredClone(pollOf(match)) as unknown as PollResponse;
  copy.response[0].fixture.status = { short, elapsed };
  return copy;
};
const minuteOf = async (id: number) => {
  const res = await createApp(() => testDb.db).request(`/matches/${id}`, { headers: { Authorization: 'Bearer token-user_a' } }, env);
  const body = (await res.json()) as { match: { minute: number | null; status: string } };
  return body.match;
};

test('the match API gives the minute the provider last reported, and it moves with each poll', async () => {
  const fixture = await fixtureInPlay();

  await poll(withMinute(23));
  expect((await minuteOf(fixture.id)).minute).toBe(23);

  await poll(withMinute(28));
  expect((await minuteOf(fixture.id)).minute).toBe(28);
});

test('a poll that gives no minute leaves the last one', async () => {
  const fixture = await fixtureInPlay();
  await poll(withMinute(23));

  await poll(withMinute(null));

  expect((await minuteOf(fixture.id)).minute).toBe(23);
});

test('the minute is only given while the ball is in play: not at halftime, not before kickoff, not after full time', async () => {
  const fixture = await fixtureInPlay();
  await poll(withMinute(45));

  for (const status of ['HT', 'NS', 'FT']) {
    await testDb.db.update(fixtures).set({ status }).where(eq(fixtures.id, fixture.id));
    expect((await minuteOf(fixture.id)).minute).toBeNull();
  }
});
