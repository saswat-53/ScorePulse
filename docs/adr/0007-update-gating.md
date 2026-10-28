# 0007: Block the app below min_app_version, nag below latest

Date: 2026-10-28

## Context

Native-code changes ship as a new APK. The API can change shape, and an old build would break without any signal to the owner.

## Decision

- The API exposes `min_app_version` and `latest_app_version`. The owner edits both directly in Neon, with no admin screen.
- The app checks both at launch.
- Below `min_app_version`, the app shows a blocking "update required" screen with a button to the Vercel showcase page.
- Below `latest_app_version` but at or above `min_app_version`, the app shows a dismissible banner linking to the same page.
- `min_app_version` stays at the lowest build that works and is raised only for breaking API changes.

## Consequences

- A broken old build shows a clear message instead of crashing.
- The app needs the version check to work when the API is reachable. If the API call fails, the app does not block.
