"use client";

import React from "react";
import type { LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import type { PackageCardSurface } from "@/utils/package-colors/packageCardSurface";

interface FeaturesPreviewProps {
  plan: LocalMembershipPlan;
  /** Shared package-card chrome — same tokens the MembershipSection card renders. */
  surface: PackageCardSurface;
  accentHex: string;
}

const FeaturesPreview: React.FC<FeaturesPreviewProps> = ({ plan, surface }) => {
  return (
    <>
      {/* Entries - Centered */}
      <div className="flex items-center justify-center mb-2 sm:mb-3">
        <div className="text-center">
          {(() => {
            const entriesFeature = plan.features.find(
              (feature) => feature.text.includes("Entries") || feature.text.includes("entries")
            );
            if (entriesFeature) {
              const entriesText = entriesFeature.text;
              const entriesNumber = entriesText.match(/(\d+)/)?.[1] || "0";
              const isPromoActive = plan.metadata?.isPromoActive;
              const promoMultiplier = (plan.metadata?.promoMultiplier as number) || 1;
              const originalEntries = isPromoActive
                ? Math.floor(parseInt(entriesNumber) / promoMultiplier)
                : parseInt(entriesNumber);

              return (
                <div>
                  {isPromoActive ? (
                    <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                      <span
                        className="text-sm sm:text-base font-bold line-through"
                        style={{ color: surface.inkFaint }}
                      >
                        {originalEntries}
                      </span>
                      <span className="text-sm sm:text-base font-bold" style={{ color: surface.ink }}>
                        →
                      </span>
                      <span className="text-xl sm:text-2xl font-bold" style={surface.bigNumber}>
                        {entriesNumber}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xl sm:text-2xl font-bold" style={surface.bigNumber}>
                      {entriesNumber}
                    </span>
                  )}
                  <div className="text-xs sm:text-sm" style={{ color: surface.inkMuted }}>
                    free entries Major Giveaway
                  </div>
                </div>
              );
            }
            return null;
          })()}
        </div>
      </div>

      {/* Other features as preview (excluding entries) */}
      {plan.features
        .filter((feature) => !feature.text.includes("Entries") && !feature.text.includes("entries"))
        .slice(0, 1)
        .map((feature, index) => (
          <p key={index} className="text-xs sm:text-sm mb-0" style={{ color: surface.inkMuted }}>
            {feature.text}
          </p>
        ))}
    </>
  );
};

export default FeaturesPreview;
