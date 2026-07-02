"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { useMyAccountData } from "@/hooks/queries";
import type { UserData } from "@/hooks/queries/useUserQueries";
import { useUserMajorDrawStats, useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";
import { useDashboardEntryDisplay } from "@/hooks/useDashboardEntryDisplay";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import { getActivePackage, type ActivePackageUserInput } from "@/utils/membership/get-active-package";
import { hasFailedRenewal } from "@/utils/subscription/subscription-helpers";
import { TIER_HEX, tierKeyFromName, type TierKey } from "@/utils/membership/tier-visuals";
import { derivePlanIdFromPackage } from "@/utils/package-colors/packageColorScheme";
import { getPartnerCatalogAccessPercentForPlanId } from "@/utils/partner-discounts/partner-catalog-visibility";
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
  stateTheme: DashboardStateTheme;
  /** Resolved promo multiplier (1 when no promo is live). */
  multiplier: number;
  entries: { total: number; membership: number; oneTime: number };
  /** Partner-catalogue access % for the hero ring (0 when locked). */
  partnerAccessPct: number;
  /** One-time time-gated access label, e.g. "5 days" / "24hr" (null otherwise). */
  partnerAccessExpiryLabel: string | null;
  /** Whole months of continuous membership, or null for non-members. */
  streakMonths: number | null;
  isPastDue: boolean;
  drawName: string;
  drawDateIso: string | null;
  drawStatus: string;
  user: UserData | null;
}

function monthsBetween(start: Date, now: Date): number {
  const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  return Math.max(0, now.getDate() >= start.getDate() ? months : months - 1);
}

function expiryLabel(days: number, hours: number): string | null {
  if (days > 1) return `${days} days`;
  if (days === 1) return "1 day";
  if (hours > 0) return `${hours}hr`;
  return null;
}

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
  // The dashboard promo card + "Packages" quick-tile both sell one-time packages,
  // so the multiplier shown is the one-time-packages promo (not membership).
  const resolvedMultiplier = useResolvedMultiplier("one-time-packages", "display");

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
        stateTheme: getDashboardStateTheme("none"),
        multiplier: resolvedMultiplier && resolvedMultiplier > 0 ? resolvedMultiplier : 1,
        entries: { total: 0, membership: 0, oneTime: 0 },
        partnerAccessPct: 0,
        partnerAccessExpiryLabel: null,
        streakMonths: null,
        isPastDue: false,
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

    const tierKey =
      activePackage.packageData?.name ? tierKeyFromName(activePackage.packageData.name) : null;
    const tierHex = tierKey ? TIER_HEX[tierKey] : null;
    const tierLabel = tierKey ? TIER_LABEL[tierKey] : null;

    // Partner access %: member reads the tier map; one-time reads its own plan.
    let partnerAccessPct = 0;
    let partnerAccessExpiryLabel: string | null = null;
    if (acct === "active" && tierKey) {
      partnerAccessPct = getPartnerCatalogAccessPercentForPlanId(`${tierKey}-subscription`);
    } else if (acct === "onetime" && activePackage.packageData) {
      const planId = derivePlanIdFromPackage(activePackage.packageData, "one-time");
      partnerAccessPct = getPartnerCatalogAccessPercentForPlanId(planId);
      const info = getPartnerDiscountAccessInfo(iUser);
      partnerAccessExpiryLabel = info.hasAccess ? expiryLabel(info.daysRemaining, info.hoursRemaining) : null;
    }

    // Streak months (members only) from the subscription start date when present.
    let streakMonths: number | null = null;
    if (acct === "active") {
      const startRaw = (user.subscription as { startDate?: string | Date } | undefined)?.startDate;
      if (startRaw) streakMonths = monthsBetween(new Date(startRaw), new Date());
    }

    return {
      isLoading,
      acct,
      tierKey,
      tierHex,
      tierLabel,
      stateTheme: getDashboardStateTheme(acct, tierHex),
      multiplier: resolvedMultiplier && resolvedMultiplier > 0 ? resolvedMultiplier : 1,
      entries: {
        total: entriesDisplay.currentDrawEntries,
        membership: entriesDisplay.membershipEntries,
        oneTime: entriesDisplay.oneTimeEntries,
      },
      partnerAccessPct,
      partnerAccessExpiryLabel,
      streakMonths,
      isPastDue,
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
    resolvedMultiplier,
    entriesDisplay.currentDrawEntries,
    entriesDisplay.membershipEntries,
    entriesDisplay.oneTimeEntries,
    currentMajorDraw,
  ]);
}
