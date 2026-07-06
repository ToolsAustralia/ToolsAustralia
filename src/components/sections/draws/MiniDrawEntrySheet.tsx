"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Check, Ticket, Loader2, ArrowUpRight } from "lucide-react";
import SheetShell, { SheetHead } from "@/components/ui/SheetShell";
import PaymentProcessingScreen from "@/components/loading/PaymentProcessingScreen";
import LoginPromptModal from "@/components/modals/LoginPromptModal";
import { getMiniDrawPackages } from "@/data/miniDrawPackages";
import { useMiniDraw } from "@/hooks/queries/useMiniDrawQueries";
import { useMiniDrawPurchase } from "@/hooks/useMiniDrawPurchase";
import { cn } from "@/utils/cn";
import type { MiniDrawCardData } from "@/components/features/MiniDrawCard";

interface MiniDrawEntrySheetProps {
  open: boolean;
  onClose: () => void;
  miniDraw: MiniDrawCardData;
  /** The viewer's current entries in THIS draw (from miniDrawParticipation). */
  userEntryCount?: number;
}

/**
 * In-place mini-draw entry-pack purchase sheet — the Draws tab opens this instead of
 * navigating to `/mini-draws/[id]`. Renders the prototype "Enter {draw}" design (green
 * prize/fill card → pack picker → running total → single "Add N entries" CTA) and drives
 * the purchase through the SHARED `useMiniDrawPurchase` money path (same endpoint,
 * webhook-confirmed granting, upsell) that the detail page uses — never a fork.
 */
