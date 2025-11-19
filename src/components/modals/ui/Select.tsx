"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
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
  const [searchTerm, setSearchTerm] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const selectRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
    <div className={`space-y-2 ${className}`} ref={selectRef}>
      {/* Label */}
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
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
          className={`w-full px-4 py-3 border rounded-lg text-left focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:shadow-sm transition-all duration-200 ${
            error ? "border-red-500 bg-red-50" : "border-gray-300"
          } ${
            disabled
              ? "bg-gray-100 cursor-not-allowed text-gray-500"
              : "hover:border-red-400 hover:shadow-sm cursor-pointer bg-white"
          } ${isOpen ? "border-red-500 ring-2 ring-red-500/20" : ""}`}
        >
          <span className={selectedOption ? "text-gray-900" : "text-gray-500"}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronDown
            className={`absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {/* Dropdown Menu */}
        {isOpen && !disabled && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-hidden">
            {/* Search Input */}
            {searchable && (
              <div className="p-3 border-b border-gray-100">
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
                    className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:shadow-sm transition-all duration-200"
                  />
                </div>
              </div>
            )}

            {/* Options List */}
            <div className="max-h-48 overflow-y-auto">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option, index) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleOptionSelect(option)}
                    className={`w-full px-4 py-3 text-left hover:bg-red-50 focus:bg-red-50 focus:outline-none transition-colors duration-150 ${
                      value === option.value
                        ? "bg-red-100 text-red-900"
                        : highlightedIndex === index
                        ? "bg-red-50"
                        : "text-gray-900"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-medium">{option.label}</div>
                        {option.description && <div className="text-xs text-gray-500 mt-1">{option.description}</div>}
                      </div>
                      {value === option.value && <Check className="w-4 h-4 text-red-600 ml-2" />}
                    </div>
                  </button>
                ))
              ) : (
                <div className="px-4 py-6 text-center text-gray-500 text-sm">
                  {searchTerm ? "No options match your search" : "No options available"}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <p className="text-red-500 text-sm flex items-center gap-1">
          <AlertCircle className="w-4 h-4" />
          {error}
        </p>
      )}
    </div>
  );
};

export default Select;
