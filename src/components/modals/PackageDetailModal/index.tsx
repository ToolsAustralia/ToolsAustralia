"use client";

import React from "react";
import { getPackageIconByName, type PackageIconData } from "@/utils/images/package-icons";
import { getPartnerCatalogAccessPercentForPlanId } from "@/utils/partner-discounts/partner-catalog-visibility";
import Shell, { type Tier } from "./Shell";
import Hero from "./Hero";
import Body from "./Body";
import ActionRow from "./ActionRow";

/** Package data shape used by badges and modals */
export interface PackageDetailModalPackageData {
  _id?: string;
  name: string;
  type?: "subscription" | "one-time";
  description?: string;
  features?: string[];
  entriesPerMonth?: number;
  totalEntries?: number;
  shopDiscountPercent?: number;
  partnerDiscountDays?: number;
  isActive?: boolean;
}

/** Accumulation data for subscription (chart). selectedPackageId is derived from packageData if not provided. */
export interface SubscriptionAccumulationData {
  entriesPerMonth: number;
  lastMonthAccumulatedEntries: number;
  /** Optional chart package id; derived from package name/_id if omitted */
  selectedPackageId?: string;
}

export interface PackageDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  packageData: PackageDetailModalPackageData;
  membershipType: "subscription" | "one-time";
  /** Required for subscription type to show accumulation chart */
  accumulation?: SubscriptionAccumulationData | null;
  /** User has active subscription – show "Manage membership" CTA */
  hasActiveSubscription?: boolean;
  /** User can access additional (special) packages – show "Add more packages" CTA */
  hasAccessToAdditionalPackages?: boolean;
  /** Opens Settings modal with Subscription tab (my-account) */
  onOpenSettingsSubscription?: () => void;
  /** Opens Membership modal (plans / upgrade) */
  onOpenMembershipModal?: () => void;
  /** Opens Special Packages modal */
  onOpenSpecialPackages?: () => void;
}

/** "15 Free Accumulated Entries Major Giveaway" — replaces synthetic "X entries per month" row */
function isAccumulatedEntriesMarketingFeature(text: string): boolean {
  return /\d+\s*free\s+accumulated\s+entries/i.test(String(text));
}

/** Filter out features that duplicate the entries (ticket) or partner days (handshake) rows */
function filterRedundantFeatures(
  features: string[],
  showEntries: boolean,
  showPartnerDays: boolean
): string[] {
  if (!showEntries && !showPartnerDays) return features;
  return features.filter((f) => {
    const lower = String(f).toLowerCase().trim();
    if (!lower) return true;
    if (isAccumulatedEntriesMarketingFeature(f)) return true;
    const isEntriesDuplicate =
      showEntries &&
      (/\d+\s*free\s+(accumulated\s+)?entries?$/.test(lower) ||
        /^\d+\s*(free\s+)?(accumulated\s+)?entries?\.?\s*$/.test(lower));
    const isPartnerDaysDuplicate =
      showPartnerDays &&
      /^\d+\s*days?\s+access\s+to\s+partner\s+discounts\.?\s*$/.test(lower);
    return !isEntriesDuplicate && !isPartnerDaysDuplicate;
  });
}

/** Map package name or _id to VerticalAccumulationChart package id */
function toChartPackageId(name: string, _id?: string): string {
  const id = (_id ?? name).toString().toLowerCase();
  if (id.includes("tradie") && (id.includes("subscription") || id.includes("sub")))
    return "tradie-subscription";
  if (id.includes("foreman") && (id.includes("subscription") || id.includes("sub")))
    return "foreman-subscription";
  if (id.includes("boss") && (id.includes("subscription") || id.includes("sub")))
    return "boss-subscription";
  const n = name.toLowerCase();
  if (n.includes("tradie")) return "tradie-subscription";
  if (n.includes("foreman")) return "foreman-subscription";
  if (n.includes("boss")) return "boss-subscription";
  return _id ?? "tradie-subscription";
}

