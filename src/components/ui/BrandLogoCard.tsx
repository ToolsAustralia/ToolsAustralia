"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { type BrandLogo } from "@/data/brandLogos";

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
let listenerAttached = false;

const handleResize = () => {
  sharedWidth = window.innerWidth;
  subscribers.forEach((callback) => callback(sharedWidth));
};

const ensureResizeListener = () => {
  if (listenerAttached || typeof window === "undefined") {
    return;
  }
  listenerAttached = true;
  window.addEventListener("resize", handleResize);
};

const getBreakpoint = (width: number): Breakpoint => {
  if (width >= 1280) return "xl";
  if (width >= 1024) return "lg";
  if (width >= 768) return "md";
  if (width >= 640) return "sm";
  return "base";
};

const useViewportWidth = () => {
  const [width, setWidth] = useState(() => (typeof window === "undefined" ? 1024 : window.innerWidth));

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const listener = (nextWidth: number) => setWidth(nextWidth);
    subscribers.add(listener);
    setWidth(window.innerWidth);
    ensureResizeListener();

    return () => {
      subscribers.delete(listener);
      if (subscribers.size === 0 && listenerAttached) {
        window.removeEventListener("resize", handleResize);
        listenerAttached = false;
      }
    };
  }, []);

  return width;
};

const useBreakpoint = (): Breakpoint => {
  const width = useViewportWidth();
  return getBreakpoint(width);
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
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

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
  const breakpoint = useBreakpoint();

  // Default to the desktop scale but allow each breakpoint to provide its own value so
  // wide logos, such as Warren & Brown, can breathe on small viewports.
  // Only calculate responsive scale after mount to prevent hydration mismatch
  const responsiveCardScale = (() => {
    if (!isMounted) {
      // During SSR and initial render, use a safe default that won't cause layout shift
      // Use mobile scale as default since mobile is most common
      return brand.imageScaleSm ?? brand.imageScale ?? 1;
    }
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
  const cardScale = scaleOverride ?? responsiveCardScale;

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
            "flex items-center justify-center w-full h-full rounded-md shadow-lg overflow-hidden",
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
            unoptimized
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
        <div className="relative w-[120px] h-[48px] flex-shrink-0">
          <Image
            src={brand.logo}
            alt={brand.name}
            fill
            className="object-contain drop-shadow-md"
            sizes="150px"
            unoptimized
            priority
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
