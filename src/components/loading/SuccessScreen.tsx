"use client";

import React from "react";
import { Check, Gift, Star, Zap } from "lucide-react";

interface Benefit {
  text: string;
  icon?: "gift" | "star" | "zap";
}

interface SuccessScreenProps {
  title: string;
  subtitle: string;
  benefits: Benefit[];
  isVisible?: boolean;
  autoCloseDelay?: number;
  onAutoClose?: () => void;
}

/**
 * Reusable SuccessScreen Component
 * Displays a professional success screen with benefits and confirmation
 */
const SuccessScreen: React.FC<SuccessScreenProps> = ({
  title,
  subtitle,
  benefits,
  isVisible = true,
  autoCloseDelay = 3000,
  onAutoClose,
}) => {
  React.useEffect(() => {
    if (autoCloseDelay > 0 && onAutoClose) {
      const timer = setTimeout(() => {
        onAutoClose();
      }, autoCloseDelay);
      return () => clearTimeout(timer);
    }
  }, [autoCloseDelay, onAutoClose]);

  const getIcon = (iconType?: string) => {
    switch (iconType) {
      case "gift":
        return <Gift className="w-3 h-3 sm:w-4 sm:h-4 text-white" />;
      case "star":
        return <Star className="w-3 h-3 sm:w-4 sm:h-4 text-white" />;
      case "zap":
        return <Zap className="w-3 h-3 sm:w-4 sm:h-4 text-white" />;
      default:
        return <Gift className="w-3 h-3 sm:w-4 sm:h-4 text-white" />;
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div className="relative bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-sm sm:max-w-md mx-auto p-4 sm:p-8 text-center animate-in zoom-in-95 duration-500">
        <div className="mb-4 sm:mb-6">
          <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-3 sm:mb-4 bg-gradient-to-br from-green-600 to-green-700 rounded-full flex items-center justify-center shadow-lg animate-in zoom-in-50 duration-700 delay-200">
            <Check className="w-8 h-8 sm:w-10 sm:h-10 text-white animate-in fade-in duration-500 delay-500" />
          </div>
          <h2 className="text-lg sm:text-2xl font-bold text-gray-900 mb-1 sm:mb-2">{title}</h2>
          <p className="text-xs sm:text-sm text-gray-600">{subtitle}</p>
        </div>

        <div className="bg-gradient-to-br from-green-800 to-green-900 border border-green-700 rounded-lg sm:rounded-xl p-3 sm:p-4 mb-4 sm:mb-6 shadow-xl">
          <div className="text-xs sm:text-sm text-white space-y-2 sm:space-y-3">
            {benefits.map((benefit, index) => (
              <div
                key={index}
                className="flex items-center gap-2 sm:gap-3 animate-in slide-in-from-left-4 duration-500"
                style={{ animationDelay: `${index * 100 + 800}ms` }}
              >
                <div className="w-6 h-6 sm:w-8 sm:h-8 bg-green-600 rounded-full flex items-center justify-center shadow-md flex-shrink-0">
                  {getIcon(benefit.icon)}
                </div>
                <span className="font-medium text-xs sm:text-sm">{benefit.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SuccessScreen;
