/**
 * Partner-access ring summary — the "access %" instrument the my-account hero shows
 * (AccessRing), resolved server-side from a raw `IUser`.
 *
 * Mirrors `useDashboardState`'s hero-ring derivation exactly (same primitives, same
 * precedence, same past-due nuance) so an admin looking at the user-detail modal sees
 * the SAME ring the member sees on /my-account:
 *  - state precedence: pastdue > active > onetime > none (`deriveDashboardAccountState`).
 *  - percent from the SHARED partner-catalog resolver (queue-aware, downgrade-preservation
 *    aware via `buildPartnerCatalogContext`) — never guessed from the stored packageId.
 *  - past-due: membership partner access is PAUSED, but a one-time pack window the member
 *    paid for is kept (guard on `source !== "membership"` so a stale-active membership
 *    queue row is never surfaced as live access).
 *
 * @module utils/partner-discounts/partner-access-ring
 */

import type { IUser } from "@/models/User";
import type { DashboardAccountState } from "@/utils/dashboard/dashboard-state-theme";
import { deriveDashboardAccountState } from "@/utils/dashboard/derive-dashboard-account-state";
import { hasFailedRenewal } from "@/utils/subscription/subscription-helpers";
import { getPartnerDiscountAccessInfo } from "@/utils/membership/benefit-resolution";
import { buildPartnerCatalogContext } from "@/utils/partner-discounts/member-level";
import {
  resolvePartnerCatalogPlanId,
  getPartnerCatalogAccessPercentForPlanId,
} from "@/utils/partner-discounts/partner-catalog-visibility";

export interface PartnerAccessRing {
  /** Account state driving the ring's look: pastdue > active > onetime > none. */
  state: DashboardAccountState;
  /** Partner-catalogue access % (0 when locked; membership access pauses while past due). */
  percent: number;
  /** Time-gated one-time window label, e.g. "5 days" / "24hr" (null otherwise). */
  expiryLabel: string | null;
}

/**
 * Human label for a time-gated partner-access window. Single source for the
 * "{N} days left" ring caption (my-account hero + admin user-detail modal).
 */
export function formatPartnerAccessExpiryLabel(days: number, hours: number): string | null {
  if (days > 1) return `${days} days`;
  if (days === 1) return "1 day";
  if (hours > 0) return `${hours}hr`;
  return null;
}

/** Resolve the partner-access ring for a raw (unenriched) `IUser`. Pure, read-only. */
export function resolvePartnerAccessRing(user: IUser): PartnerAccessRing {
  const hasActiveMembership = user.subscription?.isActive === true;
  const isPastDue = hasFailedRenewal(user);
  // Raw-doc equivalent of the dashboard's `getActivePackage(...).source === "one-time"`:
  // only consulted when there is no active membership (precedence above).
  const hasActiveOneTime = (user.oneTimePackages ?? []).some((p) => p.isActive);

  const state = deriveDashboardAccountState({ hasActiveMembership, isPastDue, hasActiveOneTime });

  let percent = 0;
  let expiryLabel: string | null = null;

  if (state === "active" || state === "onetime") {
    const planId = resolvePartnerCatalogPlanId(buildPartnerCatalogContext(user));
    percent = planId ? getPartnerCatalogAccessPercentForPlanId(planId) : 0;
    if (state === "onetime") {
      const info = getPartnerDiscountAccessInfo(user);
      expiryLabel = info.hasAccess
        ? formatPartnerAccessExpiryLabel(info.daysRemaining, info.hoursRemaining)
        : null;
    }
  } else if (state === "pastdue") {
    // A past-due member KEEPS any one-time pack partner window they paid for — that
    // window is independent of subscription status. Membership-sourced access is
    // paused, never surfaced as live.
    const info = getPartnerDiscountAccessInfo(user);
    if (info.hasAccess && info.source !== "membership") {
      const planId = resolvePartnerCatalogPlanId(buildPartnerCatalogContext(user));
      percent = planId ? getPartnerCatalogAccessPercentForPlanId(planId) : 0;
      expiryLabel = formatPartnerAccessExpiryLabel(info.daysRemaining, info.hoursRemaining);
    }
  }

  return { state, percent, expiryLabel };
}
