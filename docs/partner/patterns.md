# Partner — Patterns

## Site-wide interaction smoothness — Phase 2 (2026-05-10)

`PartnerHero` adopted the shared device-tier CSS tokens documented in [shared-ui patterns](../shared-ui/patterns.md). The 8 `backdrop-blur-sm` callsites on the feature cards now read `backdrop-blur-[var(--ta-blur)]`, so mobile (and Save-Data) render with no blur and tablet with a lighter blur, without changing the desktop hero look.

## P1. Queue as primary state

Membership-discount eligibility lives in the queue, not in `User.subscription` directly. This decouples partner offerings from subscription lifecycle and keeps schema changes localised.

## P2. Single update function for lifecycle events

`handleSubscriptionQueueUpdate(user, action)` is THE place that mutates queue state. Callers (subscription cancel, webhook, cron) all go through it. Don't update queue rows from random services.

## P3. Visibility computed server-side

Catalog visibility resolution happens server-side via `partner-catalog-visibility.ts` — don't filter on the client. Prevents enumeration attacks and keeps logic central.
