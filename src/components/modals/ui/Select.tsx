"use client";

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { AlertCircle, ChevronDown, Search, Check } from "lucide-react";

interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

interface SelectProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: SelectOption[];
  placeholder?: string;
  label?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  searchable?: boolean;
  className?: string;
  onOpenChange?: (isOpen: boolean) => void;
}

const Select: React.FC<SelectProps> = ({
  id,
  name,
  value,
  onChange,
  options,
  placeholder = "Select an option",
  label,
  required = false,
  error,
  disabled = false,
  searchable = false,
  className = "",
  onOpenChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const selectRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionsListRef = useRef<HTMLDivElement>(null);

  // Filter options based on search term
  const filteredOptions = options.filter(
    (option) =>
      option.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      option.value.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get selected option
  const selectedOption = options.find((option) => option.value === value);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm("");
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleOptionSelect = useCallback(
    (option: SelectOption) => {
      // Create a synthetic event to match the expected onChange signature
      const syntheticEvent = {
        target: {
          name: name || "",
          value: option.value,
        },
      } as React.ChangeEvent<HTMLSelectElement>;

      onChange(syntheticEvent);
      setIsOpen(false);
      setSearchTerm("");
      setHighlightedIndex(-1);
    },
    [onChange, name]
  );

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setHighlightedIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
          break;
        case "ArrowUp":
          event.preventDefault();
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
          break;
        case "Enter":
          event.preventDefault();
          if (highlightedIndex >= 0) {
            handleOptionSelect(filteredOptions[highlightedIndex]);
          }
          break;
        case "Escape":
          setIsOpen(false);
          setSearchTerm("");
          setHighlightedIndex(-1);
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, highlightedIndex, filteredOptions, handleOptionSelect]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchable]);

  // Notify parent when dropdown open state changes
  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  // Calculate available space, open direction (up/down), and constrain dropdown height
  useLayoutEffect(() => {
    if (!isOpen || !selectRef.current || !optionsListRef.current) return;

    const calculatePositionAndHeight = () => {
      const selectElement = selectRef.current;
      if (!selectElement) return;

      const rect = selectElement.getBoundingClientRect();
      
      let contentBottom = window.innerHeight;
      let contentTop = 0;
      
      let parent = selectElement.parentElement;
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
      
      const shouldOpenUpward = !isInsideModal && spaceBelow < spaceAbove;
      setOpenUpward(shouldOpenUpward);
      
      const availableSpace = shouldOpenUpward ? Math.min(spaceAbove, 400) : spaceBelow;
      const maxHeight = Math.min(Math.max(availableSpace, 180), 400);

      if (optionsListRef.current) {
        optionsListRef.current.style.maxHeight = `${maxHeight}px`;
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
      if (optionsListRef.current && optionsListRef.current.contains(e.target as Node)) {
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

  const toggleDropdown = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
      if (!isOpen) {
        setSearchTerm("");
        setHighlightedIndex(-1);
      }
    }
  };

  return (
    <div className={`space-y-1.5 sm:space-y-2 ${className}`} ref={selectRef}>
      {/* Label */}
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label} {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {/* Select Container */}
      <div className="relative">
        {/* Hidden native select for form compatibility */}
        <select
          id={id}
          name={name}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className="sr-only"
          tabIndex={-1}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* Custom Select Button */}
        <button
          type="button"
          onClick={toggleDropdown}
          disabled={disabled}
          className={`w-full px-3 py-2 sm:px-4 sm:py-2.5 text-sm border rounded-xl text-left focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:shadow-sm transition-all duration-200 ${
            error ? "border-red-500 bg-red-50 dark:bg-red-950/30 dark:border-red-500" : "border-gray-300 dark:border-neutral-700"
          } ${
            disabled
              ? "bg-gray-100 dark:!bg-neutral-800 cursor-not-allowed text-gray-500 dark:text-neutral-500"
              : "hover:border-red-400 dark:hover:border-neutral-600 hover:shadow-sm cursor-pointer bg-[#ffffff] dark:!bg-neutral-900"
          } ${isOpen ? "border-red-500 ring-2 ring-red-500/20 dark:border-red-500" : ""}`}
        >
          <span className={selectedOption ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronDown
            className="absolute right-2.5 sm:right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform duration-200"
            style={{ transform: `translateY(-50%) ${isOpen ? "rotate(180deg)" : "rotate(0deg)"}` }}
          />
        </button>

        {/* Dropdown Menu */}
        {isOpen && !disabled && (
          <div
            ref={optionsListRef}
            data-dropdown-list
            className={`absolute z-50 w-full ${openUpward ? "bottom-full mb-1" : "mt-1"} bg-[#ffffff] dark:!bg-neutral-950 border border-gray-300 dark:border-neutral-700 rounded-xl shadow-lg overflow-y-scroll overflow-x-hidden`}
            style={{
              touchAction: "pan-y",
              WebkitOverflowScrolling: "touch",
              overscrollBehavior: "contain",
              WebkitTransform: "translateZ(0)",
              transform: "translateZ(0)",
            }}
            onWheel={(e) => e.stopPropagation()}
          >
            {/* Search Input */}
            {searchable && (
              <div className="p-3 border-b border-gray-100 dark:border-neutral-700 sticky top-0 bg-white dark:bg-neutral-900 z-10">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search options..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setHighlightedIndex(-1);
                    }}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-neutral-600 rounded-md bg-[#ffffff] dark:!bg-neutral-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:shadow-sm transition-all duration-200"
                  />
                </div>
              </div>
            )}

            {/* Options List */}
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleOptionSelect(option)}
                  style={{ touchAction: "pan-y" }}
                  className={`w-full px-4 py-3 text-sm text-left hover:bg-red-50 dark:hover:bg-red-950/30 focus:bg-red-50 dark:focus:bg-red-950/30 focus:outline-none transition-colors duration-150 ${
                    value === option.value
                      ? "bg-red-100 dark:bg-red-950/40 text-red-900 dark:text-red-400"
                      : highlightedIndex === index
                      ? "bg-red-50 dark:bg-red-950/30"
                      : "text-gray-900 dark:text-white"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium">{option.label}</div>
                      {option.description && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{option.description}</div>}
                    </div>
                    {value === option.value && <Check className="w-4 h-4 text-red-600 dark:text-red-400 ml-2" />}
                  </div>
                </button>
              ))
            ) : (
              <div className="px-4 py-6 text-center text-gray-500 dark:text-gray-400 text-sm">
                {searchTerm ? "No options match your search" : "No options available"}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <p className="text-red-500 dark:text-red-400 text-xs sm:text-sm flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          {error}
        </p>
      )}
    </div>
  );
};

export default Select;
