"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronRight, Ticket, Trophy, Share2 } from "lucide-react";
import MetallicDivider from "@/components/ui/MetallicDivider";
import { cn } from "@/utils/cn";

interface DetailHeroBannerProps {
  prizeName: string;
  drawName: string;
  prizeImage?: string;
  brandLabel: string;
  brandGradient?: string;
  brandTextClass?: string;
  isActive: boolean;
  isSoldOut: boolean;
  isCompleted: boolean;
  isCancelled: boolean;
  totalEntries: number;
  minimumEntries: number;
  entriesRemaining: number;
}

export default function DetailHeroBanner({
  prizeName: _prizeName,
  drawName,
  prizeImage,
  brandLabel,
  brandGradient,
  brandTextClass,
  isActive,
  isSoldOut,
  isCompleted,
  isCancelled,
  totalEntries,
  minimumEntries,
  entriesRemaining,
}: DetailHeroBannerProps) {
  const prefersReduced = useReducedMotion();
  const d = prefersReduced ? 0 : 0.5;
  const gradient = brandGradient || "from-red-700 via-red-600 to-red-700";
  const textClass = brandTextClass || "text-white";
  const percentage = minimumEntries > 0 ? Math.min(100, Math.round((totalEntries / minimumEntries) * 100)) : 0;

  const handleShare = () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({
        title: drawName,
        text: `Check out this mini draw: ${drawName}! Get your entries now!`,
        url: window.location.href,
      });
    } else if (typeof navigator !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
    }
  };

  return (
    <div className="relative pt-[var(--app-header-h)] sm:pt-[var(--app-header-h-lg)] pb-8 sm:pb-12 bg-gradient-to-b from-black via-slate-900 to-slate-900 overflow-hidden">
      {/* Blurred Prize Image Background */}
      {prizeImage && (
        <div className="absolute inset-0 z-0">
          <Image
            src={prizeImage}
            alt=""
            fill
            className="object-cover blur-2xl scale-110 opacity-15"
            priority
            sizes="100vw"
          />
        </div>
      )}

      {/* Dark overlay + pattern */}
      <div className="absolute inset-0 z-[1] bg-gradient-to-b from-black/60 via-black/40 to-slate-900" />
      <div className="absolute inset-0 z-[2] pattern-radial-grid opacity-20" />

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumbs */}
        <motion.nav
          className="flex items-center gap-1 text-xs sm:text-sm text-gray-400 pt-4 pb-5 sm:pb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: d, delay: 0.05 }}
        >
          <Link href="/" className="hover:text-white transition-colors">Home</Link>
          <ChevronRight className="w-3 h-3 flex-shrink-0 text-gray-600 dark:text-neutral-400" />
          <Link href="/mini-draws" className="hover:text-white transition-colors">Mini Draws</Link>
          <ChevronRight className="w-3 h-3 flex-shrink-0 text-gray-600 dark:text-neutral-400" />
          <span className="text-gray-300 font-medium truncate max-w-[180px] sm:max-w-[280px]">{drawName}</span>
        </motion.nav>

        {/* Brand + Status + Quick Actions — single row */}
        <motion.div
          className="flex items-center gap-1.5 sm:gap-2 mb-3 sm:mb-4 overflow-x-auto brand-scrollbar"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: d, delay: 0.1 }}
        >
          <span className={cn("inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r", gradient, textClass, "shadow-sm")}>
            <Trophy className="w-3 h-3" />
            {brandLabel}
          </span>
          {isActive && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs sm:text-xs font-semibold bg-green-500/15 text-green-400 border border-green-500/30 backdrop-blur-sm">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-400" />
              </span>
              Live Draw
            </span>
          )}
          {isSoldOut && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-2xs sm:text-xs font-semibold bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
              Entries Closed
            </span>
          )}
          {isCompleted && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-2xs sm:text-xs font-semibold bg-gray-500/20 text-gray-400 border border-gray-500/30">
              Completed
            </span>
          )}
          {isCancelled && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-2xs sm:text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
              Cancelled
            </span>
          )}

          {/* From $1 + Share — same row, pushed right */}
          <div className="flex items-center gap-1.5 sm:gap-2 ml-auto flex-shrink-0">
            {isActive && (
              <div className="flex items-center gap-1 sm:gap-2 bg-white/5 backdrop-blur-sm border border-white/10 rounded-lg sm:rounded-xl px-1.5 py-1 sm:px-4 sm:py-2.5">
                <div className="w-5 h-5 sm:w-8 sm:h-8 rounded sm:rounded-lg bg-gradient-to-br from-red-600 to-red-675 flex items-center justify-center shadow-md sm:shadow-lg shadow-red-600/25">
                  <Ticket className="w-2.5 h-2.5 sm:w-4 sm:h-4 text-white" />
                </div>
                <div className="text-left">
                  <div className="text-white font-bold text-2xs sm:text-sm leading-tight">$1</div>
                  <div className="text-gray-400 text-3xs sm:text-2xs leading-tight">Entry</div>
                </div>
              </div>
            )}
            <button
              onClick={handleShare}
              className="p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl border border-white/15 bg-white/5 backdrop-blur-sm text-gray-400 hover:text-white hover:border-white/30 transition-all duration-200"
              aria-label="Share mini draw"
            >
              <Share2 className="w-3 h-3 sm:w-5 sm:h-5" />
            </button>
          </div>
        </motion.div>

        {/* Prize Name */}
        <motion.h1
          className="text-xl sm:text-2xl lg:text-[2rem] xl:text-[2.25rem] font-bold font-['Poppins'] text-white leading-tight mb-3 sm:mb-4"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: d, delay: 0.18 }}
        >
          {drawName}
        </motion.h1>

        {/* Entry Progress Inline */}
        <motion.div
          className="max-w-md"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: d, delay: 0.28 }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs sm:text-sm text-gray-400">
              {entriesRemaining > 0
                ? <><span className="text-white font-semibold">{entriesRemaining.toLocaleString()}</span> entries remaining</>
                : <span className="text-red-600 font-semibold">All entries allocated</span>}
            </span>
            <span className="text-xs text-gray-500 font-medium">
              {totalEntries.toLocaleString()} / {minimumEntries.toLocaleString()}
            </span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden backdrop-blur-sm">
            <motion.div
              className={`h-full rounded-full bg-gradient-to-r ${
                entriesRemaining <= 0 || percentage >= 85
                  ? "from-red-600 to-red-400"
                  : percentage >= 60
                  ? "from-yellow-400 to-yellow-500"
                  : "from-green-400 to-green-500"
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${percentage}%` }}
              transition={
                prefersReduced
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 50, damping: 15, delay: 0.5 }
              }
            />
          </div>
        </motion.div>
      </div>

      {/* Metallic Border */}
      <MetallicDivider height="h-[2px]" className="absolute bottom-0 left-0 right-0" />
    </div>
  );
}
