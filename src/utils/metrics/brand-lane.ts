/**
 * Brand-lane resolution for admin analytics — the ONE mapping from a promotion identifier to
 * the brand row it belongs in.
 *
 * Tools Australia prizes have two brand axes, and every analytics surface that groups by brand
 * has to agree on both:
 *
 *   toolset — the power-tool brand   (ryobi | milwaukee | dewalt | makita | hikoki)
 *   toolbox — the storage brand      (sidchrome | kincrome | milwaukee | gearwrench)
 *
 * ⚠️ Milwaukee is a member of BOTH lanes. A "Milwaukee" row means a different population
 * depending on the lane, so any UI built on this must make the active lane unmistakable.
 *
 * ── Why one module rather than a resolver per caller ──────────────────────────────────────
 *
 * Brand analytics joins two sources that can only ever be keyed differently:
 *
 *   SPEND    comes from `LandingPageMetricsDaily`, keyed on the CANONICAL URL. Query strings
 *            are stripped by `canonicalizeLandingUrl`, so the visitor's `?toolbox=` selection
 *            is invisible here — spend can only ever be attributed to the page an ad bought.
 *   OUTCOMES come from `PaymentEvent`, keyed on `data.promotionSlug` (the landing page) or
 *            `data.builtPrizeSlug` (the combination the buyer actually had on screen).
 *
 * Applying the SAME lane rules to both keys is what makes the two sides bucket identically
 * instead of by coincidence. Fork this logic and the ad spend and the revenue it produced end
 * up under different brand rows with nothing to flag it.
 *
 * Everything derives from `PRIZE_LANE_SLUGS` / `TOOLBOX_LANE_ORDER` in
 * `src/config/promo-landing-slugs.ts` (server-safe). The prize-builder's own `TOOLBOXES` /
 * `TOOLSETS` constants live under `src/components/**` and must never be imported here — the
 * repository and service layers consume this module.
 */

import {
  PRIZE_LANE_SLUGS,
  getPageDefaultPrizeSlug,
  isToolsetLandingSlug,
  type ToolboxLaneId,
  type ToolsetLandingSlug,
} from "@/config/promo-landing-slugs";

/** Which brand axis a rollup groups by. */
export type BrandLane = "toolset" | "toolbox";

/** A resolved lane id — a toolset slug or a toolbox lane id depending on the `lane` asked for. */
export type BrandLaneId = ToolsetLandingSlug | ToolboxLaneId;

/**
 * builtPrizeSlug -> its two lanes, built once from the registry.
 *
 * Keyed by plain `string`, not `PrizeSlug`: the values arriving here come off `PaymentEvent.data`
 * and canonical URLs — untrusted runtime strings, not compile-time-known slugs. Narrowing the key
 * would force every caller to assert a type it cannot actually guarantee.
 */
const LANES_BY_PRIZE_SLUG = new Map<string, { toolset: ToolsetLandingSlug; toolbox: ToolboxLaneId }>(
  PRIZE_LANE_SLUGS.map(({ slug, toolset, toolbox }) => [slug as string, { toolset, toolbox }]),
);

/**
 * The lane ids of a built-prize slug (e.g. `ryobi-kincrome` -> toolset `ryobi`, toolbox
 * `kincrome`). EXACT — a built prize always names both halves.
 *
 * Returns null for anything not in the registry, which deliberately includes `cash-prize`:
 * the cash opt-out has no toolbox lane, so it is DROPPED from lane rollups rather than
 * bucketed somewhere plausible-looking. Callers surface dropped rows as "Unattributed".
 */
export function resolveBrandLaneFromBuiltPrize(
  builtPrizeSlug: string,
  lane: BrandLane,
): BrandLaneId | null {
  const lanes = LANES_BY_PRIZE_SLUG.get(builtPrizeSlug.toLowerCase().trim());
  return lanes ? lanes[lane] : null;
}

/**
 * The lane ids of a PROMOTION PAGE slug — the `<slug>` of `/promotions/<slug>`.
 *
 * Two shapes arrive here:
 *  - a toolset landing slug (`ryobi`), which names only the toolset;
 *  - an evergreen prize slug (`ryobi-kincrome`), which names both.
 *
 * For the toolbox lane on a bare toolset page there IS no toolbox in the identifier, so it
 * resolves through `getPageDefaultPrizeSlug` — the combination the page renders on first
 * paint. That is the honest answer for both sides of the join: it is the toolbox the ad's
 * traffic actually saw, and it is exactly what the server records for a visitor who never
 * touched the builder (`builtPrizeSlug` reports the page default in that case).
 *
 * ⚠️ Known, accepted skew: because `getDefaultPrizeForToolsetSlug` prefers the Milwaukee
 * toolbox, bare-toolset-URL spend concentrates on Milwaukee in the toolbox view. That is the
 * literal truth of what was advertised, not an error to correct — the built-prize basis is the
 * lens that shows how demand redistributes away from the default.
 */
export function resolveBrandLaneFromPromoSlug(
  slug: string,
  lane: BrandLane,
): BrandLaneId | null {
  const normalized = slug.toLowerCase().trim();
  if (!normalized) return null;

  // A bare toolset page: the toolset is the slug itself; the toolbox is the page default.
  if (isToolsetLandingSlug(normalized)) {
    if (lane === "toolset") return normalized;
    return resolveBrandLaneFromBuiltPrize(getPageDefaultPrizeSlug(normalized), "toolbox");
  }

  return resolveBrandLaneFromBuiltPrize(normalized, lane);
}

