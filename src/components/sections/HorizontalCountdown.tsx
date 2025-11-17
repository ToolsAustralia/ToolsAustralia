"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";
import { DEFAULT_PRIZE_SLUG } from "@/config/prizes";

interface HorizontalCountdownProps {
  className?: string;
}

const HorizontalCountdown: React.FC<HorizontalCountdownProps> = ({ className = "" }) => {
  const router = useRouter();
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  const [isExpired, setIsExpired] = useState(false);

  const { data: currentMajorDraw, isLoading } = useCurrentMajorDraw();

  useEffect(() => {
    if (!currentMajorDraw || !currentMajorDraw?.drawDate) {
      setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      setIsExpired(true);
      return;
    }

    const updateTimer = () => {
      const now = new Date().getTime();
      // Use drawDate for countdown
      const endTime = new Date(currentMajorDraw.drawDate || "").getTime();
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

  const handleViewDetails = () => {
    router.push(`/promotions/${DEFAULT_PRIZE_SLUG}`);
  };

  // Don't show loading spinner - render with 0 values for better UX
  // if (!currentMajorDraw) {
  //   return null;
  // }

  return (
    <div
      className={`bg-gradient-to-r from-gray-900 via-gray-800 to-black rounded-2xl shadow-2xl border border-red-500/50 p-4 sm:p-6 relative overflow-hidden max-w-xl mx-auto backdrop-blur-sm ${className}`}
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

      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-12 gap-4 sm:gap-6 items-center">
        {/* Left Column - Text */}
        <div className="text-center sm:text-left sm:col-span-3">
          <div className="flex items-center justify-center sm:justify-start gap-3 mb-2">
            <h3 className="text-sm sm:text-base font-bold text-white font-['Poppins'] leading-tight break-words">
              UNTIL NEXT LIVE DRAW
            </h3>
          </div>
        </div>

        {/* Center Column - Countdown */}
        <div className="text-center sm:col-span-6">
          {isExpired ? (
            <div className="text-center">
              <div className="text-2xl sm:text-3xl font-bold text-red-400 mb-2 font-['Poppins']">DRAW IN PROGRESS!</div>
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
            className="group bg-gradient-to-r from-red-500 via-red-600 to-red-700 hover:from-red-600 hover:via-red-700 hover:to-red-800 text-white px-6 py-2 sm:px-4 sm:py-2 rounded-lg font-semibold text-xs sm:text-sm shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105 flex items-center justify-center gap-1 w-[200px] sm:w-auto ring-2 ring-red-300/30"
          >
            <span>Enter Now</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default HorizontalCountdown;
