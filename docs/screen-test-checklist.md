# Screen test checklist

What can be checked in a browser, what needs you, and what needs a phone. Every ticket from #8 to #17 and #21 is built
and unit-tested, but none has been signed off against a screen. This file is where that sign-off is tracked.

Limits kept while testing: the browser tests only talk to the local server (localhost:8787) and so to Neon. They never
call API-Football (100 requests a day) or football-data.org (10 a minute): the poller and the sync only run from the
Worker's cron, which does not run locally, and the sync script is not run.

Legend: ✅ checked and fine · 🔧 found a problem and fixed it · ⚠️ found a problem, not fixed · ⏳ not checked yet ·
👤 needs the owner · 📱 needs a phone or emulator · 📅 needs a real matchday

## A. In the browser, no changes needed (read-only, any signed-in account)

| # | Ticket | Check | Result |
|---|---|---|---|
| A1 | #9 | Home: live card, upcoming list, league chips filter the list | ✅ chips filter Premier League, La Liga and an empty Champions League correctly |
| A2 | #9 | Fixtures: Fixtures/Results switch, day strip, empty day message | ✅ after fix (day buttons were cut in half, now whole); empty-day messages correct |
| A3 | #9 | Standings: each league tab loads, zone markers, empty league | ✅ Champions League, Premier League, La Liga load; favorites highlighted; top-four markers |
| A4 | #10 | Match screen of a finished match: header, tabs, empty states per tab | ✅ "Full time", and "No timeline / lineup / stats was saved for this match." |
| A5 | #10, #11 | Match screen of the demo match: timeline, lineups, stats | ✅ (earlier pass, 3 fixes) |
| A6 | #15, #16 | The update-required preview screen (developer link on More) | ✅ no Play logo, both versions shown, one button |
| A7 | all | Layout at 360, 430 and 768 px wide: nothing cut off, no sideways scroll | ✅ 360, 430 and 820 wide; league chips scroll sideways by design |
| A8 | all | Console errors on every screen | ✅ no errors; two known harmless warnings (Clerk development keys, notifications on web) |
| A9 | all | Requests per screen: no repeating loops, nothing polling faster than 60 s | ✅ 6 calls on load, then /live and /fixtures once a minute |
| A10 | #8 | Sign-in screen layout (the choose step and the email step, nothing submitted) | ⏳ blocked: viewing it means signing out, and the Dev sign-in is off (see B) |

## B. In the browser, as the Dev test user (writes, so never the real account)

Needs `DEV_AUTH_BYPASS=true` in `server/.dev.vars` and `EXPO_PUBLIC_DEV_LOGIN=true` in `app/.env`.

| # | Ticket | Check | Result |
|---|---|---|---|
| B1 | #8 | Dev sign-in, sign out, sign in again | ⏳ blocked: dev sign-in off |
| B2 | #8 | A new user lands on the club picker and cannot pass without a club | ⏳ blocked: dev sign-in off |
| B3 | #8 | Pick 3 clubs, the 4th is refused with the message, removing one frees a slot | ⏳ blocked: dev sign-in off |
| B4 | #14 | The permission prompt shows after the first club, "Not now" and "Enable" both close it | ✅ checked as the real account, no writes: both buttons close it, no errors (a real permission dialog is D4) |
| B5 | #12 | Follow a match: bell turns on, card changes, Unfollow turns it off | ⏳ blocked: dev sign-in off |
| B6 | #12 | Follow 2 matches, the 3rd is disabled with the message, unfollow frees a slot | ⏳ blocked: dev sign-in off |
| B7 | #14 | Alert toggles on More: change one, reload, it stays | ⏳ blocked: dev sign-in off |
| B8 | #17 | More shows the dev account, favorite teams link goes to the picker | ⏳ blocked: dev sign-in off |
| B9 | #17 | Delete Account: asks first, deletes, lands on sign-in, signing in again starts fresh | ⏳ blocked: dev sign-in off |

## C. Needs a change in the database (👤 you run the SQL, then I look)

