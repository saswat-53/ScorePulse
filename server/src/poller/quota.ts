import { eq, sql } from 'drizzle-orm';
import { pollState } from '../db/schema';
import type { PollDb } from './db';

// API-Football's free plan: 100 requests a day. The poller counts what it spends (ADR 0016).
export const DAILY_REQUESTS = 100;
// From this many requests used, the interval widens and follow-only matches pause (ADR 0013, 0016).
export const LOW_QUOTA_USED = 70;
export const NORMAL_INTERVAL_MINUTES = 5;
export const LOW_INTERVAL_MINUTES = 10;
// Cron fires on the minute, give or take: a run this close to the beat still counts as on it.
const INTERVAL_SLACK_MS = 30_000;

const STATE_ID = 'api-football';
const quotaDay = (now: Date) => now.toISOString().slice(0, 10); // UTC, the day the free quota resets on

export type PollStatus = { requestsToday: number; remaining: number; paused: boolean };
type StateRow = typeof pollState.$inferSelect | undefined;

// Not awaited here: the poller sends it in one batch with the fixtures query.
export const pollStateQuery = (db: PollDb) => db.select().from(pollState).where(eq(pollState.id, STATE_ID));

const requestsUsed = (row: StateRow, now: Date) => (row?.quotaDay === quotaDay(now) ? row.requestsToday : 0);
const isLow = (row: StateRow, now: Date) => requestsUsed(row, now) >= LOW_QUOTA_USED;

// `paused` is true while the interval is widened or the quota is spent: the app shows "updates paused" (#15).
export async function getPollStatus(db: PollDb, now: Date): Promise<PollStatus> {
  const [row] = await pollStateQuery(db);
  const requestsToday = requestsUsed(row, now);
  return { requestsToday, remaining: Math.max(0, DAILY_REQUESTS - requestsToday), paused: isLow(row, now) };
}

// What the poller may do right now, from the requests spent and when it last polled.
export function planPoll(row: StateRow, now: Date) {
  const low = isLow(row, now);
  const intervalMs = (low ? LOW_INTERVAL_MINUTES : NORMAL_INTERVAL_MINUTES) * 60_000;
  const lastPolledAt = row?.lastPolledAt ?? null;
  const tooSoon = lastPolledAt !== null && now.getTime() - lastPolledAt.getTime() < intervalMs - INTERVAL_SLACK_MS;
  return { canPoll: requestsUsed(row, now) < DAILY_REQUESTS && !tooSoon, favoritesOnly: low };
}

// Not awaited here: it goes into the same batch as the poll's writes.
export function recordRequest(db: PollDb, now: Date) {
  const day = quotaDay(now);
  return db
    .insert(pollState)
    .values({ id: STATE_ID, requestsToday: 1, quotaDay: day, lastPolledAt: now })
    .onConflictDoUpdate({
      target: pollState.id,
      set: {
        requestsToday: sql`case when ${pollState.quotaDay} = ${day} then ${pollState.requestsToday} + 1 else 1 end`,
        quotaDay: day,
        lastPolledAt: now,
      },
    });
}
