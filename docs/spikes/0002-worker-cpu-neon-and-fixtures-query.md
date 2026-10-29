# Spike #2: Worker CPU, Neon compute, date-and-league query

Date: 2026-10-29. Code: `server/spike/` (throwaway). Recorded responses: `server/fixtures/api-football/`.

## Results

| Check | Result | Verdict |
| --- | --- | --- |
| Parse + diff CPU, 46 KB `live=all` (28 fixtures, 71 events) | ~0.5 to 2 ms in Node (proxy) | Pass |
| Parse + diff CPU, synthetic 4.1 MB (90x the fixtures, 6,390 events) | ~12 to 17 ms in Node (proxy) | **Fail against 10 ms, unconfirmed** |
| Neon round trips, one poll (select stored + insert) | ~100 ms wall each, HTTP driver, works end to end | Pass |
| Neon compute for a matchday window | Console metrics (last hour): 0.25 vCPU allocated, ~0.02 vCPU used, suspends after ~5 min idle. One wake is about 0.02 CU-hours. A cron that never idles costs 0.25 CU x window hours: ~45 CU-hours at 6 h/day, ~75 at 10 h/day, against the Free plan limit of 100 CU-hours per project per month (confirmed: 400 h/month of 0.25 CU; scale to zero is always on, 5 min idle) | Pass if windows total under ~8 h/day |
| `fixtures?date=&league=` without `season` | `errors: {season: "The Season field is required."}` | **Fail** |
| `fixtures?date=&league=&season=2026` | `errors: {plan: "Free plans do not have access to this season, try from 2022 to 2024."}` | **Fail** |
| `fixtures?date=` only | 200, 208 fixtures, ~200 KB | Pass |
| `fixtures?live=all&league=ID` | 200, no error | Pass |

## Caveats

- CPU numbers are from Node, not workerd. Workers CPU excludes time waiting on I/O, so Node `process.cpuUsage` is a rough upper-ish proxy only. The authoritative number needs the spike Worker deployed and read from `wrangler tail` / the dashboard `cpuTime`.
- The 4.1 MB case is synthetic. The off-peak real payload was 46 KB; the ~4 MB peak figure comes from earlier observation, and no weekend-peak response was recorded.
- No VAR event exists in the recorded response. Event types seen: Goal (Normal, Penalty, Own, Missed Penalty), Card (Yellow), subst.

## Fallbacks

- **Date-and-league query:** call `fixtures?date=YYYY-MM-DD` (no league) and filter by league id in the Worker, or use football-data.org (already planned for snapshots) for scheduled fixtures. Free, no ADR change needed for the poller.
- **Peak-size CPU (if confirmed on workerd):** poll `live=all&league=ID` for the leagues with a live-tracked fixture instead of `live=all`, which shrinks the body to a few fixtures (ADR 0004 fallback: cut work per invocation). Supersedes nothing yet; write an ADR if adopted.

- **Neon hours (if windows are long):** narrow the window per league, or keep next-kickoff time outside Neon (e.g. Workers KV) so Neon wakes only when a poll is due (ADR 0010).

## Open items

- Deploy the spike and read real CPU time (needs a Cloudflare deploy, user to approve).
- Re-check Neon CU-hours on the project Overview page after a real matchday (metrics lag ~1 h). Running out suspends compute until the next period.
- Record a VAR match when one is live.
- Human step: confirm the API-Football key was regenerated.
