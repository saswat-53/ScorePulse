# 0013: When quota is low, favorite-team matches keep polling and one-off follows pause first

Date: 2026-10-31

Supersedes the last bullet of [ADR 0001](0001-demand-driven-polling.md) ("There is no ranking between fixtures").

## Context

A fixture is live-tracked because a user follows the match or a user has either team as a favorite. A favorite is a standing choice that lasts all season. A follow is a one-off for a single match that ends at full time. ADR 0001 treated them the same, so when API-Football quota ran low, polling slowed for everyone alike.

A poll costs one request however many matches it returns, so quota cannot be rationed per fixture. It can only be rationed by deciding whether to poll at all.

## Decision

- Each live-tracked fixture has a reason: favorite team, follow, or both. A fixture with both counts as a favorite.
- Normal quota: nothing changes. Every live-tracked fixture is polled and alerts as before.
- Quota low: the poller runs only when a favorite-team fixture is in play or due to kick off. Fixtures tracked only by a follow are not polled and the match screen shows "updates paused".
- When quota is exhausted, polling stops for everyone, as in ADR 0001.
- The "quota low" threshold is a constant set in #6 and revisited with real usage.

## Consequences

- A followed-only match can go quiet on a heavy day. The user sees "updates paused" on that match instead of stale data.
- The poll-or-not check from [ADR 0010](0010-poller-early-exit.md) needs the reason, so the live-tracked lookup returns it with the fixture id.
- #6 builds the quota state and the reason-aware check, and #15 the "updates paused" state.
