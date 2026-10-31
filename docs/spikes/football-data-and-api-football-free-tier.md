# Free-tier checks: football-data.org and API-Football

Date: 2026-10-31. Run with the owner's keys; a handful of requests each.

## football-data.org (free tier)

- Competitions available: Premier League (PL), Primera Division (PD), Ligue 1 (FL1), Bundesliga (BL1), UEFA Champions League (CL), plus Serie A, Eredivisie, Primeira Liga, Championship, Brasileirao, Copa Libertadores, Euros and World Cup. Current 2026 season data is present for all five target leagues.
- Rate: 10 requests per minute (`x-requests-available-minute` header).
- A match (`/v4/matches/{id}`) returns score, status, referees and `lastUpdated`. **`goals`, `bookings`, `substitutions`, lineups and statistics are all empty on the free tier.** It cannot drive a timeline or name a scorer.
- Live score delay: **not measured** (no match was in play). Check on the first matchday.

## API-Football (free plan)

- `fixtures?live=all` returns current 2026 data with events (see the 2026-10-29 recording).
- Listing queries for a season (`standings?league=&season=2026`, `fixtures?date=&league=&season=2026`) are blocked: the free plan allows seasons 2022 to 2024 only. The newest allowed season is 2024 (2024-25).
- By-id queries work for current-season fixtures (`fixtures?id=`, `fixtures/events?fixture=`).
- `fixtures/lineups` and `fixtures/statistics` returned no results and no error for the lower-league match tried; top-league coverage is **unverified**, which affects #11.

## Decisions

- API-Football stays the live source; football-data.org stays the snapshot source (#7).
- football-data.org also becomes the fallback when API-Football quota is exhausted: ADR 0015.
- The VAR event text will be taken from one 2024-25 match, used as a test fixture only, then confirmed on real 2026 matches.
