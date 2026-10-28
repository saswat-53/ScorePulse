# 0011: Zero cost and a working app come first; the stack is swappable

Date: 2026-10-29

## Context

The plan locks a stack (Expo, Hono on Workers, Neon, Clerk, Expo Push, API-Football). Several pieces have unverified free-tier limits: the Workers CPU cap, Neon compute, Clerk's development instance and API-Football's quota.

## Decision

- The goals are a v1 that costs $0 to run and works. The locked stack is a starting point, not a commitment.
- If a spike shows a piece cannot meet both goals, swap that piece for another free option. Do not pay.
- This extends [ADR 0004](0004-stay-within-free-worker-cpu.md): any piece may be redesigned or replaced, not just the poller.

## Consequences

- Each spike names a fallback before it runs.
- A swap gets its own ADR that supersedes the affected one.
