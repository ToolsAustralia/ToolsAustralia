# Age Analytics + Profession Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **No-auto-commit policy:** This repo has a hard rule (CLAUDE.md §1) — never run `git add`/`git commit`/`git push` unless the user *explicitly* authorizes in their most recent message with one of: `commit`, `push`, `merge`, `make a PR`. The plan therefore omits per-task commits. Run lint/type-check/tests after each task and pause; commits happen only at the end after user approval.

**Goal:** Add an Age Group Breakdown chart to the admin User Metrics view, and dedupe the Profession Breakdown by normalizing free-text variants into canonical buckets.

**Architecture:** Two new pure utilities under `src/utils/metrics/` (`age-grouping.ts`, `profession-normalize.ts`) consumed read-time inside `UserMetricsService.getUserMetrics`. New `AgeBreakdown.tsx` chart mirrors `ProfessionBreakdown.tsx`. `UserMetrics` type gains an `ageGroup` field. Zero schema/migration changes.

**Tech Stack:** Next.js 15 App Router, MongoDB/Mongoose, React 19 client component, Recharts, tsx test runner with `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-05-04-age-analytics-and-profession-cleanup-design.md`

---

## File map

**Create (5):**
- `src/utils/metrics/age-grouping.ts` — `getAgeGroup`, `AGE_GROUP_ORDER`, `AgeGroupLabel`
- `src/utils/metrics/profession-normalize.ts` — `normalizeProfession`, `bucketUnmatched`, `PROFESSION_SYNONYMS`
- `src/utils/metrics/__tests__/age-grouping.test.ts`
- `src/utils/metrics/__tests__/profession-normalize.test.ts`
- `src/components/admin/metrics/users/AgeBreakdown.tsx`

**Modify (5):**
- `src/types/metrics/UserMetrics.ts` — add `AgeGroupLabel` type and `ageGroup` field
- `src/services/metrics/UserMetricsService.ts` — select `birthdate`, compute `ageGroup`, normalize profession + bucket
- `src/components/admin/metrics/UserMetricsView.tsx` — render `<AgeBreakdown>`
- `src/components/admin/metrics/users/ProfessionBreakdown.tsx` — lift `.slice(0, 10)` cap to 20
- `package.json` — wire `test:age-grouping` and `test:profession-normalize`

**Docs to update at end (Stop hook will enforce):**
- `docs/metrics-analytics/` (frontend.md or appropriate file)
- `docs/admin/` (frontend.md or appropriate file)

---

### Task 1: Age grouping utility

**Files:**
- Create: `src/utils/metrics/__tests__/age-grouping.test.ts`
- Create: `src/utils/metrics/age-grouping.ts`

- [ ] **Step 1: Write the failing test**

Create `src/utils/metrics/__tests__/age-grouping.test.ts`:

