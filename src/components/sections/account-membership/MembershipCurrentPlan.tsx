"use client";

import { CreditCard, Settings, ChevronRight } from "lucide-react";
import { getActivePackage, type ActivePackageUserInput } from "@/utils/membership/get-active-package";
import { glossGrad, inkOn } from "@/utils/membership/tier-visuals";
import { getPartnerCatalogAccessPercentForPlanId } from "@/utils/partner-discounts/partner-catalog-visibility";
import { getFallbackRenewalDate } from "@/utils/dates/month-helpers";
import type { UserData } from "@/hooks/queries/useUserQueries";
import type { DashboardAccountState } from "@/utils/dashboard/dashboard-state-theme";

interface MembershipCurrentPlanProps {
  acct: DashboardAccountState;
  tierKey: "tradie" | "foreman" | "boss" | null;
  tierHex: string | null;
  tierLabel: string | null;
  user: UserData | null;
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
  onManage,
  onPayment,
  onBecomeMember,
  onBuyPackage,
}: MembershipCurrentPlanProps) {
  const active = acct === "active";
  const pastdue = acct === "pastdue";
  const onetime = acct === "onetime";
  const hex = tierHex ?? "#26262b";

  const pkg = user ? getActivePackage(user as ActivePackageUserInput) : null;
  const entriesPerMonth = pkg?.entriesPerMonth ?? 0;
  const price = (user?.subscriptionPackageData as { price?: number } | undefined)?.price ?? 0;
  const accessPct = tierKey ? getPartnerCatalogAccessPercentForPlanId(`${tierKey}-subscription`) : 0;
  const renews = renewLabel(user);

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
            <div className="mt-0.5 font-['Poppins'] text-2xl font-black">{planName}</div>
          </div>
          <span className="rounded-full bg-black/25 px-3 py-1 text-xs font-bold">{statusPill}</span>
        </div>

        {(active || pastdue) && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Stat label="Free entries / mo" value={entriesPerMonth.toLocaleString()} />
            <Stat label="Partner access" value={`${accessPct}%`} />
            <Stat label="Per month" value={`$${price}`} />
          </div>
        )}

        {active && renews && <p className="mt-4 text-sm opacity-85">Renews {renews} · cancel anytime</p>}
        {pastdue && <p className="mt-4 text-sm opacity-90">Payment failed — update your card to resume entries and partner access.</p>}
      </div>

      <div className="p-4 sm:p-5">
        {acct === "none" ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button type="button" onClick={onBecomeMember} className="rounded-xl bg-gradient-to-b from-red-500 to-red-700 py-3 text-sm font-bold text-white transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-safe:active:translate-y-px">
              Become a member
            </button>
            <button type="button" onClick={onBuyPackage} className="rounded-xl border border-token bg-surface py-3 text-sm font-bold text-primary-token transition-transform hover:bg-black/[.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:text-white dark:hover:bg-white/[.05] motion-safe:active:translate-y-px">
              Buy a package
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            <ActionRow icon={Settings} label={pastdue ? "Update payment to resume" : "Manage plan"} onClick={onManage} />
            <ActionRow icon={CreditCard} label="Payment method" onClick={onPayment} />
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-black/15 px-3 py-2 text-center">
      <div className="num font-['Poppins'] text-lg font-black tabular-nums">{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{label}</div>
    </div>
  );
}

function ActionRow({ icon: Icon, label, onClick }: { icon: typeof Settings; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-black/[.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:hover:bg-white/[.05]"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-black/[.05] text-muted-token dark:bg-white/[.08]">
        <Icon className="h-5 w-5" />
      </span>
      <span className="flex-1 text-sm font-semibold text-primary-token dark:text-white">{label}</span>
      <ChevronRight className="h-4 w-4 text-muted-token" />
    </button>
  );
}
