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
    <div className="relative pt-[var(--app-header-h)] sm:pt-[var(--app-header-h-lg)] pb-[18px] sm:pb-12 bg-gradient-to-b from-black via-slate-900 to-slate-900 overflow-hidden">
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
          className="flex items-center gap-1.5 text-[11.5px] sm:text-[13.5px] text-[#94A3B8] pt-3.5 pb-3 sm:pb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: d, delay: 0.05 }}
        >
          <Link href="/" className="whitespace-nowrap hover:text-white transition-colors">Home</Link>
          <ChevronRight className="w-[11px] h-[11px] flex-shrink-0 text-[#475569]" />
          <Link href="/mini-draws" className="whitespace-nowrap hover:text-white transition-colors">Mini Draws</Link>
          <ChevronRight className="w-[11px] h-[11px] flex-shrink-0 text-[#475569]" />
          <span className="text-[#CBD5E1] font-medium truncate max-w-[150px] sm:max-w-[280px]">{drawName}</span>
        </motion.nav>

        {/* Brand + Status + Quick Actions — single row */}
        <motion.div
          className="flex items-center gap-[7px] sm:gap-2.5 mb-3 sm:mb-[18px] overflow-x-auto brand-scrollbar"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: d, delay: 0.1 }}
        >
          <span className={cn("inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-[11px] py-[5px] text-[11px] font-extrabold sm:px-3.5 sm:py-[7px] sm:text-[13px] bg-gradient-to-r", gradient, textClass, "shadow-sm")}>
            <Trophy className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            {brandLabel}
          </span>
          {isActive && (
            <span className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-[rgba(34,197,94,.32)] bg-[rgba(34,197,94,.15)] px-2.5 py-[5px] text-[11px] font-bold text-[#4ADE80] backdrop-blur-sm sm:px-3 sm:py-[7px] sm:text-[13px]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4ADE80] opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#4ADE80]" />
              </span>
              Live draw
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

          {/* From $1 + Share — same row, pushed right. The $1 card is desktop-only: on
              mobile the sticky buy bar already carries the price, so it read as duplication. */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 ml-auto flex-shrink-0">
            {isActive && (
              <div className="hidden sm:flex items-center gap-2.5 bg-white/5 backdrop-blur-sm border border-white/[.12] rounded-[14px] px-4 py-2">
                <div className="w-[34px] h-[34px] rounded-[10px] bg-gradient-to-br from-red-600 to-red-675 flex items-center justify-center shadow-lg shadow-red-600/25">
                  <Ticket className="w-[17px] h-[17px] text-white" />
                </div>
                <div className="text-left">
                  <div className="text-white font-bold text-sm leading-tight">$1</div>
                  <div className="text-[#94A3B8] text-[11.5px] leading-tight">Entry</div>
                </div>
              </div>
            )}
            <button
              onClick={handleShare}
              className="flex h-8 w-8 items-center justify-center rounded-[11px] border border-white/15 bg-white/[.06] text-[#CBD5E1] backdrop-blur-sm transition-all duration-200 hover:border-white/30 hover:text-white sm:h-[46px] sm:w-[46px] sm:rounded-[13px]"
              aria-label="Share mini draw"
            >
              <Share2 className="w-[15px] h-[15px] sm:w-[19px] sm:h-[19px]" />
            </button>
          </div>
        </motion.div>

        {/* Prize Name */}
        <motion.h1
          className="text-[21px] leading-[1.25] tracking-[-0.01em] sm:text-[28px] lg:text-[36px] lg:leading-[1.2] lg:tracking-[-0.02em] max-w-[900px] font-extrabold font-poppins text-white text-pretty mb-3.5 sm:mb-[22px]"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: d, delay: 0.18 }}
        >
          {drawName}
        </motion.h1>

        {/* Entry Progress Inline */}
        <motion.div
          className="max-w-[480px]"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: d, delay: 0.28 }}
        >
          <div className="flex items-baseline justify-between mb-1.5 sm:mb-2">
            <span className="text-[12.5px] sm:text-[14.5px] text-[#94A3B8]">
              {entriesRemaining > 0
                ? <><span className="text-white font-bold">{entriesRemaining.toLocaleString()}</span> entries remaining</>
                : <span className="text-red-500 font-semibold">All entries allocated</span>}
            </span>
            <span className="text-[11px] sm:text-[13px] text-[#64748B] font-semibold">
              {totalEntries.toLocaleString()} / {minimumEntries.toLocaleString()}
            </span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-[7px] sm:h-2 overflow-hidden backdrop-blur-sm">
            <motion.div
              className={`h-full rounded-full bg-gradient-to-r ${
                entriesRemaining <= 0 || percentage >= 85
                  ? "from-red-600 to-red-675"
                  : percentage >= 60
                  ? "from-yellow-400 to-yellow-500"
                  : "from-green-500 to-green-600"
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
