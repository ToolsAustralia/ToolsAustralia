"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Package } from "lucide-react";

import ModalContainer from "./ui/ModalContainer";
import ModalHeader from "./ui/ModalHeader";
import ModalContent from "./ui/ModalContent";
import ModalFooter from "./ui/ModalFooter";
import type { PrizeCatalogEntry, PrizeSpecItem, PrizeSpecSection } from "@/config/prizes";
import {
  getPrizeBrandColors,
  getPrizeSpecificationsModalHeaderSolidFill,
  getPrizeSpecificationsModalTheme,
} from "@/utils/prize-brand-colors";
import { useThemeStore } from "@/stores/useThemeStore";

interface PrizeSpecificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  prize?: PrizeCatalogEntry | null;
}

const PrizeSpecificationsModal = ({ isOpen, onClose, prize }: PrizeSpecificationsModalProps) => {
  const isDark = useThemeStore((s) => s.theme === "dark");
  const surface = useMemo(
    () => getPrizeSpecificationsModalTheme(prize?.slug, isDark),
    [prize?.slug, isDark]
  );

  // Memoise sections so we don't recreate arrays on every render.
  const sections = useMemo<PrizeSpecSection[]>(() => {
    if (!prize) return [];
    const baseSections = prize.specSections ?? [];

    // Add "5000 Cash" tab for all non-cash-prize entries
    if (prize.slug !== "cash-prize") {
      return [
        ...baseSections,
        {
          id: "cash-prize",
          label: "$5000 Cash",
          summary: "Cash prize details and payment information.",
          items: [
            {
              name: "$5,000 Cash Prize",
              description:
                "A $5,000 cash prize included with your prize package. The money will be deposited directly to your bank account upon verification.",
              specifications: [
                "Prize Amount: $5,000 AUD",
                "Payment Method: Direct bank transfer",
                "Verification: Standard winner verification process required",
                "Tax: Winner responsible for applicable taxes",
                "Included with prize package",
                "Cash prize is in addition to all tools and equipment",
              ],
            },
          ],
        },
      ];
    }

    return baseSections;
  }, [prize]);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  const brandColors = useMemo(() => {
    if (!prize?.slug) return null;
    return getPrizeBrandColors(prize.slug, isDark);
  }, [prize?.slug, isDark]);

  const headerSolidFill = useMemo(() => getPrizeSpecificationsModalHeaderSolidFill(prize?.slug), [prize?.slug]);

  useEffect(() => {
    if (sections.length > 0) {
      setActiveSectionId(sections[0].id);
    } else {
      setActiveSectionId(null);
    }
  }, [sections, isOpen]);

  const activeSection = sections.find((section) => section.id === activeSectionId) ?? sections[0];

  const renderList = (items: string[] | undefined) => {
    if (!items || items.length === 0) return null;

    return (
      <ul className="space-y-1.5 sm:space-y-2.5">
        {items.map((item, index) => (
          <li key={index} className="flex items-start gap-2 sm:gap-3 group">
            <div className="flex-shrink-0 mt-0.5">
              <Check
                className={`h-3.5 w-3.5 sm:h-5 sm:w-5 transition-transform group-hover:scale-110 ${
                  brandColors?.checkmarkColor ?? "text-red-600"
                }`}
              />
            </div>
            <span
              className={`text-[11px] sm:text-sm ${surface.bodyClass} leading-snug sm:leading-relaxed font-['Inter']`}
            >
              {item}
            </span>
          </li>
        ))}
      </ul>
    );
  };

  const renderSpecItem = (item: PrizeSpecItem, index: number) => (
    <div
      key={`${item.name}-${index}`}
      className={`group relative rounded-lg sm:rounded-xl ${surface.cardClass} p-3 sm:p-6 transition-all duration-300 hover:shadow-lg ${surface.cardHoverClass}`}
      style={{
        borderLeftWidth: "4px",
        borderLeftColor: surface.cardAccentBorder,
        boxShadow: isDark ? "0 1px 0 rgba(255,255,255,0.04) inset" : undefined,
      }}
    >
      <div className="mb-2 sm:mb-4">
        <div className="flex items-start gap-2 sm:gap-3">
          <div className="flex-shrink-0 mt-0.5 sm:mt-1">
            <Package className={`h-4 w-4 sm:h-6 sm:w-6 ${brandColors?.checkmarkColor ?? "text-red-600"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h4
              className={`text-sm sm:text-xl font-bold ${surface.titleClass} font-['Poppins'] leading-tight tracking-tight`}
            >
              {item.name}
            </h4>
            {item.model && (
              <p
                className={`text-[11px] sm:text-sm ${surface.mutedClass} font-medium mt-1 sm:mt-1.5 flex items-center gap-1.5`}
              >
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${surface.dotClass}`} />
                Model: {item.model}
              </p>
            )}
          </div>
        </div>
      </div>

      {item.description && (
        <p
          className={`text-[11px] sm:text-sm ${surface.bodyClass} mb-3 sm:mb-5 leading-snug sm:leading-relaxed font-['Inter'] pl-6 sm:pl-9`}
        >
          {item.description}
        </p>
      )}

      {item.specifications && item.specifications.length > 0 && (
        <div className="mb-3 sm:mb-5 pl-6 sm:pl-9">
          <h5
            className={`text-xs sm:text-base font-semibold ${surface.titleClass} mb-1.5 sm:mb-3 font-['Poppins'] flex items-center gap-1.5 sm:gap-2`}
          >
            <span className="inline-block w-0.5 sm:w-1 h-4 sm:h-5 shrink-0 rounded-full" style={surface.specBarStyle} />
            Specifications
          </h5>
          {renderList(item.specifications)}
        </div>
      )}

      {item.includes && item.includes.length > 0 && (
        <div
          className="rounded-md sm:rounded-lg border-2 border-dashed p-2 sm:p-4 ml-6 sm:ml-9 transition-colors duration-300"
          style={{ borderColor: surface.cardAccentBorder }}
        >
          <div className="rounded-md p-2 sm:p-4" style={surface.includesInnerStyle}>
            <h5
              className={`text-xs sm:text-base font-semibold ${surface.titleClass} mb-1.5 sm:mb-3 font-['Poppins'] flex items-center gap-1.5 sm:gap-2`}
            >
              <Package className={`h-3.5 w-3.5 sm:h-5 sm:w-5 shrink-0 ${brandColors?.checkmarkColor ?? "text-red-600"}`} />
              What&apos;s Included
            </h5>
            {renderList(item.includes)}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="4xl" height="auto" closeOnBackdrop>
      <ModalHeader
        title={prize ? prize.label : "Major Draw"}
        onClose={onClose}
        showLogo={false}
        variant="metallic-red"
        customBackground
        compact
        style={{ backgroundColor: headerSolidFill }}
        className="shadow-[inset_0_-1px_0_rgba(0,0,0,0.12)] dark:shadow-[inset_0_-1px_0_rgba(255,255,255,0.08)]"
        showCloseButton={true}
        titleTextClassName={brandColors?.textColor}
        subtitleTextClassName={brandColors?.subtitleTextColor}
      />

      <ModalContent scrollbar="metallic" padding="none" className="max-h-[88dvh] sm:max-h-[80vh]">
        <div
          className={`min-h-full w-full px-2.5 py-2 sm:p-6 ${surface.contentRootClass}`}
          style={surface.canvasStyle}
        >
          {!prize ? (
            <div className={`py-8 sm:py-12 text-center text-xs sm:text-base ${surface.emptyStateClass}`}>
              Prize information is loading. Please try again in a moment.
            </div>
          ) : sections.length === 0 ? (
            <div className={`py-8 sm:py-12 text-center text-xs sm:text-base ${surface.emptyStateClass}`}>
              Detailed specifications for this prize will be available soon.
            </div>
          ) : (
            <>
              <div className="mb-3 sm:mb-7 -mx-0.5 sm:-mx-2 px-0.5 sm:px-2 overflow-x-auto brand-scrollbar">
                <div className="flex gap-1.5 sm:gap-3 min-w-max pb-1.5 sm:pb-2">
                  {sections.map((section) => {
                    const isActive = section.id === activeSection?.id;
                    return (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => setActiveSectionId(section.id)}
                        className={`
                          relative px-3 sm:px-5 py-1.5 sm:py-2.5 rounded-full font-semibold text-[11px] sm:text-sm 
                          transition-all duration-300 border-2 whitespace-nowrap
                          ${
                            isActive
                              ? brandColors
                                ? `bg-gradient-to-br ${brandColors.gradient} ${brandColors.textColor} ${brandColors.borderColor} shadow-md sm:shadow-lg ${brandColors.shadowColor} sm:scale-105`
                                : "bg-gradient-to-br from-red-600 via-red-700 to-red-800 text-white border-red-500 shadow-md sm:shadow-lg shadow-red-500/40 sm:scale-105"
                              : `${surface.tabInactiveTextClass} ${surface.tabInactiveHoverClass}`
                          }
                        `}
                        style={isActive ? undefined : surface.tabInactiveStyle}
                      >
                        <span className="flex items-center gap-1.5 sm:gap-2">
                          {section.label}
                          {section.items.length > 0 && (
                            <span
                              className={`
                              inline-flex items-center justify-center min-w-[18px] sm:min-w-[20px] h-4 sm:h-5 px-1 sm:px-1.5 rounded-full text-[9px] sm:text-[11px] font-bold
                              ${isActive ? "bg-white/20 text-white" : surface.tabBadgeInactiveClass}
                            `}
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

              {activeSection?.summary && (
                <div
                  className="rounded-lg sm:rounded-xl p-3 sm:p-5 mb-3 sm:mb-7 border-l-4 transition-all duration-300"
                  style={surface.summaryBannerStyle}
                >
                  <p
                    className={`text-xs sm:text-base ${surface.summaryTextClass} leading-snug sm:leading-relaxed font-['Inter'] font-medium`}
                  >
                    {activeSection.summary}
                  </p>
                </div>
              )}

              <div className="space-y-3 sm:space-y-5">
                {activeSection?.items.map((item, index) => renderSpecItem(item, index))}
              </div>
            </>
          )}
        </div>
      </ModalContent>

      <ModalFooter onClose={onClose} brandColors={brandColors} />
    </ModalContainer>
  );
};

export default PrizeSpecificationsModal;
