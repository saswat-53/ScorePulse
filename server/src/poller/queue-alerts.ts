import { and, eq, inArray, isNull, like, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { favoriteTeams, fixtureEvents, fixtures, follows, notificationLog, teamMap, users, type AlertPayload } from '../db/schema';
import { runBatch, type PollDb, type Statement } from './db';
import { GOAL_DETAILS } from './handle-poll';
import { wantsAlert } from './settings';

const formatMinute = (t: { elapsed: number; extra: number | null }) => `${t.elapsed}${t.extra ? `+${t.extra}` : ''}'`;
const goalKey = (fixtureId: number, eventId: number) => `fixture:${fixtureId}:event:${eventId}`;

const home = alias(teamMap, 'home_team');
const away = alias(teamMap, 'away_team');

type EventRow = typeof fixtureEvents.$inferSelect;

// A card or a substitution as an alert. The score is the one stored when the alert is written.
function eventAlert(
  e: EventRow,
  base: { fixtureId: number; homeName: string; awayName: string; minute: string },
  fixture: { homeGoals: number | null; awayGoals: number | null },
): AlertPayload | null {
  const common = { ...base, scorer: null, homeGoals: fixture.homeGoals ?? 0, awayGoals: fixture.awayGoals ?? 0, player: e.playerName };
  const eventKey = `fixture:${e.fixtureId}:event:${e.id}`;
  if (e.type === 'Card') return { ...common, kind: 'card', eventKey, card: e.detail === 'Yellow Card' ? 'yellow' : 'red' };
  if (e.type === 'subst') return { ...common, kind: 'substitution', eventKey, related: e.assistName };
  return null;
}

// Goals and corrections the poller owes (flags on the event rows, written with the event) become one pending
// notification_log row per recipient, and the flags are cleared in the same batch. A run cut off before that batch
// leaves the flags in place, so the next run does it: late, never lost. Every row is keyed on (user, event), so
// doing it twice adds nothing.
export async function queueAlerts(db: PollDb): Promise<boolean> {
  const owed = or(eq(fixtureEvents.alertState, 'due'), eq(fixtureEvents.correctionDue, true));
  const owedStatus = or(eq(fixtures.kickoffAlertDue, true), eq(fixtures.fullTimeAlertDue, true));
  const owedByEvent = db.select({ id: fixtureEvents.fixtureId }).from(fixtureEvents).where(owed);
  const owedByStatus = db.select({ id: fixtures.id }).from(fixtures).where(owedStatus);
  const isOwed = (column: Parameters<typeof inArray>[0]) => or(inArray(column, owedByEvent), inArray(column, owedByStatus))!;

  const [dueRows, standingGoals, followers, fans, names, wants] = (await runBatch(db, [
    db.select().from(fixtureEvents).where(owed),
    db
      .select()
      .from(fixtureEvents)
      .where(
        and(
          inArray(fixtureEvents.fixtureId, owedByEvent),
          eq(fixtureEvents.type, 'Goal'),
          inArray(fixtureEvents.detail, [...GOAL_DETAILS]),
          isNull(fixtureEvents.removedAt),
        ),
      ),
    db.select({ fixtureId: follows.fixtureId, userId: follows.userId }).from(follows).where(isOwed(follows.fixtureId)),
    db
      .select({ fixtureId: fixtures.id, userId: favoriteTeams.userId })
      .from(fixtures)
      .innerJoin(favoriteTeams, or(eq(favoriteTeams.teamId, fixtures.homeTeamId), eq(favoriteTeams.teamId, fixtures.awayTeamId)))
      .where(isOwed(fixtures.id)),
    db
      .select({
        fixtureId: fixtures.id,
        homeTeamId: fixtures.homeTeamId,
        homeGoals: fixtures.homeGoals,
        awayGoals: fixtures.awayGoals,
        kickoffDue: fixtures.kickoffAlertDue,
        fullTimeDue: fixtures.fullTimeAlertDue,
        home: home.shortName,
        away: away.shortName,
      })
      .from(fixtures)
      .leftJoin(home, eq(home.apiFootballId, fixtures.homeTeamId))
      .leftJoin(away, eq(away.apiFootballId, fixtures.awayTeamId))
      .where(isOwed(fixtures.id)),
    // Every user's toggles. The group is 5 to 10 people (ADR 0005), so reading them all is one tiny query.
    db.select().from(users),
  ])) as [
    EventRow[],
    EventRow[],
    { fixtureId: number; userId: string }[],
    { fixtureId: number; userId: string }[],
    { fixtureId: number; homeTeamId: number; homeGoals: number | null; awayGoals: number | null; kickoffDue: boolean; fullTimeDue: boolean; home: string | null; away: string | null }[],
    (typeof users.$inferSelect)[],
  ];
  if (dueRows.length === 0 && !names.some((n) => n.kickoffDue || n.fullTimeDue)) return false;

  // Corrections go to the users who were sent the goal alert. Read once, and only when there are corrections.
  const corrections = dueRows.filter((e) => e.correctionDue);
  const goalLog = corrections.length
    ? ((await db
        .select()
        .from(notificationLog)
        .where(inArray(notificationLog.eventKey, corrections.map((e) => goalKey(e.fixtureId, e.id))))) as (typeof notificationLog.$inferSelect)[])
    : [];

  // Who follows the match or has a team in it, and wants this kind of alert.
  const recipientsOf = (fixtureId: number, kind: AlertPayload['kind']) =>
    new Set(
      [...followers, ...fans]
        .filter((r) => r.fixtureId === fixtureId && wantsAlert(wants.find((u) => u.id === r.userId), kind))
        .map((r) => r.userId),
    );

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

    if (e.alertState === 'due' && e.type !== 'Goal') {
      const payload = eventAlert(e, base, fixture);
      if (payload) for (const userId of recipientsOf(e.fixtureId, payload.kind)) rows.push({ userId, eventKey: payload.eventKey, payload });
      statements.push(db.update(fixtureEvents).set({ alertState: 'issued' }).where(eq(fixtureEvents.id, e.id)));
    } else if (e.alertState === 'due') {
      const { home: h, away: a } = score(e);
      const payload: AlertPayload = { ...base, kind: 'goal', eventKey: goalKey(e.fixtureId, e.id), scorer: e.playerName, homeGoals: h, awayGoals: a };
      for (const userId of recipientsOf(e.fixtureId, 'goal')) rows.push({ userId, eventKey: payload.eventKey, payload });
      statements.push(db.update(fixtureEvents).set({ alertState: 'issued' }).where(eq(fixtureEvents.id, e.id)));
    }

    if (e.correctionDue) {
      const { home: h, away: a } = score();
      const key = goalKey(e.fixtureId, e.id);
      const payload: AlertPayload = { ...base, kind: 'goal_removed', eventKey: `${key}:removed`, scorer: null, homeGoals: h, awayGoals: a };
      const current = recipientsOf(e.fixtureId, 'goal_removed');
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

  for (const f of names) {
    const base = { fixtureId: f.fixtureId, homeName: f.home ?? 'Home', awayName: f.away ?? 'Away', minute: '', scorer: null, homeGoals: f.homeGoals ?? 0, awayGoals: f.awayGoals ?? 0 };
    if (f.kickoffDue) {
      const payload: AlertPayload = { ...base, kind: 'kickoff', eventKey: `fixture:${f.fixtureId}:kickoff` };
      for (const userId of recipientsOf(f.fixtureId, 'kickoff')) rows.push({ userId, eventKey: payload.eventKey, payload });
      statements.push(db.update(fixtures).set({ kickoffAlertDue: false }).where(eq(fixtures.id, f.fixtureId)));
    }
    if (f.fullTimeDue) {
      const payload: AlertPayload = { ...base, kind: 'full_time', eventKey: `fixture:${f.fixtureId}:fulltime` };
      for (const userId of recipientsOf(f.fixtureId, 'full_time')) rows.push({ userId, eventKey: payload.eventKey, payload });
      statements.push(db.update(fixtures).set({ fullTimeAlertDue: false }).where(eq(fixtures.id, f.fixtureId)));
    }
  }

  if (rows.length) statements.unshift(db.insert(notificationLog).values(rows).onConflictDoNothing());
  await runBatch(db, statements);
  return true;
}
