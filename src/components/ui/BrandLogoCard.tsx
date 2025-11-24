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
  const gradientDirection = brand.splitGradient
    ? brand.splitOrientation === "vertical"
      ? "b"
      : "r"
    : brand.gradientDirection ?? "br";
  const baseGradientClass = brand.gradient ? `bg-gradient-to-${gradientDirection} ${brand.gradient}` : "";
  const gradientClass = gradientOverride ?? baseGradientClass;
  const overlayScale = scaleOverride ?? brand.overlayScale ?? 1;
  const breakpoint = useBreakpoint();

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
            gradientClass
          )}
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
          gradientClass,
          heightClass
        )}
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
            unoptimized
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