```ts
import assert from "node:assert/strict";
import { getAgeGroup, AGE_GROUP_ORDER } from "@/utils/metrics/age-grouping";

const asOf = new Date("2026-05-04T00:00:00.000Z");

function testNullBirthdateIsUnknown() {
  assert.equal(getAgeGroup(null, asOf), "Unknown");
  assert.equal(getAgeGroup(undefined, asOf), "Unknown");
}

function testFutureBirthdateIsUnknown() {
  const future = new Date("2030-01-01T00:00:00.000Z");
  assert.equal(getAgeGroup(future, asOf), "Unknown");
}

function testUnder18IsUnknown() {
  // 17 years old as of asOf
  const dob = new Date("2009-01-01T00:00:00.000Z");
  assert.equal(getAgeGroup(dob, asOf), "Unknown");
}

function testBucket18To24Lower() {
  // exactly 18
  const dob = new Date("2008-05-04T00:00:00.000Z");
  assert.equal(getAgeGroup(dob, asOf), "18-24");
}

function testBucket18To24Upper() {
  // 24 years old (just turned)
  const dob = new Date("2002-05-04T00:00:00.000Z");
  assert.equal(getAgeGroup(dob, asOf), "18-24");
}

function testBucket25To34Lower() {
  // exactly 25
  const dob = new Date("2001-05-04T00:00:00.000Z");
  assert.equal(getAgeGroup(dob, asOf), "25-34");
}

function testBucket55To64() {
  const dob = new Date("1965-01-01T00:00:00.000Z");
  assert.equal(getAgeGroup(dob, asOf), "55-64");
}

function testBucket65Plus() {
  const dob = new Date("1955-01-01T00:00:00.000Z");
  assert.equal(getAgeGroup(dob, asOf), "65+");
}

function testCalendarMethodBeforeBirthdayInYear() {
  // Birthday hasn't happened yet this year — age should be 24, not 25.
  // asOf = 2026-05-04, dob = 2001-05-05 → 24 (one day before 25th birthday)
  const dob = new Date("2001-05-05T00:00:00.000Z");
  assert.equal(getAgeGroup(dob, asOf), "18-24");
}

function testCalendarMethodOnBirthday() {
  // dob = 2001-05-04, asOf = 2026-05-04 → exactly 25 today
  const dob = new Date("2001-05-04T00:00:00.000Z");
  assert.equal(getAgeGroup(dob, asOf), "25-34");
}

function testLeapYearBirthdayBeforeFeb29() {
  // dob = 2000-02-29, asOf = 2026-02-28 → not yet 26 (still 25)
  const dob = new Date("2000-02-29T00:00:00.000Z");
  const before = new Date("2026-02-28T00:00:00.000Z");
  assert.equal(getAgeGroup(dob, before), "25-34");
  // asOf = 2026-03-01 → now 26
  const after = new Date("2026-03-01T00:00:00.000Z");
  assert.equal(getAgeGroup(dob, after), "25-34");
}

function testAgeGroupOrderShape() {
  assert.deepEqual(AGE_GROUP_ORDER, [
    "18-24",
    "25-34",
    "35-44",
    "45-54",
    "55-64",
    "65+",
    "Unknown",
  ]);
}

testNullBirthdateIsUnknown();
testFutureBirthdateIsUnknown();
testUnder18IsUnknown();
testBucket18To24Lower();
testBucket18To24Upper();
testBucket25To34Lower();
testBucket55To64();
testBucket65Plus();
testCalendarMethodBeforeBirthdayInYear();
testCalendarMethodOnBirthday();
testLeapYearBirthdayBeforeFeb29();
testAgeGroupOrderShape();
console.log("age-grouping tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx src/utils/metrics/__tests__/age-grouping.test.ts`
Expected: FAIL — `Cannot find module '@/utils/metrics/age-grouping'` (file doesn't exist yet).

- [ ] **Step 3: Implement the utility**

Create `src/utils/metrics/age-grouping.ts`:

```ts
/**
 * Age grouping for user demographics.
 *
 * Buckets are computed from `birthdate` as of "now" (or an injected `asOf` for tests).
 * `Unknown` covers: missing birthdate, future birthdate, and ages < 18 (signup floor —
 * anything below is treated as dirty data rather than skewing the chart).
 */

export type AgeGroupLabel =
  | "18-24"
  | "25-34"
  | "35-44"
  | "45-54"
  | "55-64"
  | "65+"
  | "Unknown";

export const AGE_GROUP_ORDER: readonly AgeGroupLabel[] = [
  "18-24",
  "25-34",
  "35-44",
  "45-54",
  "55-64",
  "65+",
  "Unknown",
];

/** Calendar-method age (handles leap years correctly — never use ms division). */
function calendarAgeYears(birth: Date, asOf: Date): number {
  let age = asOf.getUTCFullYear() - birth.getUTCFullYear();
  const m = asOf.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && asOf.getUTCDate() < birth.getUTCDate())) {
    age--;
  }
  return age;
}

export function getAgeGroup(
  birthdate: Date | null | undefined,
  asOf: Date = new Date()
): AgeGroupLabel {
  if (!birthdate) return "Unknown";
  if (birthdate.getTime() > asOf.getTime()) return "Unknown";

  const age = calendarAgeYears(birthdate, asOf);
  if (age < 18) return "Unknown";
  if (age <= 24) return "18-24";
  if (age <= 34) return "25-34";
  if (age <= 44) return "35-44";
  if (age <= 54) return "45-54";
  if (age <= 64) return "55-64";
  return "65+";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx src/utils/metrics/__tests__/age-grouping.test.ts`
Expected: prints `age-grouping tests passed` and exits 0.

---

### Task 2: Profession normalization utility

**Files:**
- Create: `src/utils/metrics/__tests__/profession-normalize.test.ts`
- Create: `src/utils/metrics/profession-normalize.ts`

- [ ] **Step 1: Write the failing test**

Create `src/utils/metrics/__tests__/profession-normalize.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  normalizeProfession,
  bucketUnmatched,
} from "@/utils/metrics/profession-normalize";

function testEmptyAndNullAreUnknown() {
  assert.equal(normalizeProfession(undefined), "Unknown");
  assert.equal(normalizeProfession(null), "Unknown");
  assert.equal(normalizeProfession(""), "Unknown");
  assert.equal(normalizeProfession("   "), "Unknown");
}

function testCanonicalCaseInsensitive() {
  assert.equal(normalizeProfession("Electrician"), "Electrician");
  assert.equal(normalizeProfession("electrician"), "Electrician");
  assert.equal(normalizeProfession("  ELECTRICIAN  "), "Electrician");
}

function testPluralStripped() {
  assert.equal(normalizeProfession("Builders"), "Builder");
  assert.equal(normalizeProfession("plumbers"), "Plumber");
}

function testSynonymMap() {
  assert.equal(normalizeProfession("sparky"), "Electrician");
  assert.equal(normalizeProfession("Sparkie"), "Electrician");
  assert.equal(normalizeProfession("electrcian"), "Electrician"); // common typo
  assert.equal(normalizeProfession("chippy"), "Builder");
  assert.equal(normalizeProfession("tradie"), "Builder");
  assert.equal(normalizeProfession("plumb"), "Plumber");
  assert.equal(normalizeProfession("brickie"), "Bricklayer");
  assert.equal(normalizeProfession("brick layer"), "Bricklayer");
  assert.equal(normalizeProfession("concretor"), "Concreter");
  assert.equal(normalizeProfession("fitter and turner"), "Fitter & Turner");
  assert.equal(normalizeProfession("fitter & turner"), "Fitter & Turner");
  assert.equal(normalizeProfession("auto mechanic"), "Mechanic");
  assert.equal(normalizeProfession("gardener"), "Landscaper");
}

function testUnmatchedFallsBackTitleCased() {
  assert.equal(normalizeProfession("Tiler"), "Tiler");
  assert.equal(normalizeProfession("tiler"), "Tiler");
  assert.equal(normalizeProfession("farm hand"), "Farm Hand");
  assert.equal(normalizeProfession("ROOFER"), "Roofer");
}

function testOtherIsCanonical() {
  // "Other" is a dropdown option — must stay distinct from "Other (custom)"
  assert.equal(normalizeProfession("Other"), "Other");
  assert.equal(normalizeProfession("other"), "Other");
}

function testBucketUnmatchedKeepsCanonicalAndTopN() {
  const counts: Record<string, number> = {
    Electrician: 50,
    Builder: 30,
    Plumber: 20,
    Other: 5, // canonical "Other" stays distinct
    Tiler: 10, // unmatched, top-N candidate
    Roofer: 8, // unmatched, top-N candidate
    Farmer: 6, // unmatched, top-N candidate
    Driver: 4, // unmatched, top-N candidate
    Painter: 12, // canonical
    Pilot: 3, // unmatched
    Chef: 2, // unmatched
    Nurse: 1, // unmatched (rolls into "Other (custom)")
  };
  const result = bucketUnmatched(counts, 5);

  // Canonical entries pass through unchanged
  assert.equal(result.Electrician, 50);
  assert.equal(result.Builder, 30);
  assert.equal(result.Plumber, 20);
  assert.equal(result.Painter, 12);
  assert.equal(result.Other, 5);

  // Top 5 unmatched (by count desc): Tiler 10, Roofer 8, Farmer 6, Driver 4, Pilot 3
  assert.equal(result.Tiler, 10);
  assert.equal(result.Roofer, 8);
  assert.equal(result.Farmer, 6);
  assert.equal(result.Driver, 4);
  assert.equal(result.Pilot, 3);

  // Rest summed into "Other (custom)" — Chef (2) + Nurse (1) = 3
  assert.equal(result["Other (custom)"], 3);

  // Original unmatched keys past top-N are removed
  assert.equal(result.Chef, undefined);
  assert.equal(result.Nurse, undefined);
}

function testBucketUnmatchedNoUnmatched() {
  const counts = { Electrician: 5, Builder: 3 };
  const result = bucketUnmatched(counts, 5);
  assert.deepEqual(result, { Electrician: 5, Builder: 3 });
  assert.equal(result["Other (custom)"], undefined);
}

function testBucketUnmatchedWithinTopN() {
  // Fewer unmatched than topN — all survive, no "Other (custom)" bucket created.
  const counts = { Electrician: 10, Tiler: 3, Roofer: 2 };
  const result = bucketUnmatched(counts, 5);
  assert.deepEqual(result, { Electrician: 10, Tiler: 3, Roofer: 2 });
  assert.equal(result["Other (custom)"], undefined);
}

testEmptyAndNullAreUnknown();
testCanonicalCaseInsensitive();
testPluralStripped();
testSynonymMap();
testUnmatchedFallsBackTitleCased();
testOtherIsCanonical();
testBucketUnmatchedKeepsCanonicalAndTopN();
testBucketUnmatchedNoUnmatched();
testBucketUnmatchedWithinTopN();
console.log("profession-normalize tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx src/utils/metrics/__tests__/profession-normalize.test.ts`
Expected: FAIL — `Cannot find module '@/utils/metrics/profession-normalize'`.

- [ ] **Step 3: Implement the utility**

Create `src/utils/metrics/profession-normalize.ts`:

```ts
/**
 * Profession normalization for user metrics.
 *
 * Users can free-text a profession via the "Other" path of the signup modal
 * (`src/data/professions.ts`). This util folds typos, casing, plurals, and Aussie
 * trade nicknames into the canonical 11 buckets, while preserving "Other" (the
 * dropdown choice) as a distinct value from "Other (custom)" (the rolled-up
 * long-tail bucket produced by `bucketUnmatched`).
 */

import { PROFESSIONS } from "@/data/professions";

const CANONICAL_VALUES: readonly string[] = PROFESSIONS.map((p) => p.value);
const CANONICAL_LOWER = new Map<string, string>(
  CANONICAL_VALUES.map((v) => [v.toLowerCase(), v])
);

export const PROFESSION_SYNONYMS: Record<string, string> = {
  // Electrician
  sparky: "Electrician",
  sparkie: "Electrician",
  electric: "Electrician",
  electrcian: "Electrician", // common typo
  elec: "Electrician",
  // Builder (covers carpentry — no separate Carpenter canonical)
  chippy: "Builder",
  chippie: "Builder",
  carpenter: "Builder",
  carpentry: "Builder",
  builder: "Builder",
  "construction worker": "Builder",
  tradie: "Builder",
  tradesman: "Builder",
  // Plumber
  plumber: "Plumber",
  plumbing: "Plumber",
  plumb: "Plumber",
  // Mechanic
  mechanic: "Mechanic",
  mech: "Mechanic",
  "motor mechanic": "Mechanic",
  "auto mechanic": "Mechanic",
  // Landscaper
  landscaper: "Landscaper",
  landscaping: "Landscaper",
  gardener: "Landscaper",
  gardening: "Landscaper",
  // Welder
  welder: "Welder",
  welding: "Welder",
  welda: "Welder",
  // Bricklayer
  bricklayer: "Bricklayer",
  bricky: "Bricklayer",
  brickie: "Bricklayer",
  "brick layer": "Bricklayer",
  // Concreter
  concreter: "Concreter",
  concretor: "Concreter",
  concrete: "Concreter",
  concreting: "Concreter",
  // Fitter & Turner
  fitter: "Fitter & Turner",
  turner: "Fitter & Turner",
  "fitter and turner": "Fitter & Turner",
  "fitter & turner": "Fitter & Turner",
  // Painter
  painter: "Painter",
  painting: "Painter",
  "painter & decorator": "Painter",
  // Construction
  construction: "Construction",
  constructor: "Construction",
};

function titleCase(s: string): string {
  return s
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function sanitize(raw: string): string {
  return raw
    .replace(/[\s]+/g, " ")
    .replace(/[.,;:!?]+$/g, "")
    .trim();
}

export function normalizeProfession(raw: string | null | undefined): string {
  if (!raw) return "Unknown";
  const cleaned = sanitize(raw);
  if (!cleaned) return "Unknown";
  const lower = cleaned.toLowerCase();

  // 1. Synonym map
  if (PROFESSION_SYNONYMS[lower]) return PROFESSION_SYNONYMS[lower];

  // 2. Canonical match (case-insensitive)
  const canonical = CANONICAL_LOWER.get(lower);
  if (canonical) return canonical;

  // 3. Strip trailing 's' and re-check synonym + canonical
  if (lower.endsWith("s") && lower.length > 1) {
    const singular = lower.slice(0, -1);
    if (PROFESSION_SYNONYMS[singular]) return PROFESSION_SYNONYMS[singular];
    const canonicalSingular = CANONICAL_LOWER.get(singular);
    if (canonicalSingular) return canonicalSingular;
  }

  // 4. Fallback — title-case the cleaned input
  return titleCase(cleaned);
}

/**
 * Split aggregated profession counts into canonical (kept) vs unmatched
 * (top-N kept individually, rest summed into "Other (custom)").
 *
 * Note: the canonical "Other" (from the dropdown) stays distinct from
 * "Other (custom)" (the rolled-up bucket) — they are two different bars.
 */
export function bucketUnmatched(
  counts: Record<string, number>,
  topN = 5
): Record<string, number> {
  const canonicalSet = new Set(CANONICAL_VALUES);
  const result: Record<string, number> = {};
  const unmatched: Array<[string, number]> = [];

  for (const [key, val] of Object.entries(counts)) {
    if (canonicalSet.has(key) || key === "Unknown") {
      result[key] = val;
    } else {
      unmatched.push([key, val]);
    }
  }

  unmatched.sort((a, b) => b[1] - a[1]);
  const top = unmatched.slice(0, topN);
  const rest = unmatched.slice(topN);

  for (const [key, val] of top) {
    result[key] = val;
  }

  if (rest.length > 0) {
    result["Other (custom)"] = rest.reduce((sum, [, v]) => sum + v, 0);
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx src/utils/metrics/__tests__/profession-normalize.test.ts`
Expected: prints `profession-normalize tests passed` and exits 0.

---

### Task 3: Wire test scripts into package.json

**Files:**
- Modify: `package.json` (scripts section)

- [ ] **Step 1: Add the two `test:*` entries**

Open `package.json`. After the line:
```json
"test:dashboard-date-range": "tsx src/utils/admin/__tests__/dashboardDateRange.test.ts",
```
add (preserving JSON validity — note the trailing comma on the previous line stays, new entries get their own commas):
```json
"test:age-grouping": "tsx src/utils/metrics/__tests__/age-grouping.test.ts",
"test:profession-normalize": "tsx src/utils/metrics/__tests__/profession-normalize.test.ts",
```

- [ ] **Step 2: Run via the new scripts**

Run: `npm run test:age-grouping`
Expected: prints `age-grouping tests passed`.

Run: `npm run test:profession-normalize`
Expected: prints `profession-normalize tests passed`.

---

### Task 4: Extend `UserMetrics` type

**Files:**
- Modify: `src/types/metrics/UserMetrics.ts`

- [ ] **Step 1: Add `AgeGroupLabel` import and `ageGroup` field**

Replace the `UserMetrics` interface in `src/types/metrics/UserMetrics.ts` so the file reads:

```ts
/**
 * User Metrics Type Definitions
 *
 * Type definitions for user analytics and metrics tracking.
 */

import type { AgeGroupLabel } from "@/utils/metrics/age-grouping";

export interface UserMetrics {
  signupSource: {
    affiliate: number;
    referral: number;
    direct: number;
    organic: number;
    social: number;
  };
  profession: Record<string, number>;
  ageGroup: Record<AgeGroupLabel, number>;
  membershipStatus: {
    active: number;
    cancelled: number;
    pastDue: number;
    renewed: number;
  };
  purchaseHistory: {
    totalPurchases: number;
    totalRevenue: number;
    averageOrderValue: number;
    byPackageType: Record<string, number>;
  };
  dateRange: {
    startDate: Date;
    endDate: Date;
  };
}

export interface UserMetricsQuery {
  startDate?: Date;
  endDate?: Date;
  groupBy?: "source" | "profession" | "status";
  asOfDate?: Date | null;
}

export interface UserMetricsResponse {
  data: UserMetrics;
  meta: {
    timestamp: string;
    totalUsers: number;
  };
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: errors only in `UserMetricsService.ts` (it now needs to populate `ageGroup`) and possibly `UserMetricsView.tsx` if it consumes shape strictly. These are addressed in the next tasks. **Do not fix unrelated TS errors.**

---

### Task 5: Update `UserMetricsService` to populate `ageGroup` and normalize professions

**Files:**
- Modify: `src/services/metrics/UserMetricsService.ts`

- [ ] **Step 1: Add imports**

At the top of `src/services/metrics/UserMetricsService.ts`, after the existing imports, add:

```ts
import { getAgeGroup, AGE_GROUP_ORDER, type AgeGroupLabel } from "@/utils/metrics/age-grouping";
import { normalizeProfession, bucketUnmatched } from "@/utils/metrics/profession-normalize";
```

- [ ] **Step 2: Include `birthdate` in the User select**

Find the line:
```ts
.select("_id affiliateReferral referral profession subscription createdAt")
```
Replace with:
```ts
.select("_id affiliateReferral referral profession subscription createdAt birthdate")
```

- [ ] **Step 3: Initialize `ageGroup` accumulator**

Find the block that initializes `profession`:
```ts
// Aggregate professions
const profession: Record<string, number> = {};
```

Immediately after it, add:

```ts
// Aggregate age groups — initialize every bucket so empty buckets render as 0
const ageGroup: Record<AgeGroupLabel, number> = AGE_GROUP_ORDER.reduce(
  (acc, label) => {
    acc[label] = 0;
    return acc;
  },
  {} as Record<AgeGroupLabel, number>
);
```

- [ ] **Step 4: Replace raw profession increment with normalized; add age increment**

Find this block inside the `for (const user of users)` loop:

```ts
// Aggregate profession
if (user.profession) {
  profession[user.profession] = (profession[user.profession] || 0) + 1;
}
```

Replace it with:

```ts
// Aggregate profession (normalized — folds typos/casing/plurals/synonyms)
const normalizedProfession = normalizeProfession(user.profession);
if (normalizedProfession !== "Unknown") {
  profession[normalizedProfession] = (profession[normalizedProfession] || 0) + 1;
}

// Aggregate age group from birthdate
ageGroup[getAgeGroup(user.birthdate as Date | undefined)]++;
```

- [ ] **Step 5: Bucket unmatched professions before return; add `ageGroup` to return shape**

Find the final `return` block:

```ts
return {
  signupSource,
  profession,
  membershipStatus,
  purchaseHistory,
  dateRange: {
    startDate,
    endDate,
  },
};
```

Replace with:

```ts
const bucketedProfession = bucketUnmatched(profession, 5);

return {
  signupSource,
  profession: bucketedProfession,
  ageGroup,
  membershipStatus,
  purchaseHistory,
  dateRange: {
    startDate,
    endDate,
  },
};
```

- [ ] **Step 6: Type-check**

Run: `npm run type-check`
Expected: no errors related to `UserMetrics`/`UserMetricsService`. Pre-existing unrelated errors (if any) are not addressed here.

- [ ] **Step 7: Re-run unit tests**

Run: `npm run test:age-grouping && npm run test:profession-normalize`
Expected: both pass.

---

### Task 6: Create `AgeBreakdown` chart component

**Files:**
- Create: `src/components/admin/metrics/users/AgeBreakdown.tsx`

- [ ] **Step 1: Add the component**

Create `src/components/admin/metrics/users/AgeBreakdown.tsx`:

```tsx
"use client";

import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { UserMetrics } from "@/types/metrics/UserMetrics";
import { AGE_GROUP_ORDER } from "@/utils/metrics/age-grouping";

export interface AgeBreakdownProps {
  data: UserMetrics["ageGroup"];
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    payload?: {
      name?: string;
      pct?: number;
    };
  }>;
}

