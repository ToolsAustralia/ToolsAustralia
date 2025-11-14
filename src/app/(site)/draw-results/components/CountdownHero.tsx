"use client";

import React from "react";
import { useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";
import HorizontalCountdown from "@/components/sections/HorizontalCountdown";

export default function CountdownHero() {
  const { data: currentMajorDraw, isLoading } = useCurrentMajorDraw();

  if (isLoading) {
    return (
      <section className="bg-gradient-to-br from-red-50 via-white to-red-50 py-12 sm:py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading major draw...</p>
          </div>
        </div>
      </section>
    );
  }

  if (!currentMajorDraw) {
    return null; // Don't show countdown if no major draw
  }

  return (
    <section className="relative bg-gradient-to-br from-red-100 via-white to-red-50 py-16 sm:py-20 lg:py-24 overflow-visible">
      {/* Subtle Background Effects */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/3 to-transparent"></div>
      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-transparent via-transparent to-gray-100/30"></div>

      {/* Minimal Floating Elements */}
      <div className="absolute top-32 left-16 w-24 h-24 bg-red-500/5 rounded-full blur-2xl"></div>
      <div className="absolute bottom-32 right-20 w-20 h-20 bg-red-500/8 rounded-full blur-xl"></div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Horizontal Countdown Component */}
        <HorizontalCountdown />
      </div>
    </section>
  );
}
