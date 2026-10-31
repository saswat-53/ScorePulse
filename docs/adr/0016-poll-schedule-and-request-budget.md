# 0016: Poll every 5 minutes with waste cut out, and stretch the interval only when quota is low

Date: 2026-10-31

Refines the polling interval in [ADR 0001](0001-demand-driven-polling.md) and the early exit in [ADR 0010](0010-poller-early-exit.md). Works with [ADR 0013](0013-favorites-keep-polling-when-quota-is-low.md) and [ADR 0015](0015-fall-back-to-football-data-scores-when-quota-is-exhausted.md).

## Context

API-Football's free plan allows 100 requests a day, and neither provider offers a push or webhook for live events that I could confirm. A poll costs one request however many users or matches it covers, so the budget is spent by the hours the poller runs. A 2-hour match costs about 24 requests at 5 minutes. A normal weeknight (about 4 hours of play) costs about 48. A busy Saturday with 9 to 10 hours of overlapping matches costs about 110, which is over the limit.

## Decision

- The base interval stays 5 minutes for favorite-team fixtures.
- A fixture tracked only by a one-off follow is polled when a favorite fixture is not already making the poll run; it adds no extra requests of its own, because a poll returns every tracked match. It is never polled more often than 5 minutes.
- The poller stops spending requests where nothing happens:
  - It does not poll during halftime (status `HT`).
  - A fixture's polling starts at kickoff and ends at full time. The 30-minute lookahead in ADR 0010 only decides whether a run is due.
  - No poll when no live-tracked fixture is in play.
- Low quota stretches the interval to 10 minutes and applies the favorite-first rule from ADR 0013. Exhausted quota switches to the football-data.org fallback in ADR 0015.
- The poller records the requests it spends per day in `poll_state` so the budget is measurable.

## Consequences

- On an ordinary day the 5-minute promise holds. On a heavy Saturday the late afternoon runs at 10 minutes, then falls back to scores only if the quota runs out.
- 3 to 4 users sharing teams and matches do not change the request count, since a poll is shared by everyone.
- The savings from skipping halftime and the idle edges are an estimate of 20 to 30 percent of requests. Measure them on the first matchdays and adjust the intervals, which are constants.
- #6 builds the schedule and the request counter.

## Experiment, not a decision

Use football-data.org as a cheap watcher (it has its own quota of 10 requests a minute): check scores every 2 to 3 minutes and call API-Football only when a score changes. That cuts API-Football requests to about one per goal. It depends on football-data.org's free-tier live delay, which is unmeasured (third-party sources describe the free tier as delayed). Measure the delay on the first matchday. If it is under about 2 minutes, write a new ADR; otherwise this one stands. Cards and substitutions would arrive only with the next detail fetch under that design.
