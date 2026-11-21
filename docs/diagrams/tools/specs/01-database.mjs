// Diagram 1: the database. Columns: A users | B user-owned tables | C fixtures | D match detail tables.
const rowH = 110, pitch = 134, y0 = 90;
const rowY = (i) => y0 + i * pitch;
const rowC = (i) => rowY(i) + rowH / 2;
const tallH = 4 * rowH + 3 * (pitch - rowH);
const tallC = y0 + tallH / 2;
const off = (i) => rowC(i) - tallC;

const A = { x: 0, w: 300 }, B = { x: 430, w: 300 }, C = { x: 860, w: 340 }, D = { x: 1330, w: 300 };
const row = (id, col, i, color, title, lines) => ({ id, x: col.x, y: rowY(i), w: col.w, h: rowH, color, title, lines });

export default {
  nodes: [
    {
      id: "users", x: A.x, y: y0, w: A.w, h: tallH, color: "red", title: "users",
      lines: ["id  (Clerk user id, primary key)", "timezone", "alert_goals  (on by default)", "alert_cards  (off)", "alert_substitutions  (off)", "alert_kickoff  (off)", "alert_full_time  (on by default)", "created_at"],
    },
    row("push_tokens", B, 0, "orange", "push_tokens", ["user_id → users", "token (unique)", "one row per phone"]),
    row("notification_log", B, 1, "yellow", "notification_log (outbox)", ["user_id, event_key (unique pair)", "status: pending, sent, failed", "payload, attempts, delivered_to"]),
    row("follows", B, 2, "orange", "follows", ["user_id, fixture_id", "max 2 active (database trigger)", "makes one match live-tracked"]),
    row("favorite_teams", B, 3, "orange", "favorite_teams", ["user_id, team_id", "max 3 per user (database trigger)", "makes the team's matches live"]),
    {
      id: "fixtures", x: C.x, y: y0, w: C.w, h: tallH, color: "green", title: "fixtures  (one row per match)",
      lines: ["id  (primary key)", "api_football_id  (unique)", "football_data_id  (unique)", "league_id", "home_team_id, away_team_id", "kickoff  (stored in UTC)", "status  (NS, FT, ...)", "home_goals, away_goals", "source  (which provider gave the row)", "minute", "first_polled_at, last_polled_at", "attempt counters  (lineups, stats, link)", "alert-due flags  (kickoff, full time, score)", "updated_at"],
    },
    row("fixture_events", D, 0, "green", "fixture_events", ["fixture_id, minute, team, player", "type (goal, card, sub), detail", "alert_state, removed_at (VAR)"]),
    row("fixture_lineups", D, 1, "green", "fixture_lineups", ["fixture_id, team_id (unique pair)", "formation, coach", "starters, substitutes (jsonb)"]),
    row("fixture_stats", D, 2, "green", "fixture_stats", ["fixture_id, team_id (unique pair)", "stats (jsonb): possession, shots", "phase: HT or FT"]),
    row("fixture_overwrites", D, 3, "green", "fixture_overwrites", ["fixture_id", "old and new home/away goals", "log of provider disagreements"]),
    { id: "team_map", x: C.x, y: 680, w: C.w, h: rowH, color: "purple", title: "team_map", lines: ["football_data_id ↔ api_football_id", "name, short_name, code", "crest_url"] },
    { id: "standings", x: D.x, y: 680, w: D.w, h: rowH, color: "purple", title: "standings", lines: ["competition, season, team_id", "position, played, won/drawn/lost", "points, goals_for/against"] },
    row("poll_state", A, 0, "gray", "poll_state", ["one row, id = 'global'", "last_polled_at", "requests_today, quota_day"]),
    row("app_config", B, 0, "gray", "app_config", ["key / value text settings", "min / latest_app_version", "download_page_url"]),
  ].map((n) => (n.id === "poll_state" || n.id === "app_config" ? { ...n, y: 880 } : n)),
  edges: [
    // user-owned tables -> users (straight, level with the child's row)
    { from: "push_tokens", to: "users", fs: "L", ts: "R", o2: off(0), label: "user_id" },
    { from: "notification_log", to: "users", fs: "L", ts: "R", o2: off(1), label: "user_id" },
    { from: "follows", to: "users", fs: "L", ts: "R", o2: off(2), label: "user_id" },
    { from: "favorite_teams", to: "users", fs: "L", ts: "R", o2: off(3), label: "user_id" },
    // follows -> fixtures
    { from: "follows", to: "fixtures", fs: "R", ts: "L", o2: off(2), label: "fixture_id" },
    // match detail tables -> fixtures
    { from: "fixture_events", to: "fixtures", fs: "L", ts: "R", o2: off(0), label: "fixture_id" },
    { from: "fixture_lineups", to: "fixtures", fs: "L", ts: "R", o2: off(1), label: "fixture_id" },
    { from: "fixture_stats", to: "fixtures", fs: "L", ts: "R", o2: off(2), label: "fixture_id" },
    { from: "fixture_overwrites", to: "fixtures", fs: "L", ts: "R", o2: off(3), label: "fixture_id" },
    // team ids kept by convention only (dashed)
    { from: "fixtures", to: "team_map", fs: "B", ts: "T", dashed: true, label: "home_team_id, away_team_id" },
    { from: "standings", to: "team_map", fs: "L", ts: "R", dashed: true, label: "team_id" },
    { from: "favorite_teams", to: "team_map", fs: "B", ts: "L", dashed: true, labelAt: { x: 640, y: 708 }, label: "team_id" },
  ],
  texts: [
    { x: 0, y: 48, text: "People and what they chose", size: 16, color: "#495057" },
    { x: 860, y: 48, text: "Matches and everything stored about them", size: 16, color: "#495057" },
    { x: 1330, y: 640, text: "Reference data: translating team ids", size: 16, color: "#495057" },
    { x: 0, y: 840, text: "Bookkeeping (no links to other tables)", size: 16, color: "#495057" },
    { x: 860, y: 880, text: "Solid arrow: foreign key, enforced by Postgres.\nDashed arrow: matching id kept by the code, not enforced.\nArrows point from the row that holds the id to the row it refers to.", size: 14, color: "#495057" },
  ],
};
