# Cancellation Flow

Covers the in-app cancellation retention flow: reason capture, offer routing, and event persistence.

## Reason → Offer Routing

`src/utils/subscription/cancellation-flow-routing.ts` exports `resolveOfferSequence(reason)`, a pure function that maps a `CancellationReason` to an ordered `OfferType[]`.

### Routing table

| Reason | Lead offer(s) | Full sequence |
|---|---|---|
| `too_expensive` | `discount_50_2mo` | `discount_50_2mo` → `bonus_entries_100` |
| `prefer_cheaper` | `tier_downgrade` | `tier_downgrade` → `bonus_entries_100` |
| `dont_use_benefits` | `pause_30d` | `pause_30d` → `bonus_entries_100` |
| `too_many_messages` | `unsubscribe_marketing` | `unsubscribe_marketing` → `bonus_entries_100` |
| `joined_for_giveaway` | `bonus_entries_100` | `bonus_entries_100` |
| `havent_won` | `bonus_entries_100` | `bonus_entries_100` |
| `other` | `pause_30d`, `discount_50_2mo` | `pause_30d` → `discount_50_2mo` → `bonus_entries_100` |

### Universal final rung rule

`bonus_entries_100` is appended as the last offer for every reason **except** when it is already the sole lead offer (`joined_for_giveaway`, `havent_won`). Those reasons return `["bonus_entries_100"]` directly — no duplication.

### Types

`CancellationReason` and `OfferType` are defined in `src/models/CancellationFlowEvent.ts` alongside the Mongoose schema and outcome enum.

## Eligibility filter

`src/utils/subscription/cancellation-flow-eligibility.ts` exports `eligibleOffers(sequence, ctx)`, a pure function that reduces the offer sequence from `resolveOfferSequence` to only the offers that can actually be shown to a member.

### Rules (in order of evaluation)

1. **Past-due → none** — if `ctx.pastDue` is `true`, returns `[]` immediately (spec §3a). Members with a past-due balance skip all retention rungs.
2. **IMPLEMENTED_OFFERS gate** — only offers whose backend is fully shipped are shown. `IMPLEMENTED_OFFERS` is a `ReadonlySet<OfferType>`. As of Phase 5 all `OfferType`s are implemented — `{ bonus_entries_100, tier_downgrade, pause_30d, discount_50_2mo, unsubscribe_marketing }` — so this gate no longer filters anything in practice. It is retained as the structural guard for any future `OfferType` addition.
3. **One-time consumed gate** — certain offers may only be accepted once per member. `ConsumedFlags` tracks redemption state; `bonus_entries_100` maps to the legacy field `user.cancellationUpsellRedeemed`, `pause_30d` maps to `consumed.pause30d` (← `user.retentionOffersConsumed.pause30d`), `discount_50_2mo` maps to `consumed.discount50_2mo` (← `user.retentionOffersConsumed.discount50_2mo`). If the flag is set, the offer is filtered out. `tier_downgrade` and `unsubscribe_marketing` are not one-time gated (no entry in `ONE_TIME`).

### Types

```ts
interface ConsumedFlags {
  pause30d?: boolean;
  discount50_2mo?: boolean;
  bonusEntries100?: boolean; // sourced from legacy user.cancellationUpsellRedeemed
}
interface EligibilityCtx {
  pastDue: boolean;
  consumed: ConsumedFlags;
}
```

## Event model

`CancellationFlowEvent` (see `src/models/CancellationFlowEvent.ts`) records each flow session:
- `reason` + optional `reasonText`
- `offersShown` — ordered array matching `resolveOfferSequence` output
- `offerAccepted` — which offer the member accepted (or `null`)
- `outcome` — `in_progress | saved | cancelled`
- `pastDue` flag
- `retention90` — back-filled after 90 days (`retained | churned | null`)

## CancellationFlowService

`src/services/subscription/CancellationFlowService.ts` composes the routing and eligibility utilities and owns the event lifecycle.

### Pure surface

`planFlow({ reason, pastDue, consumed }) → { offersShown, pastDue }`

Calls `resolveOfferSequence(reason)` then `eligibleOffers(sequence, { pastDue, consumed })`. No DB access — unit-testable in isolation (`npm run test:cancellation-flow-service`).

### Lifecycle (DB)

`startFlow({ userId, reason, reasonText?, pastDue, offersShown }) → Promise<string>`

Creates a `CancellationFlowEvent` document with `outcome: "in_progress"` and `startedAt: new Date()`. Returns the event `_id` as a string. Callers store this id to pass to `recordOutcome`.

`recordOutcome({ eventId, userId, outcome, offerAccepted? }) → Promise<void>`

Idempotent terminal transition. Uses `updateOne({ _id, userId, outcome: "in_progress" }, { $set: { outcome, offerAccepted, endedAt, [savedAt] } })`. The `outcome: "in_progress"` filter guarantees exactly one terminal write per event — subsequent calls on an already-terminal event are silently ignored (no-op). `savedAt` is set only when `outcome === "saved"`.

### User context (DB)

`getUserCancellationContext(userId) → Promise<{ pastDue: boolean; consumed: ConsumedFlags }>`

Loads the User by id and derives:
- `pastDue` — via `hasFailedRenewal(user)` (`src/utils/subscription/subscription-helpers.ts:31`): `status === "past_due" && !isActive && autoRenew === true`. This is the same predicate used in `SubscriptionManagementModal/index.tsx:120`.
- `consumed`:
  - `pause30d` ← `user.retentionOffersConsumed?.pause30d`
  - `discount50_2mo` ← `user.retentionOffersConsumed?.discount50_2mo`
  - `bonusEntries100` ← `user.cancellationUpsellRedeemed` (legacy field; see `User.ts:181`)

Throws `new Error("user not found")` when the userId does not match any document. Route handlers should map this to a 404 response.

### Accept-offer (DB + Stripe)

`acceptOffer({ userId, eventId, offer }) → Promise<{ resumesAt?: string; couponId?: string }>`

Supported offers: `pause_30d`, `discount_50_2mo`, and `unsubscribe_marketing`. All `OfferType`s with a service-side side-effect are handled; `bonus_entries_100` is accepted via its own `/api/cancellation-upsell/redeem` endpoint and `tier_downgrade` via the downgrade flow — see the outcome-recording invariant. Any value not matching a branch still throws `AcceptOfferError("unsupported offer", 400)`, but with all `OfferType`s handled this is now unreachable for valid input.

- `pause_30d`: calls `applyRetentionPause(userId)` (`RetentionPauseService`); on success calls `recordOutcome({ eventId, userId, outcome:"saved", offerAccepted:"pause_30d" })` and returns `{ resumesAt }`.
- `discount_50_2mo`: calls `applyRetentionDiscount(userId)` (`RetentionDiscountService`); on success calls `recordOutcome({ eventId, userId, outcome:"saved", offerAccepted:"discount_50_2mo" })` and returns `{ couponId }`.
- `unsubscribe_marketing`: calls `applyMarketingUnsubscribe(userId)` (`RetentionUnsubscribeService`); on success calls `recordOutcome({ eventId, userId, outcome:"saved", offerAccepted:"unsubscribe_marketing" })` and returns `{}` (no extra data — the route spreads it as `{ ok: true }`). **No past-due guard and no one-time-consumed guard** — unsubscribing from marketing is harmless even when past-due and is not in the `ONE_TIME` map (idempotent). The only thrown message is `"user not found"` (→ 404 via the shared mapper); anything else is an unwrapped 500.

Both services' typed-error messages are mapped to an HTTP status by the **shared** private helper `retentionOfferErrorToStatus` (covers both the pause and discount message sets in one switch, keeping the error→status contract DRY) and re-thrown as `AcceptOfferError(message, status)`; a `500`-class (unmatched) error is re-thrown unwrapped so the route's generic handler logs and returns 500. See the route's "`accept_offer` error → HTTP status map" table below for the exact mapping.

`AcceptOfferError extends Error` carries `{ status: number }` so the route stays thin (single `instanceof` check, no business logic).

## API route

### `POST /api/subscription/cancellation-flow`

**Auth:** NextAuth session required (`session.user.id`). Returns `401` if unauthenticated.

