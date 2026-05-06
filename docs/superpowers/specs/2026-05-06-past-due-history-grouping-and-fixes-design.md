# Past-Due Charge History — Grouping, Search, Clickable Emails, and Bug Fixes

**Date:** 2026-05-06
**Owner:** DJ
**Surface:** Admin → Past-Due Charge History page + run-detail drawer
**Files in scope:**
- `src/app/admin/component/PastDueChargeHistory.tsx`
- `src/app/admin/component/PastDueChargeHistoryDrawer.tsx`
- `src/app/api/admin/charge-past-due/runs/route.ts`
- `src/app/api/admin/charge-past-due/manual-retries/route.ts`
- `src/services/admin/chargePastDueHistory.ts`
- `src/server/admin/chargePastDueShared.ts`
- `src/models/InvoiceChargeLog.ts`
- `src/hooks/queries/admin/useChargePastDueRuns.ts`
- `src/hooks/queries/admin/useChargePastDueManualRetries.ts`
- `src/hooks/queries/admin/useChargePastDueRunDetail.ts`

## Problem

Three issues plus one feature on the Past-Due Charge History admin surface:

1. **Date filter drops same-day runs.** Selecting "Today" hides bulk runs that ran today; "Current Draw" shows them. Root cause: API parses `startDate=YYYY-MM-DD` with `new Date(s)` (UTC midnight), but the frontend sends AEST calendar dates. A run at 09:30 AEST is `prev_day 23:30 UTC` — before the parsed start.
2. **Error column always shows `card_declined`.** Stripe's `error.code` is the generic bucket; the real reason (`do_not_honor`, `insufficient_funds`, `lost_card`, etc.) lives on `decline_code`. Today only `code` is persisted.
3. **Manual Retries and per-invoice attempts list one row per attempt.** A user with N attempts produces N rows, making the table noisy and hard to scan.
4. **No way to drill into a user from these tables**, no search, and the drawer's "When" column is redundant since all attempts in a single run happen within seconds.

## Goals

- Same-day runs and retries appear under the correct AEST date filter.
- Failed attempts surface the actual decline reason in the UI.
- Each user collapses to a single row in Manual Retries and in the drawer's Per-invoice attempts table; the row expands to show the per-attempt breakdown.
- Clicking a user email opens the existing `UserDetailModal`.
- A search box filters by email — server-side on Manual Retries (so it works across paginated history), client-side in the drawer (single response).

## Non-goals

- Backfilling `declineCode` on existing `InvoiceChargeLog` rows. The sanitized `result` blob still contains `decline_code` if a future backfill is wanted.
- Backend changes to the Bulk Runs aggregation (the row IS the run; no per-user dimension at that level).
- Server-side search in the run-detail drawer (data is already fully loaded).
- Changing the bulk-recover flow's domain logic — only the selection UX changes.

---

## Section 1 — Date filter timezone fix

**Where:**
- `src/app/api/admin/charge-past-due/runs/route.ts`
- `src/app/api/admin/charge-past-due/manual-retries/route.ts`

**Change:** Replace the local `parseDate` (which uses `new Date(s)`) with helpers that interpret `YYYY-MM-DD` strings as AEST calendar boundaries:

- `startDate=YYYY-MM-DD` → `zonedTimeToUtc("YYYY-MM-DDT00:00:00", "Australia/Sydney")` → used as `$gte`.
- `endDate=YYYY-MM-DD` → `zonedTimeToUtc("YYYY-MM-DD+1day T00:00:00", "Australia/Sydney")` → used as **`$lt`** (not `$lte`).

Switch the filter operator in `buildRunsFilter` and `buildManualRetriesFilter` (`src/services/admin/chargePastDueHistory.ts`) from `$lte` to `$lt` for `endDate`. The end is now an exclusive upper bound (start of the next AEST day), so `$lt` is the correct operator.

`date-fns-tz` is already a dependency. No frontend change.

**Result:** "Today" on 6 May 2026 (AEST) resolves to `[2026-05-05T14:00:00Z, 2026-05-06T14:00:00Z)` and includes the 09:30 AEST run.

## Section 2 — Decline code fidelity

**Schema change** — `src/models/InvoiceChargeLog.ts`:
- Add optional `declineCode?: string` field. No index, no migration. Existing rows have `undefined`.

**Save sites** — `src/server/admin/chargePastDueShared.ts`:
- Three places currently write `errorCode: stripeErr.code` and `errorMessage: stripeErr.message`:
  1. The "PI confirm threw" branch (~line 432)
  2. The "already paid" skip branch (~line 562)
  3. The outer catch (~line 596)
