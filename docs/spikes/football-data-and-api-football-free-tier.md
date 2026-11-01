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
- **Window:** `competitions/{code}/matches?dateFrom=&dateTo=` works for the 5 leagues. The job asks for 7 days back (to catch final scores and fill the app's 7-day Results strip) to 14 days ahead.
- **Teams:** `competitions/{code}/teams` returns the 95 teams of the 5 leagues. API-Football `teams?league=&season=2024` is allowed on the free plan (season 2026 is not), so the API-Football side of `team_map` comes from the 2024 lists of the top and second divisions plus the Champions League.

`team_map` result: 86 of 95 teams linked by name (4 of them by hand-written overrides in `server/scripts/seed-team-map.ts`). **Unmatched, to link by hand:** AS Roma (100), SSC Napoli (113), FC Porto (503), Le Mans FC (535), PAE AEK (1899), LASK Linz (2016), Viking FK (5720), Como 1907 (7397), Sabah FK (10233). They play in the Champions League or in a league whose 2024 list was not fetched; until one is linked, a fixture with that team is skipped by the sync and reported.

Matching deliberately never uses the three-letter code: it linked LASK Linz to Lincoln Red Imps and Viking FK to Vikingur Reykjavik in a trial.

**Known gap (closed by #22):** a fixture created by the sync has no `apiFootballId`, and the poller only polls fixtures that have one. The poller now links it from the live response when the match goes live (same league, home and away team ids, kickoff within 2 hours), with no extra request. It cannot link before kickoff, so pre-match lineups (#11) are not fetched for a snapshot fixture.

**Unverified, check on a matchday:** whether football-data.org's `score.fullTime` includes penalty shoot-out goals for a Champions League knockout tie (the sync would then store the shoot-out total as the final result, and log an overwrite against API-Football's score). Check against a recorded `PENALTY_SHOOTOUT` match before the knockout phase.

## Fallback poll (#21): to measure on the first matchday

Built from ADR 0015, not yet run against the live service. Two things are unverified and must be checked before relying on it:

- **The request.** The poller asks `matches?competitions=PL,PD,FL1,BL1,CL&status=IN_PLAY,PAUSED,FINISHED` (one request for all five leagues). That the free tier allows this unfiltered-by-date endpoint, and what window it returns, has not been tried.
- **The delay.** How far football-data.org's live score lags API-Football is unmeasured. While a match is in play, call both and note the minute each shows a goal. Record the lag here. If it is large (several minutes), the "Goal: Arsenal 2-1 Chelsea" fallback alert is late and the match screen should say so.
- **The score field.** The fallback reads `score.fullTime` as the running score during a match. Confirm that is what football-data.org puts there while a match is live.

## Archive lookups, measured 2026-11-01 (3 API-Football requests, for #23 and #24)

- `fixtures?ids=a-b-c`: **refused on the free plan** ("Free plans do not have access to the Ids parameter"). No batching: details cost one request per match.
- `fixtures?date=YYYY-MM-DD`: **works for the current season.** One request returns every fixture in the world that day: 1,569 fixtures, 1.5 MB, 22 of them in our five leagues. Ids, teams, scores and status only, no events, lineups or statistics. Parsing 1.5 MB may not fit the Worker's 10 ms CPU cap (ADR 0004): measure it there.
- `fixtures?date=...&league=39`: refused ("The Season field is required"), and season 2026 is blocked on the free plan, so the lookup cannot be narrowed to one league.
- **Not measured:** that `fixtures?id=<one match>` carries events, lineups and statistics together for a 2026 top-league match. #24 is built to work either way: if the response has statistics they replace the halftime ones; if not, the separate final-statistics request still runs. Check the first real completion fetch.
