import { z } from "zod";

/**
 * Norm projection of the partner-discount page funnel.
 *
 * PII-safe by construction: this endpoint returns only aggregate counts. No userId, no
 * anonymousId, no offer names — there is nothing per-person in the shape at all, which is a
 * stronger boundary than the `firstName` + opaque-userId rule the user-facing endpoints use.
 */

const SurfaceSchema = z
  .enum(["discount", "catalogue"])
  .describe(
    "Which catalogue: `discount` is the PUBLIC /discount page (readable signed-out; its job is converting non-members), `catalogue` is the members-only /my-account/rewards/catalogue."
  );

const DateRangeSchema = z.object({
  start: z.string().describe("ISO 8601 UTC"),
  end: z.string().describe("ISO 8601 UTC"),
  visitsRetainedFrom: z
    .string()
    .describe(
      "ISO 8601 UTC. Visit rows are TTL-deleted after 90 days; User and PaymentEvent are not. Ranges are clamped to this so every number comes from one population."
    ),
  clampedToRetention: z
    .boolean()
    .describe("True when the requested start predated the retention floor and was moved up to it"),
});

const SurfaceMetricsSchema = z.object({
  surface: SurfaceSchema,
  visits: z
    .number()
    .int()
    .nonnegative()
    .describe("Unique VISITORS. Every count in this object is visitors, not events."),
  signedInVisits: z.number().int().nonnegative().describe("Of visits, those signed in at the time"),
  interacted: z
    .number()
    .int()
    .nonnegative()
    .describe("Touched search, a filter, a category or the sort"),
  offerOpeners: z.number().int().nonnegative().describe("Opened at least one offer"),
  lockedOfferOpeners: z
    .number()
    .int()
    .nonnegative()
    .describe(
      "Opened at least one offer ABOVE their access level — the upgrade-intent signal. A SUBSET of offerOpeners, never a separate population."
    ),
  seamRendered: z
    .number()
    .int()
    .nonnegative()
    .describe(
      "⚠️ THE DENOMINATOR for seamReachRate — never use `visits`. The access seam is only drawn on /discount under the access-level sort, and never for a viewer who can reach everything; the members' catalogue never draws one at all. Dividing by visits would count people who had no seam as people who failed to reach it."
    ),
  seamReached: z
    .number()
    .int()
    .nonnegative()
    .describe("Of seamRendered, those who scrolled the seam into view"),
  seamReachRate: z.number().describe("seamReached / seamRendered as a percent (0-100)"),
  unlockClickers: z
    .number()
    .int()
    .nonnegative()
    .describe("Clicked an unlock CTA — asked what membership opens a locked offer"),
  portalHandoffs: z
    .number()
    .int()
    .nonnegative()
    .describe(
      "Started an SSO hand-off into the MyRewards portal. This is the LAST observable step: the vendor sends no activity data back, so actual redemption is invisible to us."
    ),
  zeroResultSearchers: z
    .number()
    .int()
    .nonnegative()
    .describe(
      "Ran a search that returned nothing. Our catalogue snapshot is a known-incomplete subset of the vendor's portal, so this counts how often someone hit that gap."
    ),
  signups: z
    .number()
    .int()
    .nonnegative()
    .describe(
      "Accounts registered by a visitor to this surface, matched on signupAttribution.anonymousId and dated by the attribution touch (not account createdAt)."
    ),
  conversions: z
    .number()
    .int()
    .nonnegative()
    .describe("Of those signups, the ones that then purchased. Renewals and refunded rows excluded."),
  revenue: z.number().nonnegative().describe("AUD dollars"),
  visitToSignupRate: z.number().describe("Percent (0-100)"),
  signupToConversionRate: z.number().describe("Percent (0-100)"),
  overallConversionRate: z.number().describe("Percent (0-100)"),
});

export const NormPartnerDiscountAnalyticsSummarySchema = z.object({
  dateRange: DateRangeSchema,
  totalVisits: z
    .number()
    .int()
    .nonnegative()
    .describe(
      "⚠️ Deduped ACROSS both surfaces, and deliberately NOT the sum of bySurface[].visits — one person who used the public page and the members' catalogue is one visitor here and one row in each surface. Never present the surface rows as addends of this."
    ),
  totalSignups: z.number().int().nonnegative().describe("Deduped across surfaces, as above"),
  totalConversions: z.number().int().nonnegative().describe("Deduped across surfaces, as above"),
  totalRevenue: z.number().nonnegative().describe("AUD dollars, deduped across surfaces"),
  bySurface: z.array(SurfaceMetricsSchema),
});