**Content-Type:** `application/json`

#### Action: `start`

Begin a cancellation flow for the authenticated user. Resolves offers and persists a `CancellationFlowEvent` with `outcome: "in_progress"`.

Request body:
```json
{
  "action": "start",
  "reason": "too_expensive",       // CancellationReason (required)
  "reasonText": "..."              // string, max 2000 chars; REQUIRED (non-empty) when reason === "other", optional otherwise
}
```

Validation: a `Body.superRefine` rejects `{ action:"start", reason:"other" }`
when `reasonText` is missing/blank (400) — so an "other" event always carries
its explanation for admin.

Success response `200`:
```json
{
  "eventId": "<ObjectId string>",
  "offersShown": ["bonus_entries_100"],
  "pastDue": false
}
```

#### Action: `outcome`

Record the terminal outcome for an in-progress flow event. Idempotent — subsequent calls on an already-terminal event are silently ignored.

Request body:
```json
{
  "action": "outcome",
  "eventId": "<ObjectId string>",  // must be a valid MongoDB ObjectId (boundary-validated)
  "outcome": "saved",              // "saved" | "cancelled" (required)
  "offerAccepted": "bonus_entries_100"  // OfferType (optional)
}
```

Success response `200`:
```json
{ "ok": true }
```

#### Action: `accept_offer`

Accept a retention offer that has its own side-effect (no pre-existing endpoint). Supported offers: `pause_30d`, `discount_50_2mo`, and `unsubscribe_marketing`. All `OfferType`s with a service-side side-effect are handled; an unhandled value would return `400 {"error":"unsupported offer"}` but this is unreachable for valid input.

Request body:
```json
{
  "action": "accept_offer",
  "eventId": "<ObjectId string>",       // must be a valid MongoDB ObjectId (boundary-validated)
  "offer": "pause_30d"                  // OfferType: "pause_30d" | "discount_50_2mo" | "unsubscribe_marketing"
}
```

`pause_30d` flow (`CancellationFlowService.acceptOffer`):
1. `applyRetentionPause(userId)` — pauses the Stripe subscription 30 days (`behavior:"void"`, `metadata.pauseReason="retention"`).
2. On success, `recordOutcome({ outcome:"saved", offerAccepted:"pause_30d" })` (the same idempotent terminal write used by `outcome`).
3. Returns `{ ok: true, resumesAt: "<ISO-8601>" }`.

`discount_50_2mo` flow (`CancellationFlowService.acceptOffer`):
1. `applyRetentionDiscount(userId)` — attaches the stable singleton 50%-off/2mo coupon to the Stripe subscription.
2. On success, `recordOutcome({ outcome:"saved", offerAccepted:"discount_50_2mo" })`.
3. Returns `{ ok: true, couponId: "retention-50off-2mo" }`.

`unsubscribe_marketing` flow (`CancellationFlowService.acceptOffer`):
1. `applyMarketingUnsubscribe(userId)` — persists `acceptsPromotionalEmail = false` (atomic `updateOne` `$set`) then best-effort `syncKlaviyoEmailMarketingFromAdminPreference(userDoc, false)` (unsubscribes **marketing email + marketing SMS**; transactional / account messages untouched). Klaviyo `success:false` is `console.error`-logged but non-fatal — the DB flag is the source of truth.
2. On success, `recordOutcome({ outcome:"saved", offerAccepted:"unsubscribe_marketing" })`.
3. Returns `{ ok: true }` (no extra data — there is no `resumesAt`/`couponId`).

The route is offer-agnostic: it spreads the service result (`{ ok: true, ...result }`), so `resumesAt` is present for pause, `couponId` for discount. No route schema change is needed for future supported offers — the `AcceptOfferSchema` discriminated-union member already validates `offer` against `OFFER_TYPES`.

Success response `200`:
```json
{ "ok": true, "resumesAt": "2026-06-17T12:00:00.000Z" }
```
or, for `discount_50_2mo`:
```json
{ "ok": true, "couponId": "retention-50off-2mo" }
```
or, for `unsubscribe_marketing`:
```json
{ "ok": true }
```

#### Error responses

| Status | Condition |
|--------|-----------|
| `400`  | JSON parse failure or Zod validation failure (including invalid `eventId` format); **`accept_offer` with an unhandled `offer` → `"unsupported offer"` (unreachable for valid input — all `OfferType`s are handled)** |
| `401`  | No valid session |
| `404`  | `getUserCancellationContext` throws `"user not found"`; **`accept_offer`: `applyRetentionPause` / `applyRetentionDiscount` / `applyMarketingUnsubscribe` throws `"user not found"`** |
| `409`  | **`accept_offer`/`pause_30d`: `applyRetentionPause` throws `"retention pause already used"`, `"past-due: retention pause not allowed"`, or `"no active subscription"`; `accept_offer`/`discount_50_2mo`: `applyRetentionDiscount` throws `"retention discount already used"`, `"past-due: retention discount not allowed"`, or `"no active subscription"`. `unsubscribe_marketing` has NO 409 path (not one-time gated, no past-due guard).** |
| `500`  | Unexpected server error (e.g. Stripe API failure during `applyRetentionPause` / `applyRetentionDiscount`, or a Mongo failure during `applyMarketingUnsubscribe`) |

#### `accept_offer` error → HTTP status map

`acceptOffer` calls `applyRetentionPause` (pause), `applyRetentionDiscount` (discount), or `applyMarketingUnsubscribe` (unsubscribe), which throw typed `Error`s. The **shared** `CancellationFlowService.retentionOfferErrorToStatus` maps the message to a status; the service re-throws as a typed `AcceptOfferError(message, status)`. `applyMarketingUnsubscribe` only ever throws `"user not found"` (→ 404) — it has no 409 cases. The route does a single `instanceof AcceptOfferError` check and echoes `{ error: message }` with `error.status`. A `500`-class message (anything unmatched, e.g. a Stripe failure) is **not** wrapped — the original error re-throws and hits the route's generic 500 handler (`console.error` preserved).

| thrown message | HTTP status |
|---|---|
| `"retention pause already used"` | `409` |
| `"retention discount already used"` | `409` |
| `"past-due: retention pause not allowed"` | `409` |
| `"past-due: retention discount not allowed"` | `409` |
| `"no active subscription"` | `409` |
| `"user not found"` (incl. `applyMarketingUnsubscribe`) | `404` |
| (anything else) | `500` (original error re-thrown, generic handler) |
| `acceptOffer` itself, `offer` an unhandled value | `400` `"unsupported offer"` (unreachable — all `OfferType`s handled) |

#### Boundary validation

The `eventId` field is validated with `mongoose.Types.ObjectId.isValid(v)` at the Zod boundary before it reaches the service. This prevents a BSON cast error from propagating from `recordOutcome` (which calls `new mongoose.Types.ObjectId(eventId)` internally).

#### Implementation file

`src/app/api/subscription/cancellation-flow/route.ts`

The route is thin: authorize (session/401) → parse JSON → Zod validate (discriminated union: `start | outcome | accept_offer`) → delegate to `CancellationFlowService`. Auth is checked first, before any body parsing or DB work. No business logic lives in the handler — the `accept_offer` error→status decision lives in `CancellationFlowService` (`AcceptOfferError.status`); the route only does `instanceof AcceptOfferError → NextResponse.json({error}, {status})`.

---

## CancellationFlowModal (UI)

`src/components/modals/CancellationFlowModal/`

Multi-step modal that replaces the old single-screen `CancellationUpsellModal`.

### Shared primitives (`primitives.tsx`)

`src/components/modals/CancellationFlowModal/primitives.tsx` is a pure presentational module (no business logic, no API calls) that all step components import from to maintain visual consistency. Brand colour `#ee0000` + premium-gold accent; full light/dark support via Tailwind `dark:` variants.

