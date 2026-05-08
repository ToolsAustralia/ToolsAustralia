"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import AutoScroll from "embla-carousel-auto-scroll";
import { brandLogos, BrandLogo } from "@/data/brandLogos";
import BrandLogoCard from "@/components/ui/BrandLogoCard";
import { cn } from "@/utils/cn";

interface BrandScrollerProps {
  speed?: number; // seconds for one full brand set pass (desktop default)
  speedPxPerSec?: number; // optional: direct pixel velocity override
  speedMobile?: number; // <640px
  speedSm?: number; // 640–1023px
  speedLg?: number; // ≥1024px
  pauseOnHover?: boolean;
  className?: string;
}

/**
 * Custom hook to get viewport width with proper SSR handling
 * Uses best practices to prevent hydration mismatches and ensure correct
 * breakpoint calculation on first render
 */
function useViewportWidth() {
  // Initialize with actual window width if available (client-side)
  // This ensures we start with the correct value on client, preventing
  // incorrect calculations during the hydration phase
  const [w, setW] = useState<number>(() => {
    if (typeof window === "undefined") return 1024;
    return window.innerWidth;
  });

  // Use useLayoutEffect to update width synchronously before paint
  // This ensures correct breakpoint calculation on first render without flash
  useLayoutEffect(() => {
    // Update width immediately before browser paint to ensure correct calculations
    // This fixes the issue where first load shows incorrect behavior on mobile
    setW((prevW) => {
      const actualWidth = window.innerWidth;
      // Only update if different to avoid unnecessary re-renders
      return actualWidth !== prevW ? actualWidth : prevW;
    });
  }, []); // Empty deps - only run once on mount to ensure correct initial width

  // Set up resize listener
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return w;
}

export default function BrandScroller({
  speed = 30,
  speedPxPerSec,
  speedMobile,
  speedSm,
  speedLg,
  pauseOnHover = true,
  className = "",
}: BrandScrollerProps) {
  const width = useViewportWidth();

  const currentSpeedSec =
    width < 640 && speedMobile !== undefined
      ? speedMobile
      : width < 1024 && speedSm !== undefined
      ? speedSm
      : width >= 1024 && speedLg !== undefined
      ? speedLg
      : speed;

  // Pixel velocity for AutoScroll:
  // Prefer explicit override; otherwise map duration to viewport width per second.
  // This keeps speed changes intuitive and prevents "bullet train" behavior.
  const derivedPxPerSecRaw = Math.round(width / Math.max(1, currentSpeedSec));
  // Clamp to keep motion reasonable across extreme values (allow very slow speeds)
  const derivedPxPerSec = Math.max(2, Math.min(80, derivedPxPerSecRaw));
  const pxPerSec = speedPxPerSec !== undefined ? speedPxPerSec : derivedPxPerSec;

  // Plugin-driven smooth auto scroll (no manual RAF)
  const plugins = [
    AutoScroll({
      speed: pxPerSec,
      startDelay: 50,
      stopOnInteraction: false,
      stopOnMouseEnter: pauseOnHover,
      stopOnFocusIn: pauseOnHover,
    }),
  ];

  const [emblaRef] = useEmblaCarousel({ loop: true, align: "start", dragFree: true, skipSnaps: true }, plugins);

  return (
    <div className={cn("w-full overflow-hidden", className)} ref={emblaRef}>
      <div className="flex items-center gap-4 sm:gap-6 lg:gap-8">
        {/* Leading gap so the wrap from the last item back to the first has space */}
        <div className="w-1 sm:w-2 flex-shrink-0"></div>
        {/* First set of logos */}
        {brandLogos.map((brand) => (
          <BrandItem key={`first-${brand.id}`} brand={brand} />
        ))}

        {/* Second set of logos for seamless loop with proper gap */}
        {brandLogos.map((brand) => (
          <BrandItem key={`second-${brand.id}`} brand={brand} />
        ))}
      </div>
    </div>
  );
}

interface BrandItemProps {
  brand: BrandLogo;
}

function BrandItem({ brand }: BrandItemProps) {
  return (
    <BrandLogoCard
      brand={brand}
      widthClass="w-[140px] sm:w-[160px] lg:w-[200px]"
      heightClass="h-[60px] sm:h-[70px] lg:h-[90px]"
    />
  );
}
