# Blocked Transactions — Capture Coverage + Admin UX

**Date:** 2026-05-07
**Branch:** claude/blocked-transactions
**Domain:** billing-stripe (admin-facing surface lives in `admin`)

## Problem

Two issues with the existing `/admin/blocked-transactions` page:

**1. Capture coverage gap.** Some Stripe-blocked charges in the dashboard are missing from the admin tab. The webhook only writes a `BlockedTransaction` row from `payment_intent.payment_failed`; for issuer-blocked subscription renewals Stripe sometimes fails the charge before the PI event fires — only `charge.failed` (and `invoice.payment_failed`) reach the webhook. The current daily reconcile cron *detects* the drift via `console.error` but does not heal it.

**2. Admin UX gaps.** The page lacks email search, an all-time allowlist count, clickable user emails, granular decline-code filtering, and consistent date-filter design with the past-due charge history page.

## Goals

- Every Stripe `outcome.type === "blocked"` charge ends up in `BlockedTransaction` within minutes (live path) and within 24h (safety net).
- Admins can search the page by email, filter by eligibility verdict and specific decline codes, and click an email to open the existing `UserDetailModal`.
- Date-range UX matches `/admin/past-due-history` (chips + custom modal + mobile portal).
- A diagnostic script exists to verify capture coverage on demand.

## Non-goals

