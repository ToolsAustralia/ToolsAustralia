"use client";

import { useState, useEffect } from "react";

interface MiniDrawCountdownProps {
  drawDate: Date;
  freezeEntriesAt: Date;
  status: string;
}

export default function MiniDrawCountdown({ drawDate, freezeEntriesAt, status }: MiniDrawCountdownProps) {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const freezeTime = new Date(freezeEntriesAt).getTime();
      const drawTime = new Date(drawDate).getTime();

      // Check if entries are frozen (status is frozen)
      const isFrozen = status === "frozen";

      // If frozen, countdown to draw date, otherwise countdown to freeze date
      const targetTime = isFrozen ? drawTime : freezeTime;
      const difference = targetTime - now;

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

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [drawDate, freezeEntriesAt, status]);

  const isCompleted = status === "completed";

  if (isCompleted) {
    return (
      <div className="bg-gradient-to-br from-red-600 to-red-700 rounded-3xl p-4 sm:p-6 shadow-2xl border-2 border-white/20">
        <div className="text-center">
          <div className="mb-2">
            <span className="text-lg font-bold text-white font-['Poppins']">Draw Ended</span>
          </div>
          <p className="text-white/80 text-sm">This mini draw has concluded. Check the results page for winners!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-red-600 to-red-700 rounded-3xl p-4 sm:p-6 shadow-2xl border-2 border-white/20">
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-2 sm:p-4 text-center border border-white/20">
          <div className="text-xl sm:text-[28px] font-bold text-white">{timeLeft.days}</div>
          <div className="text-[10px] sm:text-[12px] text-white/80 font-medium">Days</div>
        </div>
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-2 sm:p-4 text-center border border-white/20">
          <div className="text-xl sm:text-[28px] font-bold text-white">{timeLeft.hours}</div>
          <div className="text-[10px] sm:text-[12px] text-white/80 font-medium">Hours</div>
        </div>
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-2 sm:p-4 text-center border border-white/20">
          <div className="text-xl sm:text-[28px] font-bold text-white">{timeLeft.minutes}</div>
          <div className="text-[10px] sm:text-[12px] text-white/80 font-medium">Mins</div>
        </div>
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-2 sm:p-4 text-center border border-white/20">
          <div className="text-xl sm:text-[28px] font-bold text-white">{timeLeft.seconds}</div>
          <div className="text-[10px] sm:text-[12px] text-white/80 font-medium">Secs</div>
        </div>
      </div>

      {/* Facebook Follow Link */}
      <div className="mt-4 text-center">
        <a
          href="https://facebook.com/tools-australia"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-white/90 hover:text-white text-[12px] sm:text-[14px] font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
          Follow for live draw updates
        </a>
      </div>
    </div>
  );
}
