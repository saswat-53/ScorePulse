// Diagram 4: one poller run (server/src/poller/run-poller.ts). Left: Neon. Middle: the seven steps. Right: outside services.
const X = 330, W = 560, GAP = 40, EXT_X = 1040, EXT_W = 340;
const boxH = (n) => Math.ceil(60.5 + n * 17.5);

const steps = [
  { id: "s1", color: "orange", title: "1. Read the state (one Neon request)", lines: [
    "Seven queries run as one batch, so it costs one subrequest:",
    "quota used today, matches that are due, lineup and stats candidates,",
    "alerts owed, alerts waiting to send, fallback state, unlinked fixtures",
    "No provider request yet",
  ] },
  { id: "s2", color: "yellow", title: "2. Decide: may we ask the live feed now?", lines: [
    "A match is due when it has kicked off, is not over, and is a",
    "favorite or followed. Playing, or not started less than 90 min late,",
    "or at halftime for 14 min or more (halftime is not polled)",
    "Allowed when quota is left and 5 min have passed since the last poll",
    "From 70 of 100 requests used: 10 min apart, favorites only",
    "Nothing due, or too soon: steps 3 and 4 are skipped",
  ] },
  { id: "s3", color: "green", title: "3. Ask API-Football who is live (1 request)", lines: [
    "fixtures?live=39-140-... covers the leagues of every due match",
    "Sent through the relay on Vercel, at a settled second of the minute",
    "Refused for rate limit: waits 20 s and tries once more",
    "Still refused: nothing is recorded, the extras are skipped,",
    "and the next beat asks again",
  ] },
  { id: "s4", color: "orange", title: "4. Save what happened (one Neon batch)", lines: [
    "Link fixtures with no API-Football id from this answer (no extra request)",
    "Insert new events. The first poll of a match is backfill, later ones are news",
    "Update status and score. Kickoff and full time owe an alert",
    "Seen live, then missing 100 min after kickoff: the match is over",
    "A goal missing from 2 polls in a row, or cancelled by VAR, is removed",
    "Count the request in poll_state",
  ] },
  { id: "s5", color: "purple", title: "5. Quota spent? Use football-data.org instead", lines: [
    "Only when all 100 requests are used and a match is due",
    "One request every 10 min: score and status only, no events",
    "A score that went up owes an alert",
    "If it fails too, nothing is polled and the app shows 'updates paused'",
  ] },
  { id: "s6", color: "green", title: "6. Extras: lineups, statistics, completion", lines: [
    "Skipped if step 3 was refused for rate limit",
    "Look up the id of a tracked match by date, 70 min before kickoff",
    "Lineups at 60, 45, 30 and 10 min before kickoff, at least 14 min apart",
    "Halftime statistics, final statistics, one fetch by id after the match",
    "Each kind is capped at 3 per run. An empty answer still costs a try",
  ] },
  { id: "s7", color: "blue", title: "7. Alerts, if any are owed", lines: [
    "queueAlerts writes one pending row per person and event",
    "sendAlerts sends the pending rows through Expo, up to 100 per request",
    "A crash here is safe: the next run finds the pending rows and finishes",
  ] },
];

let y = 50;
const start = { id: "start", x: X, y, w: W, h: 56, color: "gray", title: "A cron beat fires: scheduled() calls runPoller()", titleSize: 16, align: "center", valign: "middle" };
y += start.h + GAP;
const nodes = [start];
const pos = {};
for (const s of steps) {
  const h = boxH(s.lines.length);
  nodes.push({ id: s.id, x: X, y, w: W, h, color: s.color, title: s.title, lines: s.lines });
  pos[s.id] = { y, h, cy: y + h / 2 };
  y += h + GAP;
}
const bottom = y - GAP;

// Neon on the left, tall, so every arrow to it is level with its step
const neonTop = pos.s1.y;
const neon = { id: "neon", x: 0, y: neonTop, w: 230, h: bottom - neonTop, color: "orange", title: "Neon Postgres",
  lines: ["poll_state (quota counters)", "fixtures", "fixture_events", "fixture_lineups", "fixture_stats", "notification_log (alerts)"] };
nodes.push(neon);
const neonCy = neon.y + neon.h / 2;

const ext = (id, forStep, color, title, lines) => ({ id, x: EXT_X, y: pos[forStep].cy - 45, w: EXT_W, h: 90, color, title, lines });
nodes.push(
  ext("e_api", "s3", "gray", "API-Football (via the relay)", ["100 requests a day, shared by", "steps 3 and 6 and the archive"]),
  ext("e_fd", "s5", "gray", "football-data.org", ["10 requests a minute", "own quota, separate from API-Football"]),
  ext("e_api2", "s6", "gray", "API-Football (same relay)", ["lineups, statistics, fetch by id,", "lookup by date"]),
  ext("e_expo", "s7", "gray", "Expo push service", ["up to 100 messages per request,", "then on to the phones"]),
);

const down = (from, to, label) => ({ from, to, fs: "B", ts: "T", label });
const edges = [
  down("start", "s1"),
  down("s1", "s2"),
  down("s2", "s3", "if something is due"),
  down("s3", "s4", "the live answer"),
  down("s4", "s5", "only if the quota is spent"),
  down("s5", "s6", "unless step 3 was refused"),
  down("s6", "s7", "if alerts are owed"),
  // Neon: reads and writes, level with the step
  { from: "neon", to: "s1", fs: "R", ts: "L", o1: pos.s1.cy - neonCy, label: "reads" },
  { from: "s4", to: "neon", fs: "L", ts: "R", o2: pos.s4.cy - neonCy, label: "writes" },
  { from: "s5", to: "neon", fs: "L", ts: "R", o2: pos.s5.cy - neonCy, label: "writes" },
  { from: "s6", to: "neon", fs: "L", ts: "R", o2: pos.s6.cy - neonCy, label: "writes" },
  { from: "s7", to: "neon", fs: "L", ts: "R", o2: pos.s7.cy - neonCy, label: "writes" },
  // outside services
  { from: "s3", to: "e_api", fs: "R", ts: "L", bidir: true, label: "1 request" },
  { from: "s5", to: "e_fd", fs: "R", ts: "L", bidir: true, label: "1 request" },
  { from: "s6", to: "e_api2", fs: "R", ts: "L", bidir: true, label: "up to 3 + 3" },
  { from: "s7", to: "e_expo", fs: "R", ts: "L", label: "pushes" },
];

export default {
  nodes,
  edges,
  texts: [
    { x: 0, y: 0, text: "The poller run: what happens on one 5-minute beat (server/src/poller/run-poller.ts)", size: 18 },
    { x: 0, y: bottom + 40, text: "A step that has nothing to do is skipped, so a quiet beat is just step 1 and the run ends.\nRequests to API-Football in one beat: 0 or 1 for step 3, then up to 3 lookups and up to 3 extra fetches in step 6. Each is counted in poll_state.", size: 13, color: "#495057" },
  ],
};
