"use client";

import { Gift, Bolt, Check, Clock } from "lucide-react";
import { cn } from "@/utils/cn";
import {
  useRedeemablesWallet,
  useRedeemableRedemption,
  type RedeemableWalletItem,
} from "@/hooks/queries/useRedeemablesQueries";
import type { DashboardAccountState } from "@/utils/dashboard/dashboard-state-theme";

interface RewardsClaimablesProps {
  userId: string;
  acct: DashboardAccountState;
}

function label(item: RedeemableWalletItem): string {
  return item.displayLabel || item.campaignName || `+${item.entriesAmount} free entries`;
}

/** "Ready to claim" + "Recently claimed" from the redeemables wallet. Paused-safe. */
export default function RewardsClaimables({ userId, acct }: RewardsClaimablesProps) {
  const disabled = acct === "pastdue";
  const claimable = useRedeemablesWallet(userId, { status: "claimable", limit: 10 });
  const past = useRedeemablesWallet(userId, { status: "past", limit: 6 });
  const redeem = useRedeemableRedemption(userId);

  // Rewards program paused (API 503s) → neutral unavailable state, never a crash.
  if (claimable.isError) {
    return (
      <section className="rounded-3xl border border-token bg-surface p-5 shadow-sm">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-token">Rewards</span>
        <p className="mt-2 text-sm text-muted-token">Claimable rewards are temporarily unavailable. Check back soon.</p>
      </section>
    );
  }

  const claimItems = claimable.data?.wallet ?? [];
  const pastItems = past.data?.wallet ?? [];

  return (
    <>
      <section className="rounded-3xl border border-token bg-surface p-5 shadow-sm">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-token">Ready to claim</span>

        {claimable.isLoading ? (
          <div className="mt-3 h-14 animate-pulse rounded-2xl bg-black/[.05] dark:bg-white/[.06]" />
        ) : claimItems.length === 0 ? (
          <p className="mt-2 text-sm text-muted-token">No rewards to claim right now — keep your membership active to earn more.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {claimItems.map((item) => {
              const canClaim = item.isRedeemableNow && !disabled;
              const Icon = item.source === "milestone" ? Bolt : Gift;
              return (
                <li key={item.issuanceId} className="flex items-center gap-3 rounded-2xl border border-token bg-black/[.03] p-3 dark:bg-white/[.04]">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 text-[#241a02]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-primary-token dark:text-white">{label(item)}</div>
                    {item.entriesAmount > 0 && (
                      <div className="text-xs text-muted-token">+{item.entriesAmount.toLocaleString()} free entries</div>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={!canClaim || redeem.isPending}
                    onClick={() => redeem.mutate({ issuanceId: item.issuanceId, entriesAmount: item.entriesAmount })}
                    className={cn(
                      "shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-safe:active:translate-y-px",
                      canClaim
                        ? "bg-gradient-to-b from-red-500 to-red-700 text-white disabled:opacity-60"
                        : "cursor-default bg-black/[.05] text-muted-token dark:bg-white/[.08]",
                    )}
                  >
                    {disabled ? "Paused" : redeem.isPending ? "Claiming…" : "Claim"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {pastItems.length > 0 && (
        <section className="rounded-3xl border border-token bg-surface p-5 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-token">Recently claimed</span>
          <ul className="mt-3 space-y-2">
            {pastItems.map((item) => (
              <li key={item.issuanceId} className="flex items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                  <Check className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1 truncate text-sm font-medium text-primary-token dark:text-white">{label(item)}</div>
                {item.redeemedAt && (
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-token">
                    <Clock className="h-3 w-3" />
                    {new Date(item.redeemedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
