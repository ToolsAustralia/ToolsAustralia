"use client";

import { useMemo, useState } from "react";
import { ArrowRight, ChevronRight, Info, Ticket } from "lucide-react";
import { getMiniDrawPackages } from "@/data/miniDrawPackages";
import MiniDrawPackageModal from "@/components/modals/MiniDrawPackageModal";
import { MiniDrawPacksSheet } from "@/components/features/MiniDrawPackTiles";
import { MINI_DRAWS_RESULTS_ANCHOR } from "@/components/features/MiniDrawsContent";

/**
 * Closes out `/mini-draws` where `MembershipSection` used to sit. That section sells
 * MAJOR-draw entries, which do nothing here — mini-draw entry is pack-only — so it was
 * actively misleading on this route.
 *
 * Deliberately NOT a purchasable pack grid: at this point in the page the visitor has not
 * chosen a draw, so there is no draw for free entries to land on. The block's job is to
 * state the order of operations (pick a draw → choose a pack on that draw) and let the
 * curious price-check the catalogue without committing.
 */
export default function ReadyToEnter() {
  const [packsSheetOpen, setPacksSheetOpen] = useState(false);
  const [detailPackId, setDetailPackId] = useState<string | null>(null);
  const packs = useMemo(() => getMiniDrawPackages(), []);
  const detailPack = detailPackId ? packs.find((p) => p._id === detailPackId) : null;

  const scrollToResults = () => {
    setPacksSheetOpen(false);
    setDetailPackId(null);
    document.getElementById(MINI_DRAWS_RESULTS_ANCHOR)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const primaryButton = (className: string) => (
    <button
      type="button"
      onClick={scrollToResults}
      className={`flex items-center justify-center gap-2 rounded-[14px] bg-gradient-to-r from-red-600 to-red-675 font-extrabold text-white shadow-[0_12px_24px_-14px_rgba(238,0,0,.9)] transition-opacity hover:opacity-95 ${className}`}
    >
      Browse active mini draws
      <ArrowRight className="h-[15px] w-[15px] lg:h-4 lg:w-4" />
    </button>
  );

  const secondaryButton = (className: string) => (
    <button
      type="button"
      onClick={() => setPacksSheetOpen(true)}
      className={`flex items-center justify-center gap-2 rounded-[14px] border border-[#E5E7EB] bg-white font-bold text-[#374151] transition-colors hover:bg-gray-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800 ${className}`}
    >
      See pack prices &amp; inclusions
      <ChevronRight className="h-3.5 w-3.5 lg:h-[15px] lg:w-[15px]" />
    </button>
  );

  return (
    <>
      <section className="mx-auto w-full max-w-7xl px-3.5 pb-7 sm:px-6 lg:px-8 lg:pb-10">
        <div className="overflow-hidden rounded-[22px] border border-[#EFF0F3] bg-white shadow-[0_10px_26px_-20px_rgba(15,23,42,.45)] lg:rounded-[20px] lg:border-[#EAECEF] dark:border-neutral-800 dark:bg-neutral-900">
          {/* Mobile — stacked, centred */}
          <div className="flex flex-col gap-3.5 px-4 pb-[18px] pt-5 lg:hidden">
            <div className="flex flex-col gap-1.5 text-center">
              <span className="inline-flex items-center gap-1.5 self-center rounded-full bg-[#FEF2F2] px-2.5 py-[5px] text-[10.5px] font-extrabold uppercase tracking-[0.07em] text-[#C70000] dark:bg-red-950/40 dark:text-red-400">
                <Ticket className="h-3 w-3" />
                Mini packs from $1
              </span>
              <h3 className="mt-1 text-[17px] font-extrabold text-[#111827] dark:text-white">Ready to enter?</h3>
              <p className="text-[12.5px] leading-[1.55] text-[#6B7280] text-pretty dark:text-neutral-400">
                Pick the mini draw you want first — you choose your pack on the draw itself, so your free entries land
                on that exact prize.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {primaryButton("h-12 text-[13.5px]")}
              {secondaryButton("h-11 text-[12.5px]")}
            </div>
            <div className="flex items-start gap-2.5 rounded-[13px] border border-[#F1F2F5] bg-[#FAFAFB] p-[11px] dark:border-neutral-800 dark:bg-neutral-950">
              <Info className="mt-px h-3.5 w-3.5 shrink-0 text-[#9CA3AF]" />
              <span className="text-[11.5px] leading-[1.5] text-[#6B7280] dark:text-neutral-400">
                Mini packs are the only way into mini draws — membership entries don&apos;t apply here.
              </span>
            </div>
          </div>

          {/* Desktop — copy left, buttons in a fixed column right */}
          <div className="hidden items-center gap-8 p-7 lg:flex">
            <div className="min-w-0 flex-1">
              <span className="inline-flex items-center gap-2 rounded-full bg-[#FEF2F2] px-3.5 py-1.5 text-[11.5px] font-extrabold uppercase tracking-[0.07em] text-[#C70000] dark:bg-red-950/40 dark:text-red-400">
                <Ticket className="h-[13px] w-[13px]" />
                Mini packs from $1
              </span>
              <h3 className="mb-1.5 mt-3 text-[22px] font-extrabold text-[#111827] dark:text-white">Ready to enter?</h3>
              <p className="max-w-[520px] text-[14.5px] leading-[1.6] text-[#6B7280] text-pretty dark:text-neutral-400">
                Pick the mini draw you want first — you choose your pack on the draw itself, so your free entries land
                on that exact prize. Mini packs are the only way into mini draws; membership entries don&apos;t apply
                here.
              </p>
            </div>
            <div className="flex w-[280px] shrink-0 flex-col gap-2.5">
              {primaryButton("h-[52px] text-[15px]")}
              {secondaryButton("h-12 text-sm")}
            </div>
          </div>
        </div>
      </section>

      <MiniDrawPacksSheet
        open={packsSheetOpen}
        onClose={() => setPacksSheetOpen(false)}
        selectedPackId={detailPackId}
        onPickPack={(id) => {
          setPacksSheetOpen(false);
          setDetailPackId(id);
        }}
      />

      {/* No draw is bound here, so the CTA cannot charge — it sends the visitor back to the
          grid to pick one, which is exactly the order of operations this block explains. */}
      {detailPack && (
        <MiniDrawPackageModal
          isOpen={detailPackId === detailPack._id}
          onClose={() => setDetailPackId(null)}
          package={detailPack}
          ctaLabel="Pick a mini draw"
          onPurchase={scrollToResults}
        />
      )}
    </>
  );
}
