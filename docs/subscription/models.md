# Subscription — Mongo models

5 collections own subscription state. Schemas live in [`src/models/`](../../src/models/).

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
