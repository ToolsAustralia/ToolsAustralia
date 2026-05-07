# Past-Due Charge History — Grouping, Search, Clickable Emails, Bug Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two backend bugs (AEST date filter, decline code fidelity) and add UX features (group-by-user with collapsible breakdown, server-side user search on Manual Retries, client-side search in run drawer, clickable user emails, drop redundant "When" column) on the Past-Due Charge History admin surface.

**Architecture:** Bug fixes live in the API/service/model layers (timezone-aware date parsing, schema field, save-site updates). UI changes are in the existing two admin components (`PastDueChargeHistory.tsx` and `PastDueChargeHistoryDrawer.tsx`) backed by a new pure grouping helper in `src/utils/admin/`. Search uses server-side filtering on the paginated Manual Retries endpoint and client-side filtering in the drawer (single-response data).

**Tech Stack:** Next.js 15 App Router, Mongoose, Stripe SDK, `date-fns-tz`, TanStack Query, React 19, Tailwind. Tests are standalone tsx scripts under `__tests__/` per repo convention.

**Spec:** [docs/superpowers/specs/2026-05-06-past-due-history-grouping-and-fixes-design.md](../specs/2026-05-06-past-due-history-grouping-and-fixes-design.md)

---

## Repo conventions

- **Hard rule — no auto-commit.** This repo's CLAUDE.md forbids `git commit`/`add`/`push` unless the user has explicitly authorized in their most recent message. Each commit step in this plan must be gated on the user saying `commit` (or one of the other approved keywords). The PreToolUse Bash hook enforces this.
- **No test runner.** Tests are tsx scripts. Each new test file needs its own `test:*` entry in `package.json`. Run via `npm run test:<scope>`.
- **Domain docs.** Anything under `src/` or `scripts/` triggers the doc-sync hook on Stop. Docs to update at the end of this plan: `docs/admin/`, `docs/billing-stripe/`, `docs/client-state/`.
- **Strict layering.** Route handlers stay thin; logic lives in services/utils. UI components hold no DB access.

---

## File Structure

**Modify:**
- `src/models/InvoiceChargeLog.ts` — add `declineCode?: string` field
- `src/server/admin/chargePastDuePostPayPolicy.ts` — add optional `declineCode` to `PostPayDecision` failure shape, populate from PI
- `src/server/admin/__tests__/chargePastDuePostPayPolicy.test.ts` — new cases for `declineCode` propagation
- `src/server/admin/chargePastDueShared.ts` — `extractStripeErrorFields` helper + write `declineCode` at four save sites
- `src/services/admin/chargePastDueHistory.ts` — `parseAestDateBoundary` helper, switch `endDate` to `$lt`, add `userSearch` param to `listManualRetries`, propagate `declineCode` in DTOs
- `src/services/admin/__tests__/chargePastDueHistory.test.ts` — AEST boundary + `$lt` shape + `userSearch` regex-escape cases
- `src/app/api/admin/charge-past-due/runs/route.ts` — use AEST helper
- `src/app/api/admin/charge-past-due/manual-retries/route.ts` — use AEST helper + pass `userSearch`
- `src/hooks/queries/admin/useChargePastDueManualRetries.ts` — add `userSearch` to filter, expose `declineCode` in row type
- `src/hooks/queries/admin/useChargePastDueRunDetail.ts` — expose `declineCode` in row type
- `src/app/admin/component/PastDueChargeHistory.tsx` — grouped Manual Retries, search input, `<ClickableUserDisplay>`, declineCode in error cell
- `src/app/admin/component/PastDueChargeHistoryDrawer.tsx` — grouped Per-invoice attempts, search input, `<ClickableUserDisplay>`, declineCode in error cell, remove "When" column
- `package.json` — add `test:group-charge-attempts` script
- `docs/admin/*` and `docs/billing-stripe/models.md` and `docs/client-state/*` — domain doc updates

**Create:**
- `src/utils/admin/groupChargeAttemptsByUser.ts` — pure grouping helper
- `src/utils/admin/__tests__/groupChargeAttemptsByUser.test.ts` — grouping helper tests

---

## Task 1: Add `declineCode` to InvoiceChargeLog schema

**Files:**
- Modify: `src/models/InvoiceChargeLog.ts`

- [ ] **Step 1.1: Add the field to the interface and schema**

Edit `src/models/InvoiceChargeLog.ts`:

```ts
// In IInvoiceChargeLog (after errorCode):
errorCode?: string;
declineCode?: string;
errorMessage?: string;
```

```ts
// In InvoiceChargeLogSchema definition (after errorCode block):
errorCode: {
  type: String,
  required: false,
},
declineCode: {
  type: String,
  required: false,
},
errorMessage: {
  type: String,
  required: false,
},
```

No index needed — never queried by `declineCode` directly.

- [ ] **Step 1.2: Type-check**

Run: `npm run type-check`
Expected: PASS, no new errors.

- [ ] **Step 1.3: Lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 1.4: Commit (if user approves)**

```bash
git add src/models/InvoiceChargeLog.ts
git commit -m "feat(billing): add declineCode field to InvoiceChargeLog"
```

---

## Task 2: Propagate `decline_code` in PostPayDecision

**Files:**
- Modify: `src/server/admin/chargePastDuePostPayPolicy.ts`
- Modify: `src/server/admin/__tests__/chargePastDuePostPayPolicy.test.ts`

The `requires_payment_method` branch already reads `paymentIntent.last_payment_error.code`. We need to also surface `decline_code` so the saved log row has it.

- [ ] **Step 2.1: Add a failing test for decline_code propagation**

Edit `src/server/admin/__tests__/chargePastDuePostPayPolicy.test.ts`. Add the following test function (place it next to other PI-driven cases) and call it from `run()`:

```ts
function testRequiresPaymentMethodPropagatesDeclineCode() {
  const decision = decidePostPayAction(
    { status: "open" } as Stripe.Invoice,
    {
      id: "pi_x",
      status: "requires_payment_method",
      last_payment_error: {
        code: "card_declined",
        decline_code: "do_not_honor",
        message: "Your card was declined.",
      },
    } as unknown as Stripe.PaymentIntent
  );
  assert.equal(decision.kind, "failed");
  if (decision.kind !== "failed") return;
  assert.equal(decision.errorCode, "card_declined");
  assert.equal(decision.declineCode, "do_not_honor");
  assert.equal(decision.errorMessage, "Your card was declined.");
}
```

- [ ] **Step 2.2: Run the test to verify it fails**

Run: `npm run test:charge-past-due-post-pay`
Expected: FAIL — `decision.declineCode` is `undefined` because the type/field doesn't exist yet.

- [ ] **Step 2.3: Update the PostPayDecision type and producer**

Edit `src/server/admin/chargePastDuePostPayPolicy.ts`:

```ts
export type PostPayDecision =
  | { kind: "success" }
  | { kind: "needs_confirm"; piId: string }
  | { kind: "requires_authentication" }
  | { kind: "failed"; errorCode: string; errorMessage: string; declineCode?: string };
```

In the `requires_payment_method` branch, add `declineCode`:

```ts
case "requires_payment_method":
  return {
    kind: "failed",
    errorCode: paymentIntent.last_payment_error?.code ?? "card_declined",
    declineCode: paymentIntent.last_payment_error?.decline_code,
    errorMessage:
      paymentIntent.last_payment_error?.message ?? "Payment method was declined",
  };
```