- Each must additionally write `declineCode: stripeErr.decline_code` when present.
- Helper to keep this DRY: a small `extractStripeErrorFields(err)` returning `{ errorCode, errorMessage, declineCode }` colocated in `chargePastDueShared.ts`.

**PI-derived failures** — `chargePastDuePostPayPolicy.ts` returns a `decision` for non-success outcomes. Where the decision came from a PI's `last_payment_error`, propagate `decline_code` through `decision` so the failed-log site also records it. Update the existing `failedErrorCode` / `failedErrorMessage` block in `chargePastDueShared.ts` (~line 510) to also set `declineCode` from the decision.

**Service DTOs** — `src/services/admin/chargePastDueHistory.ts`:
- Add `declineCode?: string` to `RunDetailRow` and propagate it in `getChargeRunDetail` and `listManualRetries` (`.select({ declineCode: 1, ... })` and pass it through).

**Hook types** — update `useChargePastDueManualRetries.ts` and `useChargePastDueRunDetail.ts` row types to expose `declineCode`.

**UI display:** the existing "Error" cell currently renders `r.errorCode ?? r.errorMessage ?? ""`. Change to `r.declineCode ?? r.errorCode ?? r.errorMessage ?? ""`. Apply on:
- The Manual Retries grouped sub-rows
- The drawer's Per-invoice attempts grouped sub-rows

## Section 3 — Group Manual Retries by user

**Where:** `src/app/admin/component/PastDueChargeHistory.tsx` Manual Retries table.

**Approach:** client-side aggregation with `useMemo`. Group `retriesQuery.rows` by `userId`. For users without a `userId` (rare/legacy rows), bucket under a synthetic key so they still render and aren't dropped silently.

**Per-user summary computed on the client:**

```ts
type UserGroup = {
  userId: string;
  userEmail: string;
  attempts: ManualRetryRow[];        // sorted desc by attemptedAt
  successCount: number;
  failedCount: number;
  skippedCount: number;
  strandedCount: number;             // failed + isStrandedError + has userId
  totalAmount: number;               // sum of attempt amounts
  lastAttemptedAt: Date;             // attempts[0].attemptedAt
  latestStatus: "success" | "failed" | "skipped"; // attempts[0].status (chronologically latest)
  adminLabel: string;                // attempts[0].adminName, or "various" if not all the same
};
```

**Collapsed row layout** (left → right):
- Expand chevron (▶ / ▼)
- Checkbox: indeterminate when some-but-not-all stranded attempts in the user are selected; checked when all are; unchecked otherwise. Clicking selects/deselects all stranded attempts for the user. Hidden when `strandedCount === 0`.
- `<ClickableUserDisplay displayText={userEmail} userId={userId} />`
- Admin label
- "Attempts" cell: `12` with subtext `2✓ 8✗ 2⏭` (small, muted)
- Latest `RetryStatusBadge`
- Total amount
- Last attempted-at (formatted via existing `formatDateTime`)

**Expanded sub-rows:** the current per-attempt columns minus the User column:
- Checkbox (only for stranded rows, same as today)
- When (kept here — this is the main page, not the drawer)
- Admin
- Invoice
- Status
- Amount
- Error (now uses the `declineCode ?? errorCode ?? errorMessage` order from §2)
- Action (Recover button)

**Expand state:** local `useState<Set<string>>` of expanded `userId`s, persisted in component state only (not URL).

**Pagination caveat:** the existing infinite-scroll "Load more" continues to operate on the underlying `retriesQuery.rows`. Per-user counts/totals reflect **loaded** attempts only. The collapsed row shows a small `(showing X loaded)` hint when `hasMore && loadedAttemptsForUser` could be incomplete — i.e., always when `hasMore` is true, since we can't know which user the next page belongs to.

**Bulk-recover flow stays the same:** `selectedItems` is still a flat array of stranded `BulkRecoverItem`s computed from `selectedRows`. The user-row checkbox simply toggles all that user's stranded keys at once.

## Section 4 — Group Per-invoice attempts in run drawer by user

**Where:** `src/app/admin/component/PastDueChargeHistoryDrawer.tsx`.

Same client-side aggregation as §3, with two differences:

- The drawer returns the full set in one response (`detailQuery.data.rows`), so per-user counts are exact — no "loaded" caveat.
- No bulk-recover affordance lives here today, so no checkboxes.

**Collapsed row:** Expand chevron · `<ClickableUserDisplay />` · attempts count + breakdown · latest status badge · total amount.

