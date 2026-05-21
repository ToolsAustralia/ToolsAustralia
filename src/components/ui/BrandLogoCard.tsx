"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import Image from "next/image";
import { type BrandLogo } from "@/data/brandLogos";
import { addThrottledResize } from "@/utils/dom/listenerHelpers";

interface BrandLogoCardProps {
  brand: BrandLogo;
  className?: string;
  widthClass?: string;
  heightClass?: string;
  overlayMode?: "card" | "overlay";
  gradientOverride?: string;
  scaleOverride?: number;
}

export interface BrandLogoVisual {
  id: string;
  name: string;
  logo: string;
  gradient: string;
  gradientDirection?: BrandLogo["gradientDirection"];
  splitGradient?: boolean;
  splitOrientation?: BrandLogo["splitOrientation"];
  hasOverlay?: boolean;
  imageScale?: number;
  imageScaleSm?: number;
  imageScaleMd?: number;
  imageScaleLg?: number;
}

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");
const OVERLAY_BASE_WIDTH = 56;
const OVERLAY_BASE_HEIGHT = 24;
type Breakpoint = "base" | "sm" | "md" | "lg" | "xl";

const subscribers = new Set<(width: number) => void>();
let sharedWidth = typeof window === "undefined" ? 1024 : window.innerWidth;
let detachResizeListener: (() => void) | null = null;

const handleResize = () => {
  sharedWidth = window.innerWidth;
  subscribers.forEach((callback) => callback(sharedWidth));
};

const ensureResizeListener = () => {
  if (detachResizeListener || typeof window === "undefined") {
    return;
  }
  detachResizeListener = addThrottledResize(handleResize);
};

const getBreakpoint = (width: number): Breakpoint => {
  if (width >= 1280) return "xl";
  if (width >= 1024) return "lg";
  if (width >= 768) return "md";
  if (width >= 640) return "sm";
  return "base";
};

/**
 * Custom hook to get viewport width with proper SSR handling
 * Uses best practices to prevent hydration mismatches and ensure correct
 * breakpoint calculation on first render
 *
 * Returns both width and mounted state to allow components to defer
 * rendering until after hydration is complete
 */
const useViewportWidth = (): { width: number; isMounted: boolean } => {
  // Track if component has mounted on client to prevent hydration mismatches
  const [mounted, setMounted] = useState(false);

  // Initialize with actual window width if available (client-side)
  // This ensures we start with the correct value on client, preventing
  // incorrect scaling during the hydration phase
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 1024;
    return window.innerWidth;
  });

  // Use useLayoutEffect to set mounted state synchronously before paint
  // This ensures correct breakpoint calculation on first render without flash
  useLayoutEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    // Set mounted state and ensure width is correct immediately before browser paint
    // This fixes the issue where first load shows incorrect scaling on mobile
    setMounted(true);
    setWidth((prevWidth) => {
      const actualWidth = window.innerWidth;
      // Only update if different to avoid unnecessary re-renders
      return actualWidth !== prevWidth ? actualWidth : prevWidth;
    });
  }, []); // Empty deps - only run once on mount to set mounted state

  // Set up resize listener after component mounts
  useEffect(() => {
    if (typeof window === "undefined" || !mounted) {
      return;
    }

    const listener = (nextWidth: number) => setWidth(nextWidth);
    subscribers.add(listener);
    ensureResizeListener();

    return () => {
      subscribers.delete(listener);
      if (subscribers.size === 0 && detachResizeListener) {
        detachResizeListener();
        detachResizeListener = null;
      }
    };
  }, [mounted]); // Only depend on mounted - listener doesn't need width

  return { width, isMounted: mounted };
};

const useBreakpoint = (): { breakpoint: Breakpoint; isMounted: boolean } => {
  const { width, isMounted } = useViewportWidth();
  return { breakpoint: getBreakpoint(width), isMounted };
};

