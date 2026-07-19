# Packages-Focus Ad Analytics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-07-17-packages-focus-ad-analytics-design.md`

**Goal:** Split Meta ad spend / ROAS analytics by landing-URL focus — membership (default URL) vs one-time (`?packages=one-time`) — across the admin KPI drill-down, Prize Performance drill-down, and Facebook Ads tab, with a platform-keyed API ready for TikTok, plus seed capture of the focus on real payments.

**Architecture:** Derive `packagesFocus` on-read from `MetaAdDestination.rawUrls` (data already synced); bake per-focus subtotals into the permanent `LandingPageMetricsDaily` aggregate during the existing per-day rebuild; one new admin+Norm endpoint (`analytics/packages-focus`) serves summary (aggregate-backed, any range) + campaign→adset→ad detail (live join, ~60d); spend-by-url list/detail responses extended additively.

**Tech Stack:** Next.js 15 App Router, Mongoose, Zod, TanStack Query, tsx test scripts, Norm gateway (`withNorm`).

## Global Constraints

- **NO COMMITS.** DJ reviews the working tree. Never run `git commit`/`git add`. Every task ends by recording its per-file change summary (file → what → why) for the final report instead of committing.
- **Classification rule is binary:** landing URL has `packages=one-time` → `"one-time"`; **everything else** (no param, invalid value, even an explicit `?packages=membership`) → `"membership"`. Ads never use `?packages=membership`.
- `unknown://meta-ad/<adId>` destinations and pre-feature aggregate rows are the **`unclassified`** bucket — never "membership".
- Names are fixed: `packagesFocus`, values `"membership" | "one-time"`, bucket union adds `"unclassified"`. No synonyms (no "urlFocus", "variant", "landingType").
- Money convention: cents in Mongo (`spendCents`), dollars in formatted API responses (`spend = Math.round(cents)/100`), `roas = revenue/spend` when spend > 0 else 0 — match `SpendByUrlAggregationService.centsToAud`.
- All customer-facing copy rules (CLAUDE.md §11) are irrelevant here — every surface is admin-only. Do not add gambling/odds words anyway.
- Layering: routes stay thin (validate → authorize → delegate to `src/services/analytics/`); no business logic in components.
- Verification commands available: `npm run type-check`, `npm run lint`, `npm run test:packages-focus` (created in Task 1), `npm run build:norm-manifest`, `npm run norm:smoke`.
- Repo has NO jest/vitest — tests are standalone tsx scripts using `node:assert/strict` with a `run()` invoked at module top (see `src/services/redeemables/__tests__/redeemables.test.ts`).

---

### Task 1: `packagesFocus` derivation util + test

**Files:**
- Create: `src/utils/metrics/packages-focus.ts`
- Test: `src/utils/metrics/__tests__/packages-focus.test.ts`
- Modify: `package.json` (add `test:packages-focus` script)

**Interfaces:**
- Consumes: `parseMembershipPackagesTab`, `MEMBERSHIP_PACKAGES_QUERY_PARAM` from `@/utils/membership/packagesTabParam`; `canonicalizeLandingUrl` from `@/utils/meta/canonicalize-landing-url`.
- Produces (used by Tasks 2, 4, 6):
  - `type PackagesFocus = "membership" | "one-time"`
  - `type PackagesFocusBucket = PackagesFocus | "unclassified"`
  - `PACKAGES_FOCUS_VALUES: readonly ["membership", "one-time"]`
  - `derivePackagesFocusFromUrl(url: string): PackagesFocus`
  - `resolvePrimaryRawUrl(rawUrls: readonly string[] | null | undefined, canonicalUrl?: string | null): string | undefined`
  - `derivePackagesFocusForDestination(dest: { rawUrls?: readonly string[] | null; canonicalUrl?: string | null } | null | undefined): PackagesFocusBucket`

- [ ] **Step 1: Write the failing test**

`src/utils/metrics/__tests__/packages-focus.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  derivePackagesFocusFromUrl,
  derivePackagesFocusForDestination,
  resolvePrimaryRawUrl,
} from "../packages-focus";

function testOneTimeParam() {
  assert.equal(
    derivePackagesFocusFromUrl("https://toolsaustralia.com.au/promotions/makita?packages=one-time"),
    "one-time",
    "packages=one-time must classify as one-time",
  );
  assert.equal(
    derivePackagesFocusFromUrl("https://toolsaustralia.com.au/promotions/makita?utm_source=fb&packages=ONE-TIME "),
    "one-time",
    "value parsing must be case/whitespace tolerant (parseMembershipPackagesTab semantics)",
  );
}

function testMembershipDefault() {
  assert.equal(
    derivePackagesFocusFromUrl("https://toolsaustralia.com.au/promotions/makita"),
    "membership",
    "no packages param = membership (the default)",
  );
  assert.equal(
    derivePackagesFocusFromUrl("https://toolsaustralia.com.au/promotions/makita?packages=membership"),
    "membership",
    "explicit membership value still classifies membership (ads never use it, but must not break)",
  );
  assert.equal(
    derivePackagesFocusFromUrl("https://toolsaustralia.com.au/promotions/makita?packages=bogus"),
    "membership",
    "invalid packages value falls back to membership",
  );
  assert.equal(
    derivePackagesFocusFromUrl("not a url"),
    "membership",
    "unparseable string falls back to membership",
  );
}

function testPrimaryRawUrlResolution() {
  const rawUrls = [
    "https://toolsaustralia.com.au/promotions/ryobi?packages=one-time",
    "https://toolsaustralia.com.au/promotions/ryobi-milwaukee",
  ];
  assert.equal(
    resolvePrimaryRawUrl(rawUrls, "https://toolsaustralia.com.au/promotions/ryobi"),
    rawUrls[0],
    "primary = first rawUrl whose canonicalization matches canonicalUrl",
  );
  assert.equal(
    resolvePrimaryRawUrl(rawUrls, "https://toolsaustralia.com.au/nothing-matches"),
    rawUrls[0],
    "falls back to rawUrls[0] when nothing canonicalizes to canonicalUrl",
  );
  assert.equal(resolvePrimaryRawUrl([], "x"), undefined, "empty rawUrls resolves to undefined");
  assert.equal(resolvePrimaryRawUrl(null, "x"), undefined, "null rawUrls resolves to undefined");
}

function testDestinationClassification() {
  assert.equal(
    derivePackagesFocusForDestination({
      canonicalUrl: "https://toolsaustralia.com.au/promotions/makita",
      rawUrls: ["https://toolsaustralia.com.au/promotions/makita?packages=one-time"],
    }),
    "one-time",
    "resolved destination with one-time primary URL classifies one-time",
  );
  assert.equal(
    derivePackagesFocusForDestination({
      canonicalUrl: "https://toolsaustralia.com.au/promotions/makita",
      rawUrls: ["https://toolsaustralia.com.au/promotions/makita"],
    }),
    "membership",
    "resolved destination without the param classifies membership",
  );
  assert.equal(
    derivePackagesFocusForDestination({
      canonicalUrl: "unknown://meta-ad/1234",
      rawUrls: ["unknown://meta-ad/1234"],
    }),
    "unclassified",
    "unknown:// placeholder destinations are unclassified, never membership",
  );
  assert.equal(derivePackagesFocusForDestination(null), "unclassified", "missing destination doc is unclassified");
  assert.equal(
    derivePackagesFocusForDestination({ canonicalUrl: "https://x.com/a", rawUrls: [] }),
    "unclassified",
    "destination without any raw URL is unclassified",
  );
}

function run() {
  testOneTimeParam();
  testMembershipDefault();
  testPrimaryRawUrlResolution();
  testDestinationClassification();
  console.log("packages-focus tests passed");
}

run();
```

- [ ] **Step 2: Add the npm script and run the test to verify it fails**

In `package.json` scripts (next to the other `test:*` entries):

```json
"test:packages-focus": "tsx src/utils/metrics/__tests__/packages-focus.test.ts",
```

Run: `npm run test:packages-focus`
Expected: FAIL — `Cannot find module '../packages-focus'`.

- [ ] **Step 3: Write the implementation**

`src/utils/metrics/packages-focus.ts`:

```ts
import {
  MEMBERSHIP_PACKAGES_QUERY_PARAM,
  parseMembershipPackagesTab,
} from "@/utils/membership/packagesTabParam";
import { canonicalizeLandingUrl } from "@/utils/meta/canonicalize-landing-url";

/**
 * packagesFocus — which package strategy an ad's landing URL targets.
 *
 * The ads team runs two landing-URL variants (live since early July 2026):
 *   membership-focus (default) — promo URL WITHOUT a `packages` param
 *   one-time-focus            — same URL plus `?packages=one-time`
 *
 * The rule is binary: `packages=one-time` → "one-time"; EVERYTHING else
 * (absent param, invalid value, explicit `?packages=membership`) → "membership".
 * Ads never use `?packages=membership` — the default is expressed by omission
 * (see the docblock in utils/membership/packagesTabParam.ts).
 *
 * "unclassified" is a bucket, not a focus: ads whose destination Meta couldn't
 * resolve (`unknown://meta-ad/<id>`) and pre-feature aggregate rows.
 */
export const PACKAGES_FOCUS_VALUES = ["membership", "one-time"] as const;
export type PackagesFocus = (typeof PACKAGES_FOCUS_VALUES)[number];
export type PackagesFocusBucket = PackagesFocus | "unclassified";

/** Classify one landing URL. Non-URL or non-http input falls back to membership. */
export function derivePackagesFocusFromUrl(url: string): PackagesFocus {
  try {
    const parsed = new URL(url.trim());
    const value = parseMembershipPackagesTab(parsed.searchParams.get(MEMBERSHIP_PACKAGES_QUERY_PARAM));
    return value === "one-time" ? "one-time" : "membership";
  } catch {
    return "membership";
  }
}

/**
 * The ad's PRIMARY landing URL: the first rawUrls entry whose canonicalization
 * equals the stored canonicalUrl (MetaAdDestinationService derives canonicalUrl
 * from rawUrls[0], but match by canonicalization rather than trusting order),
 * falling back to rawUrls[0].
 */
export function resolvePrimaryRawUrl(
  rawUrls: readonly string[] | null | undefined,
  canonicalUrl?: string | null,
): string | undefined {
  if (!rawUrls || rawUrls.length === 0) return undefined;
  if (canonicalUrl) {
    const match = rawUrls.find((u) => canonicalizeLandingUrl(u) === canonicalUrl);
    if (match) return match;
  }
  return rawUrls[0];
}

/**
 * Classify a MetaAdDestination doc (or its lean projection). Unresolved
 * destinations — missing doc, empty rawUrls, or the `unknown://` placeholder —
 * are "unclassified"; a real http(s) primary URL classifies via the binary rule.
 */
