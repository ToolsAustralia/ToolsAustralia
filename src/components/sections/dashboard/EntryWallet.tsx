"use client";

import { cn } from "@/utils/cn";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { useLeafTimer } from "@/hooks/useLeafTimer";
import type { DashboardAccountState } from "@/utils/dashboard/dashboard-state-theme";

export interface EntryWalletPendingData {
  /** Projected total once the pending renewal posts. */
  expectedEntries: number;
  renewalDate: Date | null;
  isFailedRenewal: boolean;
}

interface EntryWalletProps {
  acct: DashboardAccountState;
  entries: { total: number; membership: number; oneTime: number };
  tierHex?: string | null;
  drawName: string;
  drawDateIso: string | null;
  drawStatus: string;
  pending?: EntryWalletPendingData | null;
  onResolvePayment?: () => void;
  className?: string;
}

function splitRemaining(targetMs: number, now: number) {
  const ms = Math.max(0, targetMs - now);
  return {
    d: Math.floor(ms / 86_400_000),
    h: Math.floor((ms / 3_600_000) % 24),
    m: Math.floor((ms / 60_000) % 60),
  };
}

function CountCell({ v, l }: { v: number; l: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="num text-xl font-extrabold tabular-nums text-primary-token dark:text-white">
        {String(v).padStart(2, "0")}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-token">{l}</span>
    </div>
  );
}

/**
 * The entries wallet — the dashboard's hero figure. Shows the user's total
 * entries for the current major draw, split into membership vs one-time packs,
 * with a live "draw closes in" countdown. State-aware (paused past-due, one-time
 * has no membership entries, completed draws zero out, pending renewal projects).
 */
export default function EntryWallet({
  acct,
  entries,
  tierHex,
  drawName,
  drawDateIso,
  drawStatus,
  pending,
  onResolvePayment,
  className,
}: EntryWalletProps) {
  const now = useLeafTimer(1000);
  const isCompleted = drawStatus === "completed";
  const isPastDue = acct === "pastdue";
  const isOneTime = acct === "onetime";
  const tier = tierHex ?? "#ee0000";

  const showProjected = Boolean(pending) && !isCompleted;
  const displayTotal = showProjected ? pending!.expectedEntries : entries.total;

  const membershipPct = displayTotal > 0 ? (entries.membership / displayTotal) * 100 : 0;
  const oneTimePct = displayTotal > 0 ? (entries.oneTime / displayTotal) * 100 : 0;

  const membershipLegend = isPastDue ? "paused" : isOneTime ? "—" : entries.membership.toLocaleString();

  const target = drawDateIso ? new Date(drawDateIso).getTime() : NaN;
  const cd = Number.isFinite(target) ? splitRemaining(target, now) : null;

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-3xl border border-token bg-surface p-5 shadow-lg sm:p-6",
        className,
      )}
    >
      {/* gold seam */}
      <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#d4af37] to-transparent" />

      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-token">
          Entries · {drawName}
        </span>
        {showProjected && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
            {pending!.isFailedRenewal ? "Awaiting payment" : "Projected"}
          </span>
        )}
      </div>

      <div className="mt-1 flex items-end gap-2">
        <AnimatedNumber
          value={isCompleted ? 0 : displayTotal}
          className="num font-['Poppins'] text-5xl font-black leading-none tabular-nums text-primary-token dark:text-white"
        />
        {showProjected && pending!.renewalDate && (
          <span className="mb-1 text-xs font-medium text-muted-token">
            renews {pending!.renewalDate.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
          </span>
        )}
      </div>

      {/* split bar */}
      <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-black/[.06] dark:bg-white/[.08]">
        {!isCompleted && (
          <>
            <span className="h-full" style={{ width: `${membershipPct}%`, background: tier }} />
            <span className="h-full bg-emerald-500" style={{ width: `${oneTimePct}%` }} />
          </>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="inline-flex items-center gap-2 text-muted-token">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: tier }} />
          Membership <strong className="text-primary-token dark:text-white">{membershipLegend}</strong>
        </span>
        <span className="inline-flex items-center gap-2 text-muted-token">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          One-time packs <strong className="text-primary-token dark:text-white">{entries.oneTime.toLocaleString()}</strong>
        </span>
      </div>

      {isPastDue && onResolvePayment && (
        <button
          type="button"
          onClick={onResolvePayment}
          className="mt-4 w-full rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 py-2.5 text-sm font-bold text-[#241a02] transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 motion-safe:active:translate-y-px"
        >
          Update payment to resume
        </button>
      )}

      <div className="my-4 h-px bg-gradient-to-r from-transparent via-token to-transparent" />

      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-muted-token">
          {isCompleted ? "Draw complete" : "Draw closes in"}
        </span>
        {!isCompleted && cd && (
          <div className="flex items-center gap-4">
            <CountCell v={cd.d} l="days" />
            <CountCell v={cd.h} l="hrs" />
            <CountCell v={cd.m} l="min" />
          </div>
        )}
      </div>
    </section>
  );
}
