# Admin — Gotchas

## "Edit Entries" never writes `entriesBySource.membership = totalEntries`

The admin major-draw participation form ([`src/components/admin/UserDetailModal.tsx`](../../src/components/admin/UserDetailModal.tsx) "Edit Entries" tab) sends only `{ drawId, totalEntries }` per row to [`syncMajorDrawParticipation`](../../src/features/admin/users/server/mutations.ts). The mutation **must not** force-set `entriesBySource.membership` to `participation.totalEntries` — the previous implementation did, and on every save it silently wiped the source breakdown.

Concrete failure (the Cody case): a refund left a user with `{ total: 800, membership: 0, upsell: 800 }`; an admin opened the user, pressed Save without changing anything, and the row became `{ total: 800, membership: 800, upsell: 800 }` (sum 1600 ≠ total 800).

Current behavior:
- **Existing entry**: only `totalEntries` and `lastUpdatedDate` are updated. The existing `entriesBySource` is preserved exactly.
- **New entry** (no previous row): initialized with `{ membership: totalEntries }` because that's the only signal the form gives us.

If a future workflow needs to adjust a per-source count, extend `majorDrawParticipationSchema` to accept a per-source payload before changing this code.



## Middleware vs handler gating

Common mistake: assuming `/api/admin/**` is gated by middleware. NOT TRUE. Middleware excludes `/api`. Each handler must `requireAdmin(session)` itself.

Symptom: a missing `requireAdmin()` in a route handler doesn't fail in dev (you're logged in as admin); it only fails when a malicious user discovers the unprotected endpoint.

## Audit drift

If admin path doesn't write the audit row that user path writes, analytics drift between cancel actors. The shared-service pattern ([P4](./patterns.md#p4-shared-service-for-user--admin-paths)) prevents this.

## Past-due cancel race

Cancelling a past-due subscription always immediate-cancels (no period to preserve). Make sure the admin UI surfaces this — admin checks "cancel at period end," but the service ignores the option for past-due. The UI should warn / explain.

## Modal stacking in admin

Multiple admin modals (UserDetail + ChargePastDue + ErrorReport) can stack. Coordinate via `useModalPriorityStore`.

## Sanitised log echoes

If admin UI shows raw Stripe responses, card data leaks into screenshots / shared screens. Always sanitise before display.

## `invoices.pay()` does not guarantee the invoice is paid

`stripe.invoices.pay()` can return without throwing even when the PaymentIntent ends up in `requires_confirmation` — the charge is never attempted, `latest_charge` is `null`, and the invoice stays `open`. This happens especially when the invoice already had a PI from a prior finalization attempt (common in Force Charge and stranded-recovery flows).

**Never** check `paidInvoice.status === "paid"` on the response alone and log success. Instead:

1. After `invoices.pay()`, extract the PI id via `extractPaymentIntentId` and `stripe.paymentIntents.retrieve()`.
2. Call `decidePostPayAction(invoice, pi)` from `src/server/admin/chargePastDuePostPayPolicy.ts`.
3. If `needs_confirm`, call `stripe.paymentIntents.confirm({ off_session: true })`, re-fetch the invoice, and re-decide.
4. Only `decision.kind === "success"` should produce a `status: "success"` log row.

`payOpenInvoiceAsPastDueAdmin` in `chargePastDueShared.ts` implements this pattern. Any new code that calls `stripe.invoices.pay()` should follow the same pattern or delegate through that function.

## Stripe API 2025-04-01+ period field migration

`current_period_start` and `current_period_end` were removed from the Subscription root in Stripe API version `2025-04-01` (Basil). They now live on each `subscription.items.data[*]` instead.

**Affected function:** `checkForceChargeEligibility` in `src/server/admin/forceChargePastDue.ts`

The fix reads from `subscription.items.data[0]` first (new API) and falls back to the subscription root (old API). Any code that casts a subscription object and reads `.current_period_start` / `.current_period_end` directly will silently get `undefined` on the new API — guard against both locations.

For a shared helper that abstracts this, see `src/utils/payment/stripe/subscription-period.ts` (`getSubscriptionPeriodEnd`).

## AEST date filters: `endDate` is **exclusive**, not inclusive

The past-due charge history endpoints (`/api/admin/charge-past-due/runs`, `/api/admin/charge-past-due/manual-retries`) interpret `YYYY-MM-DD` query strings as **Australia/Sydney calendar days**, not UTC dates. The two helpers in [`src/services/admin/chargePastDueHistory.ts`](../../src/services/admin/chargePastDueHistory.ts) drive this:

- `parseAestDayStartUtc("2026-05-06")` → UTC instant of `2026-05-06T00:00:00+10:00` (or `+11:00` in AEDT). Used as `$gte` (inclusive lower bound).
- `parseAestDayEndExclusiveUtc("2026-05-06")` → UTC instant of `2026-05-07T00:00:00` AEST. Used as **`$lt`** (exclusive upper bound), so the entire AEST `May 6` day is included regardless of DST transitions.

**The pitfall:** anyone copying this filter pattern into a new endpoint must also use `$lt` (not `$lte`) and the next-day-AEST instant — using `$lte` against `parseAestDayStartUtc(endDate)` silently excludes everything that happened *on* the end day. The Mongo filter builders in `chargePastDueHistory.ts` (`buildRunsFilter`, `buildManualRetriesFilter`) get this right; new admin date-range queries should reuse those helpers rather than reinvent date parsing.

## DrawSelect caps at 100 records

`useAdminMajorDrawsList` and `useAdminMiniDrawsList` request `limit=100`
from the admin history/list endpoints. If a user's draw participation
references an older draw that falls outside the most recent 100 records,
the `DrawSelect` trigger renders an amber warning with the last 4 chars
of the ObjectId ("Unknown draw …a3f2") rather than the draw name.

The card header falls back to `Major Draw {N}` / `Mini Draw {N}` in this
case. The form still saves correctly because the stored `drawId` is
untouched — only the visible label is degraded.

If this starts happening in normal admin flows (not just historical
archaeology), raise the cap or add server-side search to both endpoints.

## `errorCode` vs `declineCode` — prefer the specific one

Stripe surfaces two related fields on a card decline:

- `error.code` (persisted as `errorCode` on `InvoiceChargeLog`) — generic bucket like `card_declined`, `expired_card`, `incorrect_cvc`.
- `error.decline_code` (persisted as `declineCode`) — the specific reason inside the `card_declined` bucket: `do_not_honor`, `insufficient_funds`, `lost_card`, `stolen_card`, `pickup_card`, etc.

Most failed live attempts arrive with `errorCode === "card_declined"` and the actionable detail in `declineCode`. The `extractStripeErrorFields` helper in [`chargePastDueShared.ts`](../../src/server/admin/chargePastDueShared.ts) extracts both, and all four `InvoiceChargeLog.create` save sites in `payOpenInvoiceAsPastDueAdmin` persist them. The `PostPayDecision.failed` variant in [`chargePastDuePostPayPolicy.ts`](../../src/server/admin/chargePastDuePostPayPolicy.ts) also carries an optional `declineCode` (sourced from `paymentIntent.last_payment_error?.decline_code` in the `requires_payment_method` branch).

**UI rule:** display `declineCode ?? errorCode ?? errorMessage`. Both `PastDueChargeHistory.tsx` and `PastDueChargeHistoryDrawer.tsx` follow this precedence; new admin views over `InvoiceChargeLog` should too.
