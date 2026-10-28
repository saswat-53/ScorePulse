# 0009: Confirm a cancelled goal by VAR event or two missing polls, then send one correction push

Date: 2026-10-29

## Context

A goal alert goes out as soon as the poller sees the event. A VAR check can cancel the goal later, and the API can also drop an event for a single response by mistake. Removing on one missing poll would flicker the score.

## Decision

- Goal alerts are sent immediately.
- A goal is removed from the timeline and score when either:
  - the API sends an explicit VAR "goal cancelled" event for it, or
  - the goal is missing from 2 consecutive polls.
- On removal, one correction push is sent: "Goal disallowed: now 0-0". Its dedupe key is `fixture:{id}:event:{eventId}:removed`.
- A goal that reappears after one missing poll is a glitch. Nothing is sent.

## Consequences

- A cancelled goal without a VAR event is confirmed about 10 minutes after the first alert.
- The exact text of API-Football's VAR event is unverified. The replay simulator must be run against a recorded VAR match.
- Unit tests cover the 2-poll grace period, the VAR path and the correction dedupe key.
