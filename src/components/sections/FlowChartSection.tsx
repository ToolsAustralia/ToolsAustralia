"use client";

import Image from "next/image";
import MetallicDivider from "@/components/ui/MetallicDivider";

/**
 * FlowChartSection component displays the membership flow chart
 * showing how entries, major draws, and point redemption work.
 * Uses a dark slate background to match FAQ and contact pages.
 */
export default function FlowChartSection() {
  return (
    <section className="bg-gradient-to-b from-black via-slate-900 to-black relative overflow-hidden">
      {/* Metallic Divider at the top */}
      <MetallicDivider height="h-[2px]" className="absolute top-0 left-0 right-0" />

      {/* Content Container */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Flow Chart Image */}
        <div className="w-full flex justify-center items-center">
          <div className="relative w-full max-w-2xl">
            <Image
              src="/images/charts/flowChart.png"
              alt="Membership Flow Chart - How entries, major draws, and point redemption work"
              width={600}
              height={600}
              className="object-contain w-full h-auto"
              priority
            />
          </div>
        </div>
      </div>

      {/* Metallic Divider at the bottom */}
      <MetallicDivider height="h-[2px]" className="absolute bottom-0 left-0 right-0" />
    </section>
  );
}
