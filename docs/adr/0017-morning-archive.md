# 0017: Fetch the details of finished matches in the quiet morning hours, one a run, within a request line

Date: 2026-11-01

Works with [ADR 0016](0016-poll-schedule-and-request-budget.md) (the request budget), [ADR 0004](0004-stay-within-free-worker-cpu.md) (the CPU cap) and [ADR 0003](0003-provider-conflict-resolution.md).

## Context

Only matches somebody follows get a timeline, lineups and stats. Any other finished match opens with its score. The goal is that any finished match in the five leagues opens with its story, so a user can look at what happened in a team's 12th fixture.

What the free plan allows (measured, see the spike doc): 100 requests a day; no multi-match request, so details cost one request per match; the by-date lookup works but returns 1.5 MB; the Worker has 10 ms of CPU per run and the live poll already sits at that edge.

## Decision

- **The live poll only links.** Every live match in a poll's response gets its API-Football id (the exact-match rule of #22). The events of matches nobody tracks are not stored there: that would make the poll heavier and risk its CPU cap.
- **A catch-up job fetches the details.** It runs in the quiet hours before matchday polling (06:25 to 09:55 UTC), one match per run, and is the same fetch by id that completes a followed match (#24), so the events are stored without an alert.
- **Order:** a favorite team's match first, then a match in a league where some user has a favorite, then the rest. The newest first within each.
- **Stop line:** it makes no request once the day's usage reaches 50, and 20 on Friday to Monday, when live polling needs the most. The morning's usage is the job's own, because nothing else spends before 11:00.
- **It stops by itself.** A match is fetched once (`completed_at`), at most 3 tries; with nothing missing a run makes no request. A backlog drains over a few mornings, then the job only has the day before to do.
- **It uses the morning sync's cron trigger.** 06:00 to 06:20 are the five sync runs; the rest of the trigger's runs until 09:55 are the archive's. No new trigger is needed (`src/schedule.ts`).
- **What cannot be fetched stays as it is:** the score and time from football-data.org, with "No timeline was saved for this match".

## Consequences

- A match gets its details the morning after it is played, not at the whistle.
- A match never seen live has no id and is skipped. Reaching those needs the by-date lookup (one request a day, 1.5 MB), which is not built: measure its CPU on a real deploy first.
- The older results of the season are not in the database yet (the sync reaches 7 days back); a one-time season load from football-data.org would bring them. They get details only once they have ids.
- **Storage is not a limit, so nothing is deleted.** A match is about 6 KB (about 15 events, two lineups, two stat rows); five leagues play about 1,800 a season, so about 11 MB a season against Neon's 0.5 GB free. This replaces the "delete after 90 days" idea in the first draft of #23, which would have removed early-season matches that a user wants to browse. Revisit if the database passes about 100 MB.
- Quota used by the job is visible in `poll_state` like any other request.
