"use client";

import React, { useState, useEffect } from "react";
import { Clock, AlertTriangle, CheckCircle } from "lucide-react";

interface BenefitCountdownProps {
  effectiveDate: Date;
  changeType: "upgrade" | "downgrade";
  currentBenefits: {
    packageName: string;
    entriesPerMonth: number;
    shopDiscountPercent: number;
    partnerDiscountDays: number;
  };
  newBenefits: {
    packageName: string;
    entriesPerMonth: number;
    shopDiscountPercent: number;
    partnerDiscountDays: number;
  };
  onExpired?: () => void;
}

const BenefitCountdown: React.FC<BenefitCountdownProps> = ({
  effectiveDate,
  changeType,
  currentBenefits,
  newBenefits,
  onExpired,
}) => {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const target = new Date(effectiveDate).getTime();
      const difference = target - now;

      if (difference <= 0) {
        setIsExpired(true);
        onExpired?.();
        return { days: 0, hours: 0, minutes: 0, seconds: 0 };
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      return { days, hours, minutes, seconds };
    };

    // Calculate immediately
    setTimeLeft(calculateTimeLeft());

    // Update every second
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [effectiveDate, onExpired]);

  if (isExpired) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-3 sm:p-4">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle className="w-4 h-4 text-green-600" />
          <span className="text-sm font-medium text-green-800">
            Your {newBenefits.packageName} benefits are now active!
          </span>
        </div>
        <div className="text-xs text-green-700">
          You now have {newBenefits.entriesPerMonth} entries per month and {newBenefits.shopDiscountPercent}% shop
          discount.
        </div>
      </div>
    );
  }

  const getUrgencyColor = () => {
    if (timeLeft.days <= 1) return "text-red-600";
    if (timeLeft.days <= 3) return "text-orange-600";
    return "text-blue-600";
  };

  const getUrgencyBg = () => {
    if (timeLeft.days <= 1) return "bg-red-50 border-red-200";
    if (timeLeft.days <= 3) return "bg-orange-50 border-orange-200";
    return "bg-blue-50 border-blue-200";
  };

  return (
    <div className={`${getUrgencyBg()} border rounded-lg p-3 sm:p-4`}>
      <div className="flex items-center gap-2 mb-3">
        <Clock className={`w-4 h-4 ${getUrgencyColor()}`} />
        <span className="text-sm font-medium text-gray-800">
          {changeType === "downgrade" ? "Downgrade" : "Upgrade"} scheduled
        </span>
      </div>

      {/* Countdown Timer */}
      <div className="flex items-center justify-center gap-2 sm:gap-4 mb-3">
        <div className="text-center">
          <div className={`text-lg sm:text-xl font-bold ${getUrgencyColor()}`}>{timeLeft.days}</div>
          <div className="text-xs text-gray-600">days</div>
        </div>
        <div className="text-gray-400">:</div>
        <div className="text-center">
          <div className={`text-lg sm:text-xl font-bold ${getUrgencyColor()}`}>
            {timeLeft.hours.toString().padStart(2, "0")}
          </div>
          <div className="text-xs text-gray-600">hours</div>
        </div>
        <div className="text-gray-400">:</div>
        <div className="text-center">
          <div className={`text-lg sm:text-xl font-bold ${getUrgencyColor()}`}>
            {timeLeft.minutes.toString().padStart(2, "0")}
          </div>
          <div className="text-xs text-gray-600">min</div>
        </div>
      </div>

      {/* Current Benefits */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-3 h-3 text-orange-500" />
          <span className="text-xs text-gray-700">
            Use your current {currentBenefits.packageName} benefits before they expire:
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div className="bg-white/50 rounded p-2 text-center">
            <div className="font-medium text-gray-900">{currentBenefits.entriesPerMonth}</div>
            <div className="text-gray-600">entries</div>
          </div>
          <div className="bg-white/50 rounded p-2 text-center">
            <div className="font-medium text-gray-900">{currentBenefits.shopDiscountPercent}%</div>
            <div className="text-gray-600">discount</div>
          </div>
          <div className="bg-white/50 rounded p-2 text-center">
            <div className="font-medium text-gray-900">{currentBenefits.partnerDiscountDays}</div>
            <div className="text-gray-600">partner days</div>
          </div>
        </div>
      </div>

      {/* Next Benefits Preview */}
      <div className="mt-3 pt-3 border-t border-gray-200">
        <div className="text-xs text-gray-600 mb-2">Then you&apos;ll get {newBenefits.packageName} benefits:</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div className="bg-white/30 rounded p-2 text-center">
            <div className="font-medium text-gray-700">{newBenefits.entriesPerMonth}</div>
            <div className="text-gray-500">entries</div>
          </div>
          <div className="bg-white/30 rounded p-2 text-center">
            <div className="font-medium text-gray-700">{newBenefits.shopDiscountPercent}%</div>
            <div className="text-gray-500">discount</div>
          </div>
          <div className="bg-white/30 rounded p-2 text-center">
            <div className="font-medium text-gray-700">{newBenefits.partnerDiscountDays}</div>
            <div className="text-gray-500">partner days</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BenefitCountdown;
