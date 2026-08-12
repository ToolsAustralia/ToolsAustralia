"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Package, Ticket } from "lucide-react";
import { getMiniDrawPackages } from "@/data/miniDrawPackages";
import { useUserContext } from "@/contexts/UserContext";
import PaymentProcessingScreen from "@/components/loading/PaymentProcessingScreen";
import MiniDrawPackageModal from "@/components/modals/MiniDrawPackageModal";
import LoginPromptModal from "@/components/modals/LoginPromptModal";
import { useMiniDrawPurchase } from "@/hooks/useMiniDrawPurchase";
import {
  BigPackRow,
  MiniPackTile,
  MiniDrawPacksSheet,
  PackTrustRow,
  getMiniDrawPackTiers,
  packEntriesLabel,
} from "@/components/features/MiniDrawPackTiles";
import { cn } from "@/utils/cn";

/**
 * Fired by any surface that wants the full "Entry packages" catalogue without holding a
 * reference to this component — today the empty-winners state in `MiniDrawTabs`. Same
 * decoupling pattern as `useOpenMembershipModalListener`.
 */
export const OPEN_MINI_DRAW_PACKS_EVENT = "mini-draw:open-packs";

interface MiniDrawPackagesProps {
  miniDrawId: string;
  minimumEntries?: number;
  totalEntries?: number;
  userEntryCount?: number;
  /** Shown in the pack sheet's "Entries go to" row so the buyer sees where they land. */
  drawName?: string;
  /**
   * Mounts the mobile sticky "Enter draw" bar. Only the `/mini-draws/[id]` page passes
   * this — the dashboard Draws-tab sheet is already a bottom-anchored surface of its own.
   */
  showStickyBar?: boolean;
}

