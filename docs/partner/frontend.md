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
