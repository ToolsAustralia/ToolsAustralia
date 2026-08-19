// src/lib/internal-norm/schemas/brand-performance.ts
//
// Norm response schema for the analytics.brand-performance read endpoint.
//
// Ad spend and return per BRAND LANE — toolset (ryobi/milwaukee/dewalt/makita/hikoki) or
// toolbox (sidchrome/kincrome/milwaukee/gearwrench). Pure aggregates, NO PII: rows are brands,
// not people, and the only identity-adjacent field is a distinct `userCount` per acquisition
// category (a count, never an id).
//
// ⚠️ Milwaukee is a member of BOTH lanes. A row labelled "Milwaukee" means a different
// population depending on `meta.lane`, so any consumer must read the lane before naming a row.
import { z } from "zod";

/** One acquisition bucket's rollup within a brand row. Mirrors PlatformByCategoryEntry. */
const BrandCategorySchema = z.object({
  category: z.enum([
    "membership-purchase",
    "one-time-purchase",
    "additional-one-time",
    "mini-draw",
    "upsell",
  ]),
  revenue: z.number(), // AUD dollars
  purchaseCount: z.number(),
  userCount: z.number(), // DISTINCT buyers — a count only, never an identity
});

/**
 * A brand row. Count fields are `number`, not `int`: under the toolbox lane a bare
 * `/promotions/<toolset>` page's spend and conversions are SPLIT across lanes in proportion to
 * the toolbox mix its visitors actually built, which yields fractional per-row counts. The
 * split conserves totals exactly; only the per-row shares are fractional.
 */
const BrandPerformanceRowSchema = z.object({
  laneId: z.string(), // e.g. "ryobi" (toolset) or "kincrome" (toolbox)
  displayName: z.string(),
  logoPath: z.string(),
  spend: z.number(), // AUD dollars, always URL-keyed
  revenue: z.number(), // AUD dollars
  roas: z.number(), // revenue / spend; 0 when spend is 0. Recomputed from totals, never averaged
  purchases: z.number(), // all five acquisition categories
  newMemberships: z.number().nullable(), // null under basis=platform (no membership split exists there)
  newMembershipRevenue: z.number().nullable(),
  newMembershipCountPct: z.number().nullable(), // percent; 0 when no purchases, null when unavailable
  newMembershipRevenuePct: z.number().nullable(),
  byCategory: z.array(BrandCategorySchema), // empty under basis=platform
  platforms: z.array(z.enum(["meta", "tiktok"])),
});

export const NormBrandPerformanceSchema = z.object({
  meta: z.object({
    startDate: z.string(), // yyyy-MM-dd, AEST
    endDate: z.string(),
    lane: z.enum(["toolset", "toolbox"]),
    basis: z.enum(["landing-page", "built-prize", "platform"]),
    platform: z.enum(["meta", "tiktok", "all"]),
    currency: z.literal("AUD"),
    /** True when >1 platform reported its OWN revenue under basis=platform — double-counts. */
    blendedPlatformRevenue: z.boolean(),
    /**
     * How bare-toolset-page spend was assigned to toolbox lanes. null on the toolset lane
     * (the URL names the brand exactly, so nothing is modelled).
     *   observed-mix  split by the toolbox mix that page's visitors actually built
     *   page-default  fallback with no visit data in window — SKEWS toward the page default
     *   mixed         both models, on different pages
     */
    toolboxSpendModel: z.enum(["observed-mix", "page-default", "mixed"]).nullable(),
    /** Visitor builds behind an observed-mix split. Small samples divide large spend — judge accordingly. */
    toolboxMixVisitors: z.number().nullable(),
    comparison: z.object({ startDate: z.string(), endDate: z.string() }).optional(),
  }),
  rows: z.array(BrandPerformanceRowSchema),
  /** Spend/outcomes that resolved to no lane. INCLUDED in totals so they reconcile. */
  unattributed: BrandPerformanceRowSchema.nullable(),
  totals: BrandPerformanceRowSchema.omit({ platforms: true }),
});

export type NormBrandPerformance = z.infer<typeof NormBrandPerformanceSchema>;
