# ScorePulse Glossary

**Live-tracked fixture**
A fixture the poller reads from API-Football during matchday windows. A fixture is live-tracked when at least one user follows the match or has either team as a favorite. Only live-tracked fixtures get a timeline and push alerts.

**Snapshot**
Stored fixture, result and standings data from football-data.org, refreshed by the morning and night jobs. It is the only data a fixture has when it is not live-tracked. The match screen labels it "not live-tracked, tap Follow."

**Follow (a match)**
A user action that makes a fixture live-tracked until full time. There is no cap on follows in v1. The first poll after a follow backfills the full event list, so the timeline is complete from kickoff.

**Favorite team**
One of up to 3 teams a user picks. Matches involving a favorite team are live-tracked.

**Authoritative source**
The provider whose data wins when API-Football and football-data.org disagree. API-Football is authoritative for a live-tracked fixture until full time. After full time, football-data.org is authoritative for the final result. A fixture that was never live-tracked only has football-data.org data.

_Avoid:_ "subscribed match", "watched match" (use Follow); "live match" for a fixture that is merely in progress (use live-tracked only for fixtures the poller reads).
