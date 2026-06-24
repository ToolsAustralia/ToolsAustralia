/**
 * Server-side partner-catalog tier resolution for the MyRewards/iGoDirect SSO `member_level`.
 *
 * THE N1 FIX — why this module exists
 * -----------------------------------
 * `resolvePartnerCatalogPlanId` (partner-catalog-visibility.ts) reads
 * `user.subscriptionPackageData` and `user.enrichedOneTimePackages` — fields that
 * **do not exist on the stored Mongoose `IUser`**. They are server-constructed only
 * inside `GET /api/users/[id]` (≈ lines 67-147). A server path (the SSO route) that
 * hands a raw or merely queue-reconciled doc to the resolver would **mis-tier a
 * paying subscriber**: those fields come back `undefined`, the subscription branch
 * is skipped, and the resolver falls through to `null`.
 *
 * Two subtleties this module gets right (and the naive shortcut gets wrong):
 *  - The subscription package is resolved through `getEffectiveBenefits`, NOT the
 *    raw `subscription.packageId`. During a downgrade-preservation window the
 *    *effective* package differs from the stored id, so reading the raw id would
 *    reintroduce the downgrade bug the route enrichment exists to avoid.
 *  - `resolveMemberLevel` is **fail-closed**: an unresolved plan returns `null`
 *    (the caller omits `member_level` / denies) — it never inherits the
 *    `getPartnerCatalogAccessPercentForPlanId` "unknown → 100%" fallback.
 *
 * This mirrors the route's enrichment so the SSO/offers path tiers identically to
 * the dashboard. See docs/auth/igodirect-sso-implementation-plan.md §3 (N1).
 *
 * @module utils/partner-discounts/member-level
 */

import type { IUser } from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import { getEffectiveBenefits } from "@/utils/membership/benefit-resolution";
import {
  resolvePartnerCatalogPlanId,
  getPartnerCatalogAccessPercentForPlanId,
} from "@/utils/partner-discounts/partner-catalog-visibility";

/** The context shape `resolvePartnerCatalogPlanId` reads (extracted without exporting its private type). */
type PartnerCatalogContext = NonNullable<Parameters<typeof resolvePartnerCatalogPlanId>[0]>;
type EnrichedOneTimePackage = NonNullable<PartnerCatalogContext["enrichedOneTimePackages"]>[number];
type SubscriptionPackageData = PartnerCatalogContext["subscriptionPackageData"];

/**
 * Build the enriched context `resolvePartnerCatalogPlanId` needs from a raw `IUser`.
 *
 * Mirrors the enrichment in `GET /api/users/[id]`: the subscription package via
 * `getEffectiveBenefits` (downgrade-preservation aware), and each one-time package
 * hydrated with its static `packageData`. Exported so the offers route can reuse it.
 */
export function buildPartnerCatalogContext(user: IUser): PartnerCatalogContext {
  let subscriptionPackageData: SubscriptionPackageData;
  if (user.subscription?.packageId && user.subscription?.isActive) {
    const effective = getEffectiveBenefits(user);
    // Match the route: prefer the effective (downgrade-preserved) package; otherwise
    // a direct static lookup of the stored id. `effective.benefits` may be undefined
    // if a preserved package is missing from static data — the guard below handles it.
    const pkg = effective ? effective.benefits : getPackageById(String(user.subscription.packageId));
    if (pkg) subscriptionPackageData = pkg as unknown as SubscriptionPackageData;
  }

  const enrichedOneTimePackages: EnrichedOneTimePackage[] = [];
  for (const otp of user.oneTimePackages ?? []) {
    const packageData = getPackageById(String(otp.packageId));
    if (packageData) {
      enrichedOneTimePackages.push({
        packageId: String(otp.packageId),
        isActive: otp.isActive ?? false,
        purchaseDate: new Date(otp.purchaseDate).toISOString(),
        packageData: packageData as unknown as EnrichedOneTimePackage["packageData"],
      });
    }
  }

  // The resolver reads only `subscription.isActive`, the two enriched fields, and the
  // queue. We assemble exactly those; the context type is a `(Partial<UserData> |
  // Partial<IUser>) & {…}` union that an object literal can't satisfy structurally
  // (the UI callers pass a full `UserData`), so we assert it once here. Each field is
  // individually typed above, so this asserts only the awkward union shape, not values.
  const context = {
    subscription: { isActive: user.subscription?.isActive ?? false },
    subscriptionPackageData,
    enrichedOneTimePackages,
    partnerDiscountQueue: user.partnerDiscountQueue,
  };
  return context as unknown as PartnerCatalogContext;
}

export interface ResolvedMemberLevel {
  /** The resolved effective plan id (e.g. a Boss-subscription plan id). */
  planId: string;
  /** Partner-catalog access % — the value we would send as MyRewards `member_level`. */
  percent: number;
}

/**
 * Resolve a member's effective partner-catalog tier for the SSO `member_level`.
 *
 * **FAIL-CLOSED:** returns `null` when no active partner-catalog plan resolves — the
 * caller MUST treat `null` as "no tier" (deny / omit `member_level`) and never fall
 * back to a default percent. Pairs with the access gate
 * (`getPartnerDiscountAccessInfo`): callers should gate on `hasAccess` first and only
 * call this when access is active, in which case it returns the correct tier from the
 * reconciled doc.
 *
 * @param user a partner-discount-queue-reconciled `IUser` (caller runs
 *   `processPartnerDiscountQueue` + `user.save()` first).
 */
export function resolveMemberLevel(user: IUser): ResolvedMemberLevel | null {
  const planId = resolvePartnerCatalogPlanId(buildPartnerCatalogContext(user));
  if (!planId) return null; // fail-closed — never default to 100%
  return { planId, percent: getPartnerCatalogAccessPercentForPlanId(planId) };
}
