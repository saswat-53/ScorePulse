// Diagram 2: the request path. Left to right: the app, the Worker, the database. Clerk sits above the Worker.
export default {
  nodes: [
    {
      id: "app", x: 0, y: 190, w: 300, h: 450, color: "blue", title: "Phone app",
      lines: ["Expo / React Native", "", "Sign-in screen (Clerk email code)", "Clerk keeps the session token", "", "api/index.ts:  call(token, path)", "Adds the token to every call", "Base URL: EXPO_PUBLIC_API_URL", "", "React Query asks again every 60 s", "First call is /me: creates the", "user's row on first sign-in"],
    },
    {
      id: "clerk", x: 620, y: 0, w: 400, h: 130, color: "red", title: "Clerk (sign-in service)",
      lines: ["Sends the email code, checks it", "Issues the session token", "Owns the user id (user_...)"],
    },
    {
      id: "worker", x: 620, y: 190, w: 400, h: 450, color: "green", title: "Worker: the Hono API",
      lines: [
        "Cloudflare Worker, server/src/app.ts", "",
        "Every request passes, in order:",
        "  a. CORS (only localhost web builds)",
        "  b. requireAuth reads 'Bearer <token>'",
        "  c. token verified, gives the userId",
        "  d. the route handler runs",
        "  e. Drizzle builds the SQL",
        "  f. JSON answer (or 400, 401, 404)", "",
        "No token needed:",
        "  /health  /config  /status",
        "Token needed:",
        "  /me  /live  /fixtures  /matches/:id",
        "  /standings  /teams  /browse",
        "  /favorites  /follows  /settings  /devices",
        "Signed by Svix instead:  /webhooks/clerk",
      ],
    },
    {
      id: "neon", x: 1340, y: 190, w: 300, h: 200, color: "orange", title: "Neon Postgres",
      lines: ["The tables from diagram 1", "HTTP driver: one fetch per query", "No connection kept between requests", "Each query is one Worker subrequest"],
    },
    {
      id: "sentry", x: 1340, y: 480, w: 300, h: 130, color: "purple", title: "Sentry",
      lines: ["Gets errors a route throws", "10% of requests are traced", "No IP or user identity sent"],
    },
    {
      id: "cron", x: 620, y: 700, w: 400, h: 100, color: "gray", title: "Not a request: cron",
      lines: ["Scheduled runs call the same Worker's", "scheduled(). See diagram 3."],
    },
  ],
  edges: [
    // sign-in: app <-> Clerk
    { from: "app", to: "clerk", fs: "T", ts: "L", label: "1  email, then the code from the email" },
    { from: "clerk", to: "app", fs: "L", ts: "T", o1: 30, o2: 60, label: "2  session token" },
    // the API call
    { from: "app", to: "worker", fs: "R", ts: "L", o1: -60, o2: -60, label: "3  GET /live  + Bearer token" },
    { from: "worker", to: "app", fs: "L", ts: "R", o1: 60, o2: 60, label: "6  JSON answer" },
    // the database
    { from: "worker", to: "neon", fs: "R", ts: "L", o1: -115, o2: 10, label: "4  SQL over HTTPS" },
    { from: "neon", to: "worker", fs: "L", ts: "R", o1: 55, o2: -70, label: "5  rows" },
    // other times
    { from: "clerk", to: "worker", fs: "B", ts: "T", o1: -100, o2: -100, dashed: true, label: "webhook: user.deleted", labelAt: { x: 561, y: 150 } },
    { from: "worker", to: "clerk", fs: "T", ts: "B", o1: 100, o2: 100, dashed: true, label: "deleteUser (DELETE /me)" },
    { from: "worker", to: "sentry", fs: "R", ts: "L", o1: 120, o2: -10, dashed: true, label: "errors" },
  ],
  texts: [
    { x: 0, y: -40, text: "Request path: what happens when the app opens a screen", size: 18, color: "#1e1e1e" },
    { x: 0, y: 700, text: "Numbers 1 to 6 follow one normal request, in order.\nSolid arrow: part of a normal request.\nDashed arrow: happens only at certain times\n(a deleted account, an error).", size: 14, color: "#495057" },
  ],
};
