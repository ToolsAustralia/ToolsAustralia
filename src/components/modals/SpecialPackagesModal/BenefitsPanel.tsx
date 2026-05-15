"use client";

import React from "react";
import { CheckCircle, Zap, Gift } from "lucide-react";
import { type StaticMembershipPackage } from "@/data/membershipPackages";
import { getPackageDisplayName } from "@/utils/membership/getDisplayName";
import {
  getCardBorderStyle,
  type PackageColorsVariantConfig,
} from "@/utils/package-colors/packageColorScheme";
import { getElectricPackageColorScheme } from "@/utils/package-colors/electricPackageScheme";
import { getPartnerCatalogAccessPercentForPlanId } from "@/utils/partner-discounts/partner-catalog-visibility";
import { hexToRgba } from "./utils";

interface BenefitsPanelProps {
  selectedPackage: StaticMembershipPackage | null;
  variantConfig: PackageColorsVariantConfig | undefined;
}

/**
 * Side-panel listing the selected package's benefits (partner discounts,
 * partner days, free entries). Only renders when a package is selected.
 */
const BenefitsPanel: React.FC<BenefitsPanelProps> = ({ selectedPackage }) => {
  if (!selectedPackage) return null;
  const partnerCatalogPct = getPartnerCatalogAccessPercentForPlanId(selectedPackage._id || "");
  const colorScheme = getElectricPackageColorScheme(selectedPackage._id || "");
  const accentHex = colorScheme.accentHexLight ?? colorScheme.accentHex;
  // Use solid accent color - gradient styles (packageInclusionTextStyle/textGradientStyle) can make text invisible on dark card backgrounds
  const benefitsTextStyle = { color: accentHex };
  const darkBg = `linear-gradient(180deg, #0b0c0f 0%, #060607 100%)`;
  return (
    <div
      className="rounded-2xl p-3 sm:p-4 my-3 sm:my-4"
      style={{
        ...getCardBorderStyle(colorScheme, darkBg),
        ...(!colorScheme.cardBorderGradient && { background: darkBg }),
        boxShadow: `0 0 18px ${hexToRgba(accentHex, 0.4)}, 0 4px 20px rgba(0,0,0,0.45)`,
      }}
    >
      <h4 className="text-xs sm:text-sm font-bold mb-2 sm:mb-3" style={benefitsTextStyle}>
        {getPackageDisplayName(selectedPackage)} Benefits
      </h4>
      <div className="space-y-2 sm:space-y-2.5">
        <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm" style={benefitsTextStyle}>
          <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" style={benefitsTextStyle} />
          <span>{partnerCatalogPct}% of Partner Discounts Available</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm" style={benefitsTextStyle}>
          <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" style={benefitsTextStyle} />
          <span>{selectedPackage.partnerDiscountDays || 0} Days Partner Discounts</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm" style={benefitsTextStyle}>
          <Gift className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" style={benefitsTextStyle} />
          <span>{selectedPackage.totalEntries || 0} free entries</span>
        </div>
      </div>
    </div>
  );
};

export default BenefitsPanel;