/**
 * The lane ids behind a canonical landing URL — how AD SPEND is bucketed.
 *
 * Extracts the `/promotions/<slug>` segment and defers to `resolveBrandLaneFromPromoSlug`, so
 * spend and server-side outcomes go through identical rules.
 *
 * Returns null for any URL that is not a promotion page — including the
 * `unknown://meta-ad/<id>` placeholder rows the sync writes when a platform cannot resolve an
 * ad's destination. Those become "Unattributed" spend rather than silently vanishing, which is
 * what lets a brand table's Total still reconcile with the ad account.
 */
export function resolveBrandLaneFromCanonicalUrl(
  canonicalUrl: string,
  lane: BrandLane,
): BrandLaneId | null {
  const match = canonicalUrl.match(/\/promotions\/([^/?#]+)/);
  return match ? resolveBrandLaneFromPromoSlug(match[1], lane) : null;
}

/**
 * A Mongo `$switch` expression mapping a BUILT-PRIZE slug field to its lane id, for aggregation
 * pipelines that must bucket in the database rather than in JS.
 *
 * Shared by `BrandPerformanceService` and `PromoAnalyticsRepository.getAggregatedByToolbox` so
 * the dashboard's Brand Performance section and the Page Analytics tab cannot disagree about
 * which lane a purchase belongs to — the two surfaces are allowed to answer different
 * questions, but never to contradict each other on the same one.
 *
 * Anything unrecognised (notably `cash-prize`) resolves to null and is dropped by the caller's
 * `$match`, mirroring `resolveBrandLaneFromBuiltPrize`.
 *
 * @param field a field path INCLUDING the `$` prefix, e.g. `"$data.builtPrizeSlug"`
 */
export function brandLaneSwitchExpr(field: string, lane: BrandLane) {
  return {
    $switch: {
      branches: PRIZE_LANE_SLUGS.map(({ slug, toolset, toolbox }) => ({
        case: { $eq: [field, slug] },
        then: lane === "toolset" ? toolset : toolbox,
      })),
      default: null,
    },
  };
}

/** Every built-prize slug the registry knows — the `$in` guard for lane aggregations. */
export const BRAND_LANE_PRIZE_SLUGS: string[] = PRIZE_LANE_SLUGS.map((l) => l.slug);

/** A share of one URL's spend assigned to a lane. Weights for a URL always sum to 1. */
export interface BrandLaneAllocation {
  laneId: string;
  weight: number;
}

/** Observed visitor mix on a toolset landing page, from `getToolboxMixByToolsetPage`. */
export interface ToolboxMixRow {
  slug: string;
  toolbox: string;
  visitors: number;
}

/** Which model produced a toolbox allocation — surfaced so the reader knows what they're seeing. */
export type ToolboxSpendModel = "observed-mix" | "page-default";

/**
 * How ONE canonical URL's spend divides across lanes.
 *
 * Every case except one returns a single lane at weight 1. The exception is the reason this
 * function exists: **a bare `/promotions/<toolset>` page under the toolbox lane names no
 * toolbox at all**, so its spend can only be assigned by modelling.
 *
 * Two models, in preference order:
 *
 *  1. `observed-mix` — split by how the visitors that page actually drew distributed across
 *     toolboxes in the same window (`PromoAnalyticsVisit`). Spend follows the traffic it bought.
 *  2. `page-default` — everything to the combination the page renders on first paint. Used only
 *     when there is no visit data for that page in the window (short windows, or windows older
 *     than the `PromoAnalyticsVisit` TTL).
 *
 * Model 2 was the original behaviour and it SKEWS: `getDefaultPrizeForToolsetSlug` prefers the
 * Milwaukee toolbox, so every toolset page's spend piled onto Milwaukee, producing a row that
 * measured the default rather than the market. Model 1 is the correction. The caller reports
 * which model was used — a modelled split must never be presented as a measurement.
 *
 * Weights always sum to 1, so no spend is created or lost and totals still reconcile.
 */
export function allocateBrandLanes(
  canonicalUrl: string,
  lane: BrandLane,
  mixBySlug?: Map<string, ToolboxMixRow[]>,
): { allocations: BrandLaneAllocation[]; model: ToolboxSpendModel | null } {
  const match = canonicalUrl.match(/\/promotions\/([^/?#]+)/);
  if (!match) return { allocations: [], model: null };

  const slug = match[1].toLowerCase().trim();

  // Everything except "toolbox lane on a bare toolset page" is an exact, single-lane answer.
  if (lane === "toolset" || !isToolsetLandingSlug(slug)) {
    const laneId = resolveBrandLaneFromPromoSlug(slug, lane);
    return { allocations: laneId ? [{ laneId, weight: 1 }] : [], model: null };
  }

  const mix = mixBySlug?.get(slug)?.filter((r) => r.visitors > 0) ?? [];
  const totalVisitors = mix.reduce((t, r) => t + r.visitors, 0);

  if (totalVisitors > 0) {
    return {
      allocations: mix.map((r) => ({ laneId: r.toolbox, weight: r.visitors / totalVisitors })),
      model: "observed-mix",
    };
  }

  const fallback = resolveBrandLaneFromBuiltPrize(getPageDefaultPrizeSlug(slug), "toolbox");
  return {
    allocations: fallback ? [{ laneId: fallback, weight: 1 }] : [],
    model: "page-default",
  };
}

/** Group mix rows by page slug for `allocateBrandLanes`. */
export function indexToolboxMix(rows: ToolboxMixRow[]): Map<string, ToolboxMixRow[]> {
  const bySlug = new Map<string, ToolboxMixRow[]>();
  for (const r of rows) {
    const key = r.slug.toLowerCase();
    const list = bySlug.get(key);
    if (list) list.push(r);
    else bySlug.set(key, [r]);
  }
  return bySlug;
}
