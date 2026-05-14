# Spec — Facebook Pixel ↔ CAPI parity for Purchase

Status: **Proposed** · Owner: tracking · Created: 2026-05-12

> **2026-05-14 update:** Subscribe-family, CompleteRegistration, and canonical-`db` parity gaps closed under spec [`docs/superpowers/specs/2026-05-14-fb-capi-emq-fixes-design.md`](../superpowers/specs/2026-05-14-fb-capi-emq-fixes-design.md). See plan [`docs/superpowers/plans/2026-05-14-fb-capi-emq-fixes.md`](../superpowers/plans/2026-05-14-fb-capi-emq-fixes.md).

This spec captures what we need to change so that every Purchase event we send to
Meta is correct on both surfaces (browser Pixel + Conversions API), with consistent
parameters, deduplicated end-to-end, and high Event Match Quality.

---

## 1. Background

Meta accepts the same conversion through two channels and deduplicates them:

- **Browser Pixel** — `fbq('track', 'Purchase', customData, {eventID})` from the
  user's browser. Carries `_fbp`/`_fbc` cookies automatically.
- **Conversions API (CAPI)** — a server POST to
  `https://graph.facebook.com/v18.0/{pixelId}/events` carrying hashed user_data
  and the same event.

Meta dedups on `event_name + event_id` only. Identical `event_id` between the two
channels is the **only** thing required for dedup. **However**, Meta's Events
Manager → Diagnostics surfaces "parameter mismatch" warnings when the two channels
send different `custom_data`, and uneven `user_data` between channels reduces Event
Match Quality (EMQ), which reduces ad-optimization signal quality. So in practice
"correct" means:

1. Same `event_id` on both sides.
2. Same `custom_data` shape on both sides.
3. Server `user_data` is **richer** than browser (hashed PII, IP, real UA,
   external_id) — this is expected, not a parity violation.
4. Browser pixel is initialised with **Advanced Matching** so it sends hashed
   email / external_id / etc. alongside `_fbp` / `_fbc`. **This is the largest
   single attribution lever in this spec** — without AM, every browser event
   matches on cookies only, which fail under ITP / Brave / ad-blockers / device
   switches. With AM, Meta matches events to user profiles directly via hashed
   PII. See §2.2 item 1 and Phase 1 for details.
5. Renewals are NOT sent as Purchase (Meta best practice — already followed).

