# 0004: Redesign to stay on the free Workers plan if the CPU cap fails

Date: 2026-10-28

## Context

The free Cloudflare Workers plan caps CPU time at 10 ms per invocation. The poller (parse, diff, grace period, write, push) and the snapshot sync have not been measured against it.

## Decision

- The first build task is a spike: run fetch, parse and event diffing against a recorded live response and read the CPU time.
- If it exceeds the cap, redesign to stay free. Do not move to the paid plan.

## Consequences

- The zero-cost rule holds for hosting.
- The fallback is to cut the work per invocation, for example one league per run or a smaller snapshot sync, and that adds coordination between runs.
