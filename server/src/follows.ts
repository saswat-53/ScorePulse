import { and, eq, gt, notInArray } from 'drizzle-orm';
import { fixtures, follows } from './db/schema';
import type { PollDb } from './poller/db';
import { ENDED, MAX_MATCH_HOURS } from './poller/status';

// A match is over at an ended status, or when its kickoff is further back than a match can last (its status may never
// have been updated). Migration 0012 counts active follows the same way.
export const isOver = (f: { status: string; kickoff: Date }, now: Date) =>
  ENDED.includes(f.status) || f.kickoff.getTime() <= now.getTime() - MAX_MATCH_HOURS * 3_600_000;

// The fixture ids a user follows whose match is not over.
export async function activeFollowIds(db: PollDb, userId: string, now: Date) {
  const rows = await db
    .select({ fixtureId: follows.fixtureId })
    .from(follows)
    .innerJoin(fixtures, eq(fixtures.id, follows.fixtureId))
    .where(
      and(
        eq(follows.userId, userId),
        notInArray(fixtures.status, ENDED),
        gt(fixtures.kickoff, new Date(now.getTime() - MAX_MATCH_HOURS * 3_600_000)),
      ),
    );
  return rows.map((r) => r.fixtureId);
}
