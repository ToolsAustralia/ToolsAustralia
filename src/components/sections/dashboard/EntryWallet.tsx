"use client";

import { cn } from "@/utils/cn";
import { Clock } from "lucide-react";
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
  className?: string;
}

/** Countdown cell — prototype `CDBox`. */
function CDBox({ v, l, accent }: { v: number; l: string; accent?: boolean }) {
  return (
    <div
      className={cn(
        "flex min-w-[46px] flex-col items-center gap-1 rounded-[11px] border bg-surface px-2.5 py-2",
        accent ? "border-[#d4af37]/60" : "border-token",
      )}
    >
      <span className="num text-[17px] font-extrabold leading-none tabular-nums text-primary-token dark:text-white">
        {String(v).padStart(2, "0")}
      </span>
      <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-muted-token">{l}</span>
    </div>
  );
}

/**
 * Entries wallet — the dashboard's hero figure. Ported from the prototype:
 * eyebrow + big total + a membership/one-time split bar + legend, plus a
 * "Draw closes in" countdown. Mobile stacks (countdown below a hairline);
 * desktop is a 2-column card (breakdown left, countdown right of a divider).
 */
export default function EntryWallet({
  acct,
  entries,
  tierHex,
  drawName,
  drawDateIso,
  drawStatus,
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
  };
  const showCountdown = !isCompleted && Number.isFinite(target) && (drawStatus === "active" || drawStatus === "frozen");

  const Countdown = (
    <div className="flex items-center justify-between gap-3 lg:flex-col lg:items-start lg:justify-center lg:gap-3">
      <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-token">
        <Clock className="h-[15px] w-[15px] text-[#d4af37]" /> {isCompleted ? "Draw complete" : "Draw closes in"}
      </span>
      {showCountdown && (
        <div className="flex gap-2">
          <CDBox v={cd.d} l="days" accent />
          <CDBox v={cd.h} l="hrs" />
          <CDBox v={cd.m} l="min" />
        </div>
      )}
    </div>
  );

  return (
    <section
      className={cn("relative overflow-hidden rounded-[1.1rem] border border-token bg-surface shadow-sm", className)}
    >
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: "linear-gradient(90deg,#f6dd8c,#d4af37 55%,transparent)" }} />

      <div className="flex flex-col p-[18px] sm:p-6 lg:flex-row lg:items-stretch lg:gap-[26px]">
        {/* breakdown */}
        <div className="min-w-0 flex-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-token">Entries · {drawName}</span>
          <div className="mt-2.5">
            <AnimatedNumber
              value={total}
              className="num font-['Poppins'] text-[52px] font-black leading-[.85] tracking-[-.02em] tabular-nums text-primary-token lg:text-[60px] dark:text-white"
            />
          </div>
          <div className="mt-4 flex h-[9px] overflow-hidden rounded-full border border-token lg:max-w-[380px]">
            <span className="h-full" style={{ width: `${memberPct}%`, background: (isPastDue || isOneTime) ? "#8a93a1" : tier }} />
            <span className="h-full flex-1 bg-emerald-500" />
          </div>
          <div className="mt-3 flex gap-6 text-[12px]">
            <span className="inline-flex items-center gap-2 text-muted-token">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: (isPastDue || isOneTime) ? "#8a93a1" : tier }} />
              Membership{" "}
              {isPastDue ? (
                <b className="text-amber-600 dark:text-amber-500">paused</b>
              ) : isOneTime ? (
                <b className="num text-muted-token">—</b>
              ) : (
                <b className="num text-primary-token dark:text-white">{entries.membership.toLocaleString()}</b>
              )}
            </span>
            <span className="inline-flex items-center gap-2 text-muted-token">
              <span className="h-2.5 w-2.5 rounded-[3px] bg-emerald-500" />
              One-time packs <b className="num text-primary-token dark:text-white">{entries.oneTime.toLocaleString()}</b>
            </span>
          </div>
        </div>

        {/* divider (desktop) */}
        <div className="hidden w-px self-stretch bg-token lg:block" />
        {/* hairline (mobile) */}
        <div className="my-[13px] h-px bg-gradient-to-r from-transparent via-black/10 to-transparent lg:hidden dark:via-white/10" />

        {/* countdown */}
        <div className="lg:flex lg:min-w-[210px] lg:flex-none lg:flex-col lg:justify-center">{Countdown}</div>
      </div>
    </section>
  );
}
