/**
 * getPartnerVisibility — read-only member tool.
 *
 * Returns the authenticated member's partner catalog access percentage and
 * the visible slice of brand offers (name + discount only — logo, gradient,
 * businessLink are intentionally omitted from the projection).
 *
 * Services used (injected via MemberToolDeps for testability):
 *   - findUserById(ctx.actor.userId)
 *   - resolvePartnerCatalogPlanId(user)
 *   - getPartnerCatalogAccessPercentForPlanId(planId)
 *   - getPartnerCatalogVisibleSliceLength(total, planId)
 *   - PARTNER_BRAND_OFFERS (injected via deps.partnerBrandOffers or real import)
 */

import { z } from "zod";
import { defineMemberTool, emptyInput, ToolDenied } from "./registry";
import type { MemberToolCtx, MemberToolDeps } from "./registry";

// ─── Response schema (strict — only name + discount, no id/logo/gradient/link) ─

const responseSchema = z
  .object({
    accessPercent: z.number(),
    visibleBrands: z.array(
      z.object({
        name: z.string(),
        discount: z.string(),
      }).strict()
    ),
  })
  .strict();

// ─── Handler ─────────────────────────────────────────────────────────────────

async function handler(ctx: MemberToolCtx, deps?: MemberToolDeps): Promise<unknown> {
  const { actor } = ctx;
  if (actor.kind !== "member") throw new ToolDenied("login_required");

  const findUser =
    deps?.findUserById ??
    (async (id: string) => {
      const { default: connectDB } = await import("@/lib/mongodb");
      const { default: User } = await import("@/models/User");
      await connectDB();
      return User.findById(id).lean<import("@/models/User").IUser>();
    });

  const user = await findUser(actor.userId);
  if (!user) throw new ToolDenied("user_not_found");

  let resolvePlanId: (user: import("@/models/User").IUser) => ReturnType<typeof import("@/utils/partner-discounts/partner-catalog-visibility").resolvePartnerCatalogPlanId>;
  let getAccessPct: (planId: string) => number;
  let getSliceLen: (total: number, planId: string | null) => number;

  if (deps?.resolvePartnerCatalogPlanId && deps.getPartnerCatalogAccessPercentForPlanId && deps.getPartnerCatalogVisibleSliceLength) {
    resolvePlanId = deps.resolvePartnerCatalogPlanId;
    getAccessPct = deps.getPartnerCatalogAccessPercentForPlanId;
    getSliceLen = deps.getPartnerCatalogVisibleSliceLength;
  } else {
    const visibility = await import("@/utils/partner-discounts/partner-catalog-visibility");
    resolvePlanId = deps?.resolvePartnerCatalogPlanId ?? visibility.resolvePartnerCatalogPlanId;
    getAccessPct = deps?.getPartnerCatalogAccessPercentForPlanId ?? visibility.getPartnerCatalogAccessPercentForPlanId;
    getSliceLen = deps?.getPartnerCatalogVisibleSliceLength ?? visibility.getPartnerCatalogVisibleSliceLength;
  }

  let offers: import("@/data/partnerBrandOffers").PartnerBrandOffer[];
  if (deps?.partnerBrandOffers) {
    offers = deps.partnerBrandOffers;
  } else {
    const { PARTNER_BRAND_OFFERS } = await import("@/data/partnerBrandOffers");
    offers = PARTNER_BRAND_OFFERS;
  }

  const planId = resolvePlanId(user);
  const accessPercent = planId ? getAccessPct(planId) : 0;
  const n = getSliceLen(offers.length, planId);
  const visible = offers.slice(0, n);

  return {
    accessPercent,
    visibleBrands: visible.map((offer) => ({
      name: offer.name,
      discount: offer.discount,
      // Intentionally omitting: id, logo, gradient, businessLink, discountMessage
    })),
  };
}

// ─── Registration ─────────────────────────────────────────────────────────────

export const getPartnerVisibilityTool = defineMemberTool({
  name: "getPartnerVisibility",
  description:
    "Return the authenticated member's partner catalog access percentage and the visible brand offers (name and discount text only). Does not expose logo URLs, brand links, or internal IDs.",
  inputSchema: emptyInput,
  responseSchema,
  piiScoped: true,
  handler,
});
