# Shared UI — Gotchas

## MembershipModal: Klaviyo `Started Checkout` fires from THREE paths (split by who is firing it)

The canonical Klaviyo `Started Checkout` event covers every realistic checkout-entry path with three mutually-exclusive callsites. Revised 2026-05-28 Phase-7 — the original Phase-4 design fired authed users from `MembershipModal:handleSubmit`, but the right semantic for authed users is at **intent capture** (the "Enter Now" click) so abandoners are captured even if they never reach the payment form.

| User | Where it fires | Why there |
|---|---|---|
| **AUTHED user clicks "Enter Now" on a package card** | [`MembershipSection.handlePlanSelect`](../../src/components/sections/MembershipSection.tsx) at the `membershipModal.openModal(plan)` callsite | Intent is the click. The user has selected a package and signalled "I want to buy this." Fires BEFORE the modal even renders the card form, so abandoners who close the modal mid-flow are captured. `package_id` is the canonical API ID (via `getPackageId`); `is_authenticated: true`. |
| **GUEST first-open** (`step="registered"`) | `fireKlaviyoStartedCheckoutForGuestRegistration` in [`/api/auth/register`](../../src/app/api/auth/register/route.ts) — called from all 4 register branches (new-user + 3 plain-account updates) | Guest just submitted step-1 with a `packageId` — Klaviyo profile is being created in the same request, so server-side fire with explicit `customer_properties.email` attaches reliably. |
| **GUEST second-open fallback** (`step="viewed"`) | [`MembershipModal.handleSubmit`](../../src/components/modals/MembershipModal/index.tsx) with `if (!isAuthenticated)` gate, alongside existing Facebook `trackInitiateCheckout` | Edge case: `guestUserData` persisted across modal close/reopen so the modal jumped straight to step-2 — `handleRegistration` never ran → server fire never had a chance. The `initiateCheckoutFiredRef` guard ensures one fire per modal lifecycle even when paired with handleRegistration. |

**Why authed users don't fire from `handleSubmit` (Phase-7 change)**: dedupe with the `handlePlanSelect` fire. If both fired, every authed checkout would log two `Started Checkout` events per session. The `if (!isAuthenticated)` gate prevents that.

**`is_authenticated` is always passed explicitly, NEVER derived from `step`** — see [docs/auth/gotchas.md](../auth/gotchas.md) "Registration ≠ authenticated session". A guest can fire with `step="viewed"` + `is_authenticated: false` (when they reach payment-submit without ever logging in).

**Modal opens that DO NOT come through `MembershipSection.handlePlanSelect`** — there are other entry points (e.g. `useMembershipModal.openModalWithPackageSelectionFirst()`, RewardsFloatingWidget, my-account direct opens) that don't preselect a plan. For now `Started Checkout` doesn't fire for these — the user has no specific package context yet. If/when those paths need event coverage, fire at the moment the user selects a plan within the modal (not on modal-open).

See [docs/tracking/KLAVIYO_INTEGRATION.md](../tracking/KLAVIYO_INTEGRATION.md) "Recently added canonical events" + spec `docs/superpowers/specs/2026-05-27-klaviyo-events-expansion-design.md` §5.

### `additional-*` pack access-check failure shows an actionable toast, not a dead-end error (Phase 8 Option B, 2026-05-29)

