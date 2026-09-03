# Admin Dashboard UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Renewals KPI answer "how is today's renewal run going?" from a single cohort, move the desktop date filter into the admin header, and let the desktop sidebar collapse to a hover-flyout icon rail.

**Architecture:** A new pure shaping function (`summarizeRenewalCohort`) turns a status-bucket map plus a forward-schedule count into a display-ready cohort; `MembershipAnalyticsService` feeds it from one aggregation plus one count; `DashboardStatsService` carries it to the client alongside the existing keys; `KpiGrid` renders it through a new `MetricCard.footer` slot and a new `SegmentedBar`. The date filter reuses the portal slot mobile already uses. Sidebar collapse state lives in `AdminPage` and is passed to a presentational `AdminSidebar`.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Mongoose, Tailwind, `tsx` test scripts (no jest/vitest), Zod for the Norm gateway.

**Spec:** [`docs/superpowers/specs/2026-09-02-admin-dashboard-ux-design.md`](../specs/2026-09-02-admin-dashboard-ux-design.md)

## Global Constraints

- **No commits without authorisation.** CLAUDE.md rule 1 — do not run `git commit`/`push`/`gh pr create` unless the user has said `commit` / `push` / `ship it` this session. The `git commit` steps below are gated on that.
- **Branch only, never `main`.** Work stays on `feature/admin-dashboard-ux` (CLAUDE.md rule 1b).
- **Layering:** no business logic in `src/app/api/**`; cohort logic goes in `src/utils/admin/` (pure) and `src/services/admin/` (queries).
- **`npm run lint && npm run type-check`** must pass at the end of every task.
- **Docs in the same task as the code** (CLAUDE.md rule 2): `docs/admin/`, `docs/subscription/`, `docs/internal-norm/`.
- **Norm lockstep** (CLAUDE.md rule 10): schema + route + `norm-context.md` + `npm run build:norm-manifest` change together. A schema↔output mismatch is a runtime 500 `tsc` cannot catch.
- **Naming, fixed by the spec — do not invent variants:** `dueInRange`, `landedInRange`, `failedInRange`, `pendingInRange`, `isOpen`, `collectionRate`, `failedInvoiceAttemptsInRange`.
- **`dueInRange` sums every status bucket.** It is NOT `landed + failed + pending`. See Task 1 Step 1.
- This is admin-only UI. CLAUDE.md rule 11 (customer-facing copy) does not apply; no BUSINESS.md / CUSTOMER.md triggers are touched (verified against the hook's glob lists).

---

### Task 1: `summarizeRenewalCohort` — the pure shaping function

**Files:**
- Create: `src/utils/admin/renewalCohort.ts`
- Create: `src/utils/admin/__tests__/renewalCohort.test.ts`
- Modify: `package.json` (add `test:renewal-cohort`)
- Modify: `src/types/admin/membershipAnalytics.ts:1-32`

**Interfaces:**
- Produces: `summarizeRenewalCohort(input: { statusCounts: Record<string, number>; pendingInRange: number; isOpen: boolean }): RenewalCohort` and the `RenewalCohort` interface. Tasks 2–3 consume both.

Mirrors the existing `src/utils/admin/renewalProgress.ts` (same folder, same shape of job) — read it first for house style.

- [ ] **Step 1: Write the failing test**

Create `src/utils/admin/__tests__/renewalCohort.test.ts`. Follow the house test style — plain `tsx` script, no framework:

```ts
import { summarizeRenewalCohort } from "@/utils/admin/renewalCohort";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) { failures++; console.error(`✗ ${label}\n    expected ${JSON.stringify(expected)}\n    actual   ${JSON.stringify(actual)}`); }
  else console.log(`✓ ${label}`);
}

// Production shape, 2026-09-02 ~12:00 AEST (spec §1 D2).
const open = summarizeRenewalCohort({
  statusCounts: { succeeded: 31, failed: 20 },
  pendingInRange: 51,
  isOpen: true,
});
check("dueInRange = cycles + pending", open.dueInRange, 102);
check("landedInRange", open.landedInRange, 31);
check("failedInRange", open.failedInRange, 20);
check("pendingInRange", open.pendingInRange, 51);
check("collectionRate is landed/attempted, not landed/due", open.collectionRate, 60.8);

// THE IDENTITY TRAP (spec §4.1): a refunded cycle stays in the denominator but
// belongs to neither numerator, so due > landed + failed + pending is legal.
const refunded = summarizeRenewalCohort({
  statusCounts: { succeeded: 10, failed: 2, refunded: 3 },
  pendingInRange: 5,
  isOpen: true,
});
check("refunded stays in dueInRange", refunded.dueInRange, 20);
check("refunded is not landed", refunded.landedInRange, 10);
check("refunded is not failed", refunded.failedInRange, 2);
check("collectionRate ignores refunded", refunded.collectionRate, 83.3);

// An unknown future status must behave exactly like refunded — counted in the
// denominator, in neither numerator. This is what stops a new Stripe status from
// silently deleting members from the day's total.
const unknown = summarizeRenewalCohort({
  statusCounts: { succeeded: 4, failed: 1, some_new_status: 2 },
  pendingInRange: 0,
  isOpen: false,
});
check("unknown status counted in dueInRange", unknown.dueInRange, 7);
check("unknown status is not landed", unknown.landedInRange, 4);

// `recovered` IS a landed outcome (enum exists, unobserved in prod — spec F10).
const recovered = summarizeRenewalCohort({
  statusCounts: { succeeded: 5, recovered: 3, failed: 2 },
  pendingInRange: 0,
  isOpen: false,
});
check("recovered counts as landed", recovered.landedInRange, 8);

// Empty range — rate must be null, never 0%, or a quiet day reads as total failure.
const empty = summarizeRenewalCohort({ statusCounts: {}, pendingInRange: 0, isOpen: true });
check("empty dueInRange", empty.dueInRange, 0);
check("empty collectionRate is null", empty.collectionRate, null);

// Due but nothing attempted yet — also null, for the same reason.
const allPending = summarizeRenewalCohort({ statusCounts: {}, pendingInRange: 40, isOpen: true });
check("all-pending dueInRange", allPending.dueInRange, 40);
check("all-pending collectionRate is null", allPending.collectionRate, null);

// Closed range: the remainder means "did not renew", so isOpen must survive.
const closed = summarizeRenewalCohort({
  statusCounts: { succeeded: 89, failed: 50 },
  pendingInRange: 0,
  isOpen: false,
});
check("closed isOpen", closed.isOpen, false);
check("closed collectionRate", closed.collectionRate, 64.0);

// Negative / non-integer input is clamped rather than propagated.
const dirty = summarizeRenewalCohort({
  statusCounts: { succeeded: -5, failed: 2.6 },
  pendingInRange: -1,
  isOpen: true,
});
check("negative clamped to 0", dirty.landedInRange, 0);
check("fractional rounded", dirty.failedInRange, 3);
check("negative pending clamped", dirty.pendingInRange, 0);

console.log(failures === 0 ? "\nAll renewal-cohort tests passed." : `\n${failures} test(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Add the npm script**

In `package.json`, beside the existing `"test:renewal-progress"` entry:

```json
"test:renewal-cohort": "tsx src/utils/admin/__tests__/renewalCohort.test.ts",
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:renewal-cohort`
Expected: FAIL — `Cannot find module '@/utils/admin/renewalCohort'`.

- [ ] **Step 4: Add the `RenewalCohort` type**

In `src/types/admin/membershipAnalytics.ts`, replace the semantics comment block (`:1-11`) and `MembershipRenewalMetrics` (`:26-32`):

```ts
/**
 * Admin membership analytics — metric definitions and API shapes.
 *
 * Semantics:
 * - RenewalCohort.*: everything anchored to the renewals DUE in [start, end] (`dueAt`), so the
 *   numerator and denominator describe the same members. See the design spec
 *   docs/superpowers/specs/2026-09-02-admin-dashboard-ux-design.md.
 * - successfulRenewalsInRange: net membership BenefitsGranted with billingReason
 *   subscription_cycle in [start, end] (matches the revenue card). A DIFFERENT cohort from
 *   RenewalCohort.landedInRange — payment-time, not due-time — and the two legitimately differ
 *   because Stripe finalises a renewal invoice ~1h after the cycle boundary, so a late-night
 *   renewal lands the next day. Never divide one by the other.
 * - failedInvoiceAttemptsInRange: renewal cycles marked failed with `failedAt` in range. This is
 *   an ATTEMPT count, inflated by dunning retries (124 attempts vs 20 members due, 2026-09-02),
 *   NOT a count of members. For members, use RenewalCohort.failedInRange.
 * - becamePastDueInRange: distinct users who transitioned to past_due per MembershipStatusHistory.
 * - cancellationsInRange: users with subscription.cancelledAt in [start, end] (active accounts).
 * - cancelledMembershipRevenueImpact: sum of catalog membership prices for those users.
 */
```

```ts
/** Renewals DUE in the selected range, and what became of them. */
export interface RenewalCohort {
  /** Denominator: every renewal cycle due in range (ALL statuses) + those still scheduled.
   *  NOT landedInRange + failedInRange + pendingInRange — a status in neither numerator
   *  (e.g. `refunded`) stays here rather than vanishing from the day's total. */
  dueInRange: number;
  /** Cycles due in range with status `succeeded` or `recovered`. */
  landedInRange: number;
  /** Cycles due in range with status `failed`. Members, not retry attempts. */
  failedInRange: number;
  /** Active auto-renewing members scheduled in the remainder of the range; 0 once it closes. */
  pendingInRange: number;
  /** Range end is still in the future → the remainder is "to come", else "did not renew". */
  isOpen: boolean;
  /** landed / (landed + failed) as a 0–100 percentage (1 dp); null when nothing was attempted.
   *  Deliberately NOT landed/dueInRange — that only reaches 100% at day's end regardless of
   *  how collection actually went. */
  collectionRate: number | null;
}

export interface MembershipRenewalMetrics {
  renewalCohort: RenewalCohort;
  successfulRenewalsInRange: number;
  successfulRenewalUserCount: number;
  failedInvoiceAttemptsInRange: number;
  becamePastDueInRange: number;
}
```

- [ ] **Step 5: Write the implementation**

Create `src/utils/admin/renewalCohort.ts`:

```ts
import type { RenewalCohort } from "@/types/admin/membershipAnalytics";

/** Cycle statuses that mean the money arrived. `recovered` is a permitted enum value that is
 *  currently unobserved in production, but a recovered cycle is a landed one. */
const LANDED_STATUSES = new Set(["succeeded", "recovered"]);
const FAILED_STATUSES = new Set(["failed"]);

const clampCount = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);

/**
 * Shape raw per-status cycle counts + a forward-schedule count into the display-ready cohort.
 *
 * `statusCounts` is keyed by MembershipRenewalCycle.status and may contain keys this function
 * does not recognise. Unrecognised statuses are counted in `dueInRange` and in NEITHER
 * numerator — that is the point: a status nobody has handled yet shows up as an unexplained
 * slice of the bar instead of quietly shrinking the day's total.
 */
export function summarizeRenewalCohort(input: {
  statusCounts: Record<string, number>;
  pendingInRange: number;
  isOpen: boolean;
}): RenewalCohort {
  let cyclesDue = 0;
  let landedInRange = 0;
  let failedInRange = 0;

  for (const [status, rawCount] of Object.entries(input.statusCounts)) {
    const count = clampCount(rawCount);
    cyclesDue += count;
    if (LANDED_STATUSES.has(status)) landedInRange += count;
    else if (FAILED_STATUSES.has(status)) failedInRange += count;
  }

  const pendingInRange = clampCount(input.pendingInRange);
  const attempted = landedInRange + failedInRange;

  return {
    dueInRange: cyclesDue + pendingInRange,
    landedInRange,
    failedInRange,
    pendingInRange,
    isOpen: input.isOpen,
    collectionRate: attempted > 0 ? Math.round((landedInRange / attempted) * 1000) / 10 : null,
  };
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test:renewal-cohort`
Expected: PASS — all checks ✓, exit 0.

- [ ] **Step 7: Type-check**

Run: `npm run type-check`
Expected: errors ONLY in `MembershipAnalyticsService.ts`, `DashboardStatsService.ts`, `useAdminQueries.ts`, the Norm route and `KpiGrid.tsx` — every one is a call site Tasks 2–3 fix. Any error elsewhere means the type change reached further than expected; investigate before continuing.

- [ ] **Step 8: Commit** *(only if commits are authorised — see Global Constraints)*

```bash
git add src/utils/admin/renewalCohort.ts src/utils/admin/__tests__/renewalCohort.test.ts src/types/admin/membershipAnalytics.ts package.json
git commit -m "feat(admin): add renewal cohort shaping + tests"
```

---

### Task 2: Wire the cohort through the service and transport layers

**Files:**
- Modify: `src/services/admin/MembershipAnalyticsService.ts:83-98` (queries), `:163-172` (return)
- Modify: `src/services/admin/DashboardStatsService.ts:566-576` (catch fallback), `:597-602` (response)
- Modify: `src/hooks/queries/useAdminQueries.ts:100-106` (client type)
- Modify: `src/app/admin/component/overview/sections/periodComparisonModel.ts:309` (stale comment)
- Modify: `docs/subscription/` + `docs/admin/` (rule 2)

**Interfaces:**
- Consumes: `summarizeRenewalCohort`, `RenewalCohort` (Task 1).
- Produces: `stats.users.membershipRenewals.renewalCohort` on the client type, consumed by Task 3.

- [ ] **Step 1: Replace the cohort queries in `MembershipAnalyticsService`**

Add the imports (`User` and `getActiveSubscriptionFilter` may already be imported — check before adding):

```ts
import { summarizeRenewalCohort } from "@/utils/admin/renewalCohort";
import { getActiveSubscriptionFilter } from "@/utils/admin/userFilterBuilder";
```

Replace the `Promise.all` at `:83-98`:

```ts
    // The renewal cohort is anchored to `dueAt` — the members whose renewal fell due in this
    // range — so the numerator and denominator describe the same people. `MembershipRenewalCycle`
    // is written REACTIVELY (rows appear only once Stripe emits an invoice; zero rows are ever
    // dated in the future), so it cannot supply the still-to-come half on its own. That half comes
    // from the live schedule on User.subscription.endDate. The two sets do not overlap: a renewal
    // that lands rolls endDate forward a month, so a member is in one or the other, never both.
    const now = new Date();
    const pendingWindowStart = now > startDate ? now : startDate;
    const rangeIsOpen = endDate > now;

    const [cycleStatusRows, failedInvoiceAttemptsInRange, becamePastDueIds, pendingInRange] =
      await Promise.all([
        MembershipRenewalCycle.aggregate<{ _id: string; n: number }>([
          {
            $match: {
              billingReason: "subscription_cycle",
              dueAt: { $gte: startDate, $lte: endDate },
            },
          },
          { $group: { _id: "$status", n: { $sum: 1 } } },
        ]),
        // Retry-inflated ATTEMPT count, kept for the Norm gateway. Not a member count —
        // dunning rewrites `failedAt` on old invoices, so this runs far ahead of the cohort's
        // `failedInRange` (124 vs 20 on 2026-09-02).
        MembershipRenewalCycle.countDocuments({
          billingReason: "subscription_cycle",
          status: "failed",
          failedAt: { $gte: startDate, $lte: endDate },
        }),
        MembershipStatusHistory.distinct("userId", {
          membershipStatus: "past_due",
          effectiveAt: { $gte: startDate, $lte: endDate },
          source: { $in: ["webhook_invoice_payment_failed", "backfill_user_pastDueAt"] },
        }),
        // Skip the query entirely for a closed range — there is nothing still to come.
        rangeIsOpen
          ? User.countDocuments({
              ...getActiveSubscriptionFilter(),
              "subscription.endDate": { $gte: pendingWindowStart, $lte: endDate },
            })
          : Promise.resolve(0),
      ]);

    const renewalCohort = summarizeRenewalCohort({
      statusCounts: Object.fromEntries(cycleStatusRows.map((r) => [String(r._id), r.n])),
      pendingInRange,
      isOpen: rangeIsOpen,
    });
```

- [ ] **Step 2: Update the service's return block**

At `:163-172`, replace `expectedRenewalsInRange` and `failedRenewalInvoicesInRange`:

```ts
    return {
      renewalCohort,
      successfulRenewalsInRange,
      successfulRenewalUserCount,
      failedInvoiceAttemptsInRange,
      becamePastDueInRange: becamePastDueIds.length,
      cancellationsInRange: cancellationRows.length,
      cancelledMembershipRevenueImpact,
      renewalProgress,
    };
```

- [ ] **Step 3: Update the catch fallback in `DashboardStatsService`**

At `:566-576`. **This is the silent-failure row R4** — a missing key here surfaces only when membership analytics throws, which is exactly when nobody is looking:

```ts
      membershipAnalytics = {
        renewalCohort: {
          dueInRange: 0,
          landedInRange: 0,
          failedInRange: 0,
          pendingInRange: 0,
          isOpen: false,
          collectionRate: null,
        },
        successfulRenewalsInRange: 0,
        successfulRenewalUserCount: 0,
        failedInvoiceAttemptsInRange: 0,
        becamePastDueInRange: 0,
        cancellationsInRange: 0,
        cancelledMembershipRevenueImpact: 0,
      };
```

- [ ] **Step 4: Update the response shape**

At `:597-602`:

```ts
        membershipRenewals: {
          renewalCohort: membershipAnalytics.renewalCohort,
          succeededInRange: membershipAnalytics.successfulRenewalsInRange,
          succeededDistinctMembers: membershipAnalytics.successfulRenewalUserCount,
          failedInvoiceAttemptsInRange: membershipAnalytics.failedInvoiceAttemptsInRange,
          becamePastDueInRange: membershipAnalytics.becamePastDueInRange,
        },
```

`succeededInRange` **must stay** — `periodComparisonModel.ts:300` reads it for the Period Comparison card.

- [ ] **Step 5: Update the client type**

In `src/hooks/queries/useAdminQueries.ts:100-106`:

```ts
    membershipRenewals?: {
      renewalCohort: {
        dueInRange: number;
        landedInRange: number;
        failedInRange: number;
        pendingInRange: number;
        isOpen: boolean;
        collectionRate: number | null;
      };
      succeededInRange: number;
      succeededDistinctMembers: number;
      failedInvoiceAttemptsInRange: number;
      becamePastDueInRange: number;
    };
```

- [ ] **Step 6: Fix the stale comment**

`periodComparisonModel.ts:309` names `membershipRenewals.failedInvoicesInRange`. Update it to `failedInvoiceAttemptsInRange` and note it counts attempts, not members.

- [ ] **Step 7: Type-check**

Run: `npm run type-check`
Expected: remaining errors ONLY in the Norm route (Task 4) and `KpiGrid.tsx` (Task 3).

- [ ] **Step 8: Update the docs**

- `docs/subscription/` — the renewal-metric definitions, including that due-time and payment-time cohorts differ by Stripe's ~1h finalisation lag.
- `docs/admin/` — the dashboard-stats response shape.

- [ ] **Step 9: Commit** *(if authorised)*

```bash
git add src/services/admin/MembershipAnalyticsService.ts src/services/admin/DashboardStatsService.ts src/hooks/queries/useAdminQueries.ts src/app/admin/component/overview/sections/periodComparisonModel.ts docs/
git commit -m "feat(admin): serve renewal cohort from dashboard stats"
```

---

### Task 3: Render the cohort on the Renewals card

**Files:**
- Create: `src/components/admin/ui/SegmentedBar.tsx`
- Modify: `src/components/admin/ui/index.ts` (export it)
- Modify: `src/components/admin/ui/MetricCard.tsx:18-24` (add `footer`)
- Modify: `src/app/admin/component/overview/sections/KpiGrid.tsx:256-272` (model), `:383` (render), `:60-90` (breakdown formatter)

**Interfaces:**
- Consumes: `stats.users.membershipRenewals.renewalCohort` (Task 2).
- Produces: `<SegmentedBar segments={...} />`, `MetricCard`'s `footer?: ReactNode`.

- [ ] **Step 1: Create `SegmentedBar`**

```tsx
/**
 * Proportional multi-segment bar for the admin UI kit. Unlike `ProgressBar` (one value against
 * 100), this shows how a single total splits across outcomes.
 *
 * Segments are rendered in order and sized as a share of `total`. `total` is passed in rather
 * than summed from the segments on purpose: the renewals cohort's denominator can exceed its
 * segments (a status in neither bucket — see RenewalCohort.dueInRange), and the leftover must
 * render as visible empty track, not silently rescale the other segments.
 */
export function SegmentedBar({
  segments,
  total,
  label,
  className = "",
}: {
  segments: { key: string; value: number; className: string }[];
  total: number;
  /** Screen-reader summary, e.g. "31 landed, 20 failed, 51 still to come". */
  label: string;
  className?: string;
}) {
  if (total <= 0) return null;
  return (
    <div
      role="img"
      aria-label={label}
      className={`flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700 ${className}`}
    >
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <div
            key={s.key}
            className={`h-full ${s.className}`}
            style={{ width: `${Math.min(100, (s.value / total) * 100)}%` }}
          />
        ))}
    </div>
  );
}
```

Export it from `src/components/admin/ui/index.ts` beside `ProgressBar`.

- [ ] **Step 2: Add the `footer` slot to `MetricCard`**

Add `footer?: ReactNode` to both the destructure and the prop type (import `ReactNode` from `react`), and render it after the `sub` paragraph, inside the non-loading branch:

```tsx
          {sub && <p className="text-2xs text-neutral-500 dark:text-neutral-400 mt-2 truncate">{sub}</p>}
          {footer && <div className="mt-2">{footer}</div>}
```

`MetricCard`'s root is a `<button>`, so the footer must stay non-interactive — a bar and text only.

- [ ] **Step 3: Build the card model in `KpiGrid`**

Replace `:256-272`:

```tsx
  // ---- Renewals ----
  // One cohort, three outcomes: the members whose renewal fell DUE in the selected range.
  // The old card divided a payment-time numerator by a due-time denominator, which described
  // two different groups of people — see the design spec.
  const rp = users?.renewalProgress;
  const cohort = users?.membershipRenewals?.renewalCohort;
  const renewalRate: number | null = rp?.rate ?? null;

  const renewalValue = (cohort?.landedInRange ?? 0).toLocaleString("en-AU");
  const renewalAside =
    cohort && cohort.dueInRange > 0
      ? `of ${cohort.dueInRange.toLocaleString("en-AU")} due${rangeLabel ? ` ${rangeLabel.toLowerCase()}` : ""}`
      : undefined;

  // Remainder = due − landed − failed. On an open range that is "still to come"; on a closed
  // one nobody is coming, so it is "did not renew". It can exceed pendingInRange when a status
  // sits in neither numerator (RenewalCohort.dueInRange), which is why it is derived, not read.
  const renewalRemainder = cohort
    ? Math.max(0, cohort.dueInRange - cohort.landedInRange - cohort.failedInRange)
    : 0;
  const remainderLabel = cohort?.isOpen ? "to come" : "did not renew";

  const renewalSub = !cohort || cohort.dueInRange === 0
    ? "No renewals due"
    : cohort.collectionRate == null
      ? "None attempted yet"
      : `${cohort.collectionRate.toFixed(1)}% collected of those attempted`;

  const renewalFooter = cohort && cohort.dueInRange > 0 ? (
    <div className="space-y-1.5">
      <SegmentedBar
        total={cohort.dueInRange}
        label={`${cohort.landedInRange} landed, ${cohort.failedInRange} failed, ${renewalRemainder} ${remainderLabel}`}
        segments={[
          { key: "landed", value: cohort.landedInRange, className: "bg-emerald-500" },
          { key: "failed", value: cohort.failedInRange, className: "bg-red-500" },
        ]}
      />
      <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-2xs font-medium text-neutral-500 dark:text-neutral-400">
        <span className="inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-sm bg-emerald-500" />
          {cohort.landedInRange.toLocaleString("en-AU")} landed
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-sm bg-red-500" />
          {cohort.failedInRange.toLocaleString("en-AU")} failed
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-sm bg-neutral-300 dark:bg-neutral-600" />
          {renewalRemainder.toLocaleString("en-AU")} {remainderLabel}
        </span>
      </div>
    </div>
  ) : undefined;
```

Import `SegmentedBar` from `@/components/admin/ui`.

- [ ] **Step 4: Render the card**

At `:383`, the Renewals `MetricCard` gains `valueAside={renewalAside}` and `footer={renewalFooter}`, keeping `title="Renewals"`, its icon and tone.

- [ ] **Step 5: Add a count formatter for the breakdown popover**

`KpiCard`'s breakdown rows hard-format via `moneyExact(row.value)` (`:139`) — **silent-failure row R5**: counts would render as `$31`. Add an optional formatter to `BreakdownRow` and default it to money so every existing caller is untouched:

```ts
type BreakdownRow = { id: string; label: string; color: string; value: number; icon?: PackageIconData; format?: (n: number) => string };
```

At `:139` use `{(row.format ?? moneyExact)(row.value)}`.

- [ ] **Step 6: Give the Renewals card its popover breakdown**

Switch the Renewals tile from `MetricCard` to `KpiCard` so it gains the click-through, and pass a count-formatted breakdown. `succeededDistinctMembers` lives here — it ties to the Revenue card's membership-renewal row but is a **different cohort** (payment-time), so it must not sit on the card face beside the fraction:

```ts
  const countFmt = (n: number) => n.toLocaleString("en-AU");
  const renewalBreakdown: BreakdownRow[] = cohort
    ? [
        { id: "landed", label: "Landed", color: "#10b981", value: cohort.landedInRange, format: countFmt },
        { id: "failed", label: "Failed", color: "#ef4444", value: cohort.failedInRange, format: countFmt },
        { id: "remainder", label: cohort.isOpen ? "Still to come" : "Did not renew", color: "#a3a3a3", value: renewalRemainder, format: countFmt },
        { id: "payments", label: "Payments received in range", color: "#eab308", value: users?.membershipRenewals?.succeededDistinctMembers ?? 0, format: countFmt },
      ]
    : [];
```

- [ ] **Step 7: Verify in the running app**

Run: `npm run dev` (port 3047), open `/admin`, sign in, check the Renewals card against today's production figures.
Expected: `31 of 102 due today` (numbers will have moved — the identity `landed + failed + remainder = due` is what must hold), a green/red/grey bar, `X% collected of those attempted`, and a popover with four count rows and **no dollar signs**.
Also check `yesterday`: the remainder must read "did not renew", not "to come".

- [ ] **Step 8: Lint, type-check, test**

```bash
npm run lint && npm run type-check && npm run test:renewal-cohort && npm run test:period-comparison
```

- [ ] **Step 9: Update `docs/admin/frontend.md`** with the card's cohort semantics.

- [ ] **Step 10: Commit** *(if authorised)*

```bash
git add src/components/admin/ui/ src/app/admin/component/overview/sections/KpiGrid.tsx docs/
git commit -m "feat(admin): renewals card shows landed vs expected for the range"
```

---

### Task 4: Norm gateway lockstep

**Files:**
- Modify: `src/lib/internal-norm/schemas/dashboard.ts:20-25`
- Modify: `src/app/api/internal/norm/v1/dashboard/stats/route.ts:37-41`
- Modify: `docs/internal-norm/norm-context.md`
- Regenerate: `src/generated/normToolsManifest.json`

**Interfaces:**
- Consumes: `stats.users.membershipRenewals` (Task 2).

A schema↔output mismatch here is a **runtime 500** that `tsc` cannot see. Change both sides together.

- [ ] **Step 1: Update the Zod schema**

```ts
    membershipRenewals: z.object({
      // Anchored to renewals DUE in range — numerator and denominator are the same members.
      dueInRange: z.number(),
      landedInRange: z.number(),
      failedInRange: z.number(),
      pendingInRange: z.number(),
      collectionRate: z.number().nullable(),
      succeededInRange: z.number(),
      // ATTEMPTS, inflated by dunning retries — not a member count. Use failedInRange for members.
      failedInvoiceAttemptsInRange: z.number(),
      becamePastDueInRange: z.number(),
    }),
```

`expectedInRange` is removed: it never was a forecast (`MembershipRenewalCycle` has zero future rows), and leaving the name in place would keep Norm asserting one.

- [ ] **Step 2: Update the route projection to match exactly**

```ts
        membershipRenewals: {
          dueInRange: stats.users.membershipRenewals.renewalCohort.dueInRange,
          landedInRange: stats.users.membershipRenewals.renewalCohort.landedInRange,
          failedInRange: stats.users.membershipRenewals.renewalCohort.failedInRange,
          pendingInRange: stats.users.membershipRenewals.renewalCohort.pendingInRange,
          collectionRate: stats.users.membershipRenewals.renewalCohort.collectionRate,
          succeededInRange: stats.users.membershipRenewals.succeededInRange,
          failedInvoiceAttemptsInRange: stats.users.membershipRenewals.failedInvoiceAttemptsInRange,
          becamePastDueInRange: stats.users.membershipRenewals.becamePastDueInRange,
        },
```

- [ ] **Step 3: Update `docs/internal-norm/norm-context.md`**

State that renewals are cohort-anchored by due date; that `failedInvoiceAttemptsInRange` counts retry attempts and will exceed `failedInRange`; and that a past range's `failedInRange` decreases over time as dunning recovers cycles (the same row flips `failed → succeeded`).

- [ ] **Step 4: Regenerate the manifest**

Run: `npm run build:norm-manifest`

- [ ] **Step 5: Verify**

```bash
npm run type-check && npm run norm:smoke
```
Expected: `norm:smoke` returns 200 for `/dashboard/stats`. A **500 means the schema and the projection disagree** — re-diff Steps 1 and 2 field by field.

- [ ] **Step 6: Commit** *(if authorised)*

```bash
git add src/lib/internal-norm/ src/app/api/internal/norm/ src/generated/normToolsManifest.json docs/internal-norm/
git commit -m "feat(norm): mirror renewal cohort, retire misnamed expectedInRange"
```

---

### Task 5: Date filter into the admin header

**Files:**
- Modify: `src/app/admin/component/adminMobileDateToolbarSlot.ts` → rename to `adminDateToolbarSlot.ts`
- Modify: `src/components/admin/AdminDateRangeToolbar.tsx:87-96`
- Modify: `src/app/admin/component/AdminPage.tsx:195`
- Modify: `src/hooks/useAdminMobileDateToolbarSlot.ts` → rename to `useAdminDateToolbarSlot.ts`
- Modify: `src/app/admin/component/AdminMobileLayoutDateRangeShell.tsx`
- Modify: `docs/admin/admin-layout.md`

Independent of Tasks 1–4; order freely.

- [ ] **Step 1: Rename the slot module and its exports**

`git mv src/app/admin/component/adminMobileDateToolbarSlot.ts src/app/admin/component/adminDateToolbarSlot.ts`, then rename `ADMIN_MOBILE_DATE_TOOLBAR_SLOT_ID` → `ADMIN_DATE_TOOLBAR_SLOT_ID`, `ADMIN_TABS_WITH_MOBILE_LAYOUT_DATE_TOOLBAR` → `ADMIN_TABS_WITH_LAYOUT_DATE_TOOLBAR`, `adminTabUsesMobileLayoutDateToolbar` → `adminTabUsesLayoutDateToolbar`, and `AdminTabWithMobileLayoutDate` → `AdminTabWithLayoutDate`. The DOM id string stays `"admin-mobile-date-toolbar-slot"` for now — changing it buys nothing and risks a missed reference.

Do the same for the hook file and `useAdminMobileDateToolbarSlot` → `useAdminDateToolbarSlot`.

Find every call site: `grep -rn "MOBILE_LAYOUT_DATE\|MOBILE_DATE_TOOLBAR\|useAdminMobileDateToolbarSlot\|adminTabUsesMobileLayoutDateToolbar" src/`

- [ ] **Step 2: Make the slot render at every breakpoint**

`AdminPage.tsx:195` — drop `lg:hidden`:

```tsx
              {adminTabUsesLayoutDateToolbar(selectedTab ?? "") && (
                <div id={ADMIN_DATE_TOOLBAR_SLOT_ID} />
              )}
```

**This is silent-failure row R11.** Leaving `lg:hidden` while Step 3 portals into the slot makes the filter vanish entirely on desktop — it renders into a `display: none` element with no error.

- [ ] **Step 3: Portal at every breakpoint; delete the sticky branch**

In `AdminDateRangeToolbar.tsx`, collapse the three placements to two. Delete `:87-96` (the `isLgUp` sticky branch) and its stickiness doc-comment (`:21-40`) — the footguns it warned about no longer exist. Replace the render body:

```tsx
  return (
    <>
      {slotEl ? (
        <>
          {createPortal(
            <AdminMobileLayoutDateRangeShell>{dropdown}</AdminMobileLayoutDateRangeShell>,
            slotEl,
          )}
          {leading ? <div className="flex flex-wrap items-center gap-2">{leading}</div> : null}
        </>
      ) : (
        // First paint only, before the layout slot has mounted.
        <div className="flex flex-col gap-2 min-w-0 w-full max-w-full">
          {leading ? <div className="flex flex-wrap items-center gap-2">{leading}</div> : null}
          <div className="flex-shrink-0 min-w-0 w-full max-w-full">
            <AdminMobileLayoutDateRangeShell>{dropdown}</AdminMobileLayoutDateRangeShell>
          </div>
        </div>
      )}

      <CustomDateRangeModal
        isOpen={filter.isCustomOpen}
        onClose={() => filter.setIsCustomOpen(false)}
        onApply={(s, e) => filter.applyCustom(s, e)}
        currentStartDate={filter.startDate}
        currentEndDate={filter.endDate}
        majorDraws={majorDraws}
      />
    </>
  );
```

Rewrite the component's doc-comment to describe the two remaining placements. If `isLgUp` is now unused in this file, drop it from the destructure (`docs/UNUSED-VARS-CONVENTIONS.md` prefers deletion over `_` prefixing).

- [ ] **Step 4: Stop the shell stretching on desktop**

`AdminMobileLayoutDateRangeShell` was sized for a narrow mobile header. In the desktop header it sits in a `shrink-0` flex row beside the theme toggle. Check it in the browser; if it stretches, constrain it (`w-auto` at `lg`) rather than widening the header row.

- [ ] **Step 5: Verify in the running app**

`npm run dev`, then on `/admin` (Overview) and one more date-filtered tab (e.g. All Platforms):
- Desktop ≥1024px: filter sits in the header beside the theme toggle; **scroll to the bottom — it must still be visible and must not overlay any card**.
- Below 1024px: unchanged from today.
- Change the range: data refetches, the URL's `dateRange` param updates.
- Open the custom-range modal: still opens and applies.
- A tab NOT in `ADMIN_TABS_WITH_LAYOUT_DATE_TOOLBAR` (e.g. Users): no stray empty slot in the header.

- [ ] **Step 6: Lint and type-check**

Run: `npm run lint && npm run type-check`

- [ ] **Step 7: Update `docs/admin/admin-layout.md`** — the toolbar now has two placements, not three, and desktop no longer uses `position: sticky`.

- [ ] **Step 8: Commit** *(if authorised)*

```bash
git add src/app/admin/component/ src/components/admin/AdminDateRangeToolbar.tsx src/hooks/ docs/admin/
git commit -m "fix(admin): date filter sits in the header on desktop, not sticky over content"
```

---

### Task 6: Collapsible sidebar with hover flyouts

**Files:**
- Modify: `src/app/admin/component/AdminPage.tsx:130-137` (state + width)
- Modify: `src/app/admin/component/AdminSidebar.tsx` (collapsed rendering)
- Modify: `docs/admin/admin-layout.md`

Independent of Tasks 1–5.

- [ ] **Step 1: Own the collapsed state in `AdminPage`**

`AdminPage` renders the width wrapper, so it owns the state. Read `localStorage` in an effect, not in the initialiser — reading during render causes a hydration mismatch, since the server has no `localStorage`:

```tsx
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      setSidebarCollapsed(localStorage.getItem("admin-sidebar-collapsed") === "1");
    } catch {
      /* private mode — stay expanded */
    }
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("admin-sidebar-collapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
```

`localStorage`, not `sessionStorage`: a chrome preference should outlive the tab. Group expansion stays in `sessionStorage` — different lifetime, deliberately not merged.

- [ ] **Step 2: Make the wrapper width conditional**

At `:130`:

```tsx
      <div
        className={`hidden lg:block shrink-0 transition-[width] duration-200 ${
          sidebarCollapsed ? "w-[3.75rem]" : "w-[17.5rem]"
        }`}
      >
        <AdminSidebar
          selectedTab={selectedTab}
          onNavigateToSite={() => navigateTo("home")}
          user={user}
          isMobile={false}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebarCollapsed}
        />
      </div>
```

The mobile drawer instance at `:115` passes **neither** prop — it keeps `collapsed` defaulting to `false`. A hover rail is a dead control on touch.

- [ ] **Step 3: Accept the props in `AdminSidebar`**

Add `collapsed?: boolean` and `onToggleCollapsed?: () => void` to `AdminSidebarProps`, defaulting `collapsed = false`. The component stays presentational, matching how it already takes `isMobile` / `onClose`.

- [ ] **Step 4: Collapse the header and footer**

When `collapsed`, the header shows only the shield badge (hide the "Admin Panel / Tools Australia" text and the View Site label — keep the Home icon as an icon-only button with a `title`), and the footer shows only the avatar.

- [ ] **Step 5: Add the toggle button**

On the sidebar root (which needs `relative`), rendered only when `onToggleCollapsed` is provided:

```tsx
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="absolute top-[4.2rem] -right-[11px] z-40 w-[22px] h-[22px] rounded-full border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-gray-500 dark:text-neutral-400 hover:text-red-600 hover:border-red-300 shadow-md flex items-center justify-center transition-colors"
          >
            {collapsed ? <ChevronRight className="w-3 h-3" strokeWidth={3} /> : <ChevronLeft className="w-3 h-3" strokeWidth={3} />}
          </button>
        )}
```

Import `ChevronLeft` from `lucide-react` (`ChevronRight` is already imported).

- [ ] **Step 6: Render the collapsed rail with flyouts**

When `collapsed`, each group renders **only** its `groupIcon` as one button, with the group's permission-filtered tabs in an absolutely-positioned flyout revealed on `group-hover` / `group-focus-within`:

```tsx
<div className="relative group">
  <button
    type="button"
    title={group.label}
    aria-label={group.label}
    className="relative w-full flex items-center justify-center py-2.5 rounded-lg text-gray-600 dark:text-neutral-300 hover:bg-gray-100 dark:hover:bg-neutral-800"
  >
    <GroupIcon className="w-[18px] h-[18px]" />
    {(operationsNeedsAttention || drawsNeedsAttention) && (
      <span className="absolute top-1 right-2 w-1.5 h-1.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-neutral-900" />
    )}
  </button>
  <div className="absolute left-full top-0 ml-2 min-w-[190px] z-[80] rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl p-1.5 opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-opacity">
    {/* group.label heading, then visibleTabs mapped to the same tab buttons the expanded sidebar renders */}
  </div>
</div>
```

Two details that are not optional:

- **The attention dot must survive collapsing** (silent-failure row R12). It moves to the icon's top-right with a ring in the sidebar background. Collapsing must never hide a red flag.
- **Add an invisible hover bridge** across the `ml-2` gap, or the flyout closes as the pointer crosses it: an `absolute -left-2 top-0 w-2 h-full` span inside the flyout.

- [ ] **Step 7: Stop the nav clipping the flyout**

`AdminSidebar.tsx:226` is `flex-1 overflow-y-auto`, which clips an absolutely-positioned child — **silent-failure row R13**: the flyout renders and is invisible. Make the overflow conditional; 8 group icons fit any `lg` viewport without scrolling:

```tsx
      <div ref={navScrollRef} className={`flex-1 ${collapsed ? "overflow-visible" : "overflow-y-auto admin-scrollbar"}`}>
```

- [ ] **Step 8: Verify in the running app**

`npm run dev`, `/admin` on a desktop viewport:
- Toggle collapses to a 60px rail; content area widens.
- Hover each of the 8 group icons: flyout appears, **is fully visible and not clipped**, and moving the pointer into it does not dismiss it.
- Tab through the rail: flyouts open on focus.
- Reload: the collapsed state persists.
- Operations/Draws with a pending item: red dot still visible collapsed.
- Click a flyout item: navigates, and the sidebar stays collapsed.
- Resize below 1024px: mobile drawer unchanged, full-width, no toggle.
- Toggle expanded again: labels, group expansion and scroll position all return.

- [ ] **Step 9: Lint and type-check**

Run: `npm run lint && npm run type-check`

- [ ] **Step 10: Update `docs/admin/admin-layout.md`** — collapsed rail, flyout behaviour, the two storage keys and their different lifetimes, and the two silent traps (clipping, hidden dot).

- [ ] **Step 11: Commit** *(if authorised)*

```bash
git add src/app/admin/component/ docs/admin/
git commit -m "feat(admin): collapsible sidebar rail with hover flyouts"
```

---

## Final verification

- [ ] `npm run lint`
- [ ] `npm run type-check`
- [ ] `npm run test:renewal-cohort`
- [ ] `npm run test:renewal-progress` (regression — the cycle line is unchanged)
- [ ] `npm run test:period-comparison` (regression — reads `succeededInRange`)
- [ ] `npm run norm:smoke`
- [ ] `npm run build` — Turbopack production build
- [ ] Manual pass from Task 3 Step 7, Task 5 Step 5, Task 6 Step 8
- [ ] Doc-sync Stop hook clean (`docs/admin/`, `docs/subscription/`, `docs/internal-norm/`)

## Spec coverage

| Spec | Task |
|---|---|
| §4.1 cohort queries + shaping | 1, 2 |
| §4.2 transport + catch fallback (R3, R4) | 2 |
| §4.3 card UI, `footer`, `SegmentedBar`, count formatter (R5) | 3 |
| §4.4 date filter (R10, R11) | 5 |
| §4.5 sidebar (R12, R13) | 6 |
| §4.6 edge cases | 1 (rate/empty/refunded), 3 (open vs closed labels) |
| §5 R6–R9 Norm lockstep | 4 |
| §6 tests | 1 (cohort), 3 + 5 + 6 (manual), 4 (`norm:smoke`) |
| §9 O1 index check | 2 Step 1 — see below |

**§6 gap, accepted:** the spec named a `test:norm-dashboard-shape` unit test asserting the route's projection parses against the Zod schema. `npm run norm:smoke` exercises the same failure end-to-end against a live route, so the unit test is redundant here — Task 4 Step 5 covers R6/R7. Revisit if smoke coverage is ever dropped.

**§9 O1 (index check)** runs inside Task 2 Step 1: after wiring the query, `explain()` the `pendingInRange` filter against production shape. `getUpcomingRenewals` (`dashboardSlices.ts:912-916`) already issues the same shape on every Overview load, so any gap is pre-existing rather than introduced — but if it is a COLLSCAN, add the compound index before Task 3 ships the card.
