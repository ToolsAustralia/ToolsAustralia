"use client";

import { useState } from "react";
import { Gift, Bolt, Check, Clock, ChevronRight } from "lucide-react";
import { cn } from "@/utils/cn";
import SheetShell, { SheetHead } from "@/components/ui/SheetShell";
import {
  useRedeemablesWallet,
  useRedeemableRedemption,
  type RedeemableWalletItem,
} from "@/hooks/queries/useRedeemablesQueries";

interface RewardsClaimablesProps {
  userId: string;
  /**
   * Locked purchase-required coupon tapped → open the qualifying-purchase flow with the coupon
   * code carried (membership-required → membership modal; one-time/any → one-time packages).
   * Without it, locked items render the old disabled label (no dead-end regression for other mounts).
   */
  onUnlock?: (item: RedeemableWalletItem) => void;
}

function label(item: RedeemableWalletItem): string {
  return item.displayLabel || item.campaignName || `+${item.entriesAmount} free entries`;
}

/**
 * Claimable rewards — an animating gift trigger (bounces + count badge ONLY when
 * there's something to claim now) that opens a claimables overlay sheet, plus a
 * "Recently claimed" list. Paused-safe (rewards API 503 → neutral state).
 */
export default function RewardsClaimables({ userId, onUnlock }: RewardsClaimablesProps) {
  const [open, setOpen] = useState(false);
  // Match the home "Redeem" tile's params ({ status: "claimable", limit: 20 }) so the two share one
  // deduped query and can't show different counts (a >10-claimable user would otherwise diverge).
  const claimable = useRedeemablesWallet(userId, { status: "claimable", limit: 20 });
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
  // Only TRULY claimable items drive the animation + badge. Trust the server's per-item
  // isRedeemableNow — it already gates membership coupons on an active subscription (hasQualifyingPurchase),
  // so a past-due member can still claim milestone rewards + none/one-time/any coupons; the redeem
  // endpoint enforces the identical predicate. A blanket past-due disable wrongly hid those.
  const claimableCount = claimItems.filter((i) => i.isRedeemableNow).length;
  const hasClaimable = claimableCount > 0;

  return (
    <>
      {/* Animating reward trigger — replaces the old inline "Ready to claim" list. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-4 rounded-3xl border border-token bg-surface p-5 text-left shadow-sm transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-safe:active:translate-y-px"
      >
        <span className="relative grid h-14 w-14 shrink-0 place-items-center">
          {hasClaimable && <span aria-hidden className="absolute inset-0 rounded-2xl bg-amber-400/40 motion-safe:animate-ping" />}
          <span
            className={cn(
              "relative grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 text-[#241a02] shadow",
              hasClaimable && "motion-safe:animate-bounce",
            )}
          >
            <Gift className="h-7 w-7" />
          </span>
          {hasClaimable && (
            <span className="absolute -right-1 -top-1 grid h-5 min-w-[20px] place-items-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
              {claimableCount}
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-['Poppins'] text-base font-extrabold text-primary-token dark:text-white">
            {hasClaimable ? `${claimableCount} reward${claimableCount > 1 ? "s" : ""} to claim` : "No rewards to claim"}
          </p>
          <p className="text-sm text-muted-token">
            {hasClaimable ? "Tap to view and claim your free entries." : "Rewards you earn will appear here."}
          </p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-token" />
      </button>

      {/* Recently claimed */}
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

      {/* Claimables sheet — bottom-sheet on mobile / popup on desktop. */}
      <SheetShell open={open} onClose={() => setOpen(false)} labelledBy="claimables-sheet-title">
        <SheetHead title="Claimable rewards" sub="Claim your free entries" onClose={() => setOpen(false)} id="claimables-sheet-title" />
        <div className="overflow-y-auto px-5 pb-6">
          {claimable.isLoading ? (
            <div className="h-14 animate-pulse rounded-2xl bg-black/[.05] dark:bg-white/[.06]" />
          ) : claimItems.length === 0 ? (
            <p className="text-sm text-muted-token">No rewards to claim right now — they&apos;ll appear here as you earn them.</p>
          ) : (
            <ul className="space-y-2">
              {claimItems.map((item) => {
                const canClaim = item.isRedeemableNow;
                const locked = !item.isRedeemableNow;
                // Locked purchase-required coupon → an ACTIONABLE unlock CTA (opens the qualifying
                // purchase flow with the code carried), not a disabled dead-end. Server-side the burn
                // stays gated by hasQualifyingPurchase either way.
                const unlockable = locked && item.purchaseRequirement !== "none" && !!onUnlock;
                const lockedLabel = item.purchaseRequirement === "membership" ? (unlockable ? "Join to unlock" : "Members only") : "Purchase to unlock";
                const Icon = item.source === "milestone" ? Bolt : Gift;
                return (
                  <li key={item.issuanceId} className="flex items-center gap-3 rounded-2xl border border-token bg-black/[.03] p-3 dark:bg-white/[.04]">
                    <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", locked ? "bg-black/[.06] text-muted-token dark:bg-white/[.08]" : "bg-gradient-to-b from-amber-300 to-amber-500 text-[#241a02]")}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-primary-token dark:text-white">{label(item)}</div>
                      {item.entriesAmount > 0 && <div className="text-xs text-muted-token">+{item.entriesAmount.toLocaleString()} free entries</div>}
                    </div>
                    <button
                      type="button"
                      disabled={(!canClaim && !unlockable) || redeem.isPending}
                      onClick={() => {
                        if (canClaim) {
                          redeem.mutate({ issuanceId: item.issuanceId, entriesAmount: item.entriesAmount });
                        } else if (unlockable) {
                          setOpen(false); // close this sheet so the purchase modal isn't stacked under it
                          onUnlock?.(item);
                        }
                      }}
                      className={cn(
                        "shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-safe:active:translate-y-px",
                        canClaim
                          ? "bg-gradient-to-b from-red-500 to-red-700 text-white disabled:opacity-60"
                          : unlockable
                            ? "bg-gradient-to-b from-amber-400 to-amber-600 text-white disabled:opacity-60"
                            : "cursor-default bg-black/[.05] text-muted-token dark:bg-white/[.08]",
                      )}
                    >
                      {redeem.isPending ? "Claiming…" : locked ? lockedLabel : "Claim"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetShell>
    </>
  );
}