- Changing how `AllowlistService.evaluate` decides eligibility.
- Re-running historical backfills automatically (Phase B's one-shot script is unchanged).
- Adding `outcome.network_status === "declined_by_network"` to the persistence predicate (deliberately excluded; see `gotchas.md` — would 16x-inflate the collection with non-allowlist-relevant declines).

---

## Design

### 1. Capture path — write side

#### 1.1 New `charge.failed` webhook handler

In [src/app/api/stripe/webhook/route.ts](../../../src/app/api/stripe/webhook/route.ts) add a new case:

```typescript
case "charge.failed": {
  const charge = event.data.object as Stripe.Charge;
  if (charge.outcome?.type !== "blocked") break;          // narrow gate
  if (!charge.payment_method_details?.card?.fingerprint) break;

  try {
    const pi =
      typeof charge.payment_intent === "string"
        ? await stripe.paymentIntents.retrieve(charge.payment_intent)
        : charge.payment_intent ?? null;
    if (!pi) break;

    const { buildBlockedTransactionRecord, upsertBlockedTransaction } =
      await import("@/services/allowlist/blockedTransactionRepo");
    const record = buildBlockedTransactionRecord(pi, charge);
    if (record) await upsertBlockedTransaction(record);
  } catch (err) {
    webhookLog("error", `BlockedTransaction upsert (charge.failed) failed for ${charge.id}: ${err instanceof Error ? err.message : String(err)}`);
  }
  break;
}
```

Key invariants:
- **Idempotent**: `_id: pi.id` upsert in `upsertBlockedTransaction`. A duplicate from the existing `payment_intent.payment_failed` branch just refreshes `capturedAt`.
- **No allowlist apply here.** `AllowlistService.apply()` stays in the `payment_intent.payment_failed` branch only. Calling it from both events would double-write skipped/added `AllowlistAction` rows.
- **Best-effort try/catch.** Same rationale as the existing branch: rethrowing forces Stripe to retry the entire event and re-run upstream side effects.
- **Stripe webhook configuration**: must subscribe `charge.failed` in the Stripe dashboard webhook config. Add to deployment checklist.

#### 1.2 Self-healing reconcile cron

Modify [src/app/api/cron/reconcile-blocked-transactions/route.ts](../../../src/app/api/cron/reconcile-blocked-transactions/route.ts):

- Widen window from "yesterday UTC" to **last 48 hours** (handles late-arriving events + DST edge cases).
- During the existing Stripe iteration, capture each blocked charge's `(piId, chargeId)`.
- After the iteration, `BlockedTransaction.find({ _id: { $in: piIds } }).distinct("_id")` → set of present PIs.
- For each Stripe blocked charge whose PI is NOT in the present set: fetch the PI and call `upsertBlockedTransaction()`.
- Emit `console.error` summary including `recovered: N` count when N > 0 (still alerts so we know the live path missed events; we just heal in the same run).

The cron stays read-only with respect to Stripe (no Radar / value-list mutations) — only Mongo writes. Acceptable to relax the "no CRON_SECRET, read-only" comment; update it to call out the new healing write.

Schedule unchanged: `15 3 * * *`.

#### 1.3 Investigation script

New `scripts/investigate-blocked-transactions.ts` (read-only, dry-run by default):

- Args: `--from=ISO`, `--to=ISO`, `--limit=N`.
- Iterates `stripe.charges.search({ status:"failed" AND created>... AND created<... })`.
- For each `outcome.type === "blocked"` charge, looks up the PI in `BlockedTransaction`.
- Prints per-row table: `chargeId | piId | email | inMongo Y/N | outcome.type | outcome.network_status`.
- Summary: `total scanned, qualifying blocked, present in mongo, missing in mongo`.
- Adds `npm run investigate:blocked` (dry by default; no `--live` flag — script is purely diagnostic).

Documented in `docs/billing-stripe/gotchas.md` under the existing "Stripe issuer-directed auto-block" section.

### 2. Read API + service

#### 2.1 `BlockedFilter` type ([src/services/allowlist/types.ts](../../../src/services/allowlist/types.ts))

```typescript
export type EligibilityKind =
  | "auto_eligible"
  | "already_allowlisted"
  | "fraud_signal"
  | "permanent_issue"
  | "not_member";

export type BlockedFilter = {
  dateFrom: Date;
  dateTo: Date;
  email?: string;                    // NEW: case-insensitive substring
  declineCodes?: string[];           // NEW: multi-select
  eligibility?: EligibilityKind[];   // REPLACES memberStatus + declineReason + skippedOnly
};
```

The previous fields (`memberStatus`, `declineReason`, `skippedOnly`) are removed from the type. The route handler accepts the new fields only.

#### 2.2 `BlockedRow` type — expose `userId`

Add `userId: string | null` to `BlockedRow`. Surface it from `listBlocked` by storing `_id` on the `userByCustomerId` / `userByEmail` map values (already fetched). No additional query.

#### 2.3 `listBlocked` updates ([src/services/allowlist/AllowlistService.ts](../../../src/services/allowlist/AllowlistService.ts))

- **Email** → push into Mongo as `{ customerEmail: { $regex: <escaped>, $options: "i" } }`. Escape regex special chars.
- **Decline codes** → `{ declineCode: { $in: declineCodes } }`. Empty array is treated as "no filter," not "match nothing."
- **Eligibility** → applied **post-join** in memory (same pattern as the current member-status filter). For each row we derive a single `EligibilityKind` from `(row.alreadyAllowlisted, row.preview)` using the same mapping the UI already uses in `getEligibility(row)`:
  - `alreadyAllowlisted: true` → `"already_allowlisted"`
  - `preview.eligible: true` → `"auto_eligible"`
  - `preview.reason === "filter_fraud_signal"` → `"fraud_signal"`
  - `preview.reason === "filter_permanent_issue"` → `"permanent_issue"`
  - `preview.reason === "filter_not_member"` → `"not_member"`

  The mapping helper is extracted from the component into a shared util so the service-side filter and the UI badge stay in lockstep.
- `nextCursor` continues to encode the last *raw* doc (not last filtered row) so pagination remains stable when filters drop rows.

Add `customerEmail` index to [src/models/BlockedTransaction.ts](../../../src/models/BlockedTransaction.ts):

```typescript
BlockedTransactionSchema.index({ customerEmail: 1 }, { sparse: true });
```

Mongo regex on an indexed field is bounded — collection scan is unacceptable here as the collection grows.

#### 2.4 New `/api/admin/allowlist/stats` endpoint

`GET /api/admin/allowlist/stats` → `{ success: true, totalActiveAllowlisted: number }`.

Implementation:

```typescript
// Aggregate: for each fingerprint, take its most recent action.
// Count fingerprints where most-recent === "added".
const result = await AllowlistAction.aggregate([
  { $sort: { cardFingerprint: 1, createdAt: -1 } },
  { $group: { _id: "$cardFingerprint", latest: { $first: "$action" } } },
  { $match: { latest: "added" } },
  { $count: "totalActiveAllowlisted" },
]);
```

Admin-only (`requireAdminUser`). No body, no params.

#### 2.5 New hook

`useAllowlistStats()` in `src/hooks/queries/admin/useAllowlistStats.ts` — TanStack Query, `staleTime: 60_000`. Invalidated by the existing apply / reverse mutations.

### 3. UI ([src/components/admin/BlockedTransactionsManagement.tsx](../../../src/components/admin/BlockedTransactionsManagement.tsx))

#### 3.1 Date filter — past-due parity

Replace the current single date-range button + `CustomDateRangeModal` direct call with the past-due pattern:

- `DateRangeToggle` chips (Today / Yesterday / Current Draw / Last Draw / All Time / Custom).
- `useAdminMobileDateToolbarSlot()` + portal to mobile toolbar slot, with `AdminMobileLayoutDateRangeShell` fallback.
- `useCurrentAndLastDrawDates()` for draw-aware presets.
- `useMajorDrawsForDateRange()` for the modal's draw highlighter.
- `formatInTimeZone("Australia/Sydney")` for "today" / "yesterday" preset boundaries.
- Default range: last 30 days (`subDays(today, 29)` → today). Matches past-due exactly.

Date state moves from a single `BlockedFilter` field to `(dateRange, startDate, endDate)` triple, mirroring `PastDueChargeHistory.tsx`. The `BlockedFilter` is built in a `useMemo` from those three.

#### 3.2 Filters card — new layout

Filter card holds three controls in a `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`:

| Field | Control |
|---|---|
| Email | Debounced text input (`useDebounce`, 300ms), magnifying-glass icon prefix, "Search by email" placeholder |
| Eligibility | Multi-select Dropdown — 5 options matching `EligibilityKind` |
| Decline code | Multi-select Dropdown — options derived from `Object.keys(DECLINE_CODE_LABELS)` (a static map covering Stripe-documented codes + `FRAUD_SIGNAL_DECLINE_CODES` + `PERMANENT_ISSUE_DECLINE_CODES`). Each option shows `code (human-readable label)` |

Reset button clears email + eligibility + declineCodes; date stays at last-30-days default.

If `Dropdown` (the existing modal-folder primitive) doesn't support multi-select, use the existing checkbox-list pattern from elsewhere in admin (see `UsersManagement.tsx`); do not introduce a new dropdown library.

#### 3.3 Metric cards — swap one

Replace `Already allowlisted` (4th card, currently date-filtered) with `Total on allowlist`:

- Title: **"Total on allowlist"**
- Value: `useAllowlistStats().data?.totalActiveAllowlisted ?? "—"`
- Icon: `ShieldCheck` (kept)
- Color: `purple` (kept)
- Subtitle: **"All-time, currently active"**

Other 3 cards unchanged. The per-row "Already allowlisted" badge in the table conveys the same date-scoped info that the old card did.

#### 3.4 Clickable email column

Email cell becomes:

```tsx
<ClickableUserDisplay
  displayText={r.customerEmail ?? "—"}
  userId={r.userId}                  // null for guest / unmatched
/>
```

Used in both the desktop table cell and the mobile card. `ClickableUserDisplay` already gracefully handles `userId == null` by rendering as plain text (no behavior change for guests).

#### 3.5 Empty-state copy

Updated to `"Try widening the date range, clearing the email search, or relaxing filters."`

---

## Migration / rollout

- **No data migration.** New filters and columns work against existing rows.
- **Stripe webhook config:** the `charge.failed` event must be enabled in the Stripe dashboard webhook subscription. Add to PR description as a deployment step.
- **Backfill recovery:** running the existing `npm run backfill:blocked-transactions` for the past N days catches anything missed pre-deploy.
- The new `customerEmail` index on `BlockedTransaction` builds in the background on first deploy.

## Testing

- `src/services/allowlist/__tests__/blockedTransactionRepo.test.ts` — extend with a `charge.failed`-shaped charge fixture if not already covered (the existing builder is event-agnostic; one fixture should suffice).
- `src/app/api/cron/reconcile-blocked-transactions/__tests__/computeDriftRatio.test.ts` — unchanged (helper didn't change).
- New: `src/services/allowlist/__tests__/listBlockedFilters.test.ts` — unit-test the filter pushdown for `email`, `declineCodes`, and the post-join `eligibility` filter against a hand-rolled `AllowlistRepository` fake. One case per filter dimension. Wired as `npm run test:list-blocked-filters`.
- Manual checklist on `/admin/blocked-transactions`:
  - Date chips + custom modal mirror past-due exactly.
  - Email substring matches paginate correctly.
  - Eligibility multi-select narrows rows; cursor "Load more" still advances.
  - Email click opens UserDetailModal for matched users; renders plain text for guests.
  - Total on allowlist count updates after apply / reverse.

## Documentation updates

- `docs/billing-stripe/architecture.md` — update "Webhook flow" diagram + the `listBlocked` section to mention the new filter dimensions and `userId` field.
- `docs/billing-stripe/gotchas.md` — under "Stripe issuer-directed auto-block":
  - Add a paragraph: "Capture path now listens to *both* `payment_intent.payment_failed` and `charge.failed`; only the former drives `AllowlistService.apply()` to avoid double-recording."
  - Reference the new investigation script.
  - Note that the reconcile cron is now self-healing.
- `docs/billing-stripe/api.md` — add the new `GET /api/admin/allowlist/stats` endpoint.
- `docs/billing-stripe/models.md` — note the new `customerEmail` index.
- `docs/admin/frontend.md` — refresh the `/admin/blocked-transactions` description: new filters + clickable emails + total-on-allowlist metric.
- CLAUDE.md domain manifest — add `src/hooks/queries/admin/useAllowlistStats.ts` and `scripts/investigate-blocked-transactions.ts` to the `billing-stripe` domain.

## Risks

- **`charge.failed` not subscribed in Stripe.** If the Stripe dashboard webhook misses the event type, the live fix is a no-op until enabled. Mitigation: deployment step + reconcile cron is self-healing.
- **Regex on `customerEmail` without index.** Without the new index, large date windows + email filter would scan. Mitigation: index is part of this change.
- **Eligibility post-filter can drop entire pages.** A user filtering "Auto-eligible only" in a window dominated by "not member" rows may need many "Load more" clicks. Acceptable; matches today's behavior with the member-status filter. If it becomes a UX issue, consider pre-filtering allowlisted/not-member at the Mongo layer (out of scope here).
- **Decline-code list staleness.** Stripe may add new decline codes. Mitigation: the list is a static map in code; periodic refresh is a known maintenance task already implied by `FRAUD_SIGNAL_DECLINE_CODES` etc.
