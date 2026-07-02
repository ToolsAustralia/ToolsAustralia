"use client";

import { cn } from "@/utils/cn";
import { Clock, Plus } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { useLeafTimer } from "@/hooks/useLeafTimer";
import type { DashboardAccountState } from "@/utils/dashboard/dashboard-state-theme";

interface EntryWalletProps {
  acct: DashboardAccountState;
  entries: { membership: number; oneTime: number };
  tierHex?: string | null;
  drawName: string;
  drawDateIso: string | null;
  drawStatus: string;
  /** Eyebrow label (default "Entries · {drawName}"). */
  eyebrow?: string;
  /** Force the single-column stacked layout (used on Draws); default = 2-col on desktop. */
  stack?: boolean;
  /** Show a seconds cell in the countdown. */
  showSeconds?: boolean;
  /** Render an inline "Package"/"Get a package" button (with multiplier badge). */
  onGetPackage?: () => void;
  /** Promo multiplier for the inline package badge (>1 shows "{n}× entries"). */
  multiplier?: number;
  className?: string;
}

/** Countdown cell — prototype `CDBox`. */
function CDBox({ v, l, accent }: { v: number; l: string; accent?: boolean }) {
  return (
    <div className={cn("flex min-w-[46px] flex-col items-center gap-1 rounded-[11px] border bg-surface px-2.5 py-2", accent ? "border-[#d4af37]/60" : "border-token")}>
      <span className="num text-[17px] font-extrabold leading-none tabular-nums text-primary-token dark:text-white">{String(v).padStart(2, "0")}</span>
      <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-muted-token">{l}</span>
    </div>
  );
}

/**
 * Your entries — the dashboard's hero figure (ported from the prototype). The
 * "one-time" bucket is EVERY non-membership entry source (one-time packs, upsell,
 * referral, rewards/redeemables, promo-link, mini-draw), so the label is just
 * "One-time" — not "One-time packs". Home: 2-column on desktop (breakdown │
 * divider │ countdown). Draws: pass `stack` for the single-column card + seconds.
 */
export default function EntryWallet({
  acct,
  entries,
  tierHex,
  drawName,
  drawDateIso,
  drawStatus,
  eyebrow,
  stack,
  showSeconds,
  onGetPackage,
  multiplier = 1,
  className,
}: EntryWalletProps) {
  const now = useLeafTimer(1000);
  const tier = tierHex ?? "#ee0000";
  const isPastDue = acct === "pastdue";
  const isOneTime = acct === "onetime";
  const isCompleted = drawStatus === "completed";

  const membership = isCompleted ? 0 : entries.membership;
  const total = membership + entries.oneTime;
  const memberPct = total > 0 ? (membership / total) * 100 : 0;

  const target = drawDateIso ? new Date(drawDateIso).getTime() : NaN;
  const ms = Number.isFinite(target) ? Math.max(0, target - now) : 0;
  const cd = {
    d: Math.floor(ms / 86_400_000),
    h: Math.floor((ms / 3_600_000) % 24),
    m: Math.floor((ms / 60_000) % 60),
    s: Math.floor((ms / 1000) % 60),
  };
  const showCountdown = !isCompleted && Number.isFinite(target) && (drawStatus === "active" || drawStatus === "frozen");

  const Breakdown = (
    <div className="min-w-0 flex-1">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-token">{eyebrow ?? `Entries · ${drawName}`}</span>
          <div className="mt-2.5">
            <AnimatedNumber value={total} className={cn("num font-['Poppins'] font-black leading-[.85] tracking-[-.02em] tabular-nums text-primary-token dark:text-white", stack ? "text-[44px]" : "text-[52px] lg:text-[60px]")} />
          </div>
        </div>
        {onGetPackage && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={onGetPackage}
              className="inline-flex items-center gap-1.5 rounded-full border border-token px-3 py-2 text-[12px] font-bold text-primary-token transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:text-white motion-safe:active:translate-y-px"
            >
              <Plus className="h-[15px] w-[15px]" /> Package
            </button>
            {multiplier > 1 && (
              <span className="absolute -right-2 -top-2 whitespace-nowrap rounded-full bg-gradient-to-b from-[#f6dd8c] to-[#d4af37] px-1.5 py-1 text-[8.5px] font-black text-[#241a02] shadow-[0_6px_12px_-5px_rgba(0,0,0,.5)]">
                {multiplier}× entries
              </span>
            )}
          </div>
        )}
      </div>
      <div className="mt-4 flex h-[9px] overflow-hidden rounded-full border border-token" style={{ maxWidth: stack ? undefined : undefined }}>
        <span className="h-full" style={{ width: `${memberPct}%`, background: (isPastDue || isOneTime) ? "#8a93a1" : tier }} />
        <span className="h-full flex-1 bg-emerald-500" />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[12px]">
        <span className="inline-flex items-center gap-2 text-muted-token">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: (isPastDue || isOneTime) ? "#8a93a1" : tier }} />
          Membership{" "}
          {isPastDue ? <b className="text-amber-600 dark:text-amber-500">paused</b> : isOneTime ? <b className="num text-muted-token">—</b> : <b className="num text-primary-token dark:text-white">{entries.membership.toLocaleString()}</b>}
        </span>
        <span className="inline-flex items-center gap-2 text-muted-token">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-emerald-500" />
          One-time <b className="num text-primary-token dark:text-white">{entries.oneTime.toLocaleString()}</b>
        </span>
      </div>
    </div>
  );

  const CountdownLabel = eyebrow === "Your entries" ? "Closes in" : isCompleted ? "Draw complete" : "Draw closes in";
  const Countdown = (
    <div className={cn("flex items-center justify-between gap-3", !stack && "lg:flex-col lg:items-start lg:justify-center lg:gap-3")}>
      <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-token">
        <Clock className="h-[15px] w-[15px] text-[#d4af37]" /> {CountdownLabel}
      </span>
      {showCountdown && (
        <div className="flex gap-2">
          <CDBox v={cd.d} l="days" accent />
          <CDBox v={cd.h} l="hrs" />
          <CDBox v={cd.m} l="min" />
          {showSeconds && <CDBox v={cd.s} l="sec" />}
        </div>
      )}
    </div>
  );

  return (
    <section className={cn("relative overflow-hidden rounded-[1.1rem] border border-token bg-surface p-[18px] shadow-sm sm:p-6", className)}>
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: "linear-gradient(90deg,#f6dd8c,#d4af37 55%,transparent)" }} />

      {stack ? (
        <div className="flex flex-col">
          {Breakdown}
          <div className="my-[13px] h-px bg-gradient-to-r from-transparent via-black/10 to-transparent dark:via-white/10" />
          {Countdown}
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row lg:items-stretch lg:gap-[26px]">
          {Breakdown}
          <div className="hidden w-px self-stretch bg-token lg:block" />
          <div className="my-[13px] h-px bg-gradient-to-r from-transparent via-black/10 to-transparent lg:hidden dark:via-white/10" />
          <div className="lg:flex lg:min-w-[210px] lg:flex-none lg:flex-col lg:justify-center">{Countdown}</div>
        </div>
      )}
    </section>
  );
}
