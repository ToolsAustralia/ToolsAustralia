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

/**
 * Parses `?packages=`. Invalid or absent values return null so the caller falls back to its
 * normal (user-state) default. Returns the canonical `activeTab` tokens.
 */
export function parseMembershipPackagesTab(
  raw: string | null | undefined,
): "membership" | "one-time" | null {
  if (!raw) return null;
  const value = raw.toLowerCase().trim();
  return value === "one-time" || value === "membership" ? value : null;
}
