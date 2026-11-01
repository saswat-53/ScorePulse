// What each cron trigger in wrangler.jsonc does. The matchday crons poll; the other two start with the snapshot sync.
// The morning cron then goes on running through the quiet hours, and the archive uses those runs (#23): no extra
// trigger is needed. Keep these two strings equal to the ones in wrangler.jsonc.
export const MORNING_CRON = '*/5 6-9 * * *';
export const NIGHT_SYNC_CRON = '30,35,40,45,50 23 * * *';

// 06:00 to 06:20 are the five sync runs, one league each; every run after that, until 09:55, is the archive's.
const MORNING_SYNC_RUNS = 5;

export type ScheduledJob = { job: 'sync'; slot: number } | { job: 'archive' } | { job: 'poll' };

export function routeScheduled(cron: string, at: Date): ScheduledJob {
  if (cron === NIGHT_SYNC_CRON) return { job: 'sync', slot: (at.getUTCMinutes() % 30) / 5 };
  if (cron === MORNING_CRON) {
    const minutesIntoSync = at.getUTCHours() === 6 ? at.getUTCMinutes() / 5 : Infinity;
    return minutesIntoSync < MORNING_SYNC_RUNS ? { job: 'sync', slot: minutesIntoSync } : { job: 'archive' };
  }
  return { job: 'poll' };
}