**Expanded sub-rows:** Invoice · Status · Amount · Error (with `declineCode` priority). The "When" column is removed (see §5).

## Section 5 — Remove "When" column from drawer's Per-invoice attempts

All attempts inside one bulk run land within seconds of `run.startedAt`. The column is noise. Drop the `<th>When` and `<td>{formatDateTime(r.attemptedAt)}` cells from the drawer's Per-invoice attempts table only. Keep "When" on the main-page Manual Retries table (those span days/weeks).

## Section 6 — Clickable user emails

Replace the plain text rendering with `<ClickableUserDisplay displayText={userEmail || userId} userId={userId} />` on:
- Manual Retries grouped parent rows
- Drawer's Per-invoice attempts grouped parent rows

Sub-rows do NOT repeat the email — the parent already shows it.

`AdminUserModalProvider` is already mounted at `src/app/admin/layout.tsx:20`, so this drops in without provider plumbing.

## Section 7 — User search

### 7a. Manual Retries — server-side

**API change** — `src/app/api/admin/charge-past-due/manual-retries/route.ts`:
- Accept `userSearch` query string (max length cap, e.g. 120 chars; trim).
- Pass through to `listManualRetries`.

**Service change** — `src/services/admin/chargePastDueHistory.ts`:
- Extend `ManualRetriesFilterInput` with `userSearch?: string`.
- When `userSearch` is non-empty, prepend a User lookup: `User.find({ email: { $regex: escapeRegex(userSearch), $options: "i" } }).select({ _id: 1 }).limit(500)`. Use the resulting `_id`s as a `$in` constraint on `InvoiceChargeLog.userId`.
- Cap matched users at 500 to bound the `$in` set; if hit, the search is "broad" — surface this to the UI later if needed (out of scope for v1).
- Escape user input with a small `escapeRegex` helper to avoid `^`, `$`, `(`, `)` etc. injection.
- If `userSearch` is given but no users match, short-circuit and return `{ rows: [], total: 0 }` without hitting `InvoiceChargeLog`.

**Hook change** — `useChargePastDueManualRetries.ts`:
- Add `userSearch?: string` to `ManualRetriesFilter`.
- Include it in the query string and the React Query `queryKey` so changes refetch correctly.

**UI change** — main page Manual Retries section header:
- Add a debounced (300ms) search input alongside the bulk-recover button.
- Local state `userSearchInput` → debounced value flows into `filter.userSearch`.
- Empty/whitespace input means "no filter" (don't send the param).

### 7b. Drawer Per-invoice attempts — client-side

- Search input rendered in the drawer's Per-invoice attempts section header.
- Filters the user-grouped list locally by case-insensitive substring match against `userEmail`.
- No backend change. Debounce 150ms (smaller dataset).

---

## Cross-cutting concerns

### Existing data
- Rows logged before deploy have no `declineCode`. UI fallback chain `declineCode ?? errorCode ?? errorMessage` keeps them readable.

### Performance
- Client-side grouping is O(n) over the loaded rows; n is bounded by the page size (50) on Manual Retries and by the run's attempt count in the drawer.
- Server-side user search adds one extra `User.find` per Manual Retries page load when a search is active. Indexed on email already (NextAuth schema), so cheap.

### Tests
- `src/services/admin/__tests__/chargePastDueHistory.test.ts` (create if absent): cover `buildRunsFilter` / `buildManualRetriesFilter` with AEST dates crossing UTC midnight, and `userSearch` regex escaping + the empty-match short-circuit.
- The grouping/search UI is React-only and visually verifiable; no test runner is configured for components — manual verification is acceptable per the repo's convention.

### Docs to update (per Domain Manifest)
- `docs/admin/` — page, drawer, route handlers, service, shared charge logic.
- `docs/billing-stripe/models.md` — `InvoiceChargeLog` gains `declineCode`.
- `docs/client-state/` — query hook signatures (`useChargePastDueManualRetries`).

### Risks
- **Pagination + grouping** can produce surprising counts for high-volume users. Mitigated by the "(showing X loaded)" hint and by the new server-side user search (lets admins narrow the load to one user when needed).
- **Existing PI-failed rows** keep their generic `errorCode` until they retry. Acceptable.
- **Edge case:** `userSearch` matches >500 users. v1 silently caps; if this becomes real, surface a warning later.

## Out of scope (deferred)

- Backfill of `declineCode` from existing `result.decline_code` blobs.
- Server-side search in the drawer.
- A "Recover all stranded for this user" button on the parent row (v1 keeps the existing per-attempt selection model; the user-row checkbox just multi-selects).
- Persisting expand state / search query in the URL.
