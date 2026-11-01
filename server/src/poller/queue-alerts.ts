import { and, eq, inArray, isNull, like, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { favoriteTeams, fixtureEvents, fixtures, follows, notificationLog, teamMap, type AlertPayload } from '../db/schema';
import { runBatch, type PollDb, type Statement } from './db';
import { GOAL_DETAILS } from './handle-poll';

const formatMinute = (t: { elapsed: number; extra: number | null }) => `${t.elapsed}${t.extra ? `+${t.extra}` : ''}'`;
const goalKey = (fixtureId: number, eventId: number) => `fixture:${fixtureId}:event:${eventId}`;

const home = alias(teamMap, 'home_team');
const away = alias(teamMap, 'away_team');

type EventRow = typeof fixtureEvents.$inferSelect;

// Goals and corrections the poller owes (flags on the event rows, written with the event) become one pending
// notification_log row per recipient, and the flags are cleared in the same batch. A run cut off before that batch
// leaves the flags in place, so the next run does it: late, never lost. Every row is keyed on (user, event), so
// doing it twice adds nothing.
export async function queueAlerts(db: PollDb): Promise<boolean> {
  const owed = or(eq(fixtureEvents.alertState, 'due'), eq(fixtureEvents.correctionDue, true));
  const owedFixtures = db.select({ id: fixtureEvents.fixtureId }).from(fixtureEvents).where(owed);

  const [dueRows, standingGoals, followers, fans, names] = (await runBatch(db, [
    db.select().from(fixtureEvents).where(owed),
    db
      .select()
      .from(fixtureEvents)
      .where(
        and(
          inArray(fixtureEvents.fixtureId, owedFixtures),
          eq(fixtureEvents.type, 'Goal'),
          inArray(fixtureEvents.detail, [...GOAL_DETAILS]),
          isNull(fixtureEvents.removedAt),
        ),
      ),
    db.select({ fixtureId: follows.fixtureId, userId: follows.userId }).from(follows).where(inArray(follows.fixtureId, owedFixtures)),
    db
      .select({ fixtureId: fixtures.id, userId: favoriteTeams.userId })
      .from(fixtures)
      .innerJoin(favoriteTeams, or(eq(favoriteTeams.teamId, fixtures.homeTeamId), eq(favoriteTeams.teamId, fixtures.awayTeamId)))
      .where(inArray(fixtures.id, owedFixtures)),
    db
      .select({ fixtureId: fixtures.id, homeTeamId: fixtures.homeTeamId, home: home.shortName, away: away.shortName })
      .from(fixtures)
      .leftJoin(home, eq(home.apiFootballId, fixtures.homeTeamId))
      .leftJoin(away, eq(away.apiFootballId, fixtures.awayTeamId))
      .where(inArray(fixtures.id, owedFixtures)),
  ])) as [EventRow[], EventRow[], { fixtureId: number; userId: string }[], { fixtureId: number; userId: string }[], { fixtureId: number; homeTeamId: number; home: string | null; away: string | null }[]];
  if (dueRows.length === 0) return false;

  // Corrections go to the users who were sent the goal alert. Read once, and only when there are corrections.
  const corrections = dueRows.filter((e) => e.correctionDue);
  const goalLog = corrections.length
    ? ((await db
        .select()
        .from(notificationLog)
        .where(inArray(notificationLog.eventKey, corrections.map((e) => goalKey(e.fixtureId, e.id))))) as (typeof notificationLog.$inferSelect)[])
    : [];

  const recipientsOf = (fixtureId: number) =>
    new Set([...followers, ...fans].filter((r) => r.fixtureId === fixtureId).map((r) => r.userId));

  const statements: Statement[] = [];
  const rows: (typeof notificationLog.$inferInsert)[] = [];

  for (const e of dueRows) {
    const fixture = names.find((n) => n.fixtureId === e.fixtureId);
    if (!fixture) continue;
    const goals = standingGoals
      .filter((g) => g.fixtureId === e.fixtureId)
      .sort((a, b) => a.elapsed - b.elapsed || (a.extra ?? 0) - (b.extra ?? 0) || a.id - b.id);
    // The API credits a goal, an own goal too, to the side that gains it.
    const score = (upTo?: EventRow) => {
      const s = { home: 0, away: 0 };
      for (const g of goals) {
        if (g.teamId === fixture.homeTeamId) s.home++;
        else s.away++;
        if (upTo && g.id === upTo.id) break;
      }
      return s;
    };
    const base = { fixtureId: e.fixtureId, homeName: fixture.home ?? 'Home', awayName: fixture.away ?? 'Away', minute: formatMinute(e) };

    if (e.alertState === 'due') {
      const { home: h, away: a } = score(e);
      const payload: AlertPayload = { ...base, kind: 'goal', eventKey: goalKey(e.fixtureId, e.id), scorer: e.playerName, homeGoals: h, awayGoals: a };
      for (const userId of recipientsOf(e.fixtureId)) rows.push({ userId, eventKey: payload.eventKey, payload });
      statements.push(db.update(fixtureEvents).set({ alertState: 'issued' }).where(eq(fixtureEvents.id, e.id)));
    }

    if (e.correctionDue) {
      const { home: h, away: a } = score();
      const key = goalKey(e.fixtureId, e.id);
      const payload: AlertPayload = { ...base, kind: 'goal_removed', eventKey: `${key}:removed`, scorer: null, homeGoals: h, awayGoals: a };
      const current = recipientsOf(e.fixtureId);
      for (const sent of goalLog.filter((l) => l.eventKey === key)) {
        // A goal alert still waiting is simply withdrawn; one already sent is corrected. A user who no longer follows
        // the match or its teams hears nothing more.
        if (sent.status === 'pending' || sent.status === 'failed') {
          statements.push(db.update(notificationLog).set({ status: 'skipped' }).where(eq(notificationLog.id, sent.id)));
        } else if (sent.status === 'sent' && current.has(sent.userId)) {
          rows.push({ userId: sent.userId, eventKey: payload.eventKey, payload });
        }
      }
      statements.push(db.update(fixtureEvents).set({ correctionDue: false }).where(eq(fixtureEvents.id, e.id)));
    }
  }

  if (rows.length) statements.unshift(db.insert(notificationLog).values(rows).onConflictDoNothing());
  await runBatch(db, statements);
  return true;
}
