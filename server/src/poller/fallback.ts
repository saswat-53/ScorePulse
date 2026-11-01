import { eq, sql } from 'drizzle-orm';
import { fixtures } from '../db/schema';
import { STATUS, type FdMatchesResponse } from '../sync/snapshot';
import type { PollDb, Statement } from './db';
import { HALFTIME, IN_PLAY } from './status';

// football-data.org as the live source while API-Football's quota is spent (ADR 0015, #21): one request for all
// live matches of the five leagues. It carries only score and status, so it updates those and adds no events.
export type ScoreProvider = { fetchLiveScores(): Promise<FdMatchesResponse> };

type Due = Pick<typeof fixtures.$inferSelect, 'id' | 'footballDataId' | 'status' | 'homeGoals' | 'awayGoals' | 'firstPolledAt'>;

export function applyFallbackScores(db: PollDb, response: FdMatchesResponse, due: Due[], now: Date) {
  const byFdId = new Map(response.matches.map((m) => [m.id, m]));
  const statements: Statement[] = [];
  let alertsOwed = false;

  for (const fixture of due) {
    const match = fixture.footballDataId === null ? undefined : byFdId.get(fixture.footballDataId);
    if (!match) continue;
    const status = STATUS[match.status] ?? fixture.status;
    const homeGoals = match.score.fullTime.home ?? fixture.homeGoals;
    const awayGoals = match.score.fullTime.away ?? fixture.awayGoals;
    const before = (fixture.homeGoals ?? 0) + (fixture.awayGoals ?? 0);
    const after = (homeGoals ?? 0) + (awayGoals ?? 0);
    // Only a score that goes up in a match already seen in play is news; one first seen at 2-1 is history.
    const seenInPlay = [...IN_PLAY, HALFTIME].includes(fixture.status);
    const scoredUp = seenInPlay && after > before;
    // Goals announced here have no event rows yet. If API-Football has polled this match before, its timeline will
    // bring them as new events: count them so that many are not alerted a second time.
    const uncovered = scoredUp && fixture.firstPolledAt !== null ? after - before : 0;
    statements.push(
      db
        .update(fixtures)
        .set({
          status,
          homeGoals,
          awayGoals,
          updatedAt: now,
          lastPolledAt: now,
          ...(scoredUp && { scoreAlertDue: true }),
          ...(uncovered > 0 && { uncoveredGoals: sql`${fixtures.uncoveredGoals} + ${uncovered}` }),
        })
        .where(eq(fixtures.id, fixture.id)),
    );
    alertsOwed ||= scoredUp;
  }
  return { statements, alertsOwed };
}
