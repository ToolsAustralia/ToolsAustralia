"use client";

import React from "react";
import Image from "next/image";
import { X } from "lucide-react";

export interface ModalHeaderProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  showLogo?: boolean;
  logoSrc?: string;
  logoAlt?: string;
  className?: string;
  variant?: "auto" | "brand" | "metallic" | "metallic-red";
  accent?: "none" | "red";
  logoSize?: "sm" | "md" | "lg";
}

const ModalHeader: React.FC<ModalHeaderProps> = ({
  title,
  subtitle,
  onClose,
  showLogo = false,
  logoSrc = "/images/Tools Australia Logo/White-Text Logo.png",
  logoAlt = "Tools Australia",
  className = "",
  variant = "auto",
  accent = "red",
  logoSize = "md",
}) => {
  const resolvedVariant = variant === "auto" ? (showLogo ? "metallic" : "brand") : variant;

  const headerBaseClass =
    resolvedVariant === "brand"
      ? "bg-gradient-to-r from-[#ee0000] via-[#ff3333] to-[#ff4444]"
      : resolvedVariant === "metallic-red"
      ? "metal-header-red"
      : "metal-header";

  const accentClass = accent === "red" ? "metal-accent-red" : "";

  const logoHeightClass = logoSize === "sm" ? "h-6" : logoSize === "lg" ? "h-10" : "h-8";

  return (
    <div className={`${headerBaseClass} ${accentClass} p-4 text-white relative ${className}`}>
      {/* Close Button */}
      <button
        onClick={onClose}
        type="button"
        className="absolute top-4 right-4 text-white hover:text-gray-200 transition-all duration-300 hover:scale-110 z-50 p-1 rounded-full hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
        aria-label="Close modal"
      >
        <X size={20} />
      </button>

      {/* Logo */}
      {showLogo && (
        <div className="flex justify-center mb-2">
          <Image src={logoSrc} alt={logoAlt} width={120} height={40} className={`${logoHeightClass} w-auto`} />
        </div>
      )}

      {/* Title */}
      <h2 className="text-center text-xl font-bold">{title}</h2>

      {/* Subtitle */}
      {subtitle && <p className="text-center text-white/80 text-sm mt-1">{subtitle}</p>}
    </div>
  );
};

export default ModalHeader;