export function derivePackagesFocusForDestination(
  dest: { rawUrls?: readonly string[] | null; canonicalUrl?: string | null } | null | undefined,
): PackagesFocusBucket {
  if (!dest) return "unclassified";
  if (dest.canonicalUrl?.startsWith("unknown://")) return "unclassified";
  const primary = resolvePrimaryRawUrl(dest.rawUrls, dest.canonicalUrl);
  if (!primary || !/^https?:\/\//i.test(primary.trim())) return "unclassified";
  return derivePackagesFocusFromUrl(primary);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:packages-focus`
Expected: PASS — `packages-focus tests passed`.

- [ ] **Step 5: Run `npm run type-check`** — expect clean. Record change summary for the final report.

---

### Task 2: Per-focus subtotals in the materialized aggregate

**Files:**
- Modify: `src/models/LandingPageMetricsDaily.ts`
- Modify: `src/services/analytics/SpendByUrlAggregationService.ts` (`recomputeForDateRange` → delegate to a new pure builder; `getAggregatedSpendByUrl` + `getSpendByUrlListFormatted` read the subtotals)
- Test: extend `src/utils/metrics/__tests__/packages-focus.test.ts` — no; instead create `src/services/analytics/__tests__/landing-page-focus-aggregation.test.ts`
- Modify: `package.json` (add `test:landing-page-focus`)

**Interfaces:**
- Consumes: `derivePackagesFocusForDestination`, `PackagesFocus` from Task 1.
- Produces (used by Tasks 3, 4, 6):
  - Model: `ILandingFocusMetrics { spendCents; impressions; clicks; conversions; revenueCents }`, `ILandingPackagesFocusSplit { membership: ILandingFocusMetrics; "one-time": ILandingFocusMetrics }`, field `packagesFocus?: ILandingPackagesFocusSplit` on `ILandingPageMetricsDaily`.
  - Service: exported pure fn `buildLandingPageDailyDocs(params: { adAccountId: string; date: string; computedAt: Date; insights: Array<{ adId: string; spendCents: number; impressions: number; clicks: number; conversions?: number | null; revenueCents?: number | null }>; destByAd: Map<string, { canonicalUrl?: string | null; rawUrls?: string[] | null }> }): LandingPageDailyDoc[]` where `LandingPageDailyDoc` is the plain insert object (existing fields + optional `packagesFocus`).
  - `getAggregatedSpendByUrl` rows gain optional `packagesFocus?: ILandingPackagesFocusSplit` (cents-level sums); `SpendByUrlListRow` gains optional `packagesFocus?: { membership: SpendByUrlFocusTotals; "one-time": SpendByUrlFocusTotals }` with `SpendByUrlFocusTotals { spend; spendCents; revenue; revenueCents; conversions; roas }`.

- [ ] **Step 1: Model — add the optional embedded split (NO key/index change)**

In `src/models/LandingPageMetricsDaily.ts`, extend the interface and schema:

```ts
/** Per-focus slice of a row's totals (same metric set, cents). */
export interface ILandingFocusMetrics {
  spendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenueCents: number;
}

/**
 * membership vs one-time split WITHIN a canonicalUrl row. Needed because
 * canonicalizeLandingUrl strips query strings, so ads landing on
 * `/promotions/x` and `/promotions/x?packages=one-time` share one row.
 * Absent on `unknown://` rows and on rows written before this feature —
 * readers treat those as the "unclassified" bucket.
 */
export interface ILandingPackagesFocusSplit {
  membership: ILandingFocusMetrics;
  "one-time": ILandingFocusMetrics;
}

export interface ILandingPageMetricsDaily extends Document {
  // ...existing fields unchanged...
  packagesFocus?: ILandingPackagesFocusSplit;
}
```

Schema addition (keep `{ _id: false }` on nested schemas so no subdoc ids are minted):

```ts
const FocusMetricsSchema = new Schema<ILandingFocusMetrics>(
  {
    spendCents: { type: Number, required: true, default: 0 },
    impressions: { type: Number, required: true, default: 0 },
    clicks: { type: Number, required: true, default: 0 },
    conversions: { type: Number, required: true, default: 0 },
    revenueCents: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const PackagesFocusSplitSchema = new Schema<ILandingPackagesFocusSplit>(
  {
    membership: { type: FocusMetricsSchema, required: true },
    "one-time": { type: FocusMetricsSchema, required: true },
  },
  { _id: false }
);

// inside LandingPageMetricsDailySchema fields:
    packagesFocus: { type: PackagesFocusSplitSchema, required: false },
```

The unique index `{adAccountId, date, canonicalUrl}` is untouched.

- [ ] **Step 2: Write the failing aggregation test**

`src/services/analytics/__tests__/landing-page-focus-aggregation.test.ts` (pure — no DB):

```ts
import assert from "node:assert/strict";
import { buildLandingPageDailyDocs } from "../SpendByUrlAggregationService";

const AD_ACCOUNT = "act_1";
const DATE = "2026-07-10";
const COMPUTED_AT = new Date("2026-07-11T00:00:00.000Z");

const URL_MAKITA = "https://toolsaustralia.com.au/promotions/makita";

function docs(insights: Parameters<typeof buildLandingPageDailyDocs>[0]["insights"], destByAd: Parameters<typeof buildLandingPageDailyDocs>[0]["destByAd"]) {
  return buildLandingPageDailyDocs({ adAccountId: AD_ACCOUNT, date: DATE, computedAt: COMPUTED_AT, insights, destByAd });
}

function testMixedFocusSameUrlRow() {
  // Two ads → same canonicalUrl, different focus (the reason the subdoc exists).
  const insights = [
    { adId: "a1", spendCents: 1000, impressions: 10, clicks: 2, conversions: 1, revenueCents: 5000 },
    { adId: "a2", spendCents: 300, impressions: 5, clicks: 1, conversions: 0, revenueCents: 0 },
  ];
  const destByAd = new Map([
    ["a1", { canonicalUrl: URL_MAKITA, rawUrls: [`${URL_MAKITA}?packages=one-time`] }],
    ["a2", { canonicalUrl: URL_MAKITA, rawUrls: [URL_MAKITA] }],
  ]);
  const out = docs(insights, destByAd);
  assert.equal(out.length, 1, "both ads share one canonicalUrl row");
  const row = out[0];
  assert.equal(row.canonicalUrl, URL_MAKITA);
  assert.equal(row.spendCents, 1300, "row totals unchanged by the split");
  assert.ok(row.packagesFocus, "resolved row carries the packagesFocus split");
  assert.equal(row.packagesFocus!["one-time"].spendCents, 1000);
  assert.equal(row.packagesFocus!.membership.spendCents, 300);
  assert.equal(
    row.packagesFocus!.membership.spendCents + row.packagesFocus!["one-time"].spendCents,
    row.spendCents,
    "focus subtotals must sum to row totals",
  );
  assert.equal(row.packagesFocus!["one-time"].revenueCents, 5000);
  assert.equal(row.packagesFocus!.membership.conversions, 0);
}

function testUnknownDestinationRowHasNoSplit() {
  const insights = [{ adId: "a9", spendCents: 700, impressions: 3, clicks: 1, conversions: 0, revenueCents: 0 }];
  // Meta couldn't resolve the creative → dest doc carries the unknown:// placeholder.
  const destByAd = new Map([["a9", { canonicalUrl: "unknown://meta-ad/a9", rawUrls: ["unknown://meta-ad/a9"] }]]);
  const out = docs(insights, destByAd);
  assert.equal(out.length, 1);
  assert.equal(out[0].canonicalUrl, "unknown://meta-ad/a9");
  assert.equal(out[0].packagesFocus, undefined, "unknown:// rows get NO split — they are the unclassified bucket");
}

function testMissingDestinationDoc() {
  // No dest doc at all (Graph API errored) — aggregation buckets under unknown:// itself.
  const insights = [{ adId: "a5", spendCents: 200, impressions: 1, clicks: 0, conversions: 0, revenueCents: 0 }];
  const out = docs(insights, new Map());
  assert.equal(out[0].canonicalUrl, "unknown://meta-ad/a5");
  assert.equal(out[0].packagesFocus, undefined);
}

function run() {
  testMixedFocusSameUrlRow();
  testUnknownDestinationRowHasNoSplit();
  testMissingDestinationDoc();
  console.log("landing-page focus aggregation tests passed");
}

run();
```

Add to `package.json`:

```json
"test:landing-page-focus": "tsx src/services/analytics/__tests__/landing-page-focus-aggregation.test.ts",
```

Run: `npm run test:landing-page-focus`
Expected: FAIL — `buildLandingPageDailyDocs` is not exported.

- [ ] **Step 3: Refactor `recomputeForDateRange` around a pure exported builder**

In `src/services/analytics/SpendByUrlAggregationService.ts` add (top-level exports, above the class):

```ts
import {
  derivePackagesFocusForDestination,
  type PackagesFocus,
} from "@/utils/metrics/packages-focus";
import type { ILandingPackagesFocusSplit } from "@/models/LandingPageMetricsDaily";

type FocusAccumulator = ILandingPackagesFocusSplit;

function emptyFocusMetrics() {
  return { spendCents: 0, impressions: 0, clicks: 0, conversions: 0, revenueCents: 0 };
}

export interface LandingPageDailyDoc {
  adAccountId: string;
  date: string;
  canonicalUrl: string;
  spendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenueCents: number;
  adIds: string[];
  packagesFocus?: ILandingPackagesFocusSplit;
  computedAt: Date;
}

/**
 * Pure per-day aggregation: insights × destinations → LandingPageMetricsDaily docs.
 * Extracted from recomputeForDateRange so the focus-split math is unit-testable
 * without Mongo. Row totals are accumulated exactly as before; additionally each
 * RESOLVED row carries a packagesFocus split (membership vs one-time per ad,
 * classified from the ad's primary raw URL). unknown:// rows get no split —
 * readers treat them as the "unclassified" bucket.
 */
export function buildLandingPageDailyDocs(params: {
  adAccountId: string;
  date: string;
  computedAt: Date;
  insights: Array<{
    adId: string;
    spendCents: number;
    impressions: number;
    clicks: number;
    conversions?: number | null;
    revenueCents?: number | null;
  }>;
  destByAd: Map<string, { canonicalUrl?: string | null; rawUrls?: string[] | null }>;
}): LandingPageDailyDoc[] {
  const agg = new Map<
    string,
    {
      spendCents: number;
      impressions: number;
      clicks: number;
      conversions: number;
      revenueCents: number;
      adIds: Set<string>;
      focus?: FocusAccumulator;
    }
  >();

  for (const row of params.insights) {
    const dest = params.destByAd.get(row.adId);
    const canonicalUrl = dest?.canonicalUrl ?? `unknown://meta-ad/${row.adId}`;

    const cur =
      agg.get(canonicalUrl) ?? {
        spendCents: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        revenueCents: 0,
        adIds: new Set<string>(),
      };

    cur.spendCents += row.spendCents;
    cur.impressions += row.impressions;
    cur.clicks += row.clicks;
    cur.conversions += row.conversions ?? 0;
    cur.revenueCents += row.revenueCents ?? 0;
    cur.adIds.add(row.adId);

    const bucket = derivePackagesFocusForDestination(dest);
    if (bucket !== "unclassified") {
      cur.focus ??= { membership: emptyFocusMetrics(), "one-time": emptyFocusMetrics() };
      const slice = cur.focus[bucket as PackagesFocus];
      slice.spendCents += row.spendCents;
      slice.impressions += row.impressions;
      slice.clicks += row.clicks;
      slice.conversions += row.conversions ?? 0;
      slice.revenueCents += row.revenueCents ?? 0;
    }

    agg.set(canonicalUrl, cur);
  }

  return [...agg.entries()].map(([canonicalUrl, v]) => ({
    adAccountId: params.adAccountId,
    date: params.date,
    canonicalUrl,
    spendCents: v.spendCents,
    impressions: v.impressions,
    clicks: v.clicks,
    conversions: v.conversions,
    revenueCents: v.revenueCents,
    adIds: [...v.adIds],
    ...(v.focus ? { packagesFocus: v.focus } : {}),
    computedAt: params.computedAt,
  }));
}
```

Then replace the inline aggregation body inside `recomputeForDateRange` (the `const agg = new Map…` block through `const docs = […]`) with:

```ts
      const docs = buildLandingPageDailyDocs({
        adAccountId,
        date,
        computedAt: new Date(),
        insights: insights.map((i) => ({
          adId: i.adId,
          spendCents: i.spendCents,
          impressions: i.impressions,
          clicks: i.clicks,
          conversions: i.conversions,
          revenueCents: i.revenueCents,
        })),
        destByAd: new Map(dests.map((d) => [d.adId, { canonicalUrl: d.canonicalUrl, rawUrls: d.rawUrls }])),
      });
```

(keep the surrounding `deleteMany` + `insertMany` + progress logging exactly as they are).

- [ ] **Step 4: Run tests**

Run: `npm run test:landing-page-focus` → PASS.
Run: `npm run test:packages-focus` → still PASS.

- [ ] **Step 5: Read side — sum the split across days**

In `getAggregatedSpendByUrl`, extend the per-URL accumulator with an optional focus accumulator, summed the same way (only when `row.packagesFocus` exists):

```ts
      // inside the for (const row of daily) loop, after the existing sums:
      if (row.packagesFocus) {
        cur.focus ??= { membership: emptyFocusMetrics(), "one-time": emptyFocusMetrics() };
        for (const key of ["membership", "one-time"] as const) {
          const s = row.packagesFocus[key];
          cur.focus[key].spendCents += s.spendCents;
          cur.focus[key].impressions += s.impressions;
          cur.focus[key].clicks += s.clicks;
          cur.focus[key].conversions += s.conversions;
          cur.focus[key].revenueCents += s.revenueCents;
        }
      }
```

and include `...(v.focus ? { packagesFocus: v.focus } : {})` in the returned objects (extend the method's return type with `packagesFocus?: ILandingPackagesFocusSplit`).

- [ ] **Step 6: Formatted list rows — dollars**

In the service, extend `SpendByUrlListRow`:

```ts
export interface SpendByUrlFocusTotals {
  spend: number;          // AUD dollars
  spendCents: number;
  revenue: number;        // AUD dollars
  revenueCents: number;
  conversions: number;
  roas: number;           // ratio; 0 when spend is 0
}

export interface SpendByUrlListRow {
  // ...existing fields...
  /** membership vs one-time split of this row; absent = row predates the split or is unknown:// (unclassified) */
  packagesFocus?: {
    membership: SpendByUrlFocusTotals;
    "one-time": SpendByUrlFocusTotals;
  };
}
```

and in `getSpendByUrlListFormatted`'s row mapping add:

```ts
        const formatFocus = (m: { spendCents: number; revenueCents: number; conversions: number }) => {
          const fSpend = centsToAud(m.spendCents);
          const fRevenue = centsToAud(m.revenueCents);
          return {
            spend: fSpend,
            spendCents: m.spendCents,
            revenue: fRevenue,
            revenueCents: m.revenueCents,
            conversions: m.conversions,
            roas: fSpend > 0 ? fRevenue / fSpend : 0,
          };
        };
        // in the returned object:
        ...(r.packagesFocus
          ? {
              packagesFocus: {
                membership: formatFocus(r.packagesFocus.membership),
                "one-time": formatFocus(r.packagesFocus["one-time"]),
              },
            }
          : {}),
```

- [ ] **Step 7: Verify** — `npm run type-check` clean; both test scripts pass. Record change summary.

> **Norm note:** the list response gained an OPTIONAL field — the Norm list schema is updated in Task 6 together with the detail changes (one lockstep pass). Until Task 6 lands, `withNorm`'s runtime validation would strip/fail unknown keys — do NOT pause between Tasks 2 and 6 in a deployed state; in this working tree it's fine.

---

### Task 3: Backfill ops script (rebuild the remaining insights window)

**Files:**
- Create: `scripts/backfill-packages-focus-aggregates.ts`
- Modify: `package.json` (`backfill:packages-focus` + `:dry`)

**Interfaces:**
- Consumes: `SpendByUrlAggregationService.recomputeForDateRange` (idempotent per-day delete+rewrite), models `MetaAdInsightsDaily`, `LandingPageMetricsDaily`.
- Produces: a one-off, re-runnable script; DJ runs `npm run backfill:packages-focus:dry` then the live variant.

- [ ] **Step 1: Write the script** (conventions from `scripts/backfill-converting-platform.ts`: dotenv `.env.local` → dynamic imports → up-front denominator → ~20 progress lines → summary → exit tiers 0/2/3/1):

```ts
#!/usr/bin/env npx tsx
/**
 * Rebuild LandingPageMetricsDaily for every date still covered by MetaAdInsightsDaily
 * (~60-day TTL window) so each resolved row gains the packagesFocus split
 * (membership vs one-time, derived from MetaAdDestination.rawUrls). Row totals are
 * recomputed by the SAME idempotent per-day delete+rewrite the crons use — this
 * script just widens the window once. Dates older than the insights TTL keep their
 * existing rows (no split → read as "unclassified").
 *
 * Safe to re-run: recompute is deterministic from source collections.
 *
 * Usage:
 *   npx tsx scripts/backfill-packages-focus-aggregates.ts [--dry-run] [--since=YYYY-MM-DD]
 *   --dry-run     Report the dates + row counts that WOULD be rebuilt; write nothing.
 *   --since=DATE  Override the window start (default: oldest MetaAdInsightsDaily date).
 *
 * Exit: 0 clean · 2 per-date errors · 3 outer/fatal · 1 unhandled.
 * Env: .env.local must have MONGODB_URI + FACEBOOK_AD_ACCOUNT_ID.
 * @module scripts/backfill-packages-focus-aggregates
 */
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = process.argv.includes("--dry-run");
const SINCE_ARG = process.argv.find((a) => a.startsWith("--since="));
const SINCE_OVERRIDE = SINCE_ARG ? SINCE_ARG.split("=")[1] : null;

function formatDuration(ms: number): string {
  const t = Math.round(ms / 1000), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

async function main() {
  const connectDB = (await import("../src/lib/mongodb")).default;
  const MetaAdInsightsDaily = (await import("../src/models/MetaAdInsightsDaily")).default;
  const LandingPageMetricsDaily = (await import("../src/models/LandingPageMetricsDaily")).default;
  const { SpendByUrlAggregationService } = await import("../src/services/analytics/SpendByUrlAggregationService");

  const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
  if (!adAccountId) {
    console.error("FACEBOOK_AD_ACCOUNT_ID is not set in .env.local — aborting.");
    process.exit(3);
  }

  await connectDB();

  console.log(`Packages-focus aggregate backfill ${DRY_RUN ? "(DRY RUN)" : "(LIVE)"}`);
  console.log(`  Ad account: ${adAccountId}\n`);

  // Window = every date the source collection still holds (TTL-bounded).
  const dates: string[] = (await MetaAdInsightsDaily.distinct("date", { adAccountId })).sort();
  const windowDates = SINCE_OVERRIDE ? dates.filter((d) => d >= SINCE_OVERRIDE) : dates;

  if (windowDates.length === 0) {
    console.log("No MetaAdInsightsDaily dates found — nothing to rebuild.");
    process.exit(0);
  }

  console.log(
    `  To process: ${windowDates.length} dates (${windowDates[0]} → ${windowDates[windowDates.length - 1]})\n`,
  );

  const startMs = Date.now();

  if (DRY_RUN) {
    // Read-only pass: per-date insight/current-aggregate counts, ~20 lines.
    const every = Math.max(1, Math.floor(windowDates.length / 20));
    let insightTotal = 0;
    for (let i = 0; i < windowDates.length; i++) {
      const date = windowDates[i];
      const insightCount = await MetaAdInsightsDaily.countDocuments({ adAccountId, date });
      insightTotal += insightCount;
      if (i % every === 0 || i === windowDates.length - 1) {
        const existing = await LandingPageMetricsDaily.countDocuments({ adAccountId, date });
        console.log(
          `  [dry] ${date}: ${insightCount} insight rows → would rewrite ${existing} aggregate rows (${i + 1}/${windowDates.length})`,
        );
      }
    }
    console.log(`\nSummary\n=======`);
    console.log(`  Mode:    DRY RUN (nothing written)`);
    console.log(`  Dates:   ${windowDates.length} · insight rows: ${insightTotal.toLocaleString()}`);
    console.log(`  Elapsed: ${formatDuration(Date.now() - startMs)}`);
    console.log(`  Next:    npm run backfill:packages-focus`);
  } else {
    const service = new SpendByUrlAggregationService();
    let errored = 0;
    // recomputeForDateRange already emits adaptive per-day progress via onProgress.
    try {
      const result = await service.recomputeForDateRange(
        adAccountId,
        windowDates[0],
        windowDates[windowDates.length - 1],
        { onProgress: (m) => console.log(`  ${m}`) },
      );
      console.log(`\nSummary\n=======`);
      console.log(`  Mode:      LIVE`);
      console.log(`  Dates:     ${result.datesProcessed} · rows written: ${result.rowsWritten.toLocaleString()}`);
      console.log(`  Elapsed:   ${formatDuration(Date.now() - startMs)}`);
    } catch (e) {
      errored++;
      console.error("  Recompute failed:", e);
    }
    if (errored > 0) {
      const mongoose = (await import("mongoose")).default;
      await mongoose.disconnect().catch(() => {});
      process.exit(2);
    }
  }

  const mongoose = (await import("mongoose")).default;
  await mongoose.disconnect().catch(() => {});
  process.exit(0);
}

main().catch((err) => {
  console.error("\n🚨 Backfill aborted with unhandled error:", err);
  process.exit(1);
});
```

- [ ] **Step 2: package.json entries** (next to the other backfill pairs):

```json
"backfill:packages-focus": "tsx scripts/backfill-packages-focus-aggregates.ts",
"backfill:packages-focus:dry": "tsx scripts/backfill-packages-focus-aggregates.ts --dry-run",
```

- [ ] **Step 3: Verify** — `npm run type-check` clean. Run `npm run backfill:packages-focus:dry` against the configured `.env.local` DB (staging) and confirm it prints dates + counts and exits 0. Do NOT run the live variant unless DJ asks — record in the change summary that live backfill is pending DJ's go-ahead (it's safe/idempotent, but it writes).

---

### Task 4: `PackagesFocusBreakdownService` + admin route

**Files:**
- Create: `src/services/analytics/PackagesFocusBreakdownService.ts`
- Create: `src/app/api/admin/analytics/packages-focus/route.ts`

**Interfaces:**
- Consumes: models `LandingPageMetricsDaily`, `MetaAdInsightsDaily`, `MetaAdDestination`; Task 1 util; Task 2 model types.
- Produces (consumed by Task 5 Norm route, Task 7 hook, Task 8 modal):

```ts
export type AdsPlatform = "meta" | "tiktok";
export interface PackagesFocusTotals {
  spend: number; spendCents: number; revenue: number; revenueCents: number;
  roas: number; conversions: number; impressions: number; clicks: number;
}
export interface PackagesFocusAdNode {
  adId: string; adName?: string;
  adFormat: "video" | "static" | "carousel" | "unknown";
  totals: PackagesFocusTotals;
}
export interface PackagesFocusAdsetNode {
  adsetId: string; adsetName?: string; totals: PackagesFocusTotals; ads: PackagesFocusAdNode[];
}
export interface PackagesFocusCampaignNode {
  campaignId: string; campaignName?: string; totals: PackagesFocusTotals; adsets: PackagesFocusAdsetNode[];
}
export interface PackagesFocusBreakdownResult {
  platform: AdsPlatform;
  supported: boolean;                       // tiktok → false until its URL mapping ships
  reason?: "awaiting-url-mapping";
  meta: { startDate: string; endDate: string; currency: "AUD"; adAccountId: string };
  summary: {                                 // aggregate-backed: works for ANY range
    membership: PackagesFocusTotals;
    "one-time": PackagesFocusTotals;
    unclassified: PackagesFocusTotals;
    total: PackagesFocusTotals;
  };
  detail: {                                  // live-join-backed: ~60d (insights TTL)
    complete: boolean;                       // false when range start predates oldest insights
    availableSince: string | null;           // oldest insights date actually covered
    buckets: {
      membership: PackagesFocusCampaignNode[];
      "one-time": PackagesFocusCampaignNode[];
      unclassified: PackagesFocusCampaignNode[];
    };
  };
}
// class PackagesFocusBreakdownService {
//   async getBreakdownFormatted(platform: AdsPlatform, adAccountId: string, startDate: string, endDate: string): Promise<PackagesFocusBreakdownResult>
// }
```

- [ ] **Step 1: Write the service** — `src/services/analytics/PackagesFocusBreakdownService.ts`:

```ts
import MetaAdInsightsDaily from "@/models/MetaAdInsightsDaily";
import MetaAdDestination from "@/models/MetaAdDestination";
import LandingPageMetricsDaily from "@/models/LandingPageMetricsDaily";
import {
  derivePackagesFocusForDestination,
  type PackagesFocusBucket,
} from "@/utils/metrics/packages-focus";

// [paste the exported types from the Interfaces block above]

function centsToAud(cents: number): number {
  return Math.round(cents) / 100;
}

interface CentsAcc {
  spendCents: number; revenueCents: number; conversions: number; impressions: number; clicks: number;
}
const emptyAcc = (): CentsAcc => ({ spendCents: 0, revenueCents: 0, conversions: 0, impressions: 0, clicks: 0 });

function addTo(acc: CentsAcc, row: { spendCents: number; revenueCents?: number | null; conversions?: number | null; impressions?: number; clicks?: number }) {
  acc.spendCents += row.spendCents;
  acc.revenueCents += row.revenueCents ?? 0;
  acc.conversions += row.conversions ?? 0;
  acc.impressions += row.impressions ?? 0;
  acc.clicks += row.clicks ?? 0;
}

function formatTotals(acc: CentsAcc): PackagesFocusTotals {
  const spend = centsToAud(acc.spendCents);
  const revenue = centsToAud(acc.revenueCents);
  return {
    spend, spendCents: acc.spendCents, revenue, revenueCents: acc.revenueCents,
    roas: spend > 0 ? revenue / spend : 0,
    conversions: acc.conversions, impressions: acc.impressions, clicks: acc.clicks,
  };
}

/**
 * membership vs one-time vs unclassified breakdown of Meta ad spend/ROAS.
 *
 * summary — sums LandingPageMetricsDaily rows (permanent, survives the per-ad
 *   insights TTL): rows with a packagesFocus split contribute per-focus; rows
 *   without one (unknown:// placeholders + pre-feature rows) → unclassified.
 * detail — live MetaAdInsightsDaily × MetaAdDestination join grouped
 *   focus → campaign → adset → ad; only covers dates the insights collection
 *   still holds (~60d prod TTL), flagged via complete/availableSince.
 *
 * platform is a first-class discriminator: "tiktok" short-circuits to an
 * explicit unsupported payload until a TikTok ad→URL destination resolver
 * ships (TikTokAdInsightsDaily has no landing-URL concept today).
 */
export class PackagesFocusBreakdownService {
  async getBreakdownFormatted(
    platform: AdsPlatform,
    adAccountId: string,
    startDate: string,
    endDate: string,
  ): Promise<PackagesFocusBreakdownResult> {
    const meta = { startDate, endDate, currency: "AUD" as const, adAccountId };
    const emptySummary = () => ({
      membership: formatTotals(emptyAcc()),
      "one-time": formatTotals(emptyAcc()),
      unclassified: formatTotals(emptyAcc()),
      total: formatTotals(emptyAcc()),
    });

    if (platform === "tiktok") {
      return {
        platform, supported: false, reason: "awaiting-url-mapping",
        meta: { ...meta, adAccountId: "" },
        summary: emptySummary(),
        detail: { complete: false, availableSince: null, buckets: { membership: [], "one-time": [], unclassified: [] } },
      };
    }

    const [summary, detail] = await Promise.all([
      this.buildSummary(adAccountId, startDate, endDate),
      this.buildDetail(adAccountId, startDate, endDate),
    ]);
    return { platform, supported: true, meta, summary, detail };
  }

  private async buildSummary(adAccountId: string, since: string, until: string) {
    const rows = await LandingPageMetricsDaily.find({ adAccountId, date: { $gte: since, $lte: until } }).lean();
    const acc = { membership: emptyAcc(), "one-time": emptyAcc(), unclassified: emptyAcc(), total: emptyAcc() };
    for (const row of rows) {
      addTo(acc.total, row);
      if (row.packagesFocus) {
        addTo(acc.membership, row.packagesFocus.membership);
        addTo(acc["one-time"], row.packagesFocus["one-time"]);
        // Guard: any residue between the row total and its split (should be 0 by
        // construction) counts as unclassified rather than silently vanishing.
        const splitSpend = row.packagesFocus.membership.spendCents + row.packagesFocus["one-time"].spendCents;
        if (row.spendCents - splitSpend > 0.5) {
          acc.unclassified.spendCents += row.spendCents - splitSpend;
        }
      } else {
        addTo(acc.unclassified, row);
      }
    }
    return {
      membership: formatTotals(acc.membership),
      "one-time": formatTotals(acc["one-time"]),
      unclassified: formatTotals(acc.unclassified),
      total: formatTotals(acc.total),
    };
  }

  private async buildDetail(adAccountId: string, since: string, until: string) {
    const insights = await MetaAdInsightsDaily.find({ adAccountId, date: { $gte: since, $lte: until } }).lean();
    const oldestOverall: string | null =
      insights.length > 0 ? insights.reduce((min, r) => (r.date < min ? r.date : min), insights[0].date) : null;
    const availableSince = oldestOverall;
    const complete = availableSince !== null && availableSince <= since;

    if (insights.length === 0) {
      return { complete: false, availableSince: null, buckets: { membership: [], "one-time": [], unclassified: [] } };
    }

    const adIds = [...new Set(insights.map((i) => i.adId))];
    const dests = await MetaAdDestination.find({ adId: { $in: adIds } }).lean();
    const destByAd = new Map(dests.map((d) => [d.adId, d]));

    type AdAcc = { adName?: string; adFormat: PackagesFocusAdNode["adFormat"]; acc: CentsAcc };
    type AdsetAcc = { adsetName?: string; acc: CentsAcc; ads: Map<string, AdAcc> };
    type CampaignAcc = { campaignName?: string; acc: CentsAcc; adsets: Map<string, AdsetAcc> };
    const buckets: Record<PackagesFocusBucket, Map<string, CampaignAcc>> = {
      membership: new Map(), "one-time": new Map(), unclassified: new Map(),
    };

    for (const row of insights) {
      const dest = destByAd.get(row.adId);
      const bucket = derivePackagesFocusForDestination(dest);
      const campaignId = row.campaignId ?? "unknown-campaign";
      const adsetId = row.adsetId ?? "unknown-adset";

      const campaigns = buckets[bucket];
      const campaign = campaigns.get(campaignId) ?? { campaignName: undefined, acc: emptyAcc(), adsets: new Map() };
      campaign.campaignName = row.campaignName ?? campaign.campaignName;
      addTo(campaign.acc, row);

      const adset = campaign.adsets.get(adsetId) ?? { adsetName: undefined, acc: emptyAcc(), ads: new Map() };
      adset.adsetName = row.adsetName ?? adset.adsetName;
      addTo(adset.acc, row);

      const rawFormat = dest?.adFormat;
      const adFormat: PackagesFocusAdNode["adFormat"] =
        rawFormat === "video" || rawFormat === "static" || rawFormat === "carousel" ? rawFormat : "unknown";
      const ad = adset.ads.get(row.adId) ?? { adName: undefined, adFormat, acc: emptyAcc() };
      ad.adName = row.adName ?? ad.adName;
      addTo(ad.acc, row);

      adset.ads.set(row.adId, ad);
      campaign.adsets.set(adsetId, adset);
      campaigns.set(campaignId, campaign);
    }

    const toNodes = (campaigns: Map<string, CampaignAcc>): PackagesFocusCampaignNode[] =>
      [...campaigns.entries()]
        .map(([campaignId, c]) => ({
          campaignId,
          campaignName: c.campaignName,
          totals: formatTotals(c.acc),
          adsets: [...c.adsets.entries()]
            .map(([adsetId, s]) => ({
              adsetId,
              adsetName: s.adsetName,
              totals: formatTotals(s.acc),
              ads: [...s.ads.entries()]
                .map(([adId, a]) => ({ adId, adName: a.adName, adFormat: a.adFormat, totals: formatTotals(a.acc) }))
                .sort((a, b) => b.totals.spendCents - a.totals.spendCents),
            }))
            .sort((a, b) => b.totals.spendCents - a.totals.spendCents),
        }))
        .sort((a, b) => b.totals.spendCents - a.totals.spendCents);

    return {
      complete,
      availableSince,
      buckets: {
        membership: toNodes(buckets.membership),
        "one-time": toNodes(buckets["one-time"]),
        unclassified: toNodes(buckets.unclassified),
      },
    };
  }
}
```

- [ ] **Step 2: Write the admin route** — `src/app/api/admin/analytics/packages-focus/route.ts` (matches the spend-by-url sibling pattern exactly):

```ts
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { PackagesFocusBreakdownService } from "@/services/analytics/PackagesFocusBreakdownService";

export const dynamic = "force-dynamic";

const breakdownService = new PackagesFocusBreakdownService();

/**
 * GET /api/admin/analytics/packages-focus?startDate=&endDate=&platform=meta
 * Membership vs one-time landing-URL split of ad spend/ROAS: summary (materialized,
 * any range) + campaign→adset→ad detail (live insights join, ~60d). platform=tiktok
 * returns an explicit unsupported payload until its URL mapping ships.
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requirePermission("facebookAds.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const platformParam = searchParams.get("platform") ?? "meta";

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: "startDate and endDate are required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }
    if (platformParam !== "meta" && platformParam !== "tiktok") {
      return NextResponse.json(
        { success: false, error: "platform must be 'meta' or 'tiktok'" },
        { status: 400 }
      );
    }

    const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
    if (platformParam === "meta" && !adAccountId) {
      return NextResponse.json(
        { success: false, error: "FACEBOOK_AD_ACCOUNT_ID not configured" },
        { status: 500 }
      );
    }

    const result = await breakdownService.getBreakdownFormatted(
      platformParam,
      adAccountId ?? "",
      startDate,
      endDate
    );

    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("packages-focus GET:", e);
    return NextResponse.json({ success: false, error: "Failed to load packages-focus breakdown" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify** — `npm run type-check` clean. Record change summary.

---

### Task 5: Norm mirror for `analytics.packages-focus`

**Files:**
- Modify: `src/lib/internal-norm/schemas/analytics-spend.ts` (add `NormAnalyticsPackagesFocusSchema`)
- Modify: `src/lib/internal-norm/classification.ts` (registry entry)
- Create: `src/app/api/internal/norm/v1/analytics/packages-focus/route.ts`
- Modify: `docs/internal-norm/norm-context.md` (new endpoint section + changelog line)
- Regenerate: `src/generated/normToolsManifest.json` via `npm run build:norm-manifest`

**Interfaces:**
- Consumes: `PackagesFocusBreakdownService` (Task 4) — the Norm route MUST import it (eslint `norm-must-import-service`).
- Produces: Norm-callable `GET /v1/analytics/packages-focus`.

- [ ] **Step 1: Schema** — append to `src/lib/internal-norm/schemas/analytics-spend.ts` (match the file's comment style):

```ts
// ─── packages-focus breakdown ────────────────────────────────────────────────
//
// membership vs one-time landing-URL split of Meta ad spend. summary reads the
// materialized LandingPageMetricsDaily focus subtotals (any range); detail is a
// live MetaAdInsightsDaily × MetaAdDestination join (bounded by the ~60d
// insights TTL — `complete`/`availableSince` flag partial coverage). Pure ad
// metrics — no PII.

const PackagesFocusTotalsSchema = z.object({
  spend: z.number(),                           // AUD dollars
  spendCents: z.number(),                      // may carry fractional cents (Meta upstream)
  revenue: z.number(),                         // AUD dollars (Meta-reported action_values)
  revenueCents: z.number(),
  roas: z.number(),                            // ratio; 0 when spend is 0
  conversions: z.number(),
  impressions: z.number(),
  clicks: z.number(),
});

const PackagesFocusAdNodeSchema = z.object({
  adId: z.string(),
  adName: z.string().optional(),
  adFormat: z.enum(["video", "static", "carousel", "unknown"]),
  totals: PackagesFocusTotalsSchema,
});

const PackagesFocusAdsetNodeSchema = z.object({
  adsetId: z.string(),
  adsetName: z.string().optional(),
  totals: PackagesFocusTotalsSchema,
  ads: z.array(PackagesFocusAdNodeSchema),
});

const PackagesFocusCampaignNodeSchema = z.object({
  campaignId: z.string(),
  campaignName: z.string().optional(),
  totals: PackagesFocusTotalsSchema,
  adsets: z.array(PackagesFocusAdsetNodeSchema),
});

export const NormAnalyticsPackagesFocusSchema = z.object({
  platform: z.enum(["meta", "tiktok"]),
  supported: z.boolean(),                      // tiktok → false until its ad→URL resolver ships
  reason: z.literal("awaiting-url-mapping").optional(),
  meta: z.object({
    startDate: z.string(),                     // YYYY-MM-DD
    endDate: z.string(),                       // YYYY-MM-DD
    currency: z.literal("AUD"),
    adAccountId: z.string(),                   // "" for tiktok (no account concept yet)
  }),
  summary: z.object({
    membership: PackagesFocusTotalsSchema,
    "one-time": PackagesFocusTotalsSchema,
    unclassified: PackagesFocusTotalsSchema,   // unknown:// destinations + pre-feature aggregate rows
    total: PackagesFocusTotalsSchema,
  }),
  detail: z.object({
    complete: z.boolean(),
    availableSince: z.string().nullable(),     // oldest insights date covered; null = none in range
    buckets: z.object({
      membership: z.array(PackagesFocusCampaignNodeSchema),
      "one-time": z.array(PackagesFocusCampaignNodeSchema),
      unclassified: z.array(PackagesFocusCampaignNodeSchema),
    }),
  }),
});
```

- [ ] **Step 2: Registry entry** — in `src/lib/internal-norm/classification.ts`, import the new schema alongside the existing `analytics-spend` imports and add after `"analytics.spend-by-url.sync"`:

```ts
  "analytics.packages-focus": {
    tier: "read",
    requiredPermission: "facebookAds.view",
    path: "/v1/analytics/packages-focus",
    method: "GET",
    summary:
      "Membership vs one-time landing-URL split of Meta ad spend/ROAS: bucket summary (materialized, any range) + campaign→adset→ad detail (live join, ~60-day insights window). platform=tiktok returns supported:false until its URL mapping ships.",
    rateLimit: { perMinute: 10 },
    responseSchema: NormAnalyticsPackagesFocusSchema,
  },
```

- [ ] **Step 3: Norm route** — `src/app/api/internal/norm/v1/analytics/packages-focus/route.ts`:

```ts
import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormAnalyticsPackagesFocusSchema } from "@/lib/internal-norm/schemas/analytics-spend";
import { PackagesFocusBreakdownService } from "@/services/analytics/PackagesFocusBreakdownService";

const QuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be YYYY-MM-DD"),
  platform: z.enum(["meta", "tiktok"]).default("meta"),
});

const breakdownService = new PackagesFocusBreakdownService();

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "analytics.packages-focus",
    requiredPermission: "facebookAds.view",
    responseSchema: NormAnalyticsPackagesFocusSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }

    const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
    if (parsed.data.platform === "meta" && !adAccountId) {
      return ctx.error(500, "misconfigured", "FACEBOOK_AD_ACCOUNT_ID not configured");
    }

    const result = await breakdownService.getBreakdownFormatted(
      parsed.data.platform,
      adAccountId ?? "",
      parsed.data.startDate,
      parsed.data.endDate,
    );
    return ctx.ok(result);
  },
);
```

- [ ] **Step 4: Regenerate manifest** — Run: `npm run build:norm-manifest`. Expected: `✓ wrote N endpoints` with N one higher than before; `git diff src/generated/normToolsManifest.json` shows the new `analytics.packages-focus` row.

- [ ] **Step 5: norm-context.md** — add a section following the exact template of the spend-by-url sections (heading, **Returns** with a ```ts shape block mirroring the schema incl. inline comments, **Inputs** table with startDate/endDate/platform rows, **Data source** naming `LandingPageMetricsDaily` + `MetaAdInsightsDaily`×`MetaAdDestination` and `PackagesFocusBreakdownService.getBreakdownFormatted` in `src/services/analytics/PackagesFocusBreakdownService.ts`, **Constraints**: read tier, `facebookAds.view`, 10/min, `500 misconfigured` without `FACEBOOK_AD_ACCOUNT_ID`, detail bounded by insights TTL with `complete`/`availableSince`). Update the wired-surface count and add a changelog line.

- [ ] **Step 6: Verify** — `npm run type-check` + `npm run lint` clean (lint proves the Norm route's service import satisfies `norm-must-import-service`). Run `npm run norm:smoke`; if it requires a running server/HMAC env not available locally, record its exact output honestly in the change summary rather than claiming success.

---

### Task 6: Extend spend-by-url detail + list shapes (service → hook types → Norm schemas)

**Files:**
- Modify: `src/services/analytics/SpendByUrlAggregationService.ts` (detail rows gain campaign/adset/focus)
- Modify: `src/hooks/queries/useSpendByUrlAnalytics.ts` (mirror the new fields on `SpendByUrlRow` + `SpendByUrlDetailRow`)
- Modify: `src/lib/internal-norm/schemas/analytics-spend.ts` (additive fields on list+detail schemas)
- Modify: `docs/internal-norm/norm-context.md` (both sections' Returns blocks)

**Interfaces:**
- Consumes: Task 1 util, Task 2 list-row focus subtotals.
- Produces (consumed by Tasks 9, 10):
  - `SpendByUrlDetailRow` (service AND hook) gains: `campaignId?: string; campaignName?: string; adsetId?: string; adsetName?: string; packagesFocus: "membership" | "one-time" | "unclassified"`.
  - Hook `SpendByUrlRow` gains the optional `packagesFocus` split from Task 2 (same shape: `{ membership, "one-time" }` of `{ spend; spendCents; revenue; revenueCents; conversions; roas }`).

- [ ] **Step 1: Service detail rows.** In `getSpendByUrlDetailForCanonicalUrls`:
  - Extend `mergedDestByAd` to carry what focus derivation needs: `mergedDestByAd.set(id, { adFormat: doc.adFormat, canonicalUrl: doc.canonicalUrl, rawUrls: doc.rawUrls })` (type the map value `{ adFormat?: string; canonicalUrl?: string | null; rawUrls?: string[] | null }`; also update `collectAdIdsAndDestsForCanonicalUrl`'s consumers accordingly — the dest docs it already loads contain these fields).
  - Extend the per-ad accumulator with `campaignId?/campaignName?/adsetId?/adsetName?` filled latest-non-null-wins from the insights rows (they're denormalized per row): `cur.campaignId = row.campaignId ?? cur.campaignId;` etc.
  - In the final mapping, add:

```ts
        const focusDest = mergedDestByAd.get(adId);
        const packagesFocus = derivePackagesFocusForDestination(focusDest);
        return {
          adId,
          adName: v.adName,
          campaignId: v.campaignId,
          campaignName: v.campaignName,
          adsetId: v.adsetId,
          adsetName: v.adsetName,
          packagesFocus,
          // ...existing metric fields + adFormat unchanged...
        };
```

  - Extend `SpendByUrlDetailAggRow` and `SpendByUrlDetailRow` interfaces with the five new fields (`packagesFocus: PackagesFocusBucket` imported from `@/utils/metrics/packages-focus`), and pass them through `getSpendByUrlDetailFormatted`'s row mapping.

- [ ] **Step 2: Hook types.** In `src/hooks/queries/useSpendByUrlAnalytics.ts` mirror the additions (the file re-declares types by convention — keep field names byte-identical):

```ts
export interface SpendByUrlFocusTotals {
  spend: number;
  spendCents: number;
  revenue: number;
  revenueCents: number;
  conversions: number;
  roas: number;
}

export interface SpendByUrlRow {
  // ...existing fields...
  /** membership vs one-time split; absent = pre-split data or unknown:// row */
  packagesFocus?: { membership: SpendByUrlFocusTotals; "one-time": SpendByUrlFocusTotals };
}

export interface SpendByUrlDetailRow {
  // ...existing fields...
  campaignId?: string;
  campaignName?: string;
  adsetId?: string;
  adsetName?: string;
  /** Landing-URL strategy of this ad; "unclassified" = destination unresolved */
  packagesFocus: "membership" | "one-time" | "unclassified";
}
```

- [ ] **Step 3: Norm schemas (lockstep).** In `schemas/analytics-spend.ts`:
  - `SpendByUrlListRowSchema` add:

```ts
  packagesFocus: z
    .object({
      membership: SpendByUrlFocusTotalsSchema,
      "one-time": SpendByUrlFocusTotalsSchema,
    })
    .optional(),                               // absent = row predates the split or is unknown:// (unclassified)
```

  with a small `SpendByUrlFocusTotalsSchema = z.object({ spend: z.number(), spendCents: z.number(), revenue: z.number(), revenueCents: z.number(), conversions: z.number(), roas: z.number() })` declared above it.
  - `SpendByUrlDetailRowSchema` add:

```ts
  campaignId: z.string().optional(),
  campaignName: z.string().optional(),
  adsetId: z.string().optional(),
  adsetName: z.string().optional(),
  packagesFocus: z.enum(["membership", "one-time", "unclassified"]),
```

- [ ] **Step 4: norm-context.md** — update the list + detail sections' Returns blocks with the new fields (same inline-comment style), note the additive change in the changelog.

- [ ] **Step 5: Verify** — `npm run type-check` clean; `npm run build:norm-manifest` (no row change expected — schemas aren't serialized, harmless); tests still pass (`npm run test:packages-focus`, `npm run test:landing-page-focus`). Record change summary.

---

### Task 7: Client hook + shared AEST date-window util

**Files:**
- Create: `src/hooks/queries/usePackagesFocusBreakdown.ts`
- Create: `src/utils/admin/resolveAestDateWindow.ts`
- Modify: `src/app/admin/component/overview/sections/PrizePerformanceCard.tsx` (replace its two inline `useMemo` date blocks with the util — pure refactor, identical behavior)

**Interfaces:**
- Consumes: Task 4 response shape.
- Produces (consumed by Tasks 8, 9):
  - `usePackagesFocusBreakdown(platform: "meta" | "tiktok", startDate: string | undefined, endDate: string | undefined, options?: { enabled?: boolean })` → TanStack query of `PackagesFocusBreakdownResponse`.
  - `resolveAestDateWindow(dateRange: string, customStartDate?: string, customEndDate?: string): { startDate?: string; endDate?: string }` — same semantics as PrizePerformanceCard's current memos ("today"/"yesterday"/"all-time"/"custom"+customs; anything else without customs → both undefined).

- [ ] **Step 1: Date-window util** — `src/utils/admin/resolveAestDateWindow.ts` (logic lifted verbatim from PrizePerformanceCard lines 103-133):

```ts
import { formatInTimeZone } from "date-fns-tz";
import { subDays } from "date-fns";
import { getWebsiteLaunchDateUTC } from "@/utils/common/timezone";

const AEST_TIMEZONE = "Australia/Sydney";

/**
 * Resolve the admin Overview date filter to concrete AEST yyyy-MM-dd bounds —
 * the same calendar-day semantics as Facebook Ads → Spend by URL. Custom dates
 * win; draw presets arrive as custom dates from DashboardOverview; presets that
 * can't resolve return { undefined, undefined } so callers can gate fetches.
 */
export function resolveAestDateWindow(
  dateRange: string,
  customStartDate?: string,
  customEndDate?: string,
): { startDate?: string; endDate?: string } {
  const todayAest = () => formatInTimeZone(new Date(), AEST_TIMEZONE, "yyyy-MM-dd");
  const yesterdayAest = () => formatInTimeZone(subDays(new Date(), 1), AEST_TIMEZONE, "yyyy-MM-dd");

  const startDate = (() => {
    if (customStartDate && customEndDate) return customStartDate;
    if (dateRange === "custom" && customStartDate) return customStartDate;
    if (dateRange === "today") return todayAest();
    if (dateRange === "yesterday") return yesterdayAest();
    if (dateRange === "all-time") return formatInTimeZone(getWebsiteLaunchDateUTC(), AEST_TIMEZONE, "yyyy-MM-dd");
    return undefined;
  })();

  const endDate = (() => {
    if (customStartDate && customEndDate) return customEndDate;
    if (dateRange === "custom" && customEndDate) return customEndDate;
    if (dateRange === "today") return todayAest();
    if (dateRange === "yesterday") return yesterdayAest();
    if (dateRange === "all-time") return todayAest();
    return undefined;
  })();

  return { startDate, endDate };
}
```

- [ ] **Step 2: Refactor PrizePerformanceCard** to `const { startDate, endDate } = useMemo(() => resolveAestDateWindow(dateRange, customStartDate, customEndDate), [dateRange, customStartDate, customEndDate]);` deleting its two inline memo blocks. Behavior identical.

- [ ] **Step 3: Hook** — `src/hooks/queries/usePackagesFocusBreakdown.ts` (types re-declared per hook-file convention; keep names identical to the service):

```ts
import { useQuery } from "@tanstack/react-query";

export interface PackagesFocusTotals {
  spend: number;
  spendCents: number;
  revenue: number;
  revenueCents: number;
  roas: number;
  conversions: number;
  impressions: number;
  clicks: number;
}

export interface PackagesFocusAdNode {
  adId: string;
  adName?: string;
  adFormat: "video" | "static" | "carousel" | "unknown";
  totals: PackagesFocusTotals;
}

export interface PackagesFocusAdsetNode {
  adsetId: string;
  adsetName?: string;
  totals: PackagesFocusTotals;
  ads: PackagesFocusAdNode[];
}

export interface PackagesFocusCampaignNode {
  campaignId: string;
  campaignName?: string;
  totals: PackagesFocusTotals;
  adsets: PackagesFocusAdsetNode[];
}

export interface PackagesFocusBreakdownResponse {
  success: boolean;
  platform: "meta" | "tiktok";
  supported: boolean;
  reason?: "awaiting-url-mapping";
  meta: { startDate: string; endDate: string; currency: string; adAccountId: string };
  summary: {
    membership: PackagesFocusTotals;
    "one-time": PackagesFocusTotals;
    unclassified: PackagesFocusTotals;
    total: PackagesFocusTotals;
  };
  detail: {
    complete: boolean;
    availableSince: string | null;
    buckets: {
      membership: PackagesFocusCampaignNode[];
      "one-time": PackagesFocusCampaignNode[];
      unclassified: PackagesFocusCampaignNode[];
    };
  };
}

export function usePackagesFocusBreakdown(
  platform: "meta" | "tiktok",
  startDate: string | undefined,
  endDate: string | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery<PackagesFocusBreakdownResponse>({
    queryKey: ["admin", "analytics", "packages-focus", platform, startDate, endDate],
    enabled: options?.enabled !== false && Boolean(startDate && endDate),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      params.set("platform", platform);
      const res = await fetch(`/api/admin/analytics/packages-focus?${params.toString()}`);
      const json = (await res.json()) as PackagesFocusBreakdownResponse & { error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Failed to load packages-focus breakdown");
      }
      return json;
    },
  });
}
```

- [ ] **Step 4: Verify** — `npm run type-check` clean. Record change summary.

---

### Task 8: `AdSpendFocusModal` + clickable Ad Spend / ROAS KPIs

**Files:**
- Create: `src/components/admin/spend-by-url/CampaignTreeTable.tsx` (shared campaign→adset→ad tree, reused by Task 9)
- Create: `src/components/modals/AdSpendFocusModal.tsx`
- Modify: `src/app/admin/component/overview/sections/KpiGrid.tsx` (Ad Spend + ROAS tiles become clickable, open the modal)
- Modify: `src/app/admin/component/overview/DashboardOverview.tsx` (pass `startDate`/`endDate` to KpiGrid)

**Interfaces:**
- Consumes: `usePackagesFocusBreakdown`, `resolveAestDateWindow` (Task 7); modal kit `@/components/modals/ui`; `Badge` from `@/components/admin/ui`.
- Produces:
  - `CampaignTreeTable({ campaigns: PackagesFocusCampaignNode[]; ariaLabel?: string; emptyMessage?: string })` — expandable tree with columns Campaign/Ad set/Ad · Spend · Revenue · ROAS · Conv.; ad rows show an `adFormat` chip and an optional focus `Badge` when the node has `packagesFocus?: "membership" | "one-time" | "unclassified"` (optional field on `PackagesFocusAdNode` for Task 9's mixed-brand view).
  - `AdSpendFocusModal({ isOpen, onClose, startDate?: string, endDate?: string, rangeLabel?: string })`.

- [ ] **Step 1: CampaignTreeTable.** Client component. Local state `expandedCampaigns: Set<string>`, `expandedAdsets: Set<string>` (keys `campaignId` / `campaignId:adsetId`). Render a single `<table>` styled like `SpendByUrlAdBreakdownTable` (same `formatAud`/`formatNum` Intl helpers, `tabular-nums` right-aligned cells, sticky header, `cn` from `@/utils/cn`). Row hierarchy: campaign row (chevron button + name + id mono) → indented adset rows → indented ad rows (`adId` mono over `adName`, adFormat text chip, focus `Badge` when `node.packagesFocus` present: tone `info` for "one-time", `neutral` for "membership", `warning` for "unclassified", label exactly `One-time` / `Membership` / `Unclassified`). Columns: Name | Spend | Revenue | ROAS | Conv. ROAS cell colored `text-emerald-600` when ≥ 3 else `text-amber-600` (matches PrizePerformanceCard). Empty state renders `emptyMessage ?? "No ads in this bucket for the selected range."`. Accept the node types from `@/hooks/queries/usePackagesFocusBreakdown` (add `packagesFocus?: "membership" | "one-time" | "unclassified"` to `PackagesFocusAdNode` there — optional, unset for the KPI modal).

- [ ] **Step 2: AdSpendFocusModal** — `src/components/modals/AdSpendFocusModal.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { ModalContainer, ModalHeader, ModalContent } from "@/components/modals/ui";
import {
  usePackagesFocusBreakdown,
  type PackagesFocusTotals,
} from "@/hooks/queries/usePackagesFocusBreakdown";
import CampaignTreeTable from "@/components/admin/spend-by-url/CampaignTreeTable";

type FocusTab = "membership" | "one-time" | "unclassified";
type Platform = "meta" | "tiktok";

const fmtAud = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);

function SummaryTile({ label, totals, active, onClick }: {
  label: string;
  totals: PackagesFocusTotals | undefined;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border p-3 transition-colors ${
        active
          ? "border-neutral-900 dark:border-white ring-1 ring-neutral-900 dark:ring-white"
          : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700"
      }`}
    >
      <p className="text-2xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="font-display font-extrabold text-lg text-neutral-900 dark:text-white mt-1">
        {totals ? fmtAud(totals.spend) : "—"}
      </p>
      <p className="text-2xs text-neutral-500 dark:text-neutral-400 mt-0.5">
        {totals ? `${fmtAud(totals.revenue)} rev · ${totals.roas.toFixed(2)}x ROAS · ${totals.conversions} conv` : ""}
      </p>
    </button>
  );
}

/**
 * Drill-down for the Ad Spend + ROAS KPI tiles: how spend/return splits between
 * membership-focus landing URLs (default) and one-time-focus URLs
 * (?packages=one-time), with a campaign → ad set → ad tree per bucket.
 * Revenue here is Meta-reported (action_values) — the same basis as the KPI.
 */
export default function AdSpendFocusModal({
  isOpen, onClose, startDate, endDate, rangeLabel,
}: {
  isOpen: boolean;
  onClose: () => void;
  startDate?: string;
  endDate?: string;
  rangeLabel?: string;
}) {
  const [platform, setPlatform] = useState<Platform>("meta");
  const [focusTab, setFocusTab] = useState<FocusTab>("one-time");

  const { data, isLoading, error } = usePackagesFocusBreakdown(platform, startDate, endDate, { enabled: isOpen });

  useEffect(() => {
    if (!isOpen) {
      setPlatform("meta");
      setFocusTab("one-time");
    }
  }, [isOpen]);

  const summary = data?.supported ? data.summary : undefined;
  const buckets = data?.supported ? data.detail.buckets : undefined;
  const showUnclassified = (summary?.unclassified.spendCents ?? 0) > 0;

  const platformChip = (p: Platform, label: string) => (
    <button
      type="button"
      onClick={() => setPlatform(p)}
      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
        platform === p
          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-transparent"
          : "border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:border-neutral-400"
      }`}
    >
      {label}
    </button>
  );

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="4xl" height="fixed" className="!max-w-[1100px]">
      <ModalHeader
        title="Ad spend — packages focus"
        subtitle={
          data?.supported
            ? `Membership vs one-time landing URLs${rangeLabel ? ` · ${rangeLabel}` : ""} · Meta-reported revenue`
            : rangeLabel
        }
        onClose={onClose}
      />
      <ModalContent padding="none">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {platformChip("meta", "Meta")}
            {platformChip("tiktok", "TikTok")}
          </div>

          {platform === "tiktok" && data && !data.supported && (
            <div className="p-6 text-center text-sm text-neutral-500 dark:text-neutral-400 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl">
              TikTok ad→landing-URL mapping isn&apos;t synced yet — the split lights up here once the TikTok
              destination resolver ships. Spend itself is on the TikTok Ads tab.
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-950/30 border-2 border-red-200 dark:border-red-900/45 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
              <span className="text-red-700 dark:text-red-300 text-sm">
                {error instanceof Error ? error.message : "Failed to load"}
              </span>
            </div>
          )}

          {isLoading && !data && (
            <div className="p-8 text-center">
              <Loader2 className="w-10 h-10 mx-auto mb-3 text-gray-400 animate-spin" />
              <p className="text-gray-600 dark:text-neutral-400">Loading…</p>
            </div>
          )}

          {summary && (
            <div className={`grid gap-3 ${showUnclassified ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`}>
              <SummaryTile label="Membership focus" totals={summary.membership} active={focusTab === "membership"} onClick={() => setFocusTab("membership")} />
              <SummaryTile label="One-time focus" totals={summary["one-time"]} active={focusTab === "one-time"} onClick={() => setFocusTab("one-time")} />
              {showUnclassified && (
                <SummaryTile label="Unclassified" totals={summary.unclassified} active={focusTab === "unclassified"} onClick={() => setFocusTab("unclassified")} />
              )}
            </div>
          )}

          {data?.supported && !data.detail.complete && (
            <p className="text-2xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 rounded px-2 py-1">
              Per-campaign detail covers {data.detail.availableSince ?? "no"} onwards (older per-ad data has
              expired); the summary tiles above cover the full selected range.
            </p>
          )}

          {buckets && (
            <CampaignTreeTable
              campaigns={buckets[focusTab]}
              ariaLabel={`Campaigns — ${focusTab} focus`}
            />
          )}
        </div>
      </ModalContent>
    </ModalContainer>
  );
}
```

- [ ] **Step 3: Wire the KPI tiles.** In `DashboardOverview.tsx`, pass `startDate={customStartDate || undefined} endDate={customEndDate || undefined}` to `<KpiGrid …>`. In `KpiGrid.tsx`:
  - Add to props: `startDate?: string; endDate?: string`.
  - Compute `const focusWindow = useMemo(() => resolveAestDateWindow(dateRange, startDate, endDate), [dateRange, startDate, endDate]);` (import from `@/utils/admin/resolveAestDateWindow`).
  - Add state `const [adSpendFocusOpen, setAdSpendFocusOpen] = useState(false);`.
  - Give BOTH the "Ad Spend" and "ROAS" `MetricCard`s: `onClick={() => setAdSpendFocusOpen(true)}` and `active={adSpendFocusOpen}` (MetricCard already supports both).
  - Render once, after the grids: `<AdSpendFocusModal isOpen={adSpendFocusOpen} onClose={() => setAdSpendFocusOpen(false)} startDate={focusWindow.startDate} endDate={focusWindow.endDate} rangeLabel={rangeLabel} />`.

- [ ] **Step 4: Verify** — `npm run type-check` + `npm run lint` clean. Manual QA note for DJ: `/admin` → click Ad Spend or ROAS tile → modal shows tiles + tree; TikTok chip shows awaiting state. Record change summary.

---

### Task 9: Prize Performance drill-down (row click + upgraded modal)

**Files:**
- Modify: `src/components/modals/PrizePerformanceAdsModal.tsx` (upgrade: brand focus summary + focus chips + campaign tree; keeps its existing props)
- Modify: `src/app/admin/component/overview/sections/PrizePerformanceCard.tsx` (row click opens the modal; docblock's "noted follow-up" fulfilled)
- Modify: `src/utils/admin/spendByUrlAdBreakdown.ts` (add `groupSpendByUrlDetailRowsByCampaign`)

**Interfaces:**
- Consumes: extended `SpendByUrlDetailRow` (Task 6), `CampaignTreeTable` (Task 8), `useSpendByUrlDetailMany` (existing).
- Produces: `groupSpendByUrlDetailRowsByCampaign(rows: SpendByUrlDetailRow[]): PackagesFocusCampaignNode[]` — client-side grouping into the SAME node shape CampaignTreeTable renders, with `packagesFocus` set on each ad node (this modal shows mixed buckets in one tree, filtered by chips).

- [ ] **Step 1: Grouping util.** In `src/utils/admin/spendByUrlAdBreakdown.ts` append (import the node types from `@/hooks/queries/usePackagesFocusBreakdown` and `SpendByUrlDetailRow` from the hooks file it already imports from):

```ts
/**
 * Group per-ad detail rows into the campaign → adset → ad tree shape shared with
 * the packages-focus breakdown endpoint, so PrizePerformanceAdsModal and
 * AdSpendFocusModal render through one CampaignTreeTable. Detail rows are
 * pre-aggregated per ad, so node totals are simple sums; each ad node carries
 * its packagesFocus for badge display + chip filtering.
 */
