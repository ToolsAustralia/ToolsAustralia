"use client";

import React from "react";
import { Package } from "lucide-react";
import type { PrizeSpecItem } from "@/config/prizes";
import type { PrizeSpecificationsModalTheme } from "@/utils/prize-brand-colors";
import { cn } from "@/utils/cn";

interface SpecCardProps {
  item: PrizeSpecItem;
  surface: PrizeSpecificationsModalTheme;
  /** Brand-tinted Tailwind text-color class (e.g. "text-red-600"). Applied to
   *  the icon, "What's Included" header icon, and converted to a bg-class for
   *  bullet dots. */
  brandIconClass: string;
  isDark: boolean;
}

/** Bullet list with brand-coloured dot markers (replaces the previous
 *  Check-icon markers used in the legacy modal). */
const renderList = (
  items: string[] | undefined,
  surface: PrizeSpecificationsModalTheme,
  brandIconClass: string
) => {
  if (!items || items.length === 0) return null;
  const dotBg = brandIconClass.replace(/(^|\s|:)text-/g, "$1bg-");
  return (
    <ul className="space-y-1.5 sm:space-y-2.5">
      {items.map((item, index) => (
        <li key={index} className="flex items-start gap-2 sm:gap-3">
          <span
            aria-hidden
            className={cn(
              "mt-1.5 sm:mt-2 inline-block w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0",
              dotBg
            )}
          />
          <span
            className={cn(
              "text-2xs sm:text-sm",
              surface.bodyClass,
              "leading-snug sm:leading-relaxed font-['Inter']"
            )}
          >
            {item}
          </span>
        </li>
      ))}
    </ul>
  );
};

const SpecCard: React.FC<SpecCardProps> = ({ item, surface, brandIconClass, isDark }) => {
  return (
    <div
      className={cn(
        "group relative rounded-lg sm:rounded-xl",
        surface.cardClass,
        "p-3 sm:p-6 transition-all duration-300 hover:shadow-lg",
        surface.cardHoverClass
      )}
      style={{
        boxShadow: isDark ? "0 1px 0 rgba(255,255,255,0.04) inset" : undefined,
      }}
    >
      <div className="mb-2 sm:mb-4">
        <div className="flex items-start gap-2.5 sm:gap-3">
          <div
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl inline-flex items-center justify-center shrink-0 border bg-white dark:bg-neutral-900"
            style={{ borderColor: surface.cardAccentBorder }}
          >
            <Package className={cn("h-4 w-4 sm:h-5 sm:w-5", brandIconClass)} />
          </div>
          <div className="flex-1 min-w-0">
            <h4
              className={cn(
                "text-sm sm:text-xl font-bold",
                surface.titleClass,
                "font-['Poppins'] leading-tight tracking-tight"
              )}
            >
              {item.name}
            </h4>
            {item.model && (
              <p
                className={cn(
                  "text-2xs sm:text-sm",
                  surface.mutedClass,
                  "font-medium mt-1 sm:mt-1.5 flex items-center gap-1.5"
                )}
              >
                <span className={cn("inline-block w-1.5 h-1.5 rounded-full", surface.dotClass)} />
                Model: {item.model}
              </p>
            )}
          </div>
        </div>
      </div>

      {item.description && (
        <p
          className={cn(
            "text-2xs sm:text-sm",
            surface.bodyClass,
            "mb-3 sm:mb-5 leading-snug sm:leading-relaxed font-['Inter']"
          )}
        >
          {item.description}
        </p>
      )}

      {((item.specifications && item.specifications.length > 0) ||
        (item.includes && item.includes.length > 0)) && (
        <div className="grid gap-3 sm:gap-5 sm:grid-cols-2">
          {item.specifications && item.specifications.length > 0 && (
            <div>
              <h5
                className={cn(
                  "text-xs sm:text-base font-semibold",
                  surface.titleClass,
                  "mb-1.5 sm:mb-3 font-['Poppins'] flex items-center gap-1.5 sm:gap-2"
                )}
              >
                <span
                  className="inline-block w-0.5 sm:w-1 h-4 sm:h-5 shrink-0 rounded-full"
                  style={surface.specBarStyle}
                />
                Specifications
              </h5>
              {renderList(item.specifications, surface, brandIconClass)}
            </div>
          )}

          {item.includes && item.includes.length > 0 && (
            <div>
              <h5
                className={cn(
                  "text-xs sm:text-base font-semibold",
                  surface.titleClass,
                  "mb-1.5 sm:mb-3 font-['Poppins'] flex items-center gap-1.5 sm:gap-2"
                )}
              >
                <Package className={cn("h-3.5 w-3.5 sm:h-5 sm:w-5 shrink-0", brandIconClass)} />
                In the Box
              </h5>
              {renderList(item.includes, surface, brandIconClass)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SpecCard;
