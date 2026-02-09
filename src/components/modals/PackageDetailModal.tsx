"use client";

import React from "react";
import { ModalContainer, ModalHeader, ModalContent, Button } from "./ui";
import VerticalAccumulationChart from "@/components/ui/VerticalAccumulationChart";
import { Check, Ticket, Percent, Handshake, ChevronRight } from "lucide-react";

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

/** Map package name or _id to VerticalAccumulationChart package id */
function toChartPackageId(name: string, _id?: string): string {
  const id = (_id ?? name).toString().toLowerCase();
  if (id.includes("tradie") && (id.includes("subscription") || id.includes("sub"))) return "tradie-subscription";
  if (id.includes("foreman") && (id.includes("subscription") || id.includes("sub"))) return "foreman-subscription";
  if (id.includes("boss") && (id.includes("subscription") || id.includes("sub"))) return "boss-subscription";
  const n = name.toLowerCase();
  if (n.includes("tradie")) return "tradie-subscription";
  if (n.includes("foreman")) return "foreman-subscription";
  if (n.includes("boss")) return "boss-subscription";
  return _id ?? "tradie-subscription";
}

/**
 * Package Detail / Explainer Modal
 * Attached to membership badges in Header and my-account.
 * - Subscription: shows vertical accumulation chart, benefits, billing note, and CTAs (Manage membership / Add more packages).
 * - One-time: shows package benefits only and CTAs (View membership / Add more packages) based on eligibility.
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
  const shopDiscount = packageData.shopDiscountPercent ?? 0;
  const features = packageData.features ?? [];

  const chartPackageId = toChartPackageId(packageData.name, packageData._id);

  const showChart =
    isSubscription &&
    accumulation &&
    chartPackageId &&
    ["tradie-subscription", "foreman-subscription", "boss-subscription"].includes(chartPackageId);

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="md" height="fixed" fixedHeight="max-h-[80dvh]">
      <ModalHeader
        title={isSubscription ? "Your membership" : "Your package"}
        onClose={onClose}
      />
      <ModalContent className="p-4 sm:p-6 space-y-5">
        {/* Package name */}
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-gray-900">{packageData.name}</span>
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            {isSubscription ? "Membership" : "One-time"}
          </span>
        </div>

        {/* Subscription: how entries work + chart */}
        {isSubscription && (
          <>
            <p className="text-gray-700 text-sm sm:text-base">
              You receive{" "}
              <strong>
                {entriesPerMonth.toLocaleString()}
                {accumulation
                  ? ` + ${accumulation.lastMonthAccumulatedEntries.toLocaleString()} entries`
                  : " entries"}
              </strong>{" "}
              every month with your <strong>{packageData.name}</strong> membership.
            </p>
            {showChart && (
              <VerticalAccumulationChart
                selectedPackageId={chartPackageId}
                showOnlySelectedPackage
                userAccumulation={
                  accumulation
                    ? {
                        baseEntriesPerMonth: accumulation.entriesPerMonth,
                        lastMonthAccumulatedEntries: accumulation.lastMonthAccumulatedEntries,
                      }
                    : undefined
                }
              />
            )}
            {/* Billing note – same as SubscriptionExplainerModal */}
            <div className="rounded-xl border-2 border-amber-400/60 bg-amber-50 px-4 py-3 sm:px-5 sm:py-4 shadow-sm">
              <p className="text-amber-900 text-sm sm:text-base font-semibold leading-snug">
                If you joined on the <strong className="text-amber-700">25th, 26th, or 27th</strong>, you&apos;ll be
                billed on the <strong className="text-amber-700">24th of the following month</strong>.
              </p>
            </div>
          </>
        )}

        {/* One-time: entries summary */}
        {!isSubscription && totalEntries > 0 && (
          <p className="text-gray-700 text-sm sm:text-base">
            This package includes <strong>{totalEntries.toLocaleString()} entries</strong> to the major draw.
          </p>
        )}

        {/* Benefits block */}
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-800">Benefits</h4>
          <ul className="space-y-2">
            {isSubscription && entriesPerMonth > 0 && (
              <li className="flex items-center gap-2 text-sm text-gray-700">
                <Ticket className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span>
                  <strong>{entriesPerMonth.toLocaleString()}</strong> entries per month (membership)
                </span>
              </li>
            )}
            {!isSubscription && totalEntries > 0 && (
              <li className="flex items-center gap-2 text-sm text-gray-700">
                <Ticket className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span>
                  <strong>{totalEntries.toLocaleString()}</strong> entries (one-time)
                </span>
              </li>
            )}
            {partnerDays > 0 && (
              <li className="flex items-center gap-2 text-sm text-gray-700">
                <Handshake className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span>
                  Partner discounts for <strong>{partnerDays} days</strong>
                </span>
              </li>
            )}
            {/* {shopDiscount > 0 && (
              <li className="flex items-center gap-2 text-sm text-gray-700">
                <Percent className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span>
                  <strong>{shopDiscount}%</strong> off shop purchases
                </span>
              </li>
            )} */}
            {features.map((feature, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <Check className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* CTAs */}
        <div className="flex flex-col gap-2 pt-2">
          {hasActiveSubscription && onOpenSettingsSubscription && (
            <Button
              onClick={() => {
                onClose();
                onOpenSettingsSubscription();
              }}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2"
            >
              Manage membership
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}
          {!hasActiveSubscription && onOpenMembershipModal && (
            <Button
              onClick={() => {
                onClose();
                onOpenMembershipModal();
              }}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2"
            >
              View membership plans
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}
          {hasAccessToAdditionalPackages && onOpenSpecialPackages && (
            <Button
              onClick={() => {
                onClose();
                onOpenSpecialPackages();
              }}
              variant="outline"
              className="w-full border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-2.5 rounded-lg flex items-center justify-center gap-2"
            >
              Add more packages
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}
          {!hasActiveSubscription && !onOpenMembershipModal && !hasAccessToAdditionalPackages && (
            <Button
              onClick={onClose}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-lg"
            >
              Got it
            </Button>
          )}
          {((hasActiveSubscription && onOpenSettingsSubscription) ||
            hasAccessToAdditionalPackages ||
            onOpenMembershipModal) && (
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-gray-500 hover:text-gray-700 py-1"
            >
              Close
            </button>
          )}
        </div>
      </ModalContent>
    </ModalContainer>
  );
};

export default PackageDetailModal;