References:
- [Meta — Handling Duplicate Pixel and Conversions API Events](https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events/)
- [Meta — About Deduplication for Pixel and Conversions API](https://www.facebook.com/business/help/823677331451951)
- [Meta — Advanced Matching for the Meta Pixel](https://developers.facebook.com/docs/meta-pixel/advanced/advanced-matching)
- [Meta — Conversions API customer information parameters](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters)
- [Meta — Event Match Quality (EMQ) score](https://www.facebook.com/business/help/765081237991954)
- [Meta — Standard events catalog](https://developers.facebook.com/docs/meta-pixel/reference)

---

## 2. Current state — audit summary

### 2.1 Per-flow eventId / dedup audit

`event_id` is correct in every flow we send today. Note that **one-time packages and "additional one-time packages" are the same product type** — they just have two purchase surfaces: a first-time purchase via `MembershipModal` (alongside memberships) and a subsequent purchase via `SpecialPackagesModal` (the post-membership upsell offer).

| Flow | Surface | Browser eventId | Server eventId | Dedup |
|---|---|---|---|---|
| Membership purchase (first-time, auto-login) | [MembershipModal.handlePaymentSuccess](../../src/components/modals/MembershipModal.tsx) | `paymentIntentId` | `paymentIntentId.trim()` ([payment-processing.ts:1398](../../src/utils/payment/payment-processing.ts#L1398)) | ✅ |
| Membership purchase (logged-in) | [MembershipModal.handlePaymentProcessingSuccess](../../src/components/modals/MembershipModal.tsx) + [PaymentProcessingScreen.tsx:175](../../src/components/loading/PaymentProcessingScreen.tsx#L175) | `paymentIntentId` | `paymentIntentId.trim()` | ✅ |
| Initial one-time package (first-time, auto-login) | `MembershipModal.handlePaymentSuccess` (same modal serves both) | `paymentIntentId` | `paymentIntentId.trim()` | ✅ |
| Initial one-time package (logged-in) | `MembershipModal.handlePaymentProcessingSuccess` | `paymentIntentId` | `paymentIntentId.trim()` | ✅ |
| Additional one-time package (post-membership upsell offer) | [SpecialPackagesModal.handlePaymentSuccess](../../src/components/modals/SpecialPackagesModal.tsx) | `paymentIntentId` | `paymentIntentId.trim()` | ✅ |
| Mini-draw purchase | [MiniDrawPackages.tsx](../../src/components/features/MiniDrawPackages.tsx) + [MiniDrawSuccessClient.tsx](../../src/app/(site)/mini-draw-success/components/MiniDrawSuccessClient.tsx) | `paymentIntentId` | `paymentIntentId.trim()` | ✅ |
| Upsell purchase | [UpsellModal.tsx](../../src/components/modals/UpsellModal.tsx) + [UpsellSuccessClient.tsx](../../src/app/(site)/upsell-success/components/UpsellSuccessClient.tsx) | `paymentIntentId` | `paymentIntentId.trim()` | ✅ |
| Shop checkout | [CheckoutSuccessClient.tsx:42](../../src/app/(site)/checkout/success/components/CheckoutSuccessClient.tsx#L42) | `order.orderNumber ?? orderId` | **none — no CAPI fire** | ❌ |
| Subscription renewal | n/a | not fired (correct) | not fired (correct) | n/a |

**Coverage matrix** (browser × server, one row per *product type*):

| Product type | Browser Pixel | Server CAPI |
|---|---|---|
| Membership | ✅ All flows (after the 2026-05-12 modal-handler patches) | ✅ webhook `grantBenefits` → `trackPixelPurchase` |
| One-time package (initial OR additional) | ✅ All flows | ✅ webhook |
| Mini-draw | ✅ All flows | ✅ webhook |
| Upsell | ✅ All flows | ✅ webhook |
| Shop order | ✅ on success page | ❌ **gap** |
| Subscription renewal | n/a (intentionally suppressed) | n/a |

### 2.2 What's broken

**1. No Advanced Matching on browser init — biggest single EMQ lever.** [providers/facebook.ts:64](../../src/lib/tracking/providers/facebook.ts#L64) and [FacebookPixel.tsx:236](../../src/components/FacebookPixel.tsx#L236) both call `fbq('init', pixelId)` with no Advanced Matching (AM) object.

Why this is the highest-impact change:
- Without AM, browser events only match users on `_fbp` / `_fbc` cookies. These are blocked by ITP (Safari), Enhanced Tracking Protection (Firefox), Brave, every ad-blocker, every "Clear browsing data," and every device switch.
- With AM, **every** event we fire — PageView, ViewContent, InitiateCheckout, AddPaymentInfo, Purchase, CompleteRegistration — automatically includes hashed PII that Meta matches against their user graph. This is how Meta does cross-device attribution and post-cookie attribution.
- AM is set **once at init time** and applies to every subsequent `fbq('track', ...)` call. One change, every event benefits.
- Server CAPI already passes hashed PII via `user_data`. So today the server side has high EMQ and the browser side doesn't — a parity gap that lowers the overall Diagnostics score.

Fields Meta accepts in AM (the second arg of `fbq('init', pixelId, AM_OBJECT)`):

| Field | What it is | Where we have it |
|---|---|---|
| `em` | email (lowercase, trimmed, SHA-256) | `session.user.email` |
| `fn` | first name (lowercase, trimmed, SHA-256) | `user.firstName` |
| `ln` | last name | `user.lastName` |
| `ph` | phone digits-only, SHA-256 | `user.phone` |
| `ge` | gender `m`/`f`, SHA-256 | not collected today (skip) |
| `db` | dob `YYYYMMDD`, SHA-256 | `user.birthdate` |
| `ct` | city, SHA-256 | usually not on user record (skip) |
| `st` | state, 2-letter, SHA-256 | `user.state` |
| `zp` | zip / postcode, SHA-256 | not always present |
| `country` | 2-letter ISO, lowercase, SHA-256 | `"au"` default |
| `external_id` | stable user id (hashed or plain) | `user._id` |

Reference: [Meta — Advanced Matching for the Meta Pixel](https://developers.facebook.com/docs/meta-pixel/advanced/advanced-matching). Meta's pixel docs also note that AM should be re-set on login (when a guest signs in mid-session) using the same `fbq('init', pixelId, AM_OBJECT)` call — `fbq.init` is idempotent and updates AM in place.

**2. Shop checkout is browser-only.** Any ad-blocker user who buys merch is invisible to Meta. No CAPI counterpart anywhere in `src/app/api/orders/**`, `src/app/api/cart/**`, or the Stripe webhook.

**3. `package_type` is dropped on browser.** [providers/facebook.ts:96-105](../../src/lib/tracking/providers/facebook.ts#L96-L105) doesn't map `customData.packageType`. Server sends it ([providers/facebook.ts:175](../../src/lib/tracking/providers/facebook.ts#L175)), browser silently doesn't.

**4. Browser callers don't pass `content_ids` / `num_items`.** Server's `trackPixelPurchase` ([pixel-purchase-tracking.ts:165-172](../../src/utils/tracking/pixel-purchase-tracking.ts#L165-L172)) adds them; browser callers don't. Diagnostics will flag the mismatch.

**5. Synthetic UA fallback hurts EMQ.** [facebook.ts:314](../../src/lib/facebook.ts#L314) uses `"Mozilla/5.0 (compatible; Server-Side-CAPI/1.0)"` whenever `client_user_agent` is missing. Meta detects the placeholder and downgrades match quality.

**6. Membership Purchase fires twice from browser.** [PaymentProcessingScreen.tsx:175](../../src/components/loading/PaymentProcessingScreen.tsx#L175) and [MembershipModal.tsx:2391](../../src/components/modals/MembershipModal.tsx#L2391) both fire on the same purchase. Same `event_id` so Meta dedups, but the second fire is wasted.

**7. Legacy `/api/facebook/track` shim has no callers.** Grep confirms zero browser/server callers. The route, its `_legacyUserData` escape hatch in `capiSend` ([providers/facebook.ts:131-157](../../src/lib/tracking/providers/facebook.ts#L131-L157)), and the related complexity can be deleted.

---

## 3. Changes — grouped into shippable phases

Each phase is independently mergeable and produces a measurable result.

### Phase 1 — Advanced Matching on browser pixel  *(P0 — highest-impact change)*

**Goal:** Lift EMQ on **every** browser-fired event (PageView, ViewContent, InitiateCheckout, AddPaymentInfo, Purchase, CompleteRegistration, …) in a single change by passing hashed PII to `fbq('init', ...)`. This is the largest single attribution improvement available — see §2.2 item 1 for the rationale.

**Architecture:**

1. **AM is set once at init time, but `fbq.init` is idempotent.** That means we set it twice:
   - **Anonymous load:** when the pixel first loads (guest), pass nothing or only `{ external_id }` if we have a stable anonymous id. Subsequent events match on cookies only.
   - **Post-login re-init:** when `next-auth` session resolves with a real user, call `fbq('init', pixelId, AM_OBJECT)` again with the user's hashed PII. From that moment, every subsequent event includes AM.
2. **Hash client-side using the existing helper** [`hashData`](../../src/lib/facebook.ts#L90) — Meta accepts unhashed values too and auto-hashes them, but explicit hashing is the safer convention and matches our server-side `hashPII` ([canonical-event.ts](../../src/lib/tracking/canonical-event.ts)) so the hash format is identical on both sides → Meta deduplicates user identity correctly across browser and server.

**Fields to send (subset of [Meta's AM list](https://developers.facebook.com/docs/meta-pixel/advanced/advanced-matching), only the ones we actually collect):**

```ts
{
  em: hashData(user.email.toLowerCase().trim()),
  fn: user.firstName ? hashData(user.firstName.toLowerCase().trim()) : undefined,
  ln: user.lastName ? hashData(user.lastName.toLowerCase().trim()) : undefined,
  ph: user.phone ? hashData(user.phone.replace(/\D/g, "")) : undefined,
  db: user.birthdate ? hashData(formatYYYYMMDD(user.birthdate)) : undefined,
  st: user.state ? hashData(user.state.toLowerCase().trim()) : undefined,
  country: hashData("au"),
  external_id: hashData(user._id),
}
```

Omit any `undefined` field — sending `em: undefined` confuses Meta's validator.

**Edits:**

- [src/lib/tracking/providers/facebook.ts:42-69](../../src/lib/tracking/providers/facebook.ts#L42) — `loadPixel` accepts an optional `advancedMatching?: AdvancedMatchingFields` arg. When present, the inline init script string becomes `fbq('init', '${pixelId}', ${JSON.stringify(am)})` instead of plain `fbq('init', '${pixelId}')`.
- New `<ConversionPixels />` child or sibling component that subscribes to `useSession()` (next-auth) and, when the session flips from guest → authenticated, calls `window.fbq('init', pixelId, AM_OBJECT)` directly to re-init AM in place. This requires the FB pixel to already be loaded — guard on `window.fbq && (window.fbq as any).loaded`.
- [src/components/FacebookPixel.tsx:236](../../src/components/FacebookPixel.tsx#L236) — same change to the legacy inline init script (the facade still injects this). Since `<FacebookPixel>` is mounted above `<UserProvider>` in the tree (per its own comment at [FacebookPixel.tsx:92](../../src/components/FacebookPixel.tsx#L92)), initial mount can't see the session — that's why the re-init on login is the canonical place to pass AM.
- Add a tiny helper `src/lib/tracking/advanced-matching.ts` that takes a `User` and returns a clean `AdvancedMatchingFields` object with undefined fields stripped. Same helper used by the inline script and the re-init effect.

**Acceptance:** After deploy:
- Events Manager → Diagnostics → **Event Match Quality** column shows ≥ 7.0 ("Good") for browser-source Purchase, ViewContent, and CompleteRegistration within 7 days.
- Events Manager → **Connection Method** shows "Advanced Matching: Manual (em, ph, ...)" instead of "None" for browser events from authenticated sessions.

**Risks / non-issues:**

- *"Will this leak PII?"* No — fields are SHA-256 hashed client-side before they reach Meta. The hashed values can't be reversed.
- *"Will Diagnostics flag a mismatch between browser AM hashes and server user_data hashes?"* No, provided both use the same normalization (lowercase, trimmed). Using the same `hashData` helper on both sides guarantees this.
- *"Does this conflict with the existing Facebook Pixel Helper extension?"* No — AM is what the extension's "Advanced Matching" tab inspects. Today it shows "off"; after Phase 1 it will show every field we pass.

### Phase 2 — Shop checkout CAPI fire  *(P0)*

**Goal:** Close the attribution gap for shop orders. Decision needed (see §4) on
whether to fire from the Stripe webhook or from the order-completion route.

**Edits (assuming webhook path):**

- [src/app/api/stripe/webhook/route.ts:780-844](../../src/app/api/stripe/webhook/route.ts#L780) — extend the `payment_intent.succeeded` branch to handle `paymentType === "shop"` (or whatever marker shop PIs carry).
- New helper `handleShopOrderWebhook(pi)` calls `trackPixelPurchase` with `orderId = order.orderNumber`, `userEmail`, `userId`, `clientIpAddress` + `clientUserAgent` from the saved order metadata (NOT from the webhook request).
- Idempotency: existing `ProcessedStripeEvent` guard already prevents double-fire on webhook retry.
- Browser side ([CheckoutSuccessClient.tsx:42](../../src/app/(site)/checkout/success/components/CheckoutSuccessClient.tsx#L42)) — verify `order.orderNumber` is what the server-side helper resolves to. If yes, no edit needed. If the server uses Mongo `_id` instead, align them.

**Acceptance:** Events Manager → Test Events shows matching browser + CAPI Purchase
events for a test shop order, deduped to 1 in the Overview tab.

### Phase 3 — Parameter parity on `custom_data`  *(P0 + P1 combined)*

**Goal:** Make every browser Purchase send the same `custom_data` shape as its
CAPI counterpart.

**Edits:**

- [src/lib/tracking/providers/facebook.ts:96-105](../../src/lib/tracking/providers/facebook.ts#L96-L105) — add the missing mapping: `if (event.customData?.packageType) customData.package_type = event.customData.packageType;`
- Each browser Purchase site — pass `contentIds: [packageId]` and `numItems: 1` to `buildPurchaseEvent`:
  - [src/components/modals/MembershipModal.tsx:2391, 2659](../../src/components/modals/MembershipModal.tsx#L2391)
  - [src/components/modals/UpsellModal.tsx:716](../../src/components/modals/UpsellModal.tsx#L716)
  - [src/components/features/MiniDrawPackages.tsx:409](../../src/components/features/MiniDrawPackages.tsx#L409)
  - [src/app/(site)/mini-draw-success/components/MiniDrawSuccessClient.tsx:32](../../src/app/(site)/mini-draw-success/components/MiniDrawSuccessClient.tsx#L32)
  - [src/app/(site)/upsell-success/components/UpsellSuccessClient.tsx:33](../../src/app/(site)/upsell-success/components/UpsellSuccessClient.tsx#L33)
  - [src/app/(site)/purchase-success/components/PurchaseSuccessClient.tsx:37](../../src/app/(site)/purchase-success/components/PurchaseSuccessClient.tsx#L37)
- Shop checkout already passes `numItems: order.items?.length` and doesn't have a `packageId`. Leave `content_ids` unset on both sides for shop — or pass `content_ids: order.items.map(i => i.productId)` on both sides.

**Acceptance:** Events Manager → Diagnostics shows zero "parameter mismatch"
warnings on Purchase within 24h of deploy.

### Phase 4 — Real user-agent forwarding  *(P1)*

**Goal:** Stop sending the synthetic UA on webhook-driven CAPI events. Real UA strings improve match quality and let Meta cluster device-class signals (desktop vs mobile, browser version, OS) for ad-set optimization.

**Edits:**

- [src/utils/payment/payment-processing.ts:1398](../../src/utils/payment/payment-processing.ts#L1398) — when `grantBenefits` calls `trackPixelPurchase`, populate `requestContext.client_user_agent` with the real UA. For webhook-driven calls, store the original purchase UA on the `Order` / payment record at creation time (when the user's request still has it) and read it back here. Webhook `request.headers.get('user-agent')` is `Stripe/1.0` — that's worse than the synthetic.
- [src/lib/facebook.ts:314, 198, 326](../../src/lib/facebook.ts#L314) and [src/utils/tracking/pixel-purchase-tracking.ts:531, 624, 692](../../src/utils/tracking/pixel-purchase-tracking.ts#L531) — remove the `"Mozilla/5.0 (compatible; Server-Side-CAPI/1.0)"` fallback. If UA is missing, send no `client_user_agent` field (Meta accepts the event, just with lower EMQ).

**Acceptance:** Sampled CAPI events in Test Events tab show real browser UA strings (e.g. `"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) ..."`), not the synthetic placeholder. Diagnostics → Event Match Quality column for server-source Purchase climbs from current baseline.

> Note: the debug `console.error("[DEBUG fb.pixelTrack] …")` lines were removed in commit `<pending>` after staging verification — already done before this spec's Phase 4 ships.

### Phase 5 — Cleanup  *(P2 — optional, low priority)*

**Goal:** Remove dead code so the next person reading this isn't confused by
two parallel paths.

**Edits:**

- Delete [src/app/api/facebook/track/route.ts](../../src/app/api/facebook/track/route.ts) entirely (zero callers, confirmed by grep).
- Remove the `_legacyUserData` escape hatch in [providers/facebook.ts:131-157](../../src/lib/tracking/providers/facebook.ts#L131-L157) — only the deleted route used it.
- Pick one membership browser fire and remove the other: keep `MembershipModal.tsx:2391` (owns the success state); remove [PaymentProcessingScreen.tsx:175](../../src/components/loading/PaymentProcessingScreen.tsx#L175).
- Delete the now-unused `trackPurchaseWithEventId` helper at [FacebookPixel.tsx:478](../../src/components/FacebookPixel.tsx#L478) if no other caller appears.

**Acceptance:** `npm run lint` and `npm run type-check` pass; no behavioral
change visible in Events Manager.

### Phase 6 — Other event-type parity (audit + targeted fixes)  *(P1)*

**Goal:** Verify the *other* Meta standard events we fire are also correctly dual-fired and parameter-matched. This spec is named "Purchase parity" but Meta's optimisation surface uses all events in the conversion funnel, and AM (Phase 1) lifts all of them at once — so it's worth a one-pass audit.

**Per-event status (today):**

| Event | Browser fire site | Server CAPI fire site | Status |
|---|---|---|---|
| `PageView` | inline init script in [providers/facebook.ts:64](../../src/lib/tracking/providers/facebook.ts#L64) + SPA route-change in [ConversionPixels.tsx](../../src/components/tracking/ConversionPixels.tsx) | not fired (browser-only is fine for PageView) | ✅ |
| `ViewContent` | [ProductViewTracking.tsx](../../src/app/(site)/shop/[slug]/components/ProductViewTracking.tsx), [MiniDrawViewTracking.tsx](../../src/app/(site)/mini-draws/[id]/components/MiniDrawViewTracking.tsx) | not fired | ⚠ browser-only; CAPI parity would help cross-device attribution but lower priority than Purchase |
| `InitiateCheckout` | [MembershipModal.tsx:3057](../../src/components/modals/MembershipModal.tsx#L3057) via `usePixelTracking` | not fired | ⚠ browser-only; same as above |
| `AddPaymentInfo` | helper exists ([FacebookPixel.tsx:648](../../src/components/FacebookPixel.tsx#L648)) but **no callers** | not fired | ❌ not fired at all today |
| `CompleteRegistration` | [FacebookPixel.tsx.trackCompleteRegistration](../../src/components/FacebookPixel.tsx) | [register/route.ts:348,469,561,763](../../src/app/api/auth/register/route.ts) | ✅ dual-fired (verified — Meta Events Manager shows "Multiple" source for this event with both Browser + Server) |
| `Lead` | helper exists, no callers | not fired | ❌ not fired |
| `Subscribe` | helper exists, called from `pixel-purchase-tracking.ts` for subscription Subscribe/Unsubscribe | CAPI side via `sendFacebookEvent` | ✅ dual-fired |
| `AddToCart` | helper exists, no shop callers today | not fired | ❌ not fired (shop hasn't wired it) |
| `RemoveFromCart` | helper exists, no callers | not fired | ❌ not fired |

**Recommended targeted fixes (P1, after Phase 1 ships):**

1. **`AddPaymentInfo` should fire** from `StripePaymentForm` / `MembershipModal` once the user enters card details and the Stripe Element validates. Browser-only is fine. Use `usePixelTracking().trackAddPaymentInfo` (already exists). Eventid = `addpaymentinfo-${paymentIntentId}` for dedup against retries.
2. **`InitiateCheckout` should ALSO fire from the new-user signup flow** (today it fires from `MembershipModal.tsx:3057` but that's the existing-user path). Same helper.
3. **CAPI parity for `InitiateCheckout` + `ViewContent`** — lower priority but worth doing once Phase 1 + 2 are live. Both improve cross-device retargeting. Use `trackConversion` from the dispatcher; CAPI side will fan out automatically when the `Facebook` provider receives a non-Purchase event (no changes needed to the provider itself; the existing `pixelTrack` and `capiSend` already accept any `eventName`).

References:
- [Meta — Standard events](https://developers.facebook.com/docs/meta-pixel/reference)
- [Meta — Server event parameters](https://developers.facebook.com/docs/marketing-api/conversions-api/parameters)
- [Meta — When to use Pixel + CAPI for each event type](https://www.facebook.com/business/help/308855623839366)

**Acceptance:** Each event in the table above shows up in Test Events with the expected source. `AddPaymentInfo` appears at least once per test purchase. `InitiateCheckout` appears for both first-time and existing-user purchase attempts.

---

## 4. Open questions before Phase 2

1. **Where do shop PaymentIntents carry their type marker?** We need a reliable way for the webhook to say "this PI is a shop order, fire a Purchase CAPI." Options:
   - PI metadata `paymentType: "shop"` set at intent creation in `/api/payment-intent`
   - Inferred from existence of an `Order` record matching the PI
2. **Is `order.orderNumber` always set by the time the webhook fires?** If orders are created lazily on success, the webhook fires before `orderNumber` exists, and we'd need to use the PI id as `event_id` on both sides instead. Browser side must then also use the PI id.
3. **Phase 1 — where do we read the active session at pixel-init time?** `FacebookPixel` mounts above `UserProvider` in the tree (per its own comment at [FacebookPixel.tsx:92-94](../../src/components/FacebookPixel.tsx#L92)). Either (a) move `FacebookPixel` below `UserProvider`, or (b) read `next-auth` session in the layout that mounts it and pass props.

---

## 5. Out of scope

- TikTok Pixel + CAPI parity (different system, separate audit if needed — see `docs/superpowers/specs/2026-05-11-tracking-provider-registry-design.md` for the planned Spec B).
- Snapchat Pixel + CAPI parity (planned Spec C).
- Klaviyo (not a CAPI provider).
- **Implementing** new event types (`Lead`, `AddPaymentInfo` callers, shop `AddToCart`, etc.) — Phase 6 only **audits** their current state and lists targeted fixes; the actual implementations are deferred to follow-up specs unless trivially small.
- A/B test instrumentation around these changes — too speculative; ship and measure with Diagnostics.

---

## 6. Verification plan

After each phase:

1. Trigger one purchase per flow against staging with a real test card.
2. In Meta Events Manager → **Test Events** tab (using `FACEBOOK_TEST_EVENT_CODE`):
   - Confirm browser + CAPI Purchase appear with the **same `event_id`**.
   - Confirm `custom_data` matches between the two rows.
3. Wait 24h, then in **Diagnostics** tab:
   - Confirm no new "parameter mismatch" warnings appear.
   - Confirm EMQ score for Purchase ≥ 7.0.

**Phase-specific additions:**

- **After Phase 1** (Advanced Matching):
  - Install the [Meta Pixel Helper](https://chromewebstore.google.com/detail/meta-pixel-helper) Chrome extension.
  - Log into staging as a test user → open the extension popup → expand the Purchase event → **"Advanced Matching"** tab should show every field we configured (`em`, `external_id`, etc.) populated with hex hashes.
  - Logout → AM tab on subsequent events should be empty.
  - Login again → AM tab should re-populate (verifies the re-init path).
  - 7 days later in Diagnostics, EMQ for browser-source events should climb visibly. Document the before / after numbers.
- **After Phase 2** (shop CAPI):
  - Place a test shop order on staging. Both browser (`CheckoutSuccessClient`) and server (webhook) Purchase events should appear in Test Events with matching `event_id = order.orderNumber`.
- **After Phase 5** (cleanup):
  - `npm run test:facebook-capi`, `npm run test:tracking-dispatch`, and `npm run type-check` all pass.
  - `grep -r '/api/facebook/track' src/` returns zero hits.
- **After Phase 6** (other-event audit fixes):
  - `AddPaymentInfo` appears at least once per test purchase attempt.
  - `InitiateCheckout` appears for both first-time signup-and-buy AND existing-user purchase.
  - `CompleteRegistration` continues to show "Multiple" source (regression check).

If any acceptance criterion fails, do not advance to the next phase.
