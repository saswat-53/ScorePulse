# 0003: API-Football wins until full time, football-data.org wins after

Date: 2026-10-28

## Context

The two providers can disagree on a score, or one can lag the other. Each mirrored fixtures and standings row has a `source` column recording which provider supplied it.

## Decision

- Live-tracked fixture, before full time: API-Football is authoritative. football-data.org never overwrites live data.
- After full time: football-data.org is authoritative for the final result. The night job overwrites a differing stored result.
- Fixture never live-tracked: football-data.org is the only source.
- Each overwrite is logged so provider disagreement can be measured.

## How it is implemented (#7)

- "Live-tracked" is read from the fixture row: a fixture the poller has ever polled (`first_polled_at` set) belongs to API-Football until full time.
- Full time is football-data.org's `FINISHED`. Then the stored status becomes `FT` and the score becomes football-data.org's. The overwrite is logged in `fixture_overwrites` (old and new score) only when the score differs; a status change alone is not a disagreement.
- Fixtures never polled follow football-data.org on every run, with no log.
- A match with a team that is not in `team_map` is skipped and reported, not stored with a guess.

## Consequences

- A goal alert can later contradict the final score, for example after a late VAR correction. The night job does not send a correction alert in v1.
- The night job needs a log of overwrites.
