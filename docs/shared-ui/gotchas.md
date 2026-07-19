# Shared UI — Gotchas

## Customer copy in shared sections: free-entry framing (2026-07-08)

Promo/section copy is customer-facing and must follow **CLAUDE.md §11** (game-of-chance trade promotion — entries are never sold, they're a free inclusion; no odds/chance/gambling framing). `PartnerBenefitsPromoSection` showed tiers as "{entries} entries/mo · {price}/giveaway" (reads as pricing entries) → reframed to "{price}/giveaway · includes {entries} free entries/mo" so the price attaches to the membership. When adding any tier/pack/price label, lead with the product (membership/pack) and show entries as **included free**.

## Promotions right-corner FABs dodge the "Enter Now" bar (2026-07-08)

On `/promotions`, the bottom-right floating controls now lift above the full-width floating **Enter Now** bar ([`FloatingGetEntriesButton`](../../src/components/sections/promo/FloatingGetEntriesButton.tsx)) when it scrolls in, and settle back when it's gone — the same collision-dodge the Cobber launcher uses, via `useDodgeFloatingObstacles("right", enabled)` ([hook](../../src/components/support-chat/useDodgeFloatingObstacles.ts)) applied as an inline `bottom` with a `transition-[bottom]`. It's wired in **two** places because the two audiences are mutually exclusive: **guests** → [`PromotionsGuestThemeToggle`](../../src/components/ui/ThemeToggle.tsx) (sun only, `bottom-4`); **authenticated** → [`PromotionsAccountButton`](../../src/components/sections/promo/PromotionsAccountButton.tsx) (one stack = sun toggle **+** account button, `bottom-16`/`sm:bottom-4`). The Enter Now bar carries `data-floating-widget`, so it's the obstacle; the hook only lifts for obstacles that reach the right corner (full-width bars), not narrow centered ones. The dodge hook is generic geometry (not chat-specific) despite living under `support-chat/` — reused as-is rather than relocated.

## `(site)/layout.tsx` is a Server Component — `ssr:false` dynamic imports must live in a Client wrapper (2026-06-25)

`src/app/(site)/layout.tsx` is the site shell (Server Component): Header/Footer/Newsletter/Modals + the support chat widget (**Cobber**). The widget is mounted via `src/components/support-chat/SupportChatWidgetMount.tsx` — a `"use client"` wrapper that does `next/dynamic(() => import(...), { ssr: false })`. Do **NOT** call `next/dynamic({ ssr:false })` directly in this layout (or any `layout.tsx`/`page.tsx` without `"use client"`): Next.js App Router forbids `ssr:false` in a Server Component and **`next build` fails** (on Vercel and locally) even though `tsc`/`type-check` **passes**. This matches the repo-wide pattern — every other `ssr:false` lives inside a `"use client"` component. **Run a full `npm run build` (not just `type-check`)** after any change to a server `layout.tsx`/`page.tsx`, a `dynamic({ssr:false})`, or the client/server boundary. Full incident write-up: [`docs/ai-chatbot/gotchas.md`](../ai-chatbot/gotchas.md) §1.
## MembershipModal package-picker auto-reopen loop (2026-07-07)

The "Select your package" picker inside `MembershipModal` ([`src/components/modals/MembershipModal/index.tsx`](../../src/components/modals/MembershipModal/index.tsx)) auto-reopened after every select/exit on `/promotions/[slug]` (never the homepage), trapping users before payment and dropping new-member conversions to near-zero — a **silent** outage (no server error, only auto-renewals still landing). Cause: a re-arm block cleared the once-per-session auto-open latch after any real plan was selected, and the `/promotions` auto-open branch was **not gated on `isPlaceholderPlan`** (its config sibling was), so the cleared latch immediately reopened the picker. Fix: removed the re-arm (latch resets only on `!isOpen`) **and** gated the `/promotions` branch on `isPlaceholderPlan`. **Invariant:** the picker auto-opens at most once per modal-open session and only while on the placeholder; never re-arm the latch on an in-session condition, and keep every auto-open branch gated on `isPlaceholderPlan`. Full write-up: [docs/subscription/package-selection-first.md](../subscription/package-selection-first.md).

## Selected Package card: first row is partner-discount access, NOT `features[0]` (2026-06-22)

`PlanSummaryCard` ("Selected Package" summary) renders two benefit rows. The first row must show the **partner-discount access %**; the second shows the entries. It previously rendered `promoEnhancedPlan.features[0].text` as row 1 — but `features[0]` is the **entries** line for these packages (and the promo enhancement in `useMajorDrawEntryCta.ts` rewrites it to `"N Free Entries (KX PROMO!)"`), so the card showed **entries twice** and never showed the partner line. Fix: row 1 now derives the partner line from `getPartnerDiscountBenefitTextForPackageId(selectedCatalogId)` (null = package grants no partner access → fall back to `features[0]`/subtitle) with the subscription-aware percent from `getPartnerCatalogAccessPercentForMembershipPackageId` (so a subscription Tradie reads 50%, not the one-time 40%). Don't reintroduce `features[0]` as the first row here.

## Auto-login in MembershipModal / LoginModal needs proof (2026-06-19)

Both modals establish a NextAuth session via `signIn("auto-login", { token })`. Following the auto-login account-takeover fix:

- **MembershipModal** (3 post-payment call sites) now sends `paymentIntentId` in the `/api/auth/auto-login` body — the endpoint verifies that PaymentIntent belongs to the user's Stripe customer before issuing a token. If you add a new auto-login call site, you **must** pass a real `paymentIntentId` or it returns 403.
- **Subscription PI fallback (the "paid but not redirected" fix, 2026-06-19):** `confirm-subscription-payment`'s auto-login response omits `paymentIntentId`, so the subscription call site's `effectivePaymentIntentId` can be empty if the PI-id state wasn't captured. The auto-login body therefore falls back to the **invoice PaymentIntent derived from `paymentIntentClientSecret`** (`split("_secret_")[0]`) when the id is otherwise missing. It only engages when the id is empty (the failing case), so it never changes a flow that already works. Without it, the user gets "Account Created!" but is not logged in or redirected.
- **LoginModal** (email-verification path) no longer calls `/api/auth/auto-login`. `/api/auth/verify-email` now returns a `token` (minted off the just-verified code, when the user has membership) and the modal signs in with `data.token` directly. The `else` branches (no token) fall back to the password prompt — keep that behaviour.

**Known gap (pre-existing):** a **new** user buying a **one-time** package is created asynchronously by a Stripe webhook, so `create-one-time-purchase` returns no `user`/`autoLogin` → that flow never attempts auto-login (the buyer isn't auto-redirected). Not addressed by the above.

See [docs/auth/jwt-auth-remediation-spec.md](../auth/jwt-auth-remediation-spec.md) (A0).

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

## Rendering a `dynamic()` component while closed still downloads its chunk (2026-07)

`next/dynamic(() => import(...), { ssr: false })` only defers **when** the chunk loads relative to SSR — it does NOT defer loading until the component is actually shown. A `<DynamicModal isOpen={false} .../>` mount still triggers the `import()` and downloads/evaluates the chunk on render, even though nothing is visible. This shipped Stripe.js + the entire ~7k-line `MembershipModal` payment chunk to every guest who merely landed on a page containing a `<MembershipModal>` mount point (homepage, `/membership`, draw pages, dashboard) — the 2026-07 perf audit finding.

**Fix pattern:** gate the render itself, not just the import — see [`LazyMembershipModal`](../../src/components/modals/MembershipModal/LazyMembershipModal.tsx): a small wrapper that renders `null` until the first `isOpen === true`, then mounts the real `dynamic()` component and keeps it mounted for the rest of the session (so close/reopen animation and internal state behave like an always-mounted modal). Any heavy modal that's conditionally rendered from a page-level mount point (not user-triggered open) should use this pattern, not a bare `dynamic()` call. See [payment/frontend.md](../payment/frontend.md) for the full write-up and [payment/gotchas.md](../payment/gotchas.md) for the companion "Stripe boots on import" fix.

## Viewport-correct `priority`/preload — a CSS-hidden `<img>` (even `loading="eager"`, not just `priority`) still downloads (2026-07-19, corrected 2026-07-19)

A common pattern in this codebase used to be two separate `<Image>` elements for the same hero slot — one in an `lg:hidden` container, one in a `hidden lg:block` container. Marking **both** `priority`, or even swapping both to plain `loading="eager"`, still downloads BOTH images on every device: a CSS-hidden element (`display:none`) does **not** defer an `<img>`'s network fetch regardless of its `loading`/`priority` attribute — hiding a *second, fully-mounted* `<img>` element is never sufficient, no matter what loading mode it uses. (Original version of this entry recommended `loading="eager"` on both as a fix — that was wrong; corrected below. `<video preload="auto">` has the identical problem — see [promo/gotchas.md](../promo/gotchas.md) "CSS-hidden `<video preload>`".)

**The actual fix is structural, not attribute-level: render ONE `<picture>` element with viewport-scoped `<source media=...>`s and a single fallback `<img>`, not two separate `<Image>`s toggled by CSS.** The browser's native `<picture>`/`<source>` matching means only the `<source>` whose `media` query matches ever gets fetched — there is no second element in the DOM competing for bandwidth. Reference implementation: `src/components/sections/Hero.tsx`'s background (also `src/app/promotions/page.tsx`'s featured-card hero):

```tsx
const mobileBg = getImageProps({ src: "...", alt: "...", fill: true, sizes: "100vw", loading: "eager" }).props;
const desktopBg = getImageProps({ src: "...", alt: "...", fill: true, sizes: "100vw", loading: "eager" }).props;
// ...
<picture>
  <source media="(min-width: 1024px)" srcSet={desktopBg.srcSet} sizes="100vw" />
  <source media="(max-width: 1023px)" srcSet={mobileBg.srcSet} sizes="100vw" />
  <img {...mobileBg} alt="..." className="object-cover" />
</picture>
```

If the two viewport variants also need different container geometry (e.g. a different `aspect-[...]` per viewport, not just a different image source — see the `/promotions` featured card), put the RESPONSIVE variant on the SAME wrapper div via Tailwind breakpoint classes (`aspect-[1080/1164] lg:aspect-[2560/1044]`) rather than two conditionally-hidden divs — one div, one `<picture>`, one `<img>` in the DOM at a time.

- Still add your OWN single, **media-scoped** preload `<link>` pair via the SAME `getImageProps` result (`<link rel="preload" as="image" media="(max-width: 1023px)" imageSrcSet={mobileProps.srcSet} imageSizes="100vw" />` + the `(min-width: 1024px)` desktop twin) so the browser starts the request before it even parses the `<picture>`. Raw-path `href` preloads don't work here — see [promo/gotchas.md](../promo/gotchas.md) "Raw-path image preloads never match `/_next/image` URLs."
- **Components rendered at multiple call sites** (e.g. `PrizeShowcase`'s first-gallery-slide `priority`): if one call site already sits below another `priority` hero on the same page, add an opt-out prop (e.g. `priorityFirstSlide?: boolean`, default `true`) rather than hardcoding `priority` — two competing `priority` images on one page fight for the browser's preload attention, and the lower one never needed it anyway. (Correction 2026-07-20: PrizeShowcase's main slide DOES also render a mobile/desktop pair in places — the opt-out prop is still the right tool for the *priority* question, but don't cite this component as "no hidden pair"; check the actual markup per call site.)
- **When only ONE of the two variants needs `priority`-style urgency and the other is a non-visual fallback** (e.g. `PromoHero`'s still-image fallback, which is itself gated behind `showVideo`/`viewport` JS state rather than pure CSS `hidden`), `loading="eager"` on the still (not `priority`) is correct — the JS gate, not CSS, is what prevents the *other* viewport's branch from mounting at all.

## Z-index conflicts

Modals, banners, tooltips, dropdowns — many things stack. If something disappears behind another, check `z-index.ts` and the constant in use.

## Inline-rendered modals trapped inside a `sticky`/`transform` ancestor

A modal that renders **inline** (no `createPortal`) inherits whatever stacking context its mount point lives in. If the mount point is descended from anything that creates a stacking context — `position: sticky`, `position: fixed`, `transform`, `filter`, `opacity < 1`, `will-change`, `isolation: isolate` — the modal's `z-index` is *trapped local to that context*. A sibling element in a different ancestor at a lower numeric `z-index` (e.g. `z-20`) can paint on top of it because the modal's "effective" page-level layer is whatever the trapping ancestor was assigned (often auto/0).

Concrete prior hit: on the mini-draws prize-details page, `LoginPromptModal` rendered inside the `lg:sticky lg:top-28` right column. `MiniDrawImageGallery`'s carousel chevrons (`z-20`) in the sibling left column painted over the modal's `zIndex: 90`. Fix was to portal the modal's Shell to `document.body` and use `Z_INDEX.MODAL_BASE` — same pattern `ModalContainer` already follows. See [Shell.tsx](../../src/components/modals/LoginPromptModal/Shell.tsx).

Rule of thumb: **any full-screen overlay modal must portal to `document.body`** (and use `Z_INDEX.MODAL_BASE` from `constants/z-index.ts`). Bumping the numeric z-index does **not** fix this — only escaping the trapping ancestor does. The Shell-pattern modal suite (Upgrade/Downgrade/Refer/PastDraws/StripePayment/ExistingAccount/PackageDetail/SubscriptionExplainer) historically used `zIndex: 90` without a portal — fine until rendered under a sticky/transform parent; if a similar bug appears for any of these, the fix is the same.

## Modal stacking

Multiple modals open simultaneously is a UX hazard. The modal primitive in `components/modals/` should handle this — the modal-priority store ([client-state](../client-state/)) coordinates.

## SSR + theme flash

Theme bootstrap (in [theme](../theme/)) runs pre-React. If a shared-ui component references `theme` via context before bootstrap completes, you can see a flash. **Light is the hard default** — the bootstrap only applies `dark` for a genuinely user-chosen dark, so a component that defaults to light renders correctly first.

## Theme toggle buttons are tap-only

`ThemeToggle.tsx` (`ThemeToggleButton`) and `HeaderThemeToggle.tsx` switch light/dark on a plain tap and persist the choice. The old hold-to-restore time-based (Sydney) auto mode was removed — there is no time-of-day / system-preference auto theme anymore (see [theme/rules.md](../theme/rules.md)). Don't reintroduce the `onPointer*`/hold handlers on these buttons.

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

The MembershipModal auto-creates a subscription on open (background pre-warm) so checkout is faster on purchase click. Previously, if a stale `EXISTING_SUBSCRIPTION` (409) was returned during this pre-warm, it would immediately surface an `EXISTING_SUBSCRIPTION` error toast — followed by a second "Active Subscription Found" toast if the user then clicked Purchase. This produced two toasts for a single user action. The pre-warm path now only logs the 409 response and does not show a toast; the single actionable "Active Subscription Found" toast on the purchase-click path is the only one displayed. Its **"Manage Subscription"** action deep-links to **`/my-account?open=subscription`**, which opens the **Manage-membership bottom sheet** on arrival (handled in `my-account/page.tsx`) — not just the dashboard home.

## Confirm-time card declines surface the real reason in three modals (2026-07-16)

Server routes now return `400 { error: "Payment failed", details, code, decline_code }` for confirm-time card declines (previously generic 500s), and three modals read that shape so the user sees the actual decline reason (e.g. "This card is linked to a closed or invalid account. Use a different card, or contact your bank.") instead of a generic message:

- **MembershipModal** ([index.tsx](../../src/components/modals/MembershipModal/index.tsx)) — the checkout `catch`'s error extraction understands the `ApiError` shape from [`src/lib/queries.ts`](../../src/lib/queries.ts), which carries the response body on **`.data`** (NOT `.response.data`): a dedicated branch reads `errorMessage` from `data.details` / `data.error` / `data.message` and picks up `data.code` + `data.decline_code`; the inline `extractStripeErrorCode` / `extractStripeDeclineCode` helpers also probe `.data`. Previously `ApiError` decline details ("Invalid account.") were silently dropped and the user got a generic message. The user-facing toast still comes from `formatPaymentError` ([payment domain](../payment/)), which returns decline-specific concise guidance.
- **SpecialPackagesModal** ([index.tsx](../../src/components/modals/SpecialPackagesModal/index.tsx)) — the purchase `catch` now toasts via `formatPaymentError(error)` (central payment-error copy: decline-specific title/message when the API 400 carries `code`/`decline_code`) instead of raw `error.message`.
- **SubscriptionManagementModal** ([index.tsx](../../src/components/modals/SubscriptionManagementModal/index.tsx)) — the renew/reactivate `catch` checks `extractPaymentErrorCodes` + `getCardDeclineGuidance` and shows the concise decline guidance (title + message) when the failure was a card decline; the payment-method-invalid and generic messages are unchanged.

**Rule:** when handling a purchase/renew failure in a modal, don't read only `.response.data` or raw `error.message` — `ApiError` from `src/lib/queries.ts` carries the body on `.data`. Prefer the central payment-domain helpers (`formatPaymentError`, or `extractPaymentErrorCodes` + `getCardDeclineGuidance`, in `src/utils/payment/stripe/`) over hand-rolled copy.

## `ModalContent` is already `flex-1 overflow-y-auto` — don't wrap it again (2026-05-27)

`<ModalContent>` (in `src/components/modals/ui/`) is itself a `flex-1 overflow-y-auto` container — wrapping its children in another `<div className="flex-1 overflow-y-auto">` produces **two stacked scrollable regions and a double vertical scrollbar**. This bit [`MembershipByPackageDetailModal.tsx`](../../src/components/modals/MembershipByPackageDetailModal.tsx) in the membership breakdown drill-down: the inner wrapper was removed and the immediate child of `<ModalContent padding="none">` is now a plain `<div>` that fills naturally. When porting a modal body, drop any outer `flex-1`/`overflow-y-auto` wrapper and let `ModalContent` own the scroll.

## ImageUpload preview card: the remove (X) button needs `z-20` above the full-card replacement input (2026-06-24)

[`ImageUpload`](../../src/components/modals/ui/ImageUpload.tsx) — the shared modal image uploader (used by `MajorDrawEditModal` and others) — renders, inside each preview card, a full-card hidden `<input type="file" className="absolute inset-0 …">` for drag/click-to-replace **after** the remove (X) button in DOM order. With equal (auto) z-index the later-painted input won hit-testing and overlaid the X button, so clicking X opened the **replace** file-dialog instead of deleting the image (reported in the admin "Edit Major Draw" modal). Fix: the X button now carries `z-20` (above the replacement input) plus `onClick` `e.preventDefault()`/`e.stopPropagation()` and an `aria-label`, so clicking X calls `removeImage(index)` (delete) while the rest of the card still triggers replace. **Rule:** when an interactive control sits over a full-card `absolute inset-0` input, the control must win z-order — DOM order alone won't save it.

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

4. **CLS on load.** While promo/draw/variant data resolves (`!isPromoResolved`) the component used to `return null` — zero height — then pop in at full height and push the whole landing page down. It now returns a **height-reserving skeleton** (full-bleed black bar at the bar-mode `min-h-[5rem] sm:min-h-[8rem] lg:min-h-[8.25rem]` (raised 2026-06-12 with the extended art — see below), with `bg-white/10 animate-pulse` left-art + countdown blocks) so the space is reserved from first paint. Uses the banner's own pulse idiom so it reads as one loading state with the hero's `animate-pulse` loader below it. **Rule:** a client-gated, above-the-fold banner must reserve its height while loading, never `return null`.

5. **Misplacement when scrolling back to top.** The banner morphs between an in-flow full-bleed bar (top) and a `position: fixed` floating pill (scrolled) via Framer MotionValues on `top/left/width` (FLIP). On revert, Framer sometimes left a stale fixed-era inline `top: <px>`; with `position: relative` that shifts the bar **down** (gap above it) while its flow slot stays at `top:0` (hero below overlaps under it). Fix: the "leaving fixed mode" `useLayoutEffect` now force-resets `node.style.top/left/right/width` to the bar geometry (`top:0px; left/right:auto; width:100vw`) directly on the DOM, so the bar always lands flush. Belt-and-braces over the existing MotionValue reset — the conditional MotionValue↔static `style` swap is the fragile part.

### PromoBanner: extended left-art size + drawn-tomorrow parity (2026-06-12)

New `drawn-tomorrow` / `drawn-tonight` brand art is a tall clock lockup (replacing the old short-wide tomorrow art), so the left-art size was bumped and **`drawn-tomorrow` now renders at the same size as `drawn-tonight`** — the `isDrawnTomorrowLeftArt` shrink branch was retired (both its art + skeleton branches now carry the default sizing; the flag is kept only so the ternary stays explicit). Non-scrolled art is `h-[5rem] sm:h-[8rem] lg:h-[8.25rem]` (was 4.5/7/6.75rem; tomorrow was 3.125/4.875/4.75rem), scrolled pill `h-[4.25rem] sm:h-[7rem] lg:h-[7rem]`. Bar `min-h` (both layers) and the `!isPromoResolved` skeleton were raised to match so there's no CLS. **Width is aspect-driven** — the art is `object-contain` at a fixed height, so making it "wider" means raising the height. `Holiday` takeover art keeps its own (larger) sizing untouched.

### Branded loaders + empty-state hygiene (2026-06-09 follow-up)

- **PromoBanner load state shows the brand logo, not pulse blocks.** The `!isPromoResolved` skeleton (item 4) renders the white-text Tools Australia logo (`/images/Tools Australia Logo/White-Text Logo.webp`) centered on the dark bar with a gentle breathe (opacity + scale via Framer, gated by `prefersReducedMotion`). Still reserves the same `min-h` so there's no CLS.
- **`MultiplierBannerImage` has its own loader.** [`MultiplierBannerImage.tsx`](../../src/components/ui/MultiplierBannerImage.tsx) now tracks `loaded` (`onLoad`), fades the art in (`opacity-0`→`opacity-100`), and overlays a branded loader **inside the image's reserved box** (next/Image keeps the aspect-ratio, so no shift): social-profile logo (`Social_Media_Profile_Primary-removebg-preview.webp`) + `.animate-shimmer-horizontal-fast` sweep + gradient "Gearing up your multipliers…" text. Used by MembershipSection + PrizeShowcase (both multiplier banners). The passed `className` now sizes the wrapper `<div>`; the `<Image>` is `w-full h-auto`.
- **`GiveawayCountdownTimer` hides on TBA.** [`GiveawayCountdownTimer.tsx`](../../src/components/sections/promo/GiveawayCountdownTimer.tsx) returns `null` when `!currentMajorDraw?.drawDate` — no more "Major draw / Draw date TBA" placeholder card. It only renders once a real `drawDate` exists (countdown within 3 days, else the date card).

## UpsellModal: `isProcessing` does NOT guard the post-success window — a `purchaseComplete` latch does (2026-06-02)

[`UpsellModal`](../../src/components/modals/UpsellModal/index.tsx) shows a `PaymentProcessingScreen` overlay on a successful charge and only auto-closes ~3s later (`setTimeout(handleClose, 3000)`), polling the webhook in between. The in-flight guards — `isProcessing` state and the synchronous `upsellPurchaseLockRef` — are both reset in the `finally` block **the instant `purchaseUpsell.mutateAsync` resolves**, including on the success path. That left a multi-second window where the underlying modal was still mounted and the "Purchase" button was re-enabled (its `disabled` read only `isProcessing`). Because every tap mints a **fresh** `crypto.randomUUID()` idempotency key, a second tap was a brand-new Stripe PaymentIntent — i.e. a real **double charge + double entry grant** (the server's DB pre-check reads the user doc before the webhook writes the purchase row, and a per-tap random key defeats Stripe idempotency, so neither server guard catches the race).

Fix: a `purchaseComplete` state latch set to `true` in the success branch (before `finally` runs) and never cleared while the offer is shown. It is OR'd into the `runUpsellPurchase` early-return guard (covers the button **and** the inline-card `handleUpsellInlineCardSaved` path) and into [`AcceptDeclineRow`](../../src/components/modals/UpsellModal/AcceptDeclineRow.tsx)'s button `disabled` (which then renders a "Purchased" state). A `useEffect` keyed on `offer.id` resets the latch so a back-to-back upsell reusing the same modal instance starts enabled (the normal close path unmounts the modal, so per-open reset is automatic). The latch is intentionally **not** cleared on `handlePaymentError`/`onTimeout`: once `mutateAsync` returns `success` with a `paymentIntentId` the money is already taken, so re-enabling would risk a second charge. This is a UI-only fix; no backend change.

## UpsellModal / UpsellManager no longer finalize invoices client-side (2026-07)

[`UpsellModal`](../../src/components/modals/UpsellModal/index.tsx) and [`UpsellManager`](../../src/components/modals/UpsellManager.tsx) previously called `/api/invoice/finalize` from the client to emit the "Invoice Generated" Klaviyo receipt — on modal show (via a 30s timeout), on decline, on accept-with-upsell, and on close. That path was **unreliable**: if the customer navigated away before the fetch fired, the receipt was silently dropped. It has been **removed** — the `finalizeInvoice` function, all its call sites, the `/api/invoice/finalize` fetch, and the related state/refs (`invoiceFinalized`, `isFinalizingRef`, `finalizationTimeoutIdRef`/`finalizationTimeoutId`) are gone from both files. The "Invoice Generated" receipt is now emitted **server-side** from payment processing (`trackKlaviyoEvent`), so it can never be dropped by a client that navigates away. Do not reintroduce a client-side finalize. Side effects of the removal: `UpsellManager` no longer uses `originalPurchaseContext` — the prop was dropped from [`UpsellManagerProps`](../../src/types/upsell.ts) entirely (it was only ever a delayed-invoice carrier and no caller passed it) — and `UpsellModal` no longer destructures `userContext` (unused). The modals' core behaviour (show offer, take payment, accept/decline/close) is unchanged, and `UpsellModal` still uses `originalPurchaseContext` for upsell package-type/promo resolution.

## MultiplierBannerImage: stuck "GEARING UP YOUR MULTIPLIERS…" loader on a cached `src` swap (2026-07-01)

[`MultiplierBannerImage`](../../src/components/ui/MultiplierBannerImage.tsx) fades the banner in on the `<Image>` `onLoad` and shows a shimmer loader until then, swapping `src` through an ordered path list (branded → generic). On a promo page the branded/slug inputs settle *after* first paint (the promo-theme store populates in an effect), so the `src` swaps. When the swapped-in `src` points at an **already-cached** image, the browser does **not** re-fire `onLoad` → `loaded` stayed `false` forever → the shimmer never cleared, and only a hard refresh (fresh uncached load) fixed it ("needs a refresh for the correct image"). Fix: in the `[multiplier, slug, toolsetSlug, pathKey]` reset effect, resolve `loaded` immediately when the freshly-set image is already complete (`imgRef.current.complete && naturalWidth > 0`), alongside the existing `onLoad` path. Root-level fix — benefits **every** consumer (currently `MembershipSection` + `PrizeShowcase`).
