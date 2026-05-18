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
2. **IMPLEMENTED_OFFERS gate** — only offers whose backend is fully shipped are shown. `IMPLEMENTED_OFFERS` is a `ReadonlySet<OfferType>` that started at Phase 2 with `bonus_entries_100` and `tier_downgrade`; **Task 14 added `pause_30d`**, **Task 16 added `discount_50_2mo`**. The last task extends this set as its backend lands (Task 17 → `unsubscribe_marketing`), preventing dead UI from surfacing unimplemented paths. Current set: `{ bonus_entries_100, tier_downgrade, pause_30d, discount_50_2mo }`.
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

### Accept-offer (DB + Stripe) — Phase 3

`acceptOffer({ userId, eventId, offer }) → Promise<{ resumesAt?: string; couponId?: string }>`

Supported offers: **`pause_30d`** (Task 14) and **`discount_50_2mo`** (Task 16). Any other `offer` throws `AcceptOfferError("unsupported offer", 400)` (Task 17 extends this for `unsubscribe_marketing`).

- `pause_30d`: calls `applyRetentionPause(userId)` (`RetentionPauseService`); on success calls `recordOutcome({ eventId, userId, outcome:"saved", offerAccepted:"pause_30d" })` and returns `{ resumesAt }`.
- `discount_50_2mo`: calls `applyRetentionDiscount(userId)` (`RetentionDiscountService`); on success calls `recordOutcome({ eventId, userId, outcome:"saved", offerAccepted:"discount_50_2mo" })` and returns `{ couponId }`.

