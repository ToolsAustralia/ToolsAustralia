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
import Image from "next/image";
import {
  ArrowUpRight,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  X,
  Trophy,
} from "lucide-react";
import { getPackageIconByName } from "@/utils/images/package-icons";
import {
  getMembershipSectionColorScheme,
  type PackageColorScheme,
} from "@/utils/package-colors/packageColorScheme";
import { getPartnerCatalogAccessPercentForMembershipPackageId } from "@/utils/partner-discounts/partner-catalog-visibility";
import { calculateRenewalEntries } from "@/utils/payment/subscription-entries-calculator";
import {
  Card,
  SectionHeader,
  SettingsButton,
  SettingsBadge,
} from "@/app/(site)/my-account/components/settings/ui/primitives";
import PastDueAlert from "./PastDueAlert";
import PendingChangeBanner from "./PendingChangeBanner";
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

/** Feature text extractor — mirrors CurrentBenefitsCard exactly. */
const featureToText = (feature: unknown): string => {
  if (typeof feature === "string") return feature;
  if (typeof feature === "object" && feature !== null && "text" in feature) {
    return (feature as { text: string }).text;
  }
  return String(feature);
};

/** One Manage-plan row (design ManageRow). */
const ManageRow: React.FC<{
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  desc: string;
  accentHex: string;
  danger?: boolean;
  cta: React.ReactNode;
}> = ({ icon: Icon, title, desc, accentHex, danger, cta }) => (
  <div
    className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 rounded-2xl border ${
      danger
        ? "border-red-200/70 dark:border-red-900/40 bg-red-50/40 dark:bg-red-950/15"
        : "border-neutral-200 dark:border-neutral-800"
    }`}
  >
    <div className="flex items-start gap-3 flex-1 min-w-0">
      <div
        className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
        style={
          danger
            ? undefined
            : { backgroundColor: `${accentHex}1A`, color: accentHex }
        }
      >
        <Icon
          className={`w-5 h-5 ${danger ? "text-red-600 dark:text-red-400" : ""}`}
          strokeWidth={2}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-neutral-900 dark:text-white">{title}</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{desc}</p>
      </div>
    </div>
    <div className="shrink-0 sm:self-center">{cta}</div>
  </div>
);

/**
 * Package-tier-colored CTA. Uses the scheme's canonical Enter-Now button
 * classes (`buttonBg`/`buttonText`/`buttonShadow`) — the solid, vibrant
 * package CTA treatment that reads correctly on BOTH light and dark
 * surfaces — rather than the translucent `badgeStyle` the legacy modal
 * relied on (which looks pale on the light settings page).
 */
const PackageCta: React.FC<{
  scheme: PackageColorScheme;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ scheme, disabled, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`rounded-xl px-4 py-2 text-sm font-bold transition-all hover:brightness-105 disabled:opacity-60 disabled:cursor-not-allowed w-full sm:w-auto ${scheme.buttonBg} ${scheme.buttonText} ${scheme.buttonShadow}`}
  >
    {children}
  </button>
);

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

    // Discount math — VERBATIM from CurrentBenefitsCard.
    const discount = subscriptionBenefits?.discount;
    const discountedPrice =
      discount && discount.percentOff > 0
        ? Math.round(membershipPackage.price * (1 - discount.percentOff / 100) * 100) / 100
        : null;
    const discountEndsLabel = discount?.endsAt ? formatDate(discount.endsAt) : null;
    const startedLabel = new Date(activeSubscription.startDate).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const endLabel =
      isCancelled
        ? formatDate(subscriptionBenefits?.endDate || activeSubscription.endDate)
        : nextBilling;
    const endTitle = isCancelled ? "Subscription ends" : hasFailed ? "Failed on" : "Next billing";

    // Plan-benefits entries text — same util + inputs as CurrentBenefitsCard.
    const features = (membershipPackage.features ?? []) as unknown[];
    const baseEntries =
      (membershipPackage as { entriesPerMonth?: number }).entriesPerMonth ??
      (membershipPackage as { metadata?: { entriesCount?: number } }).metadata?.entriesCount ??
      (membershipPackage as { metadata?: { originalEntries?: number } }).metadata?.originalEntries ??
      15;
    const lastMonthAccumulated =
      (user.subscription as { lastMonthAccumulatedEntries?: number } | undefined)
        ?.lastMonthAccumulatedEntries ?? baseEntries;
    const renderFeature = (feature: unknown, index: number): string => {
      const text = featureToText(feature);
      const isFirst = index === 0;
      const isEntries = text.toLowerCase().includes("entries");
      if (isFirst && isEntries && user.subscription) {
        if (hasFailed) {
          const calc = calculateRenewalEntries(baseEntries, lastMonthAccumulated);
          return text.replace(/\d+/, calc.entriesToGrant.toString());
        }
        return text.replace(/\d+/, lastMonthAccumulated.toString());
      }
      return text;
    };

    // Tier ladder — built from REAL packages (current + up/downgrades).
    const ladderMap = new Map<string, { name: string; price: number; entries?: number; current?: boolean }>();
    const keyOf = (name: string, price: number) => `${name}::${price}`;
    ladderMap.set(keyOf(membershipPackage.name, membershipPackage.price), {
      name: membershipPackage.name,
      price: membershipPackage.price,
      entries: (membershipPackage as { entriesPerMonth?: number }).entriesPerMonth,
      current: true,
    });
    for (const u of subscriptionBenefits?.availableUpgrades ?? []) {
      const k = keyOf(u.name, u.price);
      if (!ladderMap.has(k)) ladderMap.set(k, { name: u.name, price: u.price, entries: u.entriesPerMonth });
    }
    for (const d of subscriptionBenefits?.availableDowngrades ?? []) {
      const k = keyOf(d.name, d.price);
      if (!ladderMap.has(k)) ladderMap.set(k, { name: d.name, price: d.price, entries: d.entriesPerMonth });
    }
    const ladder = Array.from(ladderMap.values()).sort((a, b) => a.price - b.price);
    const currentIdx = ladder.findIndex((t) => t.current);

    return (
      <div className="space-y-6">
        {/* Tier-themed plan hero (carries the full plan summary) */}
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

            {/* Price (with live discount) */}
            <div className="flex flex-wrap items-end gap-x-3 gap-y-1 mt-5">
              {discountedPrice !== null && discount ? (
                <>
                  <span className="font-poppins font-black text-5xl sm:text-6xl leading-none">
                    ${discountedPrice}
                  </span>
                  <span className="text-sm opacity-75 pb-2">/ month</span>
                  <span className="text-base line-through opacity-60 pb-2">
                    ${membershipPackage.price}/mo
                  </span>
                  <span className="pb-2">
                    <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-xs font-semibold">
                      {discount.percentOff}% off
                      {discountEndsLabel ? ` · until ${discountEndsLabel}` : " applied"}
                    </span>
                  </span>
                </>
              ) : (
                <>
                  <span className="font-poppins font-black text-5xl sm:text-6xl leading-none">
                    ${membershipPackage.price}
                  </span>
                  <span className="text-sm opacity-75 pb-2">/ month</span>
                </>
              )}
            </div>

            {/* Plan facts */}
            <div className="grid grid-cols-2 gap-3 mt-6">
              <div className="rounded-2xl bg-white/10 border border-white/15 px-3 py-2.5">
                <p className="text-[10px] font-bold tracking-[0.14em] uppercase opacity-70">Started</p>
                <p className="text-sm font-semibold mt-0.5">{startedLabel}</p>
              </div>
              {endLabel && (
                <div className="rounded-2xl bg-white/10 border border-white/15 px-3 py-2.5">
                  <p className="text-[10px] font-bold tracking-[0.14em] uppercase opacity-70">{endTitle}</p>
                  <p className="text-sm font-semibold mt-0.5">{endLabel}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Past-due recovery */}
        {hasFailed && <PastDueAlert onResolve={onResolveFailed} onCancel={onCancel} />}

        {/* Pending change countdown */}
        {pendingBenefitCountdownProps && (
          <PendingChangeBanner {...pendingBenefitCountdownProps} onExpired={onPendingExpired} />
        )}

        {/* Plan benefits (same entries math via calculateRenewalEntries) */}
        <Card className="p-4 sm:p-6 shadow-lift dark:shadow-lift-dark">
          <SectionHeader
            title="Your plan benefits"
            description="What your membership unlocks."
            icon={CheckCircle2}
            accent="emerald"
          />
          {packagesLoading ? (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading benefits…</p>
          ) : features.length > 0 ? (
            <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
              {features.map((f, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 text-sm text-neutral-700 dark:text-neutral-300"
                >
                  <CheckCircle2
                    className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0"
                    strokeWidth={2.5}
                  />
                  <span>{renderFeature(f, i)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              No benefits information available
            </p>
          )}
        </Card>

        {/* Membership tier ladder (real packages) */}
        {ladder.length >= 2 && (
          <Card className="p-4 sm:p-6 shadow-lift dark:shadow-lift-dark">
            <SectionHeader
              title="Membership tier"
              description="Where you sit and what's next."
              icon={Trophy}
              accent="amber"
            />
            <div className="relative">
              {/* Track — base + colored progress to the current tier */}
              <div className="absolute left-7 right-7 top-7 h-1 rounded-full bg-neutral-200 dark:bg-neutral-800" />
              {currentIdx >= 0 && (
                <div
                  className="absolute left-7 top-7 h-1 rounded-full"
                  style={{
                    width: `calc((100% - 3.5rem) * ${
                      ladder.length > 1 ? currentIdx / (ladder.length - 1) : 0
                    })`,
                    backgroundColor: accent,
                  }}
                />
              )}
              <div
                className="relative grid gap-3"
                style={{ gridTemplateColumns: `repeat(${ladder.length}, minmax(0, 1fr))` }}
              >
                {ladder.map((t, i) => {
                const reached = currentIdx >= 0 && i <= currentIdx;
                const tierIcon = getPackageIconByName(t.name, "subscription");
                return (
                  <div key={`${t.name}-${t.price}`} className="flex flex-col items-center text-center">
                    <div
                      className={`relative w-14 h-14 rounded-2xl flex items-center justify-center font-poppins font-black text-base ring-4 ring-white dark:ring-neutral-900 ${
                        reached ? "text-white" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-600"
                      } ${t.current ? "scale-110 shadow-lg" : ""}`}
                      style={reached ? { backgroundColor: accent } : undefined}
                    >
                      {tierIcon ? (
                        <Image
                          src={tierIcon}
                          alt={`${t.name} icon`}
                          width={36}
                          height={36}
                          className={`w-9 h-9 object-contain ${reached ? "" : "opacity-40 grayscale"}`}
                        />
                      ) : (
                        t.name.charAt(0).toUpperCase()
                      )}
                      {t.current && (
                        <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-[9px] font-black tracking-widest uppercase">
                          You
                        </span>
                      )}
                    </div>
                    <p
                      className={`mt-3 text-sm font-bold ${
                        reached ? "text-neutral-900 dark:text-white" : "text-neutral-400 dark:text-neutral-600"
                      }`}
                    >
                      {t.name}
                    </p>
                    <p className="text-[11px] leading-tight text-neutral-500 dark:text-neutral-400 mt-0.5">
                      ${t.price}/mo
                      {typeof t.entries === "number" && (
                        <>
                          <br />
                          <span className="opacity-80">{t.entries} entries</span>
                        </>
                      )}
                    </p>
                  </div>
                );
              })}
              </div>
            </div>
          </Card>
        )}

        {/* Manage plan — hidden for past-due (same rule as legacy) */}
        {!hasFailed && (
          <Card className="p-4 sm:p-6 shadow-lift dark:shadow-lift-dark">
            <SectionHeader
              title="Manage plan"
              description="Switch tier, pause auto-renewal, or end your membership."
              icon={ArrowUpRight}
              accent="sky"
            />
            <div className="space-y-3">
              {!isCancelled &&
                (subscriptionBenefits?.availableUpgrades ?? []).map((u) => {
                  const partnerPct = getPartnerCatalogAccessPercentForMembershipPackageId(u.packageId);
                  const sch = getMembershipSectionColorScheme(u.packageId, true);
                  return (
                    <ManageRow
                      key={`up-${u.packageId}`}
                      icon={ArrowUpRight}
                      accentHex={sch.accentHex ?? accent}
                      title={`Upgrade to ${u.name}`}
                      desc={`$${u.price} / mo — ${u.entriesPerMonth} entries, ${partnerPct}% partner discounts`}
                      cta={
                        <PackageCta
                          scheme={sch}
                          disabled={isLoading || benefitsLoading}
                          onClick={() => onSelectUpgrade(u)}
                        >
                          Upgrade
                        </PackageCta>
                      }
                    />
                  );
                })}
              {!isCancelled &&
                (subscriptionBenefits?.availableDowngrades ?? []).map((d) => {
                  const partnerPct = getPartnerCatalogAccessPercentForMembershipPackageId(d.packageId);
                  const sch = getMembershipSectionColorScheme(d.packageId, true);
                  return (
                    <ManageRow
                      key={`down-${d.packageId}`}
                      icon={RefreshCw}
                      accentHex={sch.accentHex ?? accent}
                      title={`Downgrade to ${d.name}`}
                      desc={`$${d.price} / mo — ${d.entriesPerMonth} entries, ${partnerPct}% partner discounts`}
                      cta={
                        <PackageCta
                          scheme={sch}
                          disabled={isLoading || benefitsLoading}
                          onClick={() => onSelectDowngrade(d)}
                        >
                          Switch
                        </PackageCta>
                      }
                    />
                  );
                })}
              {isCancelled ? (
                <ManageRow
                  icon={RefreshCw}
                  accentHex={accent}
                  title="Resume membership"
                  desc="Reactivate before your access ends to keep your benefits"
                  cta={
                    <SettingsButton variant="primary" size="sm" onClick={onReactivate}>
                      Resume
                    </SettingsButton>
                  }
                />
              ) : (
                <ManageRow
                  icon={X}
                  accentHex={accent}
                  danger
                  title="Cancel membership"
                  desc="You'll keep benefits until your next billing date"
                  cta={
                    <SettingsButton variant="danger" size="sm" onClick={onCancel}>
                      Cancel plan
                    </SettingsButton>
                  }
                />
              )}
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
