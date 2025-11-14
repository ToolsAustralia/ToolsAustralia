"use client";

import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";

import ModalContainer from "./ui/ModalContainer";
import ModalHeader from "./ui/ModalHeader";
import ModalContent from "./ui/ModalContent";
import type { PrizeCatalogEntry, PrizeSpecItem, PrizeSpecSection } from "@/config/prizes";

interface PrizeSpecificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  prize?: PrizeCatalogEntry | null;
}

const PrizeSpecificationsModal = ({ isOpen, onClose, prize }: PrizeSpecificationsModalProps) => {
  // Memoise sections so we don’t recreate arrays on every render.
  const sections = useMemo<PrizeSpecSection[]>(() => prize?.specSections ?? [], [prize]);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  // Whenever the prize (or its sections) changes we reset the active tab to the first section.
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
      <ul className="space-y-1.5 sm:space-y-2">
        {items.map((item, index) => (
          <li key={index} className="flex items-start gap-2 sm:gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <Check className="h-4 w-4 sm:h-5 sm:w-5 text-red-600" />
            </div>
            <span className="text-xs sm:text-sm text-gray-700 leading-relaxed font-['Inter']">{item}</span>
          </li>
        ))}
      </ul>
    );
  };

  const renderSpecItem = (item: PrizeSpecItem, index: number) => (
    <div key={`${item.name}-${index}`} className="border-b border-gray-200 pb-4 sm:pb-6 last:border-b-0 last:pb-0">
      <div className="mb-2 sm:mb-3">
        <h4 className="text-sm sm:text-lg font-bold text-gray-900 font-['Poppins']">{item.name}</h4>
        {item.model && <p className="text-xs sm:text-sm text-gray-600 font-medium mt-1">Model: {item.model}</p>}
      </div>

      {item.description && (
        <p className="text-xs sm:text-sm text-gray-700 mb-3 sm:mb-4 leading-relaxed font-['Inter']">
          {item.description}
        </p>
      )}

      {item.specifications && item.specifications.length > 0 && (
        <div className="mb-3 sm:mb-4">
          <h5 className="text-sm sm:text-base font-semibold text-gray-900 mb-1.5 sm:mb-2 font-['Poppins']">
            Specifications
          </h5>
          {renderList(item.specifications)}
        </div>
      )}

      {item.includes && item.includes.length > 0 && (
        <div>
          <h5 className="text-sm sm:text-base font-semibold text-gray-900 mb-1.5 sm:mb-2 font-['Poppins']">Includes</h5>
          {renderList(item.includes)}
        </div>
      )}
    </div>
  );

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="4xl" height="auto" closeOnBackdrop>
      <ModalHeader
        title={prize ? `${prize.label} Specifications` : "Major Draw Specifications"}
        onClose={onClose}
        showLogo={false}
        variant="metallic-red"
      />

      <ModalContent scrollbar="metallic" padding="lg" className="max-h-[80vh]">
        {!prize ? (
          <div className="py-12 text-center text-sm sm:text-base text-gray-600">
            Prize information is loading. Please try again in a moment.
          </div>
        ) : sections.length === 0 ? (
          <div className="py-12 text-center text-sm sm:text-base text-gray-600">
            Detailed specifications for this prize will be available soon.
          </div>
        ) : (
          <>
            {/* Quick toggle for sections so winners can drill into the details they care about. */}
            <div className="flex flex-wrap gap-2 sm:gap-3 mb-4 sm:mb-6">
              {sections.map((section) => {
                const isActive = section.id === activeSection?.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSectionId(section.id)}
                    className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-semibold text-xs sm:text-sm transition-all duration-200 border ${
                      isActive
                        ? "bg-gradient-to-br from-red-600 via-red-700 to-red-800 text-white border-red-500 shadow-lg shadow-red-500/40"
                        : "bg-gray-100 text-gray-700 border-gray-200 hover:border-red-400 hover:text-red-600"
                    }`}
                  >
                    {section.label}
                    {section.items.length > 0 && (
                      <span className={`ml-2 text-[11px] font-medium ${isActive ? "text-white/90" : "text-gray-500"}`}>
                        {section.items.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {activeSection?.summary && (
              <p className="text-sm sm:text-base text-gray-700 mb-4 sm:mb-6 leading-relaxed font-['Inter']">
                {activeSection.summary}
              </p>
            )}

            <div className="space-y-6 sm:space-y-8">
              {activeSection?.items.map((item, index) => renderSpecItem(item, index))}
            </div>
          </>
        )}
      </ModalContent>
    </ModalContainer>
  );
};

export default PrizeSpecificationsModal;

