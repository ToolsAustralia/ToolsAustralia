"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import AutoScroll from "embla-carousel-auto-scroll";
import { brandLogos, BrandLogo } from "@/data/brandLogos";
import BrandLogoCard from "@/components/ui/BrandLogoCard";
import { useInViewportAnimation } from "@/hooks/useInViewportAnimation";
import { addThrottledResize } from "@/utils/dom/listenerHelpers";
import { cn } from "@/utils/cn";

interface BrandScrollerProps {
  speed?: number;
  speedPxPerSec?: number;
  speedMobile?: number;
  speedSm?: number;
  speedLg?: number;
  pauseOnHover?: boolean;
  className?: string;
}

function useViewportWidth() {
  const [w, setW] = useState<number>(() => {
    if (typeof window === "undefined") return 1024;
    return window.innerWidth;
  });
  useLayoutEffect(() => {
    setW((prev) => {
      const actual = window.innerWidth;
      return actual !== prev ? actual : prev;
    });
  }, []);
  useEffect(() => addThrottledResize(() => setW(window.innerWidth)), []);
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
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInViewportAnimation(rootRef);

  const currentSpeedSec =
    width < 640 && speedMobile !== undefined
      ? speedMobile
      : width < 1024 && speedSm !== undefined
      ? speedSm
      : width >= 1024 && speedLg !== undefined
      ? speedLg
      : speed;

  const derivedPxPerSecRaw = Math.round(width / Math.max(1, currentSpeedSec));
  const derivedPxPerSec = Math.max(2, Math.min(80, derivedPxPerSecRaw));
  const pxPerSec = speedPxPerSec !== undefined ? speedPxPerSec : derivedPxPerSec;

  // Capture initial pxPerSec at first render so the plugin starts at the *correct* speed.
  // Live updates still happen via the useEffect below; recreating the plugin would reinit Embla.
  const initialPxPerSecRef = useRef<number | null>(null);
  if (initialPxPerSecRef.current === null) {
    initialPxPerSecRef.current = pxPerSec;
  }

  const options = useMemo(
    () => ({ loop: true, align: "start" as const, dragFree: true, skipSnaps: true }),
    []
  );
  const plugins = useMemo(
    () => [
      AutoScroll({
        speed: initialPxPerSecRef.current!,
        startDelay: 50,
        stopOnInteraction: false,
        stopOnMouseEnter: pauseOnHover,
        stopOnFocusIn: pauseOnHover,
      }),
    ],
    [pauseOnHover]
  );

  const [emblaRef, emblaApi] = useEmblaCarousel(options, plugins);

  // Update plugin speed live without recreating the plugin (avoids reinit storm).
  useEffect(() => {
    if (!emblaApi) return;
    const auto = emblaApi.plugins().autoScroll;
    if (!auto) return;
    const opts = (auto as unknown as { options?: { speed: number } }).options;
    if (opts) opts.speed = pxPerSec;
    (auto as unknown as { reset?: () => void }).reset?.();
  }, [emblaApi, pxPerSec]);

  // Pause/play when off/on screen.
  useEffect(() => {
    if (!emblaApi) return;
    const auto = emblaApi.plugins().autoScroll;
    if (!auto) return;
    if (inView) (auto as unknown as { play?: () => void }).play?.();
    else (auto as unknown as { stop?: () => void }).stop?.();
  }, [emblaApi, inView]);

  return (
    <div ref={rootRef} className={cn("w-full overflow-hidden", className)} data-carousel="true">
      <div ref={emblaRef} style={{ touchAction: "pan-y pinch-zoom" }}>
        <div className="flex items-center gap-4 sm:gap-6 lg:gap-8">
          <div className="w-1 sm:w-2 flex-shrink-0" />
          {brandLogos.map((brand) => (
            <BrandItem key={`first-${brand.id}`} brand={brand} />
          ))}
          {brandLogos.map((brand) => (
            <BrandItem key={`second-${brand.id}`} brand={brand} />
          ))}
        </div>
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
