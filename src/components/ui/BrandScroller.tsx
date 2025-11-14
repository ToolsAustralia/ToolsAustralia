"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import useEmblaCarousel from "embla-carousel-react";
import AutoScroll from "embla-carousel-auto-scroll";
import { brandLogos, BrandLogo } from "@/data/brandLogos";

interface BrandScrollerProps {
  speed?: number; // seconds for one full brand set pass (desktop default)
  speedPxPerSec?: number; // optional: direct pixel velocity override
  speedMobile?: number; // <640px
  speedSm?: number; // 640–1023px
  speedLg?: number; // ≥1024px
  pauseOnHover?: boolean;
  className?: string;
}

function useViewportWidth() {
  const [w, setW] = useState<number>(typeof window === "undefined" ? 1024 : window.innerWidth);
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
    <div className={`w-full overflow-hidden ${className}`} ref={emblaRef}>
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
  const gradientClass = brand.splitGradient
    ? `bg-gradient-to-b from-green-900 from-0% via-green-800 via-50% to-gray-900 to-50%`
    : `bg-gradient-to-br ${brand.gradient}`;

  return (
    <div className="flex-shrink-0 w-[140px] sm:w-[160px] lg:w-[200px]">
      <div
        className={`flex items-center justify-center w-full h-[60px] sm:h-[70px] lg:h-[90px] rounded-xl ${gradientClass} shadow-lg relative overflow-visible`}
      >
        {brand.hasOverlay && (
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/10 rounded-xl pointer-events-none" />
        )}
        <Image
          src={brand.logo}
          alt={brand.name}
          width={120}
          height={48}
          className={`h-8 sm:h-10 lg:h-12 w-auto object-contain drop-shadow-md relative z-10 ${
            brand.imageScale && brand.imageScale !== 1 ? "scale-150" : ""
          }`}
          style={{
            transform: brand.imageScale && brand.imageScale !== 1 ? `scale(${brand.imageScale})` : undefined,
          }}
          unoptimized
        />
      </div>
    </div>
  );
}
