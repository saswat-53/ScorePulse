# Free data sources for cricket and Formula 1, and a plan to add them

Date: 2026-11-15. Desk research plus a handful of no-key requests (OpenF1, Jolpica, F1 live timing, TheSportsDB, the Cricinfo RSS feed). No provider key was used, nothing was deployed, and no Worker request was made, so **every "from a Cloudflare Worker" statement below is from the provider's own discussion threads, not a measurement.** Raw responses are in the session scratchpad, not in the repo.

The rule this is measured against: $0 to run ([ADR 0011](../adr/0011-zero-cost-and-working-over-stack.md)), 10 ms CPU per Worker run ([ADR 0004](../adr/0004-stay-within-free-worker-cpu.md)), 5 to 10 users ([ADR 0005](../adr/0005-target-five-to-ten-users.md)), screens typed against one normalized contract ([ADR 0012](../adr/0012-ui-first-on-a-normalized-contract.md)), poll only what someone tracks ([ADR 0001](../adr/0001-demand-driven-polling.md), [ADR 0016](../adr/0016-poll-schedule-and-request-budget.md)).

## Summary

- **Cricket: CricketData.org (CricAPI) free plan.** 100 hits a day, all features "from the Lifetime Free plan" except the scorecard, which is a Fantasy API (paid, or a usage penalty on free). One `cricScore` hit returns every live match plus 7 days either side, so one poll covers all tracked matches, like API-Football's `live=`. Live scores (team runs, wickets, overs per innings) are possible for free; batter and bowler figures (fifties, centuries) are not.
- **F1: Jolpica-F1 for schedule, results and standings, OpenF1 (free, no key) for session classifications after a session ends.** **No free source gives live F1 positions.** OpenF1 live data is €9.90 a month, F1's own live timing needs an F1 TV subscription, and both are outside ADR 0011. F1 in ScorePulse is therefore results-only: a classification 30 to 60 minutes after each session, and pushes for session start (from the stored schedule, no request) and results.
- **Both need the relay** (`relay/`), not just API-Football: Jolpica refuses Cloudflare Workers by shared address (confirmed by its maintainer), and OpenF1 limits by IP as well.
- **The Worker can take only one more cron trigger** (free plan: 5 per account, 4 used in `server/wrangler.jsonc`), and cricket in Asia and Australia plays outside the football windows. That fifth trigger has to run often without waking Neon, so it needs the KV "next due" gate that ADR 0010 already floated.
- **Recommended order:** shared groundwork, then F1 results (low risk, few requests, ready for the 2027 season), then cricket live (bigger payoff, more unknowns). See [Phased rollout](#phased-rollout).

---

## Cricket sources

| Source | Free tier | Live? | Coverage | Auth | Terms | From a Worker | Status, late 2026 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **CricketData.org / CricAPI** | 100 hits/day ([pricing](https://cricketdata.org/pricing/)); "Daily Quota concept and not Hourly or Monthly" ([FAQ](https://cricketdata.org/some-frequently-asked-questions-about-the-cricket-data-api-and-cricapi/)) | Yes: "most data is a few minutes behind" ([pricing](https://cricketdata.org/pricing/)); with a key the lag is 30 s, without one 5 min ([terms](https://cricketdata.org/terms-of-use/)); "punched by our team manually… within 1 minute" ([cricScore page](https://cricketdata.org/cricket-score-cricscore-ecricscore-api/)) | Broad: internationals, Tests, BBL/WBBL, Syed Mushtaq Ali, Abu Dhabi T10, A tours (seen on the live [matches page](https://cricketdata.org/cricket-data-formats/matches) and [series page](https://cricketdata.org/cricket-data-formats/series), 2026-11-15) | `apikey` query parameter | Site materials for "personal and non-commercial use"; "for commercial use you will be required to purchase credits"; multiple accounts for free credits forbidden ([terms](https://cricketdata.org/terms-of-use/)) | **Unverified** | API answers (`{"status":"failure","reason":"Invalid API Key"}` without a key, 2026-11-15). Docs and code samples date from 2022 ([GitHub org](https://github.com/CricketData), last push 2022-12-01); the data-formats page threw an ASP.NET error on first load |
| Sportmonks Cricket | **No free plan on the pricing page**: Major €29/month, 14-day trial ([plans](https://www.sportmonks.com/cricket-api/plans-pricing/), [product page](https://www.sportmonks.com/cricket-api/)). Its docs still say a free plan covers T20I, CSA T20 Challenge and BBL ([getting started](https://docs.sportmonks.com/cricket/getting-started/getting-started)). Conflicting; treat the free plan as **unverified** | Yes on paid | 26+ leagues paid | `api_token` | Commercial | Unverified | Maintained |
| Roanuz Cricket API | Some endpoints free (tournament, fixtures list), but the Match API is ₹100 per match, ball-by-ball ₹100 per match, plus ₹0.7 per 100 requests ([pricing](https://www.cricketapi.com/v5/pricing/)) | Yes, paid | 400+ tournaments ([home](https://www.cricketapi.com/)) | Key | Commercial | Unverified | Maintained. Not $0 for live |
| API-Sports | **No cricket API found.** `v1.cricket.api-sports.io` does not resolve (curl, 2026-11-15), while `v1.formula-1.api-sports.io` does. The sports list page refused fetches (403) | n/a | n/a | n/a | n/a | n/a | n/a |
| ESPNcricinfo (unofficial) | Public RSS `static.cricinfo.com/rss/livescores.xml`, no key, `ttl` 2 min, `Cache-Control: max-age=30` (fetched 2026-11-15) | Score strings only, e.g. `Afghanistan 217/10 v Zimbabwe 339/10 & 169/7 *`: no overs, no status, no result | Whatever Cricinfo lists as live | None | Feed says `(c)Cricinfo`. The site refused curl (403), so which terms apply is **unverified**; ESPN properties use the Disney Terms of Use, which forbid "a robot, spider, script, or other automated means" and "data mining or web scraping" ([Disney ToU 2.B](https://disneytermsofuse.com/english/)) | Unverified | Feed works today. No documented contract |
| Cricbuzz (unofficial) | No public API. `robots.txt` disallows everything for `*`, including `/api/` and `/*.json` ([robots.txt](https://www.cricbuzz.com/robots.txt)) | n/a | n/a | n/a | "for non-commercial use only and private viewing only"; no reproducing or redistributing ([terms](https://www.cricbuzz.com/info/termsofuse)) | n/a | **Excluded**: ToS and robots both forbid it |
| TheSportsDB | Free key `123`, 30 requests/minute, "most queries limited"; livescores are paid and only for soccer, NFL, NBA, MLB, NHL ([pricing](https://www.thesportsdb.com/pricing)) | No for cricket | Fixtures only: `eventsday.php?s=Cricket` returned 3 fixtures with no scores (2026-11-15) | Key in path | Not read | Unverified | Schedule only |
| Cricsheet | Free downloads, ball-by-ball, 23,241 matches ([cricsheet.org](https://cricsheet.org/)) | No, post-match archive; delay after a match not stated | Internationals, IPL, BBL, The Hundred, PSL and more | None | Licence page not read (**unverified**) | n/a | Possible later for an archive, not for live |

### CricketData.org in detail

- **Endpoints** (all `https://api.cricapi.com/v1/...?apikey=`): `currentMatches?offset=` ("ALL current matches", [live score page](https://cricketdata.org/live-cricket-score-api/)), `cricScore` ("Last 7 Days matches + Next 7 Days matches + Current Live matches" in one hit, score as text such as `MI 190/7 (20)`, [cricScore page](https://cricketdata.org/cricket-score-cricscore-ecricscore-api/)), `matches`, `series_info`, `players`, and `match_scorecard`, `match_points`, `match_squad`, which the samples label Fantasy ([Python samples](https://cricketdata.org/python-code-samples/)).
- **What free does not cover:** "Fantasy API are only available under the Paid plan, and using under the 'Lifetime Free' plan has a usage penalty" ([fantasy docs](https://cricketdata.org/how-to-use-fantasy-cricket-api.aspx)). The FAQ says detailed scorecards come from the "Fantasy Scorecard API" ([FAQ](https://cricketdata.org/some-frequently-asked-questions-about-the-cricket-data-api-and-cricapi/)). It also says free has "access to all of the Cricket Data API's features", which conflicts; the fantasy page is the more specific one. **What the penalty is, is unverified.**
- **Hit counting:** "1 HIT = 1 Use of the API", tracked in the response ([pricing](https://cricketdata.org/pricing/)). When the daily quota resets (UTC or IST) is **unverified**.
- **Shape:** the rendered matches page shows each match as `Inning 1: 88/10 in 8.4 overs` plus a status line (`Yas Lions won by 8 wkts`, `Day 1: Stumps - Bangladesh opt to bat`) ([matches page](https://cricketdata.org/cricket-data-formats/matches)). The exact JSON field names (`score[].r/w/o/inning`, `matchStarted`, `matchEnded` and so on) are **unverified** until a key is used. Response size of `cricScore` (global, 14 days) is **unknown**, and that matters for the 10 ms CPU cap.
- **Cloud IPs:** nothing published. Measure from the Worker before building on it.

---

## Formula 1 sources

| Source | Free tier | Live? | Coverage | Auth | Terms | From a Worker | Status, late 2026 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Jolpica-F1** (Ergast-compatible) | 4 requests/s burst, 500/hour sustained, unauthenticated; "will decrease in the future" ([rate limits](https://github.com/jolpica/jolpica-f1/blob/main/docs/rate_limits.md)) | No. Results after the session; how long after is **unverified**. The 2026 Brazil race (2026-11-08) was in `current/last/results` on 2026-11-15 | Full history; 2026 season of 23 rounds, sprints, qualifying, driver and constructor standings (fetched 2026-11-15) | None. A custom `User-Agent` is required: default agents (`node`, `python-requests`, empty) are blocked since 2026-08-21 ([announcement](https://github.com/jolpica/jolpica-f1/discussions/386)) | Free for **non-commercial use**, data CC BY-NC-SA 4.0, no uptime guarantee, volunteer-run ([TERMS.md](https://github.com/jolpica/jolpica-f1/blob/main/TERMS.md)) | **Refused.** A Worker's requests arrive from Cloudflare's one shared address `2a06:98c0:3600::103` and get HTML 429s; the maintainer: "Having your own external IP will resolve the issue" ([discussion 412](https://github.com/jolpica/jolpica-f1/discussions/412), 2026-11-09). API tokens are planned, not available | Active (last push 2026-10-26, [repo](https://github.com/jolpica/jolpica-f1)); hosting about $45/month on donations ([README](https://github.com/jolpica/jolpica-f1)) |
| **OpenF1** | Historical data free, no key: 3 requests/s and 30/minute ([openf1.org](https://openf1.org/)) | **Paid only**: live data needs the Sponsor tier, €9.90/month, REST, MQTT and WebSocket ([openf1.org](https://openf1.org/)). "Live" means "from 30 minutes before a session starts until 30 minutes after it ends" ([FAQ](https://openf1.org/)). Users report unauthenticated requests get **401 for everything, even past data, while a session is on** ([issue 220](https://github.com/br-g/openf1/issues/220), [issue 280](https://github.com/br-g/openf1/issues/280)); not stated in the docs | 2023 onwards. Sessions incl. sprint and sprint qualifying; `session_result`, `starting_grid`, `position`, `intervals`, `laps`, `pit`, `race_control`, `overtakes`, `championship_drivers/teams` (beta) ([docs](https://openf1.org/docs/)) | None for historical; `POST /token`, 1-hour tokens, for paid ([auth](https://openf1.org/auth.html)) | "educational purposes, personal learning projects, research, and non-commercial fan engagement"; CC BY-NC-SA 4.0; unofficial ([openf1.org](https://openf1.org/)) | Unverified. The open-source API limits per remote address (`30/10seconds`, [query_api/app.py](https://github.com/br-g/openf1/blob/main/src/openf1/services/query_api/app.py)), so a shared Worker address would share the counter | Active (push 2026-11-12, [repo](https://github.com/br-g/openf1)). Live ingestion has had outages and lags of 3 to 20 minutes in 2026 ([issue 481](https://github.com/br-g/openf1/issues/481), [issue 489](https://github.com/br-g/openf1/issues/489)) |
| API-Sports Formula-1 | 100 requests/day, reset 00:00 UTC (search snippet of the [official page](https://api-sports.io/sports/formula-1); the page itself returned 403 to fetches) | **Unverified** | **Unverified** (free plan season limits, as with API-Football's 2022-2024 cap, are unknown) | `x-apisports-key`; `v1.formula-1.api-sports.io/status` asks for one | Not read | Same shared-address refusals as API-Football likely; **unverified** | Whether one API-Football key covers it and whether the quota is separate: **unverified** |
| F1 live timing (SignalR) | `livetiming.formula1.com/signalrcore/negotiate` answers anonymously, but the static archive (`/static/2026/Index.json`) returns **401** (curl, 2026-11-15). FastF1 "now requires an F1TV Access subscription (or higher plan) for most of its features" "following changes by Formula 1" ([FastF1 auth docs](https://docs.fastf1.dev/api_reference/accounts_auth.html)) | Yes, with F1 TV | All sessions | F1 TV account | F1's terms for this feed not read (**unverified**); it is undocumented and unofficial for third parties | A WebSocket held for a 2-hour race does not fit a cron run's 10 ms CPU ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)) | **Excluded**: paid and unsuitable |
| TheSportsDB | Free key, 30 req/min ([pricing](https://www.thesportsdb.com/pricing)) | No | `eventsnextleague.php?id=4370` lists 2026 sessions (Las Vegas FP1 2026-11-20 00:30 UTC, matching OpenF1 and Jolpica) | Key in path | Not read | Unverified | Schedule only; redundant with Jolpica |

### What the free F1 data looks like (Brazil 2026 race, session 11412)

| Request | Bytes | Use |
| --- | --- | --- |
| OpenF1 `session_result?session_key=11412` | 4,047 | Final classification of 22 cars: `position`, `driver_number`, `points`, `dnf`, `dns`, `dsq`, `gap_to_leader`, `number_of_laps`. `gap_to_leader` is a number for the leader's lap and a string (`"+2 LAPS"`) for lapped cars, and `position` is null for a DNF, so the adapter must handle both |
| OpenF1 `drivers?session_key=11412` | 9,025 | Name, acronym, team, `team_colour`, headshot URL |
| OpenF1 `championship_drivers?session_key=11412` | 3,575 | Points and position before and after the race |
| OpenF1 `starting_grid?session_key=11412` | 404 | Not available for this session |
| OpenF1 `intervals` / `laps` | 4.2 MB / 676 KB | Far too big for one Worker run; only useful with a `date>` filter, and only live, which is paid |
| Jolpica `current/last/results.json` | 13,129 | Classification with driver, constructor, grid, status, time, fastest lap |
| Jolpica `current/driverstandings.json` | 10,968 | Standings after round 20 |
| Jolpica `2026/races.json` | 14,298 | Whole calendar with each session's UTC start (`FirstPractice`, `Qualifying`, `Sprint`...) |

All of these are within the 46 KB response that spike 0002 measured at 6 to 9 ms ([spike 0002](0002-worker-cpu-neon-and-fixtures-query.md)).

---

## Constraints from the code that shape the plan

- **The contract is football-shaped.** `app/src/domain/types.ts` has `Fixture` with `home`/`away` `Team`, `Score { home, away }` as numbers, `minute`, and `LeagueId = 'CL' | 'PL' | 'PD' | 'FL1' | 'BL1'`. `server/src/leagues.ts` hard-codes the five leagues and their API-Football ids.
- **The tables are football-shaped.** `fixtures` (`server/src/db/schema.ts`) has `apiFootballId`, `homeGoals`, `awayGoals`, and many football-only bookkeeping columns (`lineupsAttempts`, `statsHtAttempts`, `uncoveredGoals`). `follows.fixtureId` references `fixtures`. `favorite_teams.teamId` is an API-Football team id, and the caps are database triggers ([ADR 0014](../adr/0014-cap-favorites-at-three-and-active-follows-at-two.md)).
- **The reusable parts are already generic.** `poll_state` is keyed by provider (`'api-football'`, `'football-data'`), and `recordRequest(db, now, id)` in `server/src/poller/quota.ts` already takes the id. The outbox (`notification_log`, unique on `(user_id, event_key)`) only needs new event-key namespaces. `queue-alerts.ts` and `send-alerts.ts` build keys like `fixture:{id}:event:{eventId}`.
- **Cron triggers: one left.** The free plan allows 5 per account ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)); `server/wrangler.jsonc` uses 4, and `server/src/schedule.ts` routes by cron string. The football windows (Fri to Mon 11:00 to 22:59 UTC, Tue to Thu 17:00 to 22:59) miss most cricket in India, Australia and New Zealand (03:30 to 10:00 UTC on the [matches page](https://cricketdata.org/cricket-data-formats/matches)) and the Las Vegas race (04:00 UTC, Jolpica calendar).
- **Neon hours are close to the cap.** Spike 0002 puts the football windows at 45 to 75 of 100 free CU-hours a month, because every run reads Neon. A fifth trigger running every 5 minutes around the clock cannot read Neon on every beat. ADR 0010 already suggests keeping the next due time "outside Neon (e.g. Workers KV)". Free KV allows 100,000 reads and 1,000 writes a day ([KV limits](https://developers.cloudflare.com/kv/platform/limits/)): 288 reads a day for a 5-minute beat is trivial.
- **The relay is hard-wired to API-Football.** `relay/api/relay.ts` has one `UPSTREAM` and an `ALLOWED` set of three paths, and `relay/vercel.json` rewrites only `/api/fixtures*`.

---

## The plan

### 1. Contract: one envelope, three sport payloads

Do not stretch `Fixture`. Cricket scores are runs, wickets and overs per innings, with up to 4 innings and a result sentence. An F1 session has no home or away and ranks 22 cars. Keep `Fixture` as football's and add a thin envelope that lists, follows and pushes can share:

```ts
// app/src/domain/types.ts (sketch)
type Sport = 'football' | 'cricket' | 'f1';
interface EventCard {            // what Home, Fixtures and the team page list
  sport: Sport; id: number; competition: string; startUtc: string;
  status: 'scheduled' | 'live' | 'break' | 'finished' | 'postponed' | 'cancelled';
  tracking: Tracking; paused: boolean; updatedAt: string; source: string;
}
interface CricketMatch extends EventCard {
  sport: 'cricket'; format: 'test' | 'odi' | 't20' | 'other';
  home: Team; away: Team;
  innings: { teamId: number; runs: number; wickets: number; overs: number }[];
  statusText: string;            // "Day 1: Stumps", "Yas Lions won by 8 wkts"
  day: number | null;            // Tests only
}
interface F1Session extends EventCard {
  sport: 'f1'; meeting: string; kind: 'practice' | 'sprint-qualifying' | 'sprint' | 'qualifying' | 'race';
  classification: { position: number | null; driver: Driver; team: Constructor; gap: string | null; laps: number; status: 'finished' | 'dnf' | 'dns' | 'dsq' }[] | null;
}
```

- `Fixture` gains `sport: 'football'` and is otherwise unchanged, so no football screen changes.
- A `MatchEvent`-style timeline exists only for cricket, and only as events the server derives (wicket, innings end, result), since free data has no ball-by-ball.
- Standings: `Standings` stays football's. F1 gets `DriverStanding[]` and `ConstructorStanding[]`. Cricket tables are deferred: whether the free API exposes series points tables is **unverified**.
- Per ADR 0012, build the cricket and F1 screens on mock data first, against these types, before any adapter exists.

### 2. Storage

- New tables, not new columns on `fixtures`: `cricket_matches` (provider id, teams, format, status text, `match_started`, `match_ended`, poll bookkeeping), `cricket_innings` (match, number, team, runs, wickets, overs), `cricket_teams`; `f1_meetings`, `f1_sessions` (OpenF1 `session_key`, Jolpica round, kind, start and end UTC), `f1_results` (session, position, driver, team, gap, laps, status), `f1_drivers`, `f1_constructors`.
- Follows and favorites: add `cricket_follows`, `f1_follows` (a follow of a session or a whole meeting) and `favorite_cricket_teams`, `favorite_f1_drivers`, each with its own trigger cap. Whether ADR 0014's 3 and 2 are per sport or shared is a product decision for a new ADR; per sport is simpler and keeps the football caps untouched.
- `poll_state` rows `'cricketdata'`, `'openf1'`, `'jolpica'` through the existing `recordRequest(db, now, id)`.

### 3. Polling, cadence and budget

**Shared prerequisite: the fifth cron and a KV gate.** Add `*/5 * * * *` as the fifth trigger, routed in `server/src/schedule.ts` to a new `job: 'other-sports'`. Its first action reads one KV key, `next_due_at`, and exits before touching Neon unless it is due. The jobs that know the schedule (the cricket morning sync, the F1 calendar sync, a follow or favorite change) write that key. This is ADR 0010's own fallback and needs an ADR of its own. Football's four triggers stay as they are.

**Cricket (CricketData, 100 hits/day):**

| Use | Hits |
| --- | --- |
| Morning sync: one `cricScore` (14 days of fixtures, all competitions) | 1 to 2 |
| Live poll: one `cricScore` per beat while any tracked match is in play, shared by every tracked match | 12 an hour at 5 min |
| T20 (about 3.5 h) | about 42 |
| ODI (about 8 h) | about 96: too many at 5 minutes. Poll at 10 minutes (about 48), or skip the innings break |
| Test day (about 7 h of play) | about 84 at 5 min, about 42 at 10 min, per day for up to 5 days |

- Reuse the quota ladder in `server/src/poller/quota.ts` with its own constants: 5 minutes normally, 10 minutes from 70 hits used, stop at 100 with "updates paused". There is no second free cricket source for an ADR 0015-style fallback. The Cricinfo RSS feed could be one technically, but its terms are unverified and ESPN's ToU forbid automated access, so do not use it without a decision.
- Stop rules by format, not football's constants (`STUCK_AFTER_MINUTES` = 155 and `POLL_LATE_START_MINUTES` = 90 in `server/src/poller/`): a T20 is over in about 4 hours; a Test is polled only while its status says play is on and sleeps from "Stumps" until the next day's start.
- Strip each response to tracked match ids before diffing, as spike 0002 advises for football. `cricScore`'s size is unknown; if it is large, `currentMatches?offset=` pages may be cheaper. Measure first.

**F1 (Jolpica plus OpenF1, no live):**

| Use | Requests per race weekend |
| --- | --- |
| Calendar sync (Jolpica `current.json`), once a day or once a week | 1 to 7 |
| Session start pushes | 0: the start time is already stored |
| Classification after each tracked session: OpenF1 `session_result` from 35 minutes after the session's `date_end` (the 401 window ends 30 minutes after), every 10 minutes until it appears | about 2 to 4 per session, 5 sessions: 10 to 20 |
| Race result and standings from Jolpica after the race | 2 to 4 |
| **Total** | **about 15 to 30**, against 500 an hour (Jolpica) and 30 a minute (OpenF1) |

- CPU is not a concern: every response above is under 15 KB.
- `gap_to_leader` mixes numbers and strings, and DNF rows have a null position: parse defensively, as `handle-poll.ts` learned with null event details.

### 4. The relay

Needed for both sports. Jolpica refuses the Worker's shared address ([discussion 412](https://github.com/jolpica/jolpica-f1/discussions/412)); OpenF1 limits per address; CricketData is unmeasured. Generalize `relay/api/relay.ts` from one `UPSTREAM` to a table of upstreams, each with its own allowed paths, and add rewrites in `relay/vercel.json` (`/api/jolpica/...`, `/api/openf1/...`, `/api/cricapi/...`). Two cautions:

- CricAPI takes its key as `apikey=` in the query string, unlike API-Football's header. A query-string key can end up in Vercel's request logs. Keep the relay logging nothing beyond status.
- Send a named `User-Agent` (for example `ScorePulse/1.x`) on every Jolpica request; default agents are blocked ([discussion 386](https://github.com/jolpica/jolpica-f1/discussions/386)).

### 5. Follows, favorites and pushes per sport

| | Cricket | F1 |
| --- | --- | --- |
| Favorite | A team (national side or franchise). Its matches become tracked | A driver or a constructor. Every session of every meeting is tracked for results |
| Follow | One match. Ends at the result, which for a Test can be 5 days later | A meeting (all its sessions) or one session. Ends at the race classification |
| Push: start | "Toss/Start: IND v AUS" when status leaves scheduled | "Qualifying starts in 15 min" from the stored schedule, no request (the [deferred](../deferred.md) "Fixture Reminders" idea, which here costs nothing) |
| Push: in play | **Wicket**: team wickets went up since the last poll. With polls 5 minutes apart several can fall at once, so one push says "2 wickets: AUS 145/5 (32.1)". **Innings end** when a new innings appears | None. **Race start and lead change need live data, which is paid.** Do not promise them |
| Push: end | **Result** with the status sentence ("Yas Lions won by 8 wkts") | **Qualifying**: pole and top 3. **Sprint and race**: top 3, plus the favorite driver's place ("NOR P1, your driver ALO P12") |
| Not possible free | **Fifty and hundred**: need batter figures from the scorecard, a Fantasy API (paid or penalised on free) | Positions during the session, fastest-lap alerts, pit stops while live |
| Dedupe key (`notification_log`) | `cricket:{id}:wickets:{inn}:{n}`, `cricket:{id}:innings:{n}:end`, `cricket:{id}:result` | `f1:{sessionKey}:start`, `f1:{sessionKey}:result` |

- Add per-user toggles beside `alert_goals` and the rest on `users`: cricket (start, wickets, innings, result) and F1 (session start, qualifying, race result). Recipients are resolved at send time as in ADR 0008, through `recipientsOf` in `server/src/poller/queue-alerts.ts`, extended to the new follow and favorite tables.
- Backfill (ADR 0002) applies to cricket: the first poll after a follow stores the current innings without sending wicket pushes.

### 6. UI

- **Sport switch** on Home and Fixtures: a chip row like `app/src/components/fixtures/league-chips.tsx`, with football first so nothing changes for current users.
- **Cricket card and screen:** `IND 245/6 (42.3) v AUS 251/8 (50)` plus the status line; a Test shows the day. The screen shows innings totals and the derived events (wickets with the over, innings end), not football's Lineups and Stats tabs. Reuse `paused-banner.tsx` and `not-live-card.tsx` states.
- **F1 weekend card:** meeting name, sessions with local times and countdown, and a "results in about an hour" note while a session runs, so nobody expects live positions. **Session screen:** a classification table (position, driver, team colour from OpenF1 `team_colour`, gap, laps, DNF or DSQ). **Standings:** drivers and constructors tabs.
- **Choose clubs** (`app/src/app/(app)/choose-clubs.tsx`) gets a sport step: cricket teams, F1 drivers or constructors.
- All new calls go through `app/src/api/index.ts` (ADR 0012).

---

## Phased rollout

**Phase 0: spikes and groundwork (do first, little code).**

1. Sign up for a CricketData key. From a throwaway Worker and from the relay, call `cricScore` and `currentMatches` once each: record whether the Worker is refused, the response size, the CPU time to parse and filter it, the real JSON fields, and when the daily count resets. Record the result in this file.
2. From the relay, call Jolpica with a named `User-Agent` and OpenF1 `session_result`. During a session (Las Vegas FP1, 2026-11-20 00:30 UTC), call OpenF1 without a token and record whether it answers 401, as users report.
3. Write the ADRs: the fifth cron with the KV gate, per-sport caps, and "F1 is results-only while live data costs money".
4. Mock-data screens for cricket and F1 against the new contract (ADR 0012).

**Phase 1: F1 results-only. Recommended first.**

- Lowest risk: no live polling, 15 to 30 requests a weekend, small responses, a stable volunteer API with a public repo and a responsive maintainer.
- Its work (sport envelope, new tables, relay upstreams, fifth cron and KV gate, sport-aware pushes) is exactly what cricket needs, so cricket starts on proven plumbing.
- Timing: only Las Vegas (2026-11-22), Qatar (2026-11-29) and Abu Dhabi (2026-12-06) remain in 2026 (Jolpica calendar). Building over the winter lands it for the 2027 opener; the 2027 date is **unverified**.

**Phase 2: cricket live scores.**

- Only if the Phase 0 spike passes (the Worker or relay reaches CricAPI, parsing fits in 10 ms).
- Start with T20 and ODI follows at the 5 and 10 minute cadence, then add Tests with the stumps rule.
- Larger payoff (live, all year, the format most likely followed in the group) but more unknowns: one small provider with 2022-era docs, manual data entry, no fallback source, and a 100-hit day that one ODI nearly spends.

**Phase 3: optional extras.** OpenF1 post-session detail (overtakes, pit stops, race control) on the session screen; a Cricsheet archive for finished cricket matches; cricket series tables if the free API turns out to have them.

**Not planned without a cost decision:** live F1 positions (OpenF1 Sponsor €9.90/month or F1 TV), cricket scorecards with fifties and hundreds (a CricketData paid plan; the cheapest is $5.99/month for 2,000 hits a day, and whether it includes the Fantasy scorecard is unverified), Sportmonks or Roanuz.

---

## Risks

1. **No free live F1.** Anything called "live F1" in the app would be false. The design shows results after sessions and says so.
2. **Shared Cloudflare address.** Jolpica refuses it (confirmed), OpenF1 likely shares a per-address counter, CricketData is unknown. The relay fixes it, but it becomes a dependency for every sport.
3. **CricketData is a thin provider.** Docs date from 2022, data is typed in by hand, and there is no second free cricket source to fall back on as football has (ADR 0015). Terms forbid multiple free accounts, so the 100-hit day cannot be stretched.
4. **Budget on long matches.** One ODI at 5 minutes is about 96 of 100 hits; a Test runs up to 5 days. Cadence must depend on the format.
5. **Cron and Neon.** One trigger left, and Neon is near its free hours. Without the KV gate, adding cricket hours would push Neon over 100 CU-hours.
6. **Licences.** Jolpica and OpenF1 are CC BY-NC-SA and non-commercial; CricketData's free use is non-commercial. Fine for a free app among friends; any ads or payments would need a new look.
7. **Community-run services.** Jolpica is volunteer-run on about $45 a month in donations, OpenF1 is one maintainer, and both had outages in 2026 ([Jolpica discussion 377](https://github.com/jolpica/jolpica-f1/discussions/377), [OpenF1 issue 489](https://github.com/br-g/openf1/issues/489)).

## Unverified, to check

- CricketData: JSON field names, `cricScore` size and CPU cost, the Fantasy "usage penalty", quota reset time, behaviour from a Worker.
- Sportmonks Cricket: whether the free plan in its docs still exists.
- API-Sports Formula-1: free plan seasons, live data, whether the API-Football account and quota cover it.
- OpenF1: whether unauthenticated requests really get 401 during the live window (user reports, not docs).
- Jolpica: how long after a session its results appear.
- Cricinfo RSS and F1 live timing: the terms that apply.
- The 2027 F1 calendar.
