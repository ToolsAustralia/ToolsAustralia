# Shared UI — Gotchas

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

## CardFormSection AddPaymentInfo: dual Pixel+CAPI with billing-derived PII

[`CardFormSection`](../../src/components/modals/PaymentMethodSelector/CardFormSection.tsx) fires `AddPaymentInfo` via `usePixelTracking().trackAddPaymentInfo` (dual Pixel+CAPI, shared event_id) with `billingDetails`-derived PII — not the old browser-only `trackConversion`. It no longer fires the Snapchat browser pixel for AddPaymentInfo (consistent with other funnel events; Snap is reached server-side via the mirror).

## MembershipModal InitiateCheckout: guest PII for CAPI identity matching

`MembershipModal` passes guest `formData` PII (email/first/last/phone, country AU) to `trackInitiateCheckout` so guest InitiateCheckout CAPI events carry identity; the checkout fire site sends it only when `!isAuthenticated` (logged-in users rely on session enrichment).

## MembershipModal register POST: client-computed `fbc`/`fbp` for server CAPI Click ID

`MembershipModal.handleRegistration` sends client-computed `fbc`/`fbp` (`getFBCFromURL()` / `getFBPFromCookie()` from [facebook-helpers](../../src/utils/tracking/facebook-helpers.ts), guarded by `typeof window !== "undefined"`) in the `/api/auth/register` POST body so the server-side `CompleteRegistration` CAPI event gets the Meta Click ID. The register POST can fire before the pixel writes the `_fbc` cookie and the API URL has no `fbclid`, so the server can't reliably source `fbc` itself — the client supplies it (it can read the cookie or reconstruct from the landing `fbclid`). Server counterpart prefers these body values over the cookie: see [auth/api.md](../auth/api.md) and [auth/gotchas.md](../auth/gotchas.md).