| Export | Purpose |
|---|---|
| `FlowFrame` | Branded header (TA profile logo + "Tools Australia" text + close button) wrapping body slot. The logo is the real Tools Australia profile image — `Social Media Profile_Primary.webp` in light mode (`block dark:hidden`) and `Social Media Profile_Black Background.webp` in dark mode (`hidden dark:block`), rendered via `next/image` at 22 × 22 px with `rounded-[7px]`. Renders an internal trust footer (SSL secure · NTP/16264 · Cancel anytime) by default; pass `trust={false}` to suppress it. `TrustFooter` itself is a private internal component of `FlowFrame` — it is not exported and cannot be used by step components directly. No visible progress indicator — each step renders its own `FlowFrame`. |
| `IconChip` | 46 × 46 px rounded icon container; `tone="red"` (default) or `tone="gold"`. |
| `ValueCard` | Rounded card with subtle shadow; optional `glow` prop adds a gold border gradient. |
| `FeatureRow` | Check-mark row for listing member benefits inside a `ValueCard`. |
| `PrimaryCta` | Full-width red gradient CTA button. Uses the shared `.cf-cta-shine` CSS class (same shine as the membership "Enter Now" button) — the `::after` pseudo-element runs the `ta-enter-shine` keyframe (3.6s ease-in-out infinite). Children are wrapped in `<span className="relative z-[1] inline-flex items-center justify-center gap-2">` to stay above the sweep. Reduced-motion gated. |
| `TextDecline` | Underlined "no thanks" link-style button below `PrimaryCta`. |
| `UrgencyStrip` | Gold persuasion strip with star icon — used once per screen maximum. |
| `Headline` | `<h2>` at 23 px extrabold. Accepts `className`. |
| `SubCopy` | 13 px body paragraph. Accepts `className`. |
| `Eyebrow` | 10.5 px uppercase red label above headlines. Accepts `className`. |

These primitives replace the old in-modal `upsell-shell` (`InfoGrid` / `UrgencyBanner` / `TrustBar`) usage. The `upsell-shell` components are not used inside `CancellationFlowModal` steps.

### Responsive presentation

Uses `ModalContainer` (imported from `../ui`):

```tsx
const isNarrowViewport = useMediaQuery("(max-width: 1023px)");
<ModalContainer
  size="2xl"
  presentation={isNarrowViewport ? "sheet" : "dialog"}
  mobileFullBleed
  padding="none"   // on ModalContent — see below
/>
```

- **Mobile + tablet (< `lg`/1024px):** near-fullscreen via `mobileFullBleed`
  (full viewport width, bottom-flush, ~5% gap at the top, `h-[95dvh]`) with the
  slide-up sheet animation.
- **Desktop (≥ `lg`):** centered `2xl` dialog (`max-w-2xl`). The wider size prevents the two-column offer step from wrapping. The `size` prop is only applied at `lg:` and above in `ModalContainer` when `mobileFullBleed` is true (`lg:max-w-2xl`), so mobile/tablet stays full-bleed and unchanged.
- **`ModalContent padding="none"`:** each step owns its own padding via `FlowFrame`. This removes double-padding and lets `FlowFrame`'s internal trust footer sit flush as a real footer instead of floating inside a padded box.

### No progress indicator

`StepIndicator.tsx` has been deleted. The shared `ModalHeader` import is gone from `index.tsx`. Each step owns its branded header via `FlowFrame` — there is no visible step counter or progress bar in the shell.

### Step machine (`useCancellationFlow.ts`)

Plain `useState<FlowState>` — no router/URL state. Located in the modal folder alongside the components it serves.

```ts
FlowState = {
  step: 1 | 2 | 3 | 4;
  reason: CancellationReason | null;
  reasonText: string;
  eventId: string | null;
  offersShown: OfferType[];
  offerCursor: number;
  pastDue: boolean;
  // Terminal save-success fields:
  saveSuccess: boolean;           // renderer checks this FIRST — shows StepSaveSuccess
  acceptedOffer: OfferType | null; // drives success-screen copy
  acceptResult: AcceptResult | null; // couponId / resumesAt from the accept response
}
```

`AcceptResult` is defined in `types.ts` as `{ ok: boolean; resumesAt?: string; couponId?: string }`. It mirrors the accept-offer API response payload without importing any hook.

- **Step 1** — reason capture (7 radio options). "Other" reveals a **mandatory** free-text box: Continue is disabled until it is non-empty (trimmed), and the server rejects `reason="other"` with empty `reasonText` (see API note). Rationale: admin analytics must know what "other" actually means.
- **Step 2 — the OFFER phase (cursor-driven)** — renders `offersShown[offerCursor]` via `Step2Offer`, which dispatches over the current offer via an exhaustive typed `switch` (handles **all 5** `OfferType`s including `bonus_entries_100`). The phase is **not** a fixed step counter: it renders whatever rung the cursor points at, for as many rungs as `offersShown` has (e.g. `other` = 3 rungs: `pause_30d → discount_50_2mo → bonus_entries_100`).
- **Step 3 — retained in the `FlowState.step` union for type-compat but NEVER produced by the step-machine.** The old "step 3 = hardcoded +100 `Step3BonusEntries`" was the multi-rung-skipping bug: for a 3-rung sequence, declining rung 0 jumped straight to a hardcoded +100, skipping the middle rung entirely. `Step3BonusEntries` is still a real component — it is just rendered as the `bonus_entries_100` rung *within* the step-2 OFFER phase (via `Step2Offer`), not as a distinct hardcoded step.
- **Step 4** — confirm cancel or "Keep my membership" (`Step4Confirm`)

Pure transition helpers (exported from `useCancellationFlow.ts`, unit-tested without React in `__tests__/useCancellationFlow.test.ts`):

- `offerPhaseFor(offersShown, cursor) → { step, offerCursor }` — `cursor >= length` → step 4; else step 2. Never returns step 3.
- `nextOfferState(state) → { step, offerCursor }` — the decline reducer: `offerPhaseFor(offersShown, cursor + 1)`.
- `applySaveSuccess(state, offer, result) → FlowState` — pure terminal transition: spreads `state` and sets `saveSuccess: true`, `acceptedOffer: offer`, `acceptResult: result`. Does **not** mutate the input. The `step` field is left unchanged — `saveSuccess` is orthogonal to `step` so the step union is NOT widened. The renderer checks `saveSuccess` first; when true it shows `StepSaveSuccess` regardless of `step`.

`applyStart({ eventId, offersShown, pastDue })` uses `offerPhaseFor(offersShown, 0)`: if `offersShown.length === 0` → step 4 (past-due / no offers); else → step 2 cursor 0.

`decline()` applies `nextOfferState`: from a **non-last** offer → stay step 2 with `offerCursor` advanced (Step2Offer re-renders the next rung — the middle rung of `other` is now reached, not skipped); from the **last** offer → step 4.

`requestExit()` jumps directly to step 4 (used by the ✕ header button).

`markSaved(offer, result)` — hook action (wraps `applySaveSuccess`); called by the offer components after a successful accept API response.

### ✕ button wiring (important — was an "uncloseable" bug)

The header ✕ shows the retention confirm **once**, but must not trap the user:

- **`state.saveSuccess` true** → ✕ closes directly (offer already accepted; no
  more retention loop needed). Guard is prepended first in `handleHeaderClose`.
- **Step 1, no reason picked** → ✕ closes directly (nothing to confirm).
- **Step 1 (reason picked) / Step 2 / Step 3** → ✕ → `requestExit()` (jump to
  the Step 4 confirm so the user sees the "Are you sure?" pitch once).
- **Step 4** → ✕ → `props.onClose()` (**actually closes**).

The previous logic called `requestExit()` even at Step 4 — a no-op loop (you're
already at step 4) — and `closeOnBackdrop` is `false`, so the modal was
**impossible to dismiss** except via the buttons. Step 4's ✕ now closes.
Other direct `onClose` paths: "Keep my membership" (Step 4) and, for past-due,
"Resolve payment" (`onResolvePayment`).

### Past-due variant (§3a)

When the server returns `pastDue: true` (user has a failed renewal), `offersShown` is `[]` (eligibility filter short-circuits). `applyStart` routes directly to step 4 with `state.pastDue = true`. Step 4 renders the past-due variant: primary CTA is "Resolve payment" → `props.onResolvePayment()`, secondary is "Cancel anyway".

### Save Success screen (`StepSaveSuccess`)

`src/components/modals/CancellationFlowModal/StepSaveSuccess.tsx`

