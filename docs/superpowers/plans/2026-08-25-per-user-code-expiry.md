# Per-Customer Bonus-Code Expiry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A bonus-entry code expires exactly N days after the moment *that customer* became eligible — and the date the customer is shown is the same stored value the server enforces.

**Architecture:** Reuse the shipped `MonthlyEntryCampaign` + `RedeemableIssuance` rail. One new campaign field (`validForDays`) switches a campaign from "fixed end date for everyone" to "personal window per customer". The issuance row — one per `{campaignId, userId}`, already unique-indexed — carries that customer's own `expiresAt`, stamped at eligibility. The mint returns the stamped row so the Klaviyo emit can carry the persisted instant rather than recomputing one. No new collection.

**Tech Stack:** Next.js 15 App Router, Mongoose 8, Zod, `date-fns-tz`, Klaviyo REST, TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-08-25-per-user-code-expiry-design.md` — read §0 (blockers), §1 (mechanism), §2 (expiry code), §3 (re-arm table) before starting. Phase letters below (A–J) map 1:1 to that spec's §4 change list.

## Global Constraints

- **NO COMMITS.** The user has not authorized commits this session (CLAUDE.md rule 1). Every task ends with a **verification** step, never `git commit`/`git add`/`git push`. Ask before committing.
- **Never target `main`.** Work stays on `feature/coupon-klaviyo` (rule 1b).
- **Doc-sync hook is a `Stop` blocker.** Editing `src/**` requires the matching `docs/<domain>/` update in the same task (rule 2). Domains touched: `rewards-redeemables`, `tracking`, `subscription`, `admin`, `internal-norm`, `config-and-data`.
- **BUSINESS.md + CUSTOMER.md are hook-enforced** (rules 5, 5b) — a perk's expiry semantics and what customer data reaches Klaviyo both change.
- **Cobber must not go stale** (rule 5c): "how long do I have to use my code?" becomes a live customer mechanic. FAQ corpus + `npm run build:chat-knowledge-pack` + `npm run test:chat-faqs`, and bump the count assertion deliberately.
- **Norm lockstep** (rule 10): `classification.ts` / `schemas/**` / `internal/norm/v1/**` changes require `docs/internal-norm/norm-context.md` in the same change, then `npm run build:norm-manifest` and `npm run norm:smoke`.
- **Rule 11 (LEGAL).** Every customer-facing string: entries are a **free inclusion** with the pack/membership, never sold. Banned: odds, chance(s) of winning, lottery, raffle, sweepstake, gamble, bet. Never price entries per unit.
- **Layering:** no business logic in `src/app/api/**` route handlers, no DB access from components, no `any`.
- **Logging:** production strips `console.log`/`info`/`debug`/`warn` (`next.config.ts` `compiler.removeConsole`). Use `console.error` for anything that must survive.
- **Tests are standalone `tsx` scripts** under `src/**/__tests__/*.test.ts`, each wired to its own `package.json` script. A test with no `test:*` entry is undiscoverable.
- **Coined name:** `validForDays` does not exist in the codebase. Nearest precedent is `PromoLink.eligibilityRules.cancelledWithinDays`. Use `validForDays` **verbatim** at every one of the 12+ declaration sites. Second coined name: `BonusCodeTrigger = "cancel-click" | "checkout-start" | "one-time-purchase"` — one exported type, reused verbatim.
- **Visibility rule (user requirement):** a coupon code is visible **only** to a customer who holds an issuance for it. No endpoint may return a campaign `code` to a user who has not qualified.

---

## File Structure

**Created**
| File | Responsibility |
|---|---|
| `src/utils/redeemables/rearm-policy.ts` | Pure `decideRearm()` — the §3 decision table, no DB, no clock |
| `src/services/redeemables/BonusCodeNotifier.ts` | The awaited Klaviyo emit + `notifiedAt`/`notifyError` persistence + env gate |
| `src/utils/common/__tests__/expiry-window.test.ts` | DST fixtures for the expiry helpers |
| `src/utils/redeemables/__tests__/rearm-policy.test.ts` | Decision-table coverage |
| `src/services/redeemables/__tests__/campaign-window.test.ts` | The four truncation predicates |

**Modified (primary)**
| File | Change |
|---|---|
| `src/models/MonthlyEntryCampaign.ts` | `validForDays` path + hot-reload probe + mutual-exclusion guard |
| `src/models/RedeemableIssuance.ts` | `redeemedEverAt`, `firstIssuedAt`, `notifiedAt`, `notifyError` + hot-reload block |
| `src/utils/common/timezone.ts` | `endOfDayAESTAfterDays`, `getAESTAbbreviation`, `formatExpiryLabelAEST` |
| `src/services/redeemables/CampaignService.ts` | Both stamp sites, atomic mint, `ensureCampaignIssuanceForUser`, leak defence |
| `src/services/redeemables/RedemptionService.ts` | `$min: redeemedEverAt`, personal-window truncation fixes |
| `src/services/redeemables/RedeemablesWalletService.ts` | `expiresAtLabel`, campaign-active guard |
| `src/app/api/redeemables/status/route.ts` | **Visibility gate** — no code without an issuance |
| `src/utils/integrations/klaviyo/klaviyo-events.ts` | `createBonusCodeIssuedEvent` |
| `src/services/subscription/CancelSubscriptionService.ts` | cancel-click trigger + `mintBonusCode` option |
| `src/utils/payment/payment-processing.ts` | one-time-purchase trigger |
| `src/app/api/auth/register/route.ts` | guest checkout-start trigger |

Full per-line list: spec §4 phases A–J.

---

## Task 1: DST-safe expiry helpers

Pure functions, no DB, no app state — TDD applies cleanly. Everything downstream depends on these, so they go first.

**Files:**
- Modify: `src/utils/common/timezone.ts` (append after `createAESTDateAsUTC`, ends `:286`)
- Create: `src/utils/common/__tests__/expiry-window.test.ts`
- Modify: `package.json` (add `test:bonus-code-expiry`)
- Modify: `docs/config-and-data/` — no; timezone.ts is unmapped. **Add `src/utils/common/**` to the `shared-ui` domain paths in CLAUDE.md's Domain Manifest** (it already lists `src/utils/common/**`) → docs domain is `shared-ui`.

**Interfaces — Produces:**
```ts
export function endOfDayAESTAfterDays(from: Date, days: number): Date
export function getAESTAbbreviation(utcDate: Date): string
export function formatExpiryLabelAEST(utcDate: Date): string
```

- [ ] **Step 1: Write the failing test**

Create `src/utils/common/__tests__/expiry-window.test.ts`:

```ts
import { endOfDayAESTAfterDays, formatExpiryLabelAEST } from "@/utils/common/timezone";
import { formatInTimeZone } from "date-fns-tz";

const TZ = "Australia/Sydney";
let failures = 0;

function check(name: string, actual: string, expected: string) {
  if (actual === expected) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}\n        expected: ${expected}\n        actual:   ${actual}`);
  }
}

/** Whole Sydney calendar days between the Sydney date of `from` and of `to`. */
function sydneySpanDays(from: Date, to: Date): number {
  const d = (x: Date) => formatInTimeZone(x, TZ, "yyyy-MM-dd");
  const a = new Date(`${d(from)}T00:00:00Z`).getTime();
  const b = new Date(`${d(to)}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

const CASES: Array<{ name: string; from: string; expectLabel: string; expectIso: string }> = [
  {
    name: "spring-forward eve (naive addDays gives 15)",
    from: "2026-09-20T13:30:00.000Z", // Sun 20 Sep 2026 23:30 AEST
    expectIso: "2026-10-04T12:59:59.999Z",
    expectLabel: "Sunday 4 October 2026, 11:59PM AEDT",
  },
  {
    name: "fall-back run (naive addDays gives 13)",
    from: "2026-03-24T13:30:00.000Z", // Wed 25 Mar 2026 00:30 AEDT
    expectIso: "2026-04-08T13:59:59.999Z",
    expectLabel: "Wednesday 8 April 2026, 11:59PM AEST",
  },
  {
    name: "year rollover",
    from: "2026-12-31T12:30:00.000Z", // Thu 31 Dec 2026 23:30 AEDT
    expectIso: "2027-01-14T12:59:59.999Z",
    expectLabel: "Thursday 14 January 2027, 11:59PM AEDT",
  },
  {
    name: "leap day",
    from: "2028-02-15T05:00:00.000Z", // Tue 15 Feb 2028 16:00 AEDT
    expectIso: "2028-02-29T12:59:59.999Z",
    expectLabel: "Tuesday 29 February 2028, 11:59PM AEDT",
  },
  {
    name: "plain winter",
    from: "2026-06-10T13:59:00.000Z", // Wed 10 Jun 2026 23:59 AEST
    expectIso: "2026-06-24T13:59:59.999Z",
    expectLabel: "Wednesday 24 June 2026, 11:59PM AEST",
  },
];

console.log("endOfDayAESTAfterDays / formatExpiryLabelAEST");
for (const c of CASES) {
  const from = new Date(c.from);
  const got = endOfDayAESTAfterDays(from, 14);
  check(`${c.name} — instant`, got.toISOString(), c.expectIso);
  check(`${c.name} — label`, formatExpiryLabelAEST(got), c.expectLabel);
  check(`${c.name} — span`, String(sydneySpanDays(from, got)), "14");
}

// The redemption gate is strictly exclusive (expiresAt: { $gt: now }); a
// :00.000 bound would kill the coupon 60s before the emailed "11:59pm".
check(
  "ends at :59.999",
  formatInTimeZone(endOfDayAESTAfterDays(new Date("2026-06-10T13:59:00.000Z"), 1), TZ, "HH:mm:ss.SSS"),
  "23:59:59.999"
);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll assertions passed");
```

- [ ] **Step 2: Add the npm script**

In `package.json` scripts, beside the other `test:*` entries:

```json
"test:bonus-code-expiry": "tsx src/utils/common/__tests__/expiry-window.test.ts",
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:bonus-code-expiry`
Expected: FAIL — `endOfDayAESTAfterDays is not a function` / module has no such export.

- [ ] **Step 4: Implement the helpers**

Append to `src/utils/common/timezone.ts` after `createAESTDateAsUTC` (ends `:286`). Use the exact implementation in spec §2 — reproduced here so this task is self-contained:

```ts
/**
 * End of day (23:59:59.999) in Australia/Sydney, `days` calendar days after the
 * Sydney date of `from`. Returns the UTC instant to store.
 *
 * Days are added to the Sydney CALENDAR TRIPLE in UTC (where no DST exists),
 * never to the instant. Adding to the instant — the date-fns `addDays` pattern
 * used at :247, :329, :364 and :380 of this file — yields a 15-day window for
 * an eligibility of Sun 20 Sep 2026 23:30 AEST and 13 days for Wed 25 Mar 2026
 * 00:30 AEDT. Verified by src/utils/common/__tests__/expiry-window.test.ts.
 *
 * The `.setUTCSeconds(59, 999)` is required: createAESTDateAsUTC hardcodes
 * seconds to ":00" (:283) and the redemption gate is strictly exclusive
 * (`expiresAt: { $gt: now }`, RedemptionService.ts:204), so a 23:59:00.000
 * bound kills the coupon 60 seconds before the emailed "11:59pm". Sydney
 * offsets are whole hours, so UTC seconds == Sydney seconds.
 */
export function endOfDayAESTAfterDays(from: Date, days: number): Date {
  const year = parseInt(formatInTimeZone(from, AEST_TIMEZONE, "yyyy"), 10);
  const month = parseInt(formatInTimeZone(from, AEST_TIMEZONE, "M"), 10);
  const day = parseInt(formatInTimeZone(from, AEST_TIMEZONE, "d"), 10);

  // Calendar arithmetic in UTC: no DST, no host-timezone dependency.
  const calendar = new Date(Date.UTC(year, month - 1, day));
  calendar.setUTCDate(calendar.getUTCDate() + days);

  const endOfDay = createAESTDateAsUTC(
    calendar.getUTCFullYear(),
    calendar.getUTCMonth() + 1, // createAESTDateAsUTC takes 1-indexed months
    calendar.getUTCDate(),
    23,
    59
  );
  endOfDay.setUTCSeconds(59, 999);
  return endOfDay;
}

/** AEST vs AEDT abbreviation for an instant. Same Intl technique as :85-88. */
export function getAESTAbbreviation(utcDate: Date): string {
  return (
    new Intl.DateTimeFormat("en-AU", { timeZone: AEST_TIMEZONE, timeZoneName: "short" })
      .formatToParts(utcDate)
      .find((p) => p.type === "timeZoneName")?.value ?? "AEST"
  );
}

/**
 * The ONE customer-facing expiry string. The Klaviyo email, the rewards wallet
 * and the rewards widget all render this exact value.
 *
 * Never hardcode " AEST": a 14-day window from 20 Sep 2026 ends in AEDT.
 * Never use formatDateForKlaviyo (klaviyo-helpers.ts:759) — it is
 * toLocaleDateString("en-US") with no timeZone option.
 *
 * Example: "Sunday 4 October 2026, 11:59PM AEDT"
 */
export function formatExpiryLabelAEST(utcDate: Date): string {
  return `${formatInTimeZone(utcDate, AEST_TIMEZONE, "EEEE d MMMM yyyy, h:mma")} ${getAESTAbbreviation(utcDate)}`;
}
```

Verify `formatInTimeZone` and `AEST_TIMEZONE` are already imported/defined at the top of the file; add the import if not.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:bonus-code-expiry`
Expected: PASS — all assertions, including span 14 across both DST transitions.

- [ ] **Step 6: Type-check**

Run: `npm run type-check`
Expected: no new errors.

---

## Task 2: The re-arm decision policy (pure)

Extracting the decision table as a pure function is what makes it testable without a database, and keeps `createIssuanceForUser` readable.

**Files:**
- Create: `src/utils/redeemables/rearm-policy.ts`
- Create: `src/utils/redeemables/__tests__/rearm-policy.test.ts`
- Modify: `package.json` (add `test:bonus-code-rearm`)
- Docs domain: `rewards-redeemables`

**Interfaces — Produces:**
```ts
export type BonusCodeTrigger = "cancel-click" | "checkout-start" | "one-time-purchase";
export type RearmOutcome = "minted" | "rearmed" | "already_active" | "spent" | "expired_no_rearm";
export interface RearmInput {
  status: "active" | "redeemed" | "expired" | "cancelled";
  expiresAt: Date;
  redeemedEverAt?: Date | null;
}
export function decideRearm(row: RearmInput | null, now: Date, hasTrigger: boolean): RearmOutcome;
```

- [ ] **Step 1: Write the failing test**

Create `src/utils/redeemables/__tests__/rearm-policy.test.ts`:

```ts
import { decideRearm, type RearmInput } from "@/utils/redeemables/rearm-policy";

const NOW = new Date("2026-06-10T00:00:00.000Z");
const FUTURE = new Date("2026-06-24T13:59:59.999Z");
const PAST = new Date("2026-05-24T13:59:59.999Z");

let failures = 0;
function check(name: string, actual: string, expected: string) {
  if (actual === expected) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.error(`  FAIL  ${name}\n        expected: ${expected}\n        actual:   ${actual}`);
  }
}

const row = (over: Partial<RearmInput>): RearmInput => ({
  status: "active",
  expiresAt: FUTURE,
  redeemedEverAt: null,
  ...over,
});

console.log("decideRearm — the §3 decision table");

check("no row, with trigger", decideRearm(null, NOW, true), "minted");
check("no row, no trigger", decideRearm(null, NOW, false), "minted");

check("redeemed now", decideRearm(row({ status: "redeemed", redeemedEverAt: PAST }), NOW, true), "spent");
// The refunded case: status is restored to "active" and redeemedAt is $unset,
// so redeemedEverAt is the ONLY thing separating it from a fresh row.
check(
  "refunded (active again, but redeemedEverAt survives)",
  decideRearm(row({ status: "active", expiresAt: PAST, redeemedEverAt: PAST }), NOW, true),
  "spent"
);

check("active + unexpired, with trigger", decideRearm(row({}), NOW, true), "already_active");
check("active + unexpired, no trigger", decideRearm(row({}), NOW, false), "already_active");

check("expired + trigger", decideRearm(row({ expiresAt: PAST }), NOW, true), "rearmed");
check("expired, no trigger (wallet/cron)", decideRearm(row({ expiresAt: PAST }), NOW, false), "expired_no_rearm");

check("cancelled is terminal", decideRearm(row({ status: "cancelled" }), NOW, true), "spent");

// Boundary: the gate is strictly exclusive, so expiresAt === now is EXPIRED.
check("expiresAt exactly now", decideRearm(row({ expiresAt: NOW }), NOW, true), "rearmed");

// status:"expired" is never written by any code path — if one ever appears,
// it must still be handled by the expiresAt predicate, not by the status.
check(
  "legacy status:expired but future date",
  decideRearm(row({ status: "expired", expiresAt: FUTURE }), NOW, true),
  "already_active"
);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll assertions passed");
```

- [ ] **Step 2: Add the npm script**

```json
"test:bonus-code-rearm": "tsx src/utils/redeemables/__tests__/rearm-policy.test.ts",
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm run test:bonus-code-rearm`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Create `src/utils/redeemables/rearm-policy.ts`:

```ts
/**
 * Re-arm policy for per-customer bonus-code issuances.
 *
 * Pure: no DB, no ambient clock. `now` is always injected so the DST and
 * boundary cases stay testable.
 *
 * Three rules are load-bearing:
 *  1. `redeemedEverAt` is the permanent "this grant is spent" marker. A refund
 *     restores status to "active" and $unsets redeemedAt, so WITHOUT this a
 *     refunded row is byte-identical to a never-redeemed one and "one grant per
 *     person, ever" silently becomes "one grant per refund cycle".
 *  2. The live-window test keys off `expiresAt`, NEVER off status "expired" —
 *     no code path in this repo writes that status, so a predicate matching it
 *     would match zero documents forever, silently.
 *  3. Re-arming requires an explicit trigger. The wallet read path calls the
 *     enrolment sweep on every load; without this gate, opening /my-account
 *     would re-arm (and eventually burn) a lifetime grant.
 */

/** The three moments that mint a per-customer bonus code. */
export type BonusCodeTrigger = "cancel-click" | "checkout-start" | "one-time-purchase";

export type RearmOutcome =
  | "minted"
  | "rearmed"
  | "already_active"
  | "spent"
  | "expired_no_rearm";

export interface RearmInput {
  status: "active" | "redeemed" | "expired" | "cancelled";
  expiresAt: Date;
  redeemedEverAt?: Date | null;
}

export function decideRearm(row: RearmInput | null, now: Date, hasTrigger: boolean): RearmOutcome {
  if (!row) return "minted";

  // Rule 1 — spent for life, regardless of the refund restoring status.
  if (row.redeemedEverAt) return "spent";
  if (row.status === "redeemed") return "spent";
  if (row.status === "cancelled") return "spent";

  // Rule 2 — the window is decided by the date, never by the status string.
  const live = row.expiresAt.getTime() > now.getTime();
  if (live) return "already_active";

  // Rule 3 — only an explicit trigger may restart a lapsed window.
  return hasTrigger ? "rearmed" : "expired_no_rearm";
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm run test:bonus-code-rearm`
Expected: PASS, all 11 assertions.

- [ ] **Step 6: Type-check**

Run: `npm run type-check`

---

## Task 3: Model schema changes

Schema first, because every later task writes fields that mongoose `strict` mode would otherwise drop **silently**.

**Files:**
- Modify: `src/models/MonthlyEntryCampaign.ts` (`:16`, `:86-89`, `:139-157`, `:163-177`)
- Modify: `src/models/RedeemableIssuance.ts` (`:20`, `:85`, `:97`)
- Docs: `docs/rewards-redeemables/models.md`

**Interfaces — Produces:**
- `IMonthlyEntryCampaign.validForDays?: number`
- `IRedeemableIssuance.redeemedEverAt?: Date`, `.firstIssuedAt?: Date`, `.notifiedAt?: Date | null`, `.notifyError?: string | null`

- [ ] **Step 1: Add `validForDays` to the campaign interface and schema**

`src/models/MonthlyEntryCampaign.ts` — interface, immediately after `neverExpires: boolean;` (`:16`):

```ts
  /**
   * Per-customer window in days. When set, each issuance expires this many days
   * after THAT customer's eligibility moment, not at the campaign's endsAt.
   * Mutually exclusive with neverExpires. Unset => legacy behaviour (copy endsAt).
   */
  validForDays?: number;
```

Schema, after the `neverExpires` path block (`:86-89`):

```ts
    validForDays: {
      type: Number,
      min: [1, "validForDays must be at least 1"],
    },
```

- [ ] **Step 2: Add the mutual-exclusion guard to `pre("save")`**

After the `code` check inside the existing `pre("save")` hook (`:152-154`):

```ts
  if (this.neverExpires && typeof this.validForDays === "number") {
    return next(new Error("neverExpires and validForDays are mutually exclusive"));
  }
```

Note in a comment that this is the create path only — `updateCampaign` uses `findByIdAndUpdate(..., { runValidators: true })`, which does **not** run `pre("save")`. Zod (Task 5) is the real gate.

- [ ] **Step 3: Extend the hot-reload staleness probe**

`src/models/MonthlyEntryCampaign.ts:163-177`. Add the probe **and** the disjunct — the probe alone does nothing:

```ts
  const validForDaysPathExists = Boolean(existingMonthlyEntryCampaignModel.schema.path("validForDays"));
```

and extend the condition:

```ts
  if (
    !codePathExists ||
    !neverExpiresPathExists ||
    !purchaseRequirementPathExists ||
    !validForDaysPathExists ||
    endsAtIsStaticallyRequired
  ) {
    delete mongoose.models.MonthlyEntryCampaign;
  }
```

- [ ] **Step 4: Add the four issuance fields**

`src/models/RedeemableIssuance.ts` — interface, after `expiresAt: Date;` (`:20`):

```ts
  /**
   * Permanent "this grant is spent" marker. Set on first redemption via $min and
   * NEVER unset — the refund path restores status to "active" and $unsets
   * redeemedAt, so this is the only thing preventing a
   * buy -> redeem -> refund -> re-trigger loop from re-granting a one-per-lifetime code.
   */
  redeemedEverAt?: Date;
  /** The customer's FIRST qualification. Preserved across re-arms for audit. */
  firstIssuedAt?: Date;
  /** When the "Bonus Code Issued" Klaviyo event was accepted. null = not yet / failed. */
  notifiedAt?: Date | null;
  /** Last emit failure reason, for support. null when the last emit succeeded. */
  notifyError?: string | null;
```

Schema, after the `expiresAt` path (`:85`):

```ts
    redeemedEverAt: { type: Date },
    firstIssuedAt: { type: Date },
    notifiedAt: { type: Date, default: null },
    notifyError: { type: String, default: null },
```

- [ ] **Step 5: Add a hot-reload staleness block to `RedeemableIssuance`**

This model has none today. Before the final `const RedeemableIssuance = ...` (`:97`), mirroring `MonthlyEntryCampaign.ts:159-177`:

```ts
const existingRedeemableIssuanceModel = mongoose.models.RedeemableIssuance as
  | mongoose.Model<IRedeemableIssuance>
  | undefined;

if (existingRedeemableIssuanceModel) {
  // In dev/hot-reload, clear the cached model when the schema shape is stale.
  // Mongoose strict mode drops undeclared paths SILENTLY, so a stale cached
  // model makes these fields look like they simply refuse to persist.
  const redeemedEverAtPathExists = Boolean(existingRedeemableIssuanceModel.schema.path("redeemedEverAt"));
  if (!redeemedEverAtPathExists) {
    delete mongoose.models.RedeemableIssuance;
  }
}
```

- [ ] **Step 6: Update the models doc**

`docs/rewards-redeemables/models.md` — correct the existing `expiresAt?` entry to **required** (the schema says `required: [true, …]`), and document `validForDays`, `redeemedEverAt`, `firstIssuedAt`, `notifiedAt`, `notifyError`.

- [ ] **Step 7: Verify**

Run: `npm run type-check`
Expected: no new errors. (Field additions are additive; nothing should break.)

---

## Task 4: Stamp sites, atomic mint, and the trigger-gated leak defence

The core. Rewrites `createIssuanceForUser` so it (a) stamps the anchored expiry, (b) is atomic, (c) returns the stamped row, and (d) refuses to self-enrol from the wallet sweep.

**Files:**
- Modify: `src/services/redeemables/CampaignService.ts` (`:250-266`, `:307-386`, `:388-439`, `:442-470`, new export after `:470`)
- Modify: `src/services/redeemables/RedemptionService.ts` (`:206-211`, comment at `:278`)
- Docs: `docs/rewards-redeemables/{architecture,backend,gotchas}.md`

**Interfaces — Consumes:** `endOfDayAESTAfterDays` (Task 1), `decideRearm` / `BonusCodeTrigger` (Task 2), `validForDays` + the four issuance fields (Task 3).

**Interfaces — Produces:**
```ts
export interface StampedIssuance {
  id: string;
  campaignId: string;
  campaignCode: string;
  code?: string;
  entriesAmount: number;
  issuedAt: Date;
  expiresAt: Date;
}
export interface StampedIssuanceResult {
  outcome: RearmOutcome | "not_applicable";
  issuance?: StampedIssuance;
}
// CampaignService
static async ensureCampaignIssuanceForUser(params: {
  userId: string;
  campaignCode: string;
  trigger: BonusCodeTrigger;
}): Promise<StampedIssuanceResult>
```

- [ ] **Step 1: Add the shared expiry resolver**

Near the top of `CampaignService.ts`, beside `NEVER_EXPIRES_ISSUANCE_DATE` (`:8`):

```ts
/**
 * Precedence: validForDays > neverExpires > campaign.endsAt.
 * validForDays wins because a personal window is the whole point of a
 * trigger campaign; the pair is rejected at the zod boundary and in pre("save").
 * Returns null when the campaign has no usable expiry (legacy endsAt-less row).
 */
function resolveIssuanceExpiry(
  campaign: Pick<IMonthlyEntryCampaign, "validForDays" | "neverExpires" | "endsAt">,
  issuedAt: Date
): Date | null {
  if (typeof campaign.validForDays === "number" && campaign.validForDays >= 1) {
    return endOfDayAESTAfterDays(issuedAt, campaign.validForDays);
  }
  if (campaign.neverExpires) return NEVER_EXPIRES_ISSUANCE_DATE;
  return campaign.endsAt ?? null;
}
```

- [ ] **Step 2: Fix the bulk stamp site**

`issueCampaignToUsers` — hoist the instant **above** the `for` loop at `:233` so one admin click cannot hand two users different expiry days across Sydney midnight:

```ts
    const issuedAt = new Date();
```

Then inside the loop replace `issuedAt: new Date()` (`:259`) with `issuedAt`, and replace `:260` with:

```ts
              expiresAt: resolveIssuanceExpiry(params.campaign, issuedAt),
```

Add `firstIssuedAt: issuedAt` to the same `$setOnInsert` block.

- [ ] **Step 3: Add the leak defence to `isUserEligibleForCampaign`**

`:307-386`. Thread an `options` parameter through and make it the first statement of the body:

```ts
  // LEAK DEFENCE. A trigger campaign is minted ONLY at an explicit eligibility
  // moment. Without this, the "all-active-subscribers" branch below returns a
  // bare hasActiveSubscription, so every active member who opens their rewards
  // wallet would self-enrol into the trigger campaign and burn their
  // one-per-lifetime grant without ever seeing an email.
  if (typeof campaign.validForDays === "number" && !options?.trigger) return false;
```

Update the call at `:462` to pass `options` through.

- [ ] **Step 4: Rewrite `createIssuanceForUser`**

Replace `:388-439` entirely. Key changes: anchored expiry, atomic upsert instead of `findOne`+`create`, the decision table, and a returned stamped row.

```ts
  private static async createIssuanceForUser(
    userId: mongoose.Types.ObjectId,
    campaign: IMonthlyEntryCampaign,
    now: Date,
    options?: { trigger?: BonusCodeTrigger }
  ): Promise<StampedIssuanceResult> {
    const issuedAt = now;
    const expiresAt = resolveIssuanceExpiry(campaign, issuedAt);
    if (!expiresAt) return { outcome: "not_applicable" };

    const campaignId = campaign._id as mongoose.Types.ObjectId;
    const hasTrigger = Boolean(options?.trigger);

    const existing = await RedeemableIssuance.findOne({ campaignId, userId })
      .select("_id status expiresAt redeemedEverAt code entriesAmount issuedAt")
      .lean();

    const outcome = decideRearm(
      existing ? { status: existing.status, expiresAt: existing.expiresAt, redeemedEverAt: existing.redeemedEverAt } : null,
      now,
      hasTrigger
    );

    const stamp = (doc: { _id: mongoose.Types.ObjectId; code?: string; entriesAmount: number; issuedAt: Date; expiresAt: Date }): StampedIssuance => ({
      id: String(doc._id),
      campaignId: String(campaignId),
      campaignCode: campaign.code,
      code: doc.code,
      entriesAmount: doc.entriesAmount,
      issuedAt: doc.issuedAt,
      expiresAt: doc.expiresAt,
    });

    if (outcome === "spent" || outcome === "expired_no_rearm" || outcome === "already_active") {
      // Hand back the STORED values — a re-send must carry the original date,
      // never a freshly computed one.
      return existing ? { outcome, issuance: stamp(existing) } : { outcome };
    }

    if (outcome === "rearmed") {
      const rearmed = await RedeemableIssuance.findOneAndUpdate(
        { campaignId, userId, status: "active", expiresAt: { $lte: now }, redeemedEverAt: { $exists: false } },
        { $set: { issuedAt, expiresAt, notifiedAt: null, notifyError: null } },
        { new: true }
      ).lean();
      // A racing redemption can flip the row under us; that is not an error.
      if (!rearmed) return { outcome: "already_active" };
      return { outcome: "rearmed", issuance: stamp(rearmed) };
    }

    // outcome === "minted" — atomic upsert. A concurrent trigger loses the race
    // cleanly rather than throwing E11000 out of the caller's request.
    const uniqueCode = campaign.campaignMode === "global" ? undefined : await this.generateUniqueCode(campaign);
    try {
      const res = await RedeemableIssuance.findOneAndUpdate(
        { campaignId, userId },
        {
          $setOnInsert: {
            campaignId,
            userId,
            monthKey: campaign.monthKey,
            ...(uniqueCode ? { code: uniqueCode } : {}),
            status: "active",
            source: "monthly-coupon",
            entriesAmount: campaign.entriesAmount,
            issuedAt,
            firstIssuedAt: issuedAt,
            expiresAt,
            metadata: { targetingMode: campaign.targetingMode, issuedBy: options?.trigger ?? "system" },
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true, includeResultMetadata: true }
      );
      const doc = res.value;
      if (!doc) return { outcome: "not_applicable" };
      // updatedExisting === true means someone else inserted first.
      if (res.lastErrorObject?.updatedExisting) {
        return { outcome: "already_active", issuance: stamp(doc) };
      }
      return { outcome: "minted", issuance: stamp(doc) };
    } catch (error) {
      const keyPattern = (error as { keyPattern?: Record<string, number> })?.keyPattern;
      const isDuplicate = (error as { code?: number })?.code === 11000;
      // {campaignId,userId} duplicate = a concurrent trigger won. Not an error.
      if (isDuplicate && keyPattern && "userId" in keyPattern) {
        return { outcome: "already_active" };
      }
      // {campaignId,code} duplicate = regenerate the per-user code and retry once.
      throw error;
    }
  }
```

Keep the existing code-regeneration retry loop **only** for a `{campaignId, code}` collision — reuse it around the upsert rather than deleting it.

- [ ] **Step 5: Widen `ensureActiveCampaignIssuancesForUser`**

`:442-470`. Keep its external behaviour (sweeps all live campaigns, **never** passes `trigger`) but count `outcome === "minted"` and return the stamped rows additively so existing callers are unaffected:

```ts
    return { issuedCount, issued };
```

- [ ] **Step 6: Add the single-campaign trigger entry point**

New static after `:470`:

```ts
  /**
   * The ONE entry point for the three eligibility triggers. Resolves a single
   * campaign by code, checks eligibility, and mints/re-arms the caller's row.
   *
   * Never throws — a failure here must not take down a cancellation or a
   * payment webhook. Callers check `outcome`.
   */
  static async ensureCampaignIssuanceForUser(params: {
    userId: string;
    campaignCode: string;
    trigger: BonusCodeTrigger;
  }): Promise<StampedIssuanceResult> {
    try {
      const now = new Date();
      const user = await User.findById(params.userId)
        .select("_id isActive isEmailVerified lastLogin state subscription.isActive subscription.packageId")
        .lean();
      if (!user || !user.isActive) return { outcome: "not_applicable" };

      const campaign = await MonthlyEntryCampaign.findOne({
        code: params.campaignCode.trim().toUpperCase(),
        isActive: true,
        startsAt: { $lte: now },
        // endsAt still gates MINTING — no new customer qualifies after the
        // campaign closes. It must NOT gate redemption of an already-minted
        // personal window; see RedemptionService.
        $or: [{ neverExpires: true }, { endsAt: { $gte: now } }, { validForDays: { $gte: 1 } }],
      });
      if (!campaign) return { outcome: "not_applicable" };

      const eligible = await this.isUserEligibleForCampaign(user, campaign, now, { trigger: params.trigger });
      if (!eligible) return { outcome: "not_applicable" };

      return await this.createIssuanceForUser(user._id, campaign, now, { trigger: params.trigger });
    } catch (error) {
      console.error("ensureCampaignIssuanceForUser failed", {
        userId: params.userId,
        campaignCode: params.campaignCode,
        trigger: params.trigger,
        error: error instanceof Error ? error.message : String(error),
      });
      return { outcome: "not_applicable" };
    }
  }
```

- [ ] **Step 7: Persist the permanent spent marker**

`RedemptionService.ts:206-211` — add `$min` alongside the existing `$set` in the atomic claim. **Do not widen the filter.**

```ts
      {
        $set: { status: "redeemed", redeemedAt: now },
        // $min writes the field when absent and preserves the FIRST value when
        // present — exactly the audit semantics wanted.
        $min: { redeemedEverAt: now },
      },
```

And add the guard comment at the `$unset: { redeemedAt: 1 }` line (`:278`):

```ts
          // NEVER add redeemedEverAt here — it is the permanent "this grant is
          // spent" marker that stops a refund resetting a one-per-lifetime code.
```

- [ ] **Step 8: Update the domain docs**

`docs/rewards-redeemables/architecture.md`, `backend.md`, `gotchas.md`: the anchored expiry, the re-arm table, the trigger gate, and the `status: "expired"` dead-enum trap.

- [ ] **Step 9: Verify**

Run: `npm run type-check && npm run lint && npm run test:bonus-code-rearm && npm run test:redeemables`

---

## Task 5: Stop the campaign window truncating personal windows

Four independent sites re-check the campaign window. Miss any one and a customer holding a valid personal coupon is refused — three of them with the wrong message.

**Files:**
- Modify: `src/services/redeemables/RedemptionService.ts` (`:71-76`, `:174-177`, `:187`)
- Modify: `src/services/redeemables/RedeemablesWalletService.ts` (`:84`)
- Modify: `src/app/api/codes/validate/route.ts` (`:103-110`)
- Create: `src/services/redeemables/__tests__/campaign-window.test.ts`
- Modify: `package.json` (`test:bonus-code-window`)
- Docs: `docs/rewards-redeemables/rules.md`, `docs/promo/api.md`

**Interfaces — Produces:**
```ts
// exported from src/utils/redeemables/rearm-policy.ts
export function personalWindowGoverns(campaign: { validForDays?: number | null }): boolean;
```

- [ ] **Step 1: Add the shared predicate**

Append to `src/utils/redeemables/rearm-policy.ts`:

```ts
/**
 * True when the campaign hands each customer their own window, so the campaign's
 * own endsAt is a MINTING backstop rather than a redemption deadline.
 * Defined once and used at all four truncation sites so they cannot drift.
 */
export function personalWindowGoverns(campaign: { validForDays?: number | null }): boolean {
  return typeof campaign.validForDays === "number" && campaign.validForDays >= 1;
}
```

- [ ] **Step 2: Write the failing test**

Create `src/services/redeemables/__tests__/campaign-window.test.ts` asserting: with `validForDays` unset the verdict at each site is byte-identical to today's; with it set, a past `endsAt` no longer vetoes, while `isActive: false` and `startsAt > now` still do.

```ts
import { personalWindowGoverns } from "@/utils/redeemables/rearm-policy";

const NOW = new Date("2026-06-10T00:00:00.000Z");
const PAST = new Date("2026-05-01T00:00:00.000Z");
const FUTURE = new Date("2026-07-01T00:00:00.000Z");

let failures = 0;
function check(name: string, actual: boolean, expected: boolean) {
  if (actual === expected) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.error(`  FAIL  ${name}  expected ${expected}, got ${actual}`);
  }
}

/** Mirror of the RedemptionService.ts:174-177 predicate, post-change. */
function isCampaignInWindow(c: {
  isActive: boolean;
  startsAt: Date;
  endsAt?: Date | null;
  neverExpires: boolean;
  validForDays?: number | null;
}, now: Date): boolean {
  return (
    c.isActive &&
    c.startsAt <= now &&
    (c.neverExpires || personalWindowGoverns(c) || (c.endsAt ? c.endsAt >= now : false))
  );
}

const base = { isActive: true, startsAt: PAST, endsAt: FUTURE, neverExpires: false };

console.log("campaign window vs personal window");

// Legacy campaigns: unchanged in every direction.
check("legacy, open", isCampaignInWindow({ ...base }, NOW), true);
check("legacy, ended", isCampaignInWindow({ ...base, endsAt: PAST }, NOW), false);
check("legacy, neverExpires", isCampaignInWindow({ ...base, endsAt: null, neverExpires: true }, NOW), true);
check("legacy, inactive", isCampaignInWindow({ ...base, isActive: false }, NOW), false);
check("legacy, not started", isCampaignInWindow({ ...base, startsAt: FUTURE }, NOW), false);

// Personal-window campaigns: endsAt stops vetoing, everything else still does.
check("personal, ended backstop still redeemable", isCampaignInWindow({ ...base, endsAt: PAST, validForDays: 14 }, NOW), true);
check("personal, inactive still refused", isCampaignInWindow({ ...base, isActive: false, validForDays: 14 }, NOW), false);
check("personal, not started still refused", isCampaignInWindow({ ...base, startsAt: FUTURE, validForDays: 14 }, NOW), false);

check("predicate off for 0", personalWindowGoverns({ validForDays: 0 }), false);
check("predicate off for null", personalWindowGoverns({ validForDays: null }), false);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll assertions passed");
```

Add to `package.json`:

```json
"test:bonus-code-window": "tsx src/services/redeemables/__tests__/campaign-window.test.ts",
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm run test:bonus-code-window` — FAIL, `personalWindowGoverns` not exported yet if Step 1 was skipped; otherwise the mirrored predicate passes and this step just proves the fixtures.

- [ ] **Step 4: Site 1 — the redemption window check**

`RedemptionService.ts:174-177`:

```ts
    const isCampaignInWindow =
      campaign.isActive &&
      campaign.startsAt <= now &&
      (campaign.neverExpires ||
        personalWindowGoverns(campaign) ||
        (campaign.endsAt ? campaign.endsAt >= now : false));
```

`isActive` and `startsAt` stay unconditional.

- [ ] **Step 5: Site 2 — the by-code campaign resolve**

`RedemptionService.ts:71-76`. This is a **Mongo query**, so the leg goes in the `$or`. Without it a global-mode issuance (no `code` on the row) is unreachable once `endsAt` passes and the customer is told `invalid_code` — "we never gave you this" — rather than "you missed the window":

```ts
          $or: [{ neverExpires: true }, { endsAt: { $gte: now } }, { validForDays: { $gte: 1 } }],
```

- [ ] **Step 6: Site 3 — the purchase-requirement ceiling**

`RedemptionService.ts:187`. For a personal-window campaign the qualifying purchase must be allowed to happen after `endsAt`; `endsAt: null` makes the util's ceiling `now`. **Do not widen it for legacy campaigns** — that leg was hardened deliberately:

```ts
    if (
      !hasQualifyingPurchase(
        user,
        personalWindowGoverns(campaign) ? { startsAt: campaign.startsAt, endsAt: null } : campaign,
        purchaseReq,
        now
      )
    ) {
```

Mirror the identical call at `RedeemablesWalletService.ts:84`.

- [ ] **Step 7: Site 4 — the checkout validate gate**

`src/app/api/codes/validate/route.ts:103-110`. This gate fires **first**, at checkout — fixing only sites 1–3 yields a coupon the server would honour but checkout calls invalid. Add the `$or` leg, add `startsAt endsAt neverExpires validForDays` to the `.select()`, and when the caller has a userId, return the real reason:

```ts
    $or: [{ neverExpires: true }, { endsAt: { $gte: now } }, { validForDays: { $gte: 1 } }],
```

Then, when `personalWindowGoverns(campaign) && params.userId`, look up that user's own row and return the dated message rather than a bare invalid:

```ts
      return {
        success: true,
        valid: false,
        message: `This code expired on ${formatExpiryLabelAEST(issuance.expiresAt)}.`,
      };
```

With no `userId` (guest checkout), fall back to the campaign window — this route is an unauthenticated **preview**; redemption stays authoritative.

- [ ] **Step 8: Run the test and type-check**

Run: `npm run test:bonus-code-window && npm run type-check && npm run lint`

- [ ] **Step 9: Update docs**

`docs/rewards-redeemables/rules.md` — the four sites and why they must agree. `docs/promo/api.md` — the new validate reason.

---

## Task 6: Admin write path

Four independent layers strip unknown fields. Miss one and `validForDays` silently never persists.

**Files:**
- Modify: `src/app/api/admin/monthly-coupon/campaign/route.ts` (`:22`, `:34-47`, `:116-132`)
- Modify: `src/app/api/admin/monthly-coupon/campaign/[id]/route.ts` (`:17`)
- Modify: `src/services/redeemables/CampaignService.ts` (`:53`, `:96`, `:110-112`, `:201-215`)
- Docs: `docs/admin/api.md`, `docs/rewards-redeemables/api.md`

- [ ] **Step 1: Create-route zod + refine**

`campaign/route.ts:22`, after `neverExpires`:

```ts
  validForDays: z.number().int().min(1).optional(),
```

Extend the existing `.superRefine` (`:34-47`):

```ts
    if (value.neverExpires && value.validForDays != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["validForDays"],
        message: "neverExpires and validForDays are mutually exclusive",
      });
    }
```

- [ ] **Step 2: Service create-input type**

`CampaignService.ts:53` — add `validForDays?: number;`. The `...input` spread at `:69` then carries it; the type is the gate.

- [ ] **Step 3: The explicit POST field mapping**

`campaign/route.ts:116-132` maps each field by name with no spread — **the easiest edit to miss**:

```ts
      validForDays: payload.validForDays,
```

- [ ] **Step 4: Update-route zod (nullable = the clearing sentinel)**

`campaign/[id]/route.ts:17`:

```ts
  validForDays: z.number().int().min(1).nullable().optional(),
```

Plus the same mutual-exclusion refine.

- [ ] **Step 5: Service update type + the clearing escape hatch**

`CampaignService.ts:96` — add `validForDays: number | null;` to the updates type. Then after the strip loop (`:110-112`):

```ts
    // Two independent undefined-strip layers (the route and this loop) mean the
    // field could otherwise NEVER be cleared once set — the same class of bug
    // displayLabel needed a bespoke escape hatch for below.
    if (updates.validForDays === null) {
      delete normalizedUpdates.validForDays;
      (updateOperation as { $unset?: Record<string, 1> }).$unset = {
        ...(updateOperation as { $unset?: Record<string, 1> }).$unset,
        validForDays: 1,
      };
    }
```

- [ ] **Step 6: Make campaign delete a soft delete**

`CampaignService.ts:201-215` — drop the hard-delete branch, always `$set: { isActive: false }`. The count-then-delete is non-atomic, and for a lazily-minted trigger campaign `issuanceCount === 0` is the **normal** state, so a delete racing a trigger orphans a live issuance. An orphan renders as *more* claimable than a real coupon, because the campaign lookup misses and `purchaseRequirement` collapses to `"none"`.

- [ ] **Step 7: Verify**

Run: `npm run type-check && npm run lint`

- [ ] **Step 8: Update docs**

`docs/admin/api.md` and `docs/rewards-redeemables/api.md` — the new field on both routes, and the `null` clearing semantics.

---

## Task 7: Admin read path + Norm (lockstep)

Rule 10: schema, route and `norm-context.md` change together or the endpoint 500s at runtime, invisible to `tsc`.

**Files:**
- Modify: `src/services/redeemables/MonthlyCouponQueryService.ts` (`:51`, `:75-77`, `:104`)
- Modify: `src/app/api/admin/monthly-coupon/campaign/route.ts` (`:72`)
- Modify: `src/lib/internal-norm/schemas/monthly-coupon.ts` (`:49`)
- Modify: `src/app/api/internal/norm/v1/monthly-coupon/campaign/route.ts` (`:36`)
- Modify: `docs/internal-norm/norm-context.md`
- Modify: `src/components/admin/MonthlyRedeemablesCampaignPanel.tsx`, `src/components/modals/AdminMonthlyRedeemablesModal.tsx`
- Docs: `docs/admin/frontend.md`

- [ ] **Step 1: Query service — type, projection, mapping**

`MonthlyCouponQueryService.ts:51` add `validForDays?: number;` to `MonthlyCampaignListRow`. `:75-77` add `validForDays` to the `.select()` string — **miss this and the field type-checks everywhere and is `undefined` at runtime in both the admin list and Norm**. `:104` add `validForDays: c.validForDays,` to the row mapping.

- [ ] **Step 2: Admin GET response**

`campaign/route.ts:72` — add `validForDays: row.validForDays,`.

- [ ] **Step 3: Norm schema + route, same change**

`schemas/monthly-coupon.ts:49`:

```ts
  validForDays: z.number().int().positive().optional(),
```

`internal/norm/v1/monthly-coupon/campaign/route.ts:36` — add `validForDays: row.validForDays,`. Direction matters: `withNorm` `safeParse`s the response and 500s on failure, but zod strips unknown keys — emitting extra is safe, declaring required and not emitting is a 500 on the whole endpoint. `.optional()` plus **both** edits together.

- [ ] **Step 4: Norm context doc**

`docs/internal-norm/norm-context.md` — add the line: *"`validForDays`: per-customer window in days; when set, each issuance expires validForDays after THAT user's eligibility, not at campaign end."*

- [ ] **Step 5: Admin UI — list panel**

`MonthlyRedeemablesCampaignPanel.tsx` — add `validForDays?: number` to `MonthlyCampaignListItem` and render it at the three expiry display sites so an operator can tell a fixed-end campaign from a rolling one:

```tsx
End: {neverExpires
  ? "Never Expires"
  : validForDays
    ? `${validForDays}-day window per customer (backstop ${formatDateTime(endsAt)})`
    : formatDateTime(endsAt)}
```

- [ ] **Step 6: Admin UI — the modal**

`AdminMonthlyRedeemablesModal.tsx` — thread `validForDays` through all seven sites; disable the input when `neverExpires` is checked; relabel `endsAt` as "Backstop — no new customers qualify after this date" when `validForDays` is set. On submit, warn when setting `validForDays` on a campaign that **already has issuances**: existing rows are not re-stamped, so they keep the old deadline while the flow promises a rolling window.

- [ ] **Step 7: Verify**

Run: `npm run type-check && npm run lint && npm run build:norm-manifest && npm run norm:smoke`
Expected: smoke passes — a schema/output mismatch here is a runtime 500 `tsc` cannot see.

---

## Task 8: The Klaviyo event

**Files:**
- Modify: `src/utils/integrations/klaviyo/klaviyo-events.ts` (after `:960`)
- Modify: `src/utils/integrations/klaviyo/__tests__/canonical-events-shape.test.ts` (`:28-63`)
- Modify: `src/types/klaviyo.ts` (`:160-170`)
- Modify: `src/lib/klaviyo.ts` (`:1779-1802`)
- Create: `src/services/redeemables/BonusCodeNotifier.ts`
- Docs: `docs/tracking/KLAVIYO_INTEGRATION.md`, `docs/tracking/EVENT_PARAMETER_MATRIX.md`

**Interfaces — Produces:**
```ts
export function createBonusCodeIssuedEvent(user: IUser, data: {
  code: string; entriesAmount: number; issuedAt: Date; expiresAt: Date; trigger: BonusCodeTrigger;
}): KlaviyoEvent
export class BonusCodeNotifier {
  static async notify(params: { user: IUser; issuance: StampedIssuance; trigger: BonusCodeTrigger }): Promise<void>
}
```

- [ ] **Step 1: The event builder**

`klaviyo-events.ts`, after `createStartedCheckoutEvent` (`:960`), following the post-2026-05 canonical conventions block:

```ts
/**
 * Bonus Code Issued — a per-customer bonus-entry code was minted or re-armed.
 *
 * `expiresAt` is a PARAMETER and must be the persisted issuance value. Never
 * call new Date() for it here: the email prints this value and the server
 * enforces the stored one, so a recomputed instant can silently differ by a
 * whole calendar day across Sydney midnight.
 */
export function createBonusCodeIssuedEvent(
  user: IUser,
  data: { code: string; entriesAmount: number; issuedAt: Date; expiresAt: Date; trigger: BonusCodeTrigger }
): KlaviyoEvent {
  return {
    event: "Bonus Code Issued",
    customer_properties: getCustomerProperties(user),
    properties: {
      user_id: String(user._id),
      code: data.code,
      entries_granted: data.entriesAmount,
      issued_at: data.issuedAt.toISOString(),
      expires_at: data.expiresAt.toISOString(),
      expires_at_label: formatExpiryLabelAEST(data.expiresAt),
      trigger: data.trigger,
    },
  };
}
```

- [ ] **Step 2: Extend the canonical shape test**

`canonical-events-shape.test.ts:28-63` — add `"code"`, `"expires_at_label"`, `"trigger"` to `CANONICAL_KEYS` and an `assertCanonicalShape("Bonus Code Issued", sample.properties)` case. `expires_at` / `issued_at` already pass via the `_at` pattern; `expires_at_label` does **not** and would fail `npm run test:klaviyo-canonical`.

Add an assertion that the builder emits the **passed** instant: call it twice with the same `expiresAt` a tick apart and assert identical `expires_at` and `expires_at_label`.

- [ ] **Step 3: Add an idempotency key to the event payload**

`src/types/klaviyo.ts:160-170` — add `unique_id?: string;` to `KlaviyoEvent`. `src/lib/klaviyo.ts:1779-1802` — pass it into the event attributes:

```ts
        ...(formattedEvent.unique_id ? { unique_id: formattedEvent.unique_id } : {}),
```

The payload has no idempotency key today and `"timeout"` is explicitly retryable with `MAX_RETRIES = 5`, so an accepted-but-slow POST can be delivered five times.

- [ ] **Step 4: The notifier**

Create `src/services/redeemables/BonusCodeNotifier.ts`. Awaited, not fire-and-forget — `trackEvent` cannot throw (its own catch returns `{ success: false }`), so the await is bounded by one request timeout. Persist the outcome so support can answer "why didn't they get it?".

```ts
export class BonusCodeNotifier {
  static async notify(params: { user: IUser; issuance: StampedIssuance; trigger: BonusCodeTrigger }): Promise<void> {
    // Vercel previews are PRODUCTION builds (CLAUDE.md), and dev/prod share one
    // Klaviyo account with no isolation on profile writes. Without this gate a
    // preview deploy emails a real customer and burns their lifetime grant.
    if (process.env.VERCEL_ENV !== "production") {
      console.error("[bonus-code] skipped emit outside production", {
        userId: String(params.user._id),
        code: params.issuance.campaignCode,
        vercelEnv: process.env.VERCEL_ENV,
      });
      return;
    }

    const event = createBonusCodeIssuedEvent(params.user, {
      code: params.issuance.campaignCode,
      entriesAmount: params.issuance.entriesAmount,
      issuedAt: params.issuance.issuedAt,
      expiresAt: params.issuance.expiresAt,
      trigger: params.trigger,
    });
    // Same issuance + same deadline collapses to one event; a re-armed deadline
    // is legitimately a new one.
    event.unique_id = `${params.issuance.id}:${params.issuance.expiresAt.toISOString()}`;

    const res = await klaviyo.trackEvent(event, { retryOnFailure: false });

    await RedeemableIssuance.updateOne(
      { _id: params.issuance.id },
      {
        $set: res.success
          ? { notifiedAt: new Date(), notifyError: null }
          : { notifiedAt: null, notifyError: res.error ?? "unknown" },
      }
    );

    if (!res.success) {
      console.error("[bonus-code] Klaviyo emit failed", {
        issuanceId: params.issuance.id,
        error: res.error,
      });
    }
  }
}
```

- [ ] **Step 5: Update the tracking docs**

`docs/tracking/KLAVIYO_INTEGRATION.md` — add the `Bonus Code Issued` property table beside `Viewed Giveaway` / `Started Checkout`, plus the three new keys in the canonical table. `EVENT_PARAMETER_MATRIX.md` — the new row. The canonical test file's own instruction requires this in the same change.

- [ ] **Step 6: Verify**

Run: `npm run type-check && npm run lint && npm run test:klaviyo-canonical`

---

## Task 9: Wire the three triggers

**Files:**
- Modify: `src/services/subscription/CancelSubscriptionService.ts` (`:26-33`, `:162`)
- Modify: `src/app/api/stripe/cancel-subscription/route.ts` (pass `mintBonusCode: true`)
- Modify: `src/utils/payment/payment-processing.ts` (`:1394`)
- Modify: `src/app/api/auth/register/route.ts` (inside `fireKlaviyoStartedCheckoutForGuestRegistration`)
- Modify: `src/app/api/cron/monthly-redeemables-issuance/route.ts` (`:25`)
- Modify: `src/services/stripe-webhook-handlers/index.ts` (`:4340-4343`)
- Docs: `docs/subscription/backend.md`, `docs/payment/backend.md`, `docs/rewards-redeemables/patterns.md`

**Interfaces — Consumes:** `CampaignService.ensureCampaignIssuanceForUser` (Task 4), `BonusCodeNotifier.notify` (Task 8).

Every call site does the same three things and **never** lets a failure escape:

```ts
try {
  const result = await CampaignService.ensureCampaignIssuanceForUser({
    userId: String(user._id),
    campaignCode: BONUS_CODE_BY_TRIGGER["cancel-click"],
    trigger: "cancel-click",
  });
  if ((result.outcome === "minted" || result.outcome === "rearmed") && result.issuance) {
    await BonusCodeNotifier.notify({ user, issuance: result.issuance, trigger: "cancel-click" });
  }
} catch (error) {
  console.error("[bonus-code] cancel-click trigger failed", { userId: String(user._id), error });
}
```

- [ ] **Step 1: Add the trigger → campaign-code map**

In `src/config/` (existing config domain), a single exported record so the three codes are named in exactly one place:

```ts
export const BONUS_CODE_BY_TRIGGER: Record<BonusCodeTrigger, string> = {
  "cancel-click": "BACKIN200",
  "checkout-start": "LOCKIN100",
  "one-time-purchase": "EXTRA100",
};
```

- [ ] **Step 2: Cancel-click, opt-in only**

`CancelSubscriptionService.ts` — add `mintBonusCode?: boolean` to `CancelSubscriptionOptions` (`:26-33`), default `false`. Insert the block at `:162`, between `await user.save()` and the existing profile-sync `try`, in its own `try/catch`. **Do not** name the event `"Subscription Cancelled"` — the comment at `:160-161` exists to prevent API+webhook duplication.

Set `mintBonusCode: true` **only** on the member-initiated route `src/app/api/stripe/cancel-subscription/route.ts:45`. Leave `switchTierPastDue.ts:127` and the admin cancel route at `false` — a past-due tier switch is not churn, and an admin-initiated cancel should not silently mint.

- [ ] **Step 3: One-time purchase without membership**

`payment-processing.ts:1394`, inside the existing campaign block, gated on `packageData.packageType === "one-time"` and no active subscription, copying the surrounding non-blocking `try/catch` shape. Ordering is verified safe: the one-time and membership branches at `:1146-1149` are mutually exclusive and `handleOneTimePackage` never touches `user.subscription`, so `user.subscription.isActive` here is still the pre-`grantBenefits` value.

- [ ] **Step 4: Guest checkout-start**

`register/route.ts` — inside `fireKlaviyoStartedCheckoutForGuestRegistration` (called at `:533`, `:672`, `:774`, `:938`, all with a persisted user doc). The re-registration path is deliberate, and the decision table's `already_active` branch handles it by returning the **stored** `expiresAt`, so a re-send carries the original date.

**Note the gap:** the *authed* checkout-start emitters are client-only (`useMembershipCardCta.ts:171-201`, `MembershipSection.tsx:380`). Components cannot reach Mongo. Do **not** attempt enrolment from the client — leave authed checkout-start unwired and flag it.

- [ ] **Step 5: Keep the cron off trigger campaigns**

`cron/monthly-redeemables-issuance/route.ts:25`:

```ts
    .filter((campaign) => campaign.monthKey === monthKey && !campaign.validForDays)
```

- [ ] **Step 6: Stop renewals auto-redeeming a re-armed grant**

`stripe-webhook-handlers/index.ts:4340-4343` — gate `campaignCode` on `isInitialSubscriptionInvoice`, the way the adjacent A/B fields already are at `:4324`. `campaignCode` lives in **subscription** metadata, so it persists for the subscription's life; harmless today (row is redeemed), but under re-arm a renewal invoice months later would silently auto-redeem a freshly re-armed grant with no customer action.

- [ ] **Step 7: Verify**

Run: `npm run type-check && npm run lint && npm run test:anchor-billing`

- [ ] **Step 8: Update docs**

`docs/subscription/backend.md` (the new cancel-time side effect + the `mintBonusCode` opt-in), `docs/payment/backend.md`, `docs/rewards-redeemables/patterns.md` (the trigger contract).

---

## Task 10: Customer-facing surfaces — and the visibility gate

Implements the user's explicit requirement: **a code is visible only to a customer who has qualified for it.**

**Files:**
- Modify: `src/app/api/redeemables/status/route.ts` (`:37-60`)
- Modify: `src/services/redeemables/RedeemablesWalletService.ts` (`:9-27`, `:65`, `:95`, `:99-102`)
- Modify: `src/hooks/queries/useRedeemablesQueries.ts` (`:16-20`)
- Modify: `src/components/features/RedeemablesWallet.tsx` (`:171`)
- Modify: `src/components/features/RewardsFloatingWidget.tsx` (`:517-521`)
- Modify: `src/app/api/redeemables/redeem/route.ts` (`:44-47`)
- Docs: `docs/rewards-redeemables/frontend.md`, `docs/dashboard-account/frontend.md`

- [ ] **Step 1: Close the code-visibility leak**

`src/app/api/redeemables/status/route.ts` currently returns `code: campaign.code` for **every active campaign** to **any authenticated user** (`:43`), with no eligibility check. Load the caller's issuances first and return `code` **only** for campaigns they hold one for:

```ts
    const issuances = await RedeemableIssuance.find({ userId: authResult.session.user.id })
      .select("campaignId status expiresAt redeemedAt")
      .lean();
    const heldCampaignIds = new Set(issuances.map((i) => String(i.campaignId)));
```

then in the `activeCampaigns` mapping:

```ts
          // A campaign code is visible ONLY to a customer who holds an issuance
          // for it. Returning it to everyone let any signed-in user read a
          // trigger code they had not qualified for.
          code: heldCampaignIds.has(String(campaign._id)) ? campaign.code : undefined,
```

Do the same for `activeCampaign`. Keep the rest of the shape unchanged so existing clients do not break.

- [ ] **Step 2: One expiry label everywhere**

`RedeemablesWalletService.ts` — add `expiresAtLabel: string` to `RedeemableWalletItem` (`:9-27`) and populate it with `formatExpiryLabelAEST(issuance.expiresAt)` (`:95`) — the **same function** the email uses.

Add `isActive validForDays` to the campaign `.select()` (`:65`); make the `neverExpires` render fall back to the issuance value when `validForDays` is set; and tighten `isRedeemableNow` (`:99-102`) with `&& Boolean(campaign) && campaign.isActive !== false` so a deactivated or orphaned campaign cannot show an enabled Claim button the server then refuses.

- [ ] **Step 3: Replace the locale-dependent date rendering**

`RedeemablesWallet.tsx:171` and `RewardsFloatingWidget.tsx:517-521` both call `new Date(item.expiresAt).toLocaleDateString()`, which renders in the **viewer's** locale: the same instant reads `04/10/2026` (en-AU) and `10/4/2026` (en-US — read as *10 April*, six months wrong and in the past). Replace both with `item.expiresAtLabel`. Two copies exist; both must change or they disagree with each other as well as with the email.

Add `expiresAtLabel?: string` to the client type in `useRedeemablesQueries.ts:16-20`.

- [ ] **Step 4: Human refusal messages**

`src/app/api/redeemables/redeem/route.ts:44-47` — map `result.reason` to copy. `campaign_not_active` is the raw string a personal-window customer sees today; `expired` should name the date via `formatExpiryLabelAEST`. Rule 11 applies: free entries included with the pack, never "buy entries", never odds/chances.

- [ ] **Step 5: Verify**

Run: `npm run type-check && npm run lint`

- [ ] **Step 6: Update docs**

`docs/rewards-redeemables/frontend.md` and `docs/dashboard-account/frontend.md` — the visibility rule and the single label source.

---

## Task 11: Top-level docs, Cobber, and the full verification sweep

**Files:**
- Modify: `BUSINESS.md`, `CUSTOMER.md`
- Modify: `src/data/supportChatFaqs.ts`, `src/data/__tests__/faqs.test.ts`
- Modify: `.claude/hooks/doc-sync.mjs` (`BUSINESS_TRIGGER_GLOBS`, `CUSTOMER_TRIGGER_GLOBS`)
- Modify: `CLAUDE.md` Domain Manifest if any new path is uncovered

- [ ] **Step 1: BUSINESS.md**

Rule 5 trigger — the promo/bonus-entry model gained a per-customer window. Document: codes may carry a `validForDays` window measured from each customer's own qualifying moment; one grant per customer for life; a refund does not restore it.

- [ ] **Step 2: CUSTOMER.md**

Rule 5b triggers — how a customer earns/holds entries changed, and what customer data reaches Klaviyo changed (the new `Bonus Code Issued` event and its properties).

- [ ] **Step 3: Cobber FAQ**

Rule 5c. Add entries answering "how long do I have to use my code?", "can I use it twice?", and "I got a refund — can I use my code again?". Match the corpus's id/category conventions. **Rule 11:** free entries **included** with the membership or pack; never "buy entries"; never odds/chances/lottery.

Bump the count assertion in `src/data/__tests__/faqs.test.ts` deliberately.

Run: `npm run build:chat-knowledge-pack && npm run test:chat-faqs`

- [ ] **Step 4: Teach the doc-sync hook about this feature**

`BUSINESS_TRIGGER_GLOBS` and `CUSTOMER_TRIGGER_GLOBS` contain **no promo, coupon or redeemables path at all**, so the safety net is blind to this entire feature. Add `src/services/redeemables/**`, `src/models/RedeemableIssuance.ts`, `src/models/MonthlyEntryCampaign.ts`, and `src/utils/integrations/klaviyo/**` to the appropriate lists.

- [ ] **Step 5: Full verification sweep**

```bash
npm run type-check
npm run lint
npm run test:bonus-code-expiry
npm run test:bonus-code-rearm
npm run test:bonus-code-window
npm run test:redeemables
npm run test:klaviyo-canonical
npm run test:chat-faqs
npm run build:norm-manifest && npm run norm:smoke
npm run check:env
```

All must pass. Report any failure with its output — do not claim completion on a red run.

- [ ] **Step 6: Report, do not commit**

Summarise what changed, what was verified, and what was deliberately left out (below). **Ask before committing** — CLAUDE.md rule 1.

---

## Explicitly out of scope

| Item | Why |
|---|---|
| Which moment counts as "cancel-click" — retention-flow start vs cancellation commit | Product decision; the two select different populations. Mechanism is identical either way. **Needs an answer before Task 9 Step 2 is final.** |
| Authed checkout-start server-side move | Its own change; components cannot reach Mongo, so LOCKIN100 covers guests only until that lands. |
| The refund double-reversal (`campaignEntries` reversed twice, plus an unscoped `removeMajorDrawEntries`) | Live today, independent of expiry. `redeemedEverAt` means a refunded row never re-arms, so this design does not worsen it. **File separately, high priority.** |
| The unchecked `DrawGrantService.grantMonthlyCouponEntries` return | Pre-existing: a redemption during a draw freeze burns the coupon and grants zero. **File separately.** |
| `getMonthKey` deriving months from UTC | Real bug; the cron is blind for the first ~10h of every Sydney month. Task 9 Step 5 removes trigger campaigns from that cron, so it cannot affect this feature. **File separately.** |
| Repo-wide Klaviyo env fix (derive mode from `VERCEL_ENV`) | Correct and one line, but changes behaviour for all 28 emitters at once. Task 8 gates this feature narrowly. **Raise as its own decision.** |
| Admin per-campaign funnel + per-user issuance lookup | Highest-value follow-up: this branch writes `notifiedAt`, and until the funnel exists reading it is a hand-written Mongo query. |
| The code values, entry amounts, email copy, Klaviyo flows | The ads team's; this is only the machinery. |
