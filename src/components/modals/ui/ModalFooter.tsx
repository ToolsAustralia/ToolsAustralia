"use client";

import React from "react";
import { X } from "lucide-react";
import type { PrizeBrandColors } from "@/utils/prize-brand-colors";

export interface ModalFooterProps {
  onClose: () => void;
  brandColors?: PrizeBrandColors | null;
  className?: string;
}

const ModalFooter: React.FC<ModalFooterProps> = ({ onClose, brandColors, className = "" }) => {
  return (
    <div className={`hidden sm:flex items-center justify-end gap-3 px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-neutral-700 ${className}`}>
      <button
        onClick={onClose}
        type="button"
        className={`relative overflow-hidden rounded-full transition-all duration-300 hover:scale-105 group px-4 sm:px-6 py-2 sm:py-3 font-semibold text-sm sm:text-base ${
          brandColors
            ? `bg-gradient-to-br ${brandColors.gradient} ${brandColors.textColor} border-2 ${brandColors.borderColor} shadow-lg ${brandColors.shadowColor}`
            : "bg-gradient-to-br from-red-600 via-red-700 to-red-800 text-white border-2 border-red-500 shadow-lg shadow-red-500/40"
        }`}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent"></div>
        <span className="relative z-10 flex items-center gap-2">
          Close
          <X size={18} />
        </span>
      </button>
    </div>
  );
};

export default ModalFooter;