When a non-member (or guest) tries to purchase an `additional-*` pack (e.g. via the Klaviyo abandoned-checkout email opened in a different browser), the modal previously surfaced a generic "Payment Error" toast at payment-submit time — **after** the user had already completed registration and entered card details. The error came from an `Error` throw in `MembershipModal:handleSubmit` ([see L2814 area](../../src/components/modals/MembershipModal/index.tsx#L2814)).

The throw is replaced with an actionable toast that surfaces the user's actual next step:

- **Guest path** (`!isAuthenticated`): toast title "Log in to continue", action button "Log in" routes to `/login`. Pre-existing accounts can sign in and try again from the email link.
- **Logged-in without access**: toast title "Membership required", action button "View memberships" routes to `/membership` so they can subscribe to a tier first.

Both branches close the modal and clear the in-progress purchase state so the toast isn't blocked by the loading overlay.

**Known limitation**: `/login` does NOT currently accept a `callbackUrl` / `returnTo` — it always lands at `/my-account` after success. So a user post-login has to re-click their original Klaviyo email link to re-enter the funnel. A future enhancement (Phase 8 Option A) would pre-check access in `useMembershipModalDeepLink` BEFORE opening the modal, so the user never wastes effort on registration + card entry when the access requirement can't be satisfied. That fix needs UX for two new prompts and is scoped separately.

The error-throw path is still intact for genuinely unexpected purchase errors (network failures, Stripe declines, etc.) — only the specific "additional-* without member access" case is intercepted and replaced with the actionable toast.

### Klaviyo abandoned-checkout deep-link auto-opens MembershipModal (Phase 8, 2026-05-29)

The abandoned-checkout email CTA built by `buildCheckoutResumeUrl` lands the user on either `/membership` or `/promotions/<slug>` with `?openMembership=1&packageId=<canonical-id>` in the query string. The new [`useMembershipModalDeepLink`](../../src/hooks/useMembershipModalDeepLink.ts) hook is wired into `MembershipSection` — on mount it reads those params, resolves the canonical `packageId` via `useMemberships()`, fires the host's `onOpen(plan)` callback (which wraps in the major-draw purchase gate), then **cleans the URL params** so a page refresh doesn't loop back into the modal.

`MembershipSection` is mounted on both landing destinations (directly on `/promotions/<slug>` and indirectly via `MembershipPageClient → MembershipSection` on `/membership`), so a single hook integration covers both URLs. The deep-link does NOT re-fire `Started Checkout` — the original "Enter Now" click already fired it; this is funnel resumption, not a new entry.

If the `packageId` from the URL no longer resolves to a known package (e.g. the link is from a stale email referencing a discontinued tier), the hook silently no-ops after cleaning the URL — no error, no surfaced toast. In `NODE_ENV=development` a `console.warn` surfaces for debugging.

## Z-index conflicts

Modals, banners, tooltips, dropdowns — many things stack. If something disappears behind another, check `z-index.ts` and the constant in use.

## Inline-rendered modals trapped inside a `sticky`/`transform` ancestor

A modal that renders **inline** (no `createPortal`) inherits whatever stacking context its mount point lives in. If the mount point is descended from anything that creates a stacking context — `position: sticky`, `position: fixed`, `transform`, `filter`, `opacity < 1`, `will-change`, `isolation: isolate` — the modal's `z-index` is *trapped local to that context*. A sibling element in a different ancestor at a lower numeric `z-index` (e.g. `z-20`) can paint on top of it because the modal's "effective" page-level layer is whatever the trapping ancestor was assigned (often auto/0).

Concrete prior hit: on the mini-draws prize-details page, `LoginPromptModal` rendered inside the `lg:sticky lg:top-28` right column. `MiniDrawImageGallery`'s carousel chevrons (`z-20`) in the sibling left column painted over the modal's `zIndex: 90`. Fix was to portal the modal's Shell to `document.body` and use `Z_INDEX.MODAL_BASE` — same pattern `ModalContainer` already follows. See [Shell.tsx](../../src/components/modals/LoginPromptModal/Shell.tsx).

Rule of thumb: **any full-screen overlay modal must portal to `document.body`** (and use `Z_INDEX.MODAL_BASE` from `constants/z-index.ts`). Bumping the numeric z-index does **not** fix this — only escaping the trapping ancestor does. The Shell-pattern modal suite (Upgrade/Downgrade/Refer/PastDraws/StripePayment/ExistingAccount/PackageDetail/SubscriptionExplainer) historically used `zIndex: 90` without a portal — fine until rendered under a sticky/transform parent; if a similar bug appears for any of these, the fix is the same.

## Modal stacking

Multiple modals open simultaneously is a UX hazard. The modal primitive in `components/modals/` should handle this — the modal-priority store ([client-state](../client-state/)) coordinates.

## SSR + theme flash

Theme bootstrap (in [theme](../theme/)) runs pre-React. If a shared-ui component references `theme` via context before bootstrap completes, you can see a flash.

## Dark mode coverage gaps

When adding a new component, write the `dark:` variants alongside. It's hard to retrofit later.

## Package color cards: `bgGradient` is a CSS string, not a Tailwind class

`PackageColorScheme.bgGradient` (from [packageColorScheme.ts](../../src/utils/package-colors/packageColorScheme.ts)) is a **CSS `linear-gradient(...)` string**, not a Tailwind class. Apply it via `style={{ background: scheme.bgGradient }}` — putting it in `className` silently does nothing (the browser drops the invalid class), leaving the card with no background. This bit `ResubscribeTierCard` (the SubscriptionManagementModal resubscribe picker): the gradient was passed to `className`, so cards rendered white while the text was white → invisible. Also drive text contrast off the scheme (`scheme.text` / `scheme.textMuted`; `scheme.text === "text-black"` marks a light-background tier like ryobi/dewalt/mint that needs dark text) rather than a fixed `theme` flag.

## ElectricPackageCard / PackagesGrid price layout

`ElectricPackageCard` stacks the struck regular price above the discounted price in a vertical flex column so the `w-fit` panel contains both values without overflow; the swing tag is positioned at `-top-6 -left-2`. The `BestValueBadge` and `CornerRibbonBadge` are rendered `size="small"` with `scale-[0.5] origin-top-left` so the sash stays in the top-left corner without crossing the centred title. In `PackagesGrid` the struck original entries and struck regular price are `absolute` (offset `-top-3`) so they add no height to the row in the non-promo case.

## Image lazy-load gotchas

Lazy-loaded images need width/height to prevent layout shift. The image helper in `utils/images/` enforces this via prop validation. Don't bypass.

## PaymentMethodsTab — two different "defaults" (2026-05-19)

The wallet has **two unrelated notions of default** and conflating them double-stars cards:

1. **Wallet default** — `pm.isDefault`, a flag persisted on `user.savedPaymentMethods[].isDefault` in Mongo. Set when a card is added with `setAsDefault` or via "Set default". It does **not** stay in sync with Stripe.
2. **Subscription billing card** — `subscriptionDefaultPaymentMethodId`, fetched live from Stripe in [api/stripe/payment-methods/route.ts](../../src/app/api/stripe/payment-methods/route.ts) via `getStripeSubscriptionDefaultPaymentMethodId`. This is the card the subscription **actually charges**.

These legitimately diverge. The **legacy** view ([index.tsx](../../src/components/modals/PaymentMethodsTab/index.tsx) + [SavedMethodRow.tsx](../../src/components/modals/PaymentMethodsTab/SavedMethodRow.tsx)) shows them as **two separate badges**. The settings-redesign view ([SettingsRedesignPayment.tsx](../../src/components/modals/PaymentMethodsTab/SettingsRedesignPayment.tsx)) collapses them into one "DEFAULT" star.

**Bug that was fixed:** the redesign computed `isDefault = pm.isDefault || pm.paymentMethodId === subscriptionDefaultPaymentMethodId`. When the wallet default ≠ the subscription card, **both** rendered the star + red ring — contradicting the panel copy *"The card with the star is charged for your subscription"* (singular).

**Current (single-star) rule** — keep it: with an active subscription **and** a known Stripe subscription default, star **only** that card; otherwise fall back to `pm.isDefault`. This guarantees exactly one star and that it reflects the truthfully-charged card. Do **not** reintroduce the `||`.

## Stripe PaymentElement must be `ready` before `elements.submit()` / `confirmPayment()`

Stripe throws "We could not retrieve data from the specified Element…" if you call `elements.submit()`/`confirmPayment()` before the `<PaymentElement>` has emitted its `ready` event, and `confirmStripeIntent` returns "Stripe not loaded" if `useStripe()`/`useElements()` haven't resolved. The Purchase button must be gated on readiness, not just on a client secret. [`CardFormSection`](../../src/components/modals/PaymentMethodSelector/CardFormSection.tsx) tracks `ready` via `<PaymentElement onReady>` + a ref, short-circuits `confirmStripeIntent` through the pure guard in [`paymentReadiness.ts`](../../src/components/modals/PaymentMethodSelector/paymentReadiness.ts), and emits an `onElementReady` callback that threads up through PaymentMethodSelector → PaymentStep → [MembershipModal](../../src/components/modals/MembershipModal/index.tsx) `isFormValid()` to disable the button until ready. When wiring a new payment surface, thread `onElementReady` to **every** `<PaymentMethodSelector>`/`<CardFormSection>` mount (the guest mount was missed once, which would permanently disable guest checkout). This was a production conversion bug on `/promotions/*`.

## LoginModal: don't invalidate/identify off the closure `session` after `signIn()`

After `signIn(..., { redirect: false })`, the `session` from the component's `useSession()` closure is still the pre-login value (`null` for a guest). Reading `session?.user?.id` there silently skips cache invalidation and Klaviyo `identify()`. Always `await getSession()` for the fresh id. All [LoginModal](../../src/components/modals/LoginModal/index.tsx) flows use the canonical [`usePurchaseInvalidation`](../../src/hooks/usePurchaseInvalidation.ts) keyed off the fresh session. See [auth/gotchas.md](../auth/gotchas.md).

## Klaviyo identify and event keys are snake_case

Client-side Klaviyo calls — [LoginModal](../../src/components/modals/LoginModal/index.tsx) `identify(...)`, [ProductCard](../../src/components/ui/ProductCard.tsx) `trackKlaviyoAddToCart`, [RedeemablesWallet](../../src/components/features/RedeemablesWallet.tsx) `track("Monthly Redeemable Redeemed", ...)` — pass **snake_case** keys (`first_name`, `last_name`, `user_id`, `product_id`, `num_items`, `entries_granted`, …). The values often come from camelCase TypeScript objects (e.g. `session.user.firstName`); only the Klaviyo-facing **key** must be snake_case. The `KlaviyoIdentifyParams` / `KlaviyoEventParams` interfaces in [src/hooks/useKlaviyoTracking.ts](../../src/hooks/useKlaviyoTracking.ts) enforce this. Mixing camelCase creates duplicate shadow properties on Klaviyo profiles and silently breaks flow filters / segment conditions. See [docs/tracking/KLAVIYO_INTEGRATION.md](../tracking/KLAVIYO_INTEGRATION.md) for the full contract.

## CardFormSection AddPaymentInfo: dual Pixel+CAPI with billing-derived PII

[`CardFormSection`](../../src/components/modals/PaymentMethodSelector/CardFormSection.tsx) fires `AddPaymentInfo` via `usePixelTracking().trackAddPaymentInfo` (dual Pixel+CAPI, shared event_id) with `billingDetails`-derived PII — not the old browser-only `trackConversion`. It no longer fires the Snapchat browser pixel for AddPaymentInfo (consistent with other funnel events; Snap is reached server-side via the mirror).

## MembershipModal InitiateCheckout: guest PII for CAPI identity matching

`MembershipModal` passes guest `formData` PII (email/first/last/phone, country AU) to `trackInitiateCheckout` so guest InitiateCheckout CAPI events carry identity; the checkout fire site sends it only when `!isAuthenticated` (logged-in users rely on session enrichment).

## MembershipModal pre-warm toast removed — single actionable toast only

The MembershipModal auto-creates a subscription on open (background pre-warm) so checkout is faster on purchase click. Previously, if a stale `EXISTING_SUBSCRIPTION` (409) was returned during this pre-warm, it would immediately surface an `EXISTING_SUBSCRIPTION` error toast — followed by a second "Active Subscription Found" toast if the user then clicked Purchase. This produced two toasts for a single user action. The pre-warm path now only logs the 409 response and does not show a toast; the single actionable "Active Subscription Found" toast on the purchase-click path is the only one displayed.

## `ModalContent` is already `flex-1 overflow-y-auto` — don't wrap it again (2026-05-27)

`<ModalContent>` (in `src/components/modals/ui/`) is itself a `flex-1 overflow-y-auto` container — wrapping its children in another `<div className="flex-1 overflow-y-auto">` produces **two stacked scrollable regions and a double vertical scrollbar**. This bit [`MembershipByPackageDetailModal.tsx`](../../src/components/modals/MembershipByPackageDetailModal.tsx) in the membership breakdown drill-down: the inner wrapper was removed and the immediate child of `<ModalContent padding="none">` is now a plain `<div>` that fills naturally. When porting a modal body, drop any outer `flex-1`/`overflow-y-auto` wrapper and let `ModalContent` own the scroll.

## MembershipModal register POST: client-computed `fbc`/`fbp` for server CAPI Click ID

`MembershipModal.handleRegistration` sends client-computed `fbc`/`fbp` (`getFBCFromURL()` / `getFBPFromCookie()` from [facebook-helpers](../../src/utils/tracking/facebook-helpers.ts), guarded by `typeof window !== "undefined"`) in the `/api/auth/register` POST body so the server-side `CompleteRegistration` CAPI event gets the Meta Click ID. The register POST can fire before the pixel writes the `_fbc` cookie and the API URL has no `fbclid`, so the server can't reliably source `fbc` itself — the client supplies it (it can read the cookie or reconstruct from the landing `fbclid`). Server counterpart prefers these body values over the cookie: see [auth/api.md](../auth/api.md) and [auth/gotchas.md](../auth/gotchas.md).

## Mobile-UX hardening pass: iOS focus-zoom + dvh→svh modal heights + safe-area CTA (2026-06-09)

A batch of fixes targeting iOS Safari behavior. Two reusable rules came out of it (also recorded in [tailwind-conventions.md](./tailwind-conventions.md) §9):

1. **Focusable inputs must render ≥16px (`text-base`) to avoid iOS focus zoom.** iOS Safari auto-zooms a focused input whose *computed* font-size is <16px (e.g. `text-sm` = 14px). Fixed in this pass:
   - [`Input.tsx`](../../src/components/modals/ui/Input.tsx) — the `md` size class went `text-sm` → `text-base`.
   - [`CouponRow.tsx`](../../src/components/modals/MembershipModal/CouponRow.tsx) — coupon input `text-sm sm:text-base` → `text-base`.
   - [`PaymentMethodsTab/index.tsx`](../../src/components/modals/PaymentMethodsTab/index.tsx) — Stripe Elements appearance now uses the shared `buildMembershipStripeAppearance(isDarkMode)` (16px inputs + dark-mode support) instead of a hardcoded light 14px object; Elements are re-keyed on theme so the appearance actually swaps.

2. **Size modal CONTENT with `svh`, not `dvh`.** `dvh` (dynamic viewport height) is throttled by WebKit and janks/clips as the mobile browser chrome shows/hides ([WebKit bug 266835](https://bugs.webkit.org/show_bug.cgi?id=266835)); `svh` (smallest viewport height) is the stable unit. [`ModalContainer.tsx`](../../src/components/modals/ui/ModalContainer.tsx) content heights (`auto` max-h, `screen`, `fixed`, `mobileFullBleed` variants) moved `dvh` → `svh`. Tall content relies on the modal body's own `overflow-y-auto` scroll region (see the `ModalContent` gotcha below). The backdrop may stay `dvh` — only the content box needs the stable unit.

3. **Floating CTA clears the iOS home indicator via safe-area inset.** The app now sets `viewport-fit=cover`, so fixed bottom UI sits under the home indicator. [`FloatingGetEntriesButton.tsx`](../../src/components/sections/promo/FloatingGetEntriesButton.tsx) bottom offset is now `bottom-[calc(env(safe-area-inset-bottom)+1rem)]`. Any new fixed-bottom CTA should follow the same pattern.

### PromoBanner: skeleton placeholder + scroll-to-top placement fix (2026-06-09)

[`PromoBanner.tsx`](../../src/components/sections/promo/PromoBanner.tsx) had two issues fixed together:

4. **CLS on load.** While promo/draw/variant data resolves (`!isPromoResolved`) the component used to `return null` — zero height — then pop in at full height and push the whole landing page down. It now returns a **height-reserving skeleton** (full-bleed black bar at the bar-mode `min-h-[4.5rem] sm:min-h-[7rem] lg:min-h-[6.75rem]`, with `bg-white/10 animate-pulse` left-art + countdown blocks) so the space is reserved from first paint. Uses the banner's own pulse idiom so it reads as one loading state with the hero's `animate-pulse` loader below it. **Rule:** a client-gated, above-the-fold banner must reserve its height while loading, never `return null`.

5. **Misplacement when scrolling back to top.** The banner morphs between an in-flow full-bleed bar (top) and a `position: fixed` floating pill (scrolled) via Framer MotionValues on `top/left/width` (FLIP). On revert, Framer sometimes left a stale fixed-era inline `top: <px>`; with `position: relative` that shifts the bar **down** (gap above it) while its flow slot stays at `top:0` (hero below overlaps under it). Fix: the "leaving fixed mode" `useLayoutEffect` now force-resets `node.style.top/left/right/width` to the bar geometry (`top:0px; left/right:auto; width:100vw`) directly on the DOM, so the bar always lands flush. Belt-and-braces over the existing MotionValue reset — the conditional MotionValue↔static `style` swap is the fragile part.

## UpsellModal: `isProcessing` does NOT guard the post-success window — a `purchaseComplete` latch does (2026-06-02)

[`UpsellModal`](../../src/components/modals/UpsellModal/index.tsx) shows a `PaymentProcessingScreen` overlay on a successful charge and only auto-closes ~3s later (`setTimeout(handleClose, 3000)`), polling the webhook in between. The in-flight guards — `isProcessing` state and the synchronous `upsellPurchaseLockRef` — are both reset in the `finally` block **the instant `purchaseUpsell.mutateAsync` resolves**, including on the success path. That left a multi-second window where the underlying modal was still mounted and the "Purchase" button was re-enabled (its `disabled` read only `isProcessing`). Because every tap mints a **fresh** `crypto.randomUUID()` idempotency key, a second tap was a brand-new Stripe PaymentIntent — i.e. a real **double charge + double entry grant** (the server's DB pre-check reads the user doc before the webhook writes the purchase row, and a per-tap random key defeats Stripe idempotency, so neither server guard catches the race).

Fix: a `purchaseComplete` state latch set to `true` in the success branch (before `finally` runs) and never cleared while the offer is shown. It is OR'd into the `runUpsellPurchase` early-return guard (covers the button **and** the inline-card `handleUpsellInlineCardSaved` path) and into [`AcceptDeclineRow`](../../src/components/modals/UpsellModal/AcceptDeclineRow.tsx)'s button `disabled` (which then renders a "Purchased" state). A `useEffect` keyed on `offer.id` resets the latch so a back-to-back upsell reusing the same modal instance starts enabled (the normal close path unmounts the modal, so per-open reset is automatic). The latch is intentionally **not** cleared on `handlePaymentError`/`onTimeout`: once `mutateAsync` returns `success` with a `paymentIntentId` the money is already taken, so re-enabling would risk a second charge. This is a UI-only fix; no backend change.
