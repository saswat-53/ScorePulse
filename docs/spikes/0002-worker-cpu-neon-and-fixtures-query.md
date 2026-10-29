# Spike #2: Worker CPU, Neon compute, date-and-league query

Date: 2026-10-29. Code: `server/spike/` (throwaway). Recorded responses: `server/fixtures/api-football/`.

## Results

| Check | Result | Verdict |
| --- | --- | --- |
| Worker CPU on Cloudflare, recorded 46 KB (28 fixtures), fetch + parse + diff + Neon read | **6, 8, 9 ms** (tail `cpuTime`, 3 samples, each also reading 6,390 stored rows back, so an upper bound) | Pass, but only 1-4 ms of headroom |
| Worker CPU floor, empty response (fetch + Neon driver) | 5 ms | Baseline |
| Worker CPU, synthetic 4 MB `live=all` (2,520 fixtures, 6,390 events) | **49, 58, 58, 61 ms** | Fail, but not the designed workload (ADR 0001 polls five leagues, not `live=all`) |
| Node proxy, 46 KB / 4.1 MB | ~0.5-2 ms / ~12-17 ms | Understated Cloudflare by ~4x; use the Cloudflare numbers |
| Neon round trips, one poll (select stored + insert) | ~100 ms wall each, HTTP driver, works end to end | Pass |
| Neon compute for a matchday window | Console metrics (last hour): 0.25 vCPU allocated, ~0.02 vCPU used, suspends after ~5 min idle. One wake is about 0.02 CU-hours. A cron that never idles costs 0.25 CU x window hours: ~45 CU-hours at 6 h/day, ~75 at 10 h/day, against the Free plan limit of 100 CU-hours per project per month (confirmed: 400 h/month of 0.25 CU; scale to zero is always on, 5 min idle) | Pass if windows total under ~8 h/day |
| `fixtures?date=&league=` without `season` | `errors: {season: "The Season field is required."}` | **Fail** |
| `fixtures?date=&league=&season=2026` | `errors: {plan: "Free plans do not have access to this season, try from 2022 to 2024."}` | **Fail** |
| `fixtures?date=` only | 200, 208 fixtures, ~200 KB | Pass |
| `fixtures?live=all&league=ID` | 200, no error | Pass |

## Caveats

- CPU numbers are from a deployed throwaway Worker on the free plan, read from `wrangler tail` (`cpuTime`, 1 ms resolution), driven by a once-a-minute cron. Samples were few.
- The recorded response is an off-peak `live=all` (28 fixtures). No five-league weekend-peak response was recorded; it is unlikely to exceed a few hundred KB, so the 46 KB figures are the closest guide. The poller also does a grace period, writes and push on top of this, so 1-4 ms of headroom is thin.
- The spike was deleted from Cloudflare and its `spike_events` table dropped from Neon after measuring.
- No VAR event exists in the recorded response. Event types seen: Goal (Normal, Penalty, Own, Missed Penalty), Card (Yellow), subst.

## Fallbacks

- **Date-and-league query:** call `fixtures?date=YYYY-MM-DD` (no league) and filter by league id in the Worker, or use football-data.org (already planned for snapshots) for scheduled fixtures. Free, no ADR change needed for the poller.
- **CPU headroom (thin, not failing):** keep the league-filtered poll from ADR 0001 and do not widen to `live=all`. If the real poller goes over 10 ms, poll `live=<id>-<id>-...` (ids of live-tracked fixtures only; accepted by the API without error) so the body holds only tracked fixtures, and trim fields before diffing. No ADR needed unless that is adopted.

- **Neon hours (if windows are long):** narrow the window per league, or keep next-kickoff time outside Neon (e.g. Workers KV) so Neon wakes only when a poll is due (ADR 0010).

## Open items

- Re-measure CPU with the real poller (grace period, writes, push) once built; this spike covers fetch, parse and diff only.
- Re-check Neon CU-hours on the project Overview page after a real matchday (metrics lag ~1 h). Running out suspends compute until the next period.
- Record a VAR match when one is live.
