"use client";

/**
 * Settings-page-only Claude redesign body for SubscriptionManagementModal.
 *
 * PRESENTATIONAL ONLY. It owns no hooks/fetch/business logic — every value and
 * handler is passed in from the orchestrator (index.tsx), which is unchanged.
 * It reuses the verified logic-bearing sub-components (CurrentBenefitsCard,
 * UpgradeList, DowngradeList, CancelResumeRow, PastDueAlert,
 * PendingChangeBanner, the empty states) so all entry/discount math and action
 * wiring is byte-identical to the legacy body — only the surrounding layout
 * (tier-themed plan hero, section framing, tier ladder, spacing) is the new
 * Claude design. Modal-mode / SettingsModal never render this.
 */

import React from "react";
import { ArrowUpRight, CheckCircle2, Sparkles } from "lucide-react";
import { getMembershipSectionColorScheme } from "@/utils/package-colors/packageColorScheme";
import {
  Card,
  SectionHeader,
  SettingsBadge,
} from "@/app/(site)/my-account/components/settings/ui/primitives";
import CurrentBenefitsCard from "./CurrentBenefitsCard";
import PastDueAlert from "./PastDueAlert";
import PendingChangeBanner from "./PendingChangeBanner";
import UpgradeList from "./UpgradeList";
import DowngradeList from "./DowngradeList";
import CancelResumeRow from "./CancelResumeRow";
import { OneTimeOnlyState, InactiveSubscriptionState, NoSubscriptionState } from "./EmptyStates";
import type {
  SubMgmtUser,
  ActiveSubscription,
  ResolvedMembershipPackage,
  SubscriptionBenefits,
  UpgradeOption,
} from "./types";

type PendingCountdownProps = Omit<
  React.ComponentProps<typeof PendingChangeBanner>,
  "onExpired"
> | null;

export interface SettingsRedesignSubscriptionProps {
  user: SubMgmtUser;
  membershipPackage: ResolvedMembershipPackage | null;
  activeSubscription: ActiveSubscription | null;
  subscriptionBenefits: SubscriptionBenefits | null;
  packagesLoading: boolean;
  hasFailed: boolean;
  pendingBenefitCountdownProps: PendingCountdownProps;
  isLoading: boolean;
  benefitsLoading: boolean;
  membershipPromoMultiplier: number;
  activeOneTimePackage:
    | { packageId: string | { name: string }; packageData?: { name?: string } }
    | null;
  formatDate: (value?: string | Date | null, locale?: string) => string | null;
  onResolveFailed: () => void;
  onCancel: () => void;
  onReactivate: () => void;
  onSelectUpgrade: (upgrade: UpgradeOption) => void;
  onSelectDowngrade: (downgrade: UpgradeOption) => void;
  onPendingExpired: () => void;
  onSubscribeClick: () => void;
}

const planIdOf = (pkg: ResolvedMembershipPackage): string =>
  pkg._id || pkg.name.toLowerCase().replace(/\s+/g, "-");

