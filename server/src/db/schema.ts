import { date, integer, pgTable, serial, text, timestamp, unique } from 'drizzle-orm/pg-core';

// Owned-by-app table. Row is created on first sign-in and deleted with the account
// (kept in sync with Clerk by the `user.deleted` webhook, added in Phase 3).
export const users = pgTable('users', {
  // Clerk user id (e.g. "user_2Rf...")
  id: text('id').primaryKey(),
  // IANA timezone; times are stored in UTC and shown in this zone
  timezone: text('timezone').notNull().default('UTC'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;

// Mirrored fixture. `source` records which provider supplied the row (ADR 0003).
export const fixtures = pgTable('fixtures', {
  id: serial('id').primaryKey(),
  apiFootballId: integer('api_football_id').unique(),
  footballDataId: integer('football_data_id').unique(),
  leagueId: integer('league_id').notNull(),
  homeTeamId: integer('home_team_id').notNull(),
  awayTeamId: integer('away_team_id').notNull(),
  kickoff: timestamp('kickoff', { withTimezone: true }).notNull(),
  status: text('status').notNull(),
  homeGoals: integer('home_goals'),
  awayGoals: integer('away_goals'),
  source: text('source').notNull(),
  // Set by the poller on a fixture's first poll; events seen before this are backfill, not news (ADR 0002).
  firstPolledAt: timestamp('first_polled_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// One row per API-Football event of a live-tracked fixture. The API gives no event id,
// so identity is the composite below. `extra` and `playerId` are often NULL.
export const fixtureEvents = pgTable(
  'fixture_events',
  {
    id: serial('id').primaryKey(),
    fixtureId: integer('fixture_id')
      .notNull()
      .references(() => fixtures.id, { onDelete: 'cascade' }),
    elapsed: integer('elapsed').notNull(),
    extra: integer('extra'),
    teamId: integer('team_id').notNull(),
    playerId: integer('player_id'),
    type: text('type').notNull(),
    detail: text('detail').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // Goals only (ADR 0009): polls in a row where the fixture was in the response but this goal was not.
    missingPolls: integer('missing_polls').notNull().default(0),
    // Set when the goal is cancelled (VAR event or 2 missing polls). The row stays so the timeline can show it.
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (t) => [
    // NULLS NOT DISTINCT: a plain unique treats two NULLs as different and would store the event twice.
    unique('fixture_events_identity')
      .on(t.fixtureId, t.elapsed, t.extra, t.teamId, t.playerId, t.type, t.detail)
      .nullsNotDistinct(),
  ],
);

// A push already sent, so a retry or a second poll never sends it twice.
export const notificationLog = pgTable(
  'notification_log',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventKey: text('event_key').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('notification_log_user_event').on(t.userId, t.eventKey)],
);

// Single row keyed 'global': when the poller last ran and how much API-Football quota is spent today (ADR 0010).
export const pollState = pgTable('poll_state', {
  id: text('id').primaryKey(),
  lastPolledAt: timestamp('last_polled_at', { withTimezone: true }),
  requestsToday: integer('requests_today').notNull().default(0),
  quotaDay: date('quota_day'),
});