Other failed branches don't have a `decline_code` source — leave them alone.

- [ ] **Step 2.4: Run the test to verify it passes**

Run: `npm run test:charge-past-due-post-pay`
Expected: PASS.

- [ ] **Step 2.5: Commit (if user approves)**

```bash
git add src/server/admin/chargePastDuePostPayPolicy.ts \
        src/server/admin/__tests__/chargePastDuePostPayPolicy.test.ts
git commit -m "feat(admin): propagate stripe decline_code through PostPayDecision"
```

---

## Task 3: Save `declineCode` at all four sites in chargePastDueShared.ts

**Files:**
- Modify: `src/server/admin/chargePastDueShared.ts`

Three sites currently save `errorCode: stripeErr.code` directly; one synthesizes from `decision`. All four need to also write `declineCode`.

- [ ] **Step 3.1: Add a small helper at the top of `chargePastDueShared.ts` (near `sanitizeStripeResponse`)**

```ts
/**
 * Pull the trio of fields we persist into InvoiceChargeLog from a Stripe error.
 * `decline_code` is the specific reason (e.g. `do_not_honor`); `code` is the bucket
 * (e.g. `card_declined`). Saving both lets the UI prefer the specific one.
 */
function extractStripeErrorFields(err: Stripe.errors.StripeError): {
  errorCode?: string;
  declineCode?: string;
  errorMessage?: string;
} {
  const cardErr = err as Stripe.errors.StripeError & { decline_code?: string };
  return {
    errorCode: err.code,
    declineCode: cardErr.decline_code,
    errorMessage: err.message,
  };
}
```

- [ ] **Step 3.2: Update the "PI confirm threw" save site (~line 432)**

Find the block (inside `if (decision.kind === "needs_confirm")` → `catch (confirmErr)`):

```ts
const stripeErr = confirmErr as Stripe.errors.StripeError;
await InvoiceChargeLog.create({
  invoiceId,
  customerId,
  userId: new mongoose.Types.ObjectId(userIdStr),
  adminId: new mongoose.Types.ObjectId(adminId),
  status: "failed",
  errorCode: stripeErr.code,
  errorMessage: stripeErr.message,
  amount,
  ...
});
```

Replace the `errorCode`/`errorMessage` lines with the helper:

```ts
const stripeErr = confirmErr as Stripe.errors.StripeError;
const errFields = extractStripeErrorFields(stripeErr);
await InvoiceChargeLog.create({
  invoiceId,
  customerId,
  userId: new mongoose.Types.ObjectId(userIdStr),
  adminId: new mongoose.Types.ObjectId(adminId),
  status: "failed",
  errorCode: errFields.errorCode,
  declineCode: errFields.declineCode,
  errorMessage: errFields.errorMessage,
  amount,
  ...
});
```

- [ ] **Step 3.3: Update the "decision-based failed" save site (~line 510)**

Find the block that constructs `failedErrorCode` / `failedErrorMessage` and saves the failed log. After the existing `failedErrorCode`/`failedErrorMessage` declarations, add:

```ts
const failedDeclineCode =
  decision.kind === "failed" ? decision.declineCode : undefined;
```

Then in the `InvoiceChargeLog.create({ ... })` for that branch, add `declineCode: failedDeclineCode` next to `errorCode: failedErrorCode`.

- [ ] **Step 3.4: Update the "already paid" skip save site (~line 562)**

Replace the lines:

```ts
errorCode: stripeError.code,
errorMessage: "Invoice already paid",
```

with:

```ts
errorCode: stripeError.code,
declineCode: (stripeError as Stripe.errors.StripeError & { decline_code?: string }).decline_code,
errorMessage: "Invoice already paid",
```

- [ ] **Step 3.5: Update the outer catch save site (~line 596)**

Replace the lines:

```ts
errorCode: stripeError.code,
errorMessage: stripeError.message,
```

with the helper:

```ts
...extractStripeErrorFields(stripeError),
```

(The fields the helper returns — `errorCode`, `declineCode`, `errorMessage` — match the schema exactly.)

- [ ] **Step 3.6: Type-check & lint**

Run: `npm run type-check && npm run lint`
Expected: PASS.

- [ ] **Step 3.7: Run existing related tests**

Run: `npm run test:past-due-admin-charge && npm run test:charge-past-due-post-pay`
Expected: all PASS.

- [ ] **Step 3.8: Commit (if user approves)**

```bash
git add src/server/admin/chargePastDueShared.ts
git commit -m "feat(admin): save declineCode on all past-due charge log save sites"
```

---

## Task 4: AEST-aware date boundaries in the history service

**Files:**
- Modify: `src/services/admin/chargePastDueHistory.ts`
- Modify: `src/services/admin/__tests__/chargePastDueHistory.test.ts`

The frontend sends `YYYY-MM-DD` AEST calendar dates. The current `buildRunsFilter`/`buildManualRetriesFilter` accept arbitrary `Date` objects and use `$gte`/`$lte`. We're moving the timezone interpretation up to the route handlers (Task 5) and switching `$lte` → `$lt` here so the upper bound is exclusive (start of next AEST day).

- [ ] **Step 4.1: Add a failing test for the new `$lt` semantics**

Edit `src/services/admin/__tests__/chargePastDueHistory.test.ts`. Replace `testRunsFilterDateRange` with:

```ts
function testRunsFilterDateRangeUsesGteAndLt() {
  const f = buildRunsFilter({
    startDate: new Date("2026-05-05T14:00:00.000Z"), // AEST start of May 6
    endDate: new Date("2026-05-06T14:00:00.000Z"),   // AEST start of May 7
  });
  assert.ok(f.startedAt);
  assert.equal((f.startedAt as { $gte: Date }).$gte.toISOString(), "2026-05-05T14:00:00.000Z");
  assert.equal((f.startedAt as { $lt: Date }).$lt.toISOString(), "2026-05-06T14:00:00.000Z");
  assert.equal((f.startedAt as { $lte?: Date }).$lte, undefined);
}
```

Update the corresponding manual-retries date test to also assert `$lt` shape:

```ts
function testManualRetriesFilterDateRangeUsesGteAndLt() {
  const f = buildManualRetriesFilter({
    startDate: new Date("2026-05-05T14:00:00.000Z"),
    endDate: new Date("2026-05-06T14:00:00.000Z"),
  });
  assert.ok(f.attemptedAt);
  assert.equal((f.attemptedAt as { $gte: Date }).$gte.toISOString(), "2026-05-05T14:00:00.000Z");
  assert.equal((f.attemptedAt as { $lt: Date }).$lt.toISOString(), "2026-05-06T14:00:00.000Z");
  assert.equal((f.attemptedAt as { $lte?: Date }).$lte, undefined);
}
```

Update `run()` to call the renamed functions (drop `testRunsFilterDateRange` / `testManualRetriesFilterDateRange`).

- [ ] **Step 4.2: Run tests to verify they fail**

Run: `npm run test:past-due-history`
Expected: FAIL — `$lt` is undefined, `$lte` is set.

- [ ] **Step 4.3: Switch the operators in the service**

