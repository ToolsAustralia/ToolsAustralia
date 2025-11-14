"use client";

import { useState, useEffect } from "react";
// Image import removed - not used
import { useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";

export default function PromoBanner() {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  const [isScrolled, setIsScrolled] = useState(false);

  const { data: currentMajorDraw, isLoading } = useCurrentMajorDraw();

  // Update countdown timer
  useEffect(() => {
    if (!currentMajorDraw?.drawDate) return;

    const updateTimer = () => {
      const now = new Date().getTime();
      const endTime = new Date(currentMajorDraw.drawDate!).getTime();
      const difference = endTime - now;

      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((difference % (1000 * 60)) / 1000),
        });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);

    return () => clearInterval(timer);
  }, [currentMajorDraw]);

  // Handle scroll detection
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      // Trigger fixed position when user scrolls down 200px
      setIsScrolled(scrollY > 200);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (isLoading) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-gray-800 via-gray-900 to-black shadow-lg">
        <div className="h-12 sm:h-14 flex items-center justify-center">
          <div className="animate-pulse text-white text-sm">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${
        isScrolled ? "fixed top-2 left-4 right-4 rounded-full" : "absolute top-0 left-0 right-0"
      } z-50 bg-gradient-to-r from-gray-900 via-gray-800 to-black shadow-2xl border-b-2 border-red-500/50 transition-all duration-300`}
    >
      <div className="h-16 sm:h-20 flex items-center justify-center px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.1'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          ></div>
        </div>

        {/* Main Content */}
        <div className="relative z-10 flex items-center justify-between w-full">
          {/* Left Side - Alert Message with Enhanced Styling */}
          <div className="flex items-center gap-3">
            <div className="text-left">
              <div
                className={`text-white font-black font-['Poppins'] tracking-wide ${
                  isScrolled ? "text-xs sm:text-base lg:text-lg" : "text-sm sm:text-base lg:text-lg"
                }`}
              >
                LIVE NOW!
              </div>
              <div
                className={`text-yellow-300 font-bold font-['Poppins'] ${
                  isScrolled ? "text-[10px] sm:text-sm" : "text-xs sm:text-sm"
                }`}
              >
                Enter Before Deadline!
              </div>
            </div>
          </div>

          {/* Right Side - Enhanced Countdown */}
          <div className="flex items-center justify-center gap-1 sm:gap-2 lg:gap-3">
            {timeLeft.days > 0 && (
              <div
                className={`bg-gradient-to-br from-red-500 via-red-600 to-red-700 rounded-lg shadow-lg ring-2 ring-red-300/20 text-center ${
                  isScrolled
                    ? "px-1 py-0.5 w-8 sm:px-3 sm:py-2 sm:w-16 lg:w-18"
                    : "px-1.5 py-0.5 sm:px-3 sm:py-2 w-10 sm:w-16 lg:w-18"
                }`}
              >
                <div
                  className={`text-white font-black font-['Poppins'] drop-shadow-md ${
                    isScrolled ? "text-[10px] sm:text-sm lg:text-base" : "text-xs sm:text-sm lg:text-base"
                  }`}
                >
                  {timeLeft.days.toString().padStart(2, "0")}
                </div>
                <div
                  className={`text-red-100 font-medium ${
                    isScrolled ? "text-[8px] sm:text-[10px] lg:text-xs" : "text-[9px] sm:text-[10px] lg:text-xs"
                  }`}
                >
                  DAYS
                </div>
              </div>
            )}
            <div
              className={`bg-gradient-to-br from-red-500 via-red-600 to-red-700 rounded-lg shadow-lg ring-2 ring-red-300/20 text-center ${
                isScrolled
                  ? "px-1 py-0.5 w-8 sm:px-3 sm:py-2 sm:w-16 lg:w-18"
                  : "px-1.5 py-0.5 sm:px-3 sm:py-2 w-10 sm:w-16 lg:w-18"
              }`}
            >
              <div
                className={`text-white font-black font-['Poppins'] drop-shadow-md ${
                  isScrolled ? "text-[10px] sm:text-sm lg:text-base" : "text-xs sm:text-sm lg:text-base"
                }`}
              >
                {timeLeft.hours.toString().padStart(2, "0")}
              </div>
              <div
                className={`text-red-100 font-medium ${
                  isScrolled ? "text-[8px] sm:text-[10px] lg:text-xs" : "text-[9px] sm:text-[10px] lg:text-xs"
                }`}
              >
                HRS
              </div>
            </div>
            <div
              className={`bg-gradient-to-br from-red-500 via-red-600 to-red-700 rounded-lg shadow-lg ring-2 ring-red-300/20 text-center ${
                isScrolled
                  ? "px-1 py-0.5 w-8 sm:px-3 sm:py-2 sm:w-16 lg:w-18"
                  : "px-1.5 py-0.5 sm:px-3 sm:py-2 w-10 sm:w-16 lg:w-18"
              }`}
            >
              <div
                className={`text-white font-black font-['Poppins'] drop-shadow-md ${
                  isScrolled ? "text-[10px] sm:text-sm lg:text-base" : "text-xs sm:text-sm lg:text-base"
                }`}
              >
                {timeLeft.minutes.toString().padStart(2, "0")}
              </div>
              <div
                className={`text-red-100 font-medium ${
                  isScrolled ? "text-[8px] sm:text-[10px] lg:text-xs" : "text-[9px] sm:text-[10px] lg:text-xs"
                }`}
              >
                MINS
              </div>
            </div>
            <div
              className={`bg-gradient-to-br from-red-500 via-red-600 to-red-700 rounded-lg shadow-lg ring-2 ring-red-300/20 text-center ${
                isScrolled
                  ? "px-1 py-0.5 w-8 sm:px-3 sm:py-2 sm:w-16 lg:w-18"
                  : "px-1.5 py-0.5 sm:px-3 sm:py-2 w-10 sm:w-16 lg:w-18"
              }`}
            >
              <div
                className={`text-white font-black font-['Poppins'] drop-shadow-md ${
                  isScrolled ? "text-[10px] sm:text-sm lg:text-base" : "text-xs sm:text-sm lg:text-base"
                }`}
              >
                {timeLeft.seconds.toString().padStart(2, "0")}
              </div>
              <div
                className={`text-red-100 font-medium ${
                  isScrolled ? "text-[8px] sm:text-[10px] lg:text-xs" : "text-[9px] sm:text-[10px] lg:text-xs"
                }`}
              >
                SECS
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
