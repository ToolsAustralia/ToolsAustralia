"use client";

import React, { useState, useEffect } from "react";
import ModalContainer from "@/components/modals/ui/ModalContainer";
import DateRangeCalendar from "./DateRangeCalendar";
import Dropdown, { type DropdownOption } from "@/components/modals/ui/Dropdown";
import { format, subDays, startOfDay } from "date-fns";

export interface MajorDrawForDateRange {
  _id: string;
  name: string;
  activationDate: string;
  drawDate: string;
  status: string;
}

interface CustomDateRangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (startDate: string, endDate: string) => void;
  currentStartDate?: string;
  currentEndDate?: string;
  majorDraws?: MajorDrawForDateRange[];
}

/**
 * Custom date range modal with calendar picker
 * Includes quick select options and major draw integration
 */
export default function CustomDateRangeModal({
  isOpen,
  onClose,
  onApply,
  currentStartDate,
  currentEndDate,
  majorDraws = [],
}: CustomDateRangeModalProps) {
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [selectedMajorDraw, setSelectedMajorDraw] = useState<string>("");

  // Initialize dates from props
  useEffect(() => {
    if (currentStartDate) {
      setStartDate(new Date(currentStartDate));
    } else {
      setStartDate(null);
    }
    if (currentEndDate) {
      setEndDate(new Date(currentEndDate));
    } else {
      setEndDate(null);
    }
  }, [currentStartDate, currentEndDate, isOpen]);

  const handleQuickSelect = (days: number) => {
    const today = startOfDay(new Date());
    const pastDate = subDays(today, days - 1);
    setStartDate(pastDate);
    setEndDate(today);
  };

  const handleMajorDrawSelect = (drawId: string) => {
    const draw = majorDraws.find((d) => d._id === drawId);
    if (draw && draw.activationDate && draw.drawDate) {
      setStartDate(startOfDay(new Date(draw.activationDate)));
      setEndDate(startOfDay(new Date(draw.drawDate)));
      setSelectedMajorDraw(drawId);
    } else {
      setSelectedMajorDraw("");
    }
  };

  // Convert major draws to dropdown options
  const majorDrawOptions: DropdownOption[] = majorDraws.map((draw) => ({
    value: draw._id,
    label: draw.name,
  }));

  const handleApply = () => {
    if (startDate && endDate) {
      const startDateStr = format(startDate, "yyyy-MM-dd");
      const endDateStr = format(endDate, "yyyy-MM-dd");
      onApply(startDateStr, endDateStr);
      onClose();
    }
  };

  const handleClear = () => {
    setStartDate(null);
    setEndDate(null);
    setSelectedMajorDraw("");
  };

  const isValidRange = startDate && endDate && startDate <= endDate;

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="2xl" closeOnBackdrop={true}>
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-neutral-100">Select Date Range</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:text-neutral-400 dark:hover:text-neutral-300 transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Quick Select and Major Draws - Compact Row */}
        <div className="mb-4 sm:mb-6">
          <div className="flex flex-row gap-2 sm:gap-4 items-end">
            {/* Quick Select Buttons */}
            <div className="flex-shrink-0">
              <h3 className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-neutral-200 mb-2 sm:mb-3">Quick Select</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    handleQuickSelect(7);
                    setSelectedMajorDraw("");
                  }}
                  className="px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-700 dark:text-neutral-200 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  <span className="sm:hidden">7D</span>
                  <span className="hidden sm:inline">Last 7 days</span>
                </button>
                <button
                  onClick={() => {
                    handleQuickSelect(30);
                    setSelectedMajorDraw("");
                  }}
                  className="px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-800 dark:text-neutral-100 bg-white dark:bg-neutral-800 border border-gray-300 dark:border-neutral-600 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors whitespace-nowrap"
                >
                  <span className="sm:hidden">30D</span>
                  <span className="hidden sm:inline">Last 30 days</span>
                </button>
              </div>
            </div>

            {/* Major Draw Selection - Dropdown */}
            {majorDraws.length > 0 && (
              <div className="flex-1 min-w-0">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-700 dark:text-neutral-200 mb-2 sm:mb-3">Major Draws</h3>
                <Dropdown
                  options={majorDrawOptions}
                  value={selectedMajorDraw}
                  onChange={(value) => {
                    handleMajorDrawSelect(value);
                  }}
                  placeholder="Select a major draw"
                  compact={true}
                  className="w-full"
                />
              </div>
            )}
          </div>
        </div>

        {/* Calendar */}
        <div className="mb-4 sm:mb-6">
          <DateRangeCalendar
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={(date) => {
              setStartDate(date);
              setSelectedMajorDraw("");
            }}
            onEndDateChange={(date) => {
              setEndDate(date);
              setSelectedMajorDraw("");
            }}
            maxDate={new Date()}
            className="w-full"
          />
        </div>

        {/* Selected Dates Display */}
        {startDate && endDate && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gray-50 dark:bg-neutral-800/70 dark:border dark:border-neutral-700 rounded-lg">
            <div className="text-xs sm:text-sm text-gray-600 dark:text-neutral-400 mb-1">Selected Range:</div>
            <div className="text-sm sm:text-base font-semibold text-gray-900 dark:text-neutral-100">
              {format(startDate, "MMM d, yyyy")} - {format(endDate, "MMM d, yyyy")}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3">
          <div className="flex flex-row gap-2 sm:gap-3">
            <button
              onClick={handleClear}
              className="flex-1 sm:flex-none px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-gray-800 dark:text-neutral-100 bg-white dark:bg-neutral-800 border border-gray-300 dark:border-neutral-600 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors"
            >
              Clear
            </button>
            <button
              onClick={onClose}
              className="flex-1 sm:flex-none px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-gray-800 dark:text-neutral-100 bg-white dark:bg-neutral-800 border border-gray-300 dark:border-neutral-600 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors"
            >
              Cancel
            </button>
          </div>
          <button
            onClick={handleApply}
            disabled={!isValidRange}
            className="w-full sm:w-auto px-4 sm:px-6 py-2 text-xs sm:text-sm font-medium text-white bg-gradient-to-r from-red-600 to-red-700 rounded-lg hover:from-red-700 hover:to-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Apply
          </button>
        </div>
      </div>
    </ModalContainer>
  );
}

