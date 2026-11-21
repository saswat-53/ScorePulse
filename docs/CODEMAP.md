---
title: ScorePulse code map
date: 2026-11-21
tags: [codemap, navigation]
---

# ScorePulse code map

Where things live, so a question starts at the right file instead of a grep. Four deployables plus docs: the Expo app, the Cloudflare Worker (server), a Vercel relay and a showcase site. Domain terms are in the [glossary](../GLOSSARY.md); the reasons behind the design are in the [ADRs](adr/INDEX.md). Keep this map to one line per file and update it when you add or move one.

## Request path

App (Expo) → Hono API on the Worker (`server/src/app.ts`) → Neon Postgres. A cron trigger runs the sync and the poller on the Worker; the poller asks API-Football through the relay, then writes events and pushes alerts through Expo.

## App (`app/`)

Expo Router app. Read [the app README](../app/README.md) and [the app agent notes](../app/AGENTS.md) first.

- [api/index.ts](../app/src/api/index.ts): the app's only view of the backend; real calls for sign-in, picker, favorites and follows, mock data for the rest
- [api/hooks.ts](../app/src/api/hooks.ts): data hooks over that client (live list refreshes once a minute, results and upcoming page by page)
- [domain/types.ts](../app/src/domain/types.ts): `Fixture`, `Team` and the other shapes the UI reads; the server's `browse.ts` builds these
- [domain/mock.ts](../app/src/domain/mock.ts): mock data behind the calls not yet real (see ADR 0012)
- [state/session.tsx](../app/src/state/session.tsx): session state
- [lib/push.ts](../app/src/lib/push.ts): push token registration
- [lib/use-app-auth.ts](../app/src/lib/use-app-auth.ts), [lib/dev-login.ts](../app/src/lib/dev-login.ts): sign-in and the local dev bypass
- [lib/version.ts](../app/src/lib/version.ts), [lib/app-version.ts](../app/src/lib/app-version.ts): version check behind update gating (ADR 0007)
- [lib/team-color.ts](../app/src/lib/team-color.ts), [lib/dates.ts](../app/src/lib/dates.ts), [lib/prompt-state.ts](../app/src/lib/prompt-state.ts), [lib/sentry.ts](../app/src/lib/sentry.ts): helpers
- [constants/theme.ts](../app/src/constants/theme.ts): colours and spacing

Screens are files under `app/src/app/` (Expo Router; the folder names have brackets and parentheses, so they are not linked): `(app)/(tabs)/` holds `index` (live), `fixtures`, `standings` and `more`; `(app)/match/[id]`, `(app)/team/[id]`, `(app)/browse/`, `(app)/choose-clubs`, `(app)/update-required`; `sign-in` and the root `_layout`.

Components under `app/src/components/` are grouped by screen: `fixtures/`, `match/` (header, tabs, timeline, lineups, stats, overview, banners), `clubs/`, and `ui/` for the shared pieces (chip, crest, icon, buttons, screen).

## Server (`server/`)

Cloudflare Worker with Hono and Drizzle. Free-tier limits shape most of it (ADR 0004, 0011).

API:

- [src/app.ts](../server/src/app.ts): the Hono routes (sign-in, favorites, follows, browse, push tokens, settings)
- [src/browse.ts](../server/src/browse.ts): turns stored rows into the app's `Fixture` and `Team`; also how current the live data is (ADR 0013, 0015)
- [src/follows.ts](../server/src/follows.ts), [src/limits.ts](../server/src/limits.ts): follow rules and the per-user caps (ADR 0014)
- [src/leagues.ts](../server/src/leagues.ts): the five covered leagues and their ids
- [src/lineups-stats.ts](../server/src/lineups-stats.ts): shapes API-Football lineups and statistics into what the match screen reads
- [src/webhook.ts](../server/src/webhook.ts): Clerk (Svix) webhook signature check
- [src/dev-auth.ts](../server/src/dev-auth.ts), [src/env.ts](../server/src/env.ts): the dev sign-in bypass and the Worker's bindings
- [src/schedule.ts](../server/src/schedule.ts): what each cron trigger does; keep it equal to `wrangler.jsonc`
- [src/index.ts](../server/src/index.ts): Worker entry (fetch and scheduled)

