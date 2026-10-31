# 0014: Cap favorites at 3 and active follows at 2 per user, enforced on the server

Date: 2026-10-31

Supersedes the "no cap on follows" decision in [ADR 0002](0002-follow-backfill.md). The backfill decision there stands.

## Context

ADR 0002 dropped a follow cap because v1 has 5 to 10 users. Favorites were already capped at 3. A poll costs one API-Football request however many matches it returns ([ADR 0001](0001-demand-driven-polling.md)), so a cap does not cut requests per poll. It does bound the number of live-tracked fixtures per poll, which bounds Worker CPU, push volume and stored events, and keeps the free-tier use predictable whatever the group does. The goal is to stay at $0 ([ADR 0011](0011-zero-cost-and-working-over-stack.md)).

## Decision

- Each user has at most 3 favorite teams and at most 2 active follows, so at most 5 live-tracked matches at once.
- An active follow is a followed match that has not reached full time. A follow ends at full time, so the user can follow another match afterwards.
- The server enforces both caps and rejects a request over the cap with a clear error. The app also hides or disables the control, but the server is the lock.
- Favorites are counted per user, not per team: many users can share a team.
- A follow always counts against the user's 2 slots, even when the match is already live-tracked because someone else's favorite or follow covers it. Following it costs no extra request or storage, but it adds that user as a recipient. A rule that depended on other users would change a user's limit whenever a friend unfollowed, and would let the cap be bypassed.
- The numbers are two constants in one place, so changing them is a one-line change.

## Consequences

- Fixtures and events are shared in one database. A match any user tracks is stored once and every user can read its timeline; the cap and the alerts are per user.
- Worst case is bounded: 5 matches per user, and far fewer distinct matches because favorites overlap.
- The cap does not reduce API-Football requests. Quota is saved by poll scheduling: the early exit in [ADR 0010](0010-poller-early-exit.md) and the low-quota rule in [ADR 0013](0013-favorites-keep-polling-when-quota-is-low.md).
- A user who wants a third match at once must unfollow one. The app says so when the cap is reached.
- #12 enforces the follow cap and #8 the favorite cap, each with a test at the API.
