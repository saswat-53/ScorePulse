import type { PollDb } from './db';
import { queueAlerts } from './queue-alerts';
import { sendAlerts, type PushSender } from './send-alerts';

// The two steps after a poll: write what is owed as pending rows, then send every pending row. Either step can be
// cut off and the next run picks up where it stopped (#13).
export async function deliverAlerts(deps: { db: PollDb; push: PushSender }) {
  await queueAlerts(deps.db);
  await sendAlerts(deps.db, deps.push);
}