Edit `src/services/admin/chargePastDueHistory.ts`. In `buildRunsFilter`:

```ts
if (input.startDate || input.endDate) {
  const range: { $gte?: Date; $lt?: Date } = {};
  if (input.startDate) range.$gte = input.startDate;
  if (input.endDate) range.$lt = input.endDate;
  f.startedAt = range;
}
```

Same edit in `buildManualRetriesFilter` for `attemptedAt`. The interface comments above each helper should explain that `endDate` is now an exclusive upper bound (start of the next AEST day) — add a 1-line JSDoc.

- [ ] **Step 4.4: Run tests to verify they pass**

Run: `npm run test:past-due-history`
Expected: PASS.

- [ ] **Step 4.5: Commit (if user approves)**

```bash
git add src/services/admin/chargePastDueHistory.ts \
        src/services/admin/__tests__/chargePastDueHistory.test.ts
git commit -m "fix(admin): use exclusive upper bound (\$lt) for past-due history date range"
```

---

## Task 5: Parse `YYYY-MM-DD` as AEST in route handlers

**Files:**
- Modify: `src/app/api/admin/charge-past-due/runs/route.ts`
- Modify: `src/app/api/admin/charge-past-due/manual-retries/route.ts`
- Modify: `src/services/admin/chargePastDueHistory.ts` (add helper + export)
- Modify: `src/services/admin/__tests__/chargePastDueHistory.test.ts`

Define a tiny helper alongside the filters so it's testable.

- [ ] **Step 5.1: Add a failing test for the AEST helper**

Edit `src/services/admin/__tests__/chargePastDueHistory.test.ts`. Add at the top, next to the existing imports:

```ts
import {
  parseAestDayStartUtc,
  parseAestDayEndExclusiveUtc,
} from "../chargePastDueHistory";
```

Add these test functions (and call them from `run()`):

```ts
function testParseAestDayStart() {
  // 2026-05-06 00:00 AEST = 2026-05-05 14:00 UTC (AEST = UTC+10, no DST in May)
  assert.equal(
    parseAestDayStartUtc("2026-05-06")?.toISOString(),
    "2026-05-05T14:00:00.000Z"
  );
}

function testParseAestDayEndExclusive() {
  // End of 2026-05-06 AEST exclusive = 2026-05-07 00:00 AEST = 2026-05-06 14:00 UTC
  assert.equal(
    parseAestDayEndExclusiveUtc("2026-05-06")?.toISOString(),
    "2026-05-06T14:00:00.000Z"
  );
}

function testParseAestDayHandlesInvalid() {
  assert.equal(parseAestDayStartUtc(null), undefined);
  assert.equal(parseAestDayStartUtc(""), undefined);
  assert.equal(parseAestDayStartUtc("not-a-date"), undefined);
  assert.equal(parseAestDayEndExclusiveUtc(null), undefined);
}

function testParseAestRespectsAestDstBoundary() {
  // 2026-04-05 is the AEDT→AEST transition (clocks go back from +11 to +10 at 03:00 local).
  // Start of 2026-04-05 in Sydney = AEDT midnight = 2026-04-04T13:00:00Z
  assert.equal(
    parseAestDayStartUtc("2026-04-05")?.toISOString(),
    "2026-04-04T13:00:00.000Z"
  );
  // End-exclusive of 2026-04-05 = start of 2026-04-06 in Sydney = AEST midnight = 2026-04-05T14:00:00Z
  assert.equal(
    parseAestDayEndExclusiveUtc("2026-04-05")?.toISOString(),
    "2026-04-05T14:00:00.000Z"
  );
}
```

- [ ] **Step 5.2: Run tests to verify they fail**

Run: `npm run test:past-due-history`
Expected: FAIL — helpers don't exist yet.

- [ ] **Step 5.3: Implement the helper**

Edit `src/services/admin/chargePastDueHistory.ts`. Add at the top under existing imports:

```ts
import { zonedTimeToUtc } from "date-fns-tz";

const ADMIN_TIMEZONE = "Australia/Sydney";
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse a `YYYY-MM-DD` AEST/AEDT calendar date into the UTC instant of its local midnight. */
export function parseAestDayStartUtc(s: string | null | undefined): Date | undefined {
  if (!s || !ISO_DATE_RE.test(s)) return undefined;
  const d = zonedTimeToUtc(`${s}T00:00:00`, ADMIN_TIMEZONE);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Parse a `YYYY-MM-DD` AEST/AEDT calendar date into the UTC instant of the *next* day's
 * local midnight — used as an exclusive upper bound (`$lt`) so the entire local day is included
 * regardless of DST transitions.
 */
export function parseAestDayEndExclusiveUtc(s: string | null | undefined): Date | undefined {
  const start = parseAestDayStartUtc(s);
  if (!start) return undefined;
  const [y, m, d] = (s as string).split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  // Re-format as YYYY-MM-DD for the next day, then parse in AEST to handle DST cleanly.
  const yyyy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return zonedTimeToUtc(`${yyyy}-${mm}-${dd}T00:00:00`, ADMIN_TIMEZONE);
}
```

- [ ] **Step 5.4: Run tests to verify they pass**

Run: `npm run test:past-due-history`
Expected: PASS (including the DST case).

- [ ] **Step 5.5: Wire the helpers into `runs/route.ts`**

Edit `src/app/api/admin/charge-past-due/runs/route.ts`. Remove the local `parseDate` and import the new helpers:

```ts
import {
  listChargeRuns,
  parseAestDayStartUtc,
  parseAestDayEndExclusiveUtc,
} from "@/services/admin/chargePastDueHistory";
```

In the `GET` handler, replace:

```ts
startDate: parseDate(searchParams.get("startDate")),
endDate: parseDate(searchParams.get("endDate")),
```

with:

```ts
startDate: parseAestDayStartUtc(searchParams.get("startDate")),
endDate: parseAestDayEndExclusiveUtc(searchParams.get("endDate")),
```

Delete the now-unused local `parseDate` function.

- [ ] **Step 5.6: Wire the helpers into `manual-retries/route.ts`**

Same change — replace the local `parseDate` calls with `parseAestDayStartUtc` / `parseAestDayEndExclusiveUtc` imports. Delete the local helper.

- [ ] **Step 5.7: Type-check, lint, run tests**

Run: `npm run type-check && npm run lint && npm run test:past-due-history`
Expected: all PASS.

- [ ] **Step 5.8: Commit (if user approves)**

```bash
git add src/services/admin/chargePastDueHistory.ts \
        src/services/admin/__tests__/chargePastDueHistory.test.ts \
        src/app/api/admin/charge-past-due/runs/route.ts \
        src/app/api/admin/charge-past-due/manual-retries/route.ts
git commit -m "fix(admin): parse past-due history date filter as Australia/Sydney calendar day"
```

---

## Task 6: Server-side `userSearch` for Manual Retries

**Files:**
- Modify: `src/services/admin/chargePastDueHistory.ts`
- Modify: `src/services/admin/__tests__/chargePastDueHistory.test.ts`
- Modify: `src/app/api/admin/charge-past-due/manual-retries/route.ts`

- [ ] **Step 6.1: Add a failing test for regex escape + empty short-circuit**

Edit `src/services/admin/__tests__/chargePastDueHistory.test.ts`. Add at the bottom (and call from `run()`):

