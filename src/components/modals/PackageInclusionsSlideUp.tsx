"use client";

import React from "react";
import Image from "next/image";
import { LocalMembershipPlan } from "@/utils/membership/membership-adapters";

// Import package icons
import apprentice from "../../../public/images/packageIcons/apprentice.png";
import tradie from "../../../public/images/packageIcons/tradie.png";
import foreman from "../../../public/images/packageIcons/foreman.png";
import boss from "../../../public/images/packageIcons/boss.png";
import power from "../../../public/images/packageIcons/power.png";

type StaticImageData = {
  src: string;
  height: number;
  width: number;
  blurDataURL?: string;
};

interface PackageInclusionsExpandedProps {
  isExpanded: boolean;
  packages: LocalMembershipPlan[];
}

// Package icons mapping - matches MembershipSection
const PACKAGE_ICONS: Record<string, StaticImageData> = {
  // One-time packages
  "apprentice-pack": apprentice,
  "tradie-pack": tradie,
  "foreman-pack": foreman,
  "boss-pack": boss,
  "power-pack": power,

  // Additional packages
  "additional-apprentice-pack": apprentice,
  "additional-tradie-pack": tradie,
  "additional-foreman-pack": foreman,
  "additional-boss-pack": boss,
  "additional-power-pack": power,
  "additional-apprentice-pack-member": apprentice,
  "additional-tradie-pack-member": tradie,
  "additional-foreman-pack-member": foreman,
  "additional-boss-pack-member": boss,
  "additional-power-pack-member": power,

  // Subscription packages
  tradie: tradie,
  foreman: foreman,
  boss: boss,
};

/**
 * PackageInclusionsExpanded Component
 * Inline expandable component displaying full package inclusions
 * for additional packages. Adapts to light and dark backgrounds (transparent/no background).
 */
const PackageInclusionsExpanded: React.FC<PackageInclusionsExpandedProps> = ({ isExpanded, packages }) => {
  // Helper function to get package color scheme - uses colors that work on both light and dark backgrounds
  const getPackageColorScheme = (planId: string) => {
    const normalizedId = planId.toLowerCase();

    if (normalizedId.includes("apprentice")) {
      return {
        text: "text-gray-600",
        bullet: "text-gray-500",
        feature: "text-gray-700", // Works on both backgrounds with good contrast
      };
    } else if (normalizedId.includes("tradie")) {
      return {
        text: "text-blue-600",
        bullet: "text-blue-500",
        feature: "text-gray-700",
      };
    } else if (normalizedId.includes("foreman")) {
      return {
        text: "text-green-600",
        bullet: "text-green-500",
        feature: "text-gray-700",
      };
    } else if (normalizedId.includes("boss")) {
      return {
        text: "text-yellow-600",
        bullet: "text-yellow-500",
        feature: "text-gray-700",
      };
    } else if (normalizedId.includes("power")) {
      return {
        text: "text-orange-600",
        bullet: "text-orange-500",
        feature: "text-gray-700",
      };
    }
    return {
      text: "text-gray-600",
      bullet: "text-gray-500",
      feature: "text-gray-700",
    };
  };

  // Helper to get package icon - matches MembershipSection logic
  const getPackageIcon = (planId: string) => {
    // Try direct lookup first
    if (PACKAGE_ICONS[planId]) {
      return PACKAGE_ICONS[planId];
    }

    // Try with normalized ID (lowercase)
    const normalizedId = planId.toLowerCase();
    if (PACKAGE_ICONS[normalizedId]) {
      return PACKAGE_ICONS[normalizedId];
    }

    // Fallback: try to find by package type
    if (normalizedId.includes("apprentice")) {
      return PACKAGE_ICONS["additional-apprentice-pack"] || apprentice;
    }
    if (normalizedId.includes("tradie")) {
      return PACKAGE_ICONS["additional-tradie-pack"] || tradie;
    }
    if (normalizedId.includes("foreman")) {
      return PACKAGE_ICONS["additional-foreman-pack"] || foreman;
    }
    if (normalizedId.includes("boss")) {
      return PACKAGE_ICONS["additional-boss-pack"] || boss;
    }
    if (normalizedId.includes("power")) {
      return PACKAGE_ICONS["additional-power-pack"] || power;
    }

    return null;
  };

  if (!isExpanded) return null;

  return (
    <div className="w-full px-4 mt-4 mb-6" style={{ background: "transparent" }}>
      <div className="space-y-6">
        {packages.map((plan) => {
          const colorScheme = getPackageColorScheme(plan.id);
          const packageIcon = getPackageIcon(plan.id);

          return (
            <div key={plan.id} className="space-y-3">
              {/* Package Name with Icon */}
              <div className="flex items-center gap-3">
                {packageIcon && (
                  <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 relative">
                    <Image
                      src={packageIcon}
                      alt={plan.name}
                      fill
                      className="object-contain"
                      sizes="(max-width: 640px) 40px, 48px"
                    />
                  </div>
                )}
                <h3 className={`text-xl sm:text-2xl font-bold ${colorScheme.text}`}>{plan.name}</h3>
              </div>

              {/* Features List - Vertical bullet points */}
              <ul className="space-y-2.5 pl-4 sm:pl-6">
                {plan.features.map((feature, index) => (
                  <li
                    key={index}
                    className={`flex items-start gap-3 ${colorScheme.feature} text-sm sm:text-base leading-relaxed`}
                  >
                    <span className={`${colorScheme.bullet} mt-1.5 font-bold flex-shrink-0`}>-</span>
                    <span className="flex-1">{feature.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PackageInclusionsExpanded;
