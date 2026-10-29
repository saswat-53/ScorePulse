# 0012: Build the screens first on mock data, typed against one normalized contract

Date: 2026-10-29

## Context

The risky parts of v1 are in the backend (Worker CPU, Neon compute, quota, provider data). Screens do not depend on those results. API-Football and football-data.org name the same facts differently, so screens built on either provider's shape would break when the other is added.

## Decision

- The app is built first, with every v1 screen working on mock data.
- The mock data is typed against one normalized contract in the app (teams, fixtures, scores, standings, events, lineups, stats, version config). Server adapters map each provider into it, so screens never see provider vocabulary.
- Events, lineups and stats exist only for API-Football, so they are optional in the contract. football-data.org fills fixtures, results and standings.
- All backend calls go through one module in the app. Wiring a screen to the real API replaces that module's functions and nothing else.
- The contract is written from the providers' documented responses and is unverified. The spike (issue #2) records real responses and corrects it.

## Consequences

- Tickets #8 to #17 change from "build the screen" to "make the screen real": replace mock data with the real API, add the conditions, and test at the seams.
- A mismatch found by the spike changes the contract once, in the adapters and the mock data.
- The screens can be reviewed against the mockup before any backend exists.
