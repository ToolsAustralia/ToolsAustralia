"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { m, useReducedMotion } from "framer-motion";
import { Ticket, Flame, Zap } from "lucide-react";
import { getBrandMeta } from "@/utils/brand-utils";
import { useUserContext } from "@/contexts/UserContext";
import { useMiniDraw } from "@/hooks/queries/useMiniDrawQueries";
import { cn } from "@/utils/cn";

export interface MiniDrawCardData {
  _id: string;
  name: string;
  status: "active" | "completed" | "cancelled";
  totalEntries: number;
  minimumEntries: number;
  entriesRemaining?: number;
  brandId?: string;
  prize: {
    name: string;
    value: number;
    images: string[];
  };
}

interface MiniDrawCardProps {
  miniDraw: MiniDrawCardData;
  index?: number;
  /** `compact` is the related-draws treatment: entries strip on the image, no brand chip. */
  viewMode?: "grid" | "list" | "compact";
  /**
   * When provided, the card opens this handler (e.g. an in-place entry sheet) instead of
   * navigating to the mini-draw detail page. Used by the dashboard Draws tab.
   */
  onSelect?: () => void;
  /**
   * When provided, only the CTA diverges: it opens the quick-enter sheet while the image
   * and title still navigate to the detail page. Used by the `/mini-draws` browse grid.
   */
  onEnter?: () => void;
}

