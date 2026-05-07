# Shared UI — Frontend

## Component categories

See [architecture.md](./architecture.md#categories) for the full inventory.

## Cards

### WinnerCard

[src/components/cards/WinnerCard.tsx](../../src/components/cards/WinnerCard.tsx) renders a winner tile (image, name, prize, draw-type badge) and is consumed by the homepage Latest Winners hero, the `/winners` grid, and winner-testimony surfaces.

- The top badge reads **`<date>` MAJOR DRAW WINNER** or **`<date>` MINI DRAW WINNER** — date prefix from [`getWinnerDisplayDate`](../../src/utils/winners.ts) (en-AU short format, e.g. `27 APR 2026`), draw-type suffix from `winner.drawType`. The whole label is uppercased and tracked via Tailwind classes; do not pre-uppercase in the helper.
- The whole card is wrapped in a `<Link>`. Clicking anywhere navigates to:
  - `/promotions/${DEFAULT_PRIZE_SLUG}` for major-draw winners (the default promotions page from [src/config/prizes.ts](../../src/config/prizes.ts)).
  - `/mini-draws` for mini-draw winners (the mini-draws listing page, **not** a per-draw deep link).
- `showDrawLink` (default `true`) controls whether the bottom CTA strip ("Explore this promotion" / "View mini draws") is rendered. The card stays clickable either way; the strip is purely visual reinforcement on the `/winners` grid. The homepage hero passes `showDrawLink={false}` and relies on the card-level click.
- Uses a named Tailwind group (`group/card`) on the outer Link so the inner image's unnamed `group-hover:scale` only fires on image hover, not on bottom-CTA hover.

## Sections

### `sections/winner-testimony/` — Hear From Our Winners

[src/components/sections/winner-testimony/](../../src/components/sections/winner-testimony/) is a cinematic editorial section showcasing winner testimonies. It is composed of:

- [`WinnerTestimonySection`](../../src/components/sections/winner-testimony/WinnerTestimonySection.tsx) — section frame, theming, and Embla carousel orchestration. An inner `PopulatedSection` holds the Embla hooks so they only run when there are winners; the empty state branch renders without them.
- [`WinnerCinematicCard`](../../src/components/sections/winner-testimony/WinnerCinematicCard.tsx) — carousel slide; wraps the hero and adds the absolutely-positioned brand-gradient `Read full story →` CTA pill in the bottom-right. Receives an `onOpenStory(id)` callback from the section.
- [`WinnerCinematicHero`](../../src/components/sections/winner-testimony/WinnerCinematicHero.tsx) — shared cinematic photo block (full-bleed `next/image` with object-cover/center-30% focal point, brand-tinted edge glow, vignette, top-row pills, overlaid name + prize). Used by both the card and the modal hero band via a `variant: "card" | "modal"` prop; the `card` variant additionally overlays an opening quote-mark + testimony excerpt.
- [`WinnerStoryModal`](../../src/components/sections/winner-testimony/WinnerStoryModal.tsx) — magazine-article modal. Cinematic hero band on top, then editorial body: brand `THE STORY` eyebrow flanked by gradient lines, Georgia-serif story prose with brand-colored floated drop cap on the first paragraph, gradient brand divider, and a meta footer (Calendar/MapPin/Gift Lucide icons in brand color + values).
- [`theme.ts`](../../src/components/sections/winner-testimony/theme.ts) — `buildSectionBackground(primaryHex, isDark)` and `buildHeroEdgeGlow(primaryHex, isDark)` helpers; both compose CSS background strings via [`hexToRgbaString`](../../src/utils/package-colors/packageColorScheme.ts) from package-colors.

Section background and modal shell colors flip with site light/dark mode (`useTheme()` from [src/contexts/ThemeContext.tsx](../../src/contexts/ThemeContext.tsx)); accents — eyebrow color, divider gradient, edge glow, label borders, opening quote-mark, CTA pill, drop cap, meta icons — follow the active brand promo theme via `usePromoTheme()` from [src/stores/usePromoThemeStore.ts](../../src/stores/usePromoThemeStore.ts). The card itself and the modal hero band intentionally stay cinematic-dark in both site themes — by design, to keep the prize photo dramatic; only the surrounding section flips.

The legacy entry path [src/components/sections/WinnerTestimonySection.tsx](../../src/components/sections/WinnerTestimonySection.tsx) is now a one-line re-export of this module so existing import paths keep working unchanged.

**Updated 2026-05-04**: removed photo background — section + card + modal hero are now typographic on a dark brand-glow stage (no `<Image>`). The card CTA was moved out of absolute positioning into normal document flow below the hero (full-width on mobile, auto-width on `sm`+) so it can never overlap the winner name. The italic subtitle paragraph (`Tradies, weekend warriors…`) was removed from the populated header.

## Modals

### RenewalFailedModal

[`src/components/modals/RenewalFailedModal.tsx`](../../src/components/modals/RenewalFailedModal.tsx) handles failed subscription renewal payments. It calls `POST /api/stripe/pay-failed-invoice` via `usePayFailedInvoice` (TanStack Query mutation). When that flow returns an error matching "no payable invoice" or similar phrases, the modal renders a fallback "Pay overdue amount" CTA that calls `POST /api/stripe/force-charge-overdue`.

**Force Charge fallback state variables:** `forceChargeProcessing` (boolean), `forceChargeResult` (nullable object with `success`, `chargedInvoiceId`, `paymentStatus`, `amount`, `reason`, `message`). Both are reset when the modal opens.

**`isNoPayableInvoiceError(errMsg)`** — inline helper that matches the error state variable `error` against known "no payable invoice" phrases. When it returns `true` and `forceChargeResult` is null, the amber "Pay overdue amount" button appears. On result, success renders a green panel and failure renders a red panel. Full flow documented in [docs/admin/frontend.md](../admin/frontend.md#force-charge-ui).

### CancellationUpsellModal

[`src/components/modals/CancellationUpsellModal.tsx`](../../src/components/modals/CancellationUpsellModal.tsx) is the retention modal shown when a member tries to cancel their subscription. Layout is an infographic-style three-band frame: dark hero (radial red + gold glow over `#0a0a0a`, Anton headline) → white lose grid (3 cells: ticket / trophy / calendar + amber encouragement banner) → light slate trust footer (SSL secure / NTP/16264 / Drawn live / Cancel anytime — single-line bold labels). All styles are scoped via `<style jsx>`. Layout structure stays identical at every viewport size; the `@media (max-width: 540px)` breakpoint shrinks sizes only (no column collapse).

**Props:** `isOpen`, `onClose`, `onRedeem`, `onDecline`, plus optional `isPastDue`, `onResolvePayment`, `accumulatedEntries`, `daysUntilDraw`, `drawCloseLabel`, and `downgrade?: { packageName; saveLabel?; onConfirm }`.

**Three states**, driven by props:
- **Active member with entries** — shows "You've got X entries locked in the major draw." The lose grid shows entries-locked-in / your-shot-at-the-{prize} / your-spot-in-N-days. Stay CTA = "Keep me in the draw" with the gold "+100 BONUS" pill, calling `/api/cancellation-upsell/redeem` ([`canOfferCancellationUpsellRedeem`](../../src/utils/redeemables/cancellation-upsell-eligibility.ts) gates eligibility).
- **About-to-renew (`accumulatedEntries === 0`)** — copy switches to "accumulated entries" wording (since membership entries are earned per cycle), and the spot cell becomes "Renew to keep it".
- **Past-due (`isPastDue`)** — title is "Settle up & you keep", spot cell becomes "Settle up to keep it", and the stay CTA changes to "Resolve payment" with no +100 bonus pill (drops the gold ribbon via `.cm-btn-stay--plain`). Resolves by calling `onResolvePayment` — wired in `SubscriptionManagementModal` to open `RenewalFailedModal`.

**Tier-aware downgrade card** — when a `downgrade` is supplied, the modal renders a tier-coloured "Switch to X" card below the primary actions. Tier is inferred from `downgrade.packageName` and the colour palette mirrors `MEMBERSHIP_TAB_COLOR_MAP` in [`packageColorScheme.ts`](../../src/utils/package-colors/packageColorScheme.ts): Tradie → makita-teal cyan (`#00c2ed`), Foreman → dewalt-yellow (`#ffd200`), Boss → boss-red (`#ee0000`). The package icon (from [`getPackageIconByName`](../../src/utils/images/package-icons.ts)) renders as a tilted top-left corner badge, slightly overlapping the card's rounded corner; the headline + CTA sit on the top row, and a 3-column tick row (`entries stay / Save $X/mo / Cancel anytime`) sits below a dashed-divider footer. On mobile the CTA arrow icon is hidden (`.cta-arrow { display: none }`) so the button stays compact. Clicking "Switch plan" does NOT close the cancellation modal — instead it opens [`DowngradeConfirmModal`](../../src/components/modals/DowngradeConfirmModal.tsx) on top (z-index 90 vs 80). Cancellation modal closes only when the downgrade succeeds or the user explicitly declines.

**Always-positive progress bar** — the "you're this close to a win" bar is always green (`#16a34a`/`#22c55e`) and always renders 13/14 segments filled, regardless of accumulated entry count. The big number under "Active entries" is centred (not right-aligned) — purely positive framing, no comparison signal.

**Hero prize banner + random featured prize text** — the hero shows a single full-width `all-prizes.webp` banner from `/public/images/background/promo/landing/all-prizes/` (no OR divider, no individual prize cards or cash badge). The lose-grid trophy line ("Your shot at the {Milwaukee Combo + $5k cash}") still picks a random non-cash entry from [`PRIZE_CATALOG`](../../src/config/prizes.ts) at modal open via `useMemo([isOpen])` — the slug-derived `formatPrizeShortLabel(slug)` returns `"{Toolset} Combo + $5k cash"`, dropping the toolbox brand to keep the cell within ~3 lines. The "or $10,000 cash — your call" sub-line lives in the trophy cell now that the cash card is gone.

**Data freshness on open** — when `isOpen` flips true, the modal invalidates `queryKeys.majorDraw.current`, `queryKeys.majorDraw.userStats(userId)`, and `queryKeys.users.account(userId)` so we never display a stale entry count or stale downgrade target. The parent `SubscriptionManagementModal` re-runs `fetchSubscriptionBenefits()` on its own `isOpen` flip.

**Wired from `SubscriptionManagementModal`** — that parent owns the cancellation flow and supplies `accumulatedEntries` from `user.subscription.lastMonthAccumulatedEntries`, `daysUntilDraw` / `drawCloseLabel` derived from `useCurrentMajorDraw().freezeEntriesAt || drawDate`, `isPastDue` from `hasFailedRenewal(user)`, `onResolvePayment` opens `RenewalFailedModal`, and `downgrade` from `subscriptionBenefits.availableDowngrades[0]`.

**Mobile** — the frame hides the WebKit scrollbar (`scrollbar-width: none; ::-webkit-scrollbar { display: none; }`) under 540px so the modal looks the same as desktop without a chrome bar. `max-height: calc(100dvh - 8px)` uses dynamic viewport units so the iOS/Android URL bar doesn't push content off.

**Updated 2026-05-07**: copy + state pass — past-due variant ("Resolve payment", no bonus pill); 0-entries variant ("accumulated entries"); switched cash hero to $10k; random prize per open; always-green positive progress bar; centred entries number; cash badge scales down on small screens; downgrade card switched to nested-modal flow (cancellation stays open) and now opens themed `DowngradeConfirmModal`. Trust footer collapsed from 4 cells to 3 (dropped Facebook), restored bold-label + sub-line layout. Lose grid uses `align-items: stretch` + flex-column cells so the 3 cells share the same height. Downgrade card restructured: package icon → tilted top-left badge in tier colours that mirror MembershipSection (cyan/yellow/red); headline + CTA on top row; 3-column tick row at the bottom; CTA arrow hidden on mobile to keep the button slim.

### DowngradeConfirmModal

[`src/components/modals/DowngradeConfirmModal.tsx`](../../src/components/modals/DowngradeConfirmModal.tsx) — themed downgrade confirmation that opens on top of `CancellationUpsellModal` (z-index 90) when a member taps "Switch plan". Visual intensity matches the cancellation modal: dark hero with tier-coloured radial glow + Anton headline, From → To tier comparison cards using `getPackageIconByName`, then a white body with three benefit stats in the order **partner offer access % → days of access → free entries / cycle** (matches MembershipSection ordering), a tick-list of guarantees ("entries stay locked in / keep current benefits / save $X/mo / activates {date} / no refund"), and Cancel + Schedule action buttons. Tier colours (Tradie / Foreman / Boss) are switched via `.tier-*` class modifiers using the same red / silver / gold palette as the cancellation modal's downgrade card. Replaces the generic `ConfirmationModal` previously used for downgrades.

**Props:** `isOpen`, `onClose`, `onConfirm`, `isLoading?`, `fromPackageName`, `toPackageName`, `toPackagePrice`, `toPartnerAccessPercent`, `toPartnerDiscountDays`, `toEntriesPerMonth`, `effectiveDateLabel?`, `currentEntries?`, `saveLabel?`. The parent computes `toPartnerAccessPercent` via [`getPartnerCatalogAccessPercentForMembershipPackageId`](../../src/utils/partner-discounts/partner-catalog-visibility.ts) and the effective date from `activeSubscription.endDate`. On success the parent closes both this modal and the cancellation upsell.

## Z-index ordering

[src/constants/z-index.ts](../../src/constants/z-index.ts) defines z-index constants. Always reference these — never use raw numbers.

## Display helpers

- `display-name.ts` — formats user display names consistently across the app
- `brand-utils.ts` — brand display formatting
- `prize-brand-colors.ts` — resolves color tokens for prize / brand contexts

## Image helpers

`utils/images/` — image src resolution, lazy-load helpers, srcSet building.

## Motion

`utils/motion/` — Framer Motion presets and helpers.

**Updated 2026-05-04**: bumped `ToolboxSelector` unselected text to full white for legibility across brand themes; switched `LatestWinnerHero` CTA arrow to inherit `currentColor` so it stays visible in dark mode for light-primary brands.

## E2E test IDs (Phase 3 auth domain)

Added by the Playwright auth-spec authoring pass (2026-05-05). Source registry is `e2e/utils/selectors.ts` — see [docs/auth/frontend.md](../auth/frontend.md#e2e-test-ids) for the full list and which spec consumes each.

- `src/components/layout/Header.tsx`: `header-user-menu` (desktop user-menu trigger) and `header-logout-button` (Sign Out inside the dropdown). Used by `e2e/auth/logout.spec.ts`.
- `src/components/modals/UserSetupModal.tsx`: forwards `testId="user-setup-modal"` via `<ModalContainer>`; adds `user-setup-dob` (BirthdatePicker wrapper) and `user-setup-submit` (primary action Button). Used by `e2e/auth/user-setup-modal.spec.ts`.
- `src/components/modals/ui/Button.tsx`: now accepts an optional `data-testid` prop (forwarded to the underlying `<button>`). Lets specs target Button-rendered actions (e.g. `user-setup-submit`) without wrapper divs.

## Toast testId pass-through (added 2026-05-05)

`src/components/ui/Toast.tsx` — `ToastProps` now accepts an optional `testId?: string`. When set, it's stamped on the toast root `<div>` as `data-testid={testId}`. Used to target specific toast variants (upgrade, downgrade, entry-reward) from Playwright specs without coupling to fragile text content.

Example consumers:
- `src/components/UpgradeSuccessToast.tsx` passes `testId: "upgrade-success-toast"` and `testId: "downgrade-scheduled-toast"`.
- `src/hooks/useEntryRewardToast.ts` passes `testId: "entry-reward-toast"`.

The prop is purely additive — existing `showToast({...})` calls continue to render an untagged toast root.
