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

// A user's favorite teams (ADR 0014: at most 3, enforced by the API). A favorite makes every fixture of the team live-tracked.
export const favoriteTeams = pgTable(
  'favorite_teams',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    teamId: integer('team_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('favorite_teams_user_team').on(t.userId, t.teamId)],
);

// A one-off follow of a single fixture (ADR 0014: at most 2 active). A follow makes that fixture live-tracked.
export const follows = pgTable(
  'follows',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fixtureId: integer('fixture_id')
      .notNull()
      .references(() => fixtures.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('follows_user_fixture').on(t.userId, t.fixtureId)],
);

// Links a team's id at football-data.org to its id at API-Football (#7). Fixtures store API-Football team ids,
// because live events carry those; the snapshot job translates through this table.
export const teamMap = pgTable('team_map', {
  id: serial('id').primaryKey(),
  footballDataId: integer('football_data_id').notNull().unique(),
  apiFootballId: integer('api_football_id').notNull().unique(),
  name: text('name').notNull(),
  // What the team picker shows (football-data.org's short name, three-letter code and crest).
  shortName: text('short_name').notNull().default(''),
  code: text('code').notNull().default(''),
  crestUrl: text('crest_url'),
});

// One league-table row per team, mirrored from football-data.org (ADR 0003). `teamId` is a football-data.org id.
export const standings = pgTable(
  'standings',
  {
    id: serial('id').primaryKey(),
    competition: text('competition').notNull(), // football-data.org code: PL, PD, FL1, BL1, CL
    season: integer('season').notNull(), // the year the season starts in
    teamId: integer('team_id').notNull(),
    teamName: text('team_name').notNull(),
    position: integer('position').notNull(),
    played: integer('played').notNull(),
    won: integer('won').notNull(),
    drawn: integer('drawn').notNull(),
    lost: integer('lost').notNull(),
    goalsFor: integer('goals_for').notNull(),
    goalsAgainst: integer('goals_against').notNull(),
    points: integer('points').notNull(),
    source: text('source').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('standings_competition_season_team').on(t.competition, t.season, t.teamId)],
);

// Every time the night job replaced a live-tracked fixture's stored result with football-data.org's (ADR 0003),
// so provider disagreement can be measured.
export const fixtureOverwrites = pgTable('fixture_overwrites', {
  id: serial('id').primaryKey(),
  fixtureId: integer('fixture_id')
    .notNull()
    .references(() => fixtures.id, { onDelete: 'cascade' }),
  oldHomeGoals: integer('old_home_goals'),
  oldAwayGoals: integer('old_away_goals'),
  newHomeGoals: integer('new_home_goals'),
  newAwayGoals: integer('new_away_goals'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
