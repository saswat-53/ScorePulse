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
- Recorded VAR wording (2024-25 Everton 0-3 Brighton, fixture 1208024, `server/fixtures/api-football/var-everton-brighton-2024-25.json`): events have `type: "Var"` with `detail: "Goal cancelled"` (90+3', Brighton, player Yasin Ayari) and `detail: "Penalty cancelled"` (48', Everton, player Calvert-Lewin). The event carries the team, player and minute of the goal it cancels.
- Only `Goal cancelled` (and the unverified `Goal Disallowed ...` form) removes a goal. `Penalty cancelled` is a penalty decision, not a goal, and is stored as a timeline event only.
- In the recording the cancelled goal is absent from the final event list: it vanishes as the VAR event appears. The poller links the two by team, player and minute, and removes the goal at once.
- A removed goal is final: `removed_at` is set and the row stays. If it reappears later, nothing changes. A goal that arrives and is cancelled in the same poll was never announced, so nothing is sent.
- The grace period counts only polls in which the fixture is in the response, so a fixture that has left the live response (full time) does not make its goals look missing.
- Unit tests cover the 2-poll grace period, the VAR path and the correction dedupe key.
- Still unverified: other VAR wordings (for example `Goal Disallowed - offside`), and whether a 2026 live poll shows the goal and the VAR event together or one after the other. The poller treats both orders the same.
- A correction for a goal that was only backfilled (never announced by a push) still sends. This is rare and left as is.
