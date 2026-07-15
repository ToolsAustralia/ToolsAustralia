"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { useMyAccountData } from "@/hooks/queries";
import type { UserData } from "@/hooks/queries/useUserQueries";
import { useUserMajorDrawStats, useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";
import { useDashboardEntryDisplay } from "@/hooks/useDashboardEntryDisplay";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { getActivePackage, type ActivePackageUserInput } from "@/utils/membership/get-active-package";
import { hasAdditionalPackageAccess } from "@/utils/membership/has-additional-package-access";
import { hasFailedRenewal } from "@/utils/subscription/subscription-helpers";
import { getPastDueRenewalPreview } from "@/utils/subscription/past-due-renewal-preview";
import { calculateRenewalEntries } from "@/utils/payment/subscription-entries-calculator";
import { TIER_HEX, tierKeyFromName, type TierKey } from "@/utils/membership/tier-visuals";
import { getPartnerCatalogAccessPercentForPlanId, resolvePartnerCatalogPlanId } from "@/utils/partner-discounts/partner-catalog-visibility";
import { formatPartnerAccessExpiryLabel } from "@/utils/partner-discounts/partner-access-ring";
import { getPartnerDiscountAccessInfo } from "@/utils/membership/benefit-resolution";
import {
  deriveDashboardAccountState,
} from "@/utils/dashboard/derive-dashboard-account-state";
import {
  getDashboardStateTheme,
  type DashboardAccountState,
  type DashboardStateTheme,
} from "@/utils/dashboard/dashboard-state-theme";
import type { IUser } from "@/models/User";

const TIER_LABEL: Record<TierKey, string> = { tradie: "Tradie", foreman: "Foreman", boss: "Boss" };

export interface DashboardStateResult {
  isLoading: boolean;
  acct: DashboardAccountState;
  tierKey: TierKey | null;
  tierHex: string | null;
  tierLabel: string | null;
  /** SUBSCRIPTION tier from the persisted package — non-null even when past-due/inactive (unlike
   *  tierKey/tierLabel/tierHex, which come from getActivePackage). Marks the current tier in the
   *  past-due list + drives the hero/current-plan tier identity so they don't blank out when past-due. */
  subscriptionTierKey: TierKey | null;
  subscriptionTierLabel: string | null;
  subscriptionTierHex: string | null;
  stateTheme: DashboardStateTheme;
  /** Effective promo multiplier for the packages this user buys (1 when none). */
  multiplier: number;
  /** Whether the user gets 50%-off Additional packages (members / current-draw entrants). */
  hasAdditionalAccess: boolean;
  entries: { total: number; membership: number; oneTime: number; streak: number };
  /** Partner-catalogue access % for the hero ring (0 when locked). */
  partnerAccessPct: number;
  /** One-time time-gated access label, e.g. "5 days" / "24hr" (null otherwise). */
  partnerAccessExpiryLabel: string | null;
  /** Membership Streak: consecutive paid renewals (the durable P1 counter — never
   *  derived from startDate, which upgrades reset). Null for non-members. */
  streakMonths: number | null;
  isPastDue: boolean;
  /** Entries a PAST-DUE member unlocks once they settle their failed renewal (base + carry-over). Null otherwise. */
  pastDueRenewalEntries: number | null;
  /** The renewal charge a PAST-DUE member settles (their tier's monthly price). Null otherwise. */
  pastDueRenewalCost: number | null;
  /** ISO renewal date (subscription.endDate) when active + autoRenew; trialing-safe. Null otherwise. */
  renewalDateIso: string | null;
  /** Membership entries the member gets on the next renewal = accumulated carry-forward + base
   *  (BUSINESS.md carry-forward rule; no promo — matches the real grant). 0 for non-members. */
  membershipEntriesPerRenewal: number;
  drawName: string;
  drawDateIso: string | null;
  drawStatus: string;
  user: UserData | null;
}

// Single source for the "{N} days left" ring caption — shared with the admin
// user-detail modal's partner-access ring (partner-access-ring.ts).
const expiryLabel = formatPartnerAccessExpiryLabel;

/**
 * Single source of dashboard-home view state: resolves the account state
 * (active / one-time / past-due / none), owned tier + theme, promo multiplier,
 * entry buckets, partner access, and streak — from the existing cached queries.
 * Section components stay dumb and consume this.
 */
export function useDashboardState(): DashboardStateResult {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const { data: accountData, isLoading: accountLoading } = useMyAccountData(userId);
  const { data: majorDrawStats, isLoading: statsLoading } = useUserMajorDrawStats(userId);
  const { data: currentMajorDraw, isLoading: drawLoading } = useCurrentMajorDraw();
  // Members with Additional-package access buy Additional packages (50% of the
  // one-time price), whose promo multiplier is the MEMBERSHIP-packages promo —
  // everyone else buys public one-time packages (one-time-packages promo).
  // Mirrors PromoBanner's `effectivePromoTypeForBanner` resolution.
  const membershipMultiplier = useResolvedMultiplier("membership-packages", "display");
  const oneTimeMultiplier = useResolvedMultiplier("one-time-packages", "display");

  const isDrawCompleted = currentMajorDraw?.status === "completed";
  const entriesDisplay = useDashboardEntryDisplay(majorDrawStats, { isDrawCompleted: Boolean(isDrawCompleted) });

  return useMemo<DashboardStateResult>(() => {
    const user = accountData?.user ?? null;
    const isLoading = accountLoading || statsLoading || drawLoading;

    if (!user) {
      return {
        isLoading,
        acct: "none",
        tierKey: null,
        tierHex: null,
        tierLabel: null,
        subscriptionTierKey: null,
        subscriptionTierLabel: null,
        subscriptionTierHex: null,
        stateTheme: getDashboardStateTheme("none"),
        multiplier: oneTimeMultiplier && oneTimeMultiplier > 0 ? oneTimeMultiplier : 1,
        hasAdditionalAccess: false,
        entries: { total: 0, membership: 0, oneTime: 0, streak: 0 },
        partnerAccessPct: 0,
        partnerAccessExpiryLabel: null,
        streakMonths: null,
        isPastDue: false,
        pastDueRenewalEntries: null,
        pastDueRenewalCost: null,
        renewalDateIso: null,
        membershipEntriesPerRenewal: 0,
        drawName: currentMajorDraw?.name ?? "Major Draw",
        drawDateIso: currentMajorDraw?.drawDate ? String(currentMajorDraw.drawDate) : null,
        drawStatus: currentMajorDraw?.status ?? "active",
        user: null,
      };
    }

    const iUser = user as unknown as IUser;
    const activePackage = getActivePackage(user as ActivePackageUserInput);
    const hasActiveMembership = user.subscription?.isActive === true;
    const isPastDue = hasFailedRenewal(iUser);
    const hasActiveOneTime = activePackage.source === "one-time" && activePackage.isActive;

    const acct = deriveDashboardAccountState({ hasActiveMembership, isPastDue, hasActiveOneTime });

    // Additional-package (50%-off) access = active sub OR current-draw entries.
    const hasAdditionalAccess = hasAdditionalPackageAccess(user, majorDrawStats ?? undefined);
    // Members (active subscription) buy Additional packs → membership multiplier;
    // everyone else buys public one-time packs → one-time multiplier (RULE 1).
    const rawMultiplier = hasActiveMembership ? membershipMultiplier : oneTimeMultiplier;
    const multiplier = rawMultiplier && rawMultiplier > 0 ? rawMultiplier : 1;

    const tierKey =
      activePackage.packageData?.name ? tierKeyFromName(activePackage.packageData.name) : null;
    const tierHex = tierKey ? TIER_HEX[tierKey] : null;
    const tierLabel = tierKey ? TIER_LABEL[tierKey] : null;

    // The member's SUBSCRIPTION tier from the PERSISTED package — survives past-due/inactive
    // (getActivePackage returns null once the sub isn't active, and for a past-due member holding a
    // one-time pack `tierKey` would point at the PACK, not their tier). Used to mark the current tier
    // in the past-due tier list + label the switch-tier confirm.
    const subscriptionPkgName = (user as ActivePackageUserInput).subscriptionPackageData?.name ?? null;
    const subscriptionTierKey = subscriptionPkgName ? tierKeyFromName(subscriptionPkgName) : tierKey;
    const subscriptionTierLabel = subscriptionTierKey ? TIER_LABEL[subscriptionTierKey] : tierLabel;
    const subscriptionTierHex = subscriptionTierKey ? TIER_HEX[subscriptionTierKey] : null;

    // Partner access % — resolve the effective (highest-%) active partner-catalog plan
    // from the SHARED resolver (it reads the partner-discount queue), so the hero ring +
    // partner card MATCH the queue instead of guessing from getActivePackage(). For a
    // one-time buyer holding several packs the highest-% pack is the active one — e.g. a
    // Tradie pack (40%) outranks a queued Apprentice pack (25%), the exact bug this fixes.
    let partnerAccessPct = 0;
    let partnerAccessExpiryLabel: string | null = null;
    if (acct === "active" || acct === "onetime") {
      // Active member falls back to the tier map only if the resolver can't resolve
      // (defensive — a member with subscriptionPackageData always resolves).
      const resolved = resolvePartnerCatalogPlanId(user);
      const partnerPlanId = resolved ?? (acct === "active" && tierKey ? `${tierKey}-subscription` : null);
      partnerAccessPct = partnerPlanId ? getPartnerCatalogAccessPercentForPlanId(partnerPlanId) : 0;
      if (acct === "onetime") {
        const info = getPartnerDiscountAccessInfo(iUser);
        partnerAccessExpiryLabel = info.hasAccess ? expiryLabel(info.daysRemaining, info.hoursRemaining) : null;
      }
    } else if (acct === "pastdue") {
      // A past-due member KEEPS any one-time pack partner access they paid for — that window
      // is independent of subscription status and is honored everywhere else (the queue,
      // SSO, the shop). Without this the account state (precedence pastdue > onetime) collapses
      // to "pastdue" and zeroes the %, so the Rewards card falsely reads "Paused / 0%" while the
      // queue below it shows the pack "· 25% active". Guard on source !== "membership" so a
      // stale-active membership queue row (a paused benefit) is never surfaced as live access.
      const info = getPartnerDiscountAccessInfo(iUser);
      if (info.hasAccess && info.source !== "membership") {
        const resolved = resolvePartnerCatalogPlanId(user);
        partnerAccessPct = resolved ? getPartnerCatalogAccessPercentForPlanId(resolved) : 0;
        partnerAccessExpiryLabel = expiryLabel(info.daysRemaining, info.hoursRemaining);
      }
    }

    // Membership Streak — the REAL durable counter (P1, subscription.streakMonths:
    // consecutive paid renewals; recovery keeps it, pauses freeze it, upgrades never
    // touch it). Members only (active + past-due — past-due keeps its banked count).
    let streakMonths: number | null = null;
    if (acct === "active" || acct === "pastdue") {
      streakMonths = (user.subscription as { streakMonths?: number } | undefined)?.streakMonths ?? 0;
    }

    // Renewal date — subscription.endDate is already the normalized renewal anchor even
    // for `trialing` (25-27th anchor-day) members, so reading it is trialing-safe (see
    // docs/BILLING_ANCHOR_24.md); gated on autoRenew like the canonical next_renewal_date.
    let renewalDateIso: string | null = null;
    if (hasActiveMembership) {
      const sub = user.subscription as { endDate?: string | Date; autoRenew?: boolean } | undefined;
      if (sub?.autoRenew !== false && sub?.endDate) {
        const d = new Date(sub.endDate);
        if (!Number.isNaN(d.getTime())) renewalDateIso = d.toISOString();
      }
    }
    // Entries granted on the next renewal = the accumulated carry-forward + this month's base
    // (BUSINESS.md "Carry-forward rule"; the canonical webhook grant, calculateRenewalEntries).
    // NO promo multiplier — promo applies only at join / resubscribe / upgrade, never on a renewal
    // cycle, so this matches what the member actually receives (and the past-due settle preview).
    const membershipEntriesPerRenewal = hasActiveMembership
      ? calculateRenewalEntries(
          activePackage.entriesPerMonth || 0,
          iUser.subscription?.lastMonthAccumulatedEntries,
        ).entriesToGrant
      : 0;

    // Past-due: the entries + cost the member unlocks by settling their failed renewal. Same
    // canonical source as the resolve popup/sheet, the renewal-failure email, and Klaviyo.
    const pastDuePreview =
      acct === "pastdue" ? getPastDueRenewalPreview(iUser) : { entries: null, cost: null };

    return {
      isLoading,
      acct,
      tierKey,
      tierHex,
      tierLabel,
      subscriptionTierKey,
      subscriptionTierLabel,
      subscriptionTierHex,
      stateTheme: getDashboardStateTheme(acct, tierHex),
      multiplier,
      hasAdditionalAccess,
      entries: {
        total: entriesDisplay.currentDrawEntries,
        membership: entriesDisplay.membershipEntries,
        oneTime: entriesDisplay.oneTimeEntries,
        streak: entriesDisplay.streakEntries,
      },
      partnerAccessPct,
      partnerAccessExpiryLabel,
      streakMonths,
      isPastDue,
      pastDueRenewalEntries: pastDuePreview.entries,
      pastDueRenewalCost: pastDuePreview.cost,
      renewalDateIso,
      membershipEntriesPerRenewal,
      drawName: currentMajorDraw?.name ?? "Major Draw",
      drawDateIso: currentMajorDraw?.drawDate ? String(currentMajorDraw.drawDate) : null,
      drawStatus: currentMajorDraw?.status ?? "active",
      user,
    };
  }, [
    accountData,
    accountLoading,
    statsLoading,
    drawLoading,
    membershipMultiplier,
    oneTimeMultiplier,
    majorDrawStats,
    entriesDisplay.currentDrawEntries,
    entriesDisplay.membershipEntries,
    entriesDisplay.oneTimeEntries,
    entriesDisplay.streakEntries,
    currentMajorDraw,
  ]);
}
