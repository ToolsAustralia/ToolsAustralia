"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import MiniDrawCard, { type MiniDrawCardData } from "@/components/features/MiniDrawCard";

interface RelatedMiniDrawsProps {
  draws: MiniDrawCardData[];
}

export default function RelatedMiniDraws({ draws }: RelatedMiniDrawsProps) {
  if (draws.length === 0) return null;

  return (
    <section className="mt-14 sm:mt-16">
      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white font-['Poppins']">You May Also Like</h2>
        <Link
          href="/mini-draws"
          className="text-[#ee0000] dark:text-red-400 hover:text-[#cc0000] dark:hover:text-red-300 font-medium flex items-center gap-1 text-sm transition-colors"
        >
          <span className="hidden sm:inline">View All Mini Draws</span>
          <span className="sm:hidden">View All</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
        {draws.map((draw, index) => (
          <MiniDrawCard key={draw._id} miniDraw={draw} index={index} viewMode="grid" />
        ))}
      </div>
    </section>
  );
}
