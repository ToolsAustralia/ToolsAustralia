"use client";

import { useState } from "react";
import MetallicAccordion, { MetallicAccordionItem } from "./MetallicAccordion";

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category?: string;
}

interface FAQSectionProps {
  title?: string;
  subtitle?: string;
  faqs: FAQItem[];
  categories?: string[];
  showCategoryFilter?: boolean;
  variant?: "red" | "blue" | "purple" | "gold";
  className?: string;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "4xl";
}

// Helper function to get max width class
const getMaxWidthClass = (maxWidth: string) => {
  switch (maxWidth) {
    case "sm":
      return "max-w-sm";
    case "md":
      return "max-w-md";
    case "lg":
      return "max-w-lg";
    case "xl":
      return "max-w-xl";
    case "2xl":
      return "max-w-2xl";
    case "4xl":
      return "max-w-4xl";
    default:
      return "max-w-4xl";
  }
};

export default function FAQSection({
  title,
  subtitle,
  faqs,
  categories = [],
  showCategoryFilter = false,
  variant = "red",
  className = "",
  maxWidth = "4xl",
}: FAQSectionProps) {
  const [activeCategory, setActiveCategory] = useState("ALL QUESTIONS");

  // Filter FAQs based on active category
  const filteredFAQs =
    activeCategory === "ALL QUESTIONS" ? faqs : faqs.filter((faq) => faq.category === activeCategory);

  // Convert FAQ items to accordion items
  const accordionItems: MetallicAccordionItem[] = filteredFAQs.map((faq) => ({
    id: faq.id,
    title: faq.question,
    content: faq.answer,
  }));

  return (
    <div className={`w-full px-4 sm:px-6 lg:px-8 py-8 ${className}`}>
      <div className={`${getMaxWidthClass(maxWidth)} mx-auto`}>
        {/* Section Header */}
        {(title || subtitle) && (
          <div className="text-center mb-8 sm:mb-12">
            {title && (
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 font-['Poppins'] mb-3 sm:mb-4 drop-shadow-lg">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-base sm:text-lg text-gray-700 font-['Inter'] max-w-2xl mx-auto">{subtitle}</p>
            )}
          </div>
        )}

        {/* Category Filter */}
        {showCategoryFilter && categories.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mb-8 sm:mb-12">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`px-3 sm:px-6 py-2 sm:py-3 rounded-lg font-medium transition-all duration-300 font-['Poppins'] text-xs sm:text-sm backdrop-blur-sm ${
                  activeCategory === category
                    ? "bg-gradient-to-r from-[#ee0000] to-[#cc0000] text-white shadow-lg shadow-[#ee0000]/50 transform scale-105"
                    : "bg-slate-700/80 text-slate-200 border border-slate-500/30 hover:bg-slate-600/80 hover:border-[#ee0000]/50 hover:shadow-md hover:shadow-[#ee0000]/20"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        )}

        {/* FAQ Accordion */}
        <MetallicAccordion items={accordionItems} variant={variant} allowMultiple={false} />
      </div>
    </div>
  );
}
