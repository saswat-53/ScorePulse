import { eq, sql } from 'drizzle-orm';
import { pollState } from '../db/schema';
import { runBatch, type PollDb } from './db';

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

// The fallback poll of football-data.org when the day's API-Football quota is spent (ADR 0015, #21).
export const FALLBACK_STATE_ID = 'football-data';
export const FALLBACK_INTERVAL_MINUTES = 10;
// football-data.org counts as answering while its last good poll is no older than 3 intervals.
const FALLBACK_HEALTHY_MINUTES = 30;

export type PollStatus = {
  requestsToday: number;
  remaining: number;
  paused: boolean;
  // The quota is spent. `scoresOnly`: football-data.org is standing in, so scores still move (the app says
  // "limited updates"). Spent and not scoresOnly is "updates paused".
  exhausted: boolean;
  scoresOnly: boolean;
};
type StateRow = typeof pollState.$inferSelect | undefined;

// Not awaited here: the poller sends it in one batch with the fixtures query.
export const pollStateQuery = (db: PollDb, id = STATE_ID) => db.select().from(pollState).where(eq(pollState.id, id));

const requestsUsed = (row: StateRow, now: Date) => (row?.quotaDay === quotaDay(now) ? row.requestsToday : 0);
const isLow = (row: StateRow, now: Date) => requestsUsed(row, now) >= LOW_QUOTA_USED;

// `paused` is true while the interval is widened or the quota is spent: the app shows "updates paused" (#15), or
// "limited updates" when `scoresOnly` says football-data.org is covering for the spent quota (#21).
export async function getPollStatus(db: PollDb, now: Date): Promise<PollStatus> {
  const [[row], [fallback]] = (await runBatch(db, [pollStateQuery(db), pollStateQuery(db, FALLBACK_STATE_ID)])) as [StateRow[], StateRow[]];
  const requestsToday = requestsUsed(row, now);
  const exhausted = requestsToday >= DAILY_REQUESTS;
  const lastGood = fallback?.lastPolledAt ?? null;
  const scoresOnly = exhausted && lastGood !== null && now.getTime() - lastGood.getTime() <= FALLBACK_HEALTHY_MINUTES * 60_000;
  return { requestsToday, remaining: Math.max(0, DAILY_REQUESTS - requestsToday), paused: isLow(row, now), exhausted, scoresOnly };
}

// Whether the fallback poll is due: every 10 minutes, counted from the last poll that worked.
export function planFallback(row: StateRow, now: Date) {
  const last = row?.lastPolledAt ?? null;
  return { canPoll: last === null || now.getTime() - last.getTime() >= FALLBACK_INTERVAL_MINUTES * 60_000 - INTERVAL_SLACK_MS };
}

// What the poller may do right now, from the requests spent and when it last polled.
export function planPoll(row: StateRow, now: Date) {
  const low = isLow(row, now);
  const intervalMs = (low ? LOW_INTERVAL_MINUTES : NORMAL_INTERVAL_MINUTES) * 60_000;
  const lastPolledAt = row?.lastPolledAt ?? null;
  const tooSoon = lastPolledAt !== null && now.getTime() - lastPolledAt.getTime() < intervalMs - INTERVAL_SLACK_MS;
  const remaining = Math.max(0, DAILY_REQUESTS - requestsUsed(row, now));
  return { canPoll: remaining > 0 && !tooSoon, favoritesOnly: low, low, remaining };
}

// Not awaited here: it goes into the same batch as the poll's writes.
export function recordRequest(db: PollDb, now: Date, id = STATE_ID) {
  const day = quotaDay(now);
  return db
    .insert(pollState)
    .values({ id, requestsToday: 1, quotaDay: day, lastPolledAt: now })
    .onConflictDoUpdate({
      target: pollState.id,
      set: {
        requestsToday: sql`case when ${pollState.quotaDay} = ${day} then ${pollState.requestsToday} + 1 else 1 end`,
        quotaDay: day,
        lastPolledAt: now,
      },
    });
}

// Requests spent on lineups and statistics (#11). They count toward the day but leave `lastPolledAt` alone,
// so they never move the live poll off its beat.
export function recordExtraRequests(db: PollDb, now: Date, count: number) {
  const day = quotaDay(now);
  return db
    .insert(pollState)
    .values({ id: STATE_ID, requestsToday: count, quotaDay: day })
    .onConflictDoUpdate({
      target: pollState.id,
      set: {
        requestsToday: sql`case when ${pollState.quotaDay} = ${day} then ${pollState.requestsToday} + ${count} else ${count} end`,
        quotaDay: day,
      },
    });
}
