// Diagram 5: the alert pipeline. Top: owed flag -> queueAlerts -> notification_log -> sendAlerts -> Expo.
// Bottom: the life of one notification_log row (its status).
const H = 280, PY = 60, W = 280;
const col = (i) => i * 430;
const cy = PY + H / 2;

const box = (id, i, color, title, lines, extra = {}) => ({ id, x: col(i), y: PY, w: W, h: H, color, title, lines, ...extra });

// bottom panel
const BY = 560; // heading
const sentY = BY + 70, pendY = sentY + 110, skipY = pendY + 110;
const st = (id, x, y, color, title, line) => ({ id, x, y, w: 240, h: 80, color, title, lines: [line], valign: "middle" });

export default {
  nodes: [
    box("owed", 0, "orange", "Owed flags", [
      "alert_state = 'due' on fixture_events",
      "(a goal, card or substitution)",
      "correction_due on fixture_events",
      "(a goal that VAR cancelled)",
      "kickoff_alert_due on fixtures",
      "full_time_alert_due on fixtures",
      "score_alert_due on fixtures",
      "",
      "Written in the same statement as the",
      "event or status change, so a crash",
      "cannot lose them (diagram 4, step 4)",
    ]),
    box("queue", 1, "blue", "queueAlerts", [
      "Reads the owed flags, who follows each",
      "match, the fans of each team, and every",
      "user's alert switches, in one batch",
      "",
      "Recipient: follows the match, or has",
      "either team as a favorite, and has",
      "that kind of alert switched on",
      "",
      "Writes one pending row per person",
      "and event, and clears the flags in",
      "the same batch",
    ]),
    box("log", 2, "yellow", "notification_log (outbox)", [
      "Unique on (user_id, event_key), so the",
      "same alert is never queued twice",
      "event_key: fixture:42:event:7",
      "status: pending, sent, failed, skipped",
      "payload: the alert's content, saved",
      "with the row so a send needs no lookup",
      "attempts: failed sends so far",
      "delivered_to: tokens that already got it",
    ]),
    box("send", 3, "green", "sendAlerts", [
      "Takes pending and failed rows with",
      "fewer than 3 attempts",
      "",
      "Checks again, now: still a recipient,",
      "switch still on, has a device (ADR 0008)",
      "",
      "Builds the text: 'GOAL! Scorer',",
      "score and minute",
      "Sends up to 100 messages per request",
      "Marks each row from Expo's tickets",
    ]),
    { id: "expo", x: col(4), y: cy - 70, w: W, h: 140, color: "gray", title: "Expo push service", lines: ["One ticket per message, in order", "Passes each message on to the phone"] },
    { id: "tokens", x: col(3), y: PY + H + 100, w: W, h: 90, color: "orange", title: "push_tokens", lines: ["One row per phone", "Deleted when it is dead"] },

    // life of a row
    st("pending", 0, pendY, "yellow", "pending", "written by queueAlerts"),
    st("sent", 760, sentY, "green", "sent", "at least one phone got it"),
    st("skipped", 760, skipY, "gray", "skipped", "nothing left to send"),
    st("failed", 1340, pendY, "red", "failed", "Expo refused it or was down"),
  ],
  edges: [
    { from: "owed", to: "queue", fs: "R", ts: "L", label: "read" },
    { from: "queue", to: "log", fs: "R", ts: "L", label: "insert pending" },
    { from: "log", to: "send", fs: "R", ts: "L", label: "pending, failed" },
    { from: "send", to: "expo", fs: "R", ts: "L", bidir: true, label: "messages, tickets" },
    // results written back, and dead tokens removed
    { from: "send", to: "log", fs: "B", ts: "B", o1: -60, via: [[col(3) + W / 2 - 60, PY + H + 40], [col(2) + W / 2, PY + H + 40]], label: "marks each row sent, failed or skipped" },
    { from: "send", to: "tokens", fs: "B", ts: "T", o1: 60, o2: 60, dashed: true, label: "DeviceNotRegistered" },
    // status machine
    { from: "pending", to: "sent", fs: "R", ts: "L", o1: -30, o2: 0, label: "Expo accepted it" },
    { from: "pending", to: "skipped", fs: "R", ts: "L", o1: 30, o2: 0, label: "no recipient, no device, dead token" },
    { from: "pending", to: "failed", fs: "R", ts: "L", label: "Expo refused it or could not be reached (attempts + 1)" },
    { from: "failed", to: "sent", fs: "T", ts: "R", label: "a later run: Expo accepts it" },
  ],
  texts: [
    { x: 0, y: 0, text: "The alert pipeline: from an owed flag to a buzz in your pocket", size: 18 },
    { x: 0, y: BY, text: "The life of one notification_log row (its status)", size: 18 },
    { x: 0, y: skipY + 120, text: "After 3 failed attempts a row stays failed and is never sent again, so retries cannot eat the day's quota.\nA retry goes only to the phones that did not get it yet (delivered_to), so nobody gets the same alert twice.\nA goal alert still waiting when VAR cancels the goal is marked skipped by queueAlerts: nobody hears about a goal that never counted.", size: 13, color: "#495057" },
  ],
};
