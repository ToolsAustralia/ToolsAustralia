# Packages-Focus Ad Analytics — Design Spec

**Date:** 2026-07-17
**Status:** Approved by DJ (chat, 2026-07-17) — Approach A
**Branch:** `feature/admin-analytics`

## 1. Problem

The ads team runs two kinds of Meta ad landing URLs:

- **Membership-focus** (default): promo landing URL with no `packages` param, e.g. `/promotions/makita`. The membership section opens on Membership Packs.
- **One-time-focus**: same URL plus `?packages=one-time`, which pre-selects the One-Time tab. These URLs went live in the **first week of July 2026**.

DJ needs to see how spend and return split across these two strategies, but the split is invisible today: `canonicalizeLandingUrl` strips query strings, so both variants collapse into one row in every ads-analytics surface. The data to fix this already exists — `MetaAdDestination.rawUrls` stores each ad's full landing URL **including query params** — it just isn't surfaced.

## 2. Locked decisions (from brainstorm with DJ)

1. **KPI click UI**: clicking the Ad Spend or ROAS KPI opens a **full modal** (not a popover).
2. **History depth**: rebuild the split for the full remaining per-ad insights window (~60 days — covers everything, since one-time URLs launched early July); ongoing crons bake the split into the permanent aggregate from then on. No deep Meta backfill script.
3. **True-ROAS seed**: **yes** — start recording the landing `packages` token on real payments (attribution capture → Stripe metadata → PaymentEvent) so a future task can split actual Stripe revenue by focus. No UI for it in this task.
4. **TikTok**: **design-in only.** All new endpoints/UI are platform-keyed with a Meta/TikTok toggle; TikTok renders the existing "awaiting sync" state. The TikTok ad→URL destination resolver is a documented follow-up (its Marketing-API shapes are unverified without live creds).
5. **No commits** — DJ reviews the working tree; deliver an inline per-file change summary with reasons.

## 3. Naming

- New coined term (flagged per naming rules; no existing name for this concept): **`packagesFocus`**, type `"membership" | "one-time"` — reusing the existing `packages` URL-param vocabulary and the canonical tab tokens from `src/utils/membership/packagesTabParam.ts`. Used identically across model, service, API, and UI.
- **`unclassified`** is an aggregate-level *bucket* (not a `packagesFocus` value) for spend on ads whose destination Meta couldn't resolve (`unknown://meta-ad/<adId>` rows) and for pre-feature aggregate rows that were never rebuilt.

## 4. Classification rule (binary — do not add a membership param branch)

> An ad is **one-time-focus** iff its **primary landing URL** (the same first raw URL that `canonicalUrl` is derived from) has a `packages` query param equal to `one-time` (parsed with the same tolerance as `parseMembershipPackagesTab`: case-insensitive, trimmed). **Everything else is membership-focus.**

Ads never use `?packages=membership`; the membership default is expressed by omitting the param (confirmed by DJ + the `packagesTabParam.ts` docblock). An explicit `?packages=membership`, an invalid value, or no param all classify as `membership`.

Multi-URL creatives (carousels/Advantage+): classified by the primary URL only — consistent with the existing rule that 100% of spend attributes to `canonicalUrl` (first URL). `multiUrl` remains a flag only.

Implementation: pure util `derivePackagesFocusFromUrl(url: string): PackagesFocus` in `src/utils/metrics/packages-focus.ts` (metrics-analytics domain), delegating param parsing to `parseMembershipPackagesTab`. Derivation happens **on read** from `rawUrls` — no `MetaAdDestination` schema change, no migration. The "primary" raw URL is located robustly: the first `rawUrls` entry whose `canonicalizeLandingUrl(...)` equals the doc's `canonicalUrl` (fallback: `rawUrls[0]`), rather than assuming array order.

## 5. Data model (Approach A — embedded subtotals, no re-key)

`LandingPageMetricsDaily` gains an **optional embedded per-focus subtotal**:

```ts
packagesFocus?: {
  membership: { spendCents; impressions; clicks; conversions; revenueCents };
  "one-time":  { spendCents; impressions; clicks; conversions; revenueCents };
}
```

