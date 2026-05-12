"use client";

import React from "react";
import type { PrizeSpecSection } from "@/config/prizes";
import type {
  PrizeBrandColors,
  PrizeSpecificationsModalTheme,
} from "@/utils/prize-brand-colors";
import { cn } from "@/utils/cn";

interface TabBarProps {
  sections: PrizeSpecSection[];
  activeId: string | null;
  onSelect: (id: string) => void;
  brandColors: PrizeBrandColors | null;
  surface: PrizeSpecificationsModalTheme;
}

const TabBar: React.FC<TabBarProps> = ({ sections, activeId, onSelect, brandColors, surface }) => {
  return (
    <div className="mb-3 sm:mb-7 -mx-0.5 sm:-mx-2 px-0.5 sm:px-2 overflow-x-auto scrollbar-hide border-b border-neutral-200 dark:border-neutral-800">
      <div className="flex gap-1.5 sm:gap-3 min-w-max pb-3 sm:pb-3.5">
        {sections.map((section) => {
          const isActive = section.id === activeId;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelect(section.id)}
              className={cn(
                "relative px-3 sm:px-5 py-1.5 sm:py-2.5 rounded-full font-semibold text-2xs sm:text-sm",
                "transition-all duration-300 border-2 whitespace-nowrap",
                isActive
                  ? brandColors
                    ? `bg-gradient-to-br ${brandColors.gradient} ${brandColors.textColor} ${brandColors.borderColor} shadow-md sm:shadow-lg ${brandColors.shadowColor} sm:scale-105`
                    : "bg-gradient-to-br from-red-600 via-red-700 to-red-800 text-white border-red-500 shadow-md sm:shadow-lg shadow-red-500/40 sm:scale-105"
                  : cn(surface.tabInactiveTextClass, surface.tabInactiveHoverClass)
              )}
              style={isActive ? undefined : surface.tabInactiveStyle}
            >
              <span className="flex items-center gap-1.5 sm:gap-2">
                {section.label}
                {section.items.length > 0 && (
                  <span
                    className={cn(
                      "inline-flex items-center justify-center min-w-[18px] sm:min-w-[20px] h-4 sm:h-5 px-1 sm:px-1.5 rounded-full text-3xs sm:text-2xs font-bold",
                      isActive ? "bg-white/20 text-white" : surface.tabBadgeInactiveClass
                    )}
                  >
                    {section.items.length}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TabBar;
