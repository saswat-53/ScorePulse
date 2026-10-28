# 0003: API-Football wins until full time, football-data.org wins after

Date: 2026-10-28

## Context

The two providers can disagree on a score, or one can lag the other. Each mirrored fixtures and standings row has a `source` column recording which provider supplied it.

## Decision

- Live-tracked fixture, before full time: API-Football is authoritative. football-data.org never overwrites live data.
- After full time: football-data.org is authoritative for the final result. The night job overwrites a differing stored result.
- Fixture never live-tracked: football-data.org is the only source.
- Each overwrite is logged so provider disagreement can be measured.

## Consequences

- A goal alert can later contradict the final score, for example after a late VAR correction. The night job does not send a correction alert in v1.
- The night job needs a log of overwrites.
