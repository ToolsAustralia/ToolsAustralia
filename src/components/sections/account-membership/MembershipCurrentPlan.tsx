"use client";

import { CreditCard, RefreshCw, ChevronRight, Crown } from "lucide-react";
import { cn } from "@/utils/cn";
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
  paymentLabel,
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
          <span className="shrink-0 whitespace-nowrap rounded-full bg-black/25 px-3 py-1 text-xs font-bold">{statusPill}</span>
        </div>

        {(active || pastdue) && (
          <div className="mt-5 grid grid-cols-3 overflow-hidden rounded-2xl bg-black/[.16] ring-1 ring-white/10">
            <Stat label="Free entries / mo" value={entriesPerMonth.toLocaleString()} />
            <Stat label="Partner access" value={`${accessPct}%`} divider />
            <Stat label="Per month" value={`$${price}`} divider />
          </div>
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
              <ManageRow
                icon={RefreshCw}
                title={pastdue ? "Payment failed" : renews ? `Renews ${renews}` : "Membership"}
                sub={pastdue ? "Update to resume" : "Auto-renews monthly"}
                cta="Manage"
                onClick={onManage}
              />
            )}
            <ManageRow icon={CreditCard} title="Payment method" sub={paymentLabel ?? "Manage your card"} cta="Edit" onClick={onPayment} />
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, divider }: { label: string; value: string; divider?: boolean }) {
  return (
    <div className={cn("px-2.5 py-3.5 text-center", divider && "border-l border-white/10")}>
      <div className="num font-['Poppins'] text-[22px] font-black leading-none tabular-nums">{value}</div>
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
