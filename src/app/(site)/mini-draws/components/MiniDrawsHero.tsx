"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { Ticket, Trophy, Sparkles } from "lucide-react";
import MetallicDivider from "@/components/ui/MetallicDivider";

export default function MiniDrawsHero() {
  const prefersReduced = useReducedMotion();
  const duration = prefersReduced ? 0 : 0.6;

  return (
    <div className="relative pt-[var(--app-header-h)] sm:pt-[var(--app-header-h-lg)] pb-10 sm:pb-14 bg-gradient-to-b from-black via-slate-900 to-black overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/background/miniDrawPage-bg.webp"
          alt="Tools Australia"
          fill
          className="object-cover"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-black/50" />
      </div>

      {/* Dot pattern overlay */}
      <div className="absolute inset-0 z-[1] pattern-dots-white opacity-40" />

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12">
        <div className="flex flex-col items-center text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration, delay: 0.1 }}
          >
            <span className="inline-flex items-center gap-1.5 bg-white/10 backdrop-blur-sm border border-white/20 px-3 py-1.5 rounded-full text-xs sm:text-sm text-white/90 font-medium mb-4 sm:mb-6">
              <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
              Win Premium Tools & Gear
            </span>
          </motion.div>

          {/* Title */}
          <motion.h1
            className="text-[36px] sm:text-[48px] lg:text-[60px] font-bold font-poppins leading-tight mb-4 sm:mb-5"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration, delay: 0.2 }}
          >
            <span className="text-white">Mini </span>
            <span className="bg-gradient-to-r from-red-600 to-red-400 bg-clip-text text-transparent">Draws</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            className="text-base sm:text-lg text-gray-300 max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration, delay: 0.35 }}
          >
            Enter exciting mini draws to win amazing tools, equipment, and accessories worth thousands of dollars.
            Mini packs start from just <span className="text-white font-semibold">$1</span>.
          </motion.p>

          {/* Stats Row */}
          <motion.div
            className="flex items-center justify-center gap-4 sm:gap-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration, delay: 0.5 }}
          >
            <div className="flex items-center gap-2 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl px-4 py-2.5 sm:px-5 sm:py-3">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-br from-red-600 to-red-675 flex items-center justify-center shadow-lg shadow-red-600/30">
                <Ticket className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="text-left">
                <div className="text-white font-bold text-sm sm:text-base">From $1</div>
                <div className="text-gray-400 text-2xs sm:text-xs">Per Pack</div>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl px-4 py-2.5 sm:px-5 sm:py-3">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-br from-red-600 to-red-675 flex items-center justify-center shadow-lg shadow-red-600/30">
                <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="text-left">
                <div className="text-white font-bold text-sm sm:text-base">Real Winners</div>
                <div className="text-gray-400 text-2xs sm:text-xs">Every Draw</div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Metallic Border */}
      <MetallicDivider height="h-[2px]" className="absolute bottom-0 left-0 right-0" />
    </div>
  );
}
