"use client";

import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Input from "./Input";

export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
  icon?: LucideIcon; // Optional icon component
}

interface DropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  label?: string;
  error?: string;
  required?: boolean;
  // Custom input support for "Other" option
  showCustomInput?: boolean;
  customInputValue?: string;
  onCustomInputChange?: (value: string) => void;
  customInputPlaceholder?: string;
  customInputError?: string;
  onOpenChange?: (isOpen: boolean) => void;
  // Active state for filter indicators
  active?: boolean;
  // Compact mode for mobile/smaller spaces
  compact?: boolean;
}

const Dropdown: React.FC<DropdownProps> = ({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  disabled = false,
  className = "",
  label,
  error,
  required = false,
  showCustomInput = false,
  customInputValue = "",
  onCustomInputChange,
  customInputPlaceholder = "Enter your profession",
  customInputError,
  onOpenChange,
  active = false,
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Close dropdown on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => {
        document.removeEventListener("keydown", handleEscape);
      };
    }
  }, [isOpen]);

  // Notify parent when dropdown open state changes
  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  // Calculate available space, open direction (up/down), and constrain dropdown height
  useLayoutEffect(() => {
    if (!isOpen || !dropdownRef.current || !optionsRef.current) return;

    const calculatePositionAndHeight = () => {
      const dropdownElement = dropdownRef.current;
      if (!dropdownElement) return;

      const rect = dropdownElement.getBoundingClientRect();
      
      let contentBottom = window.innerHeight;
      let contentTop = 0;
      
      let parent = dropdownElement.parentElement;
      let modalContainer: HTMLElement | null = null;
      
      while (parent && parent !== document.body) {
        const styles = window.getComputedStyle(parent);
        if (styles.display === "flex" && styles.flexDirection === "column") {
          modalContainer = parent;
          break;
        }
        parent = parent.parentElement;
      }
      
      const isInsideModal = !!modalContainer;
      
      if (modalContainer) {
        const footer = Array.from(modalContainer.children).find((child) => {
          const childStyles = window.getComputedStyle(child);
          return childStyles.borderTopWidth !== "0px" || 
                 child.classList.toString().includes("border-t") ||
                 child.querySelector('button, [role="button"]');
        }) as HTMLElement | undefined;
        
        if (footer) {
          contentBottom = footer.getBoundingClientRect().top - 10;
        } else {
          contentBottom = modalContainer.getBoundingClientRect().bottom;
        }
        contentTop = modalContainer.getBoundingClientRect().top;
      }
      
      const spaceBelow = contentBottom - rect.bottom - 20;
      const spaceAbove = rect.top - contentTop - 20;
      
      // Only open upward when NOT inside a modal (e.g. on a page). Inside modals, always open downward
      // so the modal height/layout stays predictable and we don't draw into the header.
      const shouldOpenUpward = !isInsideModal && spaceBelow < spaceAbove;
      setOpenUpward(shouldOpenUpward);
      
      const availableSpace = shouldOpenUpward ? Math.min(spaceAbove, 400) : spaceBelow;
      const maxHeight = Math.min(Math.max(availableSpace, 180), 400);

      if (optionsRef.current) {
        optionsRef.current.style.maxHeight = `${maxHeight}px`;
      }
    };

    calculatePositionAndHeight();

    let scrollTimeout: NodeJS.Timeout;
    const handleScroll = () => {
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(calculatePositionAndHeight, 50);
    };
    
    document.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", calculatePositionAndHeight);

    const handleWheel = (e: WheelEvent) => {
      if (optionsRef.current && optionsRef.current.contains(e.target as Node)) {
        e.stopPropagation();
      }
    };
    
    document.addEventListener("wheel", handleWheel, { passive: false, capture: true });

    return () => {
      window.removeEventListener("resize", calculatePositionAndHeight);
      document.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("wheel", handleWheel, { capture: true });
      if (scrollTimeout) clearTimeout(scrollTimeout);
    };
  }, [isOpen]);

  const selectedOption = options.find((option) => option.value === value);

  const handleOptionClick = (optionValue: string) => {
    if (!disabled) {
      onChange(optionValue);
      setIsOpen(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setIsOpen(!isOpen);
    }
  };

  return (
    <div className={`relative ${isOpen ? "z-[100]" : ""} ${className}`} ref={dropdownRef}>
      {/* Label */}
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {label}
          {required && <span className="text-red-500 dark:text-red-400 ml-1">*</span>}
        </label>
      )}

      {/* Dropdown Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`
          w-full border rounded-lg text-left transition-all duration-200
          focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent
          ${
            compact
              ? "px-2 py-1.5 text-xs sm:px-3 sm:py-2 sm:text-sm"
              : "px-3 py-2 sm:px-4 sm:py-2.5 text-sm"
          }
          ${
            error
              ? "border-red-300 dark:border-red-500 bg-red-50 dark:bg-red-950/30"
              : active
              ? "border-red-500 dark:border-red-500 bg-red-50/50 dark:bg-red-950/30 shadow-md"
              : "border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 hover:border-gray-400 dark:hover:border-neutral-500"
          }
          ${disabled ? "bg-gray-100 dark:bg-neutral-800 text-gray-400 dark:text-gray-500 cursor-not-allowed" : "cursor-pointer"}
          ${isOpen ? "ring-2 ring-red-500 border-transparent" : ""}
        `}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls="dropdown-options"
        role="combobox"
      >
        <div className="flex items-center justify-between gap-1 sm:gap-2">
          <span
            className={`truncate flex-1 flex items-center gap-1 sm:gap-1.5 ${
              selectedOption ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"
            }`}
          >
            {selectedOption?.icon && (
              <selectedOption.icon
                className={`flex-shrink-0 ${
                  compact ? "w-2.5 h-2.5 sm:w-3 sm:h-3 lg:w-4 lg:h-4" : "w-3 h-3 sm:w-3.5 sm:h-3.5 lg:w-4 lg:h-4"
                }`}
              />
            )}
            <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
          </span>
          <ChevronDown
            className="flex-shrink-0 w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform duration-200"
            style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        </div>
      </button>

      {/* Dropdown Options */}
      {isOpen && (
        <div
          id="dropdown-options"
          ref={optionsRef}
          data-dropdown-list
          className={`absolute z-50 w-full min-w-[220px] ${openUpward ? "bottom-full mb-1" : "top-full mt-1"} bg-white dark:bg-neutral-900 border border-gray-300 dark:border-neutral-600 rounded-lg shadow-lg overflow-y-scroll overflow-x-hidden`}
          style={{
            touchAction: "pan-y",
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
            WebkitTransform: "translateZ(0)",
            transform: "translateZ(0)",
          }}
          onWheel={(e) => e.stopPropagation()}
        >
          {options.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">No options available</div>
          ) : (
            options.map((option) => {
              const IconComponent = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleOptionClick(option.value)}
                  disabled={option.disabled}
                  style={{ touchAction: "pan-y" }}
                  className={`
                    w-full px-4 py-3 text-left text-sm transition-colors duration-150
                    flex items-center justify-between gap-2
                    ${
                      option.disabled
                        ? "text-gray-400 dark:text-gray-500 cursor-not-allowed bg-gray-50 dark:bg-neutral-800"
                        : "text-gray-900 dark:text-white hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                    }
                    ${option.value === value ? "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400" : ""}
                    first:rounded-t-lg last:rounded-b-lg
                  `}
                  role="option"
                  aria-selected={option.value === value}
                >
                  <span className="flex items-center gap-2 flex-1 min-w-0">
                    {IconComponent && <IconComponent className="w-4 h-4 flex-shrink-0" />}
                    <span className="whitespace-nowrap">{option.label}</span>
                  </span>
                  {option.value === value && <Check className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Custom Input for "Other" option */}
      {showCustomInput && value === "Other" && (
        <div className="mt-3">
          <Input
            type="text"
            value={customInputValue}
            onChange={(e) => onCustomInputChange?.(e.target.value)}
            placeholder={customInputPlaceholder}
            error={customInputError}
            maxLength={100}
            required={required}
          />
        </div>
      )}

      {/* Error Message */}
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
};

export default Dropdown;
