"use client";

import { Settings, Crown, ShieldAlert, ArrowRight, ExternalLink } from "lucide-react";
import AccessRing from "@/components/ui/AccessRing";
import { Monogram } from "@/components/ui/Monogram";
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

/**
 * Personalized dashboard hero header. Recolors to the account state (tier /
 * teal / amber / neutral), shows the monogram + greeting + a state-specific
 * right element (access ring / one-time countdown / paused pill) and a
 * state-specific primary CTA. Ink auto-adjusts for contrast.
 */
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
  const isGuest = acct === "none";
  const name = firstName?.trim() || "there";
  const hour = new Date().getHours();

  const chip =
    acct === "active"
      ? { icon: Crown, label: tierLabel ?? "Member" }
      : acct === "pastdue"
        ? { icon: ShieldAlert, label: `${tierLabel ?? "Plan"} · paused` }
        : acct === "onetime"
          ? { icon: Crown, label: "One-time pack" }
          : { icon: Crown, label: "Guest" };
  const ChipIcon = chip.icon;

  return (
    <section
      className="relative overflow-hidden rounded-b-3xl px-5 pb-6 pt-6 sm:px-6 sm:pt-8"
      style={{ background: stateTheme.gradient, color: ink }}
    >
      {/* gold seam nods to the draw */}
      <span className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-[#d4af37] to-transparent" />
      {/* subtle radial glow */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full opacity-30"
        style={{ background: `radial-gradient(circle, ${stateTheme.accent}, transparent 70%)` }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Monogram firstName={firstName} lastName={lastName} tierHex={tierHex} onBrand size={48} radius={14} />
          <div>
            <div className="text-sm/5 opacity-80">{isGuest ? "Welcome," : `${greeting(hour)},`}</div>
            <div className="font-['Poppins'] text-xl font-extrabold leading-tight">{name}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {acct === "active" && (
            <AccessRing percent={partnerAccessPct} size={58} stroke={7} color={ink} trackColor="rgba(255,255,255,.22)">
              <div className="text-center leading-none">
                <div className="num text-sm font-extrabold">{partnerAccessPct}%</div>
                <div className="text-[8px] font-semibold uppercase tracking-wide opacity-75">Access</div>
              </div>
            </AccessRing>
          )}
          {acct === "onetime" && (
            <AccessRing percent={partnerAccessPct} size={58} stroke={7} color={ink} trackColor="rgba(255,255,255,.22)">
              <div className="text-center leading-none">
                <div className="num text-xs font-extrabold">{partnerAccessPct}%</div>
                {partnerAccessExpiryLabel && (
                  <div className="text-[8px] font-semibold uppercase tracking-wide opacity-75">{partnerAccessExpiryLabel}</div>
                )}
              </div>
            </AccessRing>
          )}
          {acct === "pastdue" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/25 px-3 py-1.5 text-xs font-bold">
              <ShieldAlert className="h-3.5 w-3.5" /> Past due
            </span>
          )}
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Settings"
            className="grid h-10 w-10 place-items-center rounded-full bg-white/15 transition-colors hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="relative mt-5 flex items-center justify-between gap-3">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold"
          style={{ background: "rgba(255,255,255,.16)" }}
        >
          <ChipIcon className="h-3.5 w-3.5" /> {chip.label}
        </span>

        {acct === "active" && onRewardPortal && (
          <button
            type="button"
            onClick={onRewardPortal}
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-neutral-900 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 motion-safe:active:translate-y-px"
          >
            Reward portal <ExternalLink className="h-4 w-4" />
          </button>
        )}
        {acct === "pastdue" && onUpdatePayment && (
          <button
            type="button"
            onClick={onUpdatePayment}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-b from-amber-400 to-amber-600 px-4 py-2 text-sm font-bold text-[#241a02] transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 motion-safe:active:translate-y-px"
          >
            Update payment <ArrowRight className="h-4 w-4" />
          </button>
        )}
        {(acct === "onetime" || acct === "none") && onBecomeMember && (
          <button
            type="button"
            onClick={onBecomeMember}
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-neutral-900 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 motion-safe:active:translate-y-px"
          >
            Become a member <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </section>
  );
}
