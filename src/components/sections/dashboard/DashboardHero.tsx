"use client";

import { Settings, Crown, ShieldAlert, ArrowRight, Ticket, Gift, ChevronRight, RefreshCw } from "lucide-react";
import AccessRing from "@/components/ui/AccessRing";
import { Monogram } from "@/components/ui/Monogram";
import { cn } from "@/utils/cn";
import type { DashboardAccountState, DashboardStateTheme } from "@/utils/dashboard/dashboard-state-theme";

interface DashboardHeroProps {
  acct: DashboardAccountState;
  firstName?: string | null;
  lastName?: string | null;
  tierHex?: string | null;
  tierLabel?: string | null;
  stateTheme: DashboardStateTheme;
  partnerAccessPct: number;
  partnerAccessExpiryLabel?: string | null;
  onOpenSettings: () => void;
  onRewardPortal?: () => void;
  onBecomeMember?: () => void;
  onUpdatePayment?: () => void;
}

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardHero({
  acct,
  firstName,
  lastName,
  tierHex,
  tierLabel,
  stateTheme,
  partnerAccessPct,
  partnerAccessExpiryLabel,
  onOpenSettings,
  onRewardPortal,
  onBecomeMember,
  onUpdatePayment,
}: DashboardHeroProps) {
  const { ink } = stateTheme;
  const white = ink === "#ffffff";
  const isGuest = acct === "none";
  const name = firstName?.trim() || (isGuest ? "there" : "there");
  const hour = new Date().getHours();
  const glassBg = white ? "rgba(255,255,255,.15)" : "rgba(0,0,0,.13)";
  const glassBd = white ? "rgba(255,255,255,.3)" : "rgba(0,0,0,.18)";
  const soft = white ? "rgba(255,255,255,.82)" : "rgba(0,0,0,.7)";

  const chip =
    acct === "active"
      ? { Icon: Crown, label: tierLabel ?? "Member" }
      : acct === "pastdue"
        ? { Icon: ShieldAlert, label: `${tierLabel ?? "Plan"} · paused` }
        : acct === "onetime"
          ? { Icon: Ticket, label: "One-time pack" }
          : { Icon: Crown, label: "Guest" };

  // Right-side ring (member/onetime use our AccessRing).
  const ring =
    acct === "active" || acct === "onetime" ? (
      <div className="flex flex-col items-center gap-1">
        <AccessRing percent={partnerAccessPct} size={58} stroke={7} color={ink} trackColor={white ? "rgba(255,255,255,.22)" : "rgba(0,0,0,.14)"}>
          <span className="num font-['Poppins'] text-sm font-extrabold" style={{ color: ink }}>{partnerAccessPct}%</span>
        </AccessRing>
        <span className="text-[8px] font-bold uppercase tracking-[0.1em]" style={{ color: soft }}>
          {acct === "onetime" && partnerAccessExpiryLabel ? `${partnerAccessExpiryLabel} left` : "Access"}
        </span>
      </div>
    ) : null;

  const primaryBtn =
    acct === "active" && onRewardPortal ? (
      <button type="button" onClick={onRewardPortal} className="inline-flex items-center gap-2 rounded-full px-[17px] py-3 text-[12.5px] font-extrabold" style={{ color: ink, background: glassBg, border: `1px solid ${glassBd}` }}>
        <Gift className="h-[15px] w-[15px]" /> Reward portal <ChevronRight className="h-3.5 w-3.5" />
      </button>
    ) : acct === "pastdue" && onUpdatePayment ? (
      <button type="button" onClick={onUpdatePayment} className="inline-flex items-center gap-2 rounded-full px-[18px] py-3 text-[12.5px] font-extrabold text-[#241a02]" style={{ background: "linear-gradient(180deg,#fbbf24,#d97706)" }}>
        <RefreshCw className="h-[15px] w-[15px]" /> Update payment
      </button>
    ) : (acct === "onetime" || acct === "none") && onBecomeMember ? (
      <button type="button" onClick={onBecomeMember} className="inline-flex items-center gap-2 rounded-full bg-white px-[18px] py-3 text-[12.5px] font-extrabold" style={{ color: acct === "onetime" ? "#063d3d" : "#ee0000" }}>
        Become a member <ArrowRight className="h-[15px] w-[15px]" />
      </button>
    ) : null;

  const ChipEl = (
    <span className="inline-flex items-center gap-1.5 rounded-full px-[11px] py-[7px] text-[10px] font-extrabold uppercase tracking-[0.06em]" style={{ color: ink, background: glassBg, border: `1px solid ${glassBd}` }}>
      <chip.Icon className="h-3 w-3" /> {chip.label}
    </span>
  );

  const decor = (
    <>
      <span aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: `repeating-linear-gradient(135deg, ${white ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.05)"} 0 1px, transparent 1px 17px)` }} />
      <span aria-hidden className="pointer-events-none absolute -top-20 right-10 h-64 w-64 rounded-full" style={{ background: `radial-gradient(circle, ${white ? "rgba(255,255,255,.16)" : "rgba(0,0,0,.12)"}, transparent 68%)` }} />
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5" style={{ background: "linear-gradient(90deg,transparent,rgba(246,221,140,.7) 44%,rgba(212,175,55,.9))" }} />
    </>
  );

  return (
    <section className="relative overflow-hidden" style={{ background: stateTheme.gradient, color: ink }}>
      {decor}

      {/* ── Desktop: single row (no gear — sidebar has it) ── */}
      <div className="relative hidden items-center gap-4 px-[30px] py-[26px] lg:flex">
        <Monogram firstName={firstName} lastName={lastName} tierHex={tierHex} onBrand size={52} radius={16} />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold" style={{ color: soft }}>{isGuest ? "Welcome," : `${greeting(hour)},`}</div>
          <div className="mt-1.5 flex items-center gap-3">
            <span className="font-['Poppins'] text-2xl font-extrabold">{name}</span>
            {ChipEl}
          </div>
        </div>
        {ring}
        {primaryBtn}
      </div>

      {/* ── Mobile: two rows (+ gear) ── */}
      <div className="relative px-5 pb-[46px] pt-5 lg:hidden">
        <div className="flex items-center gap-3">
          <Monogram firstName={firstName} lastName={lastName} tierHex={tierHex} onBrand size={44} radius={14} />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold" style={{ color: soft }}>{isGuest ? "Welcome," : `${greeting(hour)},`}</div>
            <div className="mt-1 font-['Poppins'] text-[19px] font-extrabold">{name}</div>
          </div>
          <button type="button" onClick={onOpenSettings} aria-label="Settings" className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[11px]" style={{ color: ink, background: glassBg, border: `1px solid ${glassBd}` }}>
            <Settings className="h-[18px] w-[18px]" />
          </button>
          {acct === "pastdue" && (
            <span className="inline-flex items-center gap-1.5 rounded-full px-[11px] py-2 text-[9px] font-extrabold uppercase tracking-[0.08em] text-[#241a02]" style={{ background: "linear-gradient(180deg,#fbbf24,#d97706)" }}>
              <ShieldAlert className="h-3 w-3" /> Past due
            </span>
          )}
          {ring}
        </div>
        <div className="mt-4 flex items-center gap-2">
          {ChipEl}
          {primaryBtn && <span className={cn("ml-auto")}>{primaryBtn}</span>}
        </div>
      </div>
    </section>
  );
}
