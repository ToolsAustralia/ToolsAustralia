"use client";

import React, { useState } from "react";
import { Package, Info } from "lucide-react";
import { getMiniDrawPackages } from "@/data/miniDrawPackages";
import { useUserContext } from "@/contexts/UserContext";
import PaymentProcessingScreen from "@/components/loading/PaymentProcessingScreen";
import { getPartnerCatalogAccessPercentForPlanId } from "@/utils/partner-discounts/partner-catalog-visibility";
import { getMiniDrawPackageColorScheme } from "@/utils/package-colors/electricPackageScheme";
import MiniDrawPackageModal from "@/components/modals/MiniDrawPackageModal";
import LoginPromptModal from "@/components/modals/LoginPromptModal";
import { useMiniDrawPurchase } from "@/hooks/useMiniDrawPurchase";

interface MiniDrawPackagesProps {
  miniDrawId: string;
  minimumEntries?: number;
  totalEntries?: number;
  userEntryCount?: number;
}

export default function MiniDrawPackages({
  miniDrawId,
  minimumEntries,
  totalEntries,
  userEntryCount = 0,
}: MiniDrawPackagesProps) {
  const { userData, isAuthenticated } = useUserContext();

  // The money path (charge → webhook-confirmed grant → upsell) lives in the shared
  // useMiniDrawPurchase hook so this page and the dashboard Draws-tab entry sheet
  // never fork it. This component owns only the pack-grid presentation.
  const { purchase, purchasingPackageId, entriesRemaining, isSoldOut, isExceedsCapacity, paymentProcessing, loginModal } =
    useMiniDrawPurchase({ miniDrawId, minimumEntries, totalEntries });

  // Mini-draw catalog is intentionally NOT tier-gated: every visitor (signed-in or not,
  // member or not, entrant or not) sees all 8 active packs (Mini Pack 1–3 + the five
  // mini-scoped Additional packs). Login is enforced at purchase time via LoginPromptModal.
  const viewerPackages = getMiniDrawPackages();

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

  const [hoveredPackageId, setHoveredPackageId] = useState<string | null>(null);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);

  // Get selected package for modal
  const selectedPackage = selectedPackageId ? viewerPackages.find((p) => p._id === selectedPackageId) : null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-gradient-to-br from-red-600 to-red-675 flex items-center justify-center">
            <Package className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white" />
          </div>
          <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">Choose Your Pack</h3>
        </div>
        {calculatedUserEntryCount > 0 && (
          <div className="flex items-center gap-1 bg-green-50 border border-green-100 rounded-full px-2 py-0.5 sm:px-2.5 sm:py-1">
            <span className="text-2xs sm:text-xs font-bold text-green-700">
              {calculatedUserEntryCount.toLocaleString()}{" "}
              {calculatedUserEntryCount === 1 ? "free entry" : "free entries"}
            </span>
          </div>
        )}
      </div>

      {/* Remaining / Sold Out */}
      {entriesRemaining !== undefined && (
        <div
          className={`mb-3 sm:mb-4 text-center text-2xs sm:text-xs font-medium px-3 py-1.5 rounded-lg ${
            isSoldOut
              ? "bg-red-50 dark:bg-red-950/35 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/40"
              : "bg-gray-50 dark:bg-neutral-800/80 text-gray-600 dark:text-neutral-300 border border-gray-100 dark:border-neutral-700"
          }`}
        >
          {isSoldOut
            ? "Sold out — no more free entries available."
            : `Only ${entriesRemaining.toLocaleString()} free entries remaining`}
        </div>
      )}

      {/* Package Grid */}
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2.5">
        {viewerPackages.map((pkg) => {
          const disabled =
            purchasingPackageId === pkg._id || isSoldOut || isExceedsCapacity(pkg.entries);
          const isProcessing = purchasingPackageId === pkg._id;
          const partnerCatalogPct = getPartnerCatalogAccessPercentForPlanId(pkg._id);
          // Per-pack electric scheme — same function + visual language as the
          // MembershipSection one-time ElectricPackageCard (dark radial body, accent
          // glow, premium gold double-rim for VIP) so the catalog reads identically.
          const scheme = getMiniDrawPackageColorScheme(pkg._id);
          const accent = scheme.accentHex;
          const gradientText = scheme.textGradientStyle as React.CSSProperties | undefined;
          const isPremium = !!gradientText; // VIP — champagne gold gradient tier
          const dotInk = scheme.text.includes("black") ? "#0A0A0A" : "#FFFFFF";
          const tileBg = isPremium
            ? `radial-gradient(120% 95% at 50% 0%, ${accent}26 0%, transparent 58%), linear-gradient(180deg, #0b0a06 0%, #050402 100%)`
            : `radial-gradient(120% 95% at 50% 0%, ${accent}3D 0%, ${accent}14 34%, transparent 64%), linear-gradient(180deg, #0b0c0f 0%, #060607 100%)`;
          const tileBorder = isPremium ? `1px solid ${accent}` : `1.5px solid ${accent}59`;
          const tileShadow = disabled
            ? "none"
            : isPremium
              ? `0 0 0 1px #FFFCEB, 0 0 0 2px ${accent}, 0 0 12px ${accent}99, 0 8px 22px rgba(0,0,0,0.6)`
              : `0 0 0 1px ${accent}40, 0 0 16px ${accent}59, 0 0 34px ${accent}2E, 0 8px 22px rgba(0,0,0,0.5)`;
          const priceStyle: React.CSSProperties = gradientText
            ? { ...gradientText }
            : { color: "#FFFFFF", textShadow: `0 0 12px ${accent}, 0 0 24px ${accent}80` };

          return (
            <div key={pkg._id} className="relative" data-package-id={pkg._id}>
              <div className="relative">
                <button
                  onMouseEnter={() => setHoveredPackageId(pkg._id)}
                  onMouseLeave={() => {
                    if (selectedPackageId !== pkg._id) setHoveredPackageId(null);
                  }}
                  onClick={() => setSelectedPackageId(pkg._id)}
                  disabled={disabled}
                  title={`${partnerCatalogPct}% partner discounts · ${pkg.entries} free entries · $${pkg.price}`}
                  className={`
                    w-full relative overflow-hidden rounded-xl sm:rounded-2xl transition-all duration-300
                    ${disabled
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:scale-105 hover:brightness-110 active:scale-[0.97]"
                    }
                  `}
                  style={{
                    background: tileBg,
                    border: tileBorder,
                    boxShadow: tileShadow,
                  }}
                  suppressHydrationWarning
                >
                  {/* Electric inner sheen — accent wash from the top, mirrors the card */}
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background: isPremium
                        ? `linear-gradient(180deg, ${accent}2E 0%, transparent 14%), radial-gradient(120% 80% at 50% 0%, ${accent}1A 0%, transparent 55%)`
                        : `radial-gradient(135% 95% at 50% 0%, ${accent}33 0%, ${accent}0D 32%, transparent 62%)`,
                    }}
                    aria-hidden
                  />

                  <div className="relative z-10 py-2.5 sm:py-3.5 px-1 sm:px-2">
                    {isProcessing ? (
                      <div className="flex flex-col items-center justify-center gap-1 py-1">
                        <div
                          className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-2"
                          style={{ borderColor: `${accent}40`, borderTopColor: accent }}
                        />
                        <span className="text-3xs sm:text-2xs font-semibold text-white/70">
                          Processing
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-0.5 sm:gap-1">
                        {/* Price — glowing tier ink (VIP keeps its gold gradient) */}
                        <span
                          className="text-base sm:text-xl font-extrabold leading-none tracking-tight"
                          style={priceStyle}
                        >
                          ${pkg.price}
                        </span>

                        {/* Free entries */}
                        <span className="text-3xs sm:text-xs font-semibold leading-tight text-white/65">
                          {pkg.entries} {pkg.entries === 1 ? "free entry" : "free entries"}
                        </span>

                        {/* Capacity warning */}
                        {isExceedsCapacity(pkg.entries) && (
                          <span className="text-3xs sm:text-2xs font-bold text-red-400 leading-tight mt-0.5">
                            {entriesRemaining} left
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </button>

                {/* Info dot */}
                <button
                  onMouseEnter={() => setHoveredPackageId(pkg._id)}
                  onMouseLeave={() => {
                    if (selectedPackageId !== pkg._id) setHoveredPackageId(null);
                  }}
                  className="absolute -top-1 -right-1 w-4 h-4 sm:w-[18px] sm:h-[18px] rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 hover:brightness-110 z-20"
                  style={{
                    backgroundColor: accent,
                    color: dotInk,
                    boxShadow: `0 0 10px ${accent}99, 0 2px 6px rgba(0,0,0,0.5)`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPackageId(pkg._id);
                  }}
                  suppressHydrationWarning
                >
                  <Info className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
                </button>

                {/* Hover tooltip (desktop) */}
                {hoveredPackageId === pkg._id && selectedPackageId !== pkg._id && (
                  <div
                    className="hidden sm:block absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2.5 z-50 w-56 text-white text-sm rounded-2xl p-3 pointer-events-none"
                    style={{
                      background: `radial-gradient(120% 90% at 50% 0%, ${accent}26 0%, transparent 60%), linear-gradient(180deg, #0b0c0f 0%, #060607 100%)`,
                      border: isPremium ? `1px solid ${accent}` : `1.5px solid ${accent}59`,
                      boxShadow: `0 0 0 1px ${accent}33, 0 0 22px ${accent}40, 0 12px 30px rgba(0,0,0,0.6)`,
                    }}
                  >
                    <div
                      className="font-bold mb-1"
                      style={
                        gradientText
                          ? { ...gradientText }
                          : { color: accent, textShadow: `0 0 12px ${accent}80` }
                      }
                    >
                      {pkg.displayName ?? pkg.name}
                    </div>
                    <div className="text-white/65 text-xs">
                      ${pkg.price} &middot; {pkg.entries}{" "}
                      {pkg.entries === 1 ? "free entry" : "free entries"}
                    </div>
                    <div className="text-cyan-300 text-xs mt-1.5 flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-cyan-300 inline-block shrink-0" />
                      {partnerCatalogPct}% of partner discounts
                    </div>
                    {(pkg.partnerDiscountDays > 0 || pkg.partnerDiscountHours > 0) && (
                      <div className="text-green-400 text-xs mt-1.5 flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-green-400 inline-block shrink-0" />
                        {pkg.partnerDiscountDays >= 1
                          ? `${pkg.partnerDiscountDays} ${pkg.partnerDiscountDays === 1 ? "day" : "days"} partner access`
                          : `${pkg.partnerDiscountHours} ${pkg.partnerDiscountHours === 1 ? "hour" : "hours"} partner access`}
                      </div>
                    )}
                    <div
                      className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 rotate-45"
                      style={{ background: "#070708", borderRight: `1px solid ${accent}59`, borderBottom: `1px solid ${accent}59` }}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Package Details Modal */}
      {selectedPackage && (
        <MiniDrawPackageModal
          isOpen={selectedPackageId === selectedPackage._id}
          onClose={() => {
            setSelectedPackageId(null);
            setHoveredPackageId(null);
          }}
          package={selectedPackage}
          onPurchase={() => {
            setSelectedPackageId(null);
            setHoveredPackageId(null);
            purchase(selectedPackage._id);
          }}
          isPurchasing={purchasingPackageId === selectedPackage._id}
          disabled={false}
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
