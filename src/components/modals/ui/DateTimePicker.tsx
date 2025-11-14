"use client";

import React, { useState, useRef, useEffect } from "react";
import { AlertCircle, Calendar, Clock, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import {
  resolveLocalDisplayTimeZone,
  convertUTCToLocal,
  convertLocalToUTC,
  formatDateInLocal,
} from "@/utils/common/timezone";

interface DateTimePickerProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  label?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  type?: "date" | "datetime-local" | "time";
  placeholder?: string;
  className?: string;
  restrictedMonths?: Array<{ year: number; month: number; monthName: string }>;
  scheduledDraws?: Array<{ id: string; name: string; drawDate: string; status: string }>;
}

const DateTimePicker: React.FC<DateTimePickerProps> = ({
  id,
  name,
  value,
  onChange,
  label,
  required = false,
  error,
  disabled = false,
  type = "datetime-local",
  placeholder,
  className = "",
  restrictedMonths = [],
  scheduledDraws = [],
}) => {
  const localTimeZone = resolveLocalDisplayTimeZone();

  const [isOpen, setIsOpen] = useState(false);
  const [selectedUtcDate, setSelectedUtcDate] = useState<Date | null>(null);
  const [viewDate, setViewDate] = useState<Date>(() => new Date());
  const [timeValue, setTimeValue] = useState({ hours: "8", minutes: "30", period: "PM" });
  const containerRef = useRef<HTMLDivElement>(null);
  const isInternalUpdate = useRef(false);

  // Sync internal state with external value changes
  useEffect(() => {
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }

    if (!value) {
      setSelectedUtcDate(null);
      return;
    }

    const parsedUtc = new Date(value);
    if (Number.isNaN(parsedUtc.getTime())) {
      setSelectedUtcDate(null);
      return;
    }

    setSelectedUtcDate(parsedUtc);

    const localDate = convertUTCToLocal(parsedUtc, localTimeZone);
    setViewDate(localDate);
    setTimeValue({
      hours: (localDate.getHours() % 12 || 12).toString(),
      minutes: localDate.getMinutes().toString().padStart(2, "0"),
      period: localDate.getHours() >= 12 ? "PM" : "AM",
    });
  }, [value, localTimeZone]);

  // Validate and fix timeValue if it becomes invalid
  useEffect(() => {
    const hoursValue = parseInt(timeValue.hours);
    const minutesValue = parseInt(timeValue.minutes);

    // If time values are invalid, reset to default
    if (
      isNaN(hoursValue) ||
      isNaN(minutesValue) ||
      hoursValue < 1 ||
      hoursValue > 12 ||
      minutesValue < 0 ||
      minutesValue > 59
    ) {
      setTimeValue({
        hours: "8",
        minutes: "30",
        period: "PM",
      });
    }
  }, [timeValue.hours, timeValue.minutes]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const getIcon = () => {
    switch (type) {
      case "time":
        return Clock;
      default:
        return Calendar;
    }
  };

  const getPlaceholder = () => {
    if (placeholder) return placeholder;
    switch (type) {
      case "date":
        return "Select date";
      case "time":
        return "Select time";
      case "datetime-local":
        return "Select date and time";
      default:
        return "Select date/time";
    }
  };

  const formatDisplayValue = () => {
    if (!selectedUtcDate) return "";

    const localDate = convertUTCToLocal(selectedUtcDate, localTimeZone);
    switch (type) {
      case "date": {
        return localDate.toLocaleDateString("en-AU");
      }
      case "time": {
        const hours = localDate.getHours();
        const minutes = localDate.getMinutes();
        return `${hours % 12 || 12}:${minutes.toString().padStart(2, "0")}${hours >= 12 ? "PM" : "AM"}`;
      }
      case "datetime-local": {
        const dateStr = localDate.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
        const timeStr = `${localDate.getHours() % 12 || 12}:${localDate.getMinutes().toString().padStart(2, "0")}${
          localDate.getHours() >= 12 ? "PM" : "AM"
        }`;
        return `${dateStr} - ${timeStr}`;
      }
      default:
        return formatDateInLocal(selectedUtcDate, "Pp", localTimeZone);
    }
  };
  const Icon = getIcon();

  const getTimeValueAs24Hour = (time = timeValue) => {
    const hoursValue = parseInt(time.hours, 10);
    const minutesValue = parseInt(time.minutes, 10);

    if (Number.isNaN(hoursValue) || Number.isNaN(minutesValue)) {
      // Default back to 8:30 PM if parsing fails.
      return { hours: 20, minutes: 30 };
    }

    let hours24 = hoursValue % 12;
    if (time.period === "PM" && hoursValue !== 12) {
      hours24 += 12;
    } else if (time.period === "AM" && hoursValue === 12) {
      hours24 = 0;
    }

    return { hours: hours24, minutes: Math.min(Math.max(minutesValue, 0), 59) };
  };

  const commitDateChange = (localDate: Date) => {
    const utcDate = convertLocalToUTC(localDate, localTimeZone);
    setSelectedUtcDate(utcDate);
    setViewDate(localDate);

    const syntheticEvent = {
      target: { name: name || "", value: utcDate.toISOString() },
    } as React.ChangeEvent<HTMLInputElement>;

    isInternalUpdate.current = true;
    onChange(syntheticEvent);
  };

  // Calendar helper functions
  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const generateCalendarDays = () => {
    const daysInMonth = getDaysInMonth(viewDate);
    const firstDay = getFirstDayOfMonth(viewDate);
    const days = [];

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }

    return days;
  };

  const handleDateSelect = (day: number) => {
    // Check if the month is restricted
    if (isMonthRestricted(viewDate.getFullYear(), viewDate.getMonth())) {
      return; // Don't allow date selection in restricted months
    }

    const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);

    // Check if the date is in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to start of day for comparison
    if (newDate < today) {
      return; // Don't allow selection of past dates
    }

    if (type === "datetime-local") {
      const { hours, minutes } = getTimeValueAs24Hour();
      newDate.setHours(hours, minutes, 0, 0);
      commitDateChange(newDate);
      return;
    }

    // Handle date-only selection (not datetime-local)
    if (type === "date") {
      const localMidnight = new Date(newDate.getFullYear(), newDate.getMonth(), newDate.getDate(), 0, 0, 0, 0);
      const utcMidnight = convertLocalToUTC(localMidnight, localTimeZone);
      const isoString = utcMidnight.toISOString().split("T")[0];
      const syntheticEvent = {
        target: { name: name || "", value: isoString },
      } as React.ChangeEvent<HTMLInputElement>;

      isInternalUpdate.current = true;
      onChange(syntheticEvent);
      setIsOpen(false);
    }
  };

  const handleTimeChange = (field: "hours" | "minutes", value: string) => {
    const newTimeValue = { ...timeValue, [field]: value };
    setTimeValue(newTimeValue);

    // Only update the date if we have valid hours and minutes
    if (newTimeValue.hours && newTimeValue.minutes && newTimeValue.hours !== "" && newTimeValue.minutes !== "") {
      const { hours, minutes } = getTimeValueAs24Hour(newTimeValue);
      const baseDate = selectedUtcDate
        ? convertUTCToLocal(selectedUtcDate, localTimeZone)
        : new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate());

      baseDate.setHours(hours, minutes, 0, 0);
      commitDateChange(baseDate);
    }
  };

  const handlePeriodChange = (period: "AM" | "PM") => {
    const newTimeValue = { ...timeValue, period };
    setTimeValue(newTimeValue);

    // Only update the date if we have valid hours and minutes
    if (newTimeValue.hours && newTimeValue.minutes && newTimeValue.hours !== "" && newTimeValue.minutes !== "") {
      const { hours, minutes } = getTimeValueAs24Hour(newTimeValue);
      const baseDate = selectedUtcDate
        ? convertUTCToLocal(selectedUtcDate, localTimeZone)
        : new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate());

      baseDate.setHours(hours, minutes, 0, 0);
      commitDateChange(baseDate);
    }
  };

  const isMonthRestricted = (year: number, month: number) => {
    return restrictedMonths.some((restricted) => restricted.year === year && restricted.month === month);
  };

  const isDrawDate = (year: number, month: number, day: number) => {
    return scheduledDraws.some((draw) => {
      const drawDate = convertUTCToLocal(new Date(draw.drawDate), localTimeZone);
      return drawDate.getFullYear() === year && drawDate.getMonth() === month && drawDate.getDate() === day;
    });
  };

  const getDrawInfo = (year: number, month: number, day: number) => {
    return scheduledDraws.find((draw) => {
      const drawDate = convertUTCToLocal(new Date(draw.drawDate), localTimeZone);
      return drawDate.getFullYear() === year && drawDate.getMonth() === month && drawDate.getDate() === day;
    });
  };

  const isPastDate = (year: number, month: number, day: number) => {
    const date = new Date(year, month, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const navigateMonth = (direction: "prev" | "next") => {
    const newDate = new Date(viewDate);
    if (direction === "prev") {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }

    // Allow navigation to restricted months (they will be shown as disabled)
    setViewDate(newDate);
  };

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const localSelectedDate = selectedUtcDate ? convertUTCToLocal(selectedUtcDate, localTimeZone) : null;

  return (
    <div className={`space-y-2 ${className}`} ref={containerRef}>
      {/* Label */}
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      {/* Input Container */}
      <div className="relative">
        {/* Icon */}
        <Icon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none z-10" />

        {/* Display Button */}
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className={`w-full pl-10 pr-10 py-3 border rounded-lg text-left focus:ring-2 focus:ring-red-500/20 focus:border-red-500 focus:shadow-sm transition-all duration-200 ${
            error ? "border-red-500 bg-red-50" : isOpen ? "border-red-500 ring-2 ring-red-500/20" : "border-gray-300"
          } ${
            disabled
              ? "bg-gray-100 cursor-not-allowed text-gray-500"
              : "hover:border-red-400 hover:shadow-sm cursor-pointer bg-white"
          } ${isOpen ? "shadow-sm" : ""}`}
        >
          <span className={formatDisplayValue() ? "text-gray-900" : "text-gray-500"}>
            {formatDisplayValue() || getPlaceholder()}
          </span>
        </button>

        {/* Dropdown Arrow */}
        <ChevronDown
          className={`absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />

        {/* Custom Picker Dropdown */}
        {isOpen && !disabled && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg overflow-hidden">
            {/* Calendar Section */}
            {(type === "date" || type === "datetime-local") && (
              <div className="p-4">
                {/* Month Navigation */}
                <div className="flex items-center justify-between mb-4">
                  <button
                    type="button"
                    onClick={() => navigateMonth("prev")}
                    className="p-2 hover:bg-red-50 rounded-lg transition-colors duration-200"
                  >
                    <ChevronLeft className="w-4 h-4 text-gray-600" />
                  </button>

                  <div className="text-center">
                    <h3
                      className={`text-lg font-semibold ${
                        isMonthRestricted(viewDate.getFullYear(), viewDate.getMonth())
                          ? "text-red-600"
                          : "text-gray-900"
                      }`}
                    >
                      {monthNames[viewDate.getMonth()]} {viewDate.getFullYear()}
                    </h3>
                    {isMonthRestricted(viewDate.getFullYear(), viewDate.getMonth()) && (
                      <p className="text-xs text-red-500 mt-1">Draw already scheduled</p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => navigateMonth("next")}
                    className="p-2 hover:bg-red-50 rounded-lg transition-colors duration-200"
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
                  {generateCalendarDays().map((day, index) => {
                    if (day === null) {
                      return <div key={`empty-${index}`} className="h-8" />;
                    }

                    const isSelected =
                      localSelectedDate &&
                      localSelectedDate.getDate() === day &&
                      localSelectedDate.getMonth() === viewDate.getMonth() &&
                      localSelectedDate.getFullYear() === viewDate.getFullYear();

                    const isToday =
                      new Date().toDateString() ===
                      new Date(viewDate.getFullYear(), viewDate.getMonth(), day).toDateString();

                    const isCurrentMonthRestricted = isMonthRestricted(viewDate.getFullYear(), viewDate.getMonth());
                    const isCurrentDayDrawDate = isDrawDate(viewDate.getFullYear(), viewDate.getMonth(), day);
                    const isCurrentDayPast = isPastDate(viewDate.getFullYear(), viewDate.getMonth(), day);
                    const drawInfo = getDrawInfo(viewDate.getFullYear(), viewDate.getMonth(), day);

                    // Determine if the day should be disabled
                    const isDisabled = isCurrentMonthRestricted || isCurrentDayPast;

                    // Determine the styling based on priority: selected > draw date > today > past > restricted > normal
                    let dayClassName = "h-8 w-8 text-sm rounded-lg transition-all duration-200 ";
                    let dayTitle = "";

                    if (isSelected) {
                      dayClassName += "bg-red-600 text-white shadow-md font-bold";
                    } else if (isCurrentDayDrawDate) {
                      dayClassName += "bg-blue-500 text-white font-bold shadow-md";
                      dayTitle = `Draw: ${drawInfo?.name} (${drawInfo?.status})`;
                    } else if (isToday) {
                      dayClassName += "bg-red-100 text-red-600 font-medium";
                    } else if (isCurrentDayPast) {
                      dayClassName += "bg-gray-100 text-gray-400 cursor-not-allowed opacity-50";
                      dayTitle = "Past date - not selectable";
                    } else if (isCurrentMonthRestricted) {
                      dayClassName += "bg-red-100 text-red-400 cursor-not-allowed opacity-50";
                      dayTitle = "Draw already scheduled for this month";
                    } else {
                      dayClassName += "hover:bg-red-50 text-gray-700";
                    }

                    return (
                      <button
                        key={`${viewDate.getFullYear()}-${viewDate.getMonth()}-${day}`}
                        type="button"
                        onClick={() => handleDateSelect(day)}
                        disabled={isDisabled}
                        className={dayClassName}
                        title={dayTitle}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Time Section */}
            {(type === "time" || type === "datetime-local") && (
              <div className="border-t border-gray-200 p-4">
                <div className="text-center mb-4">
                  <div className="text-sm font-medium text-gray-700">Select Time</div>
                </div>

                {/* Editable Time Display */}
                <div className="flex items-center justify-center space-x-3">
                  {/* Hours Input */}
                  <div className="text-center">
                    <input
                      type="text"
                      value={timeValue.hours}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "");

                        // Allow any numeric input for manual editing
                        handleTimeChange("hours", val);
                      }}
                      onFocus={(e) => e.target.select()}
                      className="w-16 h-12 text-2xl font-mono font-bold text-center bg-white border-2 border-gray-200 rounded-lg focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all duration-200 hover:border-red-300"
                      placeholder="12"
                      maxLength={2}
                    />
                    <div className="text-xs text-gray-500 mt-1">Hours</div>
                  </div>

                  {/* Separator */}
                  <div className="flex items-center h-12">
                    <div className="text-3xl font-mono text-gray-400 font-bold">:</div>
                  </div>

                  {/* Minutes Input */}
                  <div className="text-center">
                    <input
                      type="text"
                      value={timeValue.minutes}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "");

                        // Allow any numeric input for manual editing
                        handleTimeChange("minutes", val);
                      }}
                      onFocus={(e) => e.target.select()}
                      className="w-16 h-12 text-2xl font-mono font-bold text-center bg-white border-2 border-gray-200 rounded-lg focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all duration-200 hover:border-red-300"
                      placeholder="00"
                      maxLength={2}
                    />
                    <div className="text-xs text-gray-500 mt-1">Minutes</div>
                  </div>

                  {/* AM/PM Toggle */}
                  <div className="text-center">
                    <div className="flex flex-col space-y-1">
                      {["AM", "PM"].map((period) => {
                        const isSelected = timeValue.period === period;
                        return (
                          <button
                            key={period}
                            type="button"
                            onClick={() => handlePeriodChange(period as "AM" | "PM")}
                            className={`px-3 py-1.5 text-xs rounded-md transition-all duration-200 font-medium ${
                              isSelected
                                ? "bg-red-600 text-white shadow-sm"
                                : "bg-gray-100 border border-gray-200 hover:bg-red-50 hover:border-red-300 text-gray-700"
                            }`}
                          >
                            {period}
                          </button>
                        );
                      })}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Period</div>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="border-t border-gray-200 p-3 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors duration-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors duration-200"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Hidden input for form compatibility */}
        <input type="hidden" id={id} name={name} value={value} />
      </div>

      {/* Helper Text */}
      {!error && type === "datetime-local" && (
        <p className="text-xs text-gray-500">Select both date and time for the event</p>
      )}

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

export default DateTimePicker;
