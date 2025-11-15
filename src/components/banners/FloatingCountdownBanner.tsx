"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";
import { DEFAULT_PRIZE_SLUG } from "@/config/prizes";

interface FloatingCountdownBannerProps {
  className?: string;
}

const FloatingCountdownBanner: React.FC<FloatingCountdownBannerProps> = ({ className = "" }) => {
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false); // For hover/click override
  const [isDismissed, setIsDismissed] = useState(false);
  const [isReady, setIsReady] = useState(false); // Wait for data to load
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  const [isExpired, setIsExpired] = useState(false);

  const { data: currentMajorDraw, isLoading } = useCurrentMajorDraw();

  // Countdown timer logic (from HorizontalCountdown)
  useEffect(() => {
    if (!currentMajorDraw?.drawDate) {
      setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      setIsExpired(true);
      return;
    }

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
        setIsExpired(false);
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        setIsExpired(true);
      }
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [currentMajorDraw]);

  // Only show when data is ready
  useEffect(() => {
    if (currentMajorDraw && !isLoading && timeLeft) {
      // Add small delay to ensure first calculation completes
      setTimeout(() => setIsReady(true), 100);
    }
  }, [currentMajorDraw, isLoading, timeLeft]);

  // Scroll detection - collapse at 200px
  useEffect(() => {
    const handleScroll = () => {
      setIsCollapsed(window.scrollY > 200);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Dismiss handler
  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDismissed(true);
  };

  // Navigate to giveaway page using the default prize slug
  // This ensures we always navigate to an existing promotional page
  const handleViewDetails = () => {
    router.push(`/promotions/${DEFAULT_PRIZE_SLUG}`);
  };

  // Don't render if dismissed or not ready
  if (isDismissed || !isReady) {
    return null;
  }

  const isCollapsedState = isCollapsed && !isExpanded;

  return (
    <AnimatePresence>
      {isReady && !isDismissed && (
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className={`fixed bottom-10 sm:bottom-12 left-0 right-0 flex justify-center z-50 ${className}`}
          onMouseEnter={() => !isCollapsed && setIsExpanded(true)}
          onMouseLeave={() => setIsExpanded(false)}
          onClick={() => {
            // Mobile: toggle expanded on click
            if (isCollapsed) setIsExpanded(!isExpanded);
          }}
        >
          <motion.div
            animate={{
              scale: isCollapsedState ? 0.95 : 1,
            }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className={`relative bg-gradient-to-r from-gray-900 via-gray-800 to-black rounded-xl shadow-2xl border border-red-500/50 backdrop-blur-sm overflow-visible w-full mx-4 ${
              isCollapsedState ? "max-w-md" : "max-w-4xl"
            }`}
          >
            {/* Background Pattern */}
            <div className="absolute inset-0 opacity-10">
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.1'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                }}
              ></div>
            </div>

            {/* X Button */}
            <button
              onClick={handleDismiss}
              className="absolute -top-3 -right-4 z-20 bg-white hover:bg-red-50 rounded-full p-1.5 transition-all duration-300 hover:scale-110 hover:shadow-lg group"
            >
              <X className="w-5 h-5 text-red-400 group-hover:text-red-600 transition-colors duration-300" />
            </button>

            <div className="relative z-10 p-4 sm:p-6">
              {/* Collapsed State - Show only text with pulsing green circle */}
              {isCollapsedState ? (
                <div className="flex items-center justify-center gap-3 py-2">
                  {/* Pulsing Green Circle */}
                  <div className="relative">
                    <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                    <div className="absolute inset-0 w-3 h-3 bg-green-400 rounded-full animate-ping opacity-75"></div>
                  </div>

                  {/* Text - Only title, no subtitle */}
                  <div className="text-center">
                    <h3 className="text-sm sm:text-base font-bold text-white font-['Poppins'] leading-tight">
                      WIN PROFESSIONAL TOOLS!
                    </h3>
                  </div>
                </div>
              ) : (
                /* Expanded State - Desktop */
                <div className="hidden sm:block">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 sm:gap-6 items-center">
                    {/* Left Column - Text */}
                    <div className="text-center sm:text-left sm:col-span-4">
                      <div className="flex items-center justify-center sm:justify-start gap-3 mb-2">
                        <h3 className="text-sm sm:text-base font-bold text-white font-['Poppins'] leading-tight break-words">
                          WIN PROFESSIONAL TOOLS!
                        </h3>
                      </div>
                      <p className="text-xs text-yellow-400">UNTIL NEXT LIVE DRAW</p>
                    </div>

                    {/* Center Column - Countdown */}
                    <div className="text-center sm:col-span-5">
                      {isExpired ? (
                        <div className="text-center">
                          <div className="text-2xl sm:text-3xl font-bold text-red-400 mb-2 font-['Poppins']">
                            DRAW IN PROGRESS!
                          </div>
                          <p className="text-sm text-gray-300">Check back soon for results</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-4 gap-2 sm:gap-2">
                          {/* Days */}
                          <div className="bg-gradient-to-br from-red-500 via-red-600 to-red-700 rounded-lg px-2 py-2 sm:px-4 sm:py-2 shadow-lg w-full ring-2 ring-red-300/20">
                            <div className="text-lg sm:text-xl font-bold text-white mb-0.5 font-['Poppins'] drop-shadow-md">
                              {timeLeft.days.toString().padStart(2, "0")}
                            </div>
                            <div className="text-xs text-red-100 font-medium">DAYS</div>
                          </div>

                          {/* Hours */}
                          <div className="bg-gradient-to-br from-red-500 via-red-600 to-red-700 rounded-lg px-2 py-2 sm:px-4 sm:py-2 shadow-lg w-full ring-2 ring-red-300/20">
                            <div className="text-lg sm:text-xl font-bold text-white mb-0.5 font-['Poppins'] drop-shadow-md">
                              {timeLeft.hours.toString().padStart(2, "0")}
                            </div>
                            <div className="text-xs text-red-100 font-medium">HRS</div>
                          </div>

                          {/* Minutes */}
                          <div className="bg-gradient-to-br from-red-500 via-red-600 to-red-700 rounded-lg px-2 py-2 sm:px-4 sm:py-2 shadow-lg w-full ring-2 ring-red-300/20">
                            <div className="text-lg sm:text-xl font-bold text-white mb-0.5 font-['Poppins'] drop-shadow-md">
                              {timeLeft.minutes.toString().padStart(2, "0")}
                            </div>
                            <div className="text-xs text-red-100 font-medium">MINS</div>
                          </div>

                          {/* Seconds */}
                          <div className="bg-gradient-to-br from-red-500 via-red-600 to-red-700 rounded-lg px-2 py-2 sm:px-4 sm:py-2 shadow-lg w-full ring-2 ring-red-300/20">
                            <div className="text-lg sm:text-xl font-bold text-white mb-0.5 font-['Poppins'] drop-shadow-md">
                              {timeLeft.seconds.toString().padStart(2, "0")}
                            </div>
                            <div className="text-xs text-red-100 font-medium">SECS</div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right Column - Action Button */}
                    <div className="flex justify-center sm:justify-end sm:col-span-3">
                      <button
                        onClick={handleViewDetails}
                        className="group bg-gradient-to-r from-yellow-500 via-yellow-600 to-orange-600 hover:from-yellow-600 hover:via-orange-600 hover:to-red-600 text-black px-6 py-2 sm:px-4 sm:py-2 rounded-lg font-semibold text-xs sm:text-sm shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105 flex items-center justify-center gap-1 w-[200px] sm:w-auto ring-2 ring-yellow-300/30"
                      >
                        <span>Enter Now</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Mobile State - Only show when not collapsed */}
              {!isCollapsedState && (
                <div className="sm:hidden">
                  {/* Mobile Expanded */}
                  <div className="text-center">
                    <h3 className="text-sm font-bold text-white font-['Poppins'] mb-2">WIN PROFESSIONAL TOOLS!</h3>
                    <p className="text-xs text-yellow-400 mb-4">UNTIL NEXT LIVE DRAW</p>

                    {isExpired ? (
                      <div className="text-center">
                        <div className="text-xl font-bold text-red-400 mb-2 font-['Poppins']">DRAW IN PROGRESS!</div>
                        <p className="text-sm text-gray-300">Check back soon for results</p>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2 mb-4">
                        {/* Countdown Timer - 4 columns in one row */}
                        <div className="grid grid-cols-4 gap-1 flex-1">
                          {/* Days */}
                          <div className="bg-gradient-to-br from-red-500 via-red-600 to-red-700 rounded px-1 py-1 shadow-lg ring-1 ring-red-300/20">
                            <div className="text-sm font-bold text-white mb-0.5 font-['Poppins'] drop-shadow-md">
                              {timeLeft.days.toString().padStart(2, "0")}
                            </div>
                            <div className="text-[10px] text-red-100 font-medium">D</div>
                          </div>

                          {/* Hours */}
                          <div className="bg-gradient-to-br from-red-500 via-red-600 to-red-700 rounded px-1 py-1 shadow-lg ring-1 ring-red-300/20">
                            <div className="text-sm font-bold text-white mb-0.5 font-['Poppins'] drop-shadow-md">
                              {timeLeft.hours.toString().padStart(2, "0")}
                            </div>
                            <div className="text-[10px] text-red-100 font-medium">H</div>
                          </div>

                          {/* Minutes */}
                          <div className="bg-gradient-to-br from-red-500 via-red-600 to-red-700 rounded px-1 py-1 shadow-lg ring-1 ring-red-300/20">
                            <div className="text-sm font-bold text-white mb-0.5 font-['Poppins'] drop-shadow-md">
                              {timeLeft.minutes.toString().padStart(2, "0")}
                            </div>
                            <div className="text-[10px] text-red-100 font-medium">M</div>
                          </div>

                          {/* Seconds */}
                          <div className="bg-gradient-to-br from-red-500 via-red-600 to-red-700 rounded px-1 py-1 shadow-lg ring-1 ring-red-300/20">
                            <div className="text-sm font-bold text-white mb-0.5 font-['Poppins'] drop-shadow-md">
                              {timeLeft.seconds.toString().padStart(2, "0")}
                            </div>
                            <div className="text-[10px] text-red-100 font-medium">S</div>
                          </div>
                        </div>

                        {/* Enter Now Button - In the same row */}
                        <button
                          onClick={handleViewDetails}
                          className="px-3 py-1 text-xs bg-gradient-to-r from-yellow-500 via-yellow-600 to-orange-600 text-black rounded font-semibold"
                        >
                          Enter Now
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default FloatingCountdownBanner;
