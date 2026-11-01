import { and, eq, exists, inArray, lt, or, sql } from 'drizzle-orm';
import { favoriteTeams, fixtures, follows, notificationLog, pushTokens, users, type AlertPayload } from '../db/schema';
import { wantsAlert } from './settings';
import { runBatch, type PollDb, type Statement } from './db';

// A row is sent at most this many times when sends fail; it then stays `failed`. Retries must not eat the 100 requests a day.
export const MAX_SEND_TRIES = 3;
// Expo accepts up to 100 messages per request.
export const EXPO_BATCH = 100;

export type ExpoMessage = { to: string; title: string; body: string; sound: 'default'; data: AlertPayload };
export type ExpoTicket = { status: 'ok'; id?: string } | { status: 'error'; message?: string; details?: { error?: string } };
// One ticket per message, in order. Throws when Expo cannot be reached.
export type PushSender = { send(messages: ExpoMessage[]): Promise<ExpoTicket[]> };

export function alertText(p: AlertPayload): { title: string; body: string } {
  const score = `${p.homeName} ${p.homeGoals}-${p.awayGoals} ${p.awayName}`;
  switch (p.kind) {
    case 'goal':
      return { title: `GOAL! ${p.scorer ?? ''}`.trim(), body: `${score} · ${p.minute}` };
    case 'score':
      return { title: `Goal: ${score}`, body: 'Scores only for now: scorer and minute are not available' };
    case 'goal_removed':
      return { title: 'Goal cancelled', body: `${score} · score corrected after VAR` };
    case 'card':
      return { title: p.card === 'red' ? 'Red card' : 'Yellow card', body: `${p.player ?? 'A player'} · ${score} · ${p.minute}` };
    case 'substitution':
      return { title: 'Substitution', body: `${p.related ?? 'A player'} on for ${p.player ?? 'a team-mate'} · ${score} · ${p.minute}` };
    case 'kickoff':
      return { title: 'Kick-off', body: `${p.homeName} v ${p.awayName}` };
    case 'full_time':
      return { title: 'Full time', body: score };
  }
}

const sendable = and(
  or(eq(notificationLog.status, 'pending'), eq(notificationLog.status, 'failed')),
  lt(notificationLog.attempts, MAX_SEND_TRIES),
  sql`${notificationLog.payload} is not null`,
)!;

// Counted by the poller's first read, so a quiet run does not pay for a send it does not need.
export const sendableCountQuery = (db: PollDb) => db.select({ count: sql<number>`count(*)::int` }).from(notificationLog).where(sendable);

// Sends every pending and failed row. Recipients and tokens are read now, not when the row was written, so an
// unfollow or a signed-out device takes effect before the send (ADR 0008). A failed row is tried again on the next
// run. A crash after the send and before the marks sends again: a rare duplicate, preferred to a missed alert.
export async function sendAlerts(db: PollDb, push: PushSender): Promise<void> {
  const [rows, tokens] = (await runBatch(db, [
    db
      .select({
        log: notificationLog,
        user: users,
        // Still a recipient: the user follows the match, or has either team as a favorite.
        stillRecipient: sql<boolean>`${or(
          exists(db.select({ x: sql`1` }).from(follows).where(and(eq(follows.userId, notificationLog.userId), eq(follows.fixtureId, sql`(${notificationLog.payload}->>'fixtureId')::int`)))),
          exists(
            db
              .select({ x: sql`1` })
              .from(favoriteTeams)
              .innerJoin(fixtures, eq(fixtures.id, sql`(${notificationLog.payload}->>'fixtureId')::int`))
              .where(and(eq(favoriteTeams.userId, notificationLog.userId), or(eq(favoriteTeams.teamId, fixtures.homeTeamId), eq(favoriteTeams.teamId, fixtures.awayTeamId)))),
          ),
        )}`.as('still_recipient'),
      })
      .from(notificationLog)
      .leftJoin(users, eq(users.id, notificationLog.userId))
      .where(sendable),
    db.select().from(pushTokens).where(inArray(pushTokens.userId, db.select({ id: notificationLog.userId }).from(notificationLog).where(sendable))),
  ])) as [{ log: typeof notificationLog.$inferSelect; user: typeof users.$inferSelect | null; stillRecipient: boolean }[], (typeof pushTokens.$inferSelect)[]];
  if (rows.length === 0) return;

  const writes: Statement[] = [];
  const outgoing: { rowId: number; message: ExpoMessage }[] = [];
  const skip = (id: number) => writes.push(db.update(notificationLog).set({ status: 'skipped' }).where(eq(notificationLog.id, id)));

  for (const { log, user, stillRecipient: follows_ } of rows) {
    const payload = log.payload!;
    // Read now, like the recipient check: a toggle turned off since the alert was written stops it.
    const stillRecipient = follows_ && wantsAlert(user ?? undefined, payload.kind);
    const devices = tokens.filter((t) => t.userId === log.userId && !log.deliveredTo.includes(t.token));
    if (!stillRecipient || devices.length === 0) {
      // Nothing left to send: not a recipient any more, no device, or every device already has it.
      if (log.deliveredTo.length > 0 && stillRecipient) writes.push(db.update(notificationLog).set({ status: 'sent' }).where(eq(notificationLog.id, log.id)));
      else skip(log.id);
      continue;
    }
    for (const t of devices) outgoing.push({ rowId: log.id, message: { to: t.token, ...alertText(payload), sound: 'default', data: payload } });
  }

  const delivered = new Map<number, string[]>();
  const failed = new Set<number>();
  const dead = new Set<string>();
  for (let i = 0; i < outgoing.length; i += EXPO_BATCH) {
    const chunk = outgoing.slice(i, i + EXPO_BATCH);
    try {
      const tickets = await push.send(chunk.map((c) => c.message));
      chunk.forEach(({ rowId, message }, n) => {
        const ticket = tickets[n];
        if (ticket?.status === 'ok') delivered.set(rowId, [...(delivered.get(rowId) ?? []), message.to]);
        else if (ticket?.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') dead.add(message.to);
        else failed.add(rowId);
      });
    } catch (e) {
      console.error(`Expo push failed: ${e instanceof Error ? e.message : e}`);
      for (const { rowId } of chunk) failed.add(rowId);
    }
  }

  for (const { log } of rows) {
    if (!outgoing.some((o) => o.rowId === log.id)) continue;
    const deliveredTo = [...log.deliveredTo, ...(delivered.get(log.id) ?? [])];
    writes.push(
      failed.has(log.id)
        ? db.update(notificationLog).set({ status: 'failed', attempts: log.attempts + 1, deliveredTo }).where(eq(notificationLog.id, log.id))
        : db.update(notificationLog).set({ status: deliveredTo.length > 0 ? 'sent' : 'skipped', deliveredTo, sentAt: new Date() }).where(eq(notificationLog.id, log.id)),
    );
  }
  if (dead.size) writes.push(db.delete(pushTokens).where(inArray(pushTokens.token, [...dead])));
  await runBatch(db, writes);
}
