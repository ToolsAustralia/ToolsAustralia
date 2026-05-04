# Stripe Auto-Allowlist — Design

**Date:** 2026-05-04
**Status:** Draft — pending implementation plan
**Domain:** `billing-stripe`
**Worktree:** `.worktrees/stripe-allowlist` (branch `claude/stripe-allowlist`, off `main`)

---

## 1. Problem

Stripe automatically blocks future charge attempts on a card after the issuing bank declines it with certain hard codes (the dashboard activity log surfaces this as *"When the customer's bank declined that payment, it directed Stripe to block future attempts"*). The block survives even after the underlying issue resolves (e.g. a `do_not_honor` triggered by the bank's fraud system, or transient `insufficient_funds`).

The Tools Australia Stripe account currently has **196 blocked transactions** in this state, all on existing membership tiers (`Boss`, `Foreman`, `Tradie`). Risk level on the sample we inspected was `Normal` — these are not Radar fraud blocks; they are issuer-directed auto-blocks that lock legitimate members out of renewal.

The dashboard exposes a per-transaction "Add to allow list" button which writes to Stripe Radar's built-in `allow_card_fingerprint` value list and overrides both Radar's fraud rules *and* the issuer-directed auto-block. Doing this 196 times manually — and for every new block going forward — is the operational pain we are removing.

## 2. Goal

Build an automated, auditable system that:

1. Allowlists already-blocked cards in bulk via an admin UI (clears the existing 196 in one action).
2. Allowlists newly-blocked cards in real time via the existing Stripe webhook, when both filter rules pass.
3. Records every decision (added, skipped, removed) in a Mongo audit collection so we can answer "why did we let this charge through?" if a chargeback later appears.
4. Supports manual reversal from the same admin page, in case an allowlist decision later proves wrong.

## 3. Non-goals

- **No standalone CLI script.** The admin page replaces it — same workflow, with a human checkpoint.
- **No automatic reversal on chargeback.** A `charge.dispute.created` listener that auto-removes from allowlist is plausible but premature; chargebacks happen for non-fraud reasons (friendly fraud, customer complaints) and auto-reversal would over-correct. Defer to a follow-up once we have data.
- **No notifications.** No Slack/email alerts when cards are skipped or added in v1. The admin page is the surface; admins check it when they care.
- **No bulk reversal.** Per-row "Remove" only. Reversal volume should be tiny.
- **No new Radar rules.** We write to the built-in `allow_card_fingerprint` list. We do not create custom value lists or modify Radar's rule set.
- **Email/IP allowlists not used.** Only `allow_card_fingerprint` overrides Stripe's issuer-directed auto-block; email and IP allow lists only override Radar's fraud rules.

## 4. Filter rules (the eligibility decision)

A card is eligible for **automatic** allowlisting if and only if **both** of the following hold:

### Rule 1 — decline reason is not a fraud signal

```ts
const FRAUD_SIGNAL_DECLINE_CODES = new Set([
  "lost_card", "stolen_card", "pickup_card", "fraudulent",
]);
// Card is rejected if `last_payment_error.decline_code` is in this set.
```

These four codes mean the issuer has flagged the card as compromised. Allowlisting won't make charges succeed (issuer keeps declining) and ignores a real fraud signal. All other decline codes — including `expired_card`, `incorrect_cvc`, etc. — are eligible. The simpler rule (skip only fraud signals) is preferred over a stricter rule (skip permanent-issue codes too) because the cost of allowlisting a permanent-issue card is zero (charge fails at issuer either way) and the simpler rule is easier to audit.

### Rule 2 — card belongs to a known paying member

```ts
const userId = await resolveUserId(customerEmail, stripeCustomerId);
if (!userId) return notMember;

const hasPaid = await PaymentEvent.exists({ userId, status: "succeeded" });
if (!hasPaid) return notMember;
```

A "known paying member" is any `User` document with at least one `PaymentEvent` with `status: "succeeded"`. This includes lapsed members who paid once and churned — exactly the population whose retries we want to recover. New users who have never successfully paid are excluded; their first attempt failing is not a recovery case, it's a stranger.

`resolveUserId` matches on `stripeCustomerId` first (most reliable), falls back to `customerEmail` against the `User` collection. If both miss, return `not_member`.

### Manual override

The admin page lets a human bypass either filter rule by selecting a row that previewed as ⚠ skip-eligible and clicking "Allowlist selected." This writes an `AllowlistAction` with `reason: "manual_admin_override"` for the audit trail.

## 5. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Stripe (issuer-directed auto-block + Radar allowlist API)       │
└──────────────────────────────────────────────────────────────────┘
        ▲                                      ▲
        │ POST radar.value_list_items          │ webhook events
        │                                      │
┌───────┴───────────────────────────┐  ┌──────┴──────────────────┐
│  src/services/allowlist/          │  │  /api/stripe/webhook    │
│    AllowlistService               │◄─┤  (existing handler,     │
│    - evaluate(input) → eligible?  │  │   add new branch)       │
│    - apply(input,source) → action │  └─────────────────────────┘
│    - reverse(actionId) → action   │
│    - listBlockedFromStripe(filter)│◄─┐
└───────────┬───────────────────────┘  │
            │                          │ uses same service
            ▼                          │
┌───────────────────────────────────┐  │
│  AllowlistAction (Mongo)          │  │
│  audit log of every decision      │  │
└───────────────────────────────────┘  │
                                       │
┌──────────────────────────────────────┴───────────────────────┐
│  /admin/billing/blocked-cards (new page)                     │
│  - lists blocked cards from Stripe + skipped actions         │
│  - filters: date, member-status, decline-reason, skip-only   │
│  - bulk select → "Allowlist selected" → service.apply()      │
│  - per-row "Remove" on already-allowlisted entries           │
└──────────────────────────────────────────────────────────────┘
```

**Key principle:** one service, three callers. Filter logic, Stripe API calls, and audit-log writes live in `AllowlistService`. The webhook calls it for real-time auto-allowlisting; the admin page calls it for bulk human-driven runs (including the existing 196); the reverse button calls it to undo. Exactly one place to change the filter rule if it needs tuning.

This places business logic in `services/` per the project's strict layering rules (`.cursor/rules/.cursorrules`, `CLAUDE.md`). Route handlers stay thin: parse, validate, authorize, delegate.

## 6. Data model

New Mongoose model at `src/models/AllowlistAction.ts`:

```ts
{
  _id: ObjectId,

  // What we're acting on
  cardFingerprint: string,          // Stripe card fingerprint, e.g. "Xt5EWLLDS7FJjR1c"
  cardLast4: string,                // for display only, e.g. "0769"
  cardBrand: string,                // "visa" | "mastercard" | ...

  // Who it belongs to (best-effort — null if we can't resolve)
  stripeCustomerId: string | null,  // "cus_..."
  userId: ObjectId | null,          // ref to User if email match exists
  customerEmail: string | null,

  // The decision
  action: "added" | "skipped" | "removed",
  reason:
    | "auto_eligible"           // webhook auto-add: passed filter
    | "manual_admin"            // admin clicked "Allowlist selected"
    | "manual_admin_override"   // admin allowed despite skipped reason
    | "filter_not_member"       // skipped: no prior successful payment
    | "filter_fraud_signal"     // skipped: lost/stolen/pickup/fraudulent
    | "manual_reversal",        // removed: admin clicked "Remove"

  // Trigger context (for audit)
  declineCode: string | null,
  failureCode: string | null,
  triggeringPaymentIntentId: string | null,
  triggeringChargeId: string | null,

  // Stripe linkage (for reversal)
  stripeListItemId: string | null,    // "rsli_..." — null for skipped/removed rows

  // Provenance
  source: "webhook" | "admin_bulk" | "admin_reversal",
  performedByUserId: ObjectId | null, // admin who clicked, null for webhook
  createdAt: Date,
}
```

**Indexes:**

- `{ cardFingerprint: 1, action: 1, createdAt: -1 }` — fast lookup of "is this fingerprint currently allowlisted by us?" (latest action wins)
- `{ stripeCustomerId: 1, createdAt: -1 }` — for surfacing on the user-detail page if needed later
- `{ action: 1, createdAt: -1 }` — for the admin page's "show only skipped" filter

**Source of truth:** Stripe's value-list state is the source of truth for *what is currently allowlisted*. `AllowlistAction` is the audit log of *our decisions*. Drift is tolerated (e.g. someone removes a list item via the dashboard) — our table records what we did, not what's in Stripe right now.

## 7. Service interface

`src/services/allowlist/AllowlistService.ts`:

```ts
type EvalInput = {
  cardFingerprint: string;
  cardLast4: string;
  cardBrand: string;
  stripeCustomerId: string | null;
  customerEmail: string | null;
  declineCode: string | null;
  failureCode: string | null;
  triggeringPaymentIntentId: string | null;
  triggeringChargeId: string | null;
};

type EvalResult =
  | { eligible: true; userId: ObjectId | null }
  | { eligible: false; reason: "filter_not_member" | "filter_fraud_signal" };

type ApplySource = "webhook" | "admin_bulk";

class AllowlistService {
  /** Pure-ish evaluation. No Stripe write. No Mongo write. */
  evaluate(input: EvalInput): Promise<EvalResult>;

  /** Evaluate, then either add+log (eligible) or log-skip (not eligible).
   *  If `allowOverride` is true and source is "admin_bulk", a not-eligible
   *  evaluation still results in an "added" row with reason "manual_admin_override". */
  apply(
    input: EvalInput,
    source: ApplySource,
    performedByUserId: ObjectId | null,
    allowOverride?: boolean,
  ): Promise<AllowlistAction>;

  /** Idempotency: returns existing "added" row if one exists for this fingerprint. */

  /** Reads the stored `stripeListItemId` from the AllowlistAction row,
   *  calls `valueListItems.del`, and writes a "removed" AllowlistAction. */
  reverse(actionId: ObjectId, performedByUserId: ObjectId): Promise<AllowlistAction>;

  /** Queries Stripe for currently-blocked PIs in a date range,
   *  joins against AllowlistAction skipped rows, returns rows for the admin page. */
  listBlockedFromStripe(filter: BlockedFilter): Promise<BlockedRow[]>;
}
```

The `allow_card_fingerprint` Radar list ID is resolved once at module load via `stripe.radar.valueLists.list({ alias: "allow_card_fingerprint" })` and cached for the process lifetime.

## 8. Webhook integration

Add a new branch to the existing `case "payment_intent.payment_failed":` handler in `src/app/api/stripe/webhook/route.ts`. Runs *after* the existing handler — does not replace it.

```ts
case "payment_intent.payment_failed": {
  await existingPaymentFailedHandler(pi);  // unchanged

  const charge = pi.latest_charge && typeof pi.latest_charge !== "string"
    ? pi.latest_charge
    : await stripe.charges.retrieve(pi.latest_charge);

  const isBlocked =
    charge?.outcome?.type === "blocked" ||
    charge?.outcome?.network_status === "declined_by_network";

  if (isBlocked && charge?.payment_method_details?.card?.fingerprint) {
    const card = charge.payment_method_details.card;
    try {
      await allowlistService.apply({
        cardFingerprint: card.fingerprint,
        cardLast4: card.last4,
        cardBrand: card.brand,
        stripeCustomerId: typeof pi.customer === "string" ? pi.customer : pi.customer?.id ?? null,
        customerEmail: pi.receipt_email ?? charge.billing_details?.email ?? null,
        declineCode: pi.last_payment_error?.decline_code ?? null,
        failureCode: pi.last_payment_error?.code ?? null,
        triggeringPaymentIntentId: pi.id,
        triggeringChargeId: charge.id,
      }, "webhook", null);
    } catch (err) {
      // Best-effort. Do not bubble — bubbling would cause Stripe to retry the
      // entire payment_intent.payment_failed webhook, re-running the existing
      // handler. Log to ErrorReport and let admin bulk catch up if needed.
      await reportError("AllowlistService.apply (webhook)", err, { paymentIntentId: pi.id });
    }
  }
  break;
}
```

The `outcome.type === "blocked"` / `outcome.network_status === "declined_by_network"` check distinguishes "Stripe blocked future attempts" from a normal one-off decline. We only act on the former.

**Idempotency:** before calling Stripe, `apply()` checks Mongo for an existing `{ cardFingerprint, action: "added" }` row. If found, it's a no-op (returns the existing row). This handles duplicate webhook deliveries and double-clicks on the admin button.

## 9. Admin page

`src/app/admin/billing/blocked-cards/page.tsx` — uses existing admin layout, existing admin auth gating, existing TanStack Query patterns.

**Layout:**

```
┌──────────────────────────────────────────────────────────────────┐
│  Blocked cards                                          [Refresh]│
├──────────────────────────────────────────────────────────────────┤
│  Filters                                                          │
│    Date range:  [Last 30 days ▾]                                 │
│    Member status:  [Any] [Has paid before] [Never paid]          │
│    Decline reason: [Any] [Transient only] [Fraud signals only]   │
│    Show:           [All] [Skipped by automation only]            │
│                                                                   │
│  ┌─[✓] Select all 142 matching ──────────[Allowlist 142 selected]│
│  │                                                                 │
│  │ ☐  Date         Email                Card    Decline      Why │
│  │ ☑  1 May 23:01  gj2smith71@…         ••0769  do_not_honor  ✓ │
│  │ ☑  1 May 10:38  laytahh25@…          ••7143  ins_funds     ✓ │
│  │ ☐  1 May 10:09  hudson.2010jd@…      ••1446  lost_card     ⚠ │
│  └─────────────────────────────────────────────────────────────── │
│                                                                   │
│  Recently allowlisted (last 50)                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 4 May 09:12  gj2smith71@…  ••0769  by webhook  [Remove] │   │
│  │ 4 May 09:08  laytahh25@…   ••7143  by admin    [Remove] │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

**Default filter on load:** `Member status = Has paid before` AND `Decline reason = Any except fraud signals` — what automation would have allowlisted. Admin reviews, clicks "Select all matching," clicks "Allowlist N selected." This is the workflow that clears the existing 196 in one pass.

The ✓/⚠ column previews `evaluate()` for each row, so admin sees in advance which rows are "auto-eligible" vs. "would be skipped" before clicking. Selecting a ⚠ row and clicking Allowlist invokes `apply(..., source: "admin_bulk", allowOverride: true)`, which writes `reason: "manual_admin_override"`.

## 10. API endpoints

All under `src/app/api/admin/allowlist/`, all gated with the existing admin auth helper, all thin handlers that delegate to `AllowlistService`:

```
GET  /api/admin/allowlist/blocked-cards
       Query params: dateFrom, dateTo, memberStatus, declineReason, skippedOnly
       Returns: BlockedRow[] with eligibility preview attached

POST /api/admin/allowlist/apply
       Body: { fingerprints: string[], allowOverride: boolean }
       Loops AllowlistService.apply() per fingerprint.
       Returns: { added: number, skipped: number, errors: Array<{fingerprint, message}> }

POST /api/admin/allowlist/reverse
       Body: { actionId: string }
       Calls AllowlistService.reverse().
       Returns: the new "removed" AllowlistAction row.

GET  /api/admin/allowlist/actions
       Query params: limit (default 50), action ("added" | "skipped" | "removed" | "all")
       Returns: AllowlistAction[] sorted by createdAt desc.
       Used by the "Recently allowlisted" widget on the admin page.
```

The `blocked-cards` GET endpoint queries Stripe directly (`stripe.paymentIntents.list` + `stripe.charges.list` filtered to `outcome.type=blocked`). Stripe is the source of truth for "what's currently blocked." We do not maintain a parallel mirror in Mongo.

**TanStack Query hooks** at `src/hooks/queries/admin/useBlockedCards.ts` and `useAllowlistActions.ts`, following existing patterns. Mutations invalidate the relevant query keys after success.

## 11. Error handling

| Boundary | Failure mode | Handling |
|---|---|---|
| `valueListItems.create` | Already exists (`value_already_exists`) | Treat as success — fetch the existing item, write `added` row pointing to it. Idempotency. |
| `valueListItems.create` (admin bulk) | Rate limit (429) / Network / 5xx | Bubble per-fingerprint, surface in the response's `errors` array. The other fingerprints in the batch still get processed. No Mongo row for the failed one. |
| `valueListItems.create` (webhook) | Any error | **Swallow and log via `ErrorReport`.** Returning a non-200 from the webhook would cause Stripe to retry the entire `payment_intent.payment_failed` event, re-running the existing (already-completed) handler. The allowlist branch is best-effort: if it fails, the card stays blocked and an admin can clean up via the bulk page. |
| Webhook | Charge has no `payment_method_details.card.fingerprint` | Skip silently (alt payment methods, ApplePay pre-tokenization). No Mongo row. |
| Admin bulk | One fingerprint fails mid-batch | Continue the loop; aggregate errors into the response. Frontend shows partial success. |
| `evaluate()` | `User`/`PaymentEvent` lookup throws | Bubble — better to fail loudly than skip-with-wrong-reason. |
| `valueListItems.del` | 404 (already gone) | Treat as success — Stripe is already in the desired state. Write the `removed` row anyway. |

## 12. Edge cases

- **Same fingerprint, multiple users.** A card shared across two `User` records (household). `evaluate()` matches *any* user with prior successful payment, attaches the first match's `userId`. Allowlisting is per-card — both users benefit.
- **Card later compromised.** A card we allowlisted gets reported lost. Future attempts now decline with `lost_card` at the issuer; Stripe's auto-block doesn't re-engage (it's allowlisted). Customer sees the actual `lost_card` error and updates payment method. This is correct — exactly what a normal non-blocked card would do.
- **Customer email empty.** Some PIs (invoice retries) don't carry `receipt_email`. Fall back to `charge.billing_details.email` then to `customer.email` looked up by `stripeCustomerId`. If still empty, `evaluate()` returns `filter_not_member`.
- **Backfill volume.** 196 calls is well under Stripe's rate limits. Sequential `for await` loop with a 50ms delay between calls is fine.
- **List growth.** Stripe value lists scale to tens of thousands of items. A "stale entry" cleanup script can be added later if it ever matters; not in v1.

## 13. Testing

Following the repo convention (standalone `tsx` scripts under `__tests__/*.test.ts` with a matching `package.json` script). Add `"test:allowlist": "tsx src/services/allowlist/__tests__/AllowlistService.test.ts"`.

Test file: `src/services/allowlist/__tests__/AllowlistService.test.ts`. Coverage:

- `evaluate()` returns `filter_fraud_signal` for each of `lost_card`, `stolen_card`, `pickup_card`, `fraudulent`
- `evaluate()` returns `filter_not_member` when no User exists
- `evaluate()` returns `filter_not_member` when User exists but no successful PaymentEvent
- `evaluate()` returns `eligible: true` when User has at least one succeeded PaymentEvent
- `apply()` writes `added` row + calls Stripe when eligible
- `apply()` writes `skipped` row + does NOT call Stripe when not eligible
- `apply()` is idempotent — second call with same fingerprint returns existing row, no second Stripe call
- `apply()` with `allowOverride: true` and not-eligible input still writes `added` row with `reason: "manual_admin_override"`
- `reverse()` writes `removed` row + calls `valueListItems.del`
- `reverse()` treats Stripe 404 as success

Stripe SDK is mocked at the module boundary (existing pattern in `src/services/subscription/__tests__/`). PaymentEvent and User reads hit a real test Mongo via the existing test harness.

## 14. Documentation impact

- **Update** `docs/billing-stripe/architecture.md` — add the AllowlistService to the service inventory.
- **Update** `docs/billing-stripe/models.md` — add the `AllowlistAction` schema.
- **Update** `docs/billing-stripe/api.md` — document the three new admin endpoints.
- **Update** `docs/billing-stripe/gotchas.md` — explain Stripe's issuer-directed auto-block, why allowlisting overrides it, and the `outcome.type === "blocked"` signal in webhooks. This is exactly the kind of subtlety the gotchas doc exists for.
- **Update** `CLAUDE.md` Domain Manifest: add new paths to `billing-stripe.paths` (no new domain):
  - `src/services/allowlist/**`
  - `src/models/AllowlistAction.ts`
  - `src/app/api/admin/allowlist/**`
  - `src/app/admin/billing/blocked-cards/**`
  - `src/hooks/queries/admin/useBlockedCards.ts`
  - `src/hooks/queries/admin/useAllowlistActions.ts`

## 15. Worktree plan

The implementation runs in a new worktree:

```
git worktree add .worktrees/stripe-allowlist -b claude/stripe-allowlist origin/main
```

Branched from `main` (not from `claude/ShopFeature` or `claude/shop-setup`) so this work is independent of the in-flight shop feature. The implementation plan (next step) will create the worktree as its first step.

## 16. Out-of-scope follow-ups

These are real ideas worth tracking but explicitly deferred:

- Auto-reversal on `charge.dispute.created` — needs data on which dispute reasons actually warrant un-allowlisting before we automate.
- Slack/email notifications when fraud-signal cards are skipped at high volume — could indicate a wider fraud incident.
- Bulk reversal in the admin page — only useful if we discover reversal is more common than projected.
- A "user detail page" widget showing allowlist actions for that specific user — useful for support staff during ticket triage.
