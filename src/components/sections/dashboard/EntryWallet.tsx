"use client";

import { cn } from "@/utils/cn";
import { Clock, Plus } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import FreeEntriesChip from "@/components/ui/FreeEntriesChip";
import { useLeafTimer } from "@/hooks/useLeafTimer";
import type { DashboardAccountState } from "@/utils/dashboard/dashboard-state-theme";

interface EntryWalletProps {
  acct: DashboardAccountState;
  entries: { membership: number; oneTime: number; streak?: number };
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
  /** Render the inline "Get more entries" button (with promo badges). */
  onGetPackage?: () => void;
  /** Promo multiplier for the inline package badge (>1 shows "{n}× entries"). */
  multiplier?: number;
  /** Member/current-draw entrant → shows the "50% OFF" (Additional packages) badge. */
  hasAdditionalAccess?: boolean;
  /** ISO renewal date — with `entriesPerRenewal`, shows an "entries incoming on renewal" note for active members sitting at 0. */
  renewalDateIso?: string | null;
  /** Entries this member gets on the next renewal (for the incoming-entries note). */
  entriesPerRenewal?: number;
  /** Past-due: entries the member unlocks once they settle their failed renewal (with `pastDueRenewalCost`, shows the "settle to reactivate" note). */
  pastDueRenewalEntries?: number | null;
  /** Past-due: the renewal charge the member settles (their tier's monthly price). */
  pastDueRenewalCost?: number | null;
  className?: string;
}