- Row key and unique index **unchanged** (`{adAccountId, date, canonicalUrl}`) — zero impact on existing consumers (admin routes + Norm mirror), no index migration.
- Needed because both URL variants collapse into the *same* canonicalUrl row — the split must live inside the row.
- Written by `SpendByUrlAggregationService.recomputeForDateRange` during the existing per-day delete+insert rebuild: for each insights row, look up the ad's destination, derive focus from `rawUrls[0]`, and accumulate into both the row totals (unchanged) and the focus subtotal.
- `unknown://meta-ad/<id>` rows get **no** subdoc (they are the `unclassified` bucket by URL scheme). Legacy rows older than the rebuild window also lack the subdoc → read side reports them as `unclassified`.
- Rationale vs alternatives: live-compute (B) breaks for ranges older than the 60-day `MetaAdInsightsDaily` TTL; re-keying rows per focus (C) forces a unique-index migration and consumer/Norm re-grouping for no added capability.

## 6. Services & API

### 6.1 New: `GET /api/admin/analytics/packages-focus?startDate&endDate&platform=meta`

Thin route (permission `facebookAds.view`, same as spend-by-url siblings) → new `PackagesFocusBreakdownService` (`src/services/analytics/PackagesFocusBreakdownService.ts` — new file justified: a different aggregation axis than SpendByUrlAggregationService, which is already ~480 lines).

Response (shared formatted shape for admin + Norm):

```ts
{
  platform: "meta" | "tiktok",
  supported: boolean,            // tiktok → false
  reason?: "awaiting-url-mapping",
  meta: { startDate, endDate, currency: "AUD", adAccountId },
  summary: {                     // from LandingPageMetricsDaily subtotals — any range
    membership: Totals, "one-time": Totals, unclassified: Totals, total: Totals
  },                             // Totals = spend/spendCents/revenue/revenueCents/roas/conversions/impressions/clicks
  detail: {                      // from live MetaAdInsightsDaily × MetaAdDestination join — ~60d
    complete: boolean,           // false when range start predates oldest available insights
    availableSince?: string,     // oldest insights date actually covered
    buckets: {
      membership: CampaignNode[], "one-time": CampaignNode[], unclassified: CampaignNode[]
    }
  }
}
// CampaignNode { campaignId, campaignName, totals, adsets: AdsetNode[] }
// AdsetNode    { adsetId, adsetName, totals, ads: AdNode[] }
// AdNode       { adId, adName, adFormat, totals }
```

- A campaign running both URL types appears in **both** buckets with focus-specific subtotals.
- Revenue basis is **Meta-reported** (`action_values`), same as the headline ROAS KPI — stated in the modal UI so numbers reconcile.
- `platform=tiktok` short-circuits to `{ supported: false, reason: "awaiting-url-mapping" }` — one discriminator param, no speculative adapter layer.

### 6.2 Extended (additive): spend-by-url list + detail

