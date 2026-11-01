import type { AlertPayload, users } from '../db/schema';

// Whether a user has this kind of alert switched on (#14). A correction follows the goals toggle. A user who is not
// found (deleted meanwhile) gets nothing.
export function wantsAlert(user: typeof users.$inferSelect | undefined, kind: AlertPayload['kind']): boolean {
  if (!user) return false;
  switch (kind) {
    case 'goal':
    case 'goal_removed':
      return user.alertGoals;
    case 'card':
      return user.alertCards;
    case 'substitution':
      return user.alertSubstitutions;
    case 'kickoff':
      return user.alertKickoff;
    case 'full_time':
      return user.alertFullTime;
  }
}