| # | Ticket | Check | SQL |
|---|---|---|---|
| C1 | #16 | Update banner on Home | `update app_config set value = '2.0.0' where key = 'latest_app_version';` |
| C2 | #16 | Blocking update-required screen | `update app_config set value = '2.0.0' where key = 'min_app_version';` |
| C3 | #15 | "Updates paused" banner on the followed demo match | `poll_state` row `api-football` with `requests_today = 70` |
| C4 | #21 | "Limited updates: scores only" banner | `requests_today = 100` plus a fresh `football-data` row |
| C5 | #21 | Paused again when football-data.org is down | delete the `football-data` row at 100 |

Restore: `update app_config set value = '1.0.0' where key in ('min_app_version','latest_app_version'); update poll_state set requests_today = 0 where id = 'api-football'; delete from poll_state where id = 'football-data';`

## D. Needs a phone or emulator (📱)

Short list. A phone with Expo Go covers the first three; the rest need a development build.

| # | Ticket | Check |
|---|---|---|
| D1 | #8 | The on-screen keyboard does not cover the email and code fields (fix made, untried) |
| D2 | all | Safe areas: notch, status bar, bottom tab bar over the system bar |
| D3 | all | Android back button behaviour from the match screen and the picker |
| D4 | #13, #14 | Real permission dialog, push token registered, a test alert arrives (needs a development build, an EAS projectId, FCM credentials) |
| D5 | #13 | Sign-out removes that phone's token, a second phone keeps its own |
| D6 | #19 | Signed APK installs, and a second build installed over it keeps the session |
| D7 | #18 | A deliberate error from the app reaches Sentry |

Android Studio is not needed for D1 to D3: a phone with Expo Go does it. D4 to D7 need a development or release build
whatever the device is, so an emulator would not save that work.

## E. Needs a real matchday (📅)

| Ticket | Check |
|---|---|
| #21 | football-data.org's live-score delay, the request used, what `score.fullTime` holds in play |
| #13 | CPU of the real Expo send on Cloudflare; the real Expo ticket format |
| #11, #22 | Real 2026 lineups, stats and fixture links |
| #10 | The timeline of a real live match, VAR wording |

## Results

### Found and fixed while testing (committed, not pushed)

1. The web build could not call the server at all (CORS). Fixed.
2. Team colours were missing on every screen except the club picker: stats bars and the away lineup were invisible. Fixed.
3. A 4-2-3-1 lineup overlapped itself. Fixed.
4. The Fixtures day buttons were cut in half on the web, and the screen opened on last Saturday's results. Fixed.
5. The match minute was never sent, so the live card showed LIVE twice. Fixed (needs migration 0019, applied).
6. Overview showed "-" for Round and Venue. Rows with no value are now left out.
7. A reload or a tapped link lost its address and landed on Home, because the app decided "not signed in" before Clerk had finished loading. Fixed.

### Found, not fixed (your decision)

- Dead buttons (hidden, and listed in docs/deferred.md): the search icon (Home and Fixtures), the bell (Home) and the
  chevron on "1 live". None is in the plan.
- The "Enable Notifications?" prompt shows again every time the club picker is opened from More, even after the user
  chose. It should only show on first onboarding.
- The Results strip offers the last 7 days, but the snapshot keeps results for only 3 days back until it has run
  longer, so older days read "No results on this day".
- Home's league chips show only five leagues in a row that scrolls; the sixth fits at wider widths only (by design).

### Not checked, and why

- Sign-in screen (A10) and everything that writes (B): needs `DEV_AUTH_BYPASS=true` in `server/.dev.vars`, and
  `EXPO_PUBLIC_DEV_LOGIN=true` in `app/.env`, then restart both. Probed at the end: the server answered a dev token
  with 401, so the flag is not on there yet. I did not sign out the real account, as there would have been no way back.
- C1 to C5: need the SQL in section C, run by you.
- D and E: need a phone or a real matchday.

### Limits kept

No call to API-Football or football-data.org was made. The tests talked only to the local server: about 30 page loads
and one 70-second watch of the refresh, and the tab was closed at the end.