export function groupSpendByUrlDetailRowsByCampaign(rows: SpendByUrlDetailRow[]): PackagesFocusCampaignNode[] {
  const toTotals = (acc: { spendCents: number; revenueCents: number; conversions: number; impressions: number; clicks: number }): PackagesFocusTotals => {
    const spend = Math.round(acc.spendCents) / 100;
    const revenue = Math.round(acc.revenueCents) / 100;
    return {
      spend, spendCents: acc.spendCents, revenue, revenueCents: acc.revenueCents,
      roas: spend > 0 ? revenue / spend : 0,
      conversions: acc.conversions, impressions: acc.impressions, clicks: acc.clicks,
    };
  };

  type Acc = { spendCents: number; revenueCents: number; conversions: number; impressions: number; clicks: number };
  const newAcc = (): Acc => ({ spendCents: 0, revenueCents: 0, conversions: 0, impressions: 0, clicks: 0 });
  const add = (acc: Acc, r: SpendByUrlDetailRow) => {
    acc.spendCents += r.spendCents; acc.revenueCents += r.revenueCents;
    acc.conversions += r.conversions; acc.impressions += r.impressions; acc.clicks += r.clicks;
  };

  const campaigns = new Map<string, { name?: string; acc: Acc; adsets: Map<string, { name?: string; acc: Acc; ads: PackagesFocusAdNode[] }> }>();
  for (const r of rows) {
    const cid = r.campaignId ?? "unknown-campaign";
    const sid = r.adsetId ?? "unknown-adset";
    const c = campaigns.get(cid) ?? { name: undefined, acc: newAcc(), adsets: new Map() };
    c.name = r.campaignName ?? c.name;
    add(c.acc, r);
    const s = c.adsets.get(sid) ?? { name: undefined, acc: newAcc(), ads: [] };
    s.name = r.adsetName ?? s.name;
    add(s.acc, r);
    const adAcc = newAcc();
    add(adAcc, r);
    s.ads.push({ adId: r.adId, adName: r.adName, adFormat: r.adFormat, totals: toTotals(adAcc), packagesFocus: r.packagesFocus });
    c.adsets.set(sid, s);
    campaigns.set(cid, c);
  }

  return [...campaigns.entries()]
    .map(([campaignId, c]) => ({
      campaignId,
      campaignName: c.name,
      totals: toTotals(c.acc),
      adsets: [...c.adsets.entries()]
        .map(([adsetId, s]) => ({
          adsetId,
          adsetName: s.name,
          totals: toTotals(s.acc),
          ads: s.ads.sort((a, b) => b.totals.spendCents - a.totals.spendCents),
        }))
        .sort((a, b) => b.totals.spendCents - a.totals.spendCents),
    }))
    .sort((a, b) => b.totals.spendCents - a.totals.spendCents);
}
```

- [ ] **Step 2: Upgrade the modal.** Rework `PrizePerformanceAdsModal.tsx` (props unchanged: `isOpen/onClose/brandLabel/slug/startDate/endDate/canonicalUrls`):
  - Keep `useSpendByUrlDetailMany(canonicalUrls, startDate, endDate, { enabled: isOpen && canonicalUrls.length > 0 })`.
  - Add state `focusFilter: "all" | "membership" | "one-time" | "unclassified"` (default `"all"`, reset on close via the `useEffect(!isOpen)` pattern).
  - Compute brand-level focus summary from `data.rows` (sum spendCents/revenueCents/conversions per `packagesFocus`), rendered as the same `SummaryTile` grid style as AdSpendFocusModal (extract nothing — small inline tiles are fine; show Membership + One-time always, Unclassified only when present).
  - Filter rows by `focusFilter` (`"all"` keeps everything), then `const campaigns = useMemo(() => groupSpendByUrlDetailRowsByCampaign(filteredRows), [filteredRows]);` and render `<CampaignTreeTable campaigns={campaigns} ariaLabel={`Campaigns for ${brandLabel}`} />`.
  - Focus chips row (All / Membership / One-time / +Unclassified when present) using the same `chipClass` styling as PlatformRevenueModal.
  - Platform chips (Meta active, TikTok → renders the same "awaiting URL mapping" dashed box as AdSpendFocusModal instead of the tree; no fetch for tiktok — this modal's data source is Meta-only today).
  - Keep the header subtitle's ad/URL/range counts; keep loading/error/empty branches.

- [ ] **Step 3: Wire the row click.** In `PrizePerformanceCard.tsx`:
  - State: `const [selectedBrand, setSelectedBrand] = useState<{ brand: string; slug: string; canonicalUrls: string[] } | null>(null);`.
  - Build per-brand canonicalUrls where rows are computed (inside the existing `rows` memo attach `canonicalUrls: rowsForPromo.map((r) => r.canonicalUrl)` to each PrizeRow).
  - DataTable: pass `onRowClick={(row) => setSelectedBrand({ brand: row.brand as string, slug: row.id as string, canonicalUrls: row.canonicalUrls as string[] })}` — **first verify the kit `DataTable` exposes `onRowClick`** (AdvertisingPlatformCard uses it; check `src/components/admin/ui` DataTable props and match its exact signature).
  - Render the modal: `<PrizePerformanceAdsModal isOpen={!!selectedBrand} onClose={() => setSelectedBrand(null)} brandLabel={selectedBrand?.brand ?? ""} slug={selectedBrand?.slug ?? ""} startDate={startDate ?? ""} endDate={endDate ?? ""} canonicalUrls={selectedBrand?.canonicalUrls ?? []} />`.
  - Update the component docblock: the per-row modal is no longer "dropped — noted follow-up"; it's live with campaign tree + focus split.

- [ ] **Step 4: Verify** — `npm run type-check` + `npm run lint`. Manual QA note for DJ: `/admin` → Prize performance → click Milwaukee → modal: brand tiles, chips, campaign→adset→ad tree with focus badges. Record change summary.

---

### Task 10: Facebook Ads tab surfaces (focus strip + row chips + ad badge)

**Files:**
- Modify: `src/components/admin/SpendByUrlSection.tsx` (focus summary strip + per-URL-row split chips)
- Modify: `src/components/admin/spend-by-url/SpendByUrlAdBreakdownTable.tsx` (focus badge in the Ad cell)

**Interfaces:**
- Consumes: `SpendByUrlRow.packagesFocus` + `SpendByUrlDetailRow.packagesFocus` (Task 6), `usePackagesFocusBreakdown` (Task 7), `Badge` from `@/components/admin/ui`.

- [ ] **Step 1: Focus summary strip.** In `SpendByUrlSection.tsx`, above the toolbar row (the empty slot at the top of the root `space-y-3` div): fetch `usePackagesFocusBreakdown("meta", dateReady ? startDate : undefined, dateReady ? endDate : undefined)` and render a compact 3-tile strip (Membership / One-time / +Unclassified when non-zero) — each tile: label, spend, `rev · roas · conv` subline, styled like the existing white cards (`bg-white rounded-lg sm:rounded-xl shadow-lg border border-gray-100 p-3`). No click behavior here (the KPI modal is the drill-down home). Hide the strip entirely while `!dateReady` or when the response has zero total spend.

- [ ] **Step 2: Per-URL-row chips.** In the URL cell (`<td>` rendering `row.canonicalUrl`), under the URL text, when `row.packagesFocus` exists render:

```tsx
{row.packagesFocus && (
  <span className="flex flex-wrap gap-1 mt-0.5">
    {row.packagesFocus.membership.spend > 0 && (
      <Badge tone="neutral">M {formatAud(row.packagesFocus.membership.spend)}</Badge>
    )}
    {row.packagesFocus["one-time"].spend > 0 && (
      <Badge tone="info">OT {formatAud(row.packagesFocus["one-time"].spend)}</Badge>
    )}
  </span>
)}
```

(import `Badge` from `@/components/admin/ui`; verify the barrel exports it — the extractor flagged this needs checking; if not exported, import from `@/components/admin/ui/Badge`).

- [ ] **Step 3: Ad-table focus badge.** In `SpendByUrlAdBreakdownTable.tsx`, in the Ad cell under `adName`, render a small focus badge when the row carries one (no new column — avoids COL_SPAN/sort churn in two tables):

```tsx
{d.packagesFocus && d.packagesFocus !== "unclassified" && (
  <Badge tone={d.packagesFocus === "one-time" ? "info" : "neutral"} className="mt-0.5">
    {d.packagesFocus === "one-time" ? "One-time" : "Membership"}
  </Badge>
)}
```

- [ ] **Step 4: Verify** — `npm run type-check` + `npm run lint`. Manual QA note for DJ: Admin → Analytics → Facebook Ads → `?viewMode=spend-by-url`: strip on top, chips under URLs, badges in expanded ad rows. Record change summary.

---

### Task 11: True-ROAS seed — record `packages` focus on payments

**Files:**
- Modify: `src/types/tracking.ts` (`AttributionParams` gains `packages_focus?: "one-time"`)
- Modify: `src/utils/tracking/utm-helpers.ts` (`extractAttributionParams` captures it)
- Modify: `src/utils/tracking/attribution-cookie.ts` (FIELDS list)
- Modify: `src/hooks/useUTMPersistence.ts` (`hasAny` check)
- Modify: `src/utils/tracking/attribution-schema.ts` (zod body schema)
- Modify: `src/utils/tracking/attribution-metadata.ts` (`attr_packages_focus` stamp)
- Modify: `src/services/stripe-webhook-handlers/index.ts` (`extractAttributionFromMetadata` reads it back)
- Modify: `src/utils/payment/payment-processing.ts` (persist `data.packagesFocus`)
- Verify/possibly modify: `src/hooks/useAttribution.ts`, `src/utils/tracking/utm-storage.ts` (must pass the field through)
- Modify: `CUSTOMER.md` (attribution capture change) — hook-enforced
- Modify: root `CLAUDE.md` Domain Manifest — add `"src/types/tracking.ts"` to the `tracking` domain `paths` (currently uncovered; the doc-sync hook will otherwise flag it)

**Interfaces:**
- Consumes: existing attribution pipeline (capture → cookie → checkout body → Stripe metadata → webhook → PaymentEvent).
- Produces: `PaymentEvent.data.packagesFocus: "one-time"` on payments whose landing capture saw `?packages=one-time`. **Absence = membership-default at analysis time** (organic and pre-feature traffic stores nothing).

- [ ] **Step 1: Type + capture.** `AttributionParams` gains:

```ts
  /**
   * Landing-URL packages focus. ONLY ever "one-time" (captured when the landing
   * URL carried ?packages=one-time). Membership is the default and is expressed
   * by ABSENCE — ads never use ?packages=membership, and storing nothing keeps
   * organic traffic out of the attribution stores. Missing = membership-default
   * at analysis time.
   */
  packages_focus?: "one-time";
