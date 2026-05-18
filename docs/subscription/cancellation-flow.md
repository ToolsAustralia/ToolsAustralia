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
2. **IMPLEMENTED_OFFERS gate** — only offers whose backend is fully shipped are shown. `IMPLEMENTED_OFFERS` is a `ReadonlySet<OfferType>` that starts at Phase 2 with `bonus_entries_100` and `tier_downgrade`. Later tasks extend this set one entry at a time as each backend lands (Task 14 → `pause_30d`; Task 16 → `discount_50_2mo`; Task 17 → `unsubscribe_marketing`), preventing dead UI from surfacing unimplemented paths.
3. **One-time consumed gate** — certain offers may only be accepted once per member. `ConsumedFlags` tracks redemption state; `bonus_entries_100` maps to the legacy field `user.cancellationUpsellRedeemed`. If the flag is set, the offer is filtered out. `tier_downgrade` and `unsubscribe_marketing` are not one-time gated (no entry in `ONE_TIME`).

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

#### Error responses

| Status | Condition |
|--------|-----------|
| `400`  | JSON parse failure or Zod validation failure (including invalid `eventId` format) |
| `401`  | No valid session |
| `404`  | `getUserCancellationContext` throws `"user not found"` |
| `500`  | Unexpected server error |

#### Boundary validation

The `eventId` field is validated with `mongoose.Types.ObjectId.isValid(v)` at the Zod boundary before it reaches the service. This prevents a BSON cast error from propagating from `recordOutcome` (which calls `new mongoose.Types.ObjectId(eventId)` internally).

#### Implementation file

`src/app/api/subscription/cancellation-flow/route.ts`

The route is thin: authorize (session/401) → parse JSON → Zod validate → delegate to `CancellationFlowService`. Auth is checked first, before any body parsing or DB work. No business logic lives in the handler.

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

**Unimplemented (throws loudly until wired):**

- `pause_30d` → Task 14 replaces the throw with the pause card.
- `discount_50_2mo` → Task 16 replaces the throw with the discount card.
- `unsubscribe_marketing` → Task 17 replaces the throw with the unsubscribe card.

These are unreachable in Phase 2 because `IMPLEMENTED_OFFERS` in the eligibility filter only passes `bonus_entries_100` and `tier_downgrade`.

### Step 3 — `Step3BonusEntries.tsx`

Universal "+100 bonus entries — stay active today" rung. Always the last offer in the reel.

Accept flow (identical call chain to old `CancellationUpsellModal`):
1. POST `/api/cancellation-upsell/redeem` with `credentials:"include"` (no body — the server identifies the user from the session).
2. `useEntryRewardToast` to show the reward toast.
3. Fire `outcomeMutation.mutate({outcome:"saved",offerAccepted:"bonus_entries_100"})` (fire-and-forget).
4. Call `onSaved()`.

Decline → `onDecline()` → `decline()` in the hook → cursor exhausted → Step 4.

### Mutation hooks (`src/hooks/queries/useCancellationFlow.ts`)

Two TanStack `useMutation` hooks — **no `queryClient` / `invalidateQueries`**:

- `useStartCancellationFlow` — POSTs `{ action: "start", reason, reasonText? }`, returns `{ eventId, offersShown, pastDue }`.
- `useOutcomeCancellationFlow` — POSTs `{ action: "outcome", eventId, outcome, offerAccepted? }`. Called fire-and-forget after cancel.

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

### Phase-2 per-reason screen flow

After `IMPLEMENTED_OFFERS` filtering (`bonus_entries_100`, `tier_downgrade` only):

| Reason | offersShown | Step 1 → Step 2 | Step 2 → Step 3 | Step 3 → Step 4 |
|---|---|---|---|---|
| `too_expensive` | `[bonus_entries_100]` | +100 card | — | decline → Step 4 |
| `prefer_cheaper` | `[tier_downgrade, bonus_entries_100]` | tier_downgrade card | +100 card | decline → Step 4 |
| `dont_use_benefits` | `[bonus_entries_100]` | +100 card | — | decline → Step 4 |
| `too_many_messages` | `[bonus_entries_100]` | +100 card | — | decline → Step 4 |
| `joined_for_giveaway` | `[bonus_entries_100]` | +100 card | — | decline → Step 4 |
| `havent_won` | `[bonus_entries_100]` | +100 card | — | decline → Step 4 |
| `other` | `[bonus_entries_100]` | +100 card | — | decline → Step 4 |

Notes:
- `discount_50_2mo`, `pause_30d`, `unsubscribe_marketing` are removed by `IMPLEMENTED_OFFERS` in Phase 2, so the only variation is whether `tier_downgrade` leads (reason=`prefer_cheaper`) or `bonus_entries_100` leads directly.
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
- Step 4 "Cancel anyway" (normal **and** past-due) → one `cancelled` after `/api/stripe/cancel-subscription` succeeds.
- "Keep my membership", past-due "Resolve payment", tier-downgrade dismiss, and no-downgrade-available → record **nothing**; the event stays `in_progress` and is later swept to `abandoned` by the §6a maturity job.

**Plan deviation (intentional):** the original plan's Task 9 proposed a generic
`accept_offer` route action for Phase 2. It was **not** added — the implemented
architecture has Phase-2 offers (`bonus_entries_100`, `tier_downgrade`) call
their existing battle-tested endpoints (`/api/cancellation-upsell/redeem`, the
downgrade flow) and then log via the single `outcome` action. Adding
`accept_offer` with no Phase-2 consumer would be dead code (CLAUDE.md rule #4).
The `accept_offer` action is introduced in Phase 3 (Task 14) for `pause_30d`,
the first offer with no pre-existing endpoint.

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

## Note on shared-ui domain

`src/components/modals/**` paths match both the `subscription` domain (this doc) and the `shared-ui` domain (`docs/shared-ui/`). The modal-primitive layer (`ModalContainer`, `ModalHeader`, `ModalContent`) is documented in `docs/shared-ui/ui-primitives.md`; the cancellation-specific step logic is documented here.