```ts
import { escapeUserSearchRegex } from "../chargePastDueHistory";

function testEscapeUserSearchRegex() {
  assert.equal(escapeUserSearchRegex("foo@bar.com"), "foo@bar\\.com");
  assert.equal(escapeUserSearchRegex("a.b+c"), "a\\.b\\+c");
  assert.equal(escapeUserSearchRegex("(test)"), "\\(test\\)");
  assert.equal(escapeUserSearchRegex("$caret^"), "\\$caret\\^");
  assert.equal(escapeUserSearchRegex(""), "");
}
```

- [ ] **Step 6.2: Run the test to verify it fails**

Run: `npm run test:past-due-history`
Expected: FAIL — `escapeUserSearchRegex` doesn't exist.

- [ ] **Step 6.3: Implement the helper and `userSearch` parameter**

Edit `src/services/admin/chargePastDueHistory.ts`.

Add the export near the date helpers:

```ts
/** Escape regex metacharacters so user search can't break out of a substring match. */
export function escapeUserSearchRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

Extend `ManualRetriesFilterInput`:

```ts
export interface ManualRetriesFilterInput {
  startDate?: Date;
  endDate?: Date;
  adminId?: Types.ObjectId | string;
  status?: IInvoiceChargeLog["status"];
  /** Substring match (case-insensitive) against User.email; max ~120 chars. */
  userSearch?: string;
}
```

Modify `listManualRetries` so when `userSearch` is provided (after trimming), it first resolves matching user IDs then constrains the log query. Replace the function body:

```ts
export async function listManualRetries(
  input: ManualRetriesFilterInput & { limit?: number; offset?: number }
): Promise<{ rows: ManualRetryRow[]; total: number }> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const offset = Math.max(input.offset ?? 0, 0);

  const trimmedSearch = input.userSearch?.trim().slice(0, 120) ?? "";

  let userIdConstraint: Types.ObjectId[] | undefined;
  if (trimmedSearch) {
    const matchedUsers = await User.find({
      email: { $regex: escapeUserSearchRegex(trimmedSearch), $options: "i" },
    })
      .select({ _id: 1 })
      .limit(500)
      .lean();

    if (matchedUsers.length === 0) {
      return { rows: [], total: 0 };
    }
    userIdConstraint = matchedUsers.map((u) => u._id as Types.ObjectId);
  }

  const filter = buildManualRetriesFilter(input);
  if (userIdConstraint) {
    filter.userId = { $in: userIdConstraint };
  }

  const [logRows, total] = await Promise.all([
    InvoiceChargeLog.find(filter)
      .sort({ attemptedAt: -1 })
      .skip(offset)
      .limit(limit)
      .select({
        invoiceId: 1,
        customerId: 1,
        userId: 1,
        adminId: 1,
        status: 1,
        amount: 1,
        attemptedAt: 1,
        errorCode: 1,
        declineCode: 1,
        errorMessage: 1,
      })
      .lean(),
    InvoiceChargeLog.countDocuments(filter),
  ]);

  // ... existing user/admin lookup unchanged, just add declineCode passthrough below
```

Update the `.map(...)` to include `declineCode: r.declineCode` next to `errorCode`. Update the `ManualRetryRow` (and `RunDetailRow`) interfaces:

```ts
export interface RunDetailRow {
  invoiceId: string;
  customerId: string;
  userId: string;
  userEmail: string;
  status: IInvoiceChargeLog["status"];
  amount: number;
  attemptedAt: Date;
  errorCode?: string;
  declineCode?: string;
  errorMessage?: string;
}
```

Also update `getChargeRunDetail`'s `.select({...})` and `.map(...)` to include `declineCode`.

- [ ] **Step 6.4: Run the test to verify it passes**

Run: `npm run test:past-due-history`
Expected: PASS.

- [ ] **Step 6.5: Wire `userSearch` through the route**

Edit `src/app/api/admin/charge-past-due/manual-retries/route.ts`. In `GET`:

```ts
const userSearch = (searchParams.get("userSearch") ?? "").trim() || undefined;

const result = await listManualRetries({
  startDate: parseAestDayStartUtc(searchParams.get("startDate")),
  endDate: parseAestDayEndExclusiveUtc(searchParams.get("endDate")),
  adminId: searchParams.get("adminId") || undefined,
  status,
  userSearch,
  limit: Number(searchParams.get("limit")) || 50,
  offset: Number(searchParams.get("offset")) || 0,
});
```

- [ ] **Step 6.6: Type-check & lint**

Run: `npm run type-check && npm run lint`
Expected: PASS.

- [ ] **Step 6.7: Commit (if user approves)**

```bash
git add src/services/admin/chargePastDueHistory.ts \
        src/services/admin/__tests__/chargePastDueHistory.test.ts \
        src/app/api/admin/charge-past-due/manual-retries/route.ts
git commit -m "feat(admin): server-side user search for past-due manual retries"
```

---

## Task 7: Hooks expose `declineCode` and `userSearch`

**Files:**
- Modify: `src/hooks/queries/admin/useChargePastDueManualRetries.ts`
- Modify: `src/hooks/queries/admin/useChargePastDueRunDetail.ts`

- [ ] **Step 7.1: Update `useChargePastDueManualRetries`**

Edit the file. Extend the row DTO and filter:

```ts
export interface ManualRetryRowDTO {
  invoiceId: string;
  customerId: string;
  userId: string | null;
  userEmail: string;
  adminId: string;
  adminName: string;
  status: "success" | "failed" | "skipped";
  amount: number;
  attemptedAt: string;
  errorCode?: string;
  declineCode?: string;
  errorMessage?: string;
}

export interface ManualRetriesFilter {
  startDate?: string;
  endDate?: string;
  adminId?: string;
  status?: "success" | "failed" | "skipped";
  userSearch?: string;
}
```

(If the file already declares these types, just add the new fields — don't duplicate.)

The `buildQueryString` already iterates `Object.entries(filter)` and skips empty strings, so `userSearch` flows through without code changes there. Verify by re-reading the current `buildQueryString`.

- [ ] **Step 7.2: Update `useChargePastDueRunDetail`**

Add `declineCode?: string` to the per-row DTO type in this file (same shape as the manual retries row DTO above, minus admin fields and userSearch).

- [ ] **Step 7.3: Type-check & lint**

Run: `npm run type-check && npm run lint`
Expected: PASS — consumers of these hooks will continue to compile because `declineCode` is optional.

- [ ] **Step 7.4: Commit (if user approves)**

```bash
git add src/hooks/queries/admin/useChargePastDueManualRetries.ts \
        src/hooks/queries/admin/useChargePastDueRunDetail.ts
git commit -m "feat(admin): expose declineCode + userSearch in past-due history hooks"
```

---

## Task 8: Pure grouping helper `groupChargeAttemptsByUser`

**Files:**
- Create: `src/utils/admin/groupChargeAttemptsByUser.ts`
- Create: `src/utils/admin/__tests__/groupChargeAttemptsByUser.test.ts`
- Modify: `package.json` (add test script)

- [ ] **Step 8.1: Write the failing test**

Create `src/utils/admin/__tests__/groupChargeAttemptsByUser.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  groupChargeAttemptsByUser,
  type ChargeAttemptInput,
} from "../groupChargeAttemptsByUser";