export default function MiniDrawEntrySheet({ open, onClose, miniDraw, userEntryCount = 0 }: MiniDrawEntrySheetProps) {
  const router = useRouter();
  // Live data reflects the optimistic bump the purchase hook writes to this same cache key,
  // so the fill bar + "you hold N" update the instant a charge is fired.
  const { data: live } = useMiniDraw(open ? miniDraw._id : undefined);

  const minimumEntries = live?.minimumEntries ?? miniDraw.minimumEntries ?? 0;
  const totalEntries = live?.totalEntries ?? miniDraw.totalEntries ?? 0;
  const userEntries = live?.userEntryCount ?? userEntryCount;
  const remaining = live?.entriesRemaining ?? miniDraw.entriesRemaining ?? Math.max(minimumEntries - totalEntries, 0);
  const pct = minimumEntries > 0 ? Math.min(100, Math.round((totalEntries / minimumEntries) * 100)) : 0;

  const { purchase, purchasingPackageId, isSoldOut, isExceedsCapacity, paymentProcessing, loginModal } =
    useMiniDrawPurchase({ miniDrawId: miniDraw._id, minimumEntries, totalEntries });

  const packs = useMemo(() => getMiniDrawPackages(), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Default to the first pack that fits the remaining capacity (packs ascend by size).
  const defaultId = packs.find((p) => !isExceedsCapacity(p.entries))?._id ?? packs[0]?._id ?? null;
  const activeId = selectedId ?? defaultId;
  const selected = packs.find((p) => p._id === activeId) ?? null;

  const isPurchasing = purchasingPackageId !== null;
  const ctaEntries = selected?.entries ?? 0;
  const ctaPrice = selected?.price ?? 0;
  const ctaDisabled = !selected || isSoldOut || isExceedsCapacity(ctaEntries) || isPurchasing;
  const newTotal = userEntries + ctaEntries;

  const titleId = "mini-draw-entry-title";

  return (
    <>
      <SheetShell open={open} onClose={onClose} labelledBy={titleId}>
        <SheetHead
          id={titleId}
          title={`Enter ${miniDraw.name}`}
          sub="Buy an entry pack to join this draw"
          onClose={onClose}
        />

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {/* Prize + fill card */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 p-4 text-white shadow-[0_14px_30px_-14px_rgba(5,150,105,.7)]">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15">
                <CreditCard className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="truncate font-['Poppins'] text-[17px] font-extrabold leading-tight">{miniDraw.prize?.name ?? miniDraw.name}</div>
                <div className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">
                  You hold {userEntries.toLocaleString()} {userEntries === 1 ? "entry" : "entries"}
                </div>
              </div>
            </div>
            <div className="mt-3.5 h-2 overflow-hidden rounded-full bg-white/25">
              <span className="block h-full rounded-full bg-white transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] font-semibold">
              <span className="font-black">{pct}% full</span>
              <span className="text-white/85"><b className="num">{remaining.toLocaleString()}</b> entries to draw</span>
            </div>
          </div>

          {/* Jump to the full mini-draw detail page. */}
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push(`/mini-draws/${miniDraw._id}`);
            }}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-token bg-surface py-2.5 text-[12.5px] font-bold text-primary-token transition-colors hover:bg-page dark:text-white"
          >
            View mini draw <ArrowUpRight className="h-4 w-4" />
          </button>

          {isSoldOut ? (
            <div className="mt-5 rounded-2xl border border-token bg-page py-10 text-center">
              <p className="font-semibold text-primary-token dark:text-white">Entries are now closed</p>
              <p className="mt-1 text-sm text-muted-token">This draw hit its target and will run shortly.</p>
            </div>
          ) : (
            <>
              <div className="mb-2.5 mt-5 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-token">Choose an entry pack</div>

              <div className="grid grid-cols-2 gap-2.5">
                {packs.map((pkg) => {
                  const disabled = isExceedsCapacity(pkg.entries);
                  const isActive = activeId === pkg._id;
                  return (
                    <button
                      key={pkg._id}
                      type="button"
                      disabled={disabled}
                      onClick={() => setSelectedId(pkg._id)}
                      className={cn(
                        "relative flex flex-col items-start rounded-2xl border p-3 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                        disabled
                          ? "cursor-not-allowed border-token bg-page opacity-50"
                          : isActive
                            ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500 dark:bg-emerald-950/30"
                            : "border-token bg-surface hover:border-emerald-400/60",
                      )}
                    >
                      <span className={cn("font-['Poppins'] text-[14px] font-extrabold leading-tight", isActive ? "text-emerald-700 dark:text-emerald-300" : "text-primary-token dark:text-white")}>
                        {pkg.displayName ?? pkg.name}
                      </span>
                      <span className="mt-0.5 text-[11px] font-semibold text-muted-token">
                        {pkg.entries.toLocaleString()} free {pkg.entries === 1 ? "entry" : "entries"}
                      </span>
                      <span className={cn("num mt-2 text-[18px] font-black leading-none", isActive ? "text-emerald-600 dark:text-emerald-400" : "text-primary-token dark:text-white")}>
                        ${pkg.price.toLocaleString()}
                      </span>
                      {disabled && <span className="mt-1 text-[10px] font-bold text-red-500">{remaining.toLocaleString()} entries left</span>}
                    </button>
                  );
                })}
              </div>

              {/* Running total */}
              <div className="mt-4 rounded-2xl border border-token bg-page p-3.5">
                <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-muted-token">
                  <span>New entry total in this draw</span>
                  {selected && <span className="truncate text-primary-token dark:text-white">{selected.displayName ?? selected.name}</span>}
                </div>
                <div className="mt-1 flex items-end justify-between">
                  <div className="flex items-baseline gap-1.5">
                    <span className="num font-['Poppins'] text-[26px] font-black leading-none text-primary-token dark:text-white">{newTotal.toLocaleString()}</span>
                    {ctaEntries > 0 && <span className="num text-[13px] font-black text-emerald-600 dark:text-emerald-400">+{ctaEntries.toLocaleString()}</span>}
                  </div>
                  <span className="num text-[20px] font-black text-primary-token dark:text-white">${ctaPrice.toLocaleString()}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* CTA footer */}
        {!isSoldOut && (
          <div className="shrink-0 border-t border-token bg-surface px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3.5">
            <button
              type="button"
              disabled={ctaDisabled}
              onClick={() => selected && purchase(selected._id)}
              className={cn(
                "inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[14px] font-extrabold text-white transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2",
                ctaDisabled ? "cursor-not-allowed bg-neutral-400 dark:bg-neutral-700" : "bg-gradient-to-b from-emerald-500 to-emerald-700 shadow-[0_12px_26px_-10px_rgba(5,150,105,.7)] motion-safe:active:translate-y-px",
              )}
            >
              {isPurchasing ? (
                <><Loader2 className="h-[17px] w-[17px] animate-spin" /> Processing…</>
              ) : selected ? (
                <><Ticket className="h-[17px] w-[17px]" /> Get {selected.displayName ?? selected.name} · ${ctaPrice.toLocaleString()}</>
              ) : (
                <><Ticket className="h-[17px] w-[17px]" /> Choose a pack</>
              )}
            </button>
            {/* Not "the moment it fills" — that reads as "might sit forever" for a low-fill draw
                (owner call). Same mechanics, motivating frame: winner is automatic + guaranteed. */}
            <p className="mt-2.5 flex items-center justify-center gap-1.5 text-center text-[11px] font-medium text-muted-token">
              <Check className="h-3.5 w-3.5 text-emerald-500" /> Entries added instantly · winner drawn automatically — someone always takes the prize.
            </p>
          </div>
        )}
      </SheetShell>

      {/* Webhook-aware payment overlay (portals above the sheet) */}
      {paymentProcessing.show && paymentProcessing.paymentIntentId && (
        <PaymentProcessingScreen
          paymentIntentId={paymentProcessing.paymentIntentId}
          packageName={paymentProcessing.packageName}
          packageType="mini-draw"
          isVisible={paymentProcessing.show}
          onSuccess={paymentProcessing.onSuccess}
          onError={paymentProcessing.onError}
          onTimeout={paymentProcessing.onTimeout}
          onStillProcessingDismiss={paymentProcessing.onTimeout}
        />
      )}

      <LoginPromptModal isOpen={loginModal.open} onClose={() => loginModal.setOpen(false)} />
    </>
  );
}
