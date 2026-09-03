import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import {
  MonthlyCampaignRowSchema,
  NormMonthlyCouponCampaignsListSchema,
} from "@/lib/internal-norm/schemas/monthly-coupon";
import {
  listCampaignsWithRedemptionCounts,
  type MonthlyCampaignListRow,
} from "@/services/redeemables";

const QuerySchema = z.object({
  monthKey: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

/**
 * Project the service rows into the Norm wire shape, DROPPING any row that cannot satisfy
 * `MonthlyCampaignRowSchema`.
 *
 * Why this guard exists: a campaign written straight to Mongo (a probe, a migration, a raw
 * driver insert) bypasses both Mongoose's `required` validators and its `timestamps: true`,
 * so fields that `MonthlyCampaignListRow` types as present can be absent at runtime.
 * Production currently holds several such rows. Two things then went wrong here and nowhere
 * else: `startsAt/createdAt/updatedAt.toISOString()` threw outright, and rows that survived
 * that still failed withNorm's whole-response validation. Either way the endpoint returned
 * 500 for EVERY caller, so Norm could read no campaign at all — and because it could not
 * obtain a campaign id, `/v1/monthly-coupon/campaign/:id/redemptions` was unreachable too.
 *
 * The sibling admin route is unaffected: it passes the Dates through raw rather than
 * serialising them, and has no response-schema validation. That asymmetry is why this bug
 * was invisible in the admin UI.
 *
 * Dropping a malformed row is the right trade here — the alternative is Norm seeing nothing.
 * The `console.error` names the row so it can be repaired; console.error survives the
 * production build (`next.config.ts` strips only log/info/debug/warn).
 */
function projectUsableRows(rows: MonthlyCampaignListRow[]) {
  const usable: z.infer<typeof MonthlyCampaignRowSchema>[] = [];

  for (const row of rows) {
    // Guard the serialisation itself — `.toISOString()` on an absent Date throws before
    // any schema could catch it.
    if (!row.startsAt || !row.createdAt || !row.updatedAt) {
      console.error(
        `[norm] monthly-coupon.campaigns.list: dropping campaign ${row.id} (code=${row.code ?? "?"}) — ` +
          `missing startsAt/createdAt/updatedAt. Row bypassed Mongoose; repair or remove it.`,
      );
      continue;
    }

    const candidate = {
      id: row.id,
      monthKey: row.monthKey,
      name: row.name,
      displayLabel: row.displayLabel,
      entriesAmount: row.entriesAmount,
      campaignMode: row.campaignMode,
      targetingMode: row.targetingMode,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt ? row.endsAt.toISOString() : null,
      neverExpires: row.neverExpires,
      validForHours: row.validForHours,
      isActive: row.isActive,
      code: row.code,
      requiresPurchase: row.requiresPurchase,
      purchaseRequirement: row.purchaseRequirement,
      segmentConfig: row.segmentConfig
        ? {
            minInactiveDays: row.segmentConfig.minInactiveDays,
            maxInactiveDays: row.segmentConfig.maxInactiveDays,
            requiresEmailVerified: row.segmentConfig.requiresEmailVerified,
            requiresRecentPurchaseDays: row.segmentConfig.requiresRecentPurchaseDays,
            includeUserIdsCount: row.segmentConfig.includeUserIds?.length,
            excludeUserIdsCount: row.segmentConfig.excludeUserIds?.length,
            states: row.segmentConfig.states,
            membershipTiers: row.segmentConfig.membershipTiers,
            topEntriesPercent: row.segmentConfig.topEntriesPercent,
          }
        : undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      redeemedCount: row.redeemedCount,
      issuanceCount: row.issuanceCount,
    };

    // Validate against the same contract withNorm enforces, so one bad row is dropped here
    // rather than failing the whole response there.
    const check = MonthlyCampaignRowSchema.safeParse(candidate);
    if (!check.success) {
      console.error(
        `[norm] monthly-coupon.campaigns.list: dropping campaign ${row.id} (code=${row.code ?? "?"}) — ` +
          `fails row schema: ${check.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      );
      continue;
    }
    usable.push(check.data);
  }

  return usable;
}

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "monthly-coupon.campaigns.list",
    requiredPermission: "promos.view",
    responseSchema: NormMonthlyCouponCampaignsListSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query", parsed.error.issues);
    }
    const rows = await listCampaignsWithRedemptionCounts(
      parsed.data.monthKey ? { monthKey: parsed.data.monthKey } : undefined,
    );
    const data = projectUsableRows(rows);
    return ctx.ok({ data, count: data.length });
  },
);
