"use client";

import React from "react";
import { Settings, AlertTriangle, CheckCircle } from "lucide-react";
import { getMembershipSectionColorScheme } from "@/utils/package-colors/packageColorScheme";
import { calculateRenewalEntries } from "@/utils/payment/subscription-entries-calculator";
import { hasFailedRenewal } from "@/utils/subscription/subscription-helpers";
import type {
  ActiveSubscription,
  ResolvedMembershipPackage,
  SubMgmtUser,
  SubscriptionBenefits,
} from "./types";

interface CurrentBenefitsCardProps {
  user: SubMgmtUser;
  activeSubscription: ActiveSubscription;
  membershipPackage: ResolvedMembershipPackage;
  subscriptionBenefits: SubscriptionBenefits | null;
  packagesLoading: boolean;
}

const parseDate = (value?: string | Date | null) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (value?: string | Date | null, locale: string = "en-US") => {
  const date = parseDate(value);
  return date
    ? date.toLocaleDateString(locale, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;
};

/**
 * Current Plan card + Plan Benefits section. Pure presentation against
 * `subscriptionBenefits` (server-derived) and the resolved membership package.
 */
const CurrentBenefitsCard: React.FC<CurrentBenefitsCardProps> = ({
  user,
  activeSubscription,
  membershipPackage,
  subscriptionBenefits,
  packagesLoading,
}) => {
  const planId = membershipPackage._id || membershipPackage.name?.toLowerCase().replace(/\s+/g, "-") || "";
  const currentPlanColorScheme = getMembershipSectionColorScheme(planId, true);
  const hasFailed = hasFailedRenewal(user);

  const discount = subscriptionBenefits?.discount;
  const discountedPrice =
    discount && discount.percentOff > 0
      ? Math.round(membershipPackage.price * (1 - discount.percentOff / 100) * 100) / 100
      : null;
  const discountEndsLabel = discount?.endsAt ? formatDate(discount.endsAt) : null;

  return (
    <>
      <div
        className={`rounded-lg p-4 sm:p-6 relative overflow-hidden shadow-lg ${
          currentPlanColorScheme.enterNowButtonTextClass ?? currentPlanColorScheme.text
        }`}
        style={{
          ...currentPlanColorScheme.badgeStyle,
          border: `2px solid ${currentPlanColorScheme.accentHex}${currentPlanColorScheme.cardBorderOpacity || "CC"}`,
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none"></div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <Settings className="w-5 h-5 sm:w-6 sm:h-6" />
            <h2 className="text-lg sm:text-xl font-bold" style={currentPlanColorScheme.textGradientStyle ?? undefined}>
              Current Plan
            </h2>
          </div>

          <div className="space-y-2 sm:space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs sm:text-sm opacity-90">Plan:</span>
              <span
                className="font-semibold text-xs sm:text-sm"
                style={currentPlanColorScheme.textGradientStyle ?? undefined}
              >
                {membershipPackage.name}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs sm:text-sm opacity-90">Price:</span>
              {discountedPrice !== null && discount ? (
                <span className="flex items-baseline gap-1.5 sm:gap-2 text-right">
                  <span className="text-2xs sm:text-xs line-through opacity-70">
                    ${membershipPackage.price}/month
                  </span>
                  <span className="font-bold text-xs sm:text-sm">${discountedPrice}/month</span>
                </span>
              ) : (
                <span className="font-semibold text-xs sm:text-sm">${membershipPackage.price}/month</span>
              )}
            </div>
            {discountedPrice !== null && discount ? (
              <div className="flex justify-end -mt-1.5 sm:-mt-2">
                <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 text-2xs sm:text-xs font-medium">
                  {discount.percentOff}% off
                  {discountEndsLabel ? ` · until ${discountEndsLabel}` : " applied"}
                </span>
              </div>
            ) : null}
            <div className="flex justify-between items-center">
              <span className="text-xs sm:text-sm opacity-90">Started:</span>
              <span className="font-semibold text-xs sm:text-sm">
                {new Date(activeSubscription.startDate).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
            {subscriptionBenefits?.isCancelled ? (
              <div className="flex justify-between items-center">
                <span className="text-xs sm:text-sm opacity-90">Subscription Ends:</span>
                <span className="font-semibold text-yellow-300 text-xs sm:text-sm">
                  {formatDate(subscriptionBenefits.endDate || activeSubscription.endDate) ?? "Unknown"}
                </span>
              </div>
            ) : activeSubscription.endDate ? (
              <div className="flex justify-between items-center">
                <span className="text-xs sm:text-sm opacity-90">Next Billing:</span>
                <span className="font-semibold text-xs sm:text-sm">
                  {formatDate(activeSubscription.endDate) ?? "Unknown"}
                </span>
              </div>
            ) : null}

            {/* Cancellation Status */}
            {subscriptionBenefits?.isCancelled && (
              <div className="bg-yellow-600/20 border border-yellow-500/30 rounded-lg p-2 sm:p-3 mt-2 sm:mt-3">
                <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                  <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-300" />
                  <span className="text-yellow-300 font-semibold text-xs sm:text-sm">Subscription Cancelled</span>
                </div>
                <p className="text-yellow-100 text-2xs sm:text-xs">
                  Your subscription will end on{" "}
                  {formatDate(subscriptionBenefits.endDate || activeSubscription.endDate) ||
                    "the end of your billing period"}
                  . You&apos;ll keep access to all benefits until then.
                </p>
              </div>
            )}

            <div className="flex justify-between items-center">
              <span className="text-xs sm:text-sm opacity-90">Auto Renewal:</span>
              <span
                className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-2xs sm:text-xs font-medium ${
                  activeSubscription.autoRenew ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"
                }`}
              >
                {activeSubscription.autoRenew ? "Enabled" : "Disabled"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div
        className="relative bg-gray-50 dark:bg-neutral-800 rounded-lg p-3 sm:p-4 border-l-4 shadow-sm"
        style={{ borderColor: currentPlanColorScheme.accentHex }}
      >
        <h3 className="font-semibold text-gray-900 dark:text-white mb-2 sm:mb-3 text-sm sm:text-base">Plan Benefits</h3>
        <div className="space-y-1.5 sm:space-y-2">
          {packagesLoading ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">Loading benefits...</div>
          ) : membershipPackage?.features ? (
            membershipPackage.features.map((feature: unknown, index: number) => {
              let featureText: string;
              if (typeof feature === "string") {
                featureText = feature;
              } else if (typeof feature === "object" && feature !== null && "text" in feature) {
                featureText = (feature as { text: string }).text;
              } else {
                featureText = String(feature);
              }
              const featureLower = featureText.toLowerCase();

              const isFirstFeature = index === 0;
              const isEntriesFeature = featureLower.includes("entries");
              let displayText = featureText;

              if (isFirstFeature && isEntriesFeature && activeSubscription && membershipPackage && user.subscription) {
                const baseEntries =
                  (membershipPackage as { entriesPerMonth?: number }).entriesPerMonth ??
                  (membershipPackage as { metadata?: { entriesCount?: number } }).metadata?.entriesCount ??
                  (membershipPackage as { metadata?: { originalEntries?: number } }).metadata?.originalEntries ??
                  15;
                const subscriptionWithEntries = user.subscription as { lastMonthAccumulatedEntries?: number };
                const lastMonthAccumulated = subscriptionWithEntries?.lastMonthAccumulatedEntries ?? baseEntries;

                if (hasFailed) {
                  const renewalCalculation = calculateRenewalEntries(baseEntries, lastMonthAccumulated);
                  displayText = featureText.replace(/\d+/, renewalCalculation.entriesToGrant.toString());
                } else {
                  displayText = featureText.replace(/\d+/, lastMonthAccumulated.toString());
                }
              }

              return (
                <div key={index} className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-gray-700 dark:text-neutral-300">{displayText}</span>
                </div>
              );
            })
          ) : (
            <div className="text-sm text-gray-500 dark:text-neutral-400">No benefits information available</div>
          )}
        </div>
      </div>
    </>
  );
};

export default CurrentBenefitsCard;