Both services' typed-error messages are mapped to an HTTP status by the **shared** private helper `retentionOfferErrorToStatus` (generalized in Task 16 from the old pause-only `retentionPauseErrorToStatus` — it now covers BOTH the pause and discount message sets in one switch, keeping the error→status contract DRY) and re-thrown as `AcceptOfferError(message, status)`; a `500`-class (unmatched) error is re-thrown unwrapped so the route's generic handler logs and returns 500. See the route's "`accept_offer` error → HTTP status map" table below for the exact mapping.

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
  "reasonText": "..."              // string, max 2000 chars (optional)
}
```

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

#### Action: `accept_offer` (Phase 3)

Accept a retention offer that has its own side-effect (no pre-existing endpoint). **Supported offers: `pause_30d` (Task 14) and `discount_50_2mo` (Task 16).** Any other `offer` value returns `400 {"error":"unsupported offer"}` (Task 17 extends `acceptOffer` for `unsubscribe_marketing`).

Request body:
```json
{
  "action": "accept_offer",
  "eventId": "<ObjectId string>",       // must be a valid MongoDB ObjectId (boundary-validated)
  "offer": "pause_30d"                  // OfferType: "pause_30d" | "discount_50_2mo"
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

The route is offer-agnostic: it spreads the service result (`{ ok: true, ...result }`), so `resumesAt` is present for pause, `couponId` for discount. No route schema change was needed — the `AcceptOfferSchema` discriminated-union member already validates `offer` against `OFFER_TYPES`, so `discount_50_2mo` simply became supported instead of returning `400 "unsupported offer"`.

Success response `200`:
```json
{ "ok": true, "resumesAt": "2026-06-17T12:00:00.000Z" }
```
or, for `discount_50_2mo`:
```json
{ "ok": true, "couponId": "retention-50off-2mo" }
```

#### Error responses

| Status | Condition |
|--------|-----------|
| `400`  | JSON parse failure or Zod validation failure (including invalid `eventId` format); **`accept_offer` with any `offer` other than `pause_30d` / `discount_50_2mo` → `"unsupported offer"`** |
| `401`  | No valid session |
| `404`  | `getUserCancellationContext` throws `"user not found"`; **`accept_offer`: `applyRetentionPause` / `applyRetentionDiscount` throws `"user not found"`** |
| `409`  | **`accept_offer`/`pause_30d`: `applyRetentionPause` throws `"retention pause already used"`, `"past-due: retention pause not allowed"`, or `"no active subscription"`; `accept_offer`/`discount_50_2mo`: `applyRetentionDiscount` throws `"retention discount already used"`, `"past-due: retention discount not allowed"`, or `"no active subscription"`** |
| `500`  | Unexpected server error (e.g. Stripe API failure during `applyRetentionPause` / `applyRetentionDiscount`) |

#### `accept_offer` error → HTTP status map

`acceptOffer` calls `applyRetentionPause` (pause) or `applyRetentionDiscount` (discount), which throw typed `Error`s. The **shared** `CancellationFlowService.retentionOfferErrorToStatus` (Task 16 generalized the old pause-only `retentionPauseErrorToStatus` into one helper covering both message sets — DRY, not duplicated per service) maps the message to a status; the service re-throws as a typed `AcceptOfferError(message, status)`. The route does a single `instanceof AcceptOfferError` check and echoes `{ error: message }` with `error.status` — same message-mapping spirit as the existing `"user not found" → 404` path, just promoted to a class so the status decision stays in the service (no business logic in the handler). A `500`-class message (anything unmatched, e.g. a Stripe failure) is **not** wrapped — the original error re-throws and hits the route's generic 500 handler (`console.error` preserved).

| thrown message (from `applyRetentionPause` / `applyRetentionDiscount`) | HTTP status |
|---|---|
| `"retention pause already used"` | `409` |
| `"retention discount already used"` | `409` |
| `"past-due: retention pause not allowed"` | `409` |
| `"past-due: retention discount not allowed"` | `409` |
| `"no active subscription"` | `409` |
| `"user not found"` | `404` |
| (anything else) | `500` (original error re-thrown, generic handler) |
| `acceptOffer` itself, `offer` not `pause_30d`/`discount_50_2mo` | `400` `"unsupported offer"` |

#### Boundary validation

The `eventId` field is validated with `mongoose.Types.ObjectId.isValid(v)` at the Zod boundary before it reaches the service. This prevents a BSON cast error from propagating from `recordOutcome` (which calls `new mongoose.Types.ObjectId(eventId)` internally).

#### Implementation file

`src/app/api/subscription/cancellation-flow/route.ts`

The route is thin: authorize (session/401) → parse JSON → Zod validate (discriminated union: `start | outcome | accept_offer`) → delegate to `CancellationFlowService`. Auth is checked first, before any body parsing or DB work. No business logic lives in the handler — the `accept_offer` error→status decision lives in `CancellationFlowService` (`AcceptOfferError.status`); the route only does `instanceof AcceptOfferError → NextResponse.json({error}, {status})`.

---

## CancellationFlowModal (UI)

`src/components/modals/CancellationFlowModal/`

Multi-step modal that replaces the old single-screen `CancellationUpsellModal`.

### Responsive presentation

Uses `ModalContainer` (imported from `../ui`, same as `PackageSelectionModal`):

```tsx
const isNarrowViewport = useMediaQuery("(max-width: 639px)");
<ModalContainer presentation={isNarrowViewport ? "sheet" : "dialog"} ... />
```

Desktop renders as a centered dialog; mobile (< 640px) renders as a bottom sheet.

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
}
```

- **Step 1** — reason capture (7 radio options; "Other" reveals an optional textarea)
- **Step 2** — lead offer (`Step2Offer`) — dispatches over the current offer via exhaustive typed `switch`
- **Step 3** — +100 bonus entries rung (`Step3BonusEntries`) — always the final offer when `offersShown.length > 1`
- **Step 4** — confirm cancel or "Keep my membership" (`Step4Confirm`)

`applyStart({ eventId, offersShown, pastDue })` decides next step: if `offersShown.length === 0` → step 4; else → step 2.

`decline()` advances `offerCursor`; when exhausted → step 4. From Step 2 with a single offer, decline goes directly to Step 4 (cursor=1 >= length=1). From Step 2 with two offers, decline advances to Step 3 (cursor=1 < length=2); declining Step 3 goes to Step 4.

`requestExit()` jumps directly to step 4 (used by the ✕ header button).

### ✕ button wiring (important)

The header ✕ calls `requestExit()` (→ Step 4), **not** `props.onClose` directly. This ensures the user always sees the "Are you sure?" confirm screen before truly closing. The only direct `onClose` path is the "Keep my membership" button in Step 4.

Exception: if the user hits ✕ on Step 1 before selecting a reason, the modal closes directly (nothing to confirm).

### Past-due variant (§3a)

When the server returns `pastDue: true` (user has a failed renewal), `offersShown` is `[]` (eligibility filter short-circuits). `applyStart` routes directly to step 4 with `state.pastDue = true`. Step 4 renders the past-due variant: primary CTA is "Resolve payment" → `props.onResolvePayment()`, secondary is "Cancel anyway".

### Step 2 — `Step2Offer.tsx`

Renders the lead offer: `state.offersShown[state.offerCursor]`. Uses an exhaustive typed `switch (offer: OfferType)` with a `never`-guard `default` so TypeScript errors if a new `OfferType` is added without handling it.

**Implemented (Phase 2):**

- `bonus_entries_100` — renders `<Step3BonusEntries>` directly (same content; no duplication).
- `tier_downgrade` — dark-themed "Switch to a cheaper plan" card. If `tierDowngradeAvailable` is `false` (no downgrade options exist on the account), renders `<Step3BonusEntries>` instead — no dead card, no silent no-op. If `true`, clicking "Switch plan" calls `props.onRequestTierDowngrade?.(state.eventId)` — the outcome mutation is **NOT** fired at this point. The parent stores the `eventId` in `pendingCancellationEventId` and records `{outcome:"saved",offerAccepted:"tier_downgrade"}` only if `handleDowngradeSubscription` succeeds. If `DowngradeConfirmModal` is dismissed, the eventId is cleared and the event matures to `abandoned`. Decline calls `onDecline()`.
- `pause_30d` (Task 14) — `PauseOfferCard`: "Pause 30 days — keep your entries". Reuses the `upsell-shell` grammar (`InfoGrid` `framing="gain"`, `UrgencyBanner` tone gold, `TrustBar`) and the two-button accept/decline grid from `Step3BonusEntries`. **Accept** → `useAcceptOffer().mutateAsync({ eventId, offer:"pause_30d" })` (POST `{action:"accept_offer",...}`); on success → `onSaved()` (parent runs `fetchSubscriptionBenefits` + close, identical to the other offers). The server records the `saved/pause_30d` outcome — the card does **not** fire `outcomeMutation`. **Decline** → `onDecline()` (next rung). **409/404 graceful path:** the eligibility filter normally prevents an already-used / past-due / no-subscription member from ever seeing this card, but if the filter slipped through, the POST returns `409` (or `404`); the card catches the `ApiError`, shows a brief info toast, and calls `onDecline()` so the member advances to the next rung instead of dead-ending. Any other failure shows an error toast and leaves the card in place to retry.
- `discount_50_2mo` (Task 16) — `DiscountOfferCard`: "50% off for 2 months". **Mirrors `PauseOfferCard` exactly** — same `upsell-shell` grammar (`InfoGrid` `framing="gain"`, gold `UrgencyBanner`, `TrustBar`), same two-button accept/decline grid, same 409/404 graceful-decline path. **Accept** → `useAcceptOffer().mutateAsync({ eventId, offer:"discount_50_2mo" })`; on success → `onSaved()`. The server (`acceptOffer` → `applyRetentionDiscount`) attaches the singleton coupon and records the `saved/discount_50_2mo` outcome — the card does **not** fire `outcomeMutation`. **Decline** → `onDecline()`. **409/404** (filter slipped: already-used / past-due / no-subscription) → info toast + `onDecline()`; any other failure → error toast, card stays for retry.

**Unimplemented (throws loudly until wired):**

- `unsubscribe_marketing` → Task 17 replaces the throw with the unsubscribe card.

The exhaustive `switch` + `never`-guard `default` is preserved; `pause_30d` (Task 14) and `discount_50_2mo` (Task 16) changed from `throw` → card. `unsubscribe_marketing` still `throw`s and remains unreachable because `IMPLEMENTED_OFFERS` only passes `bonus_entries_100`, `tier_downgrade`, `pause_30d`, and `discount_50_2mo`.

### Step 3 — `Step3BonusEntries.tsx`

Universal "+100 bonus entries — stay active today" rung. Always the last offer in the reel.

Accept flow (identical call chain to old `CancellationUpsellModal`):
1. POST `/api/cancellation-upsell/redeem` with `credentials:"include"` (no body — the server identifies the user from the session).
2. `useEntryRewardToast` to show the reward toast.
3. Fire `outcomeMutation.mutate({outcome:"saved",offerAccepted:"bonus_entries_100"})` (fire-and-forget).
4. Call `onSaved()`.

Decline → `onDecline()` → `decline()` in the hook → cursor exhausted → Step 4.

### Mutation hooks (`src/hooks/queries/useCancellationFlow.ts`)

Three TanStack `useMutation` hooks — **no `queryClient` / `invalidateQueries`**:

- `useStartCancellationFlow` — POSTs `{ action: "start", reason, reasonText? }`, returns `{ eventId, offersShown, pastDue }`.
- `useOutcomeCancellationFlow` — POSTs `{ action: "outcome", eventId, outcome, offerAccepted? }`. Called fire-and-forget after cancel.
- `useAcceptOffer` (Task 14; extended Task 16) — POSTs `{ action: "accept_offer", eventId, offer }`, returns `{ ok, resumesAt? , couponId? }` (`resumesAt` for `pause_30d`, `couponId` for `discount_50_2mo`). Used by both `PauseOfferCard` and `DiscountOfferCard` via `mutateAsync` (each card awaits success before calling `onSaved`, and inspects the thrown `ApiError.status` for the 409/404 graceful-decline path). Threaded `index.tsx` → `Step2Offer` as `acceptOfferMutation`.

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

The old `CancellationUpsellModal` files are retained (not deleted); they will be removed in Phase 5 Task 19.

### Phase-3 per-reason screen flow

After `IMPLEMENTED_OFFERS` filtering (`bonus_entries_100`, `tier_downgrade`, `pause_30d`, `discount_50_2mo` — only `unsubscribe_marketing` still filtered):

| Reason | offersShown | Step 1 → Step 2 | Step 2 → Step 3 | (then) → Step 4 |
|---|---|---|---|---|
| `too_expensive` | `[discount_50_2mo, bonus_entries_100]` | **discount card** | +100 card | decline → Step 4 |
| `prefer_cheaper` | `[tier_downgrade, bonus_entries_100]` | tier_downgrade card | +100 card | decline → Step 4 |
| `dont_use_benefits` | `[pause_30d, bonus_entries_100]` | **pause card** | +100 card | decline → Step 4 |
| `too_many_messages` | `[bonus_entries_100]` | +100 card | — | decline → Step 4 |
| `joined_for_giveaway` | `[bonus_entries_100]` | +100 card | — | decline → Step 4 |
| `havent_won` | `[bonus_entries_100]` | +100 card | — | decline → Step 4 |
| `other` | `[pause_30d, discount_50_2mo, bonus_entries_100]` | **pause card** | **discount card** → +100 card | decline → Step 4 |

Per-reason trace (Task 16 — IMPLEMENTED = {bonus, tier, pause, discount}):
- `too_expensive` → sequence `[discount_50_2mo, bonus_entries_100]` (nothing filtered). Step 2 = discount card. Accept → coupon applied + `saved/discount_50_2mo` recorded server-side → `onSaved`. Decline → +100 (Step 3) → decline → Step 4.
- `other` → sequence `[pause_30d, discount_50_2mo, bonus_entries_100]` (nothing filtered now). Pause card leads → decline → discount card → decline → +100 → Step 4.
- `dont_use_benefits` → `[pause_30d, bonus_entries_100]` (pause then +100) — unchanged from Task 14.
- `prefer_cheaper` → `[tier_downgrade, bonus_entries_100]` (tier then +100) — unchanged.
- `joined_for_giveaway` / `havent_won` / `too_many_messages` → `[bonus_entries_100]` (the +100 rung only; `unsubscribe_marketing` still filtered until Task 17).

Notes:
- `unsubscribe_marketing` is the only offer still removed by `IMPLEMENTED_OFFERS`; `pause_30d` (Task 14) and `discount_50_2mo` (Task 16) now surface.
- Accepting +100 at Step 2 (lead offer) or Step 3 (second rung) calls the same redeem endpoint and fires `offerAccepted:"bonus_entries_100"`.
- Accepting `tier_downgrade` (when `tierDowngradeAvailable` is `true`) triggers `DowngradeConfirmModal` via `onRequestTierDowngrade`. The outcome `{offerAccepted:"tier_downgrade",outcome:"saved"}` is recorded **only** if the downgrade confirmation succeeds — never on card click.
- If `tierDowngradeAvailable` is `false` and `tier_downgrade` is the current offer, `Step2Offer` renders `<Step3BonusEntries>` instead — the user gets the +100 rung with no dead UI.

### Outcome-recording invariant (Task 9)

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
- Step 4 "Cancel anyway" (normal **and** past-due) → one `cancelled` after `/api/stripe/cancel-subscription` succeeds.
- "Keep my membership", past-due "Resolve payment", tier-downgrade dismiss, and no-downgrade-available → record **nothing**; the event stays `in_progress` and is later swept to `abandoned` by the §6a maturity job.

**Plan deviation (intentional):** the original plan's Task 9 proposed a generic
`accept_offer` route action for Phase 2. It was **not** added in Phase 2 — the
Phase-2 offers (`bonus_entries_100`, `tier_downgrade`) call their existing
battle-tested endpoints (`/api/cancellation-upsell/redeem`, the downgrade flow)
and log via the single `outcome` action; `accept_offer` with no Phase-2 consumer
would have been dead code (CLAUDE.md rule #4). **Task 14 (Phase 3) adds
`accept_offer`** for `pause_30d`, the first offer with no pre-existing endpoint —
it now has a real consumer (`PauseOfferCard`). Scope is intentionally narrow:
`acceptOffer` only handles `pause_30d`; every other offer value returns
`400 "unsupported offer"` until Tasks 16/17 extend it.

## Pause-collision (Phase 3)

The retention `pause_30d` offer sets Stripe `pause_collection` with a
`subscription.metadata.pauseReason = "retention"` marker. This collides with the
**failed-renewal-recovery / paid-invoice path**, which historically clears any
`pause_collection` once a membership invoice is paid. A retention pause must
survive that path; a recovery pause must keep behaving exactly as before.

### Where the real decision lives

The clear decision is in `src/services/stripe-webhook-handlers/index.ts`
lines **3430-3436** (the `shouldClearPauseForCollection` expression). As of
Task 11 the webhook delegates the **entire** decision to `decideClearPause`
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
  The webhook no longer imports it directly (Task 11 removed that import since it
  had no remaining reference in the file); it is now reached only via
  `decideClearPause`.
- For non-retention inputs (`pauseReason` undefined or any value other than
  `"retention"`), `decideClearPause` reproduces the legacy decision exactly:
  recovery pauses behave precisely as before.
- Task 11 made a single surgical change in `stripe-webhook-handlers/index.ts`:
  the `shouldClearPauseForCollection` right-hand expression now calls
  `decideClearPause(...)`. No surrounding logic (the
  `if (shouldClearPauseForCollection) { … resumeAfterSuccessfulRenewalPayment … }`
  block, affiliate eligibility, etc.) changed. `npm run type-check`,
  `npm run test:stripe-collection-pause`, `npm run lint`, and `npm run build`
  all pass.

### Domain

`src/services/subscription/**` (and its tests) belong to the `subscription`
domain (`docs/subscription/`); the Domain Manifest in `CLAUDE.md` already covers
these paths — no manifest edit was required.

## RetentionPauseService (Task 12)

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

## RetentionDiscountService (Task 15)

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
2. Retrieve throws a Stripe "resource_missing" / 404 (classified the same way as
   `SubscriptionReferenceService.retrieveStripeSubscription`: `code === "resource_missing"`
   / `"resource_missing_deleted"` or `statusCode === 404`) → `stripe.coupons.create(buildCouponParams())`.
3. Retrieve throws anything else → rethrow (real Stripe/network failure).
4. **Concurrent first-use race:** two requests both see the coupon missing and
   both call `create` with the same fixed `id`. Stripe rejects the second create;
   that "already exists" / idempotency error (`code === "resource_already_exists"` /
   `"idempotency_key_in_use"`, or a message containing `already exists`) is
   treated as success — the post-condition (coupon exists) holds. Any other
   create error is rethrown.

### `discounts` REPLACES existing discounts (intentional)

The coupon is attached with the modern `discounts` array form — **not** the
deprecated top-level `coupon` param:

```ts
await stripe.subscriptions.update(subscriptionId, {
  discounts: [{ coupon: RETENTION_COUPON_ID }],
});
```

Stripe v18 (`stripe@18.5.0`, API `2025-08-27.basil`) types
`SubscriptionUpdateParams.discounts` as
`Stripe.Emptyable<Array<{ coupon?: string; discount?: string; promotion_code?: string }>>`,
so `[{ coupon: RETENTION_COUPON_ID }]` is the correct shape (verified by
`npm run build`).

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

### Wired into `acceptOffer` (Task 16)

`CancellationFlowService.acceptOffer` now routes `offer === "discount_50_2mo"`
to `applyRetentionDiscount(userId)` (mirroring the `pause_30d` →
`applyRetentionPause` branch added in Task 14): on success it records
`saved/discount_50_2mo` and returns `{ couponId }`. The error→status mapping is
the **shared** `retentionOfferErrorToStatus` helper (Task 16 generalized the
former pause-only `retentionPauseErrorToStatus` to cover both services' message
sets, DRY). `IMPLEMENTED_OFFERS` now includes `discount_50_2mo`, so the eligibility
filter surfaces it and `Step2Offer` renders `DiscountOfferCard`.

> **Test-expectation note (Task 16):** shipping `discount_50_2mo` changed the
> expected outputs of two pre-existing pure tests, which were updated to the new
> reality (NOT left stale):
> - `cancellation-flow-eligibility.test.ts`: the old `testUnimplementedFilteredPhase2`
>   (asserted `[discount_50_2mo, bonus_entries_100] → [bonus_entries_100]`) was
>   replaced by `testUnimplementedFiltered` using `unsubscribe_marketing`
>   (still unimplemented until Task 17); added `testDiscount50Implemented`
>   (`→ [discount_50_2mo, bonus_entries_100]`) and `testDiscount50Consumed`
>   (`consumed.discount50_2mo → [bonus_entries_100]`).
> - `CancellationFlowService.test.ts`: `testStandard` (`too_expensive`) now
>   expects `["discount_50_2mo","bonus_entries_100"]` (was `["bonus_entries_100"]`);
>   `testConsumedBonusEntries` now expects `["discount_50_2mo"]` (was `[]`,
>   because `discount_50_2mo` is not consumed and is now implemented).
> The pure routing test (`cancellation-flow-routing.test.ts`) is unaffected —
> `resolveOfferSequence` does not consult `IMPLEMENTED_OFFERS`.

## Retention-pause lifecycle: cron cleanup (Task 13)

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

## Note on shared-ui domain

`src/components/modals/**` paths match both the `subscription` domain (this doc) and the `shared-ui` domain (`docs/shared-ui/`). The modal-primitive layer (`ModalContainer`, `ModalHeader`, `ModalContent`) is documented in `docs/shared-ui/ui-primitives.md`; the cancellation-specific step logic is documented here.
