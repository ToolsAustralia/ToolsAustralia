"use client";

import { useMemo, useState } from "react";
import { Ticket, Calendar, CheckCircle2, Clock3, Gift, Loader2, Lock, Sparkles } from "lucide-react";
import { useRedeemablesWallet, useRedeemablesStatus, useRedeemableRedemption } from "@/hooks/queries";
import { useToast } from "@/components/ui/Toast";
import { useKlaviyoTracking } from "@/hooks/useKlaviyoTracking";
import { trackEvent } from "@/lib/gtm";

interface RedeemablesWalletProps {
  userId: string;
  variant?: "dashboard" | "rewards";
  onRequirePurchase?: (item: { issuanceId: string; campaignName?: string; displayLabel?: string }) => void;
}

function formatStatus(status: string): string {
  switch (status) {
    case "expired":
      return "Expired";
    case "claimable":
      return "Claimable";
    case "pending":
      return "Pending";
    default:
      return status ? status.charAt(0).toUpperCase() + status.slice(1) : "Unknown";
  }
}

export default function RedeemablesWallet({ userId, variant = "dashboard", onRequirePurchase }: RedeemablesWalletProps) {
  const { data: walletData, isLoading: isWalletLoading } = useRedeemablesWallet(userId, { page: 1, limit: 30 });
  const { data: status, isLoading: isStatusLoading } = useRedeemablesStatus(userId);
  const redemptionMutation = useRedeemableRedemption(userId);
  const { showToast } = useToast();
  const { track } = useKlaviyoTracking();
  const [codeInput, setCodeInput] = useState("");

  const wallet = useMemo(() => walletData?.wallet || [], [walletData]);
  const displayedWallet = useMemo(
    () => (wallet || []).filter((item) => item.isRedeemableNow),
    [wallet]
  );
  const activeWalletItems = displayedWallet;

  const containerClass =
    variant === "dashboard"
      ? "bg-white rounded-2xl border border-gray-200 shadow-sm"
      : "bg-gradient-to-br from-white to-gray-50 rounded-2xl border border-gray-200 shadow-sm";

  const onRedeem = async (payload: { issuanceId?: string; code?: string; entriesAmount?: number }) => {
    try {
      const response = await redemptionMutation.mutateAsync(payload);
      if (!response.success) {
        throw new Error(response.error || "Redemption failed");
      }
      const grantedEntries = response.data?.entriesGranted || 0;
      track("Monthly Redeemable Redeemed", {
        userId,
        entriesGranted: grantedEntries,
        redeemMethod: payload.code ? "code-input" : "wallet-item",
      });
      trackEvent("monthly_redeemable_redeemed", {
        userId,
        entriesGranted: grantedEntries,
        redeemMethod: payload.code ? "code-input" : "wallet-item",
      });
      showToast({
        type: "success",
        title: "Redeemed Successfully",
        message: `${grantedEntries} free entries were added to your account.`,
        duration: 5000,
      });
      setCodeInput("");
    } catch (error) {
      showToast({
        type: "error",
        title: "Redemption Failed",
        message: error instanceof Error ? error.message : "Unable to redeem at this time.",
        duration: 5000,
      });
    }
  };

  return (
    <section className={containerClass} aria-label="Redeemables wallet">
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-red-600/10">
              <Gift className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 font-['Poppins']">Redeemables Wallet</h3>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-neutral-400">Manage stacked free-entry rewards and monthly codes</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
            <Sparkles className="w-3.5 h-3.5" />
            {activeWalletItems.length} Active
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3.5">
          <p className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-neutral-100 mb-2.5">Have a code? Redeem instantly</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              placeholder="Enter code (e.g. TA-202603-ABC123)"
              className="flex-1 h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600"
              aria-label="Redeemable code input"
            />
            <button
              onClick={() => onRedeem({ code: codeInput })}
              disabled={!codeInput.trim() || redemptionMutation.isPending}
              className="h-11 px-4 rounded-lg bg-gradient-to-r from-red-600 to-red-600 text-white text-sm font-semibold hover:from-red-600 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {redemptionMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Redeeming
                </>
              ) : (
                "Redeem Code"
              )}
            </button>
          </div>
        </div>

        {isWalletLoading || isStatusLoading ? (
          <div className="py-8 flex items-center justify-center text-gray-500 gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading redeemables...
          </div>
        ) : (
          <>
            {!status?.eligible && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-800">
                  Monthly free entries are currently available for active subscribers only.
                </p>
              </div>
            )}

            {displayedWallet?.length ? (
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {displayedWallet.map((item) => (
                  <article
                    key={item.issuanceId}
                    className="rounded-xl border border-gray-200 bg-white p-3.5 hover:border-red-600/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="text-sm sm:text-base font-semibold text-gray-900 truncate">
                          {item.campaignName || `Monthly Reward ${item.monthKey}`}
                        </h4>
                        <p className="text-xs sm:text-sm text-gray-600 dark:text-neutral-400 mt-1 flex items-center gap-1.5">
                          <Ticket className="w-3.5 h-3.5" />
                          {item.entriesAmount.toLocaleString()} free entries
                        </p>
                        {item.purchaseRequirement !== "none" && (
                          <p className="mt-1 text-2xs sm:text-xs text-amber-700 font-medium">
                            {item.purchaseRequirement === "membership" && "Code for membership purchase"}
                            {item.purchaseRequirement === "one-time" && "Code for one-time purchase"}
                            {item.purchaseRequirement === "any" && "Coupon valid for any purchase"}
                          </p>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs sm:text-xs text-gray-500">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {item.neverExpires ? "No expiry" : item.expiresAt ? `Expires ${new Date(item.expiresAt).toLocaleDateString()}` : "No expiry"}
                          </span>
                          {item.campaignCode && (
                            <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{item.campaignCode}</span>
                          )}
                        </div>
                      </div>

                      {item.isRedeemableNow ? (
                        item.purchaseRequirement !== "none" ? (
                          <button
                            onClick={() =>
                              onRequirePurchase?.({
                                issuanceId: item.issuanceId,
                                campaignName: item.campaignName,
                                displayLabel: item.displayLabel,
                              })
                            }
                            className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-amber-500 text-white text-xs sm:text-sm font-semibold hover:bg-amber-600"
                          >
                            <Lock className="w-4 h-4" />
                            Unlock
                          </button>
                        ) : (
                          <button
                            onClick={() => onRedeem({ issuanceId: item.issuanceId, entriesAmount: item.entriesAmount })}
                            disabled={redemptionMutation.isPending}
                            className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-red-600 text-white text-xs sm:text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            Redeem
                          </button>
                        )
                      ) : (
                        <div className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-gray-100 text-gray-600 dark:text-neutral-400 text-xs sm:text-sm font-medium">
                          <Clock3 className="w-4 h-4" />
                          {item.status === "redeemed" ? "Redeemed" : formatStatus(item.status)}
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
                <Gift className="w-7 h-7 text-gray-400 mx-auto mb-2" />
                <p className="text-sm font-semibold text-gray-800 dark:text-neutral-100">No redeemables yet</p>
                <p className="text-xs text-gray-500 mt-1">When rewards are issued, they will appear here automatically.</p>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
