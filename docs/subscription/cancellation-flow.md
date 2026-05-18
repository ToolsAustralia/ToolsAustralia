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
