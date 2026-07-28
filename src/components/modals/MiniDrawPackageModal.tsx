"use client";

import React from "react";
import { X } from "lucide-react";
import type { MiniDrawPackage } from "@/data/miniDrawPackages";
import ModalContainer from "@/components/modals/ui/ModalContainer";
import { getPartnerCatalogAccessPercentForPlanId } from "@/utils/partner-discounts/partner-catalog-visibility";
import { getMiniDrawPackageColorScheme } from "@/utils/package-colors/electricPackageScheme";

interface MiniDrawPackageModalProps {
  isOpen: boolean;
  onClose: () => void;
  package: MiniDrawPackage;
  onPurchase: () => void;
  isPurchasing?: boolean;
  disabled?: boolean;
}

const MiniDrawPackageModal: React.FC<MiniDrawPackageModalProps> = ({
  isOpen,
  onClose,
  package: pkg,
  onPurchase,
  isPurchasing = false,
  disabled = false,
}) => {
  const partnerCatalogPct = getPartnerCatalogAccessPercentForPlanId(pkg._id);
  // Same scheme + electric visual language as the MembershipSection ElectricPackageCard,
  // derived from the pack id so this modal stays in lockstep without prop threading
  // (keeps the dev gallery working).
  const scheme = getMiniDrawPackageColorScheme(pkg._id);
  const accent = scheme.accentHex;
  const gradientText = scheme.textGradientStyle as React.CSSProperties | undefined;
  const isPremium = !!gradientText; // VIP — champagne gold gradient tier

  const titleStyle: React.CSSProperties = gradientText
    ? { ...gradientText, filter: `drop-shadow(0 0 4px ${accent}) drop-shadow(0 0 9px ${accent}80)` }
    : { color: accent, textShadow: `0 0 14px ${accent}80` };
  const bigNumberStyle: React.CSSProperties = gradientText
    ? { ...gradientText }
    : { color: "#FFFFFF", textShadow: `0 0 18px ${accent}, 0 0 36px ${accent}80` };

  const bodyBg = isPremium
    ? `radial-gradient(120% 80% at 50% 0%, ${accent}30 0%, transparent 55%), linear-gradient(180deg, #0b0a06 0%, #050402 100%)`
    : `radial-gradient(120% 85% at 50% 0%, ${accent}33 0%, ${accent}12 32%, transparent 62%), linear-gradient(180deg, #0b0c0f 0%, #060607 100%)`;
  const bodyShadow = isPremium
    ? `0 0 0 1px #FFFCEB, 0 0 0 3px ${accent}, 0 0 14px ${accent}B3, 0 14px 40px rgba(0,0,0,0.6)`
    : `0 0 0 1px ${accent}40, 0 0 30px ${accent}66, 0 0 70px ${accent}33, 0 16px 48px rgba(0,0,0,0.55)`;

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      height="auto"
      className="!max-w-[360px] sm:!max-w-sm !bg-transparent !border-0 !shadow-none !overflow-visible"
    >
      <div
        className="relative isolate flex max-h-[min(85vh,calc(100vh-3rem))] min-h-[280px] flex-col rounded-3xl p-5 sm:p-6 text-sm sm:text-base"
        style={{
          background: bodyBg,
          border: isPremium ? `1px solid ${accent}` : `2px solid ${accent}59`,
          boxShadow: bodyShadow,
        }}
      >
        {/* Electric inner sheen */}
        <div
          className="pointer-events-none absolute inset-0.5 rounded-[22px] z-0"
          style={{
            background: isPremium
              ? `linear-gradient(180deg, ${accent}33 0%, transparent 12%), radial-gradient(120% 70% at 50% 0%, ${accent}1A 0%, transparent 52%)`
              : `radial-gradient(135% 90% at 50% 0%, ${accent}26 0%, ${accent}0D 30%, transparent 60%)`,
          }}
          aria-hidden
        />

        <div className="relative z-10 flex min-h-0 flex-col">
          <div className="flex shrink-0 items-start justify-between gap-3">
            <div
              className="min-w-0 flex-1 font-extrabold uppercase tracking-wide text-lg sm:text-xl break-words pr-1"
              style={titleStyle}
            >
              {pkg.displayName ?? pkg.name}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/80 transition-all hover:bg-white/10 hover:text-white"
              style={{ border: `1px solid ${accent}40` }}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Hero entries number */}
          <div className="mt-4 text-center">
            <div className="text-[40px] sm:text-[46px] font-extrabold leading-none" style={bigNumberStyle}>
              {pkg.entries}
            </div>
            <div className="mt-1 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.2em] text-white/65">
              Free Entries
            </div>
          </div>

          <div className="my-4 h-px w-full rounded-full" style={{ background: `${accent}59` }} />

          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pr-0.5">
            <div className="space-y-3 sm:space-y-4">
              {pkg.description && (
                <div className="text-white/70 text-xs sm:text-sm leading-relaxed break-words">
                  {pkg.description}
                </div>
              )}

              <div className="space-y-2.5 sm:space-y-3">
                <div
                  className="flex items-center justify-between border-b py-1.5"
                  style={{ borderColor: "rgba(255,255,255,0.08)" }}
                >
                  <span className="text-white/55 text-sm sm:text-base">Partner catalogue:</span>
                  <span className="ml-2 text-right font-semibold text-cyan-300 text-sm sm:text-base">
                    {partnerCatalogPct}% of offers
                  </span>
                </div>
                {(pkg.partnerDiscountDays > 0 || pkg.partnerDiscountHours > 0) && (
                  <div
                    className="flex items-center justify-between border-b py-1.5"
                    style={{ borderColor: "rgba(255,255,255,0.08)" }}
                  >
                    <span className="text-white/55 text-sm sm:text-base">Partner access:</span>
                    <span className="ml-2 break-words text-right font-semibold text-green-400 text-sm sm:text-base">
                      {pkg.partnerDiscountDays >= 1
                        ? `${pkg.partnerDiscountDays} ${pkg.partnerDiscountDays === 1 ? "day" : "days"}`
                        : `${pkg.partnerDiscountHours} ${pkg.partnerDiscountHours === 1 ? "hour" : "hours"}`}
                    </span>
                  </div>
                )}
                <div
                  className="flex items-center justify-between border-b py-1.5"
                  style={{ borderColor: "rgba(255,255,255,0.08)" }}
                >
                  <span className="text-white/55 text-sm sm:text-base">Price:</span>
                  <span className="font-bold text-base sm:text-lg" style={{ color: accent }}>
                    ${pkg.price}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={onPurchase}
                disabled={isPurchasing || disabled}
                style={{
                  backgroundColor: "#000000",
                  border: `1.5px solid ${accent}`,
                  color: accent,
                  boxShadow: `0 0 18px ${accent}40, inset 0 0 12px ${accent}1F`,
                  // Disable the breathing scale/glow keyframe; the ::after shimmer
                  // sweep animates on the pseudo-element and is unaffected.
                  animation: "none",
                }}
                className="ta-enter-cta mt-4 w-full py-3 px-4 rounded-2xl font-black uppercase tracking-wide text-sm sm:text-base transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPurchasing ? (
                  <span className="flex items-center justify-center gap-2">
                    <span
                      className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
                      style={{ borderColor: accent, borderTopColor: "transparent" }}
                    />
                    <span>Processing...</span>
                  </span>
                ) : (
                  <span>Purchase Now</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalContainer>
  );
};

export default MiniDrawPackageModal;
