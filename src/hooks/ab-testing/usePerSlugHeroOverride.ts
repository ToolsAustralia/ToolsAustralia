"use client";

import { useVariantContext } from "@/components/ab-testing/VariantProvider";

/** Per-slug hero image override read from the active variant config.
 *  Each field is independently optional — caller composes desktop/mobile against
 *  whatever default it would otherwise use.
 *
 *  Consumers:
 *    - {@link PromoHero} — composes both desktop + mobile (inline, since it has
 *      direct access to useVariantContext).
 *    - the login page's rotating toolset card.
 *
 *  NOT a consumer: the prize builder. `PrizeShowcase` and `PrizeSpecificationsModal`
 *  used to compose hero overrides into the (now removed) gallery and modal hero; the
 *  builder shows the `{toolset}-{toolbox}` composite render, which is the prize itself
 *  rather than campaign art, so a per-slug hero override does not apply to it.
 *
 *  Any other landing-image consumer rendered inside `VariantAssignmentWrapper`
 *  should call this hook to stay consistent with the active A/B variant. Outside
 *  the wrapper this returns null (no override), which is the safe default. */
export function usePerSlugHeroOverride(slug: string | null | undefined): { desktop?: string; mobile?: string } | null {
  const { variantConfig } = useVariantContext();
  if (!slug) return null;
  const entry = variantConfig?.hero?.imageSrcBySlug?.[slug];
  return entry ?? null;
}
