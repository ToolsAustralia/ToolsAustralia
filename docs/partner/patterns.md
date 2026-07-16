# Partner — Patterns

## Site-wide interaction smoothness — Phase 2 (2026-05-10)

`PartnerHero` adopted the shared device-tier CSS tokens documented in [shared-ui patterns](../shared-ui/patterns.md). The 8 `backdrop-blur-sm` callsites on the feature cards now read `backdrop-blur-[var(--ta-blur)]`, so mobile (and Save-Data) render with no blur and tablet with a lighter blur, without changing the desktop hero look.

## P1. Queue as primary state

Membership-discount eligibility lives in the queue, not in `User.subscription` directly. This decouples partner offerings from subscription lifecycle and keeps schema changes localised.

## P2. Single update function for lifecycle events

`handleSubscriptionQueueUpdate(user, action)` is THE place that mutates queue state. Callers (subscription cancel, webhook, cron) all go through it. Don't update queue rows from random services.

## P3. Visibility computed server-side

Catalog visibility resolution happens server-side via `partner-catalog-visibility.ts` — don't filter on the client. Prevents enumeration attacks and keeps logic central.

## P4. Partner-access ring resolved once, shared across surfaces (2026-07-09)

[`resolvePartnerAccessRing(user)`](../../src/utils/partner-discounts/partner-access-ring.ts) is the single derivation for the "access %" ring instrument: state precedence `pastdue > active > onetime > none` (`deriveDashboardAccountState`), percent from the shared queue-aware resolver (`buildPartnerCatalogContext` → `resolvePartnerCatalogPlanId` → `getPartnerCatalogAccessPercentForPlanId` — downgrade-preservation aware, never guessed from the stored packageId), and the past-due nuance (membership access pauses; a paid one-time window with `source !== "membership"` is kept). It mirrors `useDashboardState`'s hero-ring math exactly and feeds the admin user-detail modal via `AdminUserDetail.partnerAccessRing` (server-derived — no access logic in admin JSX). `formatPartnerAccessExpiryLabel` is the single "{N} days / 24hr" caption formatter (the dashboard hook imports it too). New surfaces needing the ring should consume this util, not re-derive.

## P5. Portal checks us live — call-on-moment, redeem is the gate (2026-07-16)

iGoDirect's MyRewards portal does **no timed polling** against `GET /api/partner-discount/member-status`; it calls at three moments: **SSO sign-in**, **page load**, and **offer redemption**. The redeem-time call is the real **enforcement gate** — page-load calls only keep the portal's UI honest. On our 5xx/timeout the portal may let *browsing* fall back to the last SSO-known level, but **redemption must require a fresh successful check** (fail closed; recommended to the vendor in the integration PDF, pending their confirmation). The endpoint is a read with a deliberate side effect: every answer is **reconcile-then-read** (`reconcilePartnerDiscountAccess`), which is what keeps it current — a one-time pack expiring on a timer produces no event anywhere; whoever evaluates next discovers it. Corollary: **no caching anywhere** (`Cache-Control: no-store` on every response), because a cached answer defeats the entire when-they-call model. See [igodirect-member-status-api-plan.md](./igodirect-member-status-api-plan.md) §1/§5 and [api.md](./api.md).