export default function BrandLogoCard({
  brand,
  className = "",
  widthClass = "w-[140px] sm:w-[160px] lg:w-[200px]",
  heightClass = "h-[60px] sm:h-[70px] lg:h-[90px]",
  overlayMode = "card",
  gradientOverride,
  scaleOverride,
}: BrandLogoCardProps) {
  const gradientDirection = brand.splitGradient
    ? brand.splitOrientation === "vertical"
      ? "b"
      : "r"
    : brand.gradientDirection ?? "br";
  // Check if gradient is already a complete class (e.g., arbitrary value with bg-[...])
  // If so, use it directly; otherwise, construct the gradient class
  const baseGradientClass = brand.gradient
    ? brand.gradient.startsWith("bg-[") || brand.gradient.startsWith("bg-")
      ? brand.gradient
      : `bg-gradient-to-${gradientDirection} ${brand.gradient}`
    : "";
  const gradientClass = gradientOverride ?? baseGradientClass;

  // For split gradients, extract the gradient value and apply as inline style for precise control
  const getSplitGradientStyle = () => {
    if (!brand.splitGradient || !brand.gradient) return undefined;

    // For Stahlwille, always use the hard-coded values for 55% black top, 45% green bottom split
    if (brand.id === "stahlwille") {
      const direction = brand.splitOrientation === "vertical" ? "to bottom" : "to right";
      return {
        backgroundImage: `linear-gradient(${direction}, #111827 0%, #111827 55%, #064e3b 55%, #064e3b 100%)`,
      };
    }

    // If gradient is an arbitrary value, extract the linear-gradient part
    if (brand.gradient.startsWith("bg-[linear-gradient")) {
      // Extract the gradient value from bg-[linear-gradient(...)]
      // Handle both to_bottom and to bottom syntax
      const gradientMatch = brand.gradient.match(/linear-gradient\(([^)]+)\)/);
      if (gradientMatch) {
        // Replace underscores with spaces for proper CSS syntax
        const gradientValue = gradientMatch[1].replace(/_/g, " ");
        return { backgroundImage: `linear-gradient(${gradientValue})` };
      }
    }

    // For standard Tailwind gradients, construct the linear-gradient
    if (brand.gradient.includes("from-") && brand.gradient.includes("to-")) {
      // This would need more complex parsing - skip for now
      return undefined;
    }

    return undefined;
  };

  const splitGradientStyle = getSplitGradientStyle();
  const overlayScale = scaleOverride ?? brand.overlayScale ?? 1;
  const { breakpoint, isMounted } = useBreakpoint();

  // Default to the desktop scale but allow each breakpoint to provide its own value so
  // wide logos, such as Warren & Brown, can breathe on small viewports.
  const responsiveCardScale = (() => {
    const fallbackScale = brand.imageScale ?? 1;
    switch (breakpoint) {
      case "lg":
      case "xl":
        return brand.imageScaleLg ?? brand.imageScaleMd ?? brand.imageScaleSm ?? fallbackScale;
      case "md":
        return brand.imageScaleMd ?? brand.imageScaleSm ?? fallbackScale;
      case "sm":
        return brand.imageScaleSm ?? fallbackScale;
      default:
        return fallbackScale;
    }
  })();

  // Only apply scale after component has mounted to prevent hydration mismatches
  // During SSR and initial hydration, use scale of 1 (no transform) to match server render
  // This ensures the component renders correctly on first load without incorrect scaling
  const cardScale = isMounted ? scaleOverride ?? responsiveCardScale : 1;

  if (overlayMode === "overlay") {
    const overlayWidth = OVERLAY_BASE_WIDTH * overlayScale;
    const overlayHeight = OVERLAY_BASE_HEIGHT * overlayScale;
    return (
      <div
        className={cx("relative inline-flex", className)}
        style={{ width: `${overlayWidth}px`, height: `${overlayHeight}px` }}
      >
        <div
          className={cx(
            "relative flex items-center justify-center w-full h-full rounded-md shadow-lg overflow-hidden",
            splitGradientStyle ? "" : gradientClass // Don't apply class if using inline style
          )}
          style={splitGradientStyle}
        >
          <Image
            src={brand.logo}
            alt={brand.name}
            fill
            className="object-contain drop-shadow-md"
            sizes={`${Math.ceil(overlayWidth)}px`}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={cx(`flex-shrink-0 ${widthClass}`, className)}>
      <div
        className={cx(
          "flex items-center justify-center relative overflow-hidden rounded-xl shadow-lg",
          splitGradientStyle ? "" : gradientClass, // Don't apply class if using inline style
          heightClass
        )}
        style={splitGradientStyle}
      >
        {brand.hasOverlay !== false && (
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/10 rounded-xl pointer-events-none" />
        )}
        <div className="relative w-[120px] h-[48px]">
          <Image
            src={brand.logo}
            alt={brand.name}
            fill
            className="object-contain drop-shadow-md"
            sizes="150px"
            style={
              cardScale !== 1
                ? {
                    transform: `scale(${cardScale})`,
                    transformOrigin: "center",
                  }
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
