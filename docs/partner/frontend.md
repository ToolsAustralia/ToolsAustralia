# Partner — Frontend

## Pages

`src/app/(site)/partner/` — partner discount catalog page (members view available discounts).

## Components

> _TODO: enumerate components specific to partner._

## Partner access duration label (2026-05-18)

`src/utils/partner-discounts/partner-access-duration.ts` exports `getPartnerAccessDurationLabel({ isSubscription, days?, hours? })` → `{ short, long } | null`. Subscriptions return `"While active"` / `"Partner access while your membership is active"` (lifecycle-gated, never a day count); one-time/mini/additional packs return their concrete `N days` / `N hours`. Used by `PackageDetailModal/Body`, `StripePaymentModal`, `SubscriptionExplainerModal`, `SubscriptionManagementModal` (Upgrade/DowngradeList), `UpgradeConfirmModal`/`DowngradeConfirmModal` `BenefitsBody`, `UpgradeSuccessToast`, and `BenefitCountdown`. Always call the helper rather than re-deriving the wording inline.

## Data sources

- TanStack Query for partner catalog reads
- Discount visibility computed server-side via `partner-catalog-visibility.ts`

## className conventions (2026-05-08)

Partner components use `cn()` from `@/utils/cn` for conditional class composition. The `sweep-classname-template-literals` codemod (Plan 5 Phase 2) converted template-literal `className={`...`}` patterns to `className={cn(...)}`. Use `cn()` rather than template literals when adding new conditional classes.

## Site-smoothness Phase 4 cleanup (2026-05-10)

`PartnerHero.tsx` previously included `import "swiper/css"` even though the file no longer used Swiper. Phase 4 of the site-smoothness plan dropped the `swiper` package and removed this orphan import; the visual layout is unchanged. No other partner components reference Swiper.

## usePartnerDiscountSso — open the rewards portal (2026-06-24)

[`src/hooks/queries/usePartnerDiscountSso.ts`](../../src/hooks/queries/usePartnerDiscountSso.ts) — the client glue for the MyRewards SSO hand-off. A "Open Partner Portal" button calls `mutate()`; the hook POSTs `/api/partner-discount/sso`, and on success navigates the browser to the returned `/verifytoken` URL. Reads `isPending` (spinner) and `error` (e.g. "No active partner-discount access" on a 403). Uses a raw `fetch` on purpose so the feature-gate 403 doesn't force a logout (see [client-state/gotchas.md](../client-state/gotchas.md)). The visual button itself is part of the new rewards UI (not yet built); this hook is the swappable data layer.
