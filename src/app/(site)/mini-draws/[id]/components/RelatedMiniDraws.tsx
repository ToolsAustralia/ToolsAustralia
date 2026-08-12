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
    <section className="pt-[18px] sm:pt-14">
      <div className="flex items-center justify-between pb-3 sm:pb-6">
        <h2 className="font-poppins text-[16px] font-extrabold text-[#111827] dark:text-white sm:text-[22px]">
          You may also like
        </h2>
        <Link
          href="/mini-draws"
          className="flex items-center gap-1 text-[12.5px] font-semibold text-red-600 transition-colors hover:text-red-675 dark:text-red-400 sm:text-sm"
        >
          <span className="hidden sm:inline">View all mini draws</span>
          <span className="sm:hidden">View all</span>
          <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-[11px] lg:grid-cols-4 lg:gap-5">
        {draws.map((draw, index) => (
          <MiniDrawCard key={draw._id} miniDraw={draw} index={index} viewMode="compact" />
        ))}
      </div>
    </section>
  );
}
