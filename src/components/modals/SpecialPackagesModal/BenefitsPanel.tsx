"use client";

import React from "react";
import { CheckCircle, Zap, Gift } from "lucide-react";
import { type StaticMembershipPackage } from "@/data/membershipPackages";
import { getPackageDisplayName } from "@/utils/membership/getDisplayName";
import {
  getPackageColorSchemeForPromo,
  getCardBorderStyle,
  type PackageColorsVariantConfig,
} from "@/utils/package-colors/packageColorScheme";
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
const BenefitsPanel: React.FC<BenefitsPanelProps> = ({ selectedPackage, variantConfig }) => {
  if (!selectedPackage) return null;
  const partnerCatalogPct = getPartnerCatalogAccessPercentForPlanId(selectedPackage._id || "");
  const colorScheme = getPackageColorSchemeForPromo(selectedPackage._id || "", false, variantConfig);
  const accentHex = colorScheme.accentHexLight ?? colorScheme.accentHex;
  // Use solid accent color - gradient styles (packageInclusionTextStyle/textGradientStyle) can make text invisible on dark card backgrounds
  const benefitsTextStyle = { color: accentHex };
  return (
    <div
      className="rounded-2xl p-3 sm:p-4 my-3 sm:my-4"
      style={{
        ...getCardBorderStyle(colorScheme, "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)"),
        ...(!colorScheme.cardBorderGradient && { background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)" }),
        boxShadow: `0 0 15px ${hexToRgba(accentHex, 0.25)}, 0 4px 20px rgba(0,0,0,0.2)`,
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
          <span>{selectedPackage.totalEntries || 0} Free Entries</span>
        </div>
      </div>
    </div>
  );
};

export default BenefitsPanel;
