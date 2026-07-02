"use client";

import { useState } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { CreditCard, ChevronRight, RefreshCw, Package } from "lucide-react";
import SheetShell, { SheetHead } from "@/components/ui/SheetShell";
import { useDashboardSheetStore } from "@/stores/useDashboardSheetStore";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useMyAccountData } from "@/hooks/queries";
import { useSavedPaymentMethods } from "@/hooks/useSavedPaymentMethods";
import { queryKeys } from "@/lib/queryKeys";
import { glossGrad, inkOn } from "@/utils/membership/tier-visuals";
import { getPackageIcon } from "@/utils/images/package-icons";
import { getFallbackRenewalDate } from "@/utils/dates/month-helpers";
import { cn } from "@/utils/cn";

// Self-contained money-path flows — loaded on demand, reused as-is.
const CancellationFlowModal = dynamic(() => import("@/components/modals/CancellationFlowModal"), { ssr: false });
const RenewalFailedModal = dynamic(() => import("@/components/modals/RenewalFailedModal"), { ssr: false });

function ActionRow({ icon: Icon, label, value, onClick }: { icon: typeof CreditCard; label: string; value?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border border-token bg-surface p-4 text-left shadow-sm transition-colors hover:bg-black/[.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:hover:bg-white/[.04]"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-black/[.05] text-muted-token dark:bg-white/[.08]">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-primary-token dark:text-white">{label}</p>
        {value && <p className="truncate text-xs text-muted-token">{value}</p>}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-token" />
    </button>
  );
}

/**
 * "Manage membership" overlay — clean prototype layout (plan summary → Update
 * payment method → Change tier → Cancel membership), bottom-sheet on mobile /
 * popup on desktop. Update-payment opens the Payment sheet; cancel renders the
 * self-contained CancellationFlowModal; past-due resume renders RenewalFailedModal;
 * change-tier routes to the Membership page tier list (tapping a tier there opens
 * the upgrade/downgrade confirm via the orchestrator — see membership/page.tsx).
 */
export default function ManageSheet() {
  const sheet = useDashboardSheetStore((s) => s.sheet);
  const openSheet = useDashboardSheetStore((s) => s.openSheet);
  const closeSheet = useDashboardSheetStore((s) => s.closeSheet);
  const router = useRouter();
  const { data: session } = useSession();
  const { data: accountData } = useMyAccountData(session?.user?.id);
  const dash = useDashboardState();
  const queryClient = useQueryClient();
  const { paymentMethods, subscriptionDefaultPaymentMethodId } = useSavedPaymentMethods();

  const [cancelOpen, setCancelOpen] = useState(false);
  const [pastDueOpen, setPastDueOpen] = useState(false);

  const user = accountData?.user;
  const acct = dash.acct;
  const isActive = acct === "active";
  const isPastDue = acct === "pastdue";
  const isMember = isActive || isPastDue;

  const onSubscriptionUpdate = () => {
    const userId = session?.user?.id;
    if (!userId) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.users.account(userId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.users.dashboard(userId) });
  };

  // Plan summary
  const tierHex = dash.tierHex ?? "#26262b";
  const tierIcon = dash.tierKey ? getPackageIcon(`${dash.tierKey}-subscription`) : null;
  const tierName = dash.tierLabel ?? (user?.subscriptionPackageData as { name?: string } | undefined)?.name ?? "Membership";
  const price = (user?.subscriptionPackageData as { price?: number } | undefined)?.price;
  const sub = user?.subscription as { endDate?: string | Date; startDate?: string | Date; autoRenew?: boolean } | undefined;
  const renewDate = (() => {
    const d = sub?.endDate ? new Date(sub.endDate) : sub?.startDate ? getFallbackRenewalDate(new Date(sub.startDate)) : null;
    if (!d || Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  })();
  const autoRenew = sub?.autoRenew !== false;
  const renewLabel = isPastDue
    ? "Payment failed — renew to resume"
    : renewDate
      ? `${autoRenew ? "Renews" : "Ends"} ${renewDate}${autoRenew ? " · auto-renews monthly" : ""}`
      : autoRenew
        ? "Auto-renews monthly"
        : "";

  // Default card label for the "Update payment method" row.
  const defaultCard =
    paymentMethods.find((m) => m.isDefault) ??
    paymentMethods.find((m) => m.paymentMethodId === subscriptionDefaultPaymentMethodId) ??
    paymentMethods[0];
  const cardMeta = defaultCard?.card;
  const cardLabel = cardMeta
    ? `${cardMeta.brand ? cardMeta.brand.charAt(0).toUpperCase() + cardMeta.brand.slice(1) : "Card"} •••• ${cardMeta.last4}`
    : "Add a card";

  return (
    <>
      <SheetShell open={sheet === "manage"} onClose={closeSheet} labelledBy="manage-sheet-title">
        <SheetHead title="Manage membership" sub="Your plan, billing and renewal" onClose={closeSheet} id="manage-sheet-title" />
        <div className="space-y-3 overflow-y-auto px-5 pb-6">
          {isMember ? (
            <>
              {/* Plan summary */}
              <div className="flex items-center gap-3 rounded-2xl border border-token bg-surface p-4 shadow-sm">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: glossGrad(tierHex), color: inkOn(tierHex) }}>
                  {tierIcon ? (
                    <Image src={tierIcon} alt="" width={26} height={26} className="h-[26px] w-[26px] object-contain drop-shadow" />
                  ) : (
                    <Package className="h-5 w-5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-['Poppins'] text-base font-extrabold text-primary-token dark:text-white">{tierName}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        isPastDue
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
                      )}
                    >
                      {isPastDue ? "Paused" : "Active"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-token">{renewLabel}</p>
                </div>
                {price != null && (
                  <div className="text-right">
                    <div className="font-['Poppins'] text-lg font-black" style={{ color: tierHex }}>${price}</div>
                    <div className="text-[10px] font-semibold text-muted-token">/mo</div>
                  </div>
                )}
              </div>

              {isPastDue && (
                <button
                  type="button"
                  onClick={() => setPastDueOpen(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-[#241a02] transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 motion-safe:active:translate-y-px"
                  style={{ background: "linear-gradient(180deg,#fbbf24,#d97706)" }}
                >
                  <RefreshCw className="h-4 w-4" /> Update payment to resume
                </button>
              )}

              <ActionRow icon={CreditCard} label="Update payment method" value={cardLabel} onClick={() => openSheet("payment")} />
              <ActionRow
                icon={Package}
                label="Change tier"
                value="See all tiers below"
                onClick={() => {
                  closeSheet();
                  router.push("/my-account/membership");
                }}
              />

              {isActive && (
                <button
                  type="button"
                  onClick={() => setCancelOpen(true)}
                  className="w-full rounded-2xl border border-red-200 bg-surface py-3.5 text-sm font-bold text-red-600 transition-colors hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:border-red-900/60 dark:hover:bg-red-950/20"
                >
                  Cancel membership
                </button>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-token bg-surface p-5 text-center shadow-sm">
              <p className="font-['Poppins'] text-base font-extrabold text-primary-token dark:text-white">No active membership</p>
              <p className="mt-1 text-sm text-muted-token">Become a member for monthly free entries and lasting partner access.</p>
              <button
                type="button"
                onClick={() => {
                  closeSheet();
                  router.push("/my-account/membership");
                }}
                className="mt-4 w-full rounded-xl bg-gradient-to-b from-red-500 to-red-700 py-3 text-sm font-bold text-white transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-safe:active:translate-y-px"
              >
                Choose a plan
              </button>
            </div>
          )}
        </div>
      </SheetShell>

      {/* Cancel — self-contained retention + cancel flow. */}
      {cancelOpen && (
        <CancellationFlowModal
          isOpen={cancelOpen}
          onClose={() => setCancelOpen(false)}
          onCancelled={() => {
            onSubscriptionUpdate();
            closeSheet();
          }}
          onSaved={() => onSubscriptionUpdate()}
          onResolvePayment={() => {
            setCancelOpen(false);
            setPastDueOpen(true);
          }}
          tierDowngradeAvailable={false}
        />
      )}

      {/* Past-due resume — self-contained pay-failed-invoice flow. */}
      {pastDueOpen && <RenewalFailedModal isOpen={pastDueOpen} onClose={() => setPastDueOpen(false)} />}
    </>
  );
}
