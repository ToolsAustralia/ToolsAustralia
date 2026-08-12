"use client";

import React from "react";
import { ChevronRight, Info, ShieldCheck, X, Zap } from "lucide-react";
import { getMiniDrawPackages, type MiniDrawPackage } from "@/data/miniDrawPackages";
import { getPartnerCatalogAccessPercentForPlanId } from "@/utils/partner-discounts/partner-catalog-visibility";
import {
  getMiniDrawPackLightScheme,
  type MiniDrawPackLightScheme,
} from "@/utils/package-colors/electricPackageScheme";
import SheetShell from "@/components/ui/SheetShell";
import { cn } from "@/utils/cn";

/**
 * The two light pack presentations shared by every mini-draw buying surface — the
 * `/mini-draws/[id]` picker, the browse-page quick-enter sheet, and the full
 * "Entry packages" catalogue sheet. They live together because all three render the
 * SAME two tiers from the SAME `getMiniDrawPackages()` list; forking the tile markup
 * per surface is how the old neon grid drifted out of step with its own modal.
 *
 * Tier colour arrives as CSS custom properties rather than plain inline styles because
 * these surfaces still render under the site's class-based dark theme, and a `dark:`
 * variant cannot read an inline `style` value. See `getMiniDrawPackLightScheme`.
 */

/** Bind a tier's light palette to the CSS vars every tile below reads. */
function tierVars(scheme: MiniDrawPackLightScheme): React.CSSProperties {
  return {
    ["--pk-accent" as string]: scheme.accent,
    ["--pk-ink" as string]: scheme.ink,
    ["--pk-ink-d" as string]: scheme.inkDark,
    ["--pk-soft" as string]: scheme.soft,
    ["--pk-soft-d" as string]: scheme.softDark,
  };
}

/** `1 free entry` / `5 free entries` — the singular case is a real pack (Mini Pack 1). */
export function packEntriesLabel(pkg: Pick<MiniDrawPackage, "entries">): string {
  return `${pkg.entries.toLocaleString()} ${pkg.entries === 1 ? "free entry" : "free entries"}`;
}

/** `1 hour` / `6 hours` / `4 days` — sub-day packs are stored as fractional days. */
export function packAccessLabel(
  pkg: Pick<MiniDrawPackage, "partnerDiscountDays" | "partnerDiscountHours">
): string {
  if (pkg.partnerDiscountDays >= 1) {
    return `${pkg.partnerDiscountDays} ${pkg.partnerDiscountDays === 1 ? "day" : "days"}`;
  }
  return `${pkg.partnerDiscountHours} ${pkg.partnerDiscountHours === 1 ? "hour" : "hours"}`;
}

export interface MiniDrawPackTiers {
  /** `mini-pack-1|2|3` — the $1 / $5 / $10 starters. */
  miniPacks: MiniDrawPackage[];
  /** `additional-{tradie,foreman,boss,power,vip}-pack-mini`. */
  bigPacks: MiniDrawPackage[];
}

/**
 * Split the active mini-draw catalogue into the two picker groups, preserving the
 * order `getMiniDrawPackages()` returns (mini 1→3, then Tradie→VIP).
 */
export function getMiniDrawPackTiers(): MiniDrawPackTiers {
  const packs = getMiniDrawPackages();
  return {
    miniPacks: packs.filter((p) => getMiniDrawPackLightScheme(p._id).group === "mini"),
    bigPacks: packs.filter((p) => getMiniDrawPackLightScheme(p._id).group === "big"),
  };
}

interface MiniPackTileProps {
  pkg: MiniDrawPackage;
  selected?: boolean;
  disabled?: boolean;
  /** `responsive` scales up from 19px → 25px at `sm:` and appends the access window. */
  size?: "compact" | "responsive";
  /** Hide the `25% partner` meta line (the quick-enter sheet shows price + entries only). */
  showMeta?: boolean;
  onClick: () => void;
}

