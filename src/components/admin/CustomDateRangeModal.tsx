"use client";

import React, { useState, useEffect } from "react";
import ModalContainer from "@/components/modals/ui/ModalContainer";
import DateRangeCalendar from "./DateRangeCalendar";
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

  const handleMajorDrawSelect = (draw: MajorDrawForDateRange) => {
    if (draw.activationDate && draw.drawDate) {
      setStartDate(startOfDay(new Date(draw.activationDate)));
      setEndDate(startOfDay(new Date(draw.drawDate)));
    }
  };

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
  };

  const isValidRange = startDate && endDate && startDate <= endDate;

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="2xl" closeOnBackdrop={true}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Select Date Range</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Quick Select Buttons */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Quick Select</h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleQuickSelect(7)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Last 7 days
            </button>
            <button
              onClick={() => handleQuickSelect(30)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Last 30 days
            </button>
          </div>
        </div>

        {/* Major Draw Selection */}
        {majorDraws.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Major Draws</h3>
            <div className="flex flex-wrap gap-2">
              {majorDraws.map((draw) => (
                <button
                  key={draw._id}
                  onClick={() => handleMajorDrawSelect(draw)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {draw.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Calendar */}
        <div className="mb-6">
          <DateRangeCalendar
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            maxDate={new Date()}
            className="w-full"
          />
        </div>

        {/* Selected Dates Display */}
        {startDate && endDate && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Selected Range:</div>
            <div className="text-base font-semibold text-gray-900">
              {format(startDate, "MMM d, yyyy")} - {format(endDate, "MMM d, yyyy")}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={handleClear}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Clear
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!isValidRange}
            className="px-6 py-2 text-sm font-medium text-white bg-gradient-to-r from-red-600 to-red-700 rounded-lg hover:from-red-700 hover:to-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Apply
          </button>
        </div>
      </div>
    </ModalContainer>
  );
}