```

In `extractAttributionParams` (after the `ad_id` block), reusing the canonical parser:

```ts
    // import { MEMBERSHIP_PACKAGES_QUERY_PARAM, parseMembershipPackagesTab } from "@/utils/membership/packagesTabParam";
    const packagesTab = parseMembershipPackagesTab(searchParams.get(MEMBERSHIP_PACKAGES_QUERY_PARAM));
    if (packagesTab === "one-time") params.packages_focus = "one-time";
```

- [ ] **Step 2: Cookie + session stores.** `attribution-cookie.ts`: append `"packages_focus"` to the `FIELDS` array (serialization/deserialization then carries it). `useUTMPersistence.ts`: add `params.packages_focus ||` to the `hasAny` chain. Read `src/utils/tracking/utm-storage.ts` (`setStoredUTMParams`) and `src/hooks/useAttribution.ts` — if either projects fields explicitly rather than passing the whole object, add `packages_focus` there too; if they pass objects through, no change (record which it was in the change summary).

- [ ] **Step 3: Body schema + Stripe metadata.** `attribution-schema.ts`:

```ts
    packages_focus: z.literal("one-time").optional(),
```

`attribution-metadata.ts` (`buildAttributionMetadata`), validating the literal so a tampered cookie can't stamp arbitrary strings:

```ts
  if (attribution.packages_focus === "one-time") meta.attr_packages_focus = "one-time";