/** Mini pack — square-ish tile in a 3-column grid. */
export function MiniPackTile({
  pkg,
  selected = false,
  disabled = false,
  size = "compact",
  showMeta = true,
  onClick,
}: MiniPackTileProps) {
  const scheme = getMiniDrawPackLightScheme(pkg._id);
  const pct = getPartnerCatalogAccessPercentForPlanId(pkg._id);
  const isResponsive = size === "responsive";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      style={tierVars(scheme)}
      className={cn(
        "flex flex-col items-center justify-center gap-[3px] rounded-2xl border-[1.5px] px-1.5 py-[13px] text-center transition-all duration-200",
        isResponsive && "sm:gap-0.5 sm:py-4",
        selected
          ? "border-[var(--pk-ink)] bg-[var(--pk-soft)] shadow-[0_8px_18px_-12px_var(--pk-ink)] dark:border-[var(--pk-ink-d)] dark:bg-[var(--pk-soft-d)]"
          : "border-[#E9EAEE] bg-white shadow-[0_3px_10px_-8px_rgba(15,23,42,.5)] hover:border-[#D8DAE0] dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <span
        className={cn(
          "text-[19px] font-extrabold leading-none tracking-[-0.02em] text-[var(--pk-ink)] dark:text-[var(--pk-ink-d)]",
          isResponsive && "sm:text-[25px] sm:tracking-[-0.03em]"
        )}
      >
        ${pkg.price}
      </span>
      <span
        className={cn(
          "text-[10.5px] font-semibold leading-[1.25] text-[#6B7280] dark:text-neutral-400",
          isResponsive && "sm:text-[13px]"
        )}
      >
        {packEntriesLabel(pkg)}
      </span>
      {showMeta && (
        <span
          className={cn(
            "text-[9.5px] font-semibold leading-[1.2] text-[#9CA3AF] dark:text-neutral-500",
            isResponsive && "sm:text-[11.5px]"
          )}
        >
          {pct}% partner
          {isResponsive && <span className="hidden sm:inline"> · {packAccessLabel(pkg)}</span>}
        </span>
      )}
    </button>
  );
}

interface BigPackRowProps {
  pkg: MiniDrawPackage;
  selected?: boolean;
  disabled?: boolean;
  /** Adds the teal partner-percentage line and the `Details` chip (catalogue + desktop). */
  detailed?: boolean;
  onClick: () => void;
}

/** Bigger pack — full-width row with the tier accent as a 3px left rule. */
export function BigPackRow({ pkg, selected = false, disabled = false, detailed = false, onClick }: BigPackRowProps) {
  const scheme = getMiniDrawPackLightScheme(pkg._id);
  const pct = getPartnerCatalogAccessPercentForPlanId(pkg._id);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      style={tierVars(scheme)}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border-[1.5px] border-l-[3px] border-l-[var(--pk-accent)] px-3.5 py-[13px] text-left transition-all duration-200",
        selected
          ? "border-[var(--pk-ink)] bg-[var(--pk-soft)] dark:border-[var(--pk-ink-d)] dark:bg-[var(--pk-soft-d)]"
          : "border-[#E9EAEE] bg-white shadow-[0_3px_10px_-8px_rgba(15,23,42,.5)] hover:border-[#D8DAE0] dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-neutral-600",
        "border-l-[var(--pk-accent)]",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <span className="text-[13.5px] font-extrabold leading-tight text-[#111827] dark:text-white">
          {pkg.displayName ?? pkg.name}
        </span>
        <span className="text-[10.5px] font-semibold leading-[1.3] text-[#6B7280] dark:text-neutral-400 sm:text-[12.5px]">
          {packEntriesLabel(pkg)} · {packAccessLabel(pkg)}
          {detailed && " access"}
        </span>
        {detailed && (
          <span className="text-[10.5px] font-semibold leading-[1.3] text-[#0E7490] dark:text-cyan-400 sm:text-[12px]">
            {pct}% of partner discounts
          </span>
        )}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-[19px] font-extrabold leading-none tracking-[-0.02em] text-[var(--pk-ink)] dark:text-[var(--pk-ink-d)]">
          ${pkg.price}
        </span>
        {detailed && (
          <span className="rounded-full bg-[var(--pk-soft)] px-2.5 py-[3px] text-[10px] font-bold text-[var(--pk-ink)] dark:bg-[var(--pk-soft-d)] dark:text-[var(--pk-ink-d)]">
            Details
          </span>
        )}
      </span>
    </button>
  );
}

