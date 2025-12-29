"use client";

import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { startOfMonth, endOfMonth, eachDayOfInterval, format, isSameDay, addMonths, subMonths, isBefore, isAfter, startOfDay } from "date-fns";

interface DateRangeCalendarProps {
  startDate: Date | null;
  endDate: Date | null;
  onStartDateChange: (date: Date | null) => void;
  onEndDateChange: (date: Date | null) => void;
  minDate?: Date;
  maxDate?: Date;
  className?: string;
}

/**
 * Modern date range calendar component
 * Supports dual calendar view on desktop and single view on mobile
 * Inspired by Stripe's calendar design
 */
export default function DateRangeCalendar({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  minDate,
  maxDate,
  className = "",
}: DateRangeCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    return startDate || new Date();
  });

  const [secondMonth, setSecondMonth] = useState(() => {
    return addMonths(startDate || new Date(), 1);
  });

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  // Day names
  const dayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  // Generate calendar days for a given month
  const generateCalendarDays = (month: Date) => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

    // Get first day of week (0 = Sunday)
    const firstDayOfWeek = monthStart.getDay();

    // Create array with empty slots for days before month starts
    const days: (number | null)[] = Array(firstDayOfWeek).fill(null);
    days.push(...daysInMonth.map((day) => day.getDate()));

    return days;
  };

  const handleDateClick = (day: number, month: Date) => {
    const selectedDate = new Date(month.getFullYear(), month.getMonth(), day);
    const selectedDayStart = startOfDay(selectedDate);

    // Check if date is within allowed range
    if (minDate && isBefore(selectedDayStart, startOfDay(minDate))) return;
    if (maxDate && isAfter(selectedDayStart, startOfDay(maxDate))) return;

    // If no start date, or if clicking before start date, set as start
    if (!startDate || (endDate && isBefore(selectedDayStart, startOfDay(startDate)))) {
      onStartDateChange(selectedDayStart);
      onEndDateChange(null);
    } else if (!endDate) {
      // If start date exists but no end date, set as end
      if (isAfter(selectedDayStart, startOfDay(startDate)) || isSameDay(selectedDayStart, startDate)) {
        onEndDateChange(selectedDayStart);
      } else {
        // If clicking before start date, reset start
        onStartDateChange(selectedDayStart);
        onEndDateChange(null);
      }
    } else {
      // Both dates exist, reset and set new start
      onStartDateChange(selectedDayStart);
      onEndDateChange(null);
    }
  };

  const isDateInRange = (day: number, month: Date) => {
    if (!startDate) return false;
    const date = new Date(month.getFullYear(), month.getMonth(), day);
    const dateStart = startOfDay(date);

    if (endDate) {
      return (
        (isAfter(dateStart, startOfDay(startDate)) || isSameDay(dateStart, startDate)) &&
        (isBefore(dateStart, startOfDay(endDate)) || isSameDay(dateStart, endDate))
      );
    }
    return isSameDay(dateStart, startDate);
  };

  const isDateSelected = (day: number, month: Date) => {
    if (!day) return false;
    const date = new Date(month.getFullYear(), month.getMonth(), day);
    const dateStart = startOfDay(date);

    if (startDate && isSameDay(dateStart, startDate)) return true;
    if (endDate && isSameDay(dateStart, endDate)) return true;
    return false;
  };

  const isDateDisabled = (day: number, month: Date) => {
    if (!day) return true;
    const date = new Date(month.getFullYear(), month.getMonth(), day);
    const dateStart = startOfDay(date);

    if (minDate && isBefore(dateStart, startOfDay(minDate))) return true;
    if (maxDate && isAfter(dateStart, startOfDay(maxDate))) return true;
    return false;
  };

  const renderCalendar = (month: Date, onMonthChange: (newMonth: Date) => void) => {
    const days = generateCalendarDays(month);
    const monthName = format(month, "MMMM yyyy");

    return (
      <div className="w-full">
        {/* Month Header */}
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() => onMonthChange(subMonths(month, 1))}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>

          <h3 className="text-base font-semibold text-gray-900">{monthName}</h3>

          <button
            type="button"
            onClick={() => onMonthChange(addMonths(month, 1))}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* Day Headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {dayNames.map((day) => (
            <div key={day} className="text-center text-xs font-medium text-gray-500 py-2">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, index) => {
            if (day === null) {
              return <div key={`empty-${index}`} className="h-8 sm:h-10" />;
            }

            const isSelected = isDateSelected(day, month);
            const isInRange = isDateInRange(day, month);
            const isDisabled = isDateDisabled(day, month);
            const isToday = isSameDay(new Date(month.getFullYear(), month.getMonth(), day), new Date());

            let dayClassName = "h-8 sm:h-10 w-full text-sm rounded-lg transition-all duration-200 flex items-center justify-center ";

            if (isDisabled) {
              dayClassName += "text-gray-300 cursor-not-allowed bg-gray-50";
            } else if (isSelected) {
              dayClassName += "bg-red-600 text-white font-bold shadow-md hover:bg-red-700";
            } else if (isInRange) {
              dayClassName += "bg-red-100 text-red-700 font-medium hover:bg-red-200";
            } else if (isToday) {
              dayClassName += "bg-gray-100 text-gray-900 font-medium hover:bg-gray-200 border-2 border-gray-300";
            } else {
              dayClassName += "text-gray-700 hover:bg-gray-100";
            }

            return (
              <button
                key={`${month.getFullYear()}-${month.getMonth()}-${day}`}
                type="button"
                onClick={() => !isDisabled && handleDateClick(day, month)}
                disabled={isDisabled}
                className={dayClassName}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className={`${className}`}>
      {isMobile ? (
        // Single calendar view on mobile
        <div className="w-full">{renderCalendar(currentMonth, setCurrentMonth)}</div>
      ) : (
        // Dual calendar view on desktop
        <div className="flex gap-6 w-full">
          <div className="flex-1">{renderCalendar(currentMonth, setCurrentMonth)}</div>
          <div className="flex-1">{renderCalendar(secondMonth, setSecondMonth)}</div>
        </div>
      )}
    </div>
  );
}