/** Wraps a region in a link (navigate) OR a button (in-place `onSelect`) — module-level so the subtree never remounts. */
function CardShell({ onSelect, href, className, children }: { onSelect?: () => void; href: string; className?: string; children: React.ReactNode }) {
  if (onSelect) {
    return (
      <button type="button" onClick={onSelect} className={cn("w-full text-left", className)}>
        {children}
      </button>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

function getUrgencyBadge(percentage: number, status: string) {
  if (status !== "active") return null;
  if (percentage >= 90)
    return {
      label: "Almost Full",
      icon: Flame,
      className: "bg-gradient-to-r from-red-600 to-red-675 text-white",
    };
  if (percentage >= 70)
    return {
      label: "Hot",
      icon: Zap,
      className: "bg-gradient-to-r from-amber-400 to-orange-500 text-[#111827]",
    };
  return null;
}

/** Same three-band rule EntryProgressBar uses, so every fill bar on the site agrees. */
function progressFillClass(percentage: number): string {
  if (percentage >= 85) return "from-red-600 to-red-675";
  if (percentage >= 60) return "from-yellow-400 to-yellow-500";
  return "from-green-500 to-green-600";
}

export default function MiniDrawCard({
  miniDraw,
  index = 0,
  viewMode = "grid",
  onSelect,
  onEnter,
}: MiniDrawCardProps) {
  const prefersReduced = useReducedMotion();
  const { userData, isAuthenticated } = useUserContext();

  const { data: liveData } = useMiniDraw(miniDraw._id);

  const totalEntries = liveData?.totalEntries ?? miniDraw.totalEntries ?? 0;
  const minimumEntries = liveData?.minimumEntries ?? miniDraw.minimumEntries ?? 0;
  const entriesRemaining =
    liveData?.entriesRemaining ??
    miniDraw.entriesRemaining ??
    Math.max(minimumEntries - totalEntries, 0);
  const percentage =
    minimumEntries > 0 ? Math.min(100, Math.round((totalEntries / minimumEntries) * 100)) : 0;

  const isClosed =
    miniDraw.status === "completed" || (miniDraw.status === "active" && entriesRemaining <= 0);
  const isCancelled = miniDraw.status === "cancelled";

  const brandMeta = getBrandMeta(miniDraw.brandId);
  const urgencyBadge = getUrgencyBadge(percentage, miniDraw.status);

  const getUserEntryCount = (): number => {
    if (!isAuthenticated || !userData) return 0;
    const currentId = String(miniDraw._id);
    const userWithParticipation = userData as unknown as {
      miniDrawParticipation?: Array<{
        miniDrawId: string | { toString(): string };
        totalEntries: number;
      }>;
    };
    const participation = userWithParticipation?.miniDrawParticipation?.find((p) => {
      const id = p.miniDrawId;
      return typeof id === "string" ? id === currentId : id?.toString() === currentId;
    });
    return participation?.totalEntries ?? 0;
  };

  const userEntries = getUserEntryCount();
  const detailHref = `/mini-draws/${miniDraw._id}`;
  const statusLabel = isCancelled ? "Cancelled" : isClosed ? "Closed" : "Active";
  const ctaLabel = isCancelled ? "Cancelled" : isClosed ? "View draw" : "Enter draw";
  /** The CTA diverges from the card body only when a caller supplies its own handler. */
  const ctaAction = onEnter ?? onSelect;

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: prefersReduced ? 0 : 0.4,
        delay: prefersReduced ? 0 : index * 0.06,
        ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
      },
    },
  };

  const statusDot = (
    <span
      className={cn(
        "h-1.5 w-1.5 shrink-0 rounded-full",
        isCancelled ? "bg-red-500" : isClosed ? "bg-yellow-500" : "bg-[#22C55E]"
      )}
    />
  );

  const progressTrack = (heightClass: string) => (
    <div className={cn("w-full overflow-hidden rounded-full bg-[#EEF0F3] dark:bg-neutral-800", heightClass)}>
      <m.div
        className={cn("h-full rounded-full bg-gradient-to-r", progressFillClass(percentage))}
        initial={{ width: 0 }}
        animate={{ width: `${percentage}%` }}
        transition={
          prefersReduced ? { duration: 0 } : { type: "spring", stiffness: 60, damping: 15, delay: 0.2 }
        }
      />
    </div>
  );

  const ctaInner = (
    <>
      <span className="font-semibold opacity-65">$1</span>
      <Ticket className="h-[13px] w-[13px] lg:h-[15px] lg:w-[15px]" />
      {ctaLabel}
    </>
  );

  /* ── List View ── */
  if (viewMode === "list") {
    return (
      <m.div variants={cardVariants} initial="hidden" animate="visible">
        <div className="group flex overflow-hidden rounded-2xl border border-[#F0F1F4] bg-white shadow-[0_4px_16px_-12px_rgba(15,23,42,.35)] transition-shadow duration-300 hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900">
          <div className="w-[104px] shrink-0 sm:w-[136px]">
            <CardShell onSelect={onSelect} href={detailHref} className="relative block h-full min-h-[104px] overflow-hidden bg-white">
              <Image
                src={miniDraw.prize.images[0] || "/images/placeholder-product.jpg"}
                alt={miniDraw.prize.name}
                fill
                className="object-contain p-2 transition-transform duration-500 group-hover:scale-[1.04]"
                sizes="(max-width: 640px) 104px, 136px"
              />
            </CardShell>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-2.5 sm:p-3">
            <div className="flex items-center gap-1.5">
              {statusDot}
              <span className="text-[10.5px] font-semibold text-[#6B7280] dark:text-neutral-400">{statusLabel}</span>
              {brandMeta && (
                <span className="ml-auto rounded-[5px] bg-[#F3F4F6] px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.03em] text-[#374151] dark:bg-neutral-800 dark:text-neutral-300">
                  {brandMeta.name}
                </span>
              )}
            </div>
            <CardShell onSelect={onSelect} href={detailHref} className="block">
              <h3 className="line-clamp-2 text-[13px] font-bold leading-[1.35] text-[#111827] transition-colors group-hover:text-red-600 dark:text-white">
                {miniDraw.name}
              </h3>
            </CardShell>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-bold text-[#111827] dark:text-white">
                {entriesRemaining.toLocaleString()} <span className="font-medium text-[#6B7280] dark:text-neutral-400">left</span>
              </span>
              <span className="text-[10px] font-semibold text-[#9CA3AF]">{percentage}%</span>
            </div>
            {progressTrack("h-[5px]")}
            {ctaAction ? (
              <button
                type="button"
                onClick={ctaAction}
                className="mt-0.5 inline-flex h-8 items-center gap-1.5 self-start rounded-full bg-gradient-to-r from-[#111827] to-black px-3.5 text-[11.5px] font-bold text-white transition-all hover:from-red-600 hover:to-red-675"
              >
                {ctaInner}
              </button>
            ) : (
              <Link
                href={detailHref}
                className="mt-0.5 inline-flex h-8 items-center gap-1.5 self-start rounded-full bg-gradient-to-r from-[#111827] to-black px-3.5 text-[11.5px] font-bold text-white transition-all group-hover:from-red-600 group-hover:to-red-675"
              >
                {ctaInner}
              </Link>
            )}
          </div>
        </div>
      </m.div>
    );
  }

  /* ── Compact View (related draws) ── */
  if (viewMode === "compact") {
    return (
      <m.div variants={cardVariants} initial="hidden" animate="visible" className="h-full">
        <div className="group flex h-full flex-col overflow-hidden rounded-[18px] border border-[#F0F1F4] bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <CardShell onSelect={onSelect} href={detailHref} className="relative block aspect-[4/3] w-full overflow-hidden bg-white">
            <Image
              src={miniDraw.prize.images[0] || "/images/placeholder-product.jpg"}
              alt={miniDraw.prize.name}
              fill
              className="object-contain p-2.5 pb-6 transition-transform duration-500 group-hover:scale-[1.04]"
              sizes="(max-width: 640px) 50vw, 25vw"
            />
            {/* black/75, not the handoff's /60: with `contain` the strip now sits on WHITE
                rather than on a photo, and /60 over white is rgb(102,102,102) — ~3.9:1 against
                white 9.5px text, under the 4.5:1 floor. /75 restores it to ~7:1. */}
            <span className="absolute inset-x-0 bottom-0 bg-black/75 px-1.5 py-1 text-center text-[9.5px] font-semibold text-white">
              {entriesRemaining > 0 ? `${entriesRemaining.toLocaleString()} entries remaining` : "Entries closed"}
            </span>
          </CardShell>
          <div className="flex flex-1 flex-col gap-1.5 px-2.5 pb-2.5 pt-2.5">
            <div className="flex items-center gap-1.5">
              {statusDot}
              <span className="text-[10px] font-semibold text-[#6B7280] dark:text-neutral-400">{statusLabel}</span>
            </div>
            <CardShell onSelect={onSelect} href={detailHref} className="block">
              <h4 className="line-clamp-2 min-h-[32px] text-[12px] font-bold leading-[1.35] text-[#111827] transition-colors group-hover:text-red-600 dark:text-white">
                {miniDraw.name}
              </h4>
            </CardShell>
            <div className="mt-auto">{progressTrack("h-[5px]")}</div>
            <Link
              href={detailHref}
              className="flex h-[34px] items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-[#111827] to-black text-[11.5px] font-bold text-white transition-all group-hover:from-red-600 group-hover:to-red-675"
            >
              <span className="font-semibold opacity-65">$1</span>
              <Ticket className="h-3 w-3" />
              {isCancelled ? "Cancelled" : isClosed ? "View" : "Enter"}
            </Link>
          </div>
        </div>
      </m.div>
    );
  }

  /* ── Grid View ── */
  return (
    <m.div variants={cardVariants} initial="hidden" animate="visible" className="h-full">
      <div className="group flex h-full flex-col overflow-hidden rounded-[18px] border border-[#F0F1F4] bg-white shadow-[0_4px_16px_-10px_rgba(15,23,42,.35)] transition-shadow duration-300 hover:shadow-lg lg:border-[#EAECEF] lg:shadow-[0_6px_20px_-16px_rgba(15,23,42,.5)] dark:border-neutral-800 dark:bg-neutral-900">
        {/* PRIZE IMAGES ARE PRODUCT SHOTS ON WHITE — `contain`, not `cover`.
            `cover` cropped a tall tool chest top-and-bottom and beheaded the dial indicator,
            and the old bottom scrim greyed out the lower half of every white photo (it only
            ever existed to make a white logo overlay legible; the brand chip carries its own
            ring now). Padding keeps the product off the card edge. */}
        <CardShell onSelect={onSelect} href={detailHref} className="relative block aspect-[4/3] w-full overflow-hidden bg-white">
          <Image
            src={miniDraw.prize.images[0] || "/images/placeholder-product.jpg"}
            alt={miniDraw.prize.name}
            fill
            className="object-contain p-2 transition-transform duration-500 group-hover:scale-[1.04] lg:p-4"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />

          {/* The buyer's own entries — kept from the previous card, it is the only place
              the browse grid surfaces "you're already in this draw". */}
          {userEntries > 0 && (
            <span className="absolute left-[7px] top-[7px] inline-flex items-center gap-1 rounded-full bg-[#22C55E] px-2 py-[3px] text-[9.5px] font-extrabold text-white shadow-[0_6px_14px_-6px_rgba(0,0,0,.6)]">
              <Ticket className="h-[11px] w-[11px]" />
              {userEntries} {userEntries === 1 ? "entry" : "entries"}
            </span>
          )}

          {urgencyBadge && (
            <span
              className={cn(
                "absolute top-[7px] inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[9.5px] font-extrabold shadow-[0_6px_14px_-6px_rgba(0,0,0,.6)] lg:text-[10px]",
                userEntries > 0 ? "right-[7px]" : "left-[7px]",
                urgencyBadge.className
              )}
            >
              <urgencyBadge.icon className="h-[11px] w-[11px] lg:h-3 lg:w-3" />
              {urgencyBadge.label}
            </span>
          )}

          {/* ring + shadow, because the chip now sits on a near-white photo rather than on a
              dark scrim — a plain white pill would dissolve into the product background. */}
          {brandMeta && (
            <span className="absolute bottom-1.5 right-1.5 flex h-[22px] items-center rounded-md bg-white/95 px-[7px] text-[9.5px] font-extrabold uppercase tracking-[0.03em] text-[#111827] shadow-sm ring-1 ring-black/[0.06] backdrop-blur-[2px] lg:bottom-2.5 lg:right-2.5 lg:h-6 lg:rounded-[7px] lg:px-2.5 lg:text-[10.5px]">
              {brandMeta.name}
            </span>
          )}
        </CardShell>

        <div className="flex flex-1 flex-col gap-[7px] px-[11px] pb-[11px] pt-2.5 lg:gap-2.5 lg:p-4">
          <div className="flex items-center gap-1.5">
            {statusDot}
            <span className="text-[10.5px] font-semibold text-[#6B7280] dark:text-neutral-400 lg:text-[12px]">
              {statusLabel}
            </span>
          </div>

          <CardShell onSelect={onSelect} href={detailHref} className="block">
            <h3 className="line-clamp-2 min-h-[34px] text-[12.5px] font-bold leading-[1.35] text-[#111827] text-pretty transition-colors group-hover:text-red-600 dark:text-white lg:min-h-[42px] lg:text-[15.5px]">
              {miniDraw.name}
            </h3>
          </CardShell>

          <div className="mt-auto flex flex-col gap-1 lg:gap-1.5">
            <div className="flex items-baseline justify-between gap-1">
              <span className="text-[11px] font-bold text-[#111827] dark:text-white lg:text-[13px]">
                {entriesRemaining.toLocaleString()}{" "}
                <span className="font-medium text-[#6B7280] dark:text-neutral-400">
                  <span className="lg:hidden">left</span>
                  <span className="hidden lg:inline">remaining</span>
                </span>
              </span>
              <span className="text-[10px] font-semibold text-[#9CA3AF] lg:text-[12px]">{percentage}%</span>
            </div>
            {progressTrack("h-[5px] lg:h-1.5")}
          </div>

          {ctaAction ? (
            <button
              type="button"
              onClick={ctaAction}
              className="mt-[3px] flex h-[38px] items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-[#111827] to-black text-[12px] font-bold text-white transition-all duration-300 hover:from-red-600 hover:to-red-675 hover:shadow-md hover:shadow-red-600/20 lg:mt-1 lg:h-[46px] lg:gap-2 lg:text-[14px]"
            >
              {ctaInner}
            </button>
          ) : (
            <Link
              href={detailHref}
              className="mt-[3px] flex h-[38px] items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-[#111827] to-black text-[12px] font-bold text-white transition-all duration-300 group-hover:from-red-600 group-hover:to-red-675 group-hover:shadow-md group-hover:shadow-red-600/20 lg:mt-1 lg:h-[46px] lg:gap-2 lg:text-[14px]"
            >
              {ctaInner}
            </Link>
          )}
        </div>
      </div>
    </m.div>
  );
}
