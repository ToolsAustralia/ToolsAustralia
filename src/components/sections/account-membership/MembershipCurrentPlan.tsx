"use client";

import { CreditCard, RefreshCw, ChevronRight, Crown, Info } from "lucide-react";
import { cn } from "@/utils/cn";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";
import { getActivePackage, type ActivePackageUserInput } from "@/utils/membership/get-active-package";
import { glossGrad, inkOn } from "@/utils/membership/tier-visuals";
import { getPartnerCatalogAccessPercentForPlanId } from "@/utils/partner-discounts/partner-catalog-visibility";
import { getFallbackRenewalDate } from "@/utils/dates/month-helpers";
import { hasPendingDowngrade, getDowngradeEffectiveDate } from "@/utils/membership/benefit-resolution";
import { getPackageById } from "@/data/membershipPackages";
import type { IUser } from "@/models/User";
import type { UserData } from "@/hooks/queries/useUserQueries";
import type { DashboardAccountState } from "@/utils/dashboard/dashboard-state-theme";

interface MembershipCurrentPlanProps {
  acct: DashboardAccountState;
  tierKey: "tradie" | "foreman" | "boss" | null;
  tierHex: string | null;
  tierLabel: string | null;
  user: UserData | null;
  /** Entries that land on the next renewal (accumulated carry-forward + this month's base) —
   *  the same `calculateRenewalEntries` value the Dashboard EntryWallet shows. Drives the
   *  "N land on your renewal" accumulation hint. */
  entriesPerRenewal?: number;
  /** Default card label for the Payment-method row, e.g. "Visa •••• 4827". */
  paymentLabel?: string;
  onManage: () => void;
  onPayment: () => void;
  onBecomeMember: () => void;
  onBuyPackage: () => void;
}

