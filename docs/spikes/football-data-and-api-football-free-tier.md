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

## Snapshot sync (#7), 2026-10-31

Limits as recorded while building it (13 football-data.org requests and 9 API-Football requests, one-off):

- **Rate:** football-data.org allows 10 requests a minute. The sync makes 2 requests per league, one league per cron run, so it never gets near it.
- **Events:** none on the free tier (no goals, bookings, substitutions, lineups, statistics). The sync stores fixtures, results and standings only.
- **Delay:** still unmeasured (no live comparison done). Check on the first matchday, as in the earlier section.
- **Window:** `competitions/{code}/matches?dateFrom=&dateTo=` works for the 5 leagues. The job asks for 3 days back (to catch final scores) to 14 days ahead.
- **Teams:** `competitions/{code}/teams` returns the 95 teams of the 5 leagues. API-Football `teams?league=&season=2024` is allowed on the free plan (season 2026 is not), so the API-Football side of `team_map` comes from the 2024 lists of the top and second divisions plus the Champions League.

`team_map` result: 86 of 95 teams linked by name (4 of them by hand-written overrides in `server/scripts/seed-team-map.ts`). **Unmatched, to link by hand:** AS Roma (100), SSC Napoli (113), FC Porto (503), Le Mans FC (535), PAE AEK (1899), LASK Linz (2016), Viking FK (5720), Como 1907 (7397), Sabah FK (10233). They play in the Champions League or in a league whose 2024 list was not fetched; until one is linked, a fixture with that team is skipped by the sync and reported.

Matching deliberately never uses the three-letter code: it linked LASK Linz to Lincoln Red Imps and Viking FK to Vikingur Reykjavik in a trial.

**Known gap:** a fixture created by the sync has no `apiFootballId`, and the poller only polls fixtures that have one. Something must link a snapshot fixture to its API-Football fixture (teams and kickoff date) before a follow or a favorite can be live-tracked. This is not in #7's criteria; it needs its own ticket.

**Unverified, check on a matchday:** whether football-data.org's `score.fullTime` includes penalty shoot-out goals for a Champions League knockout tie (the sync would then store the shoot-out total as the final result, and log an overwrite against API-Football's score). Check against a recorded `PENALTY_SHOOTOUT` match before the knockout phase.
