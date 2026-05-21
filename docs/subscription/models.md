# Subscription — Mongo models

6 collections own subscription state. Schemas live in [`src/models/`](../../src/models/).

## `User.subscription` (subdocument on `User`)

[src/models/User.ts](../../src/models/User.ts) — the subscription state lives as an **embedded subdocument** on `User`, not a separate collection. One subscription per user (only one active at a time).

Top-level subscription-related fields on `IUser`:

| Field | Type | Notes |
|---|---|---|
| `stripeCustomerId` | `string?` | One per user; never changes after first checkout. |
| `stripeSubscriptionId` | `string?` | **Canonical** — points to a manageable Stripe sub. Repaired automatically when stale. See [rules R5-R7](./rules.md#stripe-reference-integrity). |
| `savedPaymentMethods` | `Array<{paymentMethodId, isDefault, createdAt, lastUsed?}>` | Stripe payment method IDs only. **Never store card data.** PCI compliance. |
| `subscription` | embedded | See breakdown below. |
| `oneTimePackages` | `Array<{...}>` | Cross-cutting with this domain (one-time entry packs). |
| `serviceAccount` | `boolean?` | True for non-human service accounts (e.g. Norm AI). Filters the user out of admin Settings → Staff. See [auth/roles.md](../auth/roles.md#user-model-additions). |

### `subscription` subdocument fields

| Field | Type | Set by | Description |
|---|---|---|---|
| `packageId` | `string \| null` | checkout, downgrade, upgrade | Current package ID (string, not ObjectId — packages are static data). `null` when cleared. |
| `startDate` | `Date` | checkout webhook | When this subscription started. |
| `endDate` | `Date?` | cancel, webhook | Stripe's authoritative period end. For immediate-cancel: `Date.now()`. For period-end cancel: Stripe's `current_period_end`. |
| `cancelledAt` | `Date?` | cancel service | When the user/admin clicked cancel (≠ endDate). Tracks intent vs effective date. |
| `pastDueAt` | `Date?` | webhook (failed renewal) | When sub first entered `past_due`. Used for admin activity log and grace-period rules. |
| `isActive` | `boolean` | cancel, webhook | Server-derived. **Don't compute client-side.** See [rules F3](./rules.md#f3-dont-compute-isactive-client-side). |
| `autoRenew` | `boolean?` | cancel | False after any cancel. |
| `status` | `string?` | webhook | Mirrors Stripe status (`active`/`past_due`/`canceled`/...). |
| `pendingStripeSubscriptionId` | `string?` | checkout creation | Non-canonical sub created during initial checkout. Promoted to `stripeSubscriptionId` once status becomes manageable. |
| `pendingStripeSubscriptionRequestId` | `string?` | checkout | Idempotency key for the create call. |
| `pendingStripeSubscriptionCreatedAt` | `Date?` | checkout | For TTL/cleanup of abandoned pending subs. |
| `previousSubscription` | object | downgrade flow | Preserved benefits during downgrade — see below. |
| `pendingChange` | object | upgrade flow | In-flight upgrade waiting for payment — see below. |
| `lastDowngradeDate` | `Date?` | downgrade | Anti-gaming throttle. |
| `lastUpgradeDate` | `Date?` | upgrade | Webhook interference guard. |
| `lastMonthAccumulatedEntries` | `number?` | renewal cycle | Persists across cancel for resubscribe continuity. See [rules R3](./rules.md#r3). |
| `lastResubscribedAt` | `Date?` | `/api/stripe/create-subscription-existing-user` | **UX-only timestamp** — set when a resubscribe is detected (same `isResubscribeForMetadata` heuristic that drives `calculateResubscribeEntries`). Not used by entries math; drives the "Welcome back!" carry-over banner on `/purchase-success` (10-minute window) and the activity-card sub-line. Never set on initial subscribe, upgrade, downgrade, or renewal. |

#### `previousSubscription` (downgrade benefit-preservation)

When a user downgrades, the Stripe subscription updates immediately, but we preserve the OLD package's benefits until the original billing-cycle end:

```ts
previousSubscription?: {
  packageId: string;
  packageName: string;
  benefits: {
    entriesPerMonth: number;
    discountPercentage: number;
  };
  startDate: Date;
  endDate: Date;       // when old benefits expire
  downgradeDate: Date; // for audit
}
```

#### `pendingChange` (upgrade in flight)

```ts
pendingChange?: {
  newPackageId: string;
  changeType: "upgrade";  // ONLY upgrades — downgrades use previousSubscription instead
  stripeSubscriptionId?: string;
  paymentIntentId?: string;
  upgradeAmount?: number;  // cents
}
```

> Note: downgrades **no longer use** `pendingChange` — they use `previousSubscription` for benefit preservation. The schema retains `pendingChange.changeType` as the literal `"upgrade"` only.

## `MembershipPackage`

[src/models/MembershipPackage.ts](../../src/models/MembershipPackage.ts) — catalog of subscription tier and one-time pack offerings.

```ts
interface IMembershipPackage {
  name: string;
  type: "subscription" | "one-time";
  price: number;
  description: string;
  features: string[];
  entriesPerMonth?: number;       // subscription packages
  totalEntries?: number;          // one-time packages
  shopDiscountPercent?: number;
  partnerDiscountDays?: number;
  isMemberOnly?: boolean;
  stripeProductId?: string;
  stripePriceId?: string;
  isActive: boolean;
}
```

Indexes: `{ type: 1 }`, `{ isActive: 1 }`, `{ price: 1 }`. Timestamps enabled.

> **Static data caveat:** Package IDs are **strings** in `User.subscription.packageId`, not ObjectIds. The codebase treats packages as effectively static. Adding a new package requires both inserting into Mongo AND updating any hard-coded package config under [src/data/membershipPackages.ts](../../src/data/membershipPackages.ts) — otherwise UI rendering breaks even though the DB is correct.

## `MembershipRenewalCycle`

[src/models/MembershipRenewalCycle.ts](../../src/models/MembershipRenewalCycle.ts) — one row per renewal-invoice cycle. Used for analytics dashboards and to detect missed/duplicated renewals.

```ts
interface IMembershipRenewalCycle {
  stripeInvoiceId: string;        // unique
  userId: ObjectId;
  stripeSubscriptionId?: string;
  billingReason?: string;
  status: "expected" | "succeeded" | "failed" | "recovered";
  dueAt: Date;                    // invoice.period_end
  amountDueCents: number;
  amountPaidCents?: number;
  succeededAt?: Date;
  failedAt?: Date;
  paymentIntentId?: string;
  confidence: "stripe" | "backfill";
}
```

Indexes:
- `{ stripeInvoiceId: 1 }` (unique)
- `{ userId: 1 }`
- `{ stripeSubscriptionId: 1 }`
- `{ status: 1 }`
- `{ dueAt: 1 }`
- Compound: `{ dueAt: 1, billingReason: 1, status: 1 }`
- Compound: `{ userId: 1, dueAt: -1 }` (per-user history reads)

Collection name forced: `"membershiprenewalcycles"` (otherwise Mongoose would pluralise differently).

`confidence: "backfill"` rows are written by the reconciliation script for invoices that pre-date the cycle-tracking introduction. Don't trust them as authoritative for analytics that compare expected-vs-actual; filter to `confidence: "stripe"` for those.

## `MembershipStatusHistory`

[src/models/MembershipStatusHistory.ts](../../src/models/MembershipStatusHistory.ts) — event-sourced audit log of every subscription state transition.

```ts
type MembershipNormalizedStatus =
  | "active" | "trialing" | "past_due" | "unpaid"
  | "canceled" | "scheduled_cancel"
  | "incomplete" | "incomplete_expired" | "none";

type MembershipAnalyticsActor = "user" | "admin" | "stripe" | "system";

interface IMembershipStatusHistory {
  userId: ObjectId;
  effectiveAt: Date;
  membershipStatus: MembershipNormalizedStatus;
  actor: MembershipAnalyticsActor;
  source: string;                 // e.g. "webhook_invoice_payment_failed_renewal", "cancel_api_user", "cancel_api_admin"
  dedupeKey?: string;             // sparse-unique
  subscriptionPackageId?: string;
  autoRenew?: boolean;
  endDate?: Date;
  cancelledAt?: Date;
  pastDueAt?: Date;
  metadata?: Record<string, unknown>;
}
```

Indexes:
- `{ userId: 1 }`
- `{ effectiveAt: 1 }`
- `{ dedupeKey: 1 }` (sparse-unique)
- Compound: `{ userId: 1, effectiveAt: -1 }`
- Compound: `{ userId: 1, membershipStatus: 1, effectiveAt: -1 }`

Collection name forced: `"membershipstatushistories"`.

Writers:
- Cancel service → `recordCancellationAnalytics()` writes a row.
- Webhook handlers → write rows on `customer.subscription.{updated,deleted}` and `invoice.payment_{failed,succeeded}`.

Use `dedupeKey` to make webhook retries idempotent. Recommended formula: `${userId}:${effectiveAt.toISOString()}:${source}`.

## `ChargeJobLock`

[src/models/ChargeJobLock.ts](../../src/models/ChargeJobLock.ts) — single-document distributed lock for the past-due charge cron.

```ts
interface IChargeJobLock {
  _id: string;          // hard-coded "charge-job-lock"
  isLocked: boolean;
  lockedUntil: Date;
  lockedBy?: ObjectId;
  lockedAt?: Date;
}
```

Notable: the schema forces `_id: "charge-job-lock"` as the default, so the collection is always exactly one document. Acquire by setting `isLocked: true` with a `lockedUntil` lease; release by setting `isLocked: false`.

The model file deletes any cached Mongoose model before re-registering (`delete mongoose.models[modelName]`) — this is unusual; it's there to ensure schema changes always take effect during dev hot-reload.

> _TODO: locate the cron entry that uses ChargeJobLock — likely `src/lib/jobs/` or `src/app/api/cron/` — and document its schedule and the lease-renewal pattern. Cross-reference [infrastructure](../infrastructure/) when those docs exist._

## `MembershipDailySnapshot`

[src/models/MembershipDailySnapshot.ts](../../src/models/MembershipDailySnapshot.ts) — per-day, per-package roll-up of membership counts and revenue. Used by the admin dashboard to display point-in-time membership data for any selected past date.

```ts
interface IMembershipDailySnapshot {
  date: string;                    // "yyyy-MM-dd" in Australia/Sydney
  packageId: string;               // tradie-/foreman-/boss-subscription
  tz: "Australia/Sydney";          // recorded for forward-compat

  activeCount: number;             // active + trialing
  pastDueCount: number;            // past_due + unpaid
  scheduledCancelCount: number;    // autoRenew=false but still active
  cancelledCount: number;          // fully terminated

  unitPriceCents: number;          // package.price × 100, locked at write time
  activeRevenue: number;           // (activeCount × unitPriceCents) / 100
  pastDueRevenue: number;          // (pastDueCount × unitPriceCents) / 100

  confidence: "live";              // currently only one value; field retained for forward-compat
  computedAt: Date;
  sourceVersion: number;
}
```

Indexes:
- `{ date: 1 }`
- `{ date: 1, packageId: 1 }` (unique) — drives upsert and lookup

Collection name forced: `"membershipdailysnapshots"`.

**Writers:** [src/app/api/cron/membership-daily-snapshot/route.ts](../../src/app/api/cron/membership-daily-snapshot/route.ts) (nightly, fires at 14:00 + 15:00 UTC for redundancy).

**Readers:** `MembershipAnalyticsService.getMembershipByPackageSnapshot(asOfDate)`.

**Locked-in pricing:** `unitPriceCents` is captured at write time. A future package price change writes new snapshots at the new price; existing rows keep the old price. Historical revenue is immutable.

**Behavior on missing rows:** When the snapshot reader is asked for a date with no row (e.g., any date before this collection was first populated, or a one-off cron outage), it falls back to live counts and sets `summary.snapshotMissing: true` so the UI can flag the result. **No reconstruction is performed** — the dashboard surfaces the unknown state explicitly rather than fabricating it.

## `CancellationFlowEvent`

[src/models/CancellationFlowEvent.ts](../../src/models/CancellationFlowEvent.ts) — one document per cancellation-flow session. Records why a user initiated cancellation, which retention offers were shown, whether an offer was accepted, and the final outcome.

```ts
type CancellationReason =
  | "too_expensive" | "prefer_cheaper" | "dont_use_benefits"
  | "too_many_messages" | "joined_for_giveaway" | "havent_won" | "other";

type OfferType =
  | "pause_30d" | "discount_50_2mo" | "tier_downgrade"
  | "unsubscribe_marketing" | "bonus_entries_100";

interface ICancellationFlowEvent {
  userId: ObjectId;
  reason: CancellationReason;     // required; selected from pre-defined list
  reasonText?: string;            // optional free-text elaboration
  offersShown: OfferType[];       // ordered list of retention offers presented
  offerAccepted?: OfferType | null; // null until user accepts (or never if they decline all)
  outcome: "in_progress" | "saved" | "cancelled"; // lifecycle state
  pastDue: boolean;               // true if user was past-due when flow started
  startedAt: Date;                // when user entered the cancellation flow
  endedAt?: Date;                 // when the flow closed (saved or cancelled)
  savedAt?: Date;                 // set only when outcome === "saved"
  retention90?: "retained" | "churned" | null; // backfilled ~90 days post-event
}
```

### Field notes

- **`outcome` lifecycle:** begins as `"in_progress"` when the flow opens. Transitions to `"saved"` (user accepted an offer and kept their membership) or `"cancelled"` (user completed cancellation). A document stuck in `"in_progress"` indicates an abandoned session.
- **`pastDue`:** captured at flow-entry time. Past-due users see a different offer set and are exempt from some retention offers (e.g. billing-pause is not available when already past-due).
- **`savedAt`:** only set when `outcome === "saved"`. Use this alongside `startedAt` to measure time-to-save and for cohort analysis.
- **`retention90`:** nullable enum — starts `null`, backfilled by a script ~90 days after `savedAt` to record whether the "saved" user actually retained or churned. The enum has no `null` value (Mongoose skips enum validation for `null`), so the field defaults to `null` without a required constraint.
- **`offerAccepted`:** `null` by default; set to the accepted `OfferType` string when outcome becomes `"saved"`. The enum constraint is skipped for the `null` default by Mongoose design.

### Indexes

- `{ userId: 1 }` — per-user history queries
- `{ outcome: 1 }` — filter by lifecycle state
- `{ retention90: 1 }` — backfill targeting
- Compound: `{ outcome: 1, savedAt: 1, retention90: 1 }` — analytics queries joining save rate and 90-day retention

## `User.retentionOffersConsumed` (top-level flags on `User`)

Two boolean flags that gate the new cancellation-flow one-time retention offers. Both default to `false`. Set to `true` when the user successfully redeems the corresponding offer — prevents repeat redemption across sessions.

| Field | Type | Offer gated |
|---|---|---|
| `retentionOffersConsumed.pause30d` | `boolean` (default `false`) | 30-day billing pause offer |
| `retentionOffersConsumed.discount50_2mo` | `boolean` (default `false`) | 50% discount for 2 months offer |

**+100 entries offer:** reuses the existing top-level `cancellationUpsellRedeemed` flag (and `cancellationUpsellRedeemedAt`). No new field was added for it — the legacy flag was already purpose-built for this one-time offer and its semantics are identical.
