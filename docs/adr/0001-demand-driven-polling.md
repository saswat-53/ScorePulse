# 0001: Poll on demand, process only live-tracked fixtures, widen the interval when quota is low

Date: 2026-10-29

Replaces the earlier version of this ADR, which proposed spending quota on favorite-team and followed matches first. That assumed quota is spent per fixture. It is spent per poll.

## Context

API-Football's free tier allows about 100 requests a day. About 80 go to live polling, which covers roughly 6.5 hours of play on a 10-hour Saturday. One league-filtered `live` call returns every live match in the five leagues, with events, so one poll costs one request however many matches are on.

## Decision

- Poll only when at least one live-tracked fixture is in play. If none is, make no request.
- A poll returns all live matches, but the poller stores events and sends alerts only for live-tracked fixtures.
- A fixture that is not live-tracked shows football-data.org snapshot data, always, whatever the quota.
- When quota runs low, the polling interval widens for everyone and the app shows "updates paused". There is no ranking between fixtures. _(Superseded by [ADR 0013](0013-favorites-keep-polling-when-quota-is-low.md): favorite-team fixtures keep polling when quota is low, follow-only fixtures pause first.)_

## Consequences

- The 5-minute promise applies only to live-tracked fixtures and only while quota lasts.
- On a heavy day, a favorite-team match is polled less often too once the interval widens.
- Processing fewer events keeps the poller inside the 10 ms CPU cap (see [ADR 0004](0004-stay-within-free-worker-cpu.md)).