- `SpendByUrlDetailRow` gains `campaignId?`, `campaignName?`, `adsetId?`, `adsetName?` (already on the insights rows being aggregated) and `packagesFocus` (derived from the ad's destination).
- `SpendByUrlListRow` gains optional `packagesFocus` per-row subtotals (spend/revenue/conversions per focus) read from the new subdoc.
- Both shapes are shared with Norm by construction → the Zod schemas in `src/lib/internal-norm/schemas/analytics-spend.ts` get the same additive optional fields.

## 7. UI

### 7.1 KPI drill-down (`/admin` Overview)

- `KpiGrid`: Ad Spend + ROAS tiles become clickable (same affordance as Revenue/MRR tiles) and open one shared **`AdSpendFocusModal`** (new, `src/components/modals/`, following the `PlatformRevenueModal` folder pattern).
- Modal layout: platform toggle (Meta active / TikTok awaiting) → two summary tiles (Membership vs One-time: spend, revenue, ROAS, conversions) + an unclassified line when non-zero → focus tabs (All / Membership / One-time) → expandable campaign → ad-set → ad table. A notice renders when `detail.complete === false` ("per-campaign detail available from {availableSince}").
- New TanStack Query hook `usePackagesFocusBreakdown(startDate, endDate, platform)` under `src/hooks/queries/` per the adding-tanstack-query-hook conventions.

### 7.2 Prize Performance drill-down (`/admin` Overview)

- Wire the brand-row click (re-adding the drill-down the card's docblock lists as a known follow-up) to an **upgraded `PrizePerformanceAdsModal`**:
  - Brand summary strip incl. the membership/one-time split for that brand.
  - Campaign → ad-set → ad tree built from the extended detail rows (grouped client-side), focus badge per ad, focus filter tabs, platform toggle (TikTok awaiting).
  - Keeps `useSpendByUrlDetailMany` + the brand→canonicalUrls mapping the card already computes.

### 7.3 Analytics → Facebook Ads → Spend by URL

- Focus summary strip above the table (bucket totals for the selected range, from the new endpoint's summary).
- Per-URL-row membership/one-time split chips (from the list rows' new subtotals).
- Focus badge column in the per-ad drill-down table (`SpendByUrlAdBreakdownTable`).

## 8. True-ROAS seed (capture only, no UI)

- `extractAttributionParams` additionally captures the `packages` token (validated via `parseMembershipPackagesTab`; stored **only when** it parses to `one-time` — organic/default traffic stores nothing, matching first-touch cookie semantics).
- Flows through the existing pipeline untouched otherwise: attribution cookie/session stores → `buildAttributionMetadata` stamps `attr_packages_focus` on the Stripe object at every create-* checkout route → webhook read-back → persisted in `PaymentEvent.data.packagesFocus`.
- Analysis-time rule (documented for the future task): missing value = membership-default for ad-attributed payments. Payments carrying `attributionAdId` can additionally be classified retroactively via the ad's stored destination URL.
- Touches customer-data capture → **CUSTOMER.md updated in the same task**.

## 9. Rollout / backfill

- One ops script `scripts/backfill-packages-focus-aggregates.ts` (per writing-ops-script rules: `--dry-run` default-safe + `:dry` npm variant, up-front total, adaptive progress lines, final summary). It re-runs the existing idempotent `recomputeForDateRange` over the full remaining insights window (~60 days); dry-run reports the dates/row counts that would be rebuilt without writing.
- Ongoing coverage is automatic: both Meta sync crons and the manual "Sync from Meta" button already call the same rebuild for trailing windows, which now writes the subtotals.

## 10. Norm lockstep (CLAUDE.md rule 10)

- New endpoint mirrored: registry entry `analytics.packages-focus` in `classification.ts`, Zod schema (new `src/lib/internal-norm/schemas/` entry or extension of `analytics-spend.ts`), Norm route under `/api/internal/norm/v1/analytics/packages-focus`, `npm run build:norm-manifest`, `docs/internal-norm/norm-context.md` updated, `npm run norm:smoke` verified. Projection is PII-free (ad/campaign metadata only).
- Extended spend-by-url list/detail schemas updated additively in the same change.

## 11. Docs to update (same task)

- `docs/admin/` — frontend.md (KPI modal, Prize modal, FB-ads tab additions), api.md (new + extended endpoints).
- `docs/metrics-analytics/` — model subdoc, aggregation change, new service, backfill script.
- `docs/tracking/` — attribution capture addition.
- `docs/internal-norm/norm-context.md` — new/extended Norm surfaces.
- `CUSTOMER.md` — third-party/attribution data capture change (§ per triggers).
- `BUSINESS.md` — §14b touch (ads-analytics surface gains packages-focus breakdown).

## 12. Tests

- `src/utils/metrics/__tests__/packages-focus.test.ts` (tsx script + `test:packages-focus` npm entry): derivation rule incl. case/whitespace tolerance, invalid values, `?packages=membership` → membership, multi-param URLs, non-URL strings.
- Aggregation math: per-focus subtotals sum to row totals; mixed-focus same-canonicalUrl ads split correctly; unknown-destination rows produce no subdoc.

## 13. Non-goals / documented follow-ups

- **TikTok destination resolver** (ad→URL mapping) + registering a TikTok ad-channel provider for dashboard spend — follow-up; the UI toggle and platform-keyed API are ready for it.
- **True-ROAS-per-focus UI** — future task; capture seeded now (§8), retro-derivation via `attributionAdId` possible.
- **Deeper-than-60-day Meta backfill** — not needed (feature predates data loss horizon); revisit only if requirements change.
- Splitting multi-URL creative spend across URLs — out of scope (existing first-URL rule kept).
