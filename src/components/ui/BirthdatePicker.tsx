"use client";

import React, { useState, useRef, useEffect } from "react";
import { Calendar, ChevronDown, AlertCircle, Check } from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isBefore,
  isAfter,
  startOfDay,
  subYears,
  getYear,
  getMonth,
  getDate,
} from "date-fns";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Days in month (month is 0–11); avoids Feb 29 rolling to March when changing year JS-style. */
function daysInCalendarMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function clampDayToMonth(year: number, month: number, preferred: number): number {
  const max = daysInCalendarMonth(year, month);
  return Math.max(1, Math.min(preferred, max));
}

/** Neutral default calendar view when no date picked yet — ~25yo, first of month (valid in every month). */
function defaultViewDateWithoutValue(): Date {
  const anchor = subYears(new Date(), 25);
  return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
}

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
 * Birthdate-only picker: month & year dropdowns + calendar grid for the day.
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
  "aria-invalid": _ariaInvalid,
  onOpenChange,
}: BirthdatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<"month" | "year" | null>(null);
  /** Day-of-month for grid highlight / clamping — preserved when changing month/year (does not disappear on year alone). */
  const [highlightDayOfMonth, setHighlightDayOfMonth] = useState<number | null>(null);

  const [viewDate, setViewDate] = useState<Date>(() => {
    if (value) {
      const d = new Date(value + "T12:00:00");
      return isNaN(d.getTime()) ? defaultViewDateWithoutValue() : d;
    }
    return defaultViewDateWithoutValue();
  });
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedDate = value ? (() => {
    const d = new Date(value + "T12:00:00");
    return isNaN(d.getTime()) ? null : d;
  })() : null;

  const hasCommittedValue = Boolean(value && selectedDate);

  const currentYear = getYear(new Date());
  const years = Array.from({ length: currentYear - getYear(minDate) + 1 }, (_, i) => currentYear - i);

  useEffect(() => {
    if (!value?.trim()) {
      setHighlightDayOfMonth(null);
      setViewDate(defaultViewDateWithoutValue());
      return;
    }
    const d = new Date(value + "T12:00:00");
    if (!isNaN(d.getTime())) {
      setViewDate(d);
      setHighlightDayOfMonth(getDate(d));
    }
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

  /** Prefer sticky dom: explicit highlight, then saved value, then current cell in view */
  function preferredDomForClamp(): number {
    if (highlightDayOfMonth != null) return highlightDayOfMonth;
    if (selectedDate) return getDate(selectedDate);
    return getDate(viewDate);
  }

  function isDomInRange(y: number, m: number, dom: number): boolean {
    const dStart = startOfDay(new Date(y, m, dom));
    if (minDate && isBefore(dStart, startOfDay(minDate))) return false;
    if (maxDate && isAfter(dStart, startOfDay(maxDate))) return false;
    return true;
  }

  const commitIfInRange = (y: number, m: number, dom: number) => {
    if (!isDomInRange(y, m, dom)) return false;
    onChange(format(new Date(y, m, dom), "yyyy-MM-dd"));
    return true;
  };

  const handleMonthChange = (monthIndex: number) => {
    const y = getYear(viewDate);
    const dom = clampDayToMonth(y, monthIndex, preferredDomForClamp());
    const next = new Date(y, monthIndex, dom);
    setOpenDropdown(null);

    // Editing existing DOB — do not navigate if the clamped date would be out of bounds (stay on current saving).
    if (hasCommittedValue && !isDomInRange(y, monthIndex, dom)) return;

    setViewDate(next);
    setHighlightDayOfMonth(dom);
    if (hasCommittedValue) commitIfInRange(y, monthIndex, dom);
  };

  const handleYearChange = (y: number) => {
    const m = getMonth(viewDate);
    const dom = clampDayToMonth(y, m, preferredDomForClamp());
    const next = new Date(y, m, dom);
    setOpenDropdown(null);

    if (hasCommittedValue && !isDomInRange(y, m, dom)) return;

    setViewDate(next);
    setHighlightDayOfMonth(dom);
    if (hasCommittedValue) commitIfInRange(y, m, dom);
  };

  const handleDaySelect = (day: number) => {
    const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    const dStart = startOfDay(d);
    if (minDate && isBefore(dStart, startOfDay(minDate))) return;
    if (maxDate && isAfter(dStart, startOfDay(maxDate))) return;
    setHighlightDayOfMonth(day);
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
        aria-describedby={error ? `${id}-error` : undefined}
        className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border bg-[#ffffff] text-gray-900 text-left text-sm transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-neutral-600 dark:bg-[#171717] dark:text-white dark:focus:border-blue-500 dark:focus:ring-blue-500 ${
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
          className="absolute left-0 right-0 z-50 mt-1 w-full min-w-0 rounded-xl border border-gray-200 bg-[#ffffff] py-4 px-3 shadow-xl dark:border-neutral-600 dark:bg-[#171717] lg:px-2.5 lg:py-3"
        >
          {/* Month & year — pick the day from the calendar below */}
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
                  className={`flex w-full items-center justify-between gap-1 rounded-lg border py-2.5 pl-3 pr-8 text-left text-sm font-medium transition-all duration-200 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 lg:py-1.5 lg:pl-2 lg:pr-6 lg:text-xs ${
                    openDropdown === "month"
                      ? "border-red-500 bg-[#ffffff] ring-2 ring-red-500/20 dark:bg-[#171717]"
                      : "border-gray-300 bg-[#ffffff] text-gray-900 hover:border-red-400 dark:border-neutral-600 dark:bg-[#262626] dark:text-white dark:hover:border-neutral-500"
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
                    className="absolute left-0 right-0 z-[60] mt-1 max-h-[200px] overflow-y-auto overflow-x-hidden rounded-lg border border-gray-300 bg-[#ffffff] py-1 shadow-lg dark:border-neutral-600 dark:bg-[#171717] overscroll-contain scroll-smooth touch-pan-y"
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
                        }}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left transition-colors duration-150 lg:px-2 lg:py-1.5 lg:text-xs ${
                          getMonth(viewDate) === i
                            ? "bg-red-50 font-medium text-red-700 dark:bg-[#3f1515] dark:text-red-300"
                            : "text-gray-900 hover:bg-red-50 dark:text-white dark:hover:bg-[#2a1818]"
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
                  className={`flex w-full items-center justify-between gap-1 rounded-lg border py-2.5 pl-3 pr-8 text-left text-sm font-medium transition-all duration-200 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 lg:py-1.5 lg:pl-2 lg:pr-6 lg:text-xs ${
                    openDropdown === "year"
                      ? "border-red-500 bg-[#ffffff] ring-2 ring-red-500/20 dark:bg-[#171717]"
                      : "border-gray-300 bg-[#ffffff] text-gray-900 hover:border-red-400 dark:border-neutral-600 dark:bg-[#262626] dark:text-white dark:hover:border-neutral-500"
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
                    className="absolute left-0 right-0 z-[60] mt-1 max-h-[200px] overflow-y-auto overflow-x-hidden rounded-lg border border-gray-300 bg-[#ffffff] py-1 shadow-lg dark:border-neutral-600 dark:bg-[#171717] overscroll-contain scroll-smooth touch-pan-y"
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
                        }}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left transition-colors duration-150 lg:px-2 lg:py-1.5 lg:text-xs ${
                          getYear(viewDate) === y
                            ? "bg-red-50 font-medium text-red-700 dark:bg-[#3f1515] dark:text-red-300"
                            : "text-gray-900 hover:bg-red-50 dark:text-white dark:hover:bg-[#2a1818]"
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

          {/* Weekday headers */}
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
              const selected =
                !disabled &&
                highlightDayOfMonth !== null &&
                day === highlightDayOfMonth;

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