function renewLabel(user: UserData | null): string | null {
  const sub = user?.subscription as { endDate?: string | Date; startDate?: string | Date } | undefined;
  if (!sub) return null;
  const d = sub.endDate ? new Date(sub.endDate) : sub.startDate ? getFallbackRenewalDate(new Date(sub.startDate)) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

/** State-aware current-plan summary + manage/payment actions for the Membership page. */
export default function MembershipCurrentPlan({
  acct,
  tierKey,
  tierHex,
  tierLabel,
  user,
  entriesPerRenewal,
  paymentLabel,
  onManage,
  onPayment,
  onBecomeMember,
  onBuyPackage,
}: MembershipCurrentPlanProps) {
  const requestModal = useModalPriorityStore((s) => s.requestModal);
  const active = acct === "active";
  const pastdue = acct === "pastdue";
  const onetime = acct === "onetime";
  const hex = tierHex ?? "#26262b";

  const pkg = user ? getActivePackage(user as ActivePackageUserInput) : null;
  const subPkg = user?.subscriptionPackageData as { price?: number; entriesPerMonth?: number } | undefined;
  // For a subscription (active OR past-due) read entries from the PERSISTED subscription package —
  // getActivePackage returns null for past-due (isActive false), which would show 0 entries and
  // contradict the tier list right below on the same page.
  const entriesPerMonth = active || pastdue ? subPkg?.entriesPerMonth ?? pkg?.entriesPerMonth ?? 0 : pkg?.entriesPerMonth ?? 0;
  const price = subPkg?.price ?? 0;
  const accessPct = tierKey ? getPartnerCatalogAccessPercentForPlanId(`${tierKey}-subscription`) : 0;
  const renews = renewLabel(user);
  // Soft-cancel: an active member with autoRenew off keeps benefits until endDate, then lapses — so
  // "Auto-renews monthly" would be wrong (matches the EntryWallet/hero gating on autoRenew).
  const autoRenewOff = (user?.subscription as { autoRenew?: boolean } | undefined)?.autoRenew === false;

  // Re-open the one-time-per-account entries explainer on demand (force = bypass the
  // hasSeenExplainer gate). Same payload the my-account auto-trigger builds; entriesPerMonth
  // is the card's own displayed base so the modal's stat matches the "Free entries / mo" tile.
  const openEntriesExplainer = () => {
    if (!user) return;
    const sub = user.subscription as { lastMonthAccumulatedEntries?: number } | undefined;
    requestModal("subscription-explainer", true, {
      entriesPerMonth,
      packageName: tierLabel ?? undefined,
      userId: user._id,
      lastMonthAccumulatedEntries: sub?.lastMonthAccumulatedEntries ?? entriesPerMonth,
      selectedPackageId: tierKey ? `${tierKey}-subscription` : undefined,
    });
  };

  // Scheduled downgrade: the member keeps the current (higher) tier's benefits until `endDate`, then drops
  // to `subscription.packageId` (the new lower tier). getEffectiveBenefits keeps the plan card showing the
  // higher tier meanwhile; surface the pending change on the status row (canonical helpers — same source as
  // the Header "Premium benefits" countdown). A cancel (autoRenewOff) supersedes it.
  const downgradePending =
    !!user && (active || pastdue) && !autoRenewOff && hasPendingDowngrade(user as unknown as Partial<IUser>);
  const downgradeDate = downgradePending ? getDowngradeEffectiveDate(user as unknown as Partial<IUser>) : null;
  const downgradeTargetId = (user?.subscription as { packageId?: unknown } | undefined)?.packageId;
  const downgradeTarget =
    downgradePending && downgradeTargetId != null ? getPackageById(String(downgradeTargetId)) : null;
  const downgradeDateLabel = downgradeDate
    ? downgradeDate.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
    : null;

  // Status-row title/sub — precedence: past-due > scheduled cancel > scheduled downgrade > normal renewal.
  let planRowTitle: string;
  let planRowSub: string;
  if (pastdue) {
    planRowTitle = "Payment failed";
    planRowSub = "Update to resume";
  } else if (autoRenewOff) {
    planRowTitle = renews ? `Ends ${renews}` : "Membership";
    planRowSub = "Cancels at period end";
  } else if (downgradePending && downgradeTarget) {
    planRowTitle = `Downgrades to ${downgradeTarget.name}`;
    planRowSub = downgradeDateLabel
      ? `${downgradeDateLabel}${downgradeTarget.price != null ? ` · $${downgradeTarget.price}/mo after` : ""}`
      : "Scheduled at period end";
  } else {
    planRowTitle = renews ? `Renews ${renews}` : "Membership";
    planRowSub = "Auto-renews monthly";
  }

  const statusPill =
    active ? "Active" : pastdue ? "Past due" : onetime ? "One-time" : "Guest";
  const planName = active || pastdue ? tierLabel ?? "Membership" : onetime ? pkg?.packageData?.name ?? "One-time pack" : "Free";
  const useTierGradient = active || pastdue;
  const ink = useTierGradient ? inkOn(hex) : "#ffffff";

  return (
    <section className="overflow-hidden rounded-3xl border border-token bg-surface shadow-sm">
      <div
        className="relative p-5 sm:p-6"
        style={{
          background: useTierGradient ? glossGrad(hex) : "linear-gradient(150deg,#2b2b30,#161619 60%,#232327)",
          color: ink,
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-80">
              {active ? "Current plan" : pastdue ? "Plan paused" : onetime ? "Active pack" : "No plan"}
            </div>
            <div className="mt-0.5 font-poppins text-2xl font-black">{planName}</div>
          </div>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-black/25 px-3 py-1 text-xs font-bold">{statusPill}</span>
        </div>

        {(active || pastdue) && (
          <div className="mt-5 grid grid-cols-3 overflow-hidden rounded-2xl bg-black/[.16] ring-1 ring-white/10">
            <Stat label="Free entries / mo" value={entriesPerMonth.toLocaleString()} onInfo={openEntriesExplainer} />
            <Stat label="Partner access" value={`${accessPct}%`} divider />
            <Stat label="Per month" value={`$${price}`} divider />
          </div>
        )}

        {/* Accumulation hint — ties the base "Free entries / mo" above to what actually lands next
            (base + carry-forward; promo never re-applies on renewal). Active + auto-renewing only:
            a soft-cancelled member has no future renewal, and past-due shows the failure note below. */}
        {active && !autoRenewOff && (entriesPerRenewal ?? 0) > 0 && renews && (
          <p className="mt-3 text-[11.5px] leading-snug opacity-80">
            Free entries accumulate each month — <b className="font-bold opacity-100">{(entriesPerRenewal ?? 0).toLocaleString()}</b> land on your renewal, {renews}.
          </p>
        )}

        {pastdue && <p className="mt-4 text-sm opacity-90">Payment failed — update your card to resume entries and partner access.</p>}
      </div>

      <div className="px-4 sm:px-5">
        {acct === "none" ? (
          <div className="grid grid-cols-1 gap-2 py-4 sm:grid-cols-2 sm:py-5">
            <button type="button" onClick={onBecomeMember} className="rounded-xl bg-gradient-to-b from-red-500 to-red-700 py-3 text-sm font-bold text-white transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-safe:active:translate-y-px">
              Become a member
            </button>
            <button type="button" onClick={onBuyPackage} className="rounded-xl border border-token bg-surface py-3 text-sm font-bold text-primary-token transition-transform hover:bg-black/[.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:text-white dark:hover:bg-white/[.05] motion-safe:active:translate-y-px">
              Buy a package
            </button>
          </div>
        ) : (
          <div className="divide-y divide-token">
            {onetime ? (
              // A one-time pack has no subscription — never show renewal wording (that
              // would imply monthly auto-renew, a real UI bug for one-time buyers). Use
              // the slot to advertise membership — non-clickable (no CTA), since the
              // "Choose a membership" section right below is the actual join path.
              <InfoRow icon={Crown} title="Become a member" sub="Unlock exclusive rewards & free entries" />
            ) : (
              <ManageRow icon={RefreshCw} title={planRowTitle} sub={planRowSub} cta="Manage" onClick={onManage} />
            )}
            <ManageRow icon={CreditCard} title="Payment method" sub={paymentLabel ?? "Manage your card"} cta="Edit" onClick={onPayment} />
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, divider, onInfo }: { label: string; value: string; divider?: boolean; onInfo?: () => void }) {
  return (
    <div className={cn("px-2.5 py-3.5 text-center", divider && "border-l border-white/10")}>
      <div className="flex items-center justify-center gap-1">
        <span className="num font-poppins text-[22px] font-black leading-none tabular-nums">{value}</span>
        {onInfo && (
          <button
            type="button"
            onClick={onInfo}
            aria-label="How free entries accumulate"
            className="grid h-4 w-4 place-items-center rounded-full text-current opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <Info className="h-[13px] w-[13px]" />
          </button>
        )}
      </div>
      <div className="mx-auto mt-1.5 max-w-[9ch] text-[9.5px] font-semibold uppercase leading-tight tracking-wide opacity-75">{label}</div>
    </div>
  );
}

/** Non-interactive advert/status row — no CTA. Sub wraps (not truncated) so it shows in full. */
function InfoRow({ icon: Icon, title, sub }: { icon: typeof CreditCard; title: string; sub: string }) {
  return (
    <div className="flex w-full items-center gap-3 py-4 text-left">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-black/[.05] text-muted-token dark:bg-white/[.08]">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-primary-token dark:text-white">{title}</p>
        <p className="text-xs leading-snug text-muted-token">{sub}</p>
      </div>
    </div>
  );
}

function ManageRow({
  icon: Icon,
  title,
  sub,
  cta,
  onClick,
}: {
  icon: typeof CreditCard;
  title: string;
  sub: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 py-4 text-left transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-black/[.05] text-muted-token dark:bg-white/[.08]">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-primary-token dark:text-white">{title}</p>
        <p className="truncate text-xs text-muted-token">{sub}</p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-0.5 text-sm font-bold text-sky-600 dark:text-sky-400">
        {cta} <ChevronRight className="h-4 w-4" />
      </span>
    </button>
  );
}
