"use client";

import React from "react";
import type { LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import type { getPackageColorSchemeForPromo } from "@/utils/package-colors/packageColorScheme";

type ColorScheme = ReturnType<typeof getPackageColorSchemeForPromo>;

interface FeaturesPreviewProps {
  plan: LocalMembershipPlan;
  colorScheme: ColorScheme;
  accentHex: string;
}

const FeaturesPreview: React.FC<FeaturesPreviewProps> = ({ plan, colorScheme, accentHex }) => {
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
                <div className={colorScheme.textGradientStyle ? "" : "text-white"}>
                  {isPromoActive ? (
                    <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                      <span className="text-sm sm:text-base font-bold line-through opacity-40 text-white/70">
                        {originalEntries}
                      </span>
                      <span
                        className="text-sm sm:text-base font-bold"
                        style={colorScheme.textGradientStyle ?? { color: "white" }}
                      >
                        →
                      </span>
                      <span
                        className="text-xl sm:text-2xl font-bold"
                        style={colorScheme.textGradientStyle ?? { color: accentHex }}
                      >
                        {entriesNumber}
                      </span>
                    </div>
                  ) : (
                    <span
                      className="text-xl sm:text-2xl font-bold"
                      style={colorScheme.textGradientStyle ?? { color: accentHex }}
                    >
                      {entriesNumber}
                    </span>
                  )}
                  <div
                    className="text-xs sm:text-sm"
                    style={colorScheme.textGradientStyle ? { ...colorScheme.textGradientStyle, opacity: 0.9 } : { color: accentHex }}
                  >
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
          <p key={index} className="text-xs sm:text-sm text-white/80 mb-0">
            {feature.text}
          </p>
        ))}
    </>
  );
};

export default FeaturesPreview;
