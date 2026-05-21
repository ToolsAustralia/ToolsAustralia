"use client";

import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import BrandScroller from "@/components/ui/BrandScroller";

export default function BrandsShowcase() {
  const brandsRef = useScrollAnimation();

  return (
    <section ref={brandsRef} className="py-4 bg-gradient-to-br from-gray-50 to-white dark:from-neutral-900 dark:to-neutral-950">
      <div className="w-full   mx-auto">
        {/* Section Header */}
        <div className="text-center mb-4">
          <p className="text-sm sm:text-base lg:text-lg text-gray-600 dark:text-neutral-400 font-['Inter'] font-semibold max-w-2xl mx-auto tracking-wide">
            WIN AUSTRALIA&apos;S TOP TOOL BRANDS
          </p>
        </div>

        {/* Brand Logos Section - CSS Marquee */}
        <div className="w-full relative z-10">
          <BrandScroller speed={800} speedMobile={400} />
        </div>
      </div>
    </section>
  );
}