Post-accept confirmation screen shown when `state.saveSuccess && state.acceptedOffer` is true. Replaces `renderStep()` in `index.tsx` — the modal stays open and presents a confirmation instead of silently closing.

**Covers:** `discount_50_2mo`, `pause_30d`, `unsubscribe_marketing`, `bonus_entries_100`. **`tier_downgrade` does NOT use this screen** — it exits to the parent downgrade modal via `onRequestTierDowngrade` instead.

Pure presentation — no API calls, no side effects.

| Prop | Type | Purpose |
|---|---|---|
| `offer` | `OfferType` | Drives the bullet-point copy via the internal `lines()` helper |
| `result` | `AcceptResult \| null` | Provides `resumesAt` (pause) / `couponId` (discount) from the accept response |
| `firstName` | `string?` | Personalises the headline (`"You're all set, {name}."`) |
| `onClose` | `() => void` | Passed to `FlowFrame` — closes the modal (no further action) |
| `onDone` | `() => void` | CTA handler — wired to the parent's `onSaved()` callback |

The green check circle uses `motion-safe:animate-[scaleIn_.35s_ease-out]`. The `scaleIn` keyframe is defined in `src/app/globals.css`.

**firstName wiring:** `index.tsx` derives the best-effort first name from `useUserContext()` — identical derivation to `Step1Reason` (`userData?.firstName`, first whitespace token, `undefined` fallback) — and passes it as `firstName` to `StepSaveSuccess`. The modal always renders inside `UserProvider`; no additional fetch or prop threading is required.

**Confetti on mount:** `StepSaveSuccess` calls `useConfetti` and fires a single burst via `useEffect` on mount. The burst is gated: it only fires when `typeof window !== "undefined"` (SSR-safe) AND `window.matchMedia("(prefers-reduced-motion: reduce)").matches` is false. Uses `{ duration: 1500, particleCount: 40, origin: "top" }` — a light single burst, not looping.

### Step 1 — `Step1Reason.tsx`

Restyled onto the shared primitive grammar (`FlowFrame`, `IconChip`, `Headline`, `SubCopy`, `PrimaryCta`). All existing logic is preserved: `selectReason`, `setReasonText`, `applyStart`, `handleContinue`, `handleReasonChange`, `handleTextChange`, `otherTextMissing`, `canContinue`, `isPending`, `isOther`, `REASON_OPTIONS`, the mandatory "Other" free-text + character counter + error.

The `onClose: () => void` prop feeds `FlowFrame`'s ✕ button (wired from `handleHeaderClose` in `index.tsx`).

A best-effort first-name greeting is shown: `useUserContext()` is called unconditionally (safe — `CancellationFlowModal` always renders inside `UserProvider`), then `userData?.firstName` is accessed via optional chaining. If the value is a multi-word string, only the first whitespace-delimited token is used. If the context value is absent the headline falls back to the neutral "Before you go —".

### Step 2 — `Step2Offer.tsx`

Renders the lead offer: `state.offersShown[state.offerCursor]`. Uses an exhaustive typed `switch (offer: OfferType)` with a `never`-guard `default` so TypeScript errors if a new `OfferType` is added without handling it.

**Visual grammar:** all four offer cards (`DiscountOfferCard`, `PauseOfferCard`, `UnsubscribeOfferCard`, `TierDowngradeCard`) are built on the shared primitive grammar (`FlowFrame`/`Eyebrow`/`Headline`/`SubCopy`/`ValueCard`/`FeatureRow`/`PrimaryCta`/`TextDecline`). The old `upsell-shell` `InfoGrid`/`UrgencyBanner`/`TrustBar` and all `lucide-react` icons are not used in this file.

**Eyebrow:** every card shows a `Tailored for you · Offer n of total` eyebrow (`Offer ${offerCursor + 1} of ${offersShown.length}`).

**Desktop layout:** each card uses `lg:grid lg:grid-cols-2 lg:items-center lg:gap-6`: copy + CTA in column 1, `ValueCard` + mobile CTA in column 2.

**`OfferActions` (module-private):** renders a `PrimaryCta` + `TextDecline` pair from props (`acceptLabel`, `onAccept`, `onDecline`, `disabled?`, `declineLabel?`). Each offer card renders `OfferActions` twice — once inside `hidden lg:block` (desktop column 1) and once inside `lg:hidden` (mobile, below the ValueCard) — eliminating duplicated button markup and ensuring the two breakpoint slots cannot drift.

**Props:**
- `onAcceptedOffer: (offer: OfferType, result: AcceptResult | null) => void` — set by `index.tsx` to `flowHook.markSaved`. Called by each card after a successful accept; routes to Save Success. **`tier_downgrade` does NOT call this** — it exits via `onRequestTierDowngrade` instead.
- `onDecline: () => void` — wired to `flowHook.decline` (advances cursor).
- `onClose: () => void` — threaded into each card's `FlowFrame`.
- `tierDowngradeAvailable: boolean` — used by the `tier_downgrade` case.

**Offer cards:**

- `pause_30d` (`PauseOfferCard`) — "Pause 30 days — keep your entries". **Accept** → `useAcceptOffer().mutateAsync({ eventId, offer:"pause_30d" })`; on success → `onAcceptedOffer("pause_30d", result)` → Save Success. The server records the `saved/pause_30d` outcome (server-side, not a client fire-and-forget). **Decline** → `onDecline()`. **409/404 graceful path:** catches the `ApiError`, shows a brief info toast, and calls `onDecline()` so the member advances to the next rung instead of dead-ending. Any other failure shows an error toast and leaves the card in place to retry.

- `discount_50_2mo` (`DiscountOfferCard`) — "50% off for 2 months". **Accept** → `useAcceptOffer().mutateAsync({ eventId, offer:"discount_50_2mo" })`; on success → `onAcceptedOffer("discount_50_2mo", result)` → Save Success. The server records the `saved/discount_50_2mo` outcome. **Decline** → `onDecline()`. **409/404 graceful path:** info toast + `onDecline()`; any other failure → error toast, card stays for retry.

- `unsubscribe_marketing` (`UnsubscribeOfferCard`) — "Get fewer messages instead". Copy is explicit that it switches off **marketing email + marketing SMS only** and that transactional / account messages are **not** affected. **Accept** → `useAcceptOffer().mutateAsync({ eventId, offer:"unsubscribe_marketing" })`; on success → `onAcceptedOffer("unsubscribe_marketing", result)` → Save Success. The server records the `saved/unsubscribe_marketing` outcome. **Decline** → `onDecline()`. **No 409 path** (not one-time gated, no past-due guard); a rare 404/500 → toast + `onDecline()` (graceful, never dead-ends).

- `bonus_entries_100` — delegates to `<Step3BonusEntries>` directly (see below).

- `tier_downgrade` (`TierDowngradeCard`) — dark-themed "Switch to a cheaper plan" card. If `tierDowngradeAvailable` is `false`, renders `<Step3BonusEntries>` instead — no dead card. If `true`, clicking "Switch plan" calls `props.onRequestTierDowngrade?.(state.eventId)` — the outcome mutation is **NOT** fired at this point. The parent stores the `eventId` in `pendingCancellationEventId` and records `{outcome:"saved",offerAccepted:"tier_downgrade"}` only if `handleDowngradeSubscription` succeeds. `tier_downgrade` does NOT call `onAcceptedOffer` and does NOT show the Save Success screen. Decline calls `onDecline()`.

The exhaustive `switch` + `never`-guard `default` is preserved; the `never`-guard is genuinely unreachable for any valid `OfferType` and is kept as a compile-time exhaustiveness safety net for any future `OfferType` addition.

### `Step3BonusEntries.tsx` (the `bonus_entries_100` rung)

Universal "+100 bonus entries — stay active today" rung. **Rendered by `Step2Offer` for the `bonus_entries_100` offer during the cursor-driven step-2 OFFER phase** — it is NOT routed via a hardcoded step 3 (that hardcoding was the multi-rung-skipping bug). It is typically (but not necessarily) the last rung in `offersShown`.

The accept CTA reads **"Keep me in the draw +100 entries"** (non-processing state); processing state shows "Adding bonus entries…". The count is driven by the `BONUS_ENTRIES = 100` constant in the file, rendered as `` `Keep me in the draw +${BONUS_ENTRIES} entries` ``.

