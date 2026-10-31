# Deferred features

Things the UI mockup (`ScorePulse Neon Football App UI.png`) or the plan shows that are not in v1. Each entry says why it was cut and what has to be true before it returns. Move an entry out of this file when it is built.

Added 2026-10-29.

## Sign-in

| Feature | Why deferred | Returns when |
| --- | --- | --- |
| "Continue with Apple" | Only needed on iOS, and v1 is Android-only | iOS release |
| "Continue with Google" | Needs a Google OAuth app (Google Cloud console and a consent screen) set up by the owner, then its ids pasted into Clerk. Email code works now | The owner sets up the OAuth app |
| "Continue with Clerk" button | Clerk is the provider, not a sign-in method. Google and Email go through it | Not planned |

## Home and navigation

| Feature | Why deferred | Returns when |
| --- | --- | --- |
| News tab (bottom nav) and News league tab | News is Phase 6 | Phase 6 |
| Google Play logo on the update banner | Distribution is the Vercel page and Drive, not Play | Play listing exists |

## Match screen

| Feature | Why deferred | Returns when |
| --- | --- | --- |
| H2H tab | Not in the spec, and needs extra data requests against the free quota | Quota is measured and has room |
| Play buttons on goal rows | API-Football has no video or clips | A video source is found |
| VAR rows (VAR Check, Goal Disallowed) | Only `Goal cancelled` and `Penalty cancelled` are confirmed from a 2024-25 recording. See [ADR 0009](adr/0009-var-correction.md) | Other wordings are seen on real 2026 matches |

## Notification settings

| Feature | Why deferred | Returns when |
| --- | --- | --- |
| Lineups alert | Not in the spec | Lineups are fetched reliably at kickoff |
| Fixture Reminders | Needs a scheduled job to send reminders before kickoff | Cron budget is measured |
| Transfers & Team News alert | Transfers and news are Phase 6 | Phase 6 |
| Push Notification Frequency (All / Important / Custom) | Per-event toggles already cover this | Users ask for it |
| VAR Decisions toggle | Same as VAR rows above | VAR events are confirmed |

## Server deployment

| Feature | Why deferred | Returns when |
| --- | --- | --- |
| Deploy `scorepulse-api` with the poller and snapshot crons | Testing on 2026-10-31 spent API-Football and football-data.org requests; the owner chose not to deploy until another day. Nothing is lost by waiting: no favorites or follows exist yet (#8, #12), and snapshot fixtures cannot be polled until #22 | The owner picks a day |

Already done (2026-10-31): migrations 0001 to 0007 applied to the Neon dev database, `team_map` seeded (86 of 95 teams; after #8 run `npm run db:migrate` for 0008 and `npm run seed:team-map` again to fill the picker columns), secrets `API_FOOTBALL_KEY` and `FOOTBALL_DATA_KEY` set on the Worker. Before deploying, run `npx wrangler secret list` in `server/` and check `DATABASE_URL`, the Clerk keys and `SENTRY_DSN` are also set. Then `npx wrangler deploy` from `server/`; it registers 4 cron triggers (poller windows twice, snapshot morning and night). On the first matchday check, in the Cloudflare logs: the CPU time of poll runs (#6), the snapshot runs at 06:00 and 23:30 UTC, and the football-data.org live-score delay.

## Added to v1 instead

- A Substitutions toggle, which the spec has and the mockup lacks.
- A required first favorite team, with no Skip on onboarding.

## Polling and data

Added 2026-10-31.

| Feature | Why deferred | Returns when |
| --- | --- | --- |
| Event-triggered detail fetches (watch scores on football-data.org, call API-Football only when a score changes) | football-data.org's free live-score delay is unmeasured, and cards and substitutions would arrive late. See [ADR 0016](adr/0016-poll-schedule-and-request-budget.md) | A matchday shows the delay is under about 2 minutes |