Data:

- [src/db/schema.ts](../server/src/db/schema.ts): Drizzle tables; migrations are numbered SQL files in `server/drizzle/`, in order
- [src/db/client.ts](../server/src/db/client.ts), [src/poller/db.ts](../server/src/poller/db.ts): the Neon HTTP driver and batching of statements

Sync (football-data.org snapshot, runs from the morning cron):

- [src/sync/run-sync.ts](../server/src/sync/run-sync.ts): entry; calls the three below
- [src/sync/snapshot.ts](../server/src/sync/snapshot.ts), [src/sync/season.ts](../server/src/sync/season.ts), [src/sync/football-data.ts](../server/src/sync/football-data.ts), [src/sync/team-map.ts](../server/src/sync/team-map.ts): fixtures, season, the provider client and the team-id map

Poller (live matches; ADR 0001, 0010, 0016):

- [src/poller/run-poller.ts](../server/src/poller/run-poller.ts): the run; decides what to ask for, with an early exit
- [src/poller/handle-poll.ts](../server/src/poller/handle-poll.ts): reads the `fixtures?live=` answer and writes scores and events
- [src/poller/api-football.ts](../server/src/poller/api-football.ts), [src/poller/rate-limit.ts](../server/src/poller/rate-limit.ts), [src/poller/quota.ts](../server/src/poller/quota.ts): the provider client, per-minute refusals and the 100-a-day budget
- [src/poller/status.ts](../server/src/poller/status.ts): which status codes count as in play
- [src/poller/extras.ts](../server/src/poller/extras.ts): lineups at 60, 45, 30 and 10 minutes before kickoff, and statistics
- [src/poller/link.ts](../server/src/poller/link.ts): links a snapshot fixture to its API-Football id
- [src/poller/archive.ts](../server/src/poller/archive.ts): morning catch-up of finished matches (ADR 0017)
- [src/poller/fallback.ts](../server/src/poller/fallback.ts): football-data.org scores when API-Football's quota is spent (ADR 0015)
- [src/poller/queue-alerts.ts](../server/src/poller/queue-alerts.ts), [src/poller/send-alerts.ts](../server/src/poller/send-alerts.ts), [src/poller/alerts.ts](../server/src/poller/alerts.ts), [src/poller/settings.ts](../server/src/poller/settings.ts), [src/poller/expo.ts](../server/src/poller/expo.ts): who is owed an alert, sending through Expo, per-user switches (ADR 0008, 0009)

One-off scripts are in `server/scripts/` (`sync-once`, `season-once`, `seed-team-map`, `demo-match`). `server/spike/` is throwaway CPU measurements for [the Worker CPU spike](spikes/0002-worker-cpu-neon-and-fixtures-query.md).

## Relay (`relay/`)

- [api/relay.ts](../relay/api/relay.ts): Vercel function that forwards the Worker's API-Football requests, because the Worker's Cloudflare address is often refused for rate limit

## Site (`site/`)

- [README.md](../site/README.md): the showcase page (Vite; `index.html`, `src/main.js`), see ADR 0006

## Find a decision or a plan

- [Docs index](INDEX.md): every ADR, spec and spike, one line each
- [Diagrams](diagrams/INDEX.md): the database map, request path, cron timeline, poller run and alert pipeline, each explained step by step
- [Project overview](PROJECT-OVERVIEW.md), [spec summary](../ScoreplusPlan.md), [project plan](../football-app-project-plan.md): what the app is meant to be
- [Deferred work](deferred.md), [screen test checklist](screen-test-checklist.md)

Related: [glossary](../GLOSSARY.md), [ADR index](adr/INDEX.md), [project instructions](../CLAUDE.md)