Props: `onClose: () => void` and `onAcceptedOffer: (offer: OfferType, result: null) => void`. After the `/api/cancellation-upsell/redeem` POST succeeds and the entry-reward toast fires, the component calls `onAcceptedOffer("bonus_entries_100", null)` (routing to the Save Success screen). The fire-and-forget `outcomeMutation.mutate({ outcome:"saved", offerAccepted:"bonus_entries_100" })` is preserved. **Decline** → `onDecline()` → `decline()` (`nextOfferState`) in the hook → advance cursor; if it was the last rung → Step 4.

Accept flow:
1. POST `/api/cancellation-upsell/redeem` with `credentials:"include"`.
2. `useEntryRewardToast` to show the reward toast.
3. Fire `outcomeMutation.mutate({outcome:"saved",offerAccepted:"bonus_entries_100"})` (fire-and-forget).
4. Call `onAcceptedOffer("bonus_entries_100", null)` → Save Success.

### `Step4Confirm.tsx`

Restyled via the shared primitive grammar. `onClose: () => void` added to `Step4ConfirmProps` — this is `handleHeaderClose` from `index.tsx` and feeds `FlowFrame`'s ✕ button. It is distinct from `modalProps.onClose`, which is the "Keep my membership" handler in the normal variant.

**Normal variant:** `FlowFrame` with `trust={false}` (no TrustFooter), two inline loss cards (Ticket + Trophy), a single `UrgencyStrip`, `PrimaryCta` wired to `modalProps.onClose` ("Keep my membership"), and `TextDecline` wired to `handleCancelAnyway`.

**Past-due variant:** `FlowFrame` (with TrustFooter), gold `IconChip` + CreditCard icon, `ValueCard` with two `FeatureRow` items, `PrimaryCta` wired to `handleResolvePayment` ("Resolve payment"), `TextDecline` for cancel anyway.

All cancel logic is preserved verbatim: the `/api/stripe/cancel-subscription` POST, all toast branches (`cancelledImmediately`, `isPastDue` message, period-end with computed `endDate`+`daysRemaining`), the fire-and-forget `outcomeMutation.mutate({outcome:"cancelled"})`, `modalProps.onCancelled()`, and the `catch`/`console.error`/error-toast path.

### Per-reason screen flow

The OFFER phase walks `offersShown` rung-by-rung (cursor-driven) — declining a non-last rung renders the next rung (still step 2); declining the last rung → Step 4. Accepting any rung → Save Success (except `tier_downgrade` → exits to downgrade modal). The "screen sequence" column lists every screen the user sees, in order:

| Reason | offersShown | Screen sequence (each decline = next rung) |
|---|---|---|
| `too_expensive` | `[discount_50_2mo, bonus_entries_100]` | Reason → discount card → +100 card → Confirm |
| `prefer_cheaper` | `[tier_downgrade, bonus_entries_100]` | Reason → tier_downgrade card → +100 card → Confirm |
| `dont_use_benefits` | `[pause_30d, bonus_entries_100]` | Reason → pause card → +100 card → Confirm |
| `too_many_messages` | `[unsubscribe_marketing, bonus_entries_100]` | Reason → unsubscribe card → +100 card → Confirm |
| `joined_for_giveaway` | `[bonus_entries_100]` | Reason → +100 card → Confirm |
| `havent_won` | `[bonus_entries_100]` | Reason → +100 card → Confirm |
| `other` | `[pause_30d, discount_50_2mo, bonus_entries_100]` | Reason → pause card → discount card → +100 card (3-rung; middle rung no longer skipped) → Confirm |
| **Past-due (any reason)** | `[]` | Reason → Confirm (resolve-payment variant) |

Notes:
- `IMPLEMENTED_OFFERS` no longer removes any offer — all 5 `OfferType`s surface.
- Accepting +100 at any rung calls the same redeem endpoint and records `offerAccepted:"bonus_entries_100"`.
- Accepting `tier_downgrade` (when `tierDowngradeAvailable` is `true`) triggers `DowngradeConfirmModal` via `onRequestTierDowngrade`. The outcome `{offerAccepted:"tier_downgrade",outcome:"saved"}` is recorded **only** if the downgrade confirmation succeeds — never on card click.
- If `tierDowngradeAvailable` is `false` and `tier_downgrade` is the current offer, `Step2Offer` renders `<Step3BonusEntries>` instead — the user gets the +100 rung with no dead UI.

### Outcome-recording invariant