const CustomTooltip = ({ active, payload }: TooltipProps) => {
  if (active && payload && payload.length) {
    const point = payload[0];
    return (
      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-lg shadow-lg dark:shadow-none p-3">
        <p className="font-semibold text-gray-900 dark:text-white">{point.payload?.name}</p>
        <p className="text-sm text-gray-600 dark:text-neutral-400">
          Users: {point.value.toLocaleString()}
          {typeof point.payload?.pct === "number" ? ` (${point.payload.pct.toFixed(1)}%)` : ""}
        </p>
      </div>
    );
  }
  return null;
};

export function AgeBreakdown({ data }: AgeBreakdownProps) {
  const total = AGE_GROUP_ORDER.reduce((sum, label) => sum + (data[label] ?? 0), 0);
  const chartData = AGE_GROUP_ORDER.map((label) => {
    const value = data[label] ?? 0;
    return {
      name: label,
      value,
      pct: total > 0 ? (value / total) * 100 : 0,
    };
  });

  if (total === 0) {
    return (
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 p-3 sm:p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Age Group Breakdown</h3>
        <p className="text-gray-600 dark:text-neutral-400 text-center py-8">No age data available</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border border-gray-100 dark:border-neutral-700 p-3 sm:p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Age Group Breakdown</h3>
      <div className="w-full">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" stroke="#6b7280" style={{ fontSize: "12px" }} />
            <YAxis stroke="#6b7280" style={{ fontSize: "12px" }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="value" fill="#ef4444" name="Users" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: no errors.

---

### Task 7: Wire `AgeBreakdown` into `UserMetricsView` and lift profession slice cap

**Files:**
- Modify: `src/components/admin/metrics/UserMetricsView.tsx`
- Modify: `src/components/admin/metrics/users/ProfessionBreakdown.tsx`

- [ ] **Step 1: Import `AgeBreakdown` in the view**

In `src/components/admin/metrics/UserMetricsView.tsx`, find:

```ts
import { ProfessionBreakdown } from "./users/ProfessionBreakdown";
```

Immediately after it, add:

```ts
import { AgeBreakdown } from "./users/AgeBreakdown";
```

- [ ] **Step 2: Render `<AgeBreakdown>` in the chart view**

In the same file, find the chart-view block:

```tsx
{/* Chart View */}
{viewMode === "chart" && aggregateData && (
  <div className="space-y-6">
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <SignupSourceChart data={aggregateData.signupSource} />
      <MembershipLifecycleChart data={aggregateData.membershipStatus} />
    </div>

    <ProfessionBreakdown data={aggregateData.profession} />

   
  </div>
)}
```

Replace with:

```tsx
{/* Chart View */}
{viewMode === "chart" && aggregateData && (
  <div className="space-y-6">
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <SignupSourceChart data={aggregateData.signupSource} />
      <MembershipLifecycleChart data={aggregateData.membershipStatus} />
    </div>

    <AgeBreakdown data={aggregateData.ageGroup} />

    <ProfessionBreakdown data={aggregateData.profession} />
  </div>
)}
```

- [ ] **Step 3: Lift the profession slice cap**

In `src/components/admin/metrics/users/ProfessionBreakdown.tsx`, find:

```ts
const chartData = Object.entries(data)
  .map(([name, value]) => ({ name, value }))
  .sort((a, b) => b.value - a.value)
  .slice(0, 10); // Top 10 professions
```

Replace with:

```ts
const chartData = Object.entries(data)
  .map(([name, value]) => ({ name, value }))
  .sort((a, b) => b.value - a.value)
  .slice(0, 20); // bucketUnmatched bounds the input to ~17; cap at 20 defensively
```

- [ ] **Step 4: Type-check**

Run: `npm run type-check`
Expected: no errors.

- [ ] **Step 5: Smoke test in the browser**

Run: `npm run dev`
Open: `http://localhost:3000/admin/users` (signed in as admin), toggle the **Metrics** view, confirm chart layout:
- Row 1: Signup + Lifecycle (existing).
- Row 2: Age Group Breakdown (new) — bars in chronological order, tooltip shows count + percentage.
- Row 3: Profession Breakdown (existing) — fewer bars than before, no `electrician` / `Electrician` duplicates.

Stop dev server.

---

### Task 8: Update domain documentation

**Files:**
- Modify: at least one file under `docs/metrics-analytics/` (whichever currently documents `UserMetrics` shape; usually `architecture.md` or `frontend.md`)
- Modify: at least one file under `docs/admin/` (whichever documents the User Metrics view)

- [ ] **Step 1: Inspect both doc folders**

Run: `ls docs/metrics-analytics/ docs/admin/`

Read the most likely files: `architecture.md`, `frontend.md`, `gotchas.md` in each, and pick the one that matches existing content style.

- [ ] **Step 2: Update `docs/metrics-analytics/`**

In the appropriate file (most likely `architecture.md`), in the section that lists the `UserMetrics` shape or `UserMetricsService` outputs, add a note covering:

- New field `ageGroup: Record<AgeGroupLabel, number>` returned by `getUserMetrics`. Buckets are `18-24, 25-34, 35-44, 45-54, 55-64, 65+, Unknown`. `Unknown` covers missing/future birthdate or age `<18`.
- Profession aggregation now passes through `normalizeProfession()` then `bucketUnmatched(top5)` before returning. Canonical "Other" stays distinct from rolled-up `"Other (custom)"`.
- New utils live at `src/utils/metrics/age-grouping.ts` and `src/utils/metrics/profession-normalize.ts`.
- Tests: `npm run test:age-grouping`, `npm run test:profession-normalize`.

- [ ] **Step 3: Update `docs/admin/`**

In the appropriate file (most likely `frontend.md` — section describing the User Metrics chart view inside `UsersManagement`), add a note covering:

- New `<AgeBreakdown>` chart sits between the Signup/Lifecycle row and the Profession row.
- `ProfessionBreakdown` chart now receives normalized data; bar cap lifted from 10 to 20.
- File path: `src/components/admin/metrics/users/AgeBreakdown.tsx`.

- [ ] **Step 4: Verify the doc-sync hook is happy**

Don't run `git commit` — but you can simulate the hook's check by running the project's verification commands listed in the next task. The Stop hook checks docs only at end-of-turn; it will run automatically when the executing agent finishes.

---

### Task 9: Final verification

**Files:** none — verification only.

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: no new errors. (Pre-existing warnings/errors unrelated to our files are not addressed here.)

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: 0 errors.

- [ ] **Step 3: Run new tests**

Run: `npm run test:age-grouping && npm run test:profession-normalize`
Expected: both print `... tests passed`.

- [ ] **Step 4: Summarize for the user**

Print a short summary to the user:
- 5 files created, 5 modified
- Tests: `test:age-grouping`, `test:profession-normalize` — both passing
- Lint clean, type-check clean
- Browser-verified: Age Group Breakdown renders in chronological order, Profession Breakdown deduped
- Docs updated under `docs/metrics-analytics/` and `docs/admin/`

- [ ] **Step 5: Ask for commit authorization**

Per CLAUDE.md §1 — do **not** run `git add`, `git commit`, `git push`, or any PR command. Ask the user:

> "Implementation complete. Want me to commit on `claude/stripe-allowlist`? (Reply with `commit` to authorize.)"

Wait for explicit `commit` / `push` / `merge` keyword in the user's next message before any git write operation.
