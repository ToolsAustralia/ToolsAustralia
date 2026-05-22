# Shared UI — Frontend

## Component categories

See [architecture.md](./architecture.md#categories) for the full inventory.

## Auth-gating conventions (Task 12, 2026-05-20)

Client components must use `usePermissions()` from `@/hooks/usePermissions` for authorization decisions — never read `session?.user?.role` directly in JSX or effects.

- **`Header.tsx`** — The desktop and mobile user-menu dropdowns show "Admin Dashboard" when `isStaff` is true (replaces `userData?.role === "admin"`). Staff still see the same Admin-only branch in the ternary; the `isStaff` signal comes from `usePermissions()` which reads `session.user.userType === "staff"` with a legacy-admin bridge.
- **`LoginModal/index.tsx`** — The post-login redirect (`/admin` vs `/my-account`) uses `isStaff` from `usePermissions()` instead of `session.user?.role === "admin"`.

Display-only `user.role` reads (e.g. the "Admin" badge on user rows in `UsersManagement.tsx` and `UserRow.tsx`) are intentionally NOT replaced — they show the role of the listed user, not the current viewer.

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

### `sections/membership/ElectricPackageCard` — live membership card

[`src/components/sections/membership/ElectricPackageCard.tsx`](../../src/components/sections/membership/ElectricPackageCard.tsx) is a **pure presentational** component — no data fetching, no Stripe calls, no context reads. All decisions arrive as props.

**Props:** `plan: LocalMembershipPlan`, `colorScheme: PackageColorScheme`, `state: ElectricPackageCardState` (`{ locked, lockReason?, isCurrent }`), `discount?: { regularPrice, percentOff } | null`, `onSelect: (plan) => void`, `ctaLabel?: string`, `theme?: "light" | "dark"`.

**Key behaviours:**
- Entries strikethrough (`original → display`) renders when `plan.metadata.promoMultiplier > 1` (mirrors MembershipSection logic via a local `readEntries()` helper).
- The **% OFF badge** and regular-price strikethrough live **only in the price block button** — never in the top-right corner (that space is reserved for the promo multiplier badge in the live section).
- CTA button label: `"Current Plan"` when `state.isCurrent`, `state.lockReason ?? "Locked"` when `state.locked`, otherwise `ctaLabel ?? "Enter Now"`. The `ctaLabel` prop allows callers (e.g. `MembershipSection`) to pass computed text such as `"Upgrade to Boss"`, `"Downgrade to Tradie"`, or `"Update payment"` without the card knowing about subscription hierarchy.
- All colour values come from `colorScheme` (`accentHex`, `badgeStyle`, `textGradientStyle`, etc.) — no local colour literals.
- **Tier differentiation:** VIP is distinguished from Boss by gold tone and a crisp polished finish, not by larger text or heavier blur. VIP uses brilliant champagne/white-gold (`#FFDF63` accent) with a sharp double-rim outer shadow and tight glow; Boss uses warm amber-gold (`#E0A019` accent) with a calmer, standard finish. Both tiers share the same font sizes as all other electric tiers.
- **Discount badge:** the price block renders a **swing price tag** (hook ring + string + notched tag body with punched hole) anchored to the top-right of the price button when `discount` is set. The tag is rotated −7° and uses `accent` as its background. The struck regular-price span remains immediately right of the discounted price in the button's `<div>`.
- **`theme` prop:** `"dark"` (default) renders the electric dark background; `"light"` switches to the branded vivid card background using `colorScheme.bgGradient`. `MembershipSection` drives this via `useHtmlDarkForUi()`.

The component accepts two optional badge props: `showBestValue` (renders a `BestValueBadge` in the top-left corner) and `ribbon` (renders a `CornerRibbonBadge` with the given label; ignored when `showBestValue` is true). A promo-multiplier lightning badge (`X2`/`X5`/`X10` webp) appears top-right when `entries.multiplied` is active. These badges are caller-driven — no internal tier logic in the card itself.

This component is used by the live `MembershipSection` for both the membership and one-time tabs.

### MembershipSection light/dark + A/B gating

`MembershipSection` light/dark is the single `isDark` value (around line 58)
that feeds the `theme` prop of every `ElectricPackageCard`. It is gated by the
site-wide A/B flag: `isDark = useThemeStore(...) && !useMembershipThemeExperiment().forceLight`.
With no active experiment, behavior is unchanged (schedule/toggle driven). See
docs/ab-testing/architecture.md.

### `features/PartnerDiscountQueue` — tier-themed partner discount card

[`src/components/features/PartnerDiscountQueue.tsx`](../../src/components/features/PartnerDiscountQueue.tsx) renders the collapsible "Partner Discounts" card on `my-account`. Its visual identity is driven by the **active** package (subscription or active one-time period) resolved into `activePackageVisual` → `getMembershipSectionColorScheme(...)`, so the card matches the membership cards' tier colours.

**Collapsed header:**
- The right side shows **benefit chips, not a package icon**. Chip 1: `{partnerCatalogPct}% partner catalog`, filled with the tier `badgeStyle.background` (neutral amber/orange fallback when no active tier). Chip 2: `{shopDiscountPercent}% shop`, an outlined accent pill for active subscriptions — **currently gated off** via the local `SHOW_SHOP_DISCOUNT_CHIP = false` constant because the shop discount is not yet honoured at checkout; flip it to `true` when shop goes live. Chips render only when `summary.hasActiveAccess`.
- The whole bar is tinted to the tier: corner glow blobs + an accent radial wash use `accentHex`; the subtitle takes `accentHexLight ?? accentHex` when a tier theme is present. All theming falls back to the prior neutral dark look when there is no active package.

**Naming:** `cleanPackageName()` strips a leading `"Additional "` (case-insensitive) for **display only** — used for the active-period name and every "Upcoming" queued row. Icon/theme resolution still uses substring tier matching, so stripping the prefix is safe.

**Upcoming (queued) rows:** each row resolves its own tier theme + package icon via `getPackageIconByName(item.packageName, type)` (membership → `subscription`, else `one-time`). The icon tile uses that tier's `badgeStyle.background`; rows with no resolvable package image fall back to the lucide `getPackageIcon(item.packageType)` on the original yellow/orange tile.

### PromoTrustBar — final-hours urgency variant

[`src/components/sections/promo/PromoTrustBar.tsx`](../../src/components/sections/promo/PromoTrustBar.tsx) is the thin strip that sits between [`PromoHero`](../../src/components/sections/promo/PromoHero.tsx) and [`PromoPackages`](../../src/components/sections/promo/PromoPackages.tsx) on `/promotions/[slug]` and `ToolsetLandingPage`. Default render: three icon+text trust items (Drawn live · randomdraws.com.au · Drawn every 27th).

**Urgency variant** swaps the bar to a 2-column layout (timer left · rusted plate image right) when the current major draw is within 72h of `freezeEntriesAt`:

| Tier | Window (relative to `freezeEntriesAt`) | Image | Header copy |
|---|---|---|---|
| `finalHours`    | `freeze − 72h` to `freeze − 48h` | `/images/background/promo/finalHours/finalHours.webp`    | `Entries close · Wed 27 May · 8:00pm AEST` |
| `drawnTomorrow` | `freeze − 48h` to `freeze − 24h` | `/images/background/promo/finalHours/drawnTomorrow.webp` | `Entries close · Tomorrow · 8:00pm AEST` |
| `drawnTonight`  | `freeze − 24h` to `freezeEntriesAt` | `/images/background/promo/finalHours/drawnTonight.webp`  | `Entries close · Tonight · 8:00pm AEST` |
| `frozen`        | `freezeEntriesAt` to `drawDate + 12h` | `/images/background/promo/finalHours/drawnTonight.webp`  | `Entries closed · Draw live · 8:30pm AEST` (Lock icon, red) |

Outside that 72h window, or once `now ≥ drawDate + 12h` (cycle has flipped to the next draw), the standard 3-item trust bar renders. If `currentMajorDraw` is missing or has no `freezeEntriesAt`, the standard bar is the safe fallback.

> **Gotcha:** `currentMajorDraw.activationDate` is when *this* draw became active (always in the past for an active draw), NOT when entries lock out. An earlier version used it as a "stop showing urgency" guard, which made the variant never render. Don't reach for that field unless you mean "the start instant of the current draw."

- **Server-fresh first paint.** Both [`/promotions/[slug]/page.tsx`](../../src/app/promotions/[slug]/page.tsx) and [`ToolsetLandingPage`](../../src/app/promotions/_components/ToolsetLandingPage.tsx) pass `initialMajorDraw={majorDraw}` (from `getCurrentMajorDrawServer()`) so the urgency state is computed against the same server data the hero uses. The client hook (`useCurrentMajorDraw`) would otherwise briefly return stale cached data from a previous draw state — dev-toggling between scenarios exposed this.
- **Tick:** [`useLeafTimer(60_000)`](../../src/hooks/useLeafTimer.ts) — 1-minute interval. The bar shows only the absolute deadline (no live remaining-time readout), so this just drives the tier boundary recalc (Tonight ↔ Tomorrow ↔ Wed 27 May) without per-second re-renders.
- **No ENTER NOW button in the bar.** [`PromoHero`](../../src/components/sections/promo/PromoHero.tsx) already renders the ENTER NOW pill above; duplicating it here was rejected during brainstorming as visual clutter.
- **Image dims:** native `450×150`, rendered with `next/image` and `style={{ height: "clamp(40px, 8vw, 72px)" }}` so it scales with viewport while preserving aspect ratio. `priority` so it doesn't pop in.
- **Theme:** the timer icon picks up `usePromoTheme().primary`, so per-slug brand themes (RYOBI green, DEWALT yellow, etc.) tint it automatically. The frozen state forces red (`#dc2626`) regardless of theme.

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

### `OtherToolsetsCarousel` — Explore other toolsets cards

[`src/components/sections/promo/prize-selection/OtherToolsetsCarousel.tsx`](../../src/components/sections/promo/prize-selection/OtherToolsetsCarousel.tsx) renders the "Explore other toolsets" strip beneath toolset / evergreen promo pages. Each card has a **brand wordmark on top** (`POWERSET_BRAND_TEXT[slug]` → `/images/brands/name/{brand}Text.webp`) followed by the product image filling the rest of the 3:4 frame. The card keeps a brand-coloured border/shadow from [`getToolsetBadgeStyle`](../../src/utils/package-colors/packageColorScheme.ts); no text label is rendered visually — the SR-only announcement comes from the button's `aria-label` driven by `POWERSET_LABELS` (e.g. `"RYOBI 19PC KIT"`).

## Modals

### RenewalFailedModal

[`src/components/modals/RenewalFailedModal/`](../../src/components/modals/RenewalFailedModal/) (Plan 3 Phase 1 complete) handles failed subscription renewal payments. Entry point: `index.tsx` (orchestrator, 587 LOC). The former 1,292-line monolith `RenewalFailedModal.tsx` has been deleted.

**Public interface** — `{ isOpen: boolean; onClose: () => void }`.

**State (13 slices):** `paymentState` (null or `{ requiresConfirmation, clientSecret?, paymentIntentId?, amount?, currency?, invoiceId? }`), `requiresDifferentPaymentMethod`, `isLoading`, `isSuccess`, `error`, `errorDetails`, `selectedPaymentMethod`, `terminalCollectionFailure`, `showInlineCardSetup`, `setupIntentSecret`, `loadingSetupIntent`, `forceChargeProcessing`, `forceChargeResult`. All reset on `isOpen` becoming `true`.

**Three render branches:**
1. `isSuccess === true` — success Shell (tone: "success") with "Payment received" eyebrow.
2. `paymentState?.requiresConfirmation && clientSecret` — confirmation Shell (tone: "danger") with `<Elements key={clientSecret || "no-secret"}>` provider wrapping `PaymentForm`. Hardcoded Stripe appearance (not `membershipStripeAppearance`).
3. Default — initial/inline-card/terminal Shell. Eyebrow/title/sub copy varies by `terminalCollectionFailure`, `showInlineCardSetup`.

**Callbacks:**
- `handleResolvePayment` — calls `payFailedInvoiceMutation.mutateAsync()`. On success: `setIsSuccess(true)` + `queryClient.invalidateQueries` (user detail + account) + `setTimeout(() => onClose(), 2000)`. On `requiresPaymentConfirmation`: sets `paymentState`. On ApiError with `requiresNewCardPreflight` or missing default PM: `setShowInlineCardSetup(true)`. On `requiresDifferentPaymentMethod`: sets alert. On terminal failure code: sets `terminalCollectionFailure`.
- `handlePayOverdue` — `POST /api/stripe/force-charge-overdue` → sets `forceChargeResult`.
- `handlePaymentSuccess` — `setIsSuccess(true)` + invalidateQueries + showToast + `setTimeout(() => onClose(), 2000)`.
- `handlePaymentError` — sets `error` / `errorDetails` / `requiresDifferentPaymentMethod`.
- `handleBackFromPayment` — clears `showInlineCardSetup` + `setupIntentSecret`.
- `handleCardSetupSuccess` — saves PM, calls `updateSubscriptionPaymentMethod.mutateAsync`, invalidates PM cache, calls `handleResolvePayment`.

**SetupIntent effect** — async IIFE with `cancelled` guard; fetches `POST /api/stripe/create-setup-intent`, sets `setupIntentSecret` on `data.client_secret`. Fires when `isOpen && showInlineCardSetup && !setupIntentSecret`.

**Module-scope:** `stripePromise = getStripePromise()` (singleton). `renewalBillingSupportMailto()` pure helper.

**isNoPayableInvoiceError(errMsg)** — matches "no longer be paid", "no longer payable", "can't be paid", "cannot be paid", "no payable invoice". When true and `!forceChargeResult`, renders amber "Pay overdue amount" CTA inline (calls `handlePayOverdue`). Success: green panel. Failure: red panel.

**Sub-components:**
- **`Shell.tsx`** — dark-hero + white-body modal frame. Props: `isOpen`, `onClose`, `tone?: "danger" | "success"`, `eyebrow`, `title`, `sub`, `children`, `closeOnBackdrop?`. CVA `shellTone` variant; visual tone applied via `data-tone={tone}` activating CSS module rules. Status icon: `AlertTriangle` / `CheckCircle` at 36px. Accent words: `<span data-rf-accent>…</span>`. z-index 80 via inline style.
- **`AlertBanner.tsx`** — CVA `banner` with `warn` (amber) and `error` (red). Props: `variant`, `title?`, `message?`.
- **`PaymentMethodPicker.tsx`** — saved-card radio list + "Enter new payment method" option. Props: `paymentMethods`, `selectedPaymentMethod`, `onSelect`.
- **`ActionButtons.tsx`** — 3-state CTA row: loading spinner, terminal failure (support mailto + account link + close), normal (resolve/back/close). CVA `button` `primary`/`outline`/`ghost`. Uses `styles.btn` + `styles.btnPrimary`.
- **`InlineCardSetup.tsx`** — wraps `<StripeInlineCardSetupForm>` inside its own `<Elements>` provider (key: `${setupIntentSecret}-inline-${isDarkMode?d:l}`). Props: `setupIntentSecret`, `loadingSetupIntent`, `isDarkMode`, `membershipStripeAppearance`, `userData`, `isLoading`, `onSuccess`.
- **`PaymentForm.tsx`** — Stripe confirmation form inside the orchestrator's `<Elements>`. Props: `clientSecret`, `paymentIntentId?`, `amount`, `currency`, `selectedPaymentMethod?`, `onPaymentSuccess`, `onPaymentError`, `onCancel`. Saved PM path: `stripe.confirmCardPayment`. New PM path: `elements.submit()` + `stripe.confirmPayment`. On error: analyzes PI via `POST /api/stripe/analyze-payment-intent`.
- **`styles.module.css`** — `.heroBg`, `.heroStripeOverlay`, `.scrollFrame`, `.btn`, `.btnPrimary`. Tone variables via `:global([data-tone="danger"/"success"])`. Accent coloring via `:global([data-tone]) :global([data-rf-accent]), :global([data-tone]) strong`.

### CancellationUpsellModal

[`src/components/modals/CancellationUpsellModal/`](../../src/components/modals/CancellationUpsellModal/) is the retention modal shown when a member tries to cancel their subscription. The component is now a folder-based module composed of 6 sub-components and an orchestrator:

- **`index.tsx`** — orchestrator; owns all state, effects, callbacks, and the bespoke modal shell. Deliberately does NOT use `ModalContainer` — the full-bleed dark hero design requires bespoke wrapper chrome.
- **`Hero.tsx`** — dark hero band (radial red + gold glow, Anton headline, progress bar, prize banner)
- **`LoseGrid.tsx`** — 3-cell grid: ticket / trophy / calendar cells
- **`Banner.tsx`** — amber encouragement banner ("Someone's name gets called next draw")
- **`ActionRow.tsx`** — primary CTAs ("Keep me in the draw" / "Resolve payment" / "No thanks, cancel anyway")
- **`DowngradeCard.tsx`** — tier-coloured "Switch to X" card (Tradie/Foreman/Boss)
- **`TrustBar.tsx`** — footer trust cells (SSL secure / NTP/16264 / Cancel anytime)
- **`hero.module.css`** — composite gradients, scrollbar chrome, and stripe overlay that don't translate to single Tailwind utilities

Layout is an infographic-style three-band frame: dark hero → white lose grid → light slate trust footer. Layout structure stays identical at every viewport size; the `max-xs:` breakpoint shrinks sizes only (no column collapse). Styles migrated from `<style jsx>` to Tailwind + CSS Modules.

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

**Updated 2026-05-08**: `CancellationUpsellModal` decomposed from 1,495-line monolith (`CancellationUpsellModal.tsx`) into a folder-based module (`CancellationUpsellModal/index.tsx` + 6 sub-components + `hero.module.css`). The old single-file monolith is deleted; the import path `@/components/modals/CancellationUpsellModal` now resolves to `index.tsx` automatically. All state, effects, and callbacks are preserved verbatim in the orchestrator.

### DowngradeConfirmModal

[`src/components/modals/DowngradeConfirmModal.tsx`](../../src/components/modals/DowngradeConfirmModal.tsx) — themed downgrade confirmation that opens on top of `CancellationUpsellModal` (z-index 90) when a member taps "Switch plan". Visual intensity matches the cancellation modal: dark hero with tier-coloured radial glow + Anton headline, From → To tier comparison cards using `getPackageIconByName`, then a white body with three benefit stats in the order **partner offer access % → days of access → free entries / cycle** (matches MembershipSection ordering), a tick-list of guarantees ("entries stay locked in / keep current benefits / save $X/mo / activates {date} / no refund"), and Cancel + Schedule action buttons. Tier colours (Tradie / Foreman / Boss) are switched via `.tier-*` class modifiers using the same red / silver / gold palette as the cancellation modal's downgrade card. Replaces the generic `ConfirmationModal` previously used for downgrades.

**Props:** `isOpen`, `onClose`, `onConfirm`, `isLoading?`, `fromPackageName`, `toPackageName`, `toPackagePrice`, `toPartnerAccessPercent`, `toPartnerDiscountDays`, `toEntriesPerMonth`, `effectiveDateLabel?`, `currentEntries?`, `saveLabel?`. The parent computes `toPartnerAccessPercent` via [`getPartnerCatalogAccessPercentForMembershipPackageId`](../../src/utils/partner-discounts/partner-catalog-visibility.ts) and the effective date from `activeSubscription.endDate`. On success the parent closes both this modal and the cancellation upsell.

**Sub-components (Plan 3 Phase 2 decomposition in progress):**

- **`Shell.tsx`** — modal frame: backdrop, scroll container, close button, tier-themed `data-tier` frame that cascades all `--tier-*` CSS custom properties to child cells.
- **`Hero.tsx`** — dark hero band: tier-coloured radial glow (`styles.heroBg`), Anton headline, From → To tier comparison cards with package icons.
- **`BenefitsBody.tsx`** — white body section under the hero: uppercase body title (`{toPackageName} benefits from your next billing date`), 3-column stat grid (Partner offers % / Days access / Free entries per cycle), and tick-list of guarantees. All tier-themed cells use `var(--tier-stat-bg)`, `var(--tier-stat-border)`, `var(--tier-icon-bg-light)`, `var(--tier-color-deep)` inline styles that cascade from `[data-tier]`. Tick-list renders conditionally: `currentEntries > 0` → personalised entries count; always renders the keep-current-benefits line; `saveLabel` → savings line; `effectiveDateLabel` → activation date; always renders the no-refund `<Tag>`-icon line.
- **`styles.module.css`** — composite gradients (`heroBg`, `heroStripeOverlay`), scrollbar chrome (`scrollFrame`), button transitions (`btn`, `btnConfirm`), and all `--tier-*` CSS custom properties for the three tiers (tradie / foreman / boss) via `:global([data-tier="…"])` selectors.

**Updated 2026-05-08**: `BenefitsBody.tsx` sub-component created; extracted from original monolith lines 127-160 + 360-434. Stat order: Partner offers % → Days access → Free entries / cycle (matches MembershipSection). Stat num color kept at `#0a0a0a` (matches original CSS, NOT tier-colored). Icon backgrounds use `var(--tier-icon-bg-light)`; icon foreground uses `var(--tier-color-deep)`. Checks list icon color applied via inline style on wrapping `<span>` (replaces original `:global(svg)` CSS selector).

### PaymentMethodSelector

[`src/components/modals/PaymentMethodSelector/index.tsx`](../../src/components/modals/PaymentMethodSelector/index.tsx) wraps Stripe's Payment Element with saved-payment-method selection, wallet support (Apple Pay / Google Pay via Express Checkout), and a hidden-form mount for subscription-invoice confirmation when a saved method is selected. Exposes `confirmStripeIntent()` via `useImperativeHandle` so the parent (`MembershipModal`) can drive confirmation from its own Purchase button.

**Logging is delegated to the parent (2026-05-11).** This component intentionally does **not** call `ErrorLoggingService.logPaymentError` at its `confirmPayment` / `confirmSetup` error branches. Two reasons:

1. The error is always returned via `{ error: string }` and re-handled by the parent (`MembershipModal.handlePaymentError`), which has access to `formData.email` / `guestUserData.email` / authenticated `userData.email` — so the parent's log is always attributed to the right user.
2. Logging at this layer too produces **duplicate "Anonymous" rows** because props don't carry identity down. That defeats the whole point of the admin error reports page.

If you add a new `confirmPayment` / `confirmSetup` call site here, do **not** wire it to `logPaymentError` directly — return the error up and let the parent log it. The noise filter lives at the parent now: see [MembershipModal.handlePaymentError](#paymentmethodselector) → [`isStripeNoiseError`](../../src/utils/payment/stripe/is-stripe-noise-error.ts) → [error-reporting gotchas](../error-reporting/gotchas.md#stripejs-client-side-validation-noise).

### PackageInclusionsExpanded (PackageInclusionsSlideUp)

[`src/components/modals/PackageInclusionsSlideUp.tsx`](../../src/components/modals/PackageInclusionsSlideUp.tsx) — inline expandable that renders full package inclusions cards below the "Click here to see full package inclusion" trigger. Now uses the same colour resolvers and tier overrides as `ElectricPackageCard` and `MembershipSection`: membership tab → `getMembershipSectionColorScheme(plan.id, true)`; one-time tab → `getElectricPackageColorScheme(plan.id)`; same three accent overrides (membership Tradie → electric cyan, membership Boss → electric red, one-time Boss → DeWalt yellow). Card surface is theme-aware via `useThemeStore`: dark → `rgba(13,14,18,0.92)` with tier-glow `boxShadow`; light → `rgba(255,255,255,0.95)` with a soft slate shadow. Feature text uses literal Tailwind classes (`text-white/85` dark, `text-slate-700` light). The old `getPackageColorSchemeForPromo` + `useVariantContext` wiring is removed. Chart (`VerticalAccumulationChart`) and layout structure are untouched.

**Updated 2026-05-18**: dropped `getPackageColorSchemeForPromo`/`variantConfig`; wired to `getMembershipSectionColorScheme` + `getElectricPackageColorScheme` + `useThemeStore`; same tier overrides as live cards.

## Modal architecture sweep — 2026-05-09

Twelve flat-file modals were decomposed into the canonical orchestrator-folder pattern in a single sweep. See:
- Spec: [docs/superpowers/specs/2026-05-09-modal-architecture-sweep-design.md](../superpowers/specs/2026-05-09-modal-architecture-sweep-design.md)
- Plan: [docs/superpowers/plans/2026-05-09-modal-architecture-sweep.md](../superpowers/plans/2026-05-09-modal-architecture-sweep.md)

| Modal | Pre-LOC | Sub-components | Smoke test |
|---|---|---|---|
| [WinnerSelectionModal/](../../src/components/modals/WinnerSelectionModal/) | 452 | 6 | `npm run test:winner-selection` (6 combos) |
| [AdminMajorDrawModal/](../../src/components/modals/AdminMajorDrawModal/) | 731 | 6 | `npm run test:admin-major-draw` (4 combos) |
| [CampaignTargetingModal/](../../src/components/modals/CampaignTargetingModal/) | 603 | 8 (incl. CVA tier chips) | `npm run test:campaign-targeting` (6 combos) |
| [SettingsModal/](../../src/components/modals/SettingsModal/) | 526 | 3 (delegates to Subscription/Payment siblings) | `npm run test:settings-modal` (5 combos) |
| [PackageSelectionModal/](../../src/components/modals/PackageSelectionModal/) | 780 | 4 | `npm run test:package-selection` (5 combos) |
| [RevenueDetailModal/](../../src/components/modals/RevenueDetailModal/) | 731 | 5 + `utils/exporters.ts` | `npm run test:revenue-detail` (5 combos) |
| [UpsellModal/](../../src/components/modals/UpsellModal/) | 1,139 | 5 (Stripe Elements in PaymentSection) | `npm run test:upsell-modal` (4 combos) |
| [SpecialPackagesModal/](../../src/components/modals/SpecialPackagesModal/) | 1,218 | 5 + `utils.ts` (Stripe Elements in PaymentSection) | `npm run test:special-packages` (4 combos) |
| [SubscriptionManagementModal/](../../src/components/modals/SubscriptionManagementModal/) | 1,487 | 7 (embeds 3 child modals) | `npm run test:subscription-management` (5 combos) |
| [PaymentMethodsTab/](../../src/components/modals/PaymentMethodsTab/) | 666 | 3 (Stripe Elements in orchestrator) | `npm run test:payment-methods-tab` (4 combos) |
| [PaymentMethodSelector/](../../src/components/modals/PaymentMethodSelector/) | 1,052 | 4 (forwardRef + imperative `confirmStripeIntent`) | `npm run test:payment-method-selector` (5 combos) |
| [MembershipModal/](../../src/components/modals/MembershipModal/) | 5,891 | 6 (orchestrator still ~3,700 LOC due to wizard breadth) | `npm run test:membership-modal` (5 combos) |

**Hard guarantees of the sweep:**
- Visual output byte-equivalent (no DOM/className/animation/copy changes).
- Public prop interfaces preserved byte-identically — callsites are unchanged.
- `getStripePromise()` resolves at module scope in every Stripe-using orchestrator (UpsellModal, SpecialPackagesModal, PaymentMethodsTab, PaymentMethodSelector, MembershipModal).
- `PaymentMethodSelector`'s `cardFormRef.confirmStripeIntent()` ref API preserved verbatim via `forwardRef` + `useImperativeHandle`.
- 58 new smoke-test combos added (passing); 33 existing-modal regression tests still pass.

**Conventions reaffirmed by this sweep:**
- Orchestrator (`index.tsx`) owns ALL hooks, effects, callbacks. Sub-components are pure-ish presentation taking flat props.
- Folder/`index.tsx` resolution is automatic — folders replace monoliths at the same import path with zero callsite churn.
- `ModalContainer` wrapping is preserved for modals that already used it; bespoke shells stay bespoke.
- Smoke tests run via `tsx --require ./<folder>/__tests__/asset-stubs.cjs <test-file>` and exercise ≥4 prop combos per modal.

**Skip list** (modals NOT decomposed — see spec §Inventory): `AdminProductModal`, `AdminPromoLinkModal`, `AdminMonthlyRedeemablesModal`, `AdminBonusEntryPromoModal`, `AdminPromoBannerTextModal`, `MiniDrawEditModal`, `UserSearchModal`, `ParticipantsModal`, `MajorDrawEditModal`, `UpsellManager`, `AdminScheduledPromoCalendarModal`, `PartnerModal`, `AdminScheduledPromoModal`, `AdminMiniDrawModal`, `AdminAlternatingMultiplierModal`, `SubscriptionExplainerModal`, `ConfirmationModal`, plus modals <300 LOC. All anti-signal protected per [component-decomposition-criteria.md](./component-decomposition-criteria.md).

## Z-index ordering

[src/constants/z-index.ts](../../src/constants/z-index.ts) defines z-index constants. Always reference these — never use raw numbers.

> **Gotcha:** A full-width fixed bar that only *visually* contains a centered child (e.g. [FloatingGetEntriesButton](../../src/components/sections/promo/FloatingGetEntriesButton.tsx) — `fixed left-0 right-0 z-50 flex justify-center`) still captures pointer events across its entire transparent width, blocking anything beneath it (the bottom-right user icon). Put `pointer-events-none` on the wrapper and `pointer-events-auto` on the actual interactive child so the bar is click-through everywhere except the button.

## Display helpers

- `display-name.ts` — formats user display names consistently across the app
- `brand-utils.ts` — brand display formatting
- `prize-brand-colors.ts` — resolves color tokens for prize / brand contexts

## Image helpers

`utils/images/` — image src resolution, lazy-load helpers, srcSet building.

## Motion

`utils/motion/` — Framer Motion presets and helpers.

**Updated 2026-05-04**: bumped `ToolboxSelector` unselected text to full white for legibility across brand themes; switched `LatestWinnerHero` CTA arrow to inherit `currentColor` so it stays visible in dark mode for light-primary brands.

## Overlays

### FullscreenImageViewer

[src/components/ui/FullscreenImageViewer.tsx](../../src/components/ui/FullscreenImageViewer.tsx)

Fullpage modal for browsing a gallery of winner / prize / draw photos. Used by `MembershipModal`, `WinnerStrip`, `MiniDrawImageGallery`, `PrizeShowcase`, and the dev modals gallery.

#### Layout

- **Desktop (≥1024px):** photo column (~62%) + info card column (~38%). Thumbs render as a 3-column auto-fit grid in the info card.
- **Mobile (<1024px):** photo on top (~50vh), info card slides up below with a grab handle. Pull the handle down to reveal more of the photo (peek snap at ~45% of card height). Thumbs render as a horizontal scroll strip.

#### Theme integration

- **Light/dark:** reads `useTheme()`. Backdrop is `#000`/`#f5f5f4`; photo area is `#0a0a0a`/`#fafaf9`; info card gradient flips accordingly.
- **Brand color:** reads `usePromoTheme()`. Applied only to the draw-kind badge, the active thumbnail's border/ring, and the faint tint at the top of the info card gradient. No glow on the close button, chevrons, or thumb wrapper.

#### Behavior

- Pinch + double-tap + mousewheel zoom via `react-zoom-pan-pinch` (max 4×). Carousel swipe is disabled when zoomed > 1× and re-enables at 1×.
- Keyboard: `Esc` closes, `←/→` navigate, `+`/`-` zoom, `0` resets zoom.
- First-open zoom hint pill appears for 2s (or until first zoom interaction), gated by `sessionStorage["fullscreen-viewer-zoom-hint-seen"]`.
- Mobile grab handle: drag the info card down to expose more photo. Snaps between resting and peek (~45% of card height).

#### Props

`FullscreenImageViewerProps`: `isOpen`, `images` (`FullscreenImageItem[]`), `initialIndex`, `onClose`, `title?`, `nested?`. Per-image `captionDetail` is optional (`{ drawName, winnerName, wonDate, drawKind? }`).

#### Companion

`FullscreenTriggerButton` — small expand-icon button used by callsites to open the viewer.

## SubscriptionManagementModal / PaymentMethodsTab — settings redesign variant (2026-05-19)

Both expose an opt-in `settingsRedesign?: boolean` prop (default false), set **only**
by the settings page wrappers (`SubscriptionTab.tsx` / `PaymentTab.tsx`, alongside
`renderAsPanel`). When true the panel body renders a new presentational component
(`SettingsRedesignSubscription.tsx` / `SettingsRedesignPayment.tsx`) using the Claude
settings design + Phase-1 settings primitives, while ALL hooks/handlers/derived
values/Stripe `Elements`+`stripePromise` singleton/child modals/`ConfirmationModal`
stay in the orchestrators unchanged. Modal-mode callers (`MembershipStatus`) and the
`SettingsModal` panel embed do **not** set the prop, so their render is
byte-behavior-identical. See `docs/dashboard-account/frontend.md` for the full
Phase-2 write-up and the remaining flagged follow-ups.