Exactly one terminal `outcome` is recorded per `CancellationFlowEvent`. This is
guaranteed by `recordOutcome`'s `updateOne` filter `{ _id, userId, outcome:
"in_progress" }` — the first terminal write wins atomically and any subsequent
call is a silent no-op (no double-count, no `saved`→`cancelled` overwrite).
Every client path emits at most one `outcome`, and only **after** its
side-effect API actually succeeds:

- +100 accepted → one `saved/bonus_entries_100` after `/api/cancellation-upsell/redeem` succeeds.
- `tier_downgrade` → one `saved/tier_downgrade`, recorded by the parent only on real downgrade success; dismiss records nothing.
- `pause_30d` accepted → one `saved/pause_30d`, recorded **server-side inside `acceptOffer`** only after `applyRetentionPause` succeeds (not a client fire-and-forget). A 409/404 (filter slipped) records nothing — the member is declined to the next rung.
- `discount_50_2mo` accepted → one `saved/discount_50_2mo`, recorded **server-side inside `acceptOffer`** only after `applyRetentionDiscount` succeeds (same model as `pause_30d`; not a client fire-and-forget). A 409/404 (filter slipped) records nothing — the member is declined to the next rung.
- `unsubscribe_marketing` accepted → one `saved/unsubscribe_marketing`, recorded **server-side inside `acceptOffer`** only after `applyMarketingUnsubscribe` succeeds (same model as `pause_30d`/`discount_50_2mo`; not a client fire-and-forget). There is no 409 path; a rare 404/500 records nothing — the member is declined to the next rung. A failing Klaviyo sync does **not** block the outcome (DB flag is the source of truth).
- Step 4 "Cancel anyway" (normal **and** past-due) → one `cancelled` after `/api/stripe/cancel-subscription` succeeds.
- "Keep my membership", past-due "Resolve payment", tier-downgrade dismiss, and no-downgrade-available → record **nothing**; the event stays `in_progress` and is later swept to `abandoned` by the §6a maturity job.

**Save Success is presentational.** The `markSaved` / `applySaveSuccess` state transition is purely a UI concern — it shows `StepSaveSuccess` instead of closing immediately. It does not trigger any additional server write; the `recordOutcome` call already happened inside `acceptOffer` on the server, or as a fire-and-forget from `Step3BonusEntries` for `bonus_entries_100`.

**`bonus_entries_100` / `tier_downgrade` keep their pre-existing endpoints.** `accept_offer` was not added for Phase-2 offers (no pre-existing endpoint existed for `pause_30d` at the time) — `bonus_entries_100` uses `/api/cancellation-upsell/redeem` and `tier_downgrade` uses the downgrade flow. `accept_offer` was introduced for `pause_30d` (the first offer with no pre-existing endpoint), then extended for `discount_50_2mo` and `unsubscribe_marketing`. The `400 "unsupported offer"` fallthrough is retained but is now unreachable for any valid `OfferType`.

### Mutation hooks (`src/hooks/queries/useCancellationFlow.ts`)

Three TanStack `useMutation` hooks — **no `queryClient` / `invalidateQueries`**:

- `useStartCancellationFlow` — POSTs `{ action: "start", reason, reasonText? }`, returns `{ eventId, offersShown, pastDue }`.
- `useOutcomeCancellationFlow` — POSTs `{ action: "outcome", eventId, outcome, offerAccepted? }`. Called fire-and-forget after cancel.
- `useAcceptOffer` — POSTs `{ action: "accept_offer", eventId, offer }`, returns `{ ok, resumesAt?, couponId? }` (`resumesAt` for `pause_30d`, `couponId` for `discount_50_2mo`, neither for `unsubscribe_marketing` → just `{ ok }`). Used by `PauseOfferCard`, `DiscountOfferCard`, and `UnsubscribeOfferCard` via `mutateAsync` (each card awaits success before calling `onAcceptedOffer`, and inspects the thrown `ApiError.status` for the graceful-decline path — 409/404 for pause/discount, 404/500 for unsubscribe which has no 409). Threaded `index.tsx` → `Step2Offer` as `acceptOfferMutation`.

The parent (`SubscriptionManagementModal`) refreshes data via its existing imperative `fetchSubscriptionBenefits()` call — no query invalidation needed in the modal itself.

### Parent integration (`SubscriptionManagementModal`)

- `showCancellationFlow` / `setShowCancellationFlow` — replaces the old `showCancellationUpsell`.
- `handleCancelSubscription` — opens the flow unconditionally (the old client-side `cancellationUpsellRedeemed` lifetime gate is removed; server-side eligibility filter in `CancellationFlowService` handles one-time-consumed offers).
- `onSaved` → calls `fetchSubscriptionBenefits()` + `onSubscriptionUpdate()` then closes.
- `onCancelled` → calls `fetchSubscriptionBenefits()` + `onSubscriptionUpdate()` then closes.
- `onResolvePayment` → `setShowCancellationFlow(false)` then `setIsRenewalFailedModalOpen(true)`.
- `onClose` → `setShowCancellationFlow(false)` (plain close — only reachable from "Keep my membership" in Step 4).
- `onRequestTierDowngrade(eventId)` → stores `eventId` in `pendingCancellationEventId` ref; immediately calls `setShowCancellationFlow(false)` (NO outcome recorded — the event stays `in_progress`); then selects the cheapest `DowngradeOption` from `subscriptionBenefits.availableDowngrades` (lowest `price`) and calls `setSelectedDowngrade(cheapest)` + `setShowDowngradeConfirm(true)`.
- **Downgrade success path** (`handleDowngradeSubscription`): if `pendingCancellationEventId.current` is set, fire-and-forgets `POST /api/subscription/cancellation-flow` with `{action:"outcome",eventId,outcome:"saved",offerAccepted:"tier_downgrade"}`, then clears the ref. This is the only place the `tier_downgrade` outcome is recorded.
- **Downgrade dismiss path** (`DowngradeConfirmModal` `onClose`): clears `pendingCancellationEventId.current` without recording any outcome — the event stays `in_progress` and matures to `abandoned` server-side.
- `tierDowngradeAvailable={(subscriptionBenefits?.availableDowngrades?.length ?? 0) > 0}` — threaded to `CancellationFlowModal` so `Step2Offer` can skip the dead tier card when no downgrade options exist.

The old `CancellationUpsellModal` has been removed — `src/components/modals/CancellationUpsellModal/` no longer exists. The +100-entries rung still POSTs to the existing, untouched `/api/cancellation-upsell/redeem` route (backed by `src/utils/redeemables/cancellation-upsell-eligibility.ts`); only the superseded modal UI was deleted.

### Note on shared-ui domain

`src/components/modals/**` paths match both the `subscription` domain (this doc) and the `shared-ui` domain (`docs/shared-ui/`). The modal-primitive layer (`ModalContainer`, `ModalHeader`, `ModalContent`) is documented in `docs/shared-ui/ui-primitives.md`; the cancellation-specific step logic is documented here.

---

## Pause-collision

The retention `pause_30d` offer sets Stripe `pause_collection` with a
`subscription.metadata.pauseReason = "retention"` marker. This collides with the
**failed-renewal-recovery / paid-invoice path**, which historically clears any
`pause_collection` once a membership invoice is paid. A retention pause must
survive that path; a recovery pause must keep behaving exactly as before.

### Where the real decision lives

The clear decision is in `src/services/stripe-webhook-handlers/index.ts`
lines **3430-3436** (the `shouldClearPauseForCollection` expression). The webhook delegates the **entire** decision to `decideClearPause`
(single source of truth) — it no longer inlines the legacy `||` chain:

```ts
const shouldClearPauseForCollection = decideClearPause({
  billingReason: expandedInvoice.billing_reason ?? undefined,
  previousSubscriptionDbStatus: previousSubscriptionDbStatus ?? undefined,
  pauseCollectionPresent: subscription.pause_collection != null,
  pauseReason: (subscription.metadata?.pauseReason as string | undefined) ?? undefined,
  recordMembershipRecurringAffiliate,
});
```

The historical inline expression it replaced (preserved here for the
behavioral-equivalence argument below):

```ts
shouldClearPauseCollectionAfterPaidInvoice({ billingReason, previousSubscriptionDbStatus })
  || recordMembershipRecurringAffiliate
  || subscription.pause_collection != null
```

`decideClearPause` is imported directly from
`@/services/subscription/pauseCollectionPolicy` (it is **not** re-exported via
`SubscriptionCollectionPauseService`). The previously-imported
`shouldClearPauseCollectionAfterPaidInvoice` was the only other reference in the
webhook file, so its import was removed; the legacy sub-decision is still
invoked, but now indirectly via `decideClearPause`.

**Behavior:** recovery pauses are cleared exactly as before (no change);
retention pauses (`pauseReason === "retention"`) are **never** cleared by a paid
invoice, because `decideClearPause` short-circuits to `false` before any legacy
condition runs.

### `decideClearPause` (the policy owner)

`src/services/subscription/pauseCollectionPolicy.ts` now exports
`decideClearPause(ClearPauseInput): boolean`, which owns the **whole** decision:

- The legacy renewal/past-due sub-decision is **delegated** to the unchanged
  `shouldClearPauseCollectionAfterPaidInvoice` (not reimplemented).
- The moved `subscription.pause_collection != null` clause becomes the
  `pauseCollectionPresent: boolean` input.
- `recordMembershipRecurringAffiliate` is an optional input that forces a clear.
- **New retention exclusion:** if `pauseReason === "retention"` the function
  returns `false` first, *before* any legacy condition is evaluated — a
  retention pause is never cleared by the recovery/paid-invoice path, even when
  every legacy condition (e.g. `past_due` recovery on a renewal cycle) would
  otherwise clear it.

`ClearPauseInput`:

```ts
interface ClearPauseInput {
  billingReason: string | undefined;
  previousSubscriptionDbStatus: string | undefined;
  pauseCollectionPresent: boolean;     // subscription.pause_collection != null
  pauseReason: string | undefined;     // subscription.metadata.pauseReason
  recordMembershipRecurringAffiliate?: boolean;
}
```

### Backward-compat guarantees

- The existing `shouldClearPauseCollectionAfterPaidInvoice` export is
  **unchanged** — `decideClearPause` and other callers/tests still rely on it.
  Its real signature is
  `{ billingReason: string | null | undefined; previousSubscriptionDbStatus: string | undefined }`.
  The webhook no longer imports it directly; it is now reached only via
  `decideClearPause`.
- For non-retention inputs (`pauseReason` undefined or any value other than
  `"retention"`), `decideClearPause` reproduces the legacy decision exactly:
  recovery pauses behave precisely as before.

### Domain

`src/services/subscription/**` (and its tests) belong to the `subscription`
domain (`docs/subscription/`); the Domain Manifest in `CLAUDE.md` already covers
these paths — no manifest edit was required.

## RetentionPauseService

`src/services/subscription/RetentionPauseService.ts`

Applies the `pause_30d` retention offer: pauses the member's Stripe subscription
for 30 days with `behavior: "void"` and stamps `metadata.pauseReason = "retention"`
so the webhook guard (`decideClearPause`) never clears it on a paid invoice.

### Stripe update parameters

```ts
stripe.subscriptions.update(subscriptionId, {
  pause_collection: {
    behavior: "void",            // void (discard) invoices during pause window
    resumes_at: resumesAtUnix,   // Unix seconds — now + 30 days
  },
  metadata: {
    pauseReason: "retention",    // webhook guard key — matches decideClearPause check
    pauseResumesAt: resumesAtIso,// ISO-8601 audit field
  },
});
```

Stripe metadata updates **merge** keys (they do not replace the whole metadata
object), so setting only `pauseReason` and `pauseResumesAt` is safe — other
existing metadata keys on the subscription are preserved.

### Behavior: `void` vs `keep_as_draft`

| | Recovery pause | Retention pause |
|---|---|---|
| `behavior` | `keep_as_draft` | `void` |
| Effect on new invoices | Held as draft; collected when resumed | Voided and discarded |
| `metadata.pauseReason` | (none) | `"retention"` |
| `resumes_at` | (none — manual) | now + 30 d |

`void` is appropriate for a voluntary pause: the member is choosing not to be
charged for 30 days. The subscription auto-resumes on `resumes_at`; no manual
`resumeAfterSuccessfulRenewalPayment` call is needed.

### Entry accrual during pause

No code is needed to freeze entries. Entries only accrue when Stripe fires a
paid renewal invoice webhook (`invoice.payment_succeeded` with billing reason
`subscription_cycle`). During a `void`-behavior pause Stripe discards new
invoices — no paid invoice is created, so no renewal webhook fires and no entries
are added. Existing accumulated entries on the member's account are unaffected.

### Guards

Three guards are evaluated in order by the pure helper `retentionPauseBlockReason(user)`:

1. **Past-due** — `hasFailedRenewal(user)` returns `true` → throws `"past-due: retention pause not allowed"`. Defense in depth: the eligibility filter already excludes past-due members from seeing the offer, but the service enforces this at the write layer regardless.
2. **Already consumed** — `user.retentionOffersConsumed?.pause30d` is `true` → throws `"retention pause already used"`. The pause is a one-time offer per member.
3. **No subscription** — `user.stripeSubscriptionId` is missing → throws `"no active subscription"`. Cannot pause a subscription that does not exist.

`retentionPauseBlockReason` is exported as a pure helper and unit-tested without any Stripe or DB dependency.

### Ordering rationale: Stripe FIRST, then consumed-flag persist

`applyRetentionPause` calls `stripe.subscriptions.update` **before** persisting
`retentionOffersConsumed.pause30d = true`. The reasoning:

- **If Stripe succeeds but Mongo write fails:** the member receives a real pause.
  They may be re-offered the pause next time (the consumed flag is not set). This
  is recoverable — an operator can manually set the flag, or the member declines
  the re-offer.
- **If Mongo write succeeds but Stripe fails (inverse order):** the member is
  permanently marked consumed with no actual pause. This is a silent data loss
  with no self-healing path.

Therefore Stripe success is the prerequisite; the Mongo write is best-effort.
A `console.error` is logged on Mongo write failure (survives production's
`removeConsole` pass for `log`/`warn`) but the function does NOT re-throw —
the pause is active and the caller receives `{ resumesAt }` normally.

### Consumed-flag persistence

```ts
await User.updateOne(
  { _id: user._id },
  { $set: { "retentionOffersConsumed.pause30d": true } }
);
```

Uses atomic `updateOne` with a dot-path `$set` (no full-document save) to match
the pattern used by other services that persist nested flags in this codebase.

### Test

`src/services/subscription/__tests__/RetentionPauseService.test.ts`
(`npm run test:retention-pause`)

Covers:
- `computeResumeAt` math (fixed date → expected unix seconds, spot-check vs 30 × 86400).
- `retentionPauseBlockReason` guard logic for every branch: past-due, already-consumed,
  no subscription ID, eligible user (null), past-due priority over consumed,
  and undefined `retentionOffersConsumed` treated as not consumed.

The Stripe/DB path is not tested (no network); correctness is by inspection. Heavy
server-side imports (`stripe.ts`, `mongodb.ts`, `User.ts`) are deferred to the body
of `applyRetentionPause` via dynamic `import()` so the module is safely importable
in test environments that lack `STRIPE_SECRET_KEY`/`MONGODB_URI`.

## RetentionDiscountService

`src/services/subscription/RetentionDiscountService.ts`

Applies the `discount_50_2mo` retention offer: attaches a stable, singleton
Stripe coupon (50% off, repeating for 2 months) to the member's live
subscription when they accept the offer in the cancellation flow.

### Stable singleton coupon

The discount is delivered through one fixed coupon, never per-member:

```ts
RETENTION_COUPON_ID = "retention-50off-2mo";

buildCouponParams() === {
  id: "retention-50off-2mo",
  percent_off: 50,
  duration: "repeating",
  duration_in_months: 2,
  name: "50% off for 2 months (retention)",
}
```

`buildCouponParams()` is a pure helper (no Stripe/DB) and is unit-tested with
exact-value assertions. Reusing a single coupon keeps the Stripe dashboard clean
and makes the offer trivially auditable.

### Idempotent + race-safe coupon ensure

`applyRetentionDiscount` ensures the singleton exists before attaching it:

1. `stripe.coupons.retrieve(RETENTION_COUPON_ID)` succeeds → coupon exists, use it.
2. Retrieve throws a Stripe "resource_missing" / 404 → `stripe.coupons.create(buildCouponParams())`.
3. Retrieve throws anything else → rethrow (real Stripe/network failure).
4. **Concurrent first-use race:** two requests both see the coupon missing and
   both call `create` with the same fixed `id`. Stripe rejects the second create;
   that "already exists" / idempotency error is treated as success — the
   post-condition (coupon exists) holds. Any other create error is rethrown.

### `discounts` REPLACES existing discounts (intentional)

The coupon is attached with the modern `discounts` array form — **not** the
deprecated top-level `coupon` param:

```ts
await stripe.subscriptions.update(subscriptionId, {
  discounts: [{ coupon: RETENTION_COUPON_ID }],
});
```

Setting `discounts` **REPLACES** the subscription's existing discount set — if
the member already had another discount it is overwritten by the retention
coupon. This is intentional and acceptable: a member in the act of cancelling is
taking the strongest save offer, so the retention 50%/2mo deliberately wins.
(Note: this differs from `pause_collection`/`metadata` updates, which *merge*.)

### Guards

`retentionDiscountBlockReason(user)` — pure helper, unit-tested per branch.
Evaluated in order (most critical first), mirroring `retentionPauseBlockReason`:

1. **Past-due** — `hasFailedRenewal(user)` → `"past-due: retention discount not allowed"`.
2. **Already consumed** — `user.retentionOffersConsumed?.discount50_2mo` → `"retention discount already used"`.
3. **No subscription** — missing `user.stripeSubscriptionId` → `"no active subscription"`.
4. Else `null` (eligible). Undefined `retentionOffersConsumed` → not consumed.

### Ordering rationale: Stripe FIRST, then consumed-flag persist

`applyRetentionDiscount` attaches the coupon on Stripe **before** persisting
`retentionOffersConsumed.discount50_2mo = true` via atomic
`User.updateOne({ _id }, { $set: { "retentionOffersConsumed.discount50_2mo": true } })`.
Same reasoning as `RetentionPauseService`: if Stripe succeeds but the Mongo
write fails, the member got a real discount but may be re-offered (recoverable);
the inverse (flag set, no discount) is silent data loss. The Mongo failure is
logged with `console.error` (survives production `removeConsole`) and does **not**
re-throw — the discount is live and `applyRetentionDiscount` returns
`{ couponId: RETENTION_COUPON_ID }` normally.

### Test

`src/services/subscription/__tests__/RetentionDiscountService.test.ts`
(`npm run test:retention-discount`)

Covers `buildCouponParams` exact values + key shape, and
`retentionDiscountBlockReason` for every branch (past-due, already-consumed, no
subscription, eligible/null, past-due priority over consumed, undefined consumed
flag). The Stripe/DB path is not tested (no network); heavy server-side imports
(`stripe.ts`, `mongodb.ts`, `User.ts`) are deferred to the body of
`applyRetentionDiscount` via dynamic `import()` so the module is safely
importable in env-less test environments.

## RetentionUnsubscribeService

`src/services/subscription/RetentionUnsubscribeService.ts`

Applies the `unsubscribe_marketing` retention offer: persists the member's
marketing-opt-out and best-effort syncs Klaviyo.

`applyMarketingUnsubscribe(userId) → Promise<{ ok: true }>`:

1. Dynamic-imports `connectDB`, `User`, and
   `syncKlaviyoEmailMarketingFromAdminPreference` (deferred so the module is
   safely importable in env-less test environments, mirroring
   `RetentionPauseService` / `RetentionDiscountService`). `await connectDB()`.
2. Loads the user as a **full Mongoose doc** (`User.findById(userId)`, **no
   `.lean()`**) — the Klaviyo sync expects an `IUser` shape, exactly as the
   admin route (`src/app/api/admin/users/[id]/route.ts`) passes
   `User.findById(...)` (no lean) to the same function. Missing user →
   `throw new Error("user not found")` (route → 404 via the shared mapper).
3. Persists `acceptsPromotionalEmail = false` via atomic
   `User.updateOne({ _id }, { $set: { acceptsPromotionalEmail: false } })`
   (dot-path `$set` style matching the other retention services). **This DB
   flag is the authoritative record of the preference.**
4. Calls `syncKlaviyoEmailMarketingFromAdminPreference(userDoc, false)` — this
   unsubscribes **marketing email AND marketing SMS** (it does NOT touch
   transactional SMS / transactional email). The function never throws (returns
   `{ success, error? }`); it does **not** itself write the DB flag (hence step
   3). A `success: false` is logged via `console.error` (survives production
   `removeConsole`) but is **non-fatal** — the retention action still succeeds
   because the DB flag is the source of truth and Klaviyo eventual-consistency
   is acceptable.
5. Returns `{ ok: true }`.

### No past-due guard, no one-time-consumed guard (intentional)

Unlike `RetentionPauseService` / `RetentionDiscountService`,
`applyMarketingUnsubscribe` has **no guards**:

- **No past-due guard** — unsubscribing from marketing is harmless and valid
  even for a past-due member (it has no billing side-effect).
- **No one-time-consumed guard** — `unsubscribe_marketing` has no entry in the
  `ONE_TIME` map in `cancellation-flow-eligibility.ts`, so it is not gated by a
  `retentionOffersConsumed` flag. It is also naturally **idempotent**:
  re-applying simply re-sets `acceptsPromotionalEmail = false` and re-issues the
  same Klaviyo unsubscribe.

### Klaviyo files NOT modified

This service only **calls** the existing exported
`syncKlaviyoEmailMarketingFromAdminPreference` — no file under
`src/utils/integrations/klaviyo/**` was modified. That path belongs to the
`tracking` domain in the Domain Manifest; since no klaviyo file changed, there
is no `tracking`-doc obligation.

### Test

No dedicated test script — correctness is by inspection (the DB/Klaviyo path is
network-bound, identical rationale to the un-tested Stripe paths in
`RetentionPauseService` / `RetentionDiscountService`). The pure eligibility and
service planning behavior (`unsubscribe_marketing` now surfacing) is covered by
`test:cancellation-eligibility` and `test:cancellation-flow-service`.

## Retention-pause lifecycle: cron cleanup

`src/app/api/cron/cancellation-retention-resume/route.ts`
(`GET /api/cron/cancellation-retention-resume`, daily at 16:00 UTC)

After the 30-day retention pause window expires, Stripe auto-resumes the subscription's billing (`pause_collection` returns to null). However, the **Stripe metadata keys** `pauseReason="retention"` and `pauseResumesAt=<ISO>` set by `RetentionPauseService` are never cleared automatically.

If left in place, these stale metadata keys create a production bug: a later failed-renewal recovery pause on the same subscription will still carry `pauseReason="retention"`, and `decideClearPause` (in `pauseCollectionPolicy.ts`) will refuse to clear `pause_collection` on a paid invoice — leaving the member stuck paused and never recovering billing.

The cron's job is to detect this stale state and clear the markers. It:

1. Queries users with `retentionOffersConsumed.pause30d === true` and a `stripeSubscriptionId`.
2. For each candidate, retrieves the current Stripe subscription.
3. Applies `shouldClearRetentionMarker({ pauseReason, pauseResumesAtIso, pauseCollectionPresent, now })` — a pure exported helper:
   - `false` if `pauseReason !== "retention"` (idempotent no-op).
   - `true` if `pause_collection` is already null (stale marker, Stripe already resumed).
   - `true` if `pauseResumesAtIso` ≤ now (window elapsed).
   - `false` if date is unparseable (conservative default).
4. When clearing:
   - Calls `resumeAfterSuccessfulRenewalPayment(subId)` if `pause_collection` is still active (defensive).
   - Calls `stripe.subscriptions.update(subId, { metadata: { pauseReason: "", pauseResumesAt: "" } })` to remove the retention marker.
5. Errors are isolated per subscription — one bad sub does not abort the batch.

Returns `{ processed, cleared, errors }`.

Full cron documentation (auth, candidate query bound, idempotency, response shape) lives in [`docs/infrastructure/api.md`](../infrastructure/api.md#cancellation-retention-resume-cron).

## §6a Retention-90 maturity: cron back-fill

`src/app/api/cron/cancellation-retention-maturity/route.ts`
(`GET /api/cron/cancellation-retention-maturity`, daily at 17:00 UTC — one hour after the resume cron, deliberately staggered to spread load)

A saved cancellation flow (`outcome === "saved"`) only proves the save "stuck" 90 days later. This cron matures those events:

1. `maturedFilter(now)` → `{ outcome:"saved", savedAt:{ $lte: now-90d }, retention90: null }`. Bounded date-window query (compound index `{outcome,savedAt,retention90}` serves it). `.limit(5000)` safety cap.
2. For each event, load the member (`User.findById`, projected) and compute `isRetained(user)` — which mirrors the canonical "active recurring subscriber" predicate `getActiveSubscriptionFilter` (`src/utils/admin/userFilterBuilder.ts:42`) field-for-field: `isActive === true` AND `subscription.isActive === true` AND `subscription.autoRenew !== false` AND `subscription.status ∈ {active,trialing}`.
3. `updateOne({ _id, retention90: null }, { $set: { retention90: retained ? "retained" : "churned" } })`.
4. **Read-only on user/subscription** — never calls Stripe, never mutates the subscription. The only write is the `retention90` field on `CancellationFlowEvent`.
5. **Missing user → churned**: a deleted account has no active recurring subscription, so the save did not durably retain a paying member (`isRetained(null) === false`).
6. **Idempotent**: the `retention90: null` in BOTH the candidate filter and the update filter means a matured event is never re-selected and a concurrent run is a no-op once the value is set.
7. Errors are isolated per event — one bad event does not abort the batch.

Returns `{ processed, retained, churned, errors }`.

The values written (`"retained"`/`"churned"`) exactly match the `CancellationFlowEvent.retention90` enum and the `summarizeCancellationEvents` shaper, whose `matured` cutoff (`savedAt <= now - 90d`) is identical to `maturedFilter`'s `$lte` — so the admin panel's retained/churned/pending split reflects this cron's output the moment it writes. Pure helpers (`maturedFilter`, `isRetained`, `NINETY_DAYS_MS`) are unit-tested: `npm run test:retention-maturity`.

Full cron documentation lives in [`docs/infrastructure/api.md`](../infrastructure/api.md#cancellation-retention-maturity-cron).

## Admin analytics

Read-only cancellation-flow analytics live in the **admin** domain (not subscription): the pure shaper `summarizeCancellationEvents` + DB entry `getCancellationFlowAnalytics` in `src/services/admin/cancellationFlowAnalytics.ts`, the `GET /api/admin/cancellation-flow-analytics` route, and the `CancellationFlowAnalytics` panel (Analytics sidebar tab). The shaper reads `CancellationFlowEvent` (this domain's model) and derives: triggered, per-reason share, the reason→offer→accepted/cancelled/abandoned funnel, save rate, offers-accepted, past-due exclusion from offer-conversion, the 90-day retention split (`retained`/`churned`/`pending`), and the same split **per offer** (`retention90ByOffer`). `abandoned` = `outcome === "in_progress"` AND `startedAt <= now - 1h`; `retention90` only counts matured saves (else `pending`) and is populated by the §6a maturity cron. `retention90ByOffer` (per-`OfferType` retained/churned/pending using the **identical** `savedAt <= now - 90d` matured cutoff as the overall split and the §6a cron — no skew) surfaces in the admin panel so admins can see which offers produce durable saves vs delayed churn. Full contract: [`docs/admin/api.md`](../admin/api.md#cancellation-flow-analytics). Test: `npm run test:cancellation-analytics`.
