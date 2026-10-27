# ScorePulse: Spec Summary

Last updated: 5 October 2026

This spec is the result of the planning interview. It builds on `football-app-project-plan.md`: that plan's "Locked decisions" table still holds, except for the changes listed under "Changes to the original plan".

## Product

ScorePulse is an Android-only football app for a small group of invited friends (fewer than about 100 users). It gives live scores, a match timeline and push alerts for five competitions: La Liga, Premier League, Ligue 1, Bundesliga and the Champions League. It is distributed as an APK from a Vercel-hosted download page, with no app store.

## Scope

**In scope for v1**

- Required sign-in with Clerk, and up to 3 favorite teams
- Browse fixtures (next 14 days), results and standings by league
- A match screen with timeline, lineups and stats
  - Live-tracked for followed matches and favorite-team matches
  - A stored snapshot for all other matches
- Push alerts for goals, cards, substitutions, kickoff and full time, with a correction when a goal is cancelled
- Follow-a-match until full time
- An in-app update banner and OTA JavaScript updates

**Out of scope for v1**

- iOS
- An app store listing
- Following leagues (league screens are browse-only)
- The edge cache
- Sub-minute polling
- News and transfers stay in Phase 6, after the core works

## Core flows

1. Install the APK, then sign in with Clerk.
2. Pick a first team. The app then asks for notification permission.
3. Open a match.
   - Live-tracked matches show the timeline.
   - Other matches show a snapshot labelled "not live-tracked, tap Follow."
4. A goal alert arrives once, within one 5-minute polling interval.

## Data model

The original plan's tables stay. These are the changes:

- `team_map` links API-Football ids to football-data.org ids. It is seeded once for about 100 teams and checked by hand.
- A `source` column on mirrored fixtures and standings rows records which provider supplied them.
- A `min_app_version` config value is exposed by the API.
- Kickoff and full-time notification keys follow the pattern `fixture:{id}:{status}`. They come from fixture status changes, not from `fixture_events`.

## Architecture

The original architecture stays: Expo app, Hono on Cloudflare Workers, Neon, a cron poller and Expo Push. These are the changes:

- The edge cache is removed. TanStack Query caches on the client.
- A second adapter reads football-data.org for snapshot data only.
- A morning and a night job compare the snapshot against stored data and update only when something differs. The night run captures final results for matches nobody followed.
- Cron windows are static matchday hours, with Postgres as the only store.
- Vercel hosts only the static download page.
- Fixtures are pulled for the next 14 days only, fetched by matchday or date range to keep responses small. Results accumulate for the whole season.

## Integrations

| Service | Role |
| --- | --- |
| API-Football (free) | Live polling and events, about 100 requests a day |
| football-data.org (free) | Snapshots of fixtures, results and standings |
| Clerk (development instance) | Sign-in |
| Expo Push with Firebase/FCM | Push alerts; FCM is required on Android |
| Sentry | Error reporting |
| Neon | Postgres |
| Cloudflare Workers | API and cron poller |
| Vercel | Static APK download page |

## Updates and distribution

- JavaScript-only changes ship over the air with `expo-updates`.
- Native-code changes use an in-app "new version, tap to download" banner that links to the Vercel page. The app checks `min_app_version` at launch.
- Users install the new APK over the top, with no uninstall. This keeps their session and push token. It works only if every APK is signed with the same key.
- A push notification can prompt an update as an extra, but the in-app banner is the main path.

## Quality bar

The replay simulator, plus unit tests for the logic that can fail silently:

- Event dedupe with NULLs
- The 2-poll removal grace period
- The VAR correction
- `notification_log` uniqueness

## Changes to the original plan

| Original plan | Now |
| --- | --- |
| Football data: API-Football only | API-Football plus football-data.org (snapshots only) |
| Edge cache: Cloudflare Cache API | Removed; client-side TanStack Query only |
| Auth: Clerk | Clerk development instance (to verify) |
| Distribution: Google Play listing | APK from a Vercel page |
| Phase 7: Play listing, store review | Download page, update banner, beta among friends |
| Zero-cost rule including the $25 Play fee | The Play fee no longer applies |
| Added to Phase 1: Firebase project | Needed for Expo Push on Android |

## Assumptions

1. Fewer than about 100 users, so no Queues and no fan-out work.
2. Static cron windows for matchday hours, with Postgres as the only store. A match followed outside the windows is a known limitation.
3. A 5-minute alert delay is acceptable.
4. Kickoff and full-time alerts come from fixture status changes.
5. Clerk runs on a development instance, because a `vercel.app` subdomain probably can't be a Clerk production domain. To verify.
6. There is no edge cache (the Cache API needs a custom domain).
7. The nightly football-data.org check captures final results for unfollowed matches.
8. Fixtures are pulled for the next 14 days only.
9. v1 is non-commercial, so the providers' commercial terms are not read yet.
10. Firebase/FCM is set up as part of Phase 1.
11. Native-code updates use an in-app banner and install over the top, with no uninstall.
12. football-data.org is a snapshot-only supplement. This is an approved addition to the locked table, not a swap.
13. football-data.org's free-tier limits (rate limit, delayed scores, whether events exist) are unverified.

## Open risks

- **Quota coverage.** About 80 live-polling requests a day cover roughly 6.5 hours of play against a 10-hour Saturday. The interval widens automatically, so some matches will lag.
- **Unverified spikes.**
  - The league-filtered `live` call hasn't been run on a real matchday.
  - Whether `fixtures?date=…&league=…` works without the blocked `season` parameter is untested.
  - The 10 ms CPU cap is untested for the poller and the snapshot sync.
- **Provider mismatch.** The two providers can disagree, for example on a score, or on delayed versus live data. The `source` column makes this visible, but which source wins in a conflict is not settled.
- **Neon.** The always-on cron inside matchday windows is estimated at about 50 CU-hours a month. That figure needs checking against Neon's actual minimum compute.
- **Sideloading friction.** Drive's virus-scan warning on larger files and Android's "install unknown apps" prompt may lose testers. Play Protect may also warn.
- **Signing key.** Losing the APK signing key breaks updates for everyone.
- **Clerk.** The development-instance user cap and branding need confirming.
- **Provider terms.** Unread, so they matter if v1 ever becomes commercial.
