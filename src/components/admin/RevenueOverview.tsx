"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { TrendingUp, TrendingDown, DollarSign, ChevronLeft, ChevronRight } from "lucide-react";
import { ChartData, useRevenueBreakdown } from "@/hooks/queries/useAdminQueries";
import { formatInTimeZone } from "date-fns-tz";
import { subMonths, addMonths } from "date-fns";
import { createAESTDateAsUTC, getWebsiteLaunchDateUTC } from "@/utils/common/timezone";

// Component now manages its own data fetching
// No props needed

type Period = "days" | "months" | "years" | "major-draws";

const AEST_TIMEZONE = "Australia/Sydney";

/**
 * Revenue Overview Component
 * Displays revenue breakdown with Days/Months/Years toggle
 * Shows 3 separate vertical bars per period: One-Time, Memberships, Mini-Draw
 * Days view has month navigation with left/right selectors
 */
export default function RevenueOverview() {
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("months");
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date()); // For days view month navigation
  const [selectedYear, setSelectedYear] = useState<Date>(new Date()); // For months view year navigation
  const [hoveredBar, setHoveredBar] = useState<string | null>(null);
  const [clickedBar, setClickedBar] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const [tooltipData, setTooltipData] = useState<ChartData | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartAreaRef = useRef<HTMLDivElement>(null);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Calculate date range for days period with launch date cap
  const daysDateRange = useMemo(() => {
    if (selectedPeriod !== "days") {
      return { startDate: undefined, endDate: undefined };
    }

    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth() + 1; // getMonth() returns 0-11
    
    // Calculate month start (first day of selected month)
    const monthStart = createAESTDateAsUTC(year, month, 1, 0, 0);
    
    // Calculate month end (last day of selected month)
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextMonthYear = month === 12 ? year + 1 : year;
    const nextMonthStart = createAESTDateAsUTC(nextMonthYear, nextMonth, 1, 0, 0);
    const monthEnd = new Date(nextMonthStart.getTime() - 1);
    
    // Get launch date
    const launchDate = getWebsiteLaunchDateUTC();
    
    // Cap start date at launch date (if month starts before launch)
    const startDate = monthStart < launchDate ? launchDate : monthStart;
    
    // Cap end date at today (if month extends into future)
    const today = new Date();
    const endDate = monthEnd > today ? today : monthEnd;
    
    // Only return dates if startDate <= endDate (valid range)
    if (startDate > endDate) {
      return { startDate: undefined, endDate: undefined };
    }
    
    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };
  }, [selectedPeriod, selectedMonth]);

  // Fetch revenue data based on selected period with date range for days
  const { data: revenueData, isLoading, error } = useRevenueBreakdown(
    selectedPeriod,
    daysDateRange.startDate,
    daysDateRange.endDate
  );

  // Fetch ALL-TIME totals separately (for summary cards)
  const { data: allTimeRevenueData } = useRevenueBreakdown("years");

  const allChartData: ChartData[] = useMemo(() => revenueData?.chartData || [], [revenueData?.chartData]);

  // Filter chart data based on selected period and date
  const chartData: ChartData[] = useMemo(() => {
    if (selectedPeriod === "days") {
      // Filter days for the selected month - FIX: Use AEST timezone
      const selectedYear = selectedMonth.getFullYear();
      const selectedMonthNum = selectedMonth.getMonth() + 1; // getMonth() returns 0-11, we need 1-12
      
      return allChartData.filter((data) => {
        if (!data.dateKey) {
          // Fallback: try to parse date label
          try {
            const dataDate = new Date(data.date);
            if (!isNaN(dataDate.getTime())) {
              // Convert to AEST month/year for comparison
              const dataYear = parseInt(formatInTimeZone(dataDate, AEST_TIMEZONE, "yyyy"), 10);
              const dataMonth = parseInt(formatInTimeZone(dataDate, AEST_TIMEZONE, "M"), 10);
              return dataYear === selectedYear && dataMonth === selectedMonthNum;
            }
          } catch {
            // If parsing fails, try string matching
            const monthStartAEST = createAESTDateAsUTC(selectedYear, selectedMonthNum, 1, 0, 0);
            const monthName = formatInTimeZone(monthStartAEST, AEST_TIMEZONE, "MMM");
            return data.date.startsWith(monthName);
          }
          return false;
        }

        // Use dateKey for accurate filtering - compare in AEST
        const dataDate = new Date(data.dateKey);
        const dataYear = parseInt(formatInTimeZone(dataDate, AEST_TIMEZONE, "yyyy"), 10);
        const dataMonth = parseInt(formatInTimeZone(dataDate, AEST_TIMEZONE, "M"), 10);
        return dataYear === selectedYear && dataMonth === selectedMonthNum;
      });
    } else if (selectedPeriod === "months") {
      // Filter months for the selected year - FIX: Use AEST timezone
      const selectedYearNum = selectedYear.getFullYear();

      return allChartData.filter((data) => {
        if (!data.dateKey) {
          try {
            const dataDate = new Date(data.date);
            if (!isNaN(dataDate.getTime())) {
              // Convert to AEST year for comparison
              const dataYear = parseInt(formatInTimeZone(dataDate, AEST_TIMEZONE, "yyyy"), 10);
              return dataYear === selectedYearNum;
            }
          } catch {
            const yearStr = selectedYearNum.toString();
            return data.date.includes(yearStr);
          }
          return false;
        }

        // Use dateKey for accurate filtering - compare in AEST
        const dataDate = new Date(data.dateKey);
        const dataYear = parseInt(formatInTimeZone(dataDate, AEST_TIMEZONE, "yyyy"), 10);
        return dataYear === selectedYearNum;
      });
    } else if (selectedPeriod === "major-draws") {
      // Major draws view - show all data (no filtering needed)
      return allChartData;
    } else {
      // Years view - show all data
      return allChartData;
    }
  }, [allChartData, selectedPeriod, selectedMonth, selectedYear]);

  // FIX: Use all-time totals for summary cards (not filtered by period)
  const totals = useMemo(
    () => allTimeRevenueData?.totals || { total: 0, oneTime: 0, memberships: 0, miniDraw: 0 },
    [allTimeRevenueData?.totals]
  );
  const growthRate = revenueData?.growthRate || 0; // Keep growth rate from filtered data

  // Navigate to previous/next month for days view
  const navigateMonth = (direction: "prev" | "next") => {
    if (direction === "prev") {
      setSelectedMonth((prev) => subMonths(prev, 1));
    } else {
      setSelectedMonth((prev) => addMonths(prev, 1));
    }
    setHoveredBar(null);
    setClickedBar(null);
  };

  // Navigate to previous/next year for months view
  const navigateYear = (direction: "prev" | "next") => {
    if (direction === "prev") {
      setSelectedYear((prev) => {
        const newYear = new Date(prev);
        newYear.setFullYear(newYear.getFullYear() - 1);
        return newYear;
      });
    } else {
      setSelectedYear((prev) => {
        const newYear = new Date(prev);
        newYear.setFullYear(newYear.getFullYear() + 1);
        return newYear;
      });
    }
    setHoveredBar(null);
    setClickedBar(null);
  };

  // Reset date selection when period changes
  useEffect(() => {
    if (selectedPeriod === "days") {
      setSelectedMonth(new Date());
    } else if (selectedPeriod === "months") {
      setSelectedYear(new Date());
    }
    setHoveredBar(null);
    setClickedBar(null);
  }, [selectedPeriod]);

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Calculate max value for chart scaling
  const maxValue = useMemo(() => {
    if (chartData.length === 0) return 1;
    return Math.max(...chartData.map((d) => Math.max(d.oneTime, d.memberships, d.miniDraw, d.total)));
  }, [chartData]);

  // Format date label based on period
  const formatDateLabel = (data: ChartData, period: Period): string => {
    // For major-draws, return the draw name directly (stored in data.date)
    if (period === "major-draws") {
      return data.date;
    }
    
    try {
      // Use dateKey if available (ISO string), otherwise try to parse date label
      const date = data.dateKey ? new Date(data.dateKey) : new Date(data.date);
      if (isNaN(date.getTime())) {
        // If parsing fails, return the original date string
        return data.date;
      }

      if (period === "days") {
        // Show just the day number (1, 2, 3, etc.)
        return formatInTimeZone(date, AEST_TIMEZONE, "d");
      } else if (period === "months") {
        // Show just month name (Jan, Feb, Mar, etc.)
        return formatInTimeZone(date, AEST_TIMEZONE, "MMM");
      } else {
        // Show just year (2025, 2026, etc.)
        return formatInTimeZone(date, AEST_TIMEZONE, "yyyy");
      }
    } catch {
      return data.date;
    }
  };

  // Get current month/year display for days view
  const currentMonthDisplay = useMemo(() => {
    if (selectedPeriod !== "days") return null;
    return formatInTimeZone(selectedMonth, AEST_TIMEZONE, "MMMM yyyy");
  }, [selectedPeriod, selectedMonth]);

  // Get current year display for months view
  const currentYearDisplay = useMemo(() => {
    if (selectedPeriod !== "months") return null;
    return selectedYear.getFullYear().toString();
  }, [selectedPeriod, selectedYear]);

  if (isLoading) {
    return (
      <div
        className="relative rounded-xl p-3 sm:p-4 border border-slate-700/30 shadow-[0_0_15px_rgba(0,0,0,0.4)]"
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
        }}
      >
        <div className="animate-pulse">
          <div className="h-6 bg-slate-700/50 rounded w-1/3 mb-4"></div>
          <div className="h-64 bg-slate-700/50 rounded mb-4"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="relative rounded-xl p-3 sm:p-4 border border-red-500/30 shadow-[0_0_15px_rgba(0,0,0,0.4)]"
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
        }}
      >
        <div className="text-center">
          <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <DollarSign className="w-6 h-6 text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Revenue Data Unavailable</h3>
          <p className="text-sm text-slate-400">Unable to load revenue data at this time.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Chart Container - Matching VerticalAccumulationChart design */}
      <div
        className="relative rounded-xl p-3 sm:p-4 border border-slate-700/30 shadow-[0_0_15px_rgba(0,0,0,0.4)]"
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
        }}
      >
        {/* Header with Toggle */}
        <div className="flex flex-row items-center justify-between gap-2 sm:gap-4 mb-6">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm sm:text-lg lg:text-xl font-bold text-white font-['Poppins'] truncate">
              Revenue Overview
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5 sm:mt-1 font-['Poppins'] hidden sm:block">
              Revenue breakdown by package type
            </p>
          </div>

          {/* Period Toggle - Matching MembershipPackagesChart style */}
          <div className="flex-shrink-0">
            <div className="bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800 rounded-none p-[4px] shadow-[0_0_15px_rgba(0,0,0,0.4)] border border-slate-600/30">
              <div className="flex items-center gap-1 sm:gap-2">
                {(["days", "months", "years", "major-draws"] as Period[]).map((period) => (
                <button
                  key={period}
                  onClick={() => setSelectedPeriod(period)}
                    className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-none text-[10px] sm:text-[12px] font-bold transition-all duration-300 whitespace-nowrap focus:outline-none font-['Poppins'] ${
                      selectedPeriod === period
                        ? "bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-black shadow-[0_0_10px_rgba(251,191,36,0.5)]"
                        : "text-slate-300 hover:text-white hover:bg-slate-700/50"
                  }`}
                >
                    <span className="capitalize">{period === "major-draws" ? "Major Draws" : period}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
          {/* Total Revenue */}
          <div className="bg-gradient-to-br from-emerald-500/20 to-green-600/20 rounded-xl p-3 sm:p-4 border border-emerald-500/30 relative">
            <div className="text-lg sm:text-xl font-bold text-white font-['Poppins']">
              {formatCurrency(totals.total)}
              </div>
            <div className="flex items-center justify-between mt-1">
              <div className="text-xs text-slate-400 font-['Poppins']">Total Revenue</div>
              <div
                className={`flex items-center gap-1 text-xs font-medium font-['Poppins'] flex-shrink-0 ml-2 ${
                  growthRate >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {growthRate >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {Math.abs(growthRate)}%
              </div>
            </div>
          </div>

          {/* One-Time Revenue */}
          <div className="bg-gradient-to-br from-blue-500/20 to-indigo-600/20 rounded-xl p-3 sm:p-4 border border-blue-500/30">
            <div className="text-lg sm:text-xl font-bold text-white font-['Poppins']">
              {formatCurrency(totals.oneTime)}
            </div>
            <div className="text-xs text-slate-400 font-['Poppins']">One-Time</div>
          </div>

          {/* Memberships Revenue */}
          <div className="bg-gradient-to-br from-orange-500/20 to-amber-600/20 rounded-xl p-3 sm:p-4 border border-orange-500/30">
            <div className="text-lg sm:text-xl font-bold text-white font-['Poppins']">
              {formatCurrency(totals.memberships)}
            </div>
            <div className="text-xs text-slate-400 font-['Poppins']">Memberships</div>
          </div>

          {/* Mini-Draw Revenue */}
          <div className="bg-gradient-to-br from-green-500/20 to-emerald-600/20 rounded-xl p-3 sm:p-4 border border-green-500/30">
            <div className="text-lg sm:text-xl font-bold text-white font-['Poppins']">
              {formatCurrency(totals.miniDraw)}
            </div>
            <div className="text-xs text-slate-400 font-['Poppins']">Mini-Draw</div>
          </div>
        </div>

        {/* Month Display for Days View */}
        {selectedPeriod === "days" && currentMonthDisplay && (
          <div className="flex items-center justify-center gap-3 mb-4">
            <button
              onClick={() => navigateMonth("prev")}
              className="w-8 h-8 sm:w-10 sm:h-10 bg-slate-700/50 hover:bg-slate-700 rounded-lg flex items-center justify-center text-white transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <h4 className="text-base sm:text-lg font-bold text-white font-['Poppins'] min-w-[120px] sm:min-w-[150px] text-center">
              {currentMonthDisplay}
            </h4>
            <button
              onClick={() => navigateMonth("next")}
              className="w-8 h-8 sm:w-10 sm:h-10 bg-slate-700/50 hover:bg-slate-700 rounded-lg flex items-center justify-center text-white transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        )}

        {/* Year Display for Months View */}
        {selectedPeriod === "months" && currentYearDisplay && (
          <div className="flex items-center justify-center gap-3 mb-4">
            <button
              onClick={() => navigateYear("prev")}
              className="w-8 h-8 sm:w-10 sm:h-10 bg-slate-700/50 hover:bg-slate-700 rounded-lg flex items-center justify-center text-white transition-colors"
              aria-label="Previous year"
            >
              <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <h4 className="text-base sm:text-lg font-bold text-white font-['Poppins'] min-w-[80px] sm:min-w-[100px] text-center">
              {currentYearDisplay}
            </h4>
            <button
              onClick={() => navigateYear("next")}
              className="w-8 h-8 sm:w-10 sm:h-10 bg-slate-700/50 hover:bg-slate-700 rounded-lg flex items-center justify-center text-white transition-colors"
              aria-label="Next year"
            >
              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            </div>
        )}

        {/* Chart Area */}
        <div
          ref={chartAreaRef}
          className="relative"
          style={{ minHeight: "300px", paddingTop: "40px" }}
          onMouseLeave={() => {
            setHoveredBar(null);
            setTooltipPosition(null);
            setTooltipData(null);
          }}
        >
          {/* Y-Axis Labels */}
          <div className="absolute left-0 top-0 bottom-16 flex flex-col justify-between text-[8px] sm:text-[10px] text-slate-400 font-['Poppins'] pr-2 z-10 w-8 sm:w-10">
            <span>{formatCurrency(maxValue)}</span>
            <span>{formatCurrency(maxValue * 0.75)}</span>
            <span>{formatCurrency(maxValue * 0.5)}</span>
            <span>{formatCurrency(maxValue * 0.25)}</span>
            <span>$0</span>
            </div>

          {/* Y-Axis Line */}
          <div className="absolute left-8 sm:left-10 top-0 bottom-16 w-px bg-slate-600/20"></div>

          {/* Horizontal Grid Lines - extending from Y-axis labels across full width */}
          <div className="absolute left-8 sm:left-10 right-0 top-0 bottom-16">
            {/* Top line (100%) */}
            <div className="absolute top-0 left-0 right-0 h-px bg-slate-600/30"></div>
            {/* 75% line */}
            <div className="absolute top-[25%] left-0 right-0 h-px bg-slate-600/30"></div>
            {/* 50% line */}
            <div className="absolute top-[50%] left-0 right-0 h-px bg-slate-600/30"></div>
            {/* 25% line */}
            <div className="absolute top-[75%] left-0 right-0 h-px bg-slate-600/30"></div>
            {/* Bottom line (0%) */}
            <div className="absolute bottom-0 left-0 right-0 h-px bg-slate-600/30"></div>
          </div>

          {/* Chart Container */}
          <div
            ref={chartContainerRef}
            className="absolute left-8 sm:left-10 right-0 top-0 bottom-16 overflow-x-auto overflow-y-clip custom-scrollbar"
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: "#fbbf24 #1e293b",
            }}
          >
            <div className="flex items-end justify-start gap-4 sm:gap-5 lg:gap-6 h-full w-full min-w-max px-2 sm:px-4">
              {chartData.map((data, index) => {
                const barId = `${data.date}-${index}`;
                const _isHovered = hoveredBar === barId;
                const _isClicked = clickedBar === barId;

                // Calculate column and bar widths - maximized for desktop
                // Desktop gets much larger columns to fill available space

                // Increased minimum column width based on period and device
                const minColumnWidth = isMobile
                  ? selectedPeriod === "days"
                    ? "50px"
                    : selectedPeriod === "months"
                    ? "70px"
                    : selectedPeriod === "major-draws"
                    ? "100px"
                    : "100px"
                  : selectedPeriod === "days"
                  ? "80px"
                  : selectedPeriod === "months"
                  ? "120px"
                  : selectedPeriod === "major-draws"
                  ? "200px"
                  : "200px";

                const maxColumnWidth = isMobile
                  ? selectedPeriod === "days"
                    ? "60px"
                    : selectedPeriod === "months"
                    ? "90px"
                    : selectedPeriod === "major-draws"
                    ? "120px"
                    : "120px"
                  : selectedPeriod === "days"
                  ? "100px"
                  : selectedPeriod === "months"
                  ? "150px"
                  : selectedPeriod === "major-draws"
                  ? "250px"
                  : "250px";

                // Fixed column width for better consistency (not percentage-based)
                const columnWidth = minColumnWidth;

                // Increased bar width percentage (each bar takes more space within column)
                const barWidthPercent = isMobile ? 28 : 35; // Desktop bars are thicker
                const barMinWidth = isMobile ? "8px" : "14px"; // Desktop bars have larger minimum width

                return (
                  <div
                    key={index}
                    className="flex flex-col items-center h-full relative flex-shrink-0"
                    style={{
                      width: columnWidth,
                      minWidth: minColumnWidth,
                      maxWidth: maxColumnWidth,
                    }}
                  >
                    {/* Three Bars Container */}
                    <div
                      className="flex items-end justify-center gap-1.5 sm:gap-2 lg:gap-2.5 w-full flex-1 mb-10"
                      onMouseEnter={(e) => {
                        setHoveredBar(barId);
                        const rect = e.currentTarget.getBoundingClientRect();
                        const tooltipX = rect.left + rect.width / 2;
                        const tooltipY = rect.top - 10;
                        
                        // On mobile, adjust X position if near right edge
                        if (isMobile) {
                          const viewportWidth = window.innerWidth;
                          const tooltipWidth = 180; // Approximate tooltip width in pixels
                          
                          // If tooltip would extend beyond right edge, adjust position
                          if (tooltipX + tooltipWidth / 2 > viewportWidth - 10) {
                            // Position tooltip so it stays within viewport
                            const adjustedX = viewportWidth - tooltipWidth / 2 - 10;
                            setTooltipPosition({
                              x: adjustedX,
                              y: tooltipY,
                            });
                          } else {
                            setTooltipPosition({
                              x: tooltipX,
                              y: tooltipY,
                            });
                          }
                        } else {
                          setTooltipPosition({
                            x: tooltipX,
                            y: tooltipY,
                          });
                        }
                        setTooltipData(data);
                      }}
                      onMouseMove={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const tooltipX = rect.left + rect.width / 2;
                        const tooltipY = rect.top - 10;
                        
                        // On mobile, adjust X position if near right edge
                        if (isMobile) {
                          const viewportWidth = window.innerWidth;
                          const tooltipWidth = 180; // Approximate tooltip width in pixels
                          
                          // If tooltip would extend beyond right edge, adjust position
                          if (tooltipX + tooltipWidth / 2 > viewportWidth - 10) {
                            // Position tooltip so it stays within viewport
                            const adjustedX = viewportWidth - tooltipWidth / 2 - 10;
                            setTooltipPosition({
                              x: adjustedX,
                              y: tooltipY,
                            });
                          } else {
                            setTooltipPosition({
                              x: tooltipX,
                              y: tooltipY,
                            });
                          }
                        } else {
                          setTooltipPosition({
                            x: tooltipX,
                            y: tooltipY,
                          });
                        }
                      }}
                      onMouseLeave={() => {
                        setHoveredBar(null);
                        setTooltipPosition(null);
                        setTooltipData(null);
                      }}
                      onClick={() => setClickedBar(clickedBar === barId ? null : barId)}
                    >
                      {/* One-Time Bar */}
                    <div
                        className="flex flex-col items-center justify-end h-full cursor-pointer transition-opacity hover:opacity-90"
                        style={{ width: `${barWidthPercent}%`, minWidth: barMinWidth }}
                      >
                        <div
                          className="w-full bg-gradient-to-t from-blue-600 via-blue-500 to-cyan-600 rounded-t relative border border-blue-500/50"
                      style={{
                            height: `${maxValue > 0 ? Math.min((data.oneTime / maxValue) * 100, 100) : 0}%`,
                            minHeight: data.oneTime > 0 ? "3px" : "0px",
                            maxHeight: "100%",
                      }}
                    >
                        </div>
                      </div>

                      {/* Memberships Bar */}
                      <div
                        className="flex flex-col items-center justify-end h-full cursor-pointer transition-opacity hover:opacity-90"
                        style={{ width: `${barWidthPercent}%`, minWidth: barMinWidth }}
                      >
                        <div
                          className="w-full bg-gradient-to-t from-orange-500 via-amber-500 to-yellow-500 rounded-t relative border border-orange-500/50"
                          style={{
                            height: `${maxValue > 0 ? Math.min((data.memberships / maxValue) * 100, 100) : 0}%`,
                            minHeight: data.memberships > 0 ? "3px" : "0px",
                            maxHeight: "100%",
                          }}
                        >
                      </div>
                    </div>

                      {/* Mini-Draw Bar */}
                    <div
                        className="flex flex-col items-center justify-end h-full cursor-pointer transition-opacity hover:opacity-90"
                        style={{ width: `${barWidthPercent}%`, minWidth: barMinWidth }}
                      >
                        <div
                          className="w-full bg-gradient-to-t from-green-500 via-emerald-500 to-green-600 rounded-t relative border border-green-500/50"
                      style={{
                            height: `${maxValue > 0 ? Math.min((data.miniDraw / maxValue) * 100, 100) : 0}%`,
                            minHeight: data.miniDraw > 0 ? "3px" : "0px",
                            maxHeight: "100%",
                      }}
                    >
                        </div>
                      </div>
                    </div>

                    {/* Period Label - Under the bars (simplified) */}
                    <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 text-xs sm:text-sm font-semibold text-white font-['Poppins'] whitespace-nowrap text-center w-full">
                      {formatDateLabel(data, selectedPeriod)}
                  </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tooltip - Positioned outside overflow container */}
          {tooltipPosition && tooltipData && (
            <div
              className={`${isMobile ? "absolute" : "fixed"} z-50 pointer-events-none`}
              style={
                isMobile
                  ? {
                      left: chartAreaRef.current
                        ? (() => {
                            const chartRect = chartAreaRef.current!.getBoundingClientRect();
                            const viewportWidth = window.innerWidth;
                            const tooltipWidth = 180;
                            const absoluteX = tooltipPosition.x;
                            
                            // Check if tooltip would overflow right edge
                            if (absoluteX + tooltipWidth / 2 > viewportWidth - 10) {
                              // Adjust to keep within viewport
                              const adjustedAbsoluteX = viewportWidth - tooltipWidth / 2 - 10;
                              return `${adjustedAbsoluteX - chartRect.left}px`;
                            }
                            
                            return `${tooltipPosition.x - chartRect.left}px`;
                          })()
                        : `${tooltipPosition.x}px`,
                      top: chartAreaRef.current
                        ? `${tooltipPosition.y - chartAreaRef.current.getBoundingClientRect().top - 5}px`
                        : `${tooltipPosition.y - 5}px`,
                      transform: "translate(-50%, -100%)",
                      maxWidth: "90vw",
                    }
                  : {
                      left: `${tooltipPosition.x}px`,
                      top: `${tooltipPosition.y}px`,
                      transform: "translate(-50%, -100%)",
                      maxWidth: "90vw",
                    }
              }
            >
              <div className="bg-slate-900/95 border border-slate-700 rounded-lg shadow-xl p-2 sm:p-3 min-w-[140px] sm:min-w-[180px] backdrop-blur-sm">
                <div className="text-xs sm:text-sm font-bold text-white font-['Poppins'] mb-2 border-b border-slate-700 pb-1">
                  {formatDateLabel(tooltipData, selectedPeriod)}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded bg-gradient-to-t from-blue-600 via-blue-500 to-cyan-600"></div>
                      <span className="text-[10px] sm:text-xs text-slate-300 font-['Poppins']">One-Time:</span>
                    </div>
                    <span className="text-[10px] sm:text-xs font-bold text-white font-['Poppins']">
                      {formatCurrency(tooltipData.oneTime)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded bg-gradient-to-t from-orange-500 via-amber-500 to-yellow-500"></div>
                      <span className="text-[10px] sm:text-xs text-slate-300 font-['Poppins']">Memberships:</span>
                    </div>
                    <span className="text-[10px] sm:text-xs font-bold text-white font-['Poppins']">
                      {formatCurrency(tooltipData.memberships)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded bg-gradient-to-t from-green-500 via-emerald-500 to-green-600"></div>
                      <span className="text-[10px] sm:text-xs text-slate-300 font-['Poppins']">Mini-Draw:</span>
                    </div>
                    <span className="text-[10px] sm:text-xs font-bold text-white font-['Poppins']">
                      {formatCurrency(tooltipData.miniDraw)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 pt-1 mt-1 border-t border-slate-700">
                    <span className="text-[10px] sm:text-xs font-semibold text-slate-200 font-['Poppins']">Total:</span>
                    <span className="text-[10px] sm:text-xs font-bold text-yellow-400 font-['Poppins']">
                      {formatCurrency(tooltipData.total)}
                    </span>
                  </div>
                </div>
              </div>
              {/* Tooltip arrow */}
              <div
                className="absolute left-1/2 top-full -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-700"
                style={{ marginTop: "-1px" }}
              ></div>
            </div>
          )}
                      </div>

        {/* Legend */}
        <div className="pt-4 border-t border-slate-600/20">
          <div className="flex items-center justify-center gap-4 sm:gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 sm:w-4 sm:h-4 rounded bg-gradient-to-t from-blue-600 via-blue-500 to-cyan-600"></div>
              <span className="text-[10px] sm:text-[12px] font-semibold text-slate-300 font-['Poppins']">
                <span className="sm:hidden">One-Time</span>
                <span className="hidden sm:inline">One-Time Packages</span>
              </span>
                      </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 sm:w-4 sm:h-4 rounded bg-gradient-to-t from-orange-500 via-amber-500 to-yellow-500"></div>
              <span className="text-[10px] sm:text-[12px] font-semibold text-slate-300 font-['Poppins']">
                Memberships
              </span>
                      </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 sm:w-4 sm:h-4 rounded bg-gradient-to-t from-green-500 via-emerald-500 to-green-600"></div>
              <span className="text-[10px] sm:text-[12px] font-semibold text-slate-300 font-['Poppins']">
                <span className="sm:hidden">Mini-Draw</span>
                <span className="hidden sm:inline">Mini-Draw Packages</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
