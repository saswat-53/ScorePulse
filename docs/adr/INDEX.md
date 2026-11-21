# adr

Index of this folder. Each document links back here; add a line when you add a file.

- [0001: Poll on demand, process only live-tracked fixtures, widen the interval when quota is low](0001-demand-driven-polling.md)
- [0002: Backfill on the first poll after a follow, with no follow cap](0002-follow-backfill.md)
- [0003: API-Football wins until full time, football-data.org wins after](0003-provider-conflict-resolution.md)
- [0004: Redesign to stay on the free Workers plan if the CPU cap fails](0004-stay-within-free-worker-cpu.md)
- [0005: Design v1 for 5 to 10 users](0005-target-five-to-ten-users.md)
- [0006: Build the APK locally, host it on Drive, link it from a Vercel showcase page](0006-local-build-and-showcase-page.md)
- [0007: Block the app below min_app_version, nag below latest](0007-update-gating.md)
- [0008: Resolve push recipients at send time and prune dead tokens](0008-push-recipient-rules.md)
- [0009: Confirm a cancelled goal by VAR event or two missing polls, then send one correction push](0009-var-correction.md)
- [0010: Poller exits early when nothing live-tracked is near](0010-poller-early-exit.md)
- [0011: Zero cost and a working app come first; the stack is swappable](0011-zero-cost-and-working-over-stack.md)
- [0012: Build the screens first on mock data, typed against one normalized contract](0012-ui-first-on-a-normalized-contract.md)
- [0013: When quota is low, favorite-team matches keep polling and one-off follows pause first](0013-favorites-keep-polling-when-quota-is-low.md)
- [0014: Cap favorites at 3 and active follows at 2 per user, enforced on the server](0014-cap-favorites-at-three-and-active-follows-at-two.md)
- [0015: When API-Football quota is exhausted, fall back to football-data.org scores every 10 minutes](0015-fall-back-to-football-data-scores-when-quota-is-exhausted.md)
- [0016: Poll every 5 minutes with waste cut out, and stretch the interval only when quota is low](0016-poll-schedule-and-request-budget.md)
- [0017: Fetch the details of finished matches in the quiet morning hours, one a run, within a request line](0017-morning-archive.md)