const SettingsRedesignSubscription: React.FC<SettingsRedesignSubscriptionProps> = ({
  user,
  membershipPackage,
  activeSubscription,
  subscriptionBenefits,
  packagesLoading,
  hasFailed,
  pendingBenefitCountdownProps,
  isLoading,
  benefitsLoading,
  membershipPromoMultiplier,
  activeOneTimePackage,
  formatDate,
  onResolveFailed,
  onCancel,
  onReactivate,
  onSelectUpgrade,
  onSelectDowngrade,
  onPendingExpired,
  onSubscribeClick,
}) => {
  // ── Active (or past-due-with-autorenew) subscription ──────────────────────
  if (membershipPackage && activeSubscription) {
    const scheme = getMembershipSectionColorScheme(planIdOf(membershipPackage), true);
    const accent = scheme.accentHex ?? "#ee0000";
    const nextBilling = formatDate(activeSubscription.endDate);
    const isCancelled = subscriptionBenefits?.isCancelled;

    return (
      <div className="space-y-6">
        {/* Tier-themed plan hero */}
        <div
          className="relative overflow-hidden rounded-3xl p-5 sm:p-8 text-white shadow-lift dark:shadow-lift-dark"
          style={{
            background: `linear-gradient(135deg, ${accent} 0%, color-mix(in srgb, ${accent} 70%, #000) 100%)`,
          }}
        >
          <div
            className="absolute inset-0 opacity-30 mix-blend-overlay pointer-events-none"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.35), transparent 40%), radial-gradient(circle at 80% 80%, rgba(0,0,0,0.25), transparent 40%)",
            }}
          />
          <div className="relative">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold tracking-[0.2em] uppercase opacity-75">
                  Current plan
                </p>
                <h2 className="font-poppins font-black text-3xl sm:text-4xl mt-1 leading-none">
                  {membershipPackage.name}
                </h2>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/15 px-3 py-1 text-xs font-bold">
                {hasFailed ? "Renewal failed" : isCancelled ? "Cancels soon" : "Active"}
              </span>
            </div>
            <div className="flex items-end gap-2 mt-5">
              <span className="font-poppins font-black text-5xl sm:text-6xl leading-none">
                ${membershipPackage.price}
              </span>
              <span className="text-sm opacity-75 pb-2">/ month</span>
            </div>
            {nextBilling && (
              <p className="text-sm opacity-80 mt-3">
                {isCancelled ? "Access until" : hasFailed ? "Failed on" : "Next billing"}{" "}
                <span className="font-semibold">{nextBilling}</span>
                {" · "}
                Auto-renew {activeSubscription.autoRenew && !hasFailed ? "on" : "off"}
              </p>
            )}
          </div>
        </div>

        {/* Past-due recovery */}
        {hasFailed && (
          <PastDueAlert onResolve={onResolveFailed} onCancel={onCancel} />
        )}

        {/* Pending change countdown */}
        {pendingBenefitCountdownProps && (
          <PendingChangeBanner {...pendingBenefitCountdownProps} onExpired={onPendingExpired} />
        )}

        {/* Verified benefits + entries math (reused logic component) */}
        <Card className="p-4 sm:p-6 shadow-lift dark:shadow-lift-dark">
          <SectionHeader
            title="Your plan benefits"
            description="What your membership unlocks."
            icon={CheckCircle2}
            accent="emerald"
          />
          <CurrentBenefitsCard
            user={user}
            activeSubscription={activeSubscription}
            membershipPackage={membershipPackage}
            subscriptionBenefits={subscriptionBenefits}
            packagesLoading={packagesLoading}
          />
        </Card>

        {/* Manage plan — hidden for past-due (same rule as legacy) */}
        {!hasFailed && (
          <Card className="p-4 sm:p-6 shadow-lift dark:shadow-lift-dark">
            <SectionHeader
              title="Manage plan"
              description="Switch tier, or end your membership."
              icon={ArrowUpRight}
              accent="sky"
            />
            <div className="space-y-4">
              {!isCancelled && subscriptionBenefits?.availableUpgrades && (
                <UpgradeList
                  user={user}
                  upgrades={subscriptionBenefits.availableUpgrades}
                  membershipPromoMultiplier={membershipPromoMultiplier}
                  isLoading={isLoading}
                  benefitsLoading={benefitsLoading}
                  onSelectUpgrade={onSelectUpgrade}
                />
              )}
              {!isCancelled && subscriptionBenefits?.availableDowngrades && (
                <DowngradeList
                  user={user}
                  downgrades={subscriptionBenefits.availableDowngrades}
                  isLoading={isLoading}
                  benefitsLoading={benefitsLoading}
                  onSelectDowngrade={onSelectDowngrade}
                />
              )}
              <CancelResumeRow
                subscriptionBenefits={subscriptionBenefits}
                isLoading={isLoading}
                formatDate={formatDate}
                onCancel={onCancel}
                onReactivate={onReactivate}
              />
            </div>
          </Card>
        )}
      </div>
    );
  }

  // ── One-time package only ─────────────────────────────────────────────────
  if (activeOneTimePackage) {
    return (
      <div className="space-y-6">
        <OneTimeOnlyState
          packageDisplayName={
            typeof activeOneTimePackage.packageId === "string"
              ? activeOneTimePackage.packageData?.name ?? "One-Time Package"
              : activeOneTimePackage.packageId.name
          }
          onSubscribeClick={onSubscribeClick}
        />
      </div>
    );
  }

  // ── Inactive (non-past-due) subscription ──────────────────────────────────
  if (
    user.subscription &&
    !user.subscription.isActive &&
    user.subscription.status !== "past_due"
  ) {
    return (
      <div className="space-y-6">
        <InactiveSubscriptionState
          status={user.subscription.status}
          onSubscribeClick={onSubscribeClick}
        />
      </div>
    );
  }

  // ── No subscription at all — guest CTA ────────────────────────────────────
  return (
    <div className="space-y-6">
      <Card className="overflow-hidden shadow-lift dark:shadow-lift-dark">
        <div className="p-5 sm:p-8 bg-gradient-to-br from-neutral-50 to-white dark:from-neutral-900 dark:to-neutral-950">
          <SettingsBadge tone="dark" icon={Sparkles}>
            You&rsquo;re not a member yet
          </SettingsBadge>
          <h2 className="font-poppins font-black text-2xl sm:text-3xl text-neutral-900 dark:text-white mt-3 leading-tight">
            Pick a plan to start earning entries &amp; saving with partners
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">
            Cancel anytime. All plans include monthly giveaways, partner discounts and
            entries that roll over.
          </p>
        </div>
      </Card>
      <NoSubscriptionState onSubscribeClick={onSubscribeClick} />
    </div>
  );
};

export default SettingsRedesignSubscription;