const baseAttempt: Omit<ChargeAttemptInput, "userId" | "userEmail" | "attemptedAt" | "status" | "amount"> = {
  invoiceId: "in_x",
  adminName: "Admin A",
  errorCode: undefined,
  declineCode: undefined,
  errorMessage: undefined,
};

function attempt(over: Partial<ChargeAttemptInput>): ChargeAttemptInput {
  return {
    ...baseAttempt,
    userId: "u1",
    userEmail: "a@x.com",
    status: "failed",
    amount: 10,
    attemptedAt: "2026-05-01T00:00:00Z",
    ...over,
  };
}

function testGroupsByUserId() {
  const result = groupChargeAttemptsByUser([
    attempt({ userId: "u1", userEmail: "a@x.com" }),
    attempt({ userId: "u2", userEmail: "b@x.com" }),
    attempt({ userId: "u1", userEmail: "a@x.com" }),
  ]);
  assert.equal(result.length, 2);
  const u1 = result.find((g) => g.userId === "u1");
  const u2 = result.find((g) => g.userId === "u2");
  assert.equal(u1?.attempts.length, 2);
  assert.equal(u2?.attempts.length, 1);
}

function testCountsByStatus() {
  const result = groupChargeAttemptsByUser([
    attempt({ status: "success", amount: 50 }),
    attempt({ status: "failed", amount: 30 }),
    attempt({ status: "skipped", amount: 0 }),
    attempt({ status: "failed", amount: 20 }),
  ]);
  const g = result[0];
  assert.equal(g.successCount, 1);
  assert.equal(g.failedCount, 2);
  assert.equal(g.skippedCount, 1);
  assert.equal(g.totalAmount, 100);
}

function testSortsAttemptsLatestFirst() {
  const result = groupChargeAttemptsByUser([
    attempt({ attemptedAt: "2026-05-01T00:00:00Z", status: "failed" }),
    attempt({ attemptedAt: "2026-05-03T00:00:00Z", status: "success" }),
    attempt({ attemptedAt: "2026-05-02T00:00:00Z", status: "skipped" }),
  ]);
  const g = result[0];
  assert.equal(g.attempts[0].attemptedAt, "2026-05-03T00:00:00Z");
  assert.equal(g.lastAttemptedAt, "2026-05-03T00:00:00Z");
  assert.equal(g.latestStatus, "success");
}

function testAdminLabelVarious() {
  const result = groupChargeAttemptsByUser([
    attempt({ attemptedAt: "2026-05-02T00:00:00Z", adminName: "Admin A" }),
    attempt({ attemptedAt: "2026-05-01T00:00:00Z", adminName: "Admin B" }),
  ]);
  assert.equal(result[0].adminLabel, "various");
}

function testAdminLabelSingle() {
  const result = groupChargeAttemptsByUser([
    attempt({ attemptedAt: "2026-05-02T00:00:00Z", adminName: "Admin A" }),
    attempt({ attemptedAt: "2026-05-01T00:00:00Z", adminName: "Admin A" }),
  ]);
  assert.equal(result[0].adminLabel, "Admin A");
}

function testGroupsSortedByLastAttemptDesc() {
  const result = groupChargeAttemptsByUser([
    attempt({ userId: "u1", attemptedAt: "2026-05-01T00:00:00Z" }),
    attempt({ userId: "u2", attemptedAt: "2026-05-03T00:00:00Z" }),
    attempt({ userId: "u3", attemptedAt: "2026-05-02T00:00:00Z" }),
  ]);
  assert.deepEqual(
    result.map((g) => g.userId),
    ["u2", "u3", "u1"]
  );
}

function testHandlesMissingUserIdWithSyntheticKey() {
  const result = groupChargeAttemptsByUser([
    attempt({ userId: null, userEmail: "anon@x.com" }),
    attempt({ userId: null, userEmail: "anon@x.com" }),
    attempt({ userId: "u1", userEmail: "a@x.com" }),
  ]);
  // null userIds with the same email collapse into one group.
  assert.equal(result.length, 2);
  const anon = result.find((g) => g.userId === null);
  assert.ok(anon);
  assert.equal(anon!.attempts.length, 2);
}

function run() {
  testGroupsByUserId();
  testCountsByStatus();
  testSortsAttemptsLatestFirst();
  testAdminLabelVarious();
  testAdminLabelSingle();
  testGroupsSortedByLastAttemptDesc();
  testHandlesMissingUserIdWithSyntheticKey();
  console.log("groupChargeAttemptsByUser tests passed");
}

run();
```

- [ ] **Step 8.2: Add the npm test script**

Edit `package.json`. Add to the `"scripts"` block (next to other `test:*` entries):

```json
"test:group-charge-attempts": "tsx src/utils/admin/__tests__/groupChargeAttemptsByUser.test.ts",
```

- [ ] **Step 8.3: Run the test to verify it fails**

Run: `npm run test:group-charge-attempts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 8.4: Implement the helper**

Create `src/utils/admin/groupChargeAttemptsByUser.ts`:

```ts
export interface ChargeAttemptInput {
  invoiceId: string;
  userId: string | null;
  userEmail: string;
  adminName: string;
  status: "success" | "failed" | "skipped";
  amount: number;
  attemptedAt: string;
  errorCode?: string;
  declineCode?: string;
  errorMessage?: string;
}

export interface UserAttemptGroup<T extends ChargeAttemptInput = ChargeAttemptInput> {
  userId: string | null;
  userEmail: string;
  attempts: T[];
  successCount: number;
  failedCount: number;
  skippedCount: number;
  totalAmount: number;
  lastAttemptedAt: string;
  latestStatus: "success" | "failed" | "skipped";
  adminLabel: string;
}

export function groupChargeAttemptsByUser<T extends ChargeAttemptInput>(
  attempts: readonly T[]
): UserAttemptGroup<T>[] {
  const buckets = new Map<string, T[]>();

  for (const a of attempts) {
    // Group by userId when present; fall back to userEmail so legacy/null userId rows still collapse.
    const key = a.userId ?? `email:${a.userEmail}`;
    const list = buckets.get(key);
    if (list) {
      list.push(a);
    } else {
      buckets.set(key, [a]);
    }
  }

  const groups: UserAttemptGroup<T>[] = [];
  for (const list of buckets.values()) {
    const sorted = [...list].sort((a, b) =>
      a.attemptedAt < b.attemptedAt ? 1 : a.attemptedAt > b.attemptedAt ? -1 : 0
    );
    const head = sorted[0];

    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let totalAmount = 0;
    const adminNames = new Set<string>();
    for (const a of sorted) {
      if (a.status === "success") successCount += 1;
      else if (a.status === "failed") failedCount += 1;
      else skippedCount += 1;
      totalAmount += a.amount;
      adminNames.add(a.adminName);
    }

    groups.push({
      userId: head.userId,
      userEmail: head.userEmail,
      attempts: sorted,
      successCount,
      failedCount,
      skippedCount,
      totalAmount,
      lastAttemptedAt: head.attemptedAt,
      latestStatus: head.status,
      adminLabel: adminNames.size === 1 ? head.adminName : "various",
    });
  }

  groups.sort((a, b) =>
    a.lastAttemptedAt < b.lastAttemptedAt ? 1 : a.lastAttemptedAt > b.lastAttemptedAt ? -1 : 0
  );

  return groups;
}
```