export default function MiniDrawPackages({
  miniDrawId,
  minimumEntries,
  totalEntries,
  userEntryCount = 0,
  drawName,
  showStickyBar = false,
}: MiniDrawPackagesProps) {
  const { userData, isAuthenticated } = useUserContext();

  // The money path (charge → webhook-confirmed grant → upsell) lives in the shared
  // useMiniDrawPurchase hook so this page and the dashboard Draws-tab entry sheet
  // never fork it. This component owns only the pack-picker presentation.
  const { purchase, purchasingPackageId, entriesRemaining, isSoldOut, isExceedsCapacity, paymentProcessing, loginModal } =
    useMiniDrawPurchase({ miniDrawId, minimumEntries, totalEntries });

  // Mini-draw catalog is intentionally NOT tier-gated: every visitor (signed-in or not,
  // member or not, entrant or not) sees all 8 active packs (Mini Pack 1–3 + the five
  // mini-scoped Additional packs). Login is enforced at purchase time via LoginPromptModal.
  const { miniPacks, bigPacks } = useMemo(() => getMiniDrawPackTiers(), []);
  const allPacks = useMemo(() => getMiniDrawPackages(), []);

  /**
   * Calculate user's entry count for this specific minidraw
   * Uses miniDrawParticipation as the single source of truth (includes packages + upsells)
   * Falls back to old calculation for backward compatibility
   * Same calculation as ProductCard badge
   */
  const calculateUserEntryCount = (): number => {
    if (!isAuthenticated || !userData) return userEntryCount || 0;

    // Mini draw eligibility is package-only: only purchased mini pack entries count (no member entries).
    const currentMiniDrawId = miniDrawId;

    // Type assertion to access miniDrawParticipation (may not be in UserData type)
    const userWithParticipation = userData as unknown as {
      miniDrawParticipation?: Array<{
        miniDrawId: string | { toString(): string } | { _id: string | { toString(): string } };
        totalEntries: number;
        isActive?: boolean;
      }>;
    };

    // Try to find participation entry for this specific minidraw (single source of truth)
    const participationEntry = userWithParticipation?.miniDrawParticipation?.find((p) => {
      // Handle different ID formats (string, ObjectId, etc.)
      const pkgMiniDrawId = p.miniDrawId;
      if (typeof pkgMiniDrawId === "string") {
        return pkgMiniDrawId === currentMiniDrawId;
      }
      if (pkgMiniDrawId && typeof pkgMiniDrawId === "object") {
        // Check if it has toString method (ObjectId-like)
        if ("toString" in pkgMiniDrawId && typeof pkgMiniDrawId.toString === "function") {
          return pkgMiniDrawId.toString() === currentMiniDrawId;
        }
        // Check if it has _id property
        if ("_id" in pkgMiniDrawId) {
          const idValue = (pkgMiniDrawId as { _id: unknown })._id;
          if (typeof idValue === "string") {
            return idValue === currentMiniDrawId;
          }
          if (idValue && typeof idValue === "object" && "toString" in idValue) {
            return (idValue as { toString: () => string }).toString() === currentMiniDrawId;
          }
        }
      }
      return false;
    });

    // If participation entry exists, use it (packages + upsells only; no member entries)
    if (participationEntry && participationEntry.totalEntries > 0) {
      return participationEntry.totalEntries;
    }

    // Fallback: sum active minidraw package entries for this specific minidraw only
    const userMiniDrawPackages = (
      userData as {
        miniDrawPackages?: Array<{
          isActive: boolean;
          miniDrawId?: string | { toString(): string };
          entriesGranted?: number;
        }>;
      }
    ).miniDrawPackages;
    const activeMiniDrawPackageEntries =
      userMiniDrawPackages?.reduce((sum, pkg) => {
        if (!pkg.isActive) return sum;

        const pkgMiniDrawId = pkg.miniDrawId
          ? typeof pkg.miniDrawId === "string"
            ? pkg.miniDrawId
            : pkg.miniDrawId.toString()
          : null;

        if (pkgMiniDrawId && pkgMiniDrawId === currentMiniDrawId) {
          return sum + (pkg.entriesGranted || 0);
        }

        return sum;
      }, 0) || 0;

    return activeMiniDrawPackageEntries;
  };

  const calculatedUserEntryCount = calculateUserEntryCount();

  const [packTab, setPackTab] = useState<"mini" | "big">("mini");
  /** Drives the sticky bar's price / entries line. */
  const [selectedPackId, setSelectedPackId] = useState<string>(miniPacks[0]?._id ?? allPacks[0]?._id ?? "mini-pack-1");
  /** Which pack's detail sheet is open, if any. */
  const [detailPackId, setDetailPackId] = useState<string | null>(null);
  const [packsSheetOpen, setPacksSheetOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Empty-winners "Get your entries" (and any future sibling) opens the catalogue.
  useEffect(() => {
    const open = () => setPacksSheetOpen(true);
    window.addEventListener(OPEN_MINI_DRAW_PACKS_EVENT, open);
    return () => window.removeEventListener(OPEN_MINI_DRAW_PACKS_EVENT, open);
  }, []);

  const selectedPack = allPacks.find((p) => p._id === selectedPackId) ?? allPacks[0];
  const detailPack = detailPackId ? allPacks.find((p) => p._id === detailPackId) : null;

  /** Tapping a pack selects it AND opens its detail — the old "What's included?" button is gone. */
  const pickPack = (packId: string) => {
    setSelectedPackId(packId);
    setDetailPackId(packId);
  };

  const isBlocked = (entries: number) => isSoldOut || isExceedsCapacity(entries);

  const segButton = (tab: "mini" | "big", label: string) => (
    <button
      key={tab}
      type="button"
      onClick={() => setPackTab(tab)}
      aria-pressed={packTab === tab}
      className={cn(
        "h-[34px] rounded-[10px] px-4 text-[12.5px] font-bold transition-all duration-150",
        packTab === tab
          ? "bg-[#111827] text-white shadow-[0_4px_10px_-6px_rgba(15,23,42,.9)] dark:bg-white dark:text-neutral-900"
          : "bg-transparent text-[#6B7280] dark:text-neutral-400"
      )}
    >
      {label}
    </button>
  );

  const miniGrid = (
    <div className="grid grid-cols-3 gap-[9px] lg:gap-3">
      {miniPacks.map((pkg) => (
        <MiniPackTile
          key={pkg._id}
          pkg={pkg}
          size="responsive"
          selected={selectedPackId === pkg._id}
          disabled={isBlocked(pkg.entries)}
          onClick={() => pickPack(pkg._id)}
        />
      ))}
    </div>
  );

  const bigList = (detailed: boolean) => (
    <div className="flex flex-col gap-2">
      {bigPacks.map((pkg) => (
        <BigPackRow
          key={pkg._id}
          pkg={pkg}
          detailed={detailed}
          selected={selectedPackId === pkg._id}
          disabled={isBlocked(pkg.entries)}
          onClick={() => pickPack(pkg._id)}
        />
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-3 lg:gap-4">
      {/* Header — icon tile, title, capacity pill */}
      <div className="flex items-center gap-2.5 lg:gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-gradient-to-br from-red-600 to-red-675 text-white lg:h-9 lg:w-9 lg:rounded-[11px]">
          <Package className="h-[15px] w-[15px] lg:h-[19px] lg:w-[19px]" />
        </span>
        <h3 className="text-[15px] font-extrabold text-[#111827] dark:text-white lg:text-[19px]">Choose your pack</h3>
        {entriesRemaining !== undefined && !isSoldOut && (
          <span className="ml-auto shrink-0 rounded-full border border-[#FFEDD5] bg-[#FFF7ED] px-2.5 py-1 text-[10.5px] font-bold text-[#C2410C] dark:border-orange-900/40 dark:bg-orange-950/40 dark:text-orange-300 lg:px-3 lg:py-1.5 lg:text-[12.5px]">
            <span className="lg:hidden">{entriesRemaining.toLocaleString()} left</span>
            <span className="hidden lg:inline">Only {entriesRemaining.toLocaleString()} free entries remaining</span>
          </span>
        )}
      </div>

      {/* The buyer's own entries in this draw */}
      {calculatedUserEntryCount > 0 && (
        <div className="flex items-center gap-2.5 rounded-[13px] border border-green-100 bg-green-50/80 px-3 py-2.5 dark:border-green-900/40 dark:bg-green-950/35">
          <Ticket className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
          <span className="text-[12px] font-medium text-green-700 dark:text-green-300">
            You have <span className="font-bold">{calculatedUserEntryCount.toLocaleString()}</span>{" "}
            {calculatedUserEntryCount === 1 ? "free entry" : "free entries"} in this draw
          </span>
        </div>
      )}

      {/* Mobile — segmented control, one tier at a time */}
      <div className="lg:hidden">
        <div className="inline-flex rounded-xl bg-[#F1F2F5] p-[3px] dark:bg-neutral-800">
          {segButton("mini", "Mini packs")}
          {segButton("big", "Bigger packs")}
        </div>
      </div>
      <div className="lg:hidden">{packTab === "mini" ? miniGrid : bigList(false)}</div>

      {/* Desktop — both tiers stacked under uppercase labels */}
      <div className="hidden flex-col gap-2.5 lg:flex">
        <span className="text-[11.5px] font-extrabold uppercase tracking-[0.1em] text-[#9CA3AF] dark:text-neutral-500">
          Mini packs
        </span>
        {miniGrid}
      </div>
      <div className="hidden flex-col gap-2.5 lg:flex">
        <span className="text-[11.5px] font-extrabold uppercase tracking-[0.1em] text-[#9CA3AF] dark:text-neutral-500">
          Bigger packs · more entries + partner access
        </span>
        {bigList(true)}
      </div>

      <PackTrustRow className="hidden border-t border-[#F1F2F5] pt-4 dark:border-neutral-800 lg:flex" />

      {/* Mobile sticky buy bar — portaled so a transformed ancestor can never break `fixed`.
          `data-floating-widget` is the opt-in that makes the Cobber launcher lift above it
          (see useDodgeFloatingObstacles). */}
      {showStickyBar && mounted && selectedPack && !isSoldOut &&
        createPortal(
          <div
            data-floating-widget
            className="fixed inset-x-0 bottom-0 z-[60] flex items-center justify-between gap-4 border-t border-[#EDEFF2] bg-white/[.97] px-3.5 pt-2.5 shadow-[0_-10px_26px_-18px_rgba(15,23,42,.6)] backdrop-blur-md lg:hidden dark:border-neutral-800 dark:bg-neutral-900/95"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
          >
            <div className="flex min-w-0 flex-col">
              <span className="text-[16px] font-extrabold leading-[1.1] text-[#111827] dark:text-white">
                ${selectedPack.price}
              </span>
              <span className="whitespace-nowrap text-[10.5px] font-semibold text-[#6B7280] dark:text-neutral-400">
                {packEntriesLabel(selectedPack)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setDetailPackId(selectedPack._id)}
              className="flex h-[50px] flex-[0_1_auto] items-center justify-center gap-2 rounded-[14px] bg-gradient-to-r from-red-600 to-red-675 px-6 text-[14px] font-extrabold tracking-[0.01em] text-white shadow-[0_14px_26px_-12px_rgba(238,0,0,.85)]"
            >
              <Ticket className="h-4 w-4" />
              Enter draw
            </button>
          </div>,
          document.body
        )}

      {/* Full catalogue */}
      <MiniDrawPacksSheet
        open={packsSheetOpen}
        onClose={() => setPacksSheetOpen(false)}
        selectedPackId={selectedPackId}
        isExceedsCapacity={isExceedsCapacity}
        isSoldOut={isSoldOut}
        onPickPack={(id) => {
          setPacksSheetOpen(false);
          pickPack(id);
        }}
      />

      {/* Pack detail */}
      {detailPack && (
        <MiniDrawPackageModal
          isOpen={detailPackId === detailPack._id}
          onClose={() => setDetailPackId(null)}
          package={detailPack}
          drawName={drawName}
          onPurchase={() => {
            setDetailPackId(null);
            purchase(detailPack._id);
          }}
          isPurchasing={purchasingPackageId === detailPack._id}
          disabled={isBlocked(detailPack.entries)}
        />
      )}

      {/* Payment Processing Screen */}
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

      {/* Login Prompt Modal */}
      <LoginPromptModal isOpen={loginModal.open} onClose={() => loginModal.setOpen(false)} />
    </div>
  );
}
