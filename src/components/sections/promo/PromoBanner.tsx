"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { usePromoByType } from "@/hooks/queries/usePromoQueries";

export default function PromoBanner() {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  const [isScrolled, setIsScrolled] = useState(false);

  const { data: activePromo } = usePromoByType("membership-packages");

  // 24-hour looping countdown timer (resets at midnight server time/UTC)
  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      // Get next midnight in UTC
      const nextMidnight = new Date(now);
      nextMidnight.setUTCHours(24, 0, 0, 0); // This automatically rolls over to next day if needed

      const difference = nextMidnight.getTime() - now.getTime();

      // Calculate time remaining until next midnight
      const totalSeconds = Math.max(0, Math.floor(difference / 1000));
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      setTimeLeft({
        days: 0, // Always 0 for 24-hour countdown
        hours,
        minutes,
        seconds,
      });
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);

    return () => clearInterval(timer);
  }, []);

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

  // Get multiplier for dynamic text (default to 10x if no promo)
  const multiplier = activePromo?.multiplier || 10;

  // Keep the banner below the header by default; only float it once scrolled for visibility.
  return (
    <div
      className={`${
        isScrolled ? "fixed top-4 left-4 right-4 rounded-full z-50" : "relative w-full mt-0 z-30"
      } bg-gradient-to-r from-gray-900 via-gray-800 to-black shadow-2xl border-b-2 border-red-500/50 transition-all duration-300`}
    >
      <div className="h-16 sm:h-20 flex items-center justify-center px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10 pattern-dots-white"></div>

        {/* Main Content */}
        <div className="relative z-10 flex items-center justify-between w-full">
          {/* Left Side - Alert Message with Enhanced Styling and Animations */}
          <div className="flex items-center gap-3">
            <div className="text-left">
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="relative"
              >
                <motion.div
                  animate={{
                    scale: [1, 1.03, 1],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className={`relative inline-block ${
                    isScrolled ? "text-xs sm:text-base lg:text-lg" : "text-sm sm:text-base lg:text-lg"
                  }`}
                >
                  <span className="relative z-10 text-white font-black font-['Poppins'] tracking-wide drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
                    First 500 people
                  </span>
                  <motion.span
                    animate={{
                      opacity: [0.3, 0.6, 0.3],
                    }}
                    transition={{
                      duration: 2.5,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="absolute inset-0 bg-gradient-to-r from-yellow-400/40 via-yellow-300/50 to-yellow-400/40 blur-lg -z-0"
                  />
                </motion.div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.15, ease: "easeOut" }}
                className="relative"
              >
                <motion.div
                  animate={{
                    scale: [1, 1.05, 1],
                  }}
                  transition={{
                    duration: 2.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 0.2,
                  }}
                  className={`relative inline-block ${isScrolled ? "text-[10px] sm:text-sm" : "text-xs sm:text-sm"}`}
                >
                  <span className="relative z-10 bg-gradient-to-r from-yellow-300 via-yellow-200 to-yellow-300 bg-clip-text text-transparent font-bold font-['Poppins'] drop-shadow-[0_2px_6px_rgba(251,191,36,0.4)]">
                    Get {multiplier}x entries
                  </span>
                  <motion.span
                    animate={{
                      opacity: [0.2, 0.5, 0.2],
                      scale: [1, 1.08, 1],
                    }}
                    transition={{
                      duration: 2.8,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="absolute inset-0 bg-gradient-to-r from-yellow-400/50 via-yellow-300/60 to-yellow-400/50 blur-xl -z-0"
                  />
                </motion.div>
              </motion.div>
            </div>
          </div>

          {/* Right Side - Enhanced Countdown (24-hour looping timer) */}
          <div className="flex items-center justify-center gap-1 sm:gap-2 lg:gap-3">
            {/* 24-hour countdown only shows hours, minutes, seconds (no days) */}
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
