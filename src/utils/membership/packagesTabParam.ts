/**
 * Membership section "packages" tab URL param.
 *
 * Pre-selects the One-Time vs Membership Packs toggle from the landing URL, e.g.
 * `/promotions/makita?packages=one-time`. Used so a one-time-focused ad creative opens the
 * section on the One-Time tab while the visitor can still toggle back to Membership Packs.
 *
 * Mirrors the `?toolbox=` convention (see prize-selection/utils.ts): the value reuses the
 * canonical `activeTab` tokens ("membership" | "one-time"), and the default (membership) is
 * expressed by OMITTING the param so organic URLs stay clean.
 */

/** Query key that pre-selects the membership section's packages tab. */
export const MEMBERSHIP_PACKAGES_QUERY_PARAM = "packages";

/** The canonical `activeTab` tokens, shared by the section, PromoBanner and this param. */
export type MembershipPackagesTab = "membership" | "one-time";

/**
 * Parses `?packages=`. Invalid or absent values return null so the caller falls back to its
 * normal (user-state) default. Returns the canonical `activeTab` tokens.
 */
export function parseMembershipPackagesTab(
  raw: string | null | undefined,
): MembershipPackagesTab | null {
  if (!raw) return null;
  const value = raw.toLowerCase().trim();
  return value === "one-time" || value === "membership" ? value : null;
}

/**
 * Writes the chosen tab onto the current path, preserving every other param (UTMs, `aff`,
 * `toolbox`/`toolset`, `openMembership`).
 *
 * BOTH values are written explicitly, including the "membership" default — the same choice
 * `buildPrizeSelectionHref` makes for the `?toolbox=`/`?toolset=` lanes, and for the same reason:
 * the PRESENCE of the param is what distinguishes "the visitor picked this tab" from "never
 * touched the toggle". That distinction is load-bearing here, not cosmetic — MembershipSection's
 * user-state default effect bails when the param is present, so dropping it on a toggle back to
 * Membership would let a later `userData` refetch silently override a manual choice.
 *
 * Omitting the param still means "default" on the way IN (that is how ad creatives express
 * membership-focus, see the docblock above) — this only ever adds a param a visitor asked for by
 * clicking, so an untouched URL stays clean.
 */
export function buildMembershipPackagesHref(
  pathname: string,
  currentSearchParams: URLSearchParams,
  tab: MembershipPackagesTab,
): string {
  const params = new URLSearchParams(currentSearchParams.toString());
  params.set(MEMBERSHIP_PACKAGES_QUERY_PARAM, tab);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
