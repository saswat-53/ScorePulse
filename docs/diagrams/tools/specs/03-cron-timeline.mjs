// Diagram 3: the cron timeline. Top: one day in UTC, to scale. Bottom: how routeScheduled picks the job.
const X0 = 260, HOUR = 56;
const xh = (h) => Math.round(X0 + h * HOUR);
const laneY = [120, 220, 320], barH = 56;
const hourLabels = Array.from({ length: 25 }, (_, h) => ({
  x: xh(h) - (h < 10 ? 7 : 7), y: 82, text: String(h).padStart(2, "0"), size: 12, color: "#868e96",
}));

const cronBox = (id, y, title, line) => ({ id, x: 0, y, w: 330, h: 70, color: "gray", title, titleSize: 15, lines: [line] });
const job = (id, y, color, title, lines) => ({ id, x: 1040, y, w: 360, h: 110, color, title, lines });
const ROUTER = { y: 500, h: 360 };
const routerCy = ROUTER.y + ROUTER.h / 2;
const cronOff = (y) => y + 35 - routerCy; // cron box centre relative to the router's centre
const jobOff = (y) => y + 55 - routerCy;

export default {
  nodes: [
    // lane labels
    { id: "l1", x: 0, y: laneY[0], w: 230, h: barH, color: "gray", title: "Every day", titleSize: 16, valign: "middle", lines: ["two cron triggers"] },
    { id: "l2", x: 0, y: laneY[1], w: 230, h: barH, color: "gray", title: "Friday to Monday", titleSize: 16, valign: "middle", lines: ["one cron trigger"] },
    { id: "l3", x: 0, y: laneY[2], w: 230, h: barH, color: "gray", title: "Tuesday to Thursday", titleSize: 16, valign: "middle", lines: ["one cron trigger"] },
    // bars, to scale (1 hour = 56 px)
    { id: "b_sync_am", x: xh(6), y: laneY[0], w: 23, h: barH, color: "blue", title: "" },
    { id: "b_archive", x: xh(6) + 23, y: laneY[0], w: 200, h: barH, color: "purple", title: "archive", titleSize: 16, align: "center", lines: ["06:25 to 09:55"] },
    { id: "b_sync_pm", x: xh(23.5), y: laneY[0], w: 23, h: barH, color: "blue", title: "" },
    { id: "b_poll_a", x: xh(11), y: laneY[1], w: xh(23) - xh(11), h: barH, color: "green", title: "poller, every 5 minutes", titleSize: 16, align: "center", lines: ["11:00 to 22:55"] },
    { id: "b_poll_b", x: xh(17), y: laneY[2], w: xh(23) - xh(17), h: barH, color: "green", title: "poller, every 5 minutes", titleSize: 16, align: "center", lines: ["17:00 to 22:55"] },

    // routing
    cronBox("c1", 500, "*/5 11-22 * * FRI,SAT,SUN,MON", "matchday cron, Friday to Monday"),
    cronBox("c2", 590, "*/5 17-22 * * TUE,WED,THU", "matchday cron, Tuesday to Thursday"),
    cronBox("c3", 680, "*/5 6-9 * * *", "MORNING_CRON, every day"),
    cronBox("c4", 770, "30,35,40,45,50 23 * * *", "NIGHT_SYNC_CRON, every day"),
    {
      id: "router", x: 520, y: ROUTER.y, w: 330, h: ROUTER.h, color: "yellow", title: "routeScheduled(cron, time)",
      lines: ["Reads the cron text and the time.", "", "night cron → sync", "morning cron, before 06:25 → sync", "morning cron, after that → archive", "any other cron → poll", "", "For a sync, the minute picks the", "league: 0, 5, 10, 15, 20 → slot 0 to 4", "", "schedule.ts keeps these strings equal", "to the ones in wrangler.jsonc"],
    },
    job("j_sync", 500, "blue", "sync: runSync(slot)", ["slot 0 to 4 = PL, PD, FL1, BL1, CL", "fixtures: 7 days back, 14 ahead", "plus that league's table (2 requests)"]),
    job("j_archive", 640, "purple", "archive: runArchive", ["one finished match fetched by id", "stops at 50 requests used today", "(20 on Friday to Monday)"]),
    job("j_poll", 780, "green", "poll: runPoller", ["asks if any tracked match is near", "live scores, events, alerts", "next: diagram 4"]),
  ],
  edges: [
    { from: "c1", to: "router", fs: "R", ts: "L", o2: cronOff(500) },
    { from: "c2", to: "router", fs: "R", ts: "L", o2: cronOff(590) },
    { from: "c3", to: "router", fs: "R", ts: "L", o2: cronOff(680) },
    { from: "c4", to: "router", fs: "R", ts: "L", o2: cronOff(770) },
    { from: "router", to: "j_sync", fs: "R", ts: "L", o1: jobOff(500), label: "slot 0 to 4" },
    { from: "router", to: "j_archive", fs: "R", ts: "L", o1: jobOff(640), label: "one match" },
    { from: "router", to: "j_poll", fs: "R", ts: "L", o1: jobOff(780), label: "if a match is near" },
  ],
  texts: [
    { x: 0, y: 0, text: "Cron timeline: when the Worker wakes up on its own (one day, all times UTC)", size: 18 },
    ...hourLabels,
    { x: 535, y: 180, text: "06:00 to 06:20: sync", size: 12, color: "#495057" },
    { x: 1448, y: 180, text: "23:30 to 23:50: sync", size: 12, color: "#495057" },
    { x: 260, y: 400, text: "Empty space is quiet time: nothing runs, so no request is made and Neon is not woken by a cron.", size: 13, color: "#495057" },
    { x: 0, y: 450, text: "How the Worker decides what a run does (server/src/schedule.ts)", size: 18 },
    { x: 0, y: 930, text: "A cron run is not a request: nobody waits for an answer. A run that finds nothing to do ends without calling a provider.\nColours: blue = sync, purple = archive, green = poll. Each arrow on the right is one job; the left shows the four triggers in wrangler.jsonc.", size: 13, color: "#495057" },
  ],
};