/** Tier key for theming (--tier-color, --tier-cta-bg, etc.) */
function tierFromName(name: string, isSubscription: boolean): Tier {
  const lower = name.toLowerCase();
  if (lower.includes("boss")) return "boss";
  if (lower.includes("foreman")) return "foreman";
  if (lower.includes("tradie")) return "tradie";
  return isSubscription ? "tradie" : "neutral";
}

/**
 * Package Detail / Explainer Modal
 * Attached to membership badges in Header and my-account.
 * - Subscription: tier-themed hero, vertical accumulation chart, billing note, benefits, CTAs.
 * - One-time: neutral red theme, benefits only, CTAs based on eligibility.
 *
 * Public API + named exports preserved verbatim from the prior monolith so
 * consumers (Header, my-account, MajorDrawOverview, ModalsGalleryClient) need
 * no changes.
 */
const PackageDetailModal: React.FC<PackageDetailModalProps> = ({
  isOpen,
  onClose,
  packageData,
  membershipType,
  accumulation,
  hasActiveSubscription = false,
  hasAccessToAdditionalPackages = false,
  onOpenSettingsSubscription,
  onOpenMembershipModal,
  onOpenSpecialPackages,
}) => {
  const isSubscription = membershipType === "subscription";
  const entriesPerMonth = packageData.entriesPerMonth ?? 0;
  const totalEntries = packageData.totalEntries ?? 0;
  const partnerDays = packageData.partnerDiscountDays ?? 0;
  const rawFeatures = (packageData.features ?? []).map((f) =>
    typeof f === "string" ? f : (f as { text?: string }).text ?? String(f)
  );
  const showEntries =
    (isSubscription && entriesPerMonth > 0) || (!isSubscription && totalEntries > 0);
  const showPartnerDays = partnerDays > 0;
  const features = filterRedundantFeatures(rawFeatures, showEntries, showPartnerDays);
  const hasAccumulatedEntriesFeature =
    isSubscription && rawFeatures.some(isAccumulatedEntriesMarketingFeature);
  const showSubscriptionEntriesPerMonthRow =
    isSubscription && entriesPerMonth > 0 && !hasAccumulatedEntriesFeature;

  const chartPackageId = toChartPackageId(packageData.name, packageData._id);
  const showChart = !!(
    isSubscription &&
    accumulation &&
    chartPackageId &&
    ["tradie-subscription", "foreman-subscription", "boss-subscription"].includes(chartPackageId)
  );

  const tier: Tier = tierFromName(packageData.name, isSubscription);
  const icon: PackageIconData | null = getPackageIconByName(
    packageData.name,
    isSubscription ? "subscription" : "one-time"
  );

  /** Partner catalog access % — same source the rest of the site uses
   * (UpgradeConfirm BenefitsBody, MembershipSection, etc.). Subscription:
   * Tradie 50, Foreman 75, Boss 100. One-time ladder: VIP/Power/Boss/etc. */
  const partnerAccessPercent = getPartnerCatalogAccessPercentForPlanId(
    packageData._id ?? packageData.name
  );

  return (
    <Shell isOpen={isOpen} onClose={onClose} tier={tier}>
      <Hero
        packageName={packageData.name}
        isSubscription={isSubscription}
        tier={tier}
        icon={icon}
      />
      <Body
        packageName={packageData.name}
        isSubscription={isSubscription}
        entriesPerMonth={entriesPerMonth}
        totalEntries={totalEntries}
        partnerDays={partnerDays}
        partnerAccessPercent={partnerAccessPercent}
        features={features}
        hasAccumulatedEntriesFeature={hasAccumulatedEntriesFeature}
        showSubscriptionEntriesPerMonthRow={showSubscriptionEntriesPerMonthRow}
        accumulation={accumulation ?? null}
        showChart={showChart}
        chartPackageId={chartPackageId}
      />
      <ActionRow
        hasActiveSubscription={hasActiveSubscription}
        hasAccessToAdditionalPackages={hasAccessToAdditionalPackages}
        onClose={onClose}
        onOpenSettingsSubscription={onOpenSettingsSubscription}
        onOpenMembershipModal={onOpenMembershipModal}
        onOpenSpecialPackages={onOpenSpecialPackages}
      />
    </Shell>
  );
};

export default PackageDetailModal;
