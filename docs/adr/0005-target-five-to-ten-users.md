# 0005: Design v1 for 5 to 10 users

Date: 2026-10-28

## Context

The spec assumed fewer than about 100 users. The real group is 5 to 10 friends.

## Decision

- Design v1 for 5 to 10 users. This replaces assumption 1 of the spec.
- Stay on the Clerk development instance. No custom domain. No fallback is built now.
- If Clerk blocks sign-in, the fallback is passwordless invite codes that trade for a long-lived device token. Do not build password sign-in or reset.

## Consequences

- At most about 30 favorite teams, so quota pressure is far lower than the spec assumed. ADR 0001 still defines what happens if quota runs short.
- The risks "Sideloading friction" and "Clerk user cap" matter much less.
- Clerk dev-instance limits and branding are still unverified and should be checked before building auth.
