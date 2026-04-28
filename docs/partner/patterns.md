# Partner — Patterns

## P1. Queue as primary state

Membership-discount eligibility lives in the queue, not in `User.subscription` directly. This decouples partner offerings from subscription lifecycle and keeps schema changes localised.

## P2. Single update function for lifecycle events

`handleSubscriptionQueueUpdate(user, action)` is THE place that mutates queue state. Callers (subscription cancel, webhook, cron) all go through it. Don't update queue rows from random services.

## P3. Visibility computed server-side

Catalog visibility resolution happens server-side via `partner-catalog-visibility.ts` — don't filter on the client. Prevents enumeration attacks and keeps logic central.
