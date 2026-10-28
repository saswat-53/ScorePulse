# 0002: Backfill on the first poll after a follow, with no follow cap

Date: 2026-10-28

## Context

A follow can start mid-match, so earlier events were never polled. A follow makes a fixture live-tracked under [ADR 0001](0001-demand-driven-polling.md). The live call already returns each match's full event list, so a follow costs no extra request. A cap of 2 follows per user was considered, then dropped because v1 targets 5 to 10 users (see [ADR 0005](0005-target-five-to-ten-users.md)).

## Decision

- The first poll after a follow stores the full event list from the live response, so the timeline is complete from kickoff.
- There is no cap on follows in v1.
- If quota is exhausted, the app shows "updates paused" on the match. It does not fail silently.

## Consequences

- The poller needs a "first poll for this fixture" path that backfills instead of only diffing.
- Revisit a cap if the group grows well beyond 10 users.
