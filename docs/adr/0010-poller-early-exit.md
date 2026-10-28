# 0010: Poller exits early when nothing live-tracked is near

Date: 2026-10-29

## Context

Cron windows are static matchday hours with Postgres as the only store. With 5 to 10 users, many windows have no live-tracked fixture, but a poll every 5 minutes would still call API-Football and keep Neon awake.

## Decision

- Cron runs only inside the static matchday windows, so Neon is never woken around the clock.
- Each run starts with one query: is any live-tracked fixture in play, or due to kick off within 30 minutes? This is the `poll_state` check from the plan.
- If not, the run ends without calling API-Football, per [ADR 0001](0001-demand-driven-polling.md).
- The spike from [ADR 0004](0004-stay-within-free-worker-cpu.md) also measures Neon compute against the estimated 50 CU-hours a month.

## Consequences

- API-Football quota is spent only when a live-tracked fixture is near.
- The query still wakes Neon, so compute savings are small. If Neon hours are tight, narrow the window per league.
