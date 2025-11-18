"use client";

import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import BrandScroller from "@/components/ui/BrandScroller";

export default function BrandsShowcase() {
  const brandsRef = useScrollAnimation();

  return (
    <section ref={brandsRef} className="py-4 bg-gradient-to-br from-gray-50 to-white">
      <div className="w-full   mx-auto">
        {/* Section Header */}
        <div className="text-center mb-4">
          <p className="text-sm sm:text-base lg:text-lg text-gray-600 font-['Inter'] font-semibold max-w-2xl mx-auto">
            Win huge tool prizes from Australia&apos;s best brands!
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
