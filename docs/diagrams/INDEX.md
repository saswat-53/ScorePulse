---
title: Diagrams
date: 2026-11-21
tags: [index, diagram]
---

# Diagrams

Each diagram has an explanation written for someone new to the code, with the terms defined as they come up. Read them in order. The `.excalidraw` files are the editable sources; the `.png` and `.svg` are exports.

- [Diagram 1: the database](01-database.md): every table, how they link, why two providers, the triggers
- [Diagram 2: the request path](02-request-path.md): app, Clerk, Worker, Neon; sign-in, tokens, public and protected routes, the webhook
- [Diagram 3: the cron timeline](03-cron-timeline.md): when the Worker wakes up, and how a cron run becomes a sync, an archive or a poll
- [Diagram 4: the poller run](04-poller-run.md): the seven steps of one 5-minute beat, the quota and rate limits, the fallback, the extras
- [Diagram 5: the alert pipeline](05-alert-pipeline.md): owed flags, the outbox, sending through Expo, retries, dead tokens, and the life of a notification row

- [Diagram generator](tools/README.md): how to rebuild or write a diagram

Up: [docs index](../INDEX.md)