```

- [ ] **Step 4: Webhook read-back.** In `extractAttributionFromMetadata` (stripe-webhook-handlers/index.ts): read `const packagesFocus = metadata.attr_packages_focus;`, include it in the presence check OR-chain and in the returned object as `...(packagesFocus === "one-time" && { packages_focus: "one-time" as const })`.

- [ ] **Step 5: PaymentEvent persistence.** In `payment-processing.ts`, immediately after the attributionData session/signup merge block (independent of the `useSession` gate — the focus is meaningful on its own):

```ts
        // Landing-URL packages focus (seed for future true-ROAS-per-focus).
        // Only ever "one-time"; absence = membership-default at analysis time.
        if (sessionAttribution?.packages_focus === "one-time") {
          attributionData.packagesFocus = "one-time";
        }
```

(camelCase inside the `data` blob per its convention — `utmSource`, `campaignId`, … `packagesFocus`.)

- [ ] **Step 6: CUSTOMER.md** — in the attribution/third-party-capture section add one line: the landing URL's `packages=one-time` marker is now captured into the attribution cookie and stamped onto payments (`PaymentEvent.data.packagesFocus`) to enable future revenue-by-landing-focus reporting; membership is the default and stored by absence.

- [ ] **Step 7: Manifest** — add `"src/types/tracking.ts"` to the `tracking` domain's `paths` array in the root `CLAUDE.md` Domain Manifest JSON (both worktree and main-checkout copies are the same file in this branch).

- [ ] **Step 8: Verify** — `npm run type-check` + `npm run lint` clean; `npm run test:facebook-capi` still passes (touched files sit near its imports); walk the capture paths per CLAUDE.md rule 6: landing WITH the param + other UTMs (captured), landing with ONLY `?packages=one-time` (now captured — hasAny includes it), landing without (nothing stored), guest→register→purchase (session attribution flows via body), returning user with old cookie (no field → nothing stamped). Record change summary.

---

### Task 12: Docs sweep + full verification

**Files (docs only):**
- Modify: `docs/admin/frontend.md` — KPI tiles now clickable → AdSpendFocusModal; PrizePerformanceCard row click → upgraded PrizePerformanceAdsModal (remove the "dropped/follow-up" note); SpendByUrlSection strip/chips; CampaignTreeTable component.
- Modify: `docs/admin/api.md` — `GET /api/admin/analytics/packages-focus` (params, response summary, permission) + extended spend-by-url list/detail fields.
- Modify: `docs/metrics-analytics/README.md` — `packagesFocus` split on LandingPageMetricsDaily, the derivation util, PackagesFocusBreakdownService, backfill script, the unclassified-bucket semantics + insights-TTL detail bound.
- Modify: `docs/tracking/README.md` — attribution capture addition (`packages_focus` param → cookie → `attr_packages_focus` → `PaymentEvent.data.packagesFocus`).
- Modify: `docs/billing-stripe/` + `docs/payment/` (touched `stripe-webhook-handlers/index.ts`, `utils/payment/payment-processing.ts`, `models/PaymentEvent.ts` is untouched — webhook + payment-processing docs get one-line additions).
- Modify: `docs/client-state/` (new + extended hooks under `src/hooks/queries/`).
- Modify: `docs/infrastructure/` (new backfill script + package.json entries).
- Modify: `BUSINESS.md` §14b — one line: ads analytics now includes a membership vs one-time landing-URL (packages-focus) breakdown across KPI drill-down / Prize Performance / Facebook Ads tab; Meta live, TikTok awaiting its URL-mapping sync.
- Already done in earlier tasks: `docs/internal-norm/norm-context.md` (5, 6), `CUSTOMER.md` (11).

- [ ] **Step 1:** Write all doc updates above (surgical edits, not rewrites).
- [ ] **Step 2:** Full verification run:
  - `npm run type-check` → clean
  - `npm run lint` → clean
  - `npm run test:packages-focus` → PASS
  - `npm run test:landing-page-focus` → PASS
  - `npm run test:facebook-capi` → PASS (regression)
  - `npm run build:norm-manifest` → idempotent (no diff beyond generatedAt)
  - `npm run norm:smoke` → run; record honest outcome
- [ ] **Step 3:** Assemble the final **inline change summary** for DJ: every file touched (created/modified), what changed, why — grouped by task. NO commits.

---

## Self-Review (completed inline)

1. **Spec coverage:** §3 naming → Global Constraints + Task 1; §4 rule → Task 1 (incl. `?packages=membership` test); §5 model → Task 2; §6.1 endpoint → Tasks 4–5; §6.2 extensions → Task 6; §7.1 KPI modal → Task 8; §7.2 prize modal → Task 9; §7.3 FB tab → Task 10; §8 seed → Task 11; §9 backfill → Task 3; §10 Norm → Tasks 5–6; §11 docs → Tasks 5, 6, 11, 12; §12 tests → Tasks 1, 2; §13 non-goals honored (no TikTok resolver, no true-ROAS UI, no multi-URL spend splitting).
2. **Placeholder scan:** no TBDs; every code step carries code; UI Steps 1 (Task 8) and 2 (Task 9) specify exact structure/props/tones where full JSX would be noise — implementer judgment bounded by named patterns.
3. **Type consistency:** `packagesFocus` field name everywhere; bucket union `"membership" | "one-time" | "unclassified"`; `PackagesFocusTotals` identical field lists in service (Task 4) and hook (Task 7); `SpendByUrlFocusTotals` identical in service (Task 2), hook (Task 6), Norm schema (Task 6); `groupSpendByUrlDetailRowsByCampaign` returns `PackagesFocusCampaignNode[]` consumed by `CampaignTreeTable` (Tasks 8–9); `resolveAestDateWindow` signature consistent between Tasks 7 and 8.