- [ ] **Step 8.5: Run the test to verify it passes**

Run: `npm run test:group-charge-attempts`
Expected: PASS — `groupChargeAttemptsByUser tests passed`.

- [ ] **Step 8.6: Type-check & lint**

Run: `npm run type-check && npm run lint`
Expected: PASS.

- [ ] **Step 8.7: Commit (if user approves)**

```bash
git add src/utils/admin/groupChargeAttemptsByUser.ts \
        src/utils/admin/__tests__/groupChargeAttemptsByUser.test.ts \
        package.json
git commit -m "feat(admin): add groupChargeAttemptsByUser helper for past-due history grouping"
```

---

## Task 9: Refactor Manual Retries table — group + search + clickable email + declineCode

**Files:**
- Modify: `src/app/admin/component/PastDueChargeHistory.tsx`

This is a substantial UI change in one file. Lint/type-check after — no UI test runner.

- [ ] **Step 9.1: Add new imports and state**

At the top of the file, alongside existing imports, add:

```ts
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import ClickableUserDisplay from "@/components/admin/ClickableUserDisplay";
import {
  groupChargeAttemptsByUser,
  type UserAttemptGroup,
} from "@/utils/admin/groupChargeAttemptsByUser";
import { useDebounce } from "@/hooks/useDebounce";
```

In the `PastDueChargeHistory` component body, alongside existing `useState`s:

```ts
const [userSearchInput, setUserSearchInput] = useState("");
const debouncedUserSearch = useDebounce(userSearchInput, 300);
const [expandedUserKeys, setExpandedUserKeys] = useState<Set<string>>(new Set());
```

Update the `filter` memo to include `userSearch`:

```ts
const filter = useMemo(
  () => ({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    userSearch: debouncedUserSearch.trim() || undefined,
  }),
  [startDate, endDate, debouncedUserSearch]
);
```

- [ ] **Step 9.2: Compute grouped rows**

Below the existing `strandedRows` memo, add:

```ts
const groupedRetries = useMemo<UserAttemptGroup<typeof retriesQuery.rows[number]>[]>(
  () => groupChargeAttemptsByUser(retriesQuery.rows),
  [retriesQuery.rows]
);

const groupKey = (g: UserAttemptGroup): string => g.userId ?? `email:${g.userEmail}`;

const toggleGroup = (key: string) => {
  setExpandedUserKeys((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
};

const toggleAllStrandedForUser = (g: UserAttemptGroup<typeof retriesQuery.rows[number]>) => {
  const keys = g.attempts
    .filter((a) => a.status === "failed" && isStrandedError(a.errorMessage, a.errorCode) && a.userId)
    .map((a) => `${a.userId}-${a.invoiceId}`);
  if (keys.length === 0) return;
  setSelectedRows((prev) => {
    const next = new Set(prev);
    const allSelected = keys.every((k) => next.has(k));
    if (allSelected) keys.forEach((k) => next.delete(k));
    else keys.forEach((k) => next.add(k));
    return next;
  });
};
```

- [ ] **Step 9.3: Add the search input to the Manual Retries section header**

Find the Manual Retries section header (`<h3 className="text-sm font-semibold ...">Manual Retries (per-user)</h3>` and the right-side controls cluster). Add a search input to the right cluster, before the bulk-recover button:

```tsx
<div className="relative">
  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-neutral-500" />
  <input
    type="search"
    value={userSearchInput}
    onChange={(e) => setUserSearchInput(e.target.value)}
    placeholder="Search by email…"
    className="w-44 rounded-md border border-gray-300 bg-white py-1 pl-7 pr-2 text-xs text-gray-900 placeholder-gray-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:placeholder-neutral-500"
  />
</div>
```

- [ ] **Step 9.4: Replace the per-attempt `<tbody>` with grouped + expandable rows**

Replace the existing `<tbody className="divide-y...">` block in the Manual Retries section with a render that emits one parent row per group, plus expanded sub-rows when expanded.

Replace the `<thead>` columns to:

```
[chevron col] | Last attempt | Admin | User | Attempts | Status | Total | Stranded
```

Updated `<thead>`:

```tsx
<thead>
  <tr className="border-b border-gray-200 dark:border-neutral-700">
    <th className="bg-gray-50 px-3 py-3 dark:bg-neutral-800 w-8" />
    <th className="bg-gray-50 px-3 py-3 text-left dark:bg-neutral-800 w-10">
      <span className="sr-only">Select</span>
    </th>
    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Last attempt</th>
    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Admin</th>
    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">User</th>
    <th className="bg-gray-50 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Attempts</th>
    <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Latest</th>
    <th className="bg-gray-50 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Total</th>
  </tr>
</thead>
```

`<tbody>`:

```tsx
<tbody className="divide-y divide-gray-200 dark:divide-neutral-700">
  {groupedRetries.map((g) => {
    const key = groupKey(g);
    const isExpanded = expandedUserKeys.has(key);
    const strandedKeys = g.attempts
      .filter((a) => a.status === "failed" && isStrandedError(a.errorMessage, a.errorCode) && a.userId)
      .map((a) => `${a.userId}-${a.invoiceId}`);
    const strandedCount = strandedKeys.length;
    const selectedHere = strandedKeys.filter((k) => selectedRows.has(k)).length;
    const checkboxState =
      strandedCount === 0
        ? "none"
        : selectedHere === 0
          ? "unchecked"
          : selectedHere === strandedCount
            ? "checked"
            : "indeterminate";

    return (
      <Fragment key={key}>
        <tr
          onClick={() => toggleGroup(key)}
          className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-neutral-800/70"
        >
          <td className="px-3 py-3">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-500" />
            )}
          </td>
          <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
            {checkboxState !== "none" && (
              <input
                type="checkbox"
                checked={checkboxState === "checked"}
                ref={(el) => {
                  if (el) el.indeterminate = checkboxState === "indeterminate";
                }}
                onChange={() => toggleAllStrandedForUser(g)}
                className="h-4 w-4 cursor-pointer rounded border-gray-300 text-amber-600 focus:ring-amber-500 dark:border-neutral-600 dark:bg-neutral-800"
              />
            )}
          </td>
          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-neutral-300">
            {formatDateTime(g.lastAttemptedAt)}
          </td>
          <td className="px-4 py-3 text-sm text-gray-700 dark:text-neutral-300">
            {g.adminLabel}
          </td>
          <td className="px-4 py-3 text-sm text-gray-700 dark:text-neutral-300">
            <ClickableUserDisplay
              displayText={g.userEmail || g.userId || "(unknown)"}
              userId={g.userId ?? undefined}
              className="text-sm"
            />
          </td>
          <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-neutral-300">
            {g.attempts.length}
            <span className="ml-2 text-xs text-gray-500 dark:text-neutral-400">
              {g.successCount > 0 && <span className="text-emerald-600">{g.successCount}✓ </span>}
              {g.failedCount > 0 && <span className="text-red-600">{g.failedCount}✗ </span>}
              {g.skippedCount > 0 && <span>{g.skippedCount}⏭</span>}
            </span>
          </td>
          <td className="px-4 py-3 text-sm">
            <RetryStatusBadge status={g.latestStatus} />
          </td>
          <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">
            {formatCents(g.totalAmount)}
          </td>
        </tr>

        {isExpanded && (
          <tr className="bg-gray-50/60 dark:bg-neutral-800/40">
            <td colSpan={8} className="px-4 py-3">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="px-2 py-2 text-left text-[10px] uppercase text-gray-500 w-8" />
                    <th className="px-2 py-2 text-left text-[10px] uppercase text-gray-500">When</th>
                    <th className="px-2 py-2 text-left text-[10px] uppercase text-gray-500">Invoice</th>
                    <th className="px-2 py-2 text-left text-[10px] uppercase text-gray-500">Status</th>
                    <th className="px-2 py-2 text-right text-[10px] uppercase text-gray-500">Amount</th>
                    <th className="px-2 py-2 text-left text-[10px] uppercase text-gray-500">Error</th>
                    <th className="px-2 py-2 text-right text-[10px] uppercase text-gray-500">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {g.attempts.map((r) => {
                    const stranded =
                      r.status === "failed" && isStrandedError(r.errorMessage, r.errorCode) && r.userId;
                    return (
                      <tr key={`${r.invoiceId}-${r.attemptedAt}`}>
                        <td className="px-2 py-2">
                          {stranded ? (
                            <input
                              type="checkbox"
                              checked={selectedRows.has(`${r.userId}-${r.invoiceId}`)}
                              onChange={() => toggleRow(`${r.userId}-${r.invoiceId}`)}
                              className="h-4 w-4 cursor-pointer rounded border-gray-300 text-amber-600 focus:ring-amber-500 dark:border-neutral-600 dark:bg-neutral-800"
                            />
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-xs text-gray-700 dark:text-neutral-300">
                          {formatDateTime(r.attemptedAt)}
                        </td>
                        <td className="px-2 py-2 font-mono text-xs text-gray-700 dark:text-neutral-300">
                          {r.invoiceId}
                        </td>
                        <td className="px-2 py-2 text-xs">
                          <RetryStatusBadge status={r.status} />
                        </td>
                        <td className="px-2 py-2 text-right text-xs font-semibold text-gray-900 dark:text-white">
                          {formatCents(r.amount)}
                        </td>
                        <td className="px-2 py-2 text-xs text-red-700 dark:text-red-400">
                          {r.declineCode ?? r.errorCode ?? r.errorMessage ?? ""}
                        </td>
                        <td className="px-2 py-2 text-right text-xs">
                          {stranded ? (
                            <button
                              type="button"
                              onClick={() => {
                                setRecoverTarget({
                                  userId: r.userId!,
                                  userEmail: r.userEmail || r.userId!,
                                  originalInvoiceId: r.invoiceId,
                                });
                              }}
                              className="rounded-md bg-amber-100 hover:bg-amber-200 text-amber-800 px-2 py-1 text-xs font-semibold dark:bg-amber-950/50 dark:hover:bg-amber-900/60 dark:text-amber-200"
                            >
                              Recover
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </td>
          </tr>
        )}
      </Fragment>
    );
  })}
</tbody>
```

Add `Fragment` to the React import at the top of the file: `import { Fragment, useMemo, useState } from "react";`.

- [ ] **Step 9.5: Add a "showing X loaded" hint when paginated**

Above the closing `</div>` of the Manual Retries card body but below the `<tbody>`, conditionally render:

```tsx
{retriesQuery.hasMore && (
  <p className="px-4 pb-2 text-xs text-gray-500 dark:text-neutral-400">
    Per-user counts reflect loaded attempts only. Click "Load more" to widen the view.
  </p>
)}
```

- [ ] **Step 9.6: Type-check & lint**

Run: `npm run type-check && npm run lint`
Expected: PASS.

- [ ] **Step 9.7: Manual verification**

Run: `npm run dev` and navigate to `/admin` → past-due history.
Verify:
- The "Today" filter now shows today's bulk run.
- Manual Retries shows one row per user; clicking a row expands to per-attempt sub-rows.
- Searching by email triggers a network call after ~300ms; results filter server-side.
- Clicking the email opens the User Detail modal.
- Failed rows now display a specific decline code (after at least one new failed attempt is logged) instead of `card_declined`.
- Bulk recover still works with the new user-level checkbox + sub-row checkboxes.

Stop the dev server when done.

- [ ] **Step 9.8: Commit (if user approves)**

```bash
git add src/app/admin/component/PastDueChargeHistory.tsx
git commit -m "feat(admin): group manual past-due retries by user with search and clickable email"
```

---

## Task 10: Refactor drawer's Per-invoice attempts — group + search + clickable email + drop "When" + declineCode

**Files:**
- Modify: `src/app/admin/component/PastDueChargeHistoryDrawer.tsx`

- [ ] **Step 10.1: Add imports and state**

At the top:

```ts
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import ClickableUserDisplay from "@/components/admin/ClickableUserDisplay";
import {
  groupChargeAttemptsByUser,
  type UserAttemptGroup,
} from "@/utils/admin/groupChargeAttemptsByUser";
```

Inside the component (after the `detailQuery` line):

```ts
const [search, setSearch] = useState("");
const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

// The drawer's per-row DTO has no `adminName` (one admin per run). Augment with the run's
// admin so each row satisfies ChargeAttemptInput before grouping.
const groupedAttempts = useMemo(() => {
  const rows = detailQuery.data?.rows ?? [];
  const adminName = detailQuery.data?.run.adminName ?? "";
  const augmented = rows.map((r) => ({ ...r, adminName }));
  const q = search.trim().toLowerCase();
  const filtered = q
    ? augmented.filter((r) => (r.userEmail ?? "").toLowerCase().includes(q))
    : augmented;
  return groupChargeAttemptsByUser(filtered);
}, [detailQuery.data, search]);

const groupKey = (g: UserAttemptGroup): string => g.userId ?? `email:${g.userEmail}`;
const toggleGroup = (key: string) => {
  setExpandedKeys((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });
};
```

- [ ] **Step 10.2: Replace the Per-invoice attempts section**

Replace the existing `<section className="rounded-xl ..."> ... <h4>Per-invoice attempts</h4> ... </section>` with:

```tsx
<section className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900 overflow-hidden">
  <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-neutral-800">
    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
      Per-invoice attempts
    </h4>
    <div className="flex items-center gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-neutral-500" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email…"
          className="w-44 rounded-md border border-gray-300 bg-white py-1 pl-7 pr-2 text-xs text-gray-900 placeholder-gray-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:placeholder-neutral-500"
        />
      </div>
      <span className="text-xs text-gray-500 dark:text-neutral-400">
        {groupedAttempts.length} users
      </span>
    </div>
  </div>
  <div className="overflow-x-auto">
    <table className="w-full">
      <thead>
        <tr className="border-b border-gray-200 dark:border-neutral-700">
          <th className="bg-gray-50 px-3 py-3 dark:bg-neutral-800 w-8" />
          <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">User</th>
          <th className="bg-gray-50 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Attempts</th>
          <th className="bg-gray-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Latest</th>
          <th className="bg-gray-50 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:bg-neutral-800 dark:text-neutral-400">Total</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200 dark:divide-neutral-700">
        {groupedAttempts.map((g) => {
          const key = groupKey(g);
          const isExpanded = expandedKeys.has(key);
          return (
            <Fragment key={key}>
              <tr
                onClick={() => toggleGroup(key)}
                className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-neutral-800/70"
              >
                <td className="px-3 py-3">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-500" />
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-neutral-300">
                  <ClickableUserDisplay
                    displayText={g.userEmail || g.userId || "(unknown)"}
                    userId={g.userId ?? undefined}
                    className="text-sm"
                  />
                </td>
                <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-neutral-300">
                  {g.attempts.length}
                  <span className="ml-2 text-xs text-gray-500 dark:text-neutral-400">
                    {g.successCount > 0 && <span className="text-emerald-600">{g.successCount}✓ </span>}
                    {g.failedCount > 0 && <span className="text-red-600">{g.failedCount}✗ </span>}
                    {g.skippedCount > 0 && <span>{g.skippedCount}⏭</span>}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  <RetryStatusBadge status={g.latestStatus} />
                </td>
                <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-white">
                  {formatCents(g.totalAmount)}
                </td>
              </tr>
              {isExpanded && (
                <tr className="bg-gray-50/60 dark:bg-neutral-800/40">
                  <td colSpan={5} className="px-4 py-3">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="px-2 py-2 text-left text-[10px] uppercase text-gray-500">Invoice</th>
                          <th className="px-2 py-2 text-left text-[10px] uppercase text-gray-500">Status</th>
                          <th className="px-2 py-2 text-right text-[10px] uppercase text-gray-500">Amount</th>
                          <th className="px-2 py-2 text-left text-[10px] uppercase text-gray-500">Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.attempts.map((r) => (
                          <tr key={`${r.invoiceId}-${r.attemptedAt}`}>
                            <td className="px-2 py-2 font-mono text-xs text-gray-700 dark:text-neutral-300">
                              {r.invoiceId}
                            </td>
                            <td className="px-2 py-2 text-xs">
                              <RetryStatusBadge status={r.status} />
                            </td>
                            <td className="px-2 py-2 text-right text-xs font-semibold text-gray-900 dark:text-white">
                              {formatCents(r.amount)}
                            </td>
                            <td className="px-2 py-2 text-xs text-red-700 dark:text-red-400">
                              {r.declineCode ?? r.errorCode ?? r.errorMessage ?? ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  </div>
</section>
```

Note: the "When" column is gone in both the parent grouped row and the expanded sub-rows.

- [ ] **Step 10.3: Type-check & lint**

Run: `npm run type-check && npm run lint`
Expected: PASS.

- [ ] **Step 10.4: Manual verification**

In `npm run dev`, open a bulk run drawer.
Verify:
- Per-invoice attempts section shows one row per user.
- Click expands to per-invoice sub-rows; "When" column is no longer present.
- Search filters by email locally (no network call).
- Clicking the email opens the User Detail modal — but watch for z-index conflict with the drawer. If the modal renders behind the drawer, leave a comment in the code and surface to the user; do not silently fix by moving the modal — first check `src/constants/z-index.ts` for the canonical values.

- [ ] **Step 10.5: Commit (if user approves)**

```bash
git add src/app/admin/component/PastDueChargeHistoryDrawer.tsx
git commit -m "feat(admin): group per-invoice attempts by user in run drawer with search"
```

---

## Task 11: Update domain documentation

**Files:**
- Modify: `docs/admin/*` (whichever sub-files cover the past-due history surface)
- Modify: `docs/billing-stripe/models.md` (or equivalent)
- Modify: `docs/client-state/*` (hook signatures)

The doc-sync hook will block `Stop` if any touched source path lacks a matching doc update. Use the `/doc-domain admin`, `/doc-domain billing-stripe`, and `/doc-domain client-state` skills to do surgical refreshes — they re-read source and update docs in place.

- [ ] **Step 11.1: Refresh `docs/admin`**

Run: `/doc-domain admin`
Expected: the skill re-reads `src/app/admin/component/PastDueChargeHistory.tsx`, `PastDueChargeHistoryDrawer.tsx`, the route handlers, the service, and `chargePastDueShared.ts`, and updates relevant docs (e.g. `frontend.md`, `backend.md`, `gotchas.md`) with the AEST date filter behavior, decline-code save fields, and grouping/search UX.

- [ ] **Step 11.2: Refresh `docs/billing-stripe`**

Run: `/doc-domain billing-stripe`
Expected: `models.md` reflects `InvoiceChargeLog.declineCode`.

- [ ] **Step 11.3: Refresh `docs/client-state`**

Run: `/doc-domain client-state`
Expected: hook signatures for `useChargePastDueManualRetries` and `useChargePastDueRunDetail` reflect the new fields.

- [ ] **Step 11.4: Verify the doc-sync hook is happy**

Run a no-op stop (or any tool that triggers the Stop hook). Expected: no `BLOCKED: Stale docs` message.

If blocked, follow the hook's instructions to update the listed docs.

- [ ] **Step 11.5: Commit (if user approves)**

```bash
git add docs/
git commit -m "docs: refresh admin/billing-stripe/client-state for past-due history grouping + fixes"
```

---

## Task 12: Final verification

- [ ] **Step 12.1: Run all related tests**

```
npm run test:past-due-admin-charge
npm run test:charge-past-due-post-pay
npm run test:past-due-history
npm run test:group-charge-attempts
```

Expected: all PASS.

- [ ] **Step 12.2: Type-check, lint**

```
npm run type-check
npm run lint
```

Expected: PASS.

- [ ] **Step 12.3: Final manual smoke test in dev**

Start `npm run dev`. On `/admin/past-due-history`:
- Date filters: "Today", "Yesterday", "Current Draw", "Last Draw", "All Time", and a custom single day all return the expected runs/retries (today's run appears under "Today").
- Manual Retries: grouped, search filters server-side, clickable email opens modal, declineCode shows on new failures, bulk recover still works.
- Run drawer: grouped per-invoice attempts, "When" column gone, search filters client-side, declineCode shows on new failures.

- [ ] **Step 12.4: If user explicitly approves, no further commits needed**

(All Task-level commits already covered everything; this task is verification only.)

---

## Self-review (already performed by author)

- **Spec coverage:**
  - §1 timezone fix → Tasks 4, 5
  - §2 declineCode fidelity → Tasks 1, 2, 3, 6 (DTOs), 7 (hooks)
  - §3 group manual retries → Task 9 (uses helper from Task 8)
  - §4 group per-invoice attempts in drawer → Task 10
  - §5 drop "When" column → Task 10
  - §6 clickable emails → Tasks 9, 10
  - §7a server-side userSearch (Manual Retries) → Tasks 6, 7, 9
  - §7b client-side search (drawer) → Task 10
  - Cross-cutting docs → Task 11
- **Placeholder scan:** all code blocks contain literal code; no TBD/TODO/`fill in`.
- **Type consistency:** `groupChargeAttemptsByUser` shape matches what Tasks 9/10 consume; `declineCode?: string` is consistent on the row DTOs in service, hook, and UI; `parseAestDayStartUtc` / `parseAestDayEndExclusiveUtc` names match across Tasks 5/6.
