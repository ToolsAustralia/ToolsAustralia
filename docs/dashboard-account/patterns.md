# Dashboard-Account — Patterns

## Site-wide interaction smoothness — Phase 5B (2026-05-10)

`my-account/components/CoverBanner.tsx` had its profile-avatar `<Image>` ship without a `sizes` hint; Phase 5B added `sizes="(max-width: 640px) 96px, 128px"` matching the responsive `w-20…w-32` shell so next/image picks an accurate srcset entry instead of falling back to full-width. No other dashboard-account changes — the route uses no infinite framer-motion loops or modal-listener plumbing that needed the Phase 5B treatment.

## P0. Lazy-load Stripe modals on every dashboard route (2026-05-10)

Phase 5A converted every `MembershipModal` import on `/my-account/**` to `next/dynamic({ ssr: false })` so the dashboard routes stop shipping the Stripe + payment-form bundle on first paint. The same applies to `SubscriptionManagementModal` (used in `MembershipStatus` and the settings `SubscriptionTab`) and `PaymentMethodsTab` (used in the settings `PaymentTab`). The full convention, including the modal-in-modal exemption and the type-extraction caveat for prop-extraction patterns, is documented in [billing-stripe/patterns.md#p0-lazy-load-stripe-bearing-modals-at-every-callsite-2026-05-10](../billing-stripe/patterns.md#p0-lazy-load-stripe-bearing-modals-at-every-callsite-2026-05-10).

`my-account/benefits/page.tsx` exports `export const dynamic = "force-dynamic"` (a Next.js segment config) and therefore aliases its `next/dynamic` import to `nextDynamic` to avoid the name collision.

## P1. Consumer view, not feature owner

This domain is a top-level consumer. Don't add business logic — extend the feature domains and consume here.

## P2. Landing orchestration

`useDashboardLandingOrchestration` centralises decisions about which landing experience to show. Consumers ask "should I show landing?" and the hook answers based on session storage, user state, and feature-flag config.

## P3. Per-section composition

Each my-account section is a self-contained component that consumes its source-domain hook and renders. Pages compose sections; sections own their data fetching.
