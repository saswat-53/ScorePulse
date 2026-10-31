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

## Follow-up: handler CPU (ticket #4)

Date: 2026-10-31. Code: `server/spike/handler-cpu.ts` (throwaway). The real `handlePoll` ran on a once-a-minute cron against Neon, with the 28 recorded matches seeded as fixtures. CPU is the tail `cpuTime` (1 ms resolution; about +/-4 ms noise between runs). The Worker was deleted and the seeded rows removed afterwards. The migrations stay applied to the dev database.

| Run | One INSERT per match | One INSERT for all matches |
| --- | --- | --- |
| 3 tracked, steady replay | 12 ms | 15 ms |
| 3 tracked, new goals (8 pushes) | 14 ms | 11, 10 ms |
| 28 tracked, steady replay | 43 ms | 16 ms |
| 28 tracked, first-poll backfill | 82 ms | not re-run |

- Batching removed the growth with the number of tracked matches, but the realistic 3-match poll is still **10-15 ms: at or over the 10 ms cap**. About 5 ms is fixed overhead (an empty run); the rest is two or three separate HTTPS requests to Neon plus drizzle.
- No invocation failed, even at 82 ms. The cap is not hard-enforced at these levels on cron runs, but nothing here is a basis to rely on that.
- Not measured: the push path with a real Expo sender (the fake sender is free) and the grace-period and VAR work (#5).

**Fallbacks, cheapest first:** (1) send the select, insert and update as one Neon HTTP request (`db.batch`, with the fixture lookup folded into the insert), which attacks the per-request cost directly; (2) split the poll across invocations, as ADR 0004 suggests (e.g. one league per run); (3) poll less often when few matches are live. None changes the design in ADR 0001 or 0013 yet; write an ADR if (2) or (3) is adopted.

## Follow-up: runner CPU after batching (ticket #6)

Date: 2026-10-31. Code: `server/spike/runner-cpu.ts` (throwaway). The real `runPoller` ran once a minute on Cloudflare against Neon, with 3 followed in-play matches (9 events, 6 goals) and a provider that served the recorded response. Neon requests per run: idle 1, normal poll 2 (state and fixtures in one batch, then events and writes in one batch). CPU is the tail `cpuTime` (1 ms resolution, noisy). The Worker was deleted and the seeded rows removed afterwards.

| Run | CPU samples |
| --- | --- |
| Idle (nothing due) | 7 ms |
| 3 matches, steady replay | 12 ms |
| 3 matches, new goals (6 pushes) | 21, 31 ms |

- Only 4 usable samples (the tail dropped some invocations), so the numbers are indicative, not exact.
- Steady replay (12 ms) is no better than before batching (10 to 15 ms). The new-goals run is worse (21 to 31 ms against 10 to 14 ms in #4): it now also writes fixture status and score, the poll counter and the first-poll marker, and the poll carries the grace-period read. The requests fell from about 7 to 2, so the cost is not the number of HTTPS requests; it is what each carries (building and parsing the statements, and the push loop).
- The idle run, the most common one, is 7 ms: inside the cap.
- No invocation failed, as in #4. The cap is still not a basis to rely on.
- The ADR 0004 fallbacks are next: poll less often when few matches are live, or split the work across invocations.
