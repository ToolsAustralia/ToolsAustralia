"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import ModalContainer from "../ui/ModalContainer";
import ModalContent from "../ui/ModalContent";
import Hero from "./Hero";
import SpecCard from "./SpecCard";
import TabBar from "./TabBar";
import TrustBar from "./TrustBar";
import type { PrizeCatalogEntry, PrizeSpecSection } from "@/config/prizes";
import {
  getPrizeBrandColors,
  getPrizeSpecificationsModalTheme,
} from "@/utils/prize-brand-colors";
import { useThemeStore } from "@/stores/useThemeStore";
import { cn } from "@/utils/cn";

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

  useEffect(() => {
    if (sections.length > 0) {
      setActiveSectionId(sections[0].id);
    } else {
      setActiveSectionId(null);
    }
  }, [sections, isOpen]);

  const activeSection = sections.find((section) => section.id === activeSectionId) ?? sections[0];

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="4xl" height="auto" closeOnBackdrop>
      {prize && <Hero prize={prize} />}

      {/* Absolute close button — sits above the hero so it's reachable while scrolling */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/55 text-white/95 inline-flex items-center justify-center border border-white/20 transition-all duration-150 backdrop-blur-md hover:bg-black/75 hover:text-white max-xs:top-2 max-xs:right-2 max-xs:w-[26px] max-xs:h-[26px]"
      >
        <X size={14} strokeWidth={2} />
      </button>

      <ModalContent scrollbar="metallic" padding="none" className="max-h-[88dvh] sm:max-h-[80vh]">
        <div
          className={cn("min-h-full w-full px-2.5 py-2 sm:p-6", surface.contentRootClass)}
          style={surface.canvasStyle}
        >
          {!prize ? (
            <div className={cn("py-8 sm:py-12 text-center text-xs sm:text-base", surface.emptyStateClass)}>
              Prize information is loading. Please try again in a moment.
            </div>
          ) : sections.length === 0 ? (
            <div className={cn("py-8 sm:py-12 text-center text-xs sm:text-base", surface.emptyStateClass)}>
              Detailed specifications for this prize will be available soon.
            </div>
          ) : (
            <>
              <TabBar
                sections={sections}
                activeId={activeSection?.id ?? null}
                onSelect={setActiveSectionId}
                brandColors={brandColors}
                surface={surface}
              />

              {activeSection?.summary && (
                <div
                  className="rounded-lg sm:rounded-xl p-3 sm:p-5 mb-3 sm:mb-7 border-l-2 bg-neutral-50 dark:bg-neutral-900/60 transition-all duration-300"
                  style={{ borderLeftColor: surface.cardAccentBorder }}
                >
                  <p className="text-xs sm:text-base text-neutral-600 dark:text-neutral-400 leading-snug sm:leading-relaxed font-['Inter'] font-medium">
                    {activeSection.summary}
                  </p>
                </div>
              )}

              <div className="space-y-3 sm:space-y-5">
                {activeSection?.items.map((item, index) => (
                  <SpecCard
                    key={`${item.name}-${index}`}
                    item={item}
                    surface={surface}
                    brandIconClass={brandColors?.checkmarkColor ?? "text-red-600"}
                    isDark={isDark}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </ModalContent>

      <TrustBar iconColorClass={brandColors?.checkmarkColor} />
    </ModalContainer>
  );
};

export default PrizeSpecificationsModal;
