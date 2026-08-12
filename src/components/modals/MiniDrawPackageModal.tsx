"use client";

import React from "react";
import { Ticket, X } from "lucide-react";
import type { MiniDrawPackage } from "@/data/miniDrawPackages";
import SheetShell from "@/components/ui/SheetShell";
import { getPartnerCatalogAccessPercentForPlanId } from "@/utils/partner-discounts/partner-catalog-visibility";
import { getMiniDrawPackLightScheme } from "@/utils/package-colors/electricPackageScheme";
import { PackTrustRow, packAccessLabel } from "@/components/features/MiniDrawPackTiles";

interface MiniDrawPackageModalProps {
  isOpen: boolean;
  onClose: () => void;
  package: MiniDrawPackage;
  onPurchase: () => void;
  isPurchasing?: boolean;
  disabled?: boolean;
  /**
   * The draw these free entries land on. Omitted when the sheet is opened from a surface
   * with no draw bound (the browse page's `ReadyToEnter`), which renders the generic
   * "Any active mini draw you pick" instead.
   */
  drawName?: string;
  /** Override the CTA copy — used when there is no draw to purchase into yet. */
  ctaLabel?: string;
}

/** The allocation row is a single nowrap line; anything longer gets an ellipsis. */
const DRAW_NAME_MAX = 38;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * Pack detail — bottom sheet on mobile, centred modal on desktop (via `SheetShell`).
 *
 * Light surface with a per-tier ink/soft ramp (`getMiniDrawPackLightScheme`). The old
 * neon-on-black treatment came from the dark `ElectricPackageCard` language, which is
 * still correct on the membership surfaces but was unreadable sitting inside the white
 * mini-draw page.
 */
const MiniDrawPackageModal: React.FC<MiniDrawPackageModalProps> = ({
  isOpen,
  onClose,
  package: pkg,
  onPurchase,
  isPurchasing = false,
  disabled = false,
  drawName,
  ctaLabel = "Purchase now",
}) => {
  const partnerCatalogPct = getPartnerCatalogAccessPercentForPlanId(pkg._id);
  const scheme = getMiniDrawPackLightScheme(pkg._id);
  const hasPartnerAccess = pkg.partnerDiscountDays > 0 || pkg.partnerDiscountHours > 0;

  const tierVars = {
    ["--pk-accent" as string]: scheme.accent,
    ["--pk-ink" as string]: scheme.ink,
    ["--pk-ink-d" as string]: scheme.inkDark,
    ["--pk-soft" as string]: scheme.soft,
    ["--pk-soft-d" as string]: scheme.softDark,
  } as React.CSSProperties;

  return (
    <SheetShell open={isOpen} onClose={onClose} labelledBy="mini-draw-pack-title" className="lg:!max-w-[440px]">
      <div style={tierVars} className="flex min-h-0 flex-col overflow-y-auto overscroll-contain">
        {/* 1 — title + tier chip */}
        <div className="flex items-start justify-between gap-2.5 px-[18px] pt-3">
          <span className="flex min-w-0 flex-col">
            <span
              id="mini-draw-pack-title"
              className="font-poppins text-[17px] font-extrabold leading-[1.25] tracking-[-0.005em] text-[#111827] dark:text-white"
            >
              {pkg.displayName ?? pkg.name}
            </span>
            <span className="mt-1.5 inline-flex w-fit items-center gap-1.5 rounded-full bg-[var(--pk-soft)] px-2.5 py-1 text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--pk-ink)] dark:bg-[var(--pk-soft-d)] dark:text-[var(--pk-ink-d)]">
              <span className="h-[7px] w-[7px] rounded-full bg-[var(--pk-accent)]" />
              {scheme.group === "mini" ? "Mini pack" : "Bigger pack"}
            </span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#F1F2F5] text-[#4B5563] transition-colors hover:bg-[#E2E4E9] dark:bg-neutral-800 dark:text-neutral-300"
          >
            <X className="h-[15px] w-[15px]" />
          </button>
        </div>

        {/* 2 — entries hero */}
        <div className="px-[18px] pb-0.5 pt-3.5 text-center">
          <div className="text-[46px] font-extrabold leading-none tracking-[-0.03em] text-[var(--pk-ink)] dark:text-[var(--pk-ink-d)]">
            {pkg.entries.toLocaleString()}
          </div>
          <div className="mt-1.5 text-[10.5px] font-bold uppercase tracking-[0.2em] text-[#9CA3AF] dark:text-neutral-500">
            Free entries
          </div>
        </div>

        {/* 3 — rule */}
        <div className="mx-[18px] my-4 h-px rounded-full bg-[#F1F2F5] dark:bg-neutral-800" />

        {/* 4 — where the free entries land */}
        <div className="px-[18px] pb-3">
          <div className="flex items-center gap-2.5 rounded-[13px] border border-[var(--pk-soft)] bg-[var(--pk-soft)] px-3 py-2.5 text-[var(--pk-ink)] dark:border-transparent dark:bg-[var(--pk-soft-d)] dark:text-[var(--pk-ink-d)]">
            <Ticket className="h-3.5 w-3.5 shrink-0" />
            <span className="flex min-w-0 flex-col">
              <span className="text-[9.5px] font-extrabold uppercase tracking-[0.09em] opacity-65">Entries go to</span>
              <span className="truncate whitespace-nowrap text-[12px] font-bold leading-[1.3]">
                {drawName ? truncate(drawName, DRAW_NAME_MAX) : "Any active mini draw you pick"}
              </span>
            </span>
          </div>
        </div>

        {/* 5 — description */}
        {pkg.description && (
          <div className="px-[18px] pb-1 text-[12px] leading-[1.55] text-[#4B5563] text-pretty dark:text-neutral-400">
            {pkg.description}
          </div>
        )}

        {/* 6 — spec rows */}
        <div className="flex flex-col px-[18px] pt-3">
          <div className="flex items-center justify-between border-b border-[#F1F2F5] py-2.5 dark:border-neutral-800">
            <span className="text-[12.5px] text-[#6B7280] dark:text-neutral-400">Partner discounts</span>
            <span className="text-[12.5px] font-bold text-[#0E7490] dark:text-cyan-400">
              {partnerCatalogPct}% of offers
            </span>
          </div>
          {hasPartnerAccess && (
            <div className="flex items-center justify-between border-b border-[#F1F2F5] py-2.5 dark:border-neutral-800">
              <span className="text-[12.5px] text-[#6B7280] dark:text-neutral-400">Partner access</span>
              <span className="text-[12.5px] font-bold text-[#16A34A] dark:text-green-400">
                {packAccessLabel(pkg)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between py-2.5">
            <span className="text-[12.5px] text-[#6B7280] dark:text-neutral-400">Price</span>
            <span className="text-[16px] font-extrabold text-[#111827] dark:text-white">${pkg.price}</span>
          </div>
        </div>

        {/* 7 + 8 — CTA and trust row */}
        <div className="px-[18px] pb-7 pt-3">
          <button
            type="button"
            onClick={onPurchase}
            disabled={isPurchasing || disabled}
            className="flex h-[52px] w-full items-center justify-center rounded-[14px] bg-[var(--pk-ink)] text-[14px] font-extrabold tracking-[0.01em] text-white shadow-[0_12px_24px_-14px_var(--pk-ink)] transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[var(--pk-ink-d)] dark:text-neutral-950"
          >
            {isPurchasing ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                <span>Processing…</span>
              </span>
            ) : (
              ctaLabel
            )}
          </button>
          <PackTrustRow className="pt-3" />
        </div>
      </div>
    </SheetShell>
  );
};

export default MiniDrawPackageModal;
