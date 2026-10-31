# 0015: When API-Football quota is exhausted, fall back to football-data.org scores every 10 minutes

Date: 2026-10-31

Supersedes the exhausted-quota case in [ADR 0001](0001-demand-driven-polling.md) and [ADR 0013](0013-favorites-keep-polling-when-quota-is-low.md), where polling stopped for everyone and the app showed "updates paused". Works with [ADR 0003](0003-provider-conflict-resolution.md).

## Context

API-Football's free plan allows 100 requests a day. Today that limit ends all live updates until the next day. football-data.org has its own quota (10 requests a minute on the free tier) and covers all five leagues, but its free tier returns only the score and status of a match: no scorers, minutes, cards, substitutions or lineups. See `docs/spikes/football-data-and-api-football-free-tier.md`. The group is 3 to 4 people ([ADR 0005](0005-target-five-to-ten-users.md)), so a slow poll is enough.

## Decision

- Normal quota and low quota: unchanged. API-Football is the live source ([ADR 0013](0013-favorites-keep-polling-when-quota-is-low.md) decides what is polled when quota is low).
- Quota exhausted: the poller stops calling API-Football and polls football-data.org every 10 minutes instead, one call for all live matches in the five leagues, only while a live-tracked fixture is in play or due to kick off ([ADR 0010](0010-poller-early-exit.md)).
- In this fallback the poller updates the stored score and status. When a live-tracked fixture's score goes up, it sends one push "Goal: Arsenal 2-1 Chelsea" with no scorer or minute. The dedupe key is `fixture:{id}:score:{home}-{away}`.
- The match screen shows "limited updates: scores only" instead of "updates paused". The timeline keeps the events stored before the switch and adds none.
- When API-Football quota resets, the poller returns to it. The next poll backfills the timeline as in [ADR 0002](0002-follow-backfill.md), with no pushes for events already covered by a score alert.
- If football-data.org also fails or rate-limits, polling stops and the app shows "updates paused".
- The interval (10 minutes) is a constant, so it can move to 15 without a schema change.

## Consequences

- Live alerts keep working on a heavy day, with less detail and a slower rhythm.
- football-data.org's free-tier delay on live scores is unverified: no match was in play when it was tested. Check it on the first matchday. If the delay is large, the fallback alert is late and the screen says so.
- A fallback score can disagree with the API-Football timeline until the quota resets. Per [ADR 0003](0003-provider-conflict-resolution.md) the final result is still football-data.org's after full time.
- #6 builds the poller switch and #15 changes from "updates paused" to the two states above. A new ticket covers the football-data.org live poll.
