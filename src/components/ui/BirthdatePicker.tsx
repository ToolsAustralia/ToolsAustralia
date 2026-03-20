"use client";

import React, { useState, useRef, useEffect } from "react";
import { Calendar, ChevronDown, AlertCircle, Check } from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isBefore,
  isAfter,
  startOfDay,
  subYears,
  setMonth,
  setYear,
  getYear,
  getMonth,
  getDate,
} from "date-fns";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface BirthdatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  error?: string;
  maxDate?: Date;
  minDate?: Date;
  placeholder?: string;
  className?: string;
  id?: string;
  "aria-invalid"?: boolean;
  /** Fires when the calendar popover opens or closes (e.g. for modal scroll/padding). */
  onOpenChange?: (open: boolean) => void;
}

const DEFAULT_MAX = new Date();
const DEFAULT_MIN = subYears(new Date(), 120);

/**
 * Birthdate-only picker: month and year dropdowns + calendar grid.
 * No time selection. Optimized for date-of-birth with easy year/month selection.
 */
export default function BirthdatePicker({
  value,
  onChange,
  label,
  required = false,
  error,
  maxDate = DEFAULT_MAX,
  minDate = DEFAULT_MIN,
  placeholder = "Select date of birth",
  className = "",
  id,
  "aria-invalid": ariaInvalid,
  onOpenChange,
}: BirthdatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<"month" | "year" | null>(null);
  const [viewDate, setViewDate] = useState<Date>(() => {
    if (value) {
      const d = new Date(value);
      return isNaN(d.getTime()) ? new Date() : d;
    }
    return new Date();
  });
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedDate = value ? (() => {
    const d = new Date(value + "T12:00:00");
    return isNaN(d.getTime()) ? null : d;
  })() : null;

  const currentYear = getYear(new Date());
  const years = Array.from({ length: currentYear - getYear(minDate) + 1 }, (_, i) => currentYear - i);

  useEffect(() => {
    if (!value) return;
    const d = new Date(value + "T12:00:00");
    if (!isNaN(d.getTime())) setViewDate(d);
  }, [value]);

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setOpenDropdown(null);
      }
    };
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(viewDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const firstDayOfWeek = monthStart.getDay();
  const leadingBlanks = Array(firstDayOfWeek).fill(null);
  const gridDays = [...leadingBlanks, ...daysInMonth.map((d) => getDate(d))];

  const handleMonthChange = (monthIndex: number) => {
    setViewDate((prev) => setMonth(prev, monthIndex));
  };

  const handleYearChange = (y: number) => {
    setViewDate((prev) => setYear(prev, y));
  };

  const handleDaySelect = (day: number) => {
    const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    const dStart = startOfDay(d);
    if (minDate && isBefore(dStart, startOfDay(minDate))) return;
    if (maxDate && isAfter(dStart, startOfDay(maxDate))) return;
    onChange(format(d, "yyyy-MM-dd"));
    setIsOpen(false);
  };

  const displayLabel = selectedDate
    ? format(selectedDate, "d MMMM yyyy")
    : placeholder;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <button
        type="button"
        id={id}
        onClick={() => setIsOpen((o) => !o)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-invalid={ariaInvalid ?? !!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border bg-white dark:bg-neutral-900 text-gray-900 dark:text-white text-left text-sm transition-colors focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-500 dark:focus:border-blue-500 ${
          error
            ? "border-red-500 dark:border-red-500 hover:border-red-600 dark:hover:border-red-600"
            : "border-gray-300 dark:border-neutral-600 hover:border-gray-400 dark:hover:border-neutral-500"
        }`}
      >
        {error ? (
          <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 flex-shrink-0" aria-hidden />
        ) : (
          <Calendar className="w-4 h-4 text-gray-400 dark:text-neutral-500 flex-shrink-0" />
        )}
        <span className={selectedDate ? "" : "text-gray-500 dark:text-neutral-400"}>
          {displayLabel}
        </span>
        <ChevronDown
          className={`w-4 h-4 ml-auto text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Choose date of birth"
          className="absolute z-50 mt-1 left-0 right-0 w-full min-w-0 rounded-xl border border-gray-200 dark:border-neutral-600 bg-white dark:bg-neutral-900 shadow-xl py-4 px-3 lg:py-3 lg:px-2.5"
        >
          {/* Month & Year – custom dropdowns matching site theme (red accent, no default select look) */}
          <div className="grid grid-cols-2 gap-3 mb-4 lg:gap-2 lg:mb-3">
            <div className="space-y-1 lg:space-y-0.5">
              <span className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-400 lg:text-[10px]">
                Month
              </span>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOpenDropdown((o) => (o === "month" ? null : "month"))}
                  aria-expanded={openDropdown === "month"}
                  aria-haspopup="listbox"
                  className={`w-full flex items-center justify-between gap-1 pl-3 pr-8 py-2.5 lg:py-1.5 lg:pl-2 lg:pr-6 lg:text-xs rounded-lg border text-left text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 ${
                    openDropdown === "month"
                      ? "border-red-500 ring-2 ring-red-500/20 bg-white dark:bg-neutral-900"
                      : "border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 hover:border-red-400 dark:hover:border-neutral-500 text-gray-900 dark:text-white"
                  }`}
                >
                  <span className="truncate">{MONTHS[getMonth(viewDate)]}</span>
                  <ChevronDown
                    className={`absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 lg:w-3 lg:h-3 text-gray-400 dark:text-neutral-500 flex-shrink-0 transition-transform duration-200 ${openDropdown === "month" ? "rotate-180" : ""}`}
                  />
                </button>
                {openDropdown === "month" && (
                  <div
                    role="listbox"
                    className="absolute z-[60] left-0 right-0 mt-1 max-h-[200px] overflow-y-auto overflow-x-hidden rounded-lg border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 shadow-lg py-1 scroll-smooth overscroll-contain touch-pan-y"
                    style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
                  >
                    {MONTHS.map((name, i) => (
                      <button
                        key={name}
                        type="button"
                        role="option"
                        aria-selected={getMonth(viewDate) === i}
                        onClick={() => {
                          handleMonthChange(i);
                          setOpenDropdown(null);
                        }}
                        className={`w-full px-3 py-2 lg:py-1.5 lg:px-2 lg:text-xs text-left flex items-center justify-between transition-colors duration-150 ${
                          getMonth(viewDate) === i
                            ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 font-medium"
                            : "text-gray-900 dark:text-white hover:bg-red-50 dark:hover:bg-red-950/30"
                        }`}
                      >
                        {name}
                        {getMonth(viewDate) === i && <Check className="w-4 h-4 lg:w-3 lg:h-3 text-red-600 dark:text-red-400 flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-1 lg:space-y-0.5">
              <span className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-neutral-400 lg:text-[10px]">
                Year
              </span>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOpenDropdown((o) => (o === "year" ? null : "year"))}
                  aria-expanded={openDropdown === "year"}
                  aria-haspopup="listbox"
                  className={`w-full flex items-center justify-between gap-1 pl-3 pr-8 py-2.5 lg:py-1.5 lg:pl-2 lg:pr-6 lg:text-xs rounded-lg border text-left text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 ${
                    openDropdown === "year"
                      ? "border-red-500 ring-2 ring-red-500/20 bg-white dark:bg-neutral-900"
                      : "border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 hover:border-red-400 dark:hover:border-neutral-500 text-gray-900 dark:text-white"
                  }`}
                >
                  <span className="truncate">{getYear(viewDate)}</span>
                  <ChevronDown
                    className={`absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 lg:w-3 lg:h-3 text-gray-400 dark:text-neutral-500 flex-shrink-0 transition-transform duration-200 ${openDropdown === "year" ? "rotate-180" : ""}`}
                  />
                </button>
                {openDropdown === "year" && (
                  <div
                    role="listbox"
                    className="absolute z-[60] left-0 right-0 mt-1 max-h-[200px] overflow-y-auto overflow-x-hidden rounded-lg border border-gray-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 shadow-lg py-1 scroll-smooth overscroll-contain touch-pan-y"
                    style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
                  >
                    {years.map((y) => (
                      <button
                        key={y}
                        type="button"
                        role="option"
                        aria-selected={getYear(viewDate) === y}
                        onClick={() => {
                          handleYearChange(y);
                          setOpenDropdown(null);
                        }}
                        className={`w-full px-3 py-2 lg:py-1.5 lg:px-2 lg:text-xs text-left flex items-center justify-between transition-colors duration-150 ${
                          getYear(viewDate) === y
                            ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 font-medium"
                            : "text-gray-900 dark:text-white hover:bg-red-50 dark:hover:bg-red-950/30"
                        }`}
                      >
                        {y}
                        {getYear(viewDate) === y && <Check className="w-4 h-4 lg:w-3 lg:h-3 text-red-600 dark:text-red-400 flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Day headers – smaller on lg */}
          <div className="grid grid-cols-7 gap-1 mb-2 lg:gap-0.5 lg:mb-1">
            {DAY_NAMES.map((day) => (
              <div
                key={day}
                className="text-center text-xs font-medium text-gray-500 dark:text-neutral-400 py-1 lg:text-[10px] lg:py-0.5"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid – tighter on lg */}
          <div className="grid grid-cols-7 gap-1 lg:gap-0.5">
            {gridDays.map((day, index) => {
              if (day === null) {
                return <div key={`e-${index}`} className="aspect-square" />;
              }
              const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
              const dStart = startOfDay(d);
              const disabled =
                (minDate && isBefore(dStart, startOfDay(minDate))) ||
                (maxDate && isAfter(dStart, startOfDay(maxDate)));
              const selected = selectedDate && isSameDay(dStart, selectedDate);

              return (
                <button
                  key={`${viewDate.getFullYear()}-${viewDate.getMonth()}-${day}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleDaySelect(day)}
                  className={`
                    aspect-square w-full rounded-lg lg:rounded-md text-sm font-medium lg:text-xs transition-colors
                    ${disabled ? "text-gray-300 dark:text-neutral-600 cursor-not-allowed" : ""}
                    ${selected ? "bg-red-600 text-white hover:bg-red-700" : ""}
                    ${!disabled && !selected ? "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-700" : ""}
                  `}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <p id={id ? `${id}-error` : undefined} className="mt-1 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
