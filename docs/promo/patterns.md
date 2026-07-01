# Promo — Patterns

## Site-wide interaction smoothness — Phase 2 (2026-05-10)

Promo-domain components now consume the shared device-tier CSS tokens introduced in [shared-ui patterns](../shared-ui/patterns.md). `PrizeShowcase`, `GiveawayCountdownTimer`, `PromoBanner`, `PartnerBenefitsPromoSection`, and `FloatingCountdownBanner` swapped fixed `backdrop-blur-*` / `transition-all` / inline card shadows for `var(--ta-blur)`, `var(--ta-transition-dur)`, `var(--ta-shadow-card)` and friends — desktop visual unchanged, mobile and tablet render lighter without a JS branch. `PowerToolsetCarousel` reads `useDeviceProfile()` so its radial pulse glow and Y-bob loops only run when `tier === "desktop"` (and stay disabled under reduced motion). `GiveawayCountdownTimer` switched its `<AnimatePresence>` digit transition to `mode="popLayout"` so the leaving and entering digits can overlap on slow devices. The gallery section of `PrizeShowcase` (Embla-migrated in Phase 1.5) was deliberately left untouched.

## P1. Schedule-driven activation

Use `ScheduledPromo` rows to bind activation/expiration to date ranges. Don't hard-code "active = true" — the scheduler flips it. Same pattern as draws' `activationDate` / `freezeEntriesAt` ([draws architecture](../draws/architecture.md)).

## P2. Alternating multipliers via single config row

`AlternatingPromoMultiplier` holds the rotation schedule (e.g. 2x on weekends, 1x on weekdays) in a single document. The resolver computes the current value at read time. No background job needed.

## P3. Per-page promo via PromoLink

Each promo landing page has a unique `PromoLink` slug. Visiting writes a `PromoAnalyticsVisit` row. The slug threads through to attribution via UTM persistence.

## P4. Comeback promo via Klaviyo flow

(Migrated stub.) Cancellation event fires from the `customer.subscription.deleted` webhook → Klaviyo segment → flow → email/SMS. Server-side: the comeback promo is a `Promo` row with eligibility `previously_cancelled`. _TODO: document the eligibility check helper._

## P5. Banner z-order via constants

[src/constants/z-index.ts](../../src/constants/z-index.ts) defines z-index constants. Banners use a specific value to layer above page content but below modals.

## Cursor agent

`.cursor/agents/growth-integrations.md` covers this domain plus tracking and rewards-redeemables.
