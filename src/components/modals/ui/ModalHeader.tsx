"use client";

import React from "react";
import Image from "next/image";
import { X } from "lucide-react";

export interface ModalHeaderProps {
  title: string;
  /** When provided, renders instead of title (e.g. for "JOIN TOOLS AUSTRALIA" with styled parts) */
  titleNode?: React.ReactNode;
  subtitle?: string;
  onClose: () => void;
  showLogo?: boolean;
  logoSrc?: string;
  logoAlt?: string;
  className?: string;
  variant?: "auto" | "brand" | "metallic" | "metallic-red";
  accent?: "none" | "red";
  logoSize?: "sm" | "md" | "lg";
  showCloseButton?: boolean; // Optional prop to control close button visibility (defaults to true for backward compatibility)
  /** When true (e.g. Ryobi theme), use dark text for better contrast on light backgrounds */
  preferDarkBackground?: boolean;
  /**
   * When set (e.g. package `scheme.text` / `scheme.textMuted`), overrides default header title & close color.
   * Keeps contrast with the same rule as promos: dark text on light brand fills, light text on dark fills.
   */
  titleTextClassName?: string;
  subtitleTextClassName?: string;
  /** Optional inline style (e.g. for theme gradient background) */
  style?: React.CSSProperties;
  /**
   * When true, skips metallic/gradient preset backgrounds so `style` / `className` fully control the fill
   * (e.g. solid brand color for prize spec modal).
   */
  customBackground?: boolean;
  /**
   * Tighter padding, smaller title, and closer close control on small screens (sm+ matches default look).
   */
  compact?: boolean;
}

const ModalHeader: React.FC<ModalHeaderProps> = ({
  title,
  titleNode,
  subtitle,
  onClose,
  showLogo = false,
  logoSrc = "/images/Tools Australia Logo/White-Text Logo.webp",
  logoAlt = "Tools Australia",
  className = "",
  variant = "auto",
  accent = "red",
  logoSize = "md",
  showCloseButton = true, // Default to true to maintain backward compatibility
  preferDarkBackground = false,
  titleTextClassName,
  subtitleTextClassName,
  style: headerStyle,
  customBackground = false,
  compact = false,
}) => {
  const resolvedVariant = variant === "auto" ? (showLogo ? "metallic" : "brand") : variant;

  const headerBaseClass = customBackground
    ? ""
    : resolvedVariant === "brand"
      ? "bg-gradient-to-r from-[#ee0000] via-[#ff3333] to-[#ff4444]"
      : resolvedVariant === "metallic-red"
        ? "metal-header-red"
        : "metal-header";

  const accentClass = customBackground ? "" : accent === "red" ? "metal-accent-red" : "";

  const logoHeightClass = logoSize === "sm" ? "h-6" : logoSize === "lg" ? "h-10" : "h-8";
  const textClass =
    titleTextClassName ?? (preferDarkBackground ? "!text-black" : "text-white");
  const subtitleClass =
    subtitleTextClassName ?? (preferDarkBackground ? "!text-gray-800 dark:text-neutral-100" : "text-white/80");
  const headerUsesDarkForeground =
    !titleTextClassName && preferDarkBackground
      ? true
      : Boolean(
          titleTextClassName &&
            (titleTextClassName.includes("text-black") ||
              titleTextClassName.includes("!text-black") ||
              titleTextClassName.includes("black/") ||
              titleTextClassName.includes("text-slate-9") ||
              titleTextClassName.includes("text-gray-9"))
        );

  const paddingClass = compact ? "p-3 sm:p-4" : "p-4";
  const closePositionClass = compact ? "top-3 right-3 sm:top-4 sm:right-4" : "top-4 right-4";
  const titleGutterClass = compact ? "px-9 sm:px-12" : "px-12";
  const titleTypographyClass = compact
    ? "text-center text-sm sm:text-lg font-bold leading-snug sm:leading-normal"
    : "text-center text-base sm:text-lg font-bold";

  return (
    <div
      className={`${headerBaseClass} ${accentClass} ${paddingClass} ${textClass} relative ${className}`}
      style={headerStyle}
    >
      {/* Close Button - Conditionally rendered based on showCloseButton prop */}
      {showCloseButton && (
        <button
          onClick={onClose}
          type="button"
          className={`absolute ${closePositionClass} ${textClass} transition-all duration-300 hover:scale-110 z-50 p-0.5 sm:p-1 rounded-full focus:outline-none focus:ring-2 ${
            headerUsesDarkForeground
              ? "hover:bg-black/15 hover:text-gray-900 focus:ring-black/20"
              : "hover:bg-white/10 hover:text-white focus:ring-white/20"
          }`}
          aria-label="Close modal"
        >
          <X className={compact ? "w-[18px] h-[18px] sm:h-5 sm:w-5" : "h-5 w-5"} strokeWidth={2.25} aria-hidden />
        </button>
      )}

      {/* Logo */}
      {showLogo && (
        <div className={`flex justify-center ${compact ? "mb-1 sm:mb-2" : "mb-2"}`}>
          <Image src={logoSrc} alt={logoAlt} width={120} height={40} className={`${logoHeightClass} w-auto`} />
        </div>
      )}

      {/* Title — horizontal padding keeps copy clear of the close control */}
      <h2 className={`${titleTypographyClass} ${titleGutterClass}`}>{titleNode ?? title}</h2>

      {/* Subtitle */}
      {subtitle && (
        <p
          className={`text-center ${subtitleClass} ${compact ? "text-xs sm:text-sm mt-0.5 sm:mt-1" : "text-sm mt-1"}`}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
};

export default ModalHeader;
