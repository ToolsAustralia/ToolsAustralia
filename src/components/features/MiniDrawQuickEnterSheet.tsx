"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Ticket, X } from "lucide-react";
import SheetShell from "@/components/ui/SheetShell";
import PaymentProcessingScreen from "@/components/loading/PaymentProcessingScreen";
import LoginPromptModal from "@/components/modals/LoginPromptModal";
import MiniDrawPackageModal from "@/components/modals/MiniDrawPackageModal";
import { getMiniDrawPackages } from "@/data/miniDrawPackages";
import { useMiniDraw } from "@/hooks/queries/useMiniDrawQueries";
import { useMiniDrawPurchase } from "@/hooks/useMiniDrawPurchase";
import {
  MiniDrawPacksSheet,
  MiniPackTile,
  MorePacksButton,
  PackTrustRow,
  getMiniDrawPackTiers,
} from "@/components/features/MiniDrawPackTiles";
import type { MiniDrawCardData } from "@/components/features/MiniDrawCard";

interface MiniDrawQuickEnterSheetProps {
  /** Mount only while a draw is picked — `useMiniDrawPurchase` is keyed to this draw. */
  miniDraw: MiniDrawCardData;
  onClose: () => void;
}

/**
 * Buy without leaving the browse list. Tapping a card's "Enter draw" opens this; tapping
 * the card image or title still navigates to `/mini-draws/[id]`.
 *
 * Distinct from `MiniDrawEntrySheet` (the dashboard Draws-tab surface, which shows the
 * green fill card + running total). Both drive the SAME `useMiniDrawPurchase` money path.
 *
 * The parent mounts this only when `quickEnterDrawId` is set, so the purchase hook always
 * has a real draw id rather than a placeholder.
 */
export default function MiniDrawQuickEnterSheet({ miniDraw, onClose }: MiniDrawQuickEnterSheetProps) {
  const { data: live } = useMiniDraw(miniDraw._id);
  const minimumEntries = live?.minimumEntries ?? miniDraw.minimumEntries ?? 0;
  const totalEntries = live?.totalEntries ?? miniDraw.totalEntries ?? 0;

  const { purchase, purchasingPackageId, isSoldOut, isExceedsCapacity, paymentProcessing, loginModal } =
    useMiniDrawPurchase({ miniDrawId: miniDraw._id, minimumEntries, totalEntries });

  const { miniPacks } = useMemo(() => getMiniDrawPackTiers(), []);
  const allPacks = useMemo(() => getMiniDrawPackages(), []);

  const [selectedPackId, setSelectedPackId] = useState<string>(miniPacks[0]?._id ?? allPacks[0]?._id ?? "mini-pack-1");
  const [detailPackId, setDetailPackId] = useState<string | null>(null);
  const [packsSheetOpen, setPacksSheetOpen] = useState(false);

  const selectedPack = allPacks.find((p) => p._id === selectedPackId) ?? allPacks[0];
  const detailPack = detailPackId ? allPacks.find((p) => p._id === detailPackId) : null;
  const thumb = miniDraw.prize.images[0] || "/images/placeholder-product.jpg";
  const titleId = "mini-draw-quick-enter-title";

  return (
    <>
      <SheetShell open onClose={onClose} labelledBy={titleId}>
        <div className="flex items-center gap-3 px-4 pb-3 pt-3">
          <span className="relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-xl bg-[#F3F4F6]">
            <Image src={thumb} alt={miniDraw.prize.name} fill className="object-cover" sizes="52px" />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-red-600">Quick enter</span>
            <span id={titleId} className="line-clamp-2 text-[13px] font-bold leading-[1.3] text-[#111827] dark:text-white">
              {miniDraw.name}
            </span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close quick enter"
            className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#F3F4F6] text-[#4B5563] transition-colors hover:bg-[#E2E4E9] dark:bg-neutral-800 dark:text-neutral-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-col gap-2.5 overflow-y-auto overscroll-contain px-4 pb-5">
          {isSoldOut ? (
            <div className="rounded-2xl border border-[#EFF0F3] bg-[#FAFAFB] py-10 text-center dark:border-neutral-800 dark:bg-neutral-900">
              <p className="font-semibold text-[#111827] dark:text-white">Entries are now closed</p>
              <p className="mt-1 text-sm text-[#6B7280] dark:text-neutral-400">
                This draw hit its target and will run shortly.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                {miniPacks.map((pkg) => (
                  <MiniPackTile
                    key={pkg._id}
                    pkg={pkg}
                    showMeta={false}
                    selected={selectedPackId === pkg._id}
                    disabled={isExceedsCapacity(pkg.entries)}
                    onClick={() => setSelectedPackId(pkg._id)}
                  />
                ))}
              </div>

              <MorePacksButton onClick={() => setPacksSheetOpen(true)} />

              {selectedPack && (
                <button
                  type="button"
                  onClick={() => setDetailPackId(selectedPack._id)}
                  className="flex h-[50px] items-center justify-center gap-2 rounded-[14px] bg-gradient-to-r from-red-600 to-red-675 text-[14px] font-extrabold text-white shadow-[0_14px_26px_-12px_rgba(238,0,0,.9)]"
                >
                  <Ticket className="h-4 w-4" />
                  Enter with {selectedPack.displayName ?? selectedPack.name} — ${selectedPack.price}
                </button>
              )}

              <PackTrustRow className="pt-0.5" />
            </>
          )}
        </div>
      </SheetShell>

      <MiniDrawPacksSheet
        open={packsSheetOpen}
        onClose={() => setPacksSheetOpen(false)}
        selectedPackId={selectedPackId}
        isExceedsCapacity={isExceedsCapacity}
        isSoldOut={isSoldOut}
        onPickPack={(id) => {
          setPacksSheetOpen(false);
          setSelectedPackId(id);
          setDetailPackId(id);
        }}
      />

      {detailPack && (
        <MiniDrawPackageModal
          isOpen={detailPackId === detailPack._id}
          onClose={() => setDetailPackId(null)}
          package={detailPack}
          drawName={miniDraw.name}
          onPurchase={() => {
            setDetailPackId(null);
            purchase(detailPack._id);
          }}
          isPurchasing={purchasingPackageId === detailPack._id}
          disabled={isSoldOut || isExceedsCapacity(detailPack.entries)}
        />
      )}

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