/** The `Secure payment` / `Instant entry` reassurance pair, repeated on every buying surface. */
export function PackTrustRow({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-4 text-[11px] font-medium text-[#9CA3AF] dark:text-neutral-500",
        className
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <ShieldCheck className="h-[13px] w-[13px]" />
        Secure payment
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Zap className="h-[13px] w-[13px]" />
        Instant entry
      </span>
    </div>
  );
}

interface MiniDrawPacksSheetProps {
  open: boolean;
  onClose: () => void;
  /** Opens that pack's detail sheet. The parent owns the money path. */
  onPickPack: (packId: string) => void;
  selectedPackId?: string | null;
  /** Capacity guard — omitted when the sheet is opened without a draw bound. */
  isExceedsCapacity?: (entries: number) => boolean;
  isSoldOut?: boolean;
}

/**
 * The full "Entry packages" catalogue — both tiers in one scrollable sheet. Reached from
 * `ReadyToEnter` (no draw bound), the quick-enter sheet's "More entries, better value",
 * and the empty-winners "Get your entries" link.
 */
export function MiniDrawPacksSheet({
  open,
  onClose,
  onPickPack,
  selectedPackId,
  isExceedsCapacity,
  isSoldOut = false,
}: MiniDrawPacksSheetProps) {
  const { miniPacks, bigPacks } = React.useMemo(() => getMiniDrawPackTiers(), []);
  const blocked = (pkg: MiniDrawPackage) => isSoldOut || (isExceedsCapacity?.(pkg.entries) ?? false);

  return (
    <SheetShell open={open} onClose={onClose} labelledBy="mini-draw-packs-title" className="lg:!max-w-[520px]">
      <div className="flex items-start justify-between gap-3 px-4 pb-2.5 pt-3">
        <span className="flex min-w-0 flex-col">
          <span id="mini-draw-packs-title" className="font-poppins text-base font-extrabold leading-tight text-[#111827] dark:text-white">
            Entry packages
          </span>
          <span className="text-[11.5px] text-[#6B7280] dark:text-neutral-400">
            Only mini pack purchases count toward mini draws
          </span>
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close entry packages"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#EEF0F3] text-[#4B5563] transition-colors hover:bg-[#E2E4E9] dark:bg-neutral-800 dark:text-neutral-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain bg-[#F9FAFB] px-4 pb-6 pt-3 dark:bg-neutral-950">
        <div className="flex flex-col gap-2.5">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#9CA3AF] dark:text-neutral-500">
            Mini packs · from ${miniPacks[0]?.price ?? 1}
          </span>
          <div className="grid grid-cols-3 gap-2.5">
            {miniPacks.map((pkg) => (
              <MiniPackTile
                key={pkg._id}
                pkg={pkg}
                selected={selectedPackId === pkg._id}
                disabled={blocked(pkg)}
                onClick={() => onPickPack(pkg._id)}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#9CA3AF] dark:text-neutral-500">
            Bigger packs · more entries + partner access
          </span>
          <div className="flex flex-col gap-2">
            {bigPacks.map((pkg) => (
              <BigPackRow
                key={pkg._id}
                pkg={pkg}
                detailed
                selected={selectedPackId === pkg._id}
                disabled={blocked(pkg)}
                onClick={() => onPickPack(pkg._id)}
              />
            ))}
          </div>
        </div>

        <div className="flex items-start gap-2.5 rounded-2xl border border-[#EFF0F3] bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
          <Info className="mt-px h-[15px] w-[15px] shrink-0 text-[#9CA3AF]" />
          <span className="text-[11.5px] leading-[1.5] text-[#6B7280] dark:text-neutral-400">
            Every pack also unlocks a slice of the partner discount catalogue for a limited window. Free entries are
            granted the moment payment clears.
          </span>
        </div>
      </div>
    </SheetShell>
  );
}

/** Ghost row that opens the full catalogue — shared by the quick-enter sheet. */
export function MorePacksButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white text-[12.5px] font-semibold text-[#374151] transition-colors hover:bg-gray-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800",
        className
      )}
    >
      More entries, better value
      <ChevronRight className="h-3.5 w-3.5" />
    </button>
  );
}