/** Countdown cell — premium red gradient, matching the promotions-page countdown. */
function CDBox({ v, l }: { v: number; l: string }) {
  return (
    <div className="flex min-w-[46px] flex-col items-center gap-0.5 rounded-xl bg-gradient-to-br from-red-500 via-red-600 to-red-700 px-2.5 py-2 shadow-[0_8px_18px_-8px_rgba(238,0,0,.6)] ring-1 ring-red-300/30">
      <span className="num text-[18px] font-black leading-none tabular-nums text-white drop-shadow-[0_1px_2px_rgba(0,0,0,.35)]">{String(v).padStart(2, "0")}</span>
      <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-red-100">{l}</span>
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
  hasAdditionalAccess = false,
  renewalDateIso,
  entriesPerRenewal,
  pastDueRenewalEntries,
  pastDueRenewalCost,
  className,
}: EntryWalletProps) {
  const now = useLeafTimer(1000);
  const tier = tierHex ?? "#ee0000";
  const isPastDue = acct === "pastdue";
  const isOneTime = acct === "onetime";
  const isCompleted = drawStatus === "completed";

  // Active member whose monthly grant hasn't landed yet → tell them what's coming and when.
  const showRenewalNote =
    acct === "active" && entries.membership === 0 && (entriesPerRenewal ?? 0) > 0 && !!renewalDateIso;
  const renewalDateLabel = renewalDateIso
    ? new Date(renewalDateIso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
    : null;

  // Past-due member → what they pay and the entries that land when they settle their failed renewal.
  const showPastDueNote =
    isPastDue && (pastDueRenewalEntries ?? 0) > 0 && pastDueRenewalCost != null;

  const membership = isCompleted ? 0 : entries.membership;
  // Streak = Membership Streak milestone free entries (their own gold bucket —
  // never folded into one-time; matches the medallion identity on the streak card).
  const streak = isCompleted ? 0 : (entries.streak ?? 0);
  const total = membership + entries.oneTime + streak;
  const memberPct = total > 0 ? (membership / total) * 100 : 0;
  const streakPct = total > 0 ? (streak / total) * 100 : 0;

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
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-b from-red-500 to-red-700 px-3.5 py-2.5 text-[12px] font-extrabold text-white shadow-[0_10px_22px_-10px_rgba(238,0,0,.6)] transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-safe:active:translate-y-px"
            >
              <Plus className="h-[14px] w-[14px]" /> Get more entries
            </button>
            {hasAdditionalAccess && (
              <span className="absolute -left-2 -top-2 whitespace-nowrap rounded-full bg-gradient-to-b from-[#f6dd8c] to-[#d4af37] px-1.5 py-0.5 text-[8.5px] font-black text-[#241a02] shadow-[0_6px_12px_-5px_rgba(0,0,0,.5)]">
                50% OFF
              </span>
            )}
            {multiplier > 1 && (
              <span className="absolute -right-2 -top-2 whitespace-nowrap rounded-full bg-gradient-to-b from-[#f6dd8c] to-[#d4af37] px-1.5 py-0.5 text-[8.5px] font-black text-[#241a02] shadow-[0_6px_12px_-5px_rgba(0,0,0,.5)]">
                {multiplier}× entries
              </span>
            )}
          </div>
        )}
      </div>
      <div className="mt-4 flex h-[9px] overflow-hidden rounded-full border border-token" style={{ maxWidth: stack ? undefined : undefined }}>
        <span className="h-full" style={{ width: `${memberPct}%`, background: (isPastDue || isOneTime) ? "#8a93a1" : tier }} />
        <span className="h-full flex-1 bg-emerald-500" />
        {streak > 0 && (
          <span className="h-full" style={{ width: `${streakPct}%`, background: "linear-gradient(90deg,#fbbf24,#d97706)" }} />
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[12px]">
        <span className="inline-flex items-center gap-2 text-muted-token">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: (isPastDue || isOneTime) ? "#8a93a1" : tier }} />
          Membership{" "}
          {/* Past-due members KEEP their already-earned entries (winner selection has no
              subscription-status filter — see BUSINESS.md §3e), so show the real number, not
              "paused". What pauses is next cycle's accrual, which the seam ribbon conveys. */}
          {isOneTime ? <b className="num text-muted-token">—</b> : <b className="num text-primary-token dark:text-white">{entries.membership.toLocaleString()}</b>}
        </span>
        <span className="inline-flex items-center gap-2 text-muted-token">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-emerald-500" />
          One-time <b className="num text-primary-token dark:text-white">{entries.oneTime.toLocaleString()}</b>
        </span>
        {streak > 0 && (
          <span className="inline-flex items-center gap-2 text-muted-token">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: "linear-gradient(90deg,#fbbf24,#d97706)" }} />
            Streak <b className="num text-[#b45309] dark:text-amber-400">{streak.toLocaleString()}</b>
          </span>
        )}
      </div>
      {/* Renewal + past-due "free entries" notes — a gold/amber stat chip that mirrors the red
          countdown CDBox recipe (rounded-xl · gradient · outer shadow · inset ring · number over a
          tiny uppercase label), so "entries you gain" reads as the countdown's sibling, not a bolt-on
          card. The figure is the accumulated renewal grant (carry-forward + base, no promo). */}
      {showRenewalNote && renewalDateLabel && (
        <div className="mt-4 flex items-center gap-3 border-t border-token pt-3.5">
          <FreeEntriesChip value={entriesPerRenewal ?? 0} tone="gold" />
          <div className="min-w-0 text-[13px] leading-[1.38] text-muted-token">
            <span className="mb-px block font-['Poppins'] text-[13.5px] font-bold text-primary-token dark:text-white">Land on your renewal</span>
            Your accumulated entries drop in on{" "}
            <b className="whitespace-nowrap font-semibold text-primary-token dark:text-white">{renewalDateLabel}</b>.
          </div>
        </div>
      )}
      {showPastDueNote && (
        <div className="mt-4 flex items-center gap-3 border-t border-token pt-3.5">
          <FreeEntriesChip value={pastDueRenewalEntries ?? 0} tone="amber" />
          <div className="min-w-0 text-[13px] leading-[1.38] text-muted-token">
            <span className="mb-px block font-['Poppins'] text-[13.5px] font-bold text-primary-token dark:text-white">Waiting on your renewal</span>
            Settle <b className="whitespace-nowrap font-semibold text-primary-token dark:text-white">${pastDueRenewalCost}</b> and your free entries land as soon as it clears.
          </div>
        </div>
      )}
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
          <CDBox v={cd.d} l="days" />
          <CDBox v={cd.h} l="hrs" />
          <CDBox v={cd.m} l="mins" />
          {showSeconds && <CDBox v={cd.s} l="secs" />}
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
