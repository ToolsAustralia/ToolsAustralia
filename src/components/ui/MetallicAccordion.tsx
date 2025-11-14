"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export interface MetallicAccordionItem {
  id: string;
  title: string;
  content: string | React.ReactNode;
}

interface MetallicAccordionProps {
  items: MetallicAccordionItem[];
  variant?: "red" | "blue" | "purple" | "gold";
  allowMultiple?: boolean;
  defaultExpandedId?: string;
  className?: string;
  iconColor?: string;
}

// Helper function to get icon color based on variant
const getIconColor = (variant: string, customColor?: string) => {
  if (customColor) return customColor;

  switch (variant) {
    case "red":
      return "text-[#ee0000]";
    case "blue":
      return "text-blue-400";
    case "purple":
      return "text-purple-400";
    case "gold":
      return "text-yellow-400";
    default:
      return "text-[#ee0000]";
  }
};

// Helper function to get hover shadow color based on variant
const getHoverShadowColor = (variant: string) => {
  switch (variant) {
    case "red":
      return "hover:shadow-[0_8px_32px_rgba(238,0,0,0.2)]";
    case "blue":
      return "hover:shadow-[0_8px_32px_rgba(59,130,246,0.2)]";
    case "purple":
      return "hover:shadow-[0_8px_32px_rgba(147,51,234,0.2)]";
    case "gold":
      return "hover:shadow-[0_8px_32px_rgba(251,191,36,0.2)]";
    default:
      return "hover:shadow-[0_8px_32px_rgba(238,0,0,0.2)]";
  }
};

export default function MetallicAccordion({
  items,
  variant = "red",
  allowMultiple = false,
  defaultExpandedId,
  className = "",
  iconColor,
}: MetallicAccordionProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(
    defaultExpandedId ? new Set([defaultExpandedId]) : new Set()
  );

  const toggleItem = (itemId: string) => {
    setExpandedItems((prev) => {
      const newSet = new Set(prev);

      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        if (!allowMultiple) {
          newSet.clear();
        }
        newSet.add(itemId);
      }

      return newSet;
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent, itemId: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleItem(itemId);
    }
  };

  const iconColorClass = getIconColor(variant, iconColor);
  const hoverShadowClass = getHoverShadowColor(variant);

  return (
    <div className={`space-y-3 sm:space-y-4 ${className}`}>
      {items.map((item) => {
        const isExpanded = expandedItems.has(item.id);

        return (
          <div
            key={item.id}
            className={`relative group bg-gradient-to-br from-slate-700/80 via-slate-600/80 to-slate-700/80 backdrop-blur-sm rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-slate-500/30 hover:border-[#ee0000]/50 ${hoverShadowClass} transition-all duration-300`}
          >
            {/* Glass-morphism overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none z-10"></div>

            <button
              onClick={() => toggleItem(item.id)}
              onKeyDown={(e) => handleKeyDown(e, item.id)}
              className="w-full px-4 sm:px-6 py-4 sm:py-5 text-left flex items-center justify-between hover:bg-white/5 transition-colors duration-300 relative z-20 focus:outline-none"
              aria-expanded={isExpanded}
              aria-controls={`accordion-content-${item.id}`}
            >
              <span className="font-medium text-sm sm:text-lg font-['Poppins'] pr-4 leading-tight text-white">
                {item.title}
              </span>
              <div className="flex-shrink-0">
                {isExpanded ? (
                  <ChevronUp className={`w-5 h-5 sm:w-6 sm:h-6 ${iconColorClass} transition-transform duration-300`} />
                ) : (
                  <ChevronDown
                    className={`w-5 h-5 sm:w-6 sm:h-6 ${iconColorClass} transition-transform duration-300`}
                  />
                )}
              </div>
            </button>

            {isExpanded && (
              <div
                id={`accordion-content-${item.id}`}
                className="px-4 sm:px-6 pb-4 sm:pb-5 border-t border-slate-500/30 animate-in slide-in-from-top-2 duration-300 relative z-20"
                role="region"
                aria-labelledby={`accordion-button-${item.id}`}
              >
                <div className="text-slate-200 leading-relaxed pt-3 sm:pt-4 font-['Poppins'] text-sm sm:text-base">
                  {typeof item.content === "string" ? <p>{item.content}</p> : item.content}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
