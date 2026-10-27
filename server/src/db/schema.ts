import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

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
