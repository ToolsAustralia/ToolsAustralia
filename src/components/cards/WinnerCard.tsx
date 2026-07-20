"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DEFAULT_PRIZE_SLUG } from "@/config/prize-summaries";
import type { WinnerSummary } from "@/types/winner";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { formatWinnerName } from "@/utils/winner-name-formatter";
import { getWinnerDisplayDate } from "@/utils/winners";
import { cn } from "@/utils/cn";

export type WinnerCardData = WinnerSummary;

interface WinnerCardProps {
  winner: WinnerCardData;
  className?: string;
  /** When false, matches homepage Latest Winners (no draw link). Default true for /winners. */
  showDrawLink?: boolean;
}

function getContrastText(hex: string) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.62 ? "#111827" : "#ffffff";
}

export default function WinnerCard({
  winner,
  className = "",
  showDrawLink = true,
}: WinnerCardProps) {
  const theme = usePromoTheme();
  const themeTextColor = getContrastText(theme.primary);

  const displayImage =
    winner.imageUrl || winner.prize.images[0] || "/images/promotion/PrizeHeader/PrizeHeader.webp";
  const formattedName = formatWinnerName(winner.winnerFirstName, winner.winnerLastName);
  const prizeLabel = winner.selectedPrize || winner.prize.name;
  const prizeLine = prizeLabel.length > 34 ? `${prizeLabel.slice(0, 34).trim()}...` : prizeLabel;
  const drawTypeLabel = winner.drawType === "major" ? "MAJOR DRAW WINNER" : "MINI DRAW WINNER";
  const badgeLabel = `${getWinnerDisplayDate(winner).toUpperCase()} ${drawTypeLabel}`;

  const destination =
    winner.drawType === "major"
      ? `/promotions/${DEFAULT_PRIZE_SLUG}`
      : "/mini-draws";

  return (
    <Link
      href={destination}
      aria-label={`${formattedName} – ${badgeLabel}`}
      className={cn("group/card block overflow-hidden rounded-[24px] border bg-white shadow-[0_18px_42px_rgba(15,23,42,0.10)] transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-[0_22px_48px_rgba(15,23,42,0.16)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:border-neutral-700 dark:bg-neutral-900", className)}
      style={{ borderColor: theme.borderRgba }}
    >
      <div className="relative overflow-hidden bg-slate-950 px-4 pb-4 pt-4 text-white lg:px-3 lg:pb-3 lg:pt-3">
        <div
          className="absolute inset-0 opacity-90"
          style={{
            background: `radial-gradient(circle at top right, ${theme.shadowRgba.replace(/,\s*[\d.]+\)/, ", 0.22)")}, transparent 28%), radial-gradient(circle at bottom left, rgba(238,0,0,0.16), transparent 30%)`,
          }}
        />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/15 to-transparent" />

        <div className="relative z-10">
          <div className="mb-3 text-center lg:mb-2">
            <span
              className="inline-flex max-w-full whitespace-nowrap rounded-full border px-2.5 py-1 text-3xs font-bold uppercase leading-none tracking-[0.08em] shadow-sm backdrop-blur sm:px-3 sm:text-2xs sm:tracking-[0.12em] lg:px-2.5 lg:text-3xs lg:tracking-[0.1em]"
              style={{ borderColor: theme.borderRgba, backgroundColor: "rgba(2,6,23,0.62)" }}
            >
              {badgeLabel}
            </span>
          </div>

          <div
            className="rounded-[20px] p-[3px] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
            style={{
              background: `linear-gradient(135deg, ${theme.primaryDark} 0%, ${theme.primary} 48%, ${theme.primaryLight} 100%)`,
            }}
          >
            <div className="group relative aspect-[4/4.1] overflow-hidden rounded-[16px] bg-slate-900">
              <Image
                src={displayImage}
                alt={`${formattedName} - ${winner.drawName}`}
                fill
                className="object-cover transition-transform duration-700 ease-out motion-reduce:transition-none group-hover:scale-[1.03] motion-reduce:group-hover:scale-100"
                sizes="(max-width: 768px) 88vw, (max-width: 1280px) 46vw, 31vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h3 className="min-w-0 flex-1 text-[1.65rem] font-bold leading-tight tracking-tight font-['Poppins'] text-white sm:text-[1.8rem] lg:text-[1.25rem]">
              {formattedName}
            </h3>
            <span
              className="inline-flex flex-shrink-0 items-center rounded-full px-3 py-1.5 text-2xs font-bold uppercase tracking-[0.16em] shadow-[0_8px_18px_rgba(15,23,42,0.20)] lg:px-2.5 lg:py-1 lg:text-3xs lg:tracking-[0.12em]"
              style={{ background: theme.gradient, color: themeTextColor }}
            >
              <span className="sm:hidden">1st Prize</span>
              <span className="hidden sm:inline">1st Prize Winner</span>
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-200 lg:text-xs">{prizeLine}</p>
        </div>
      </div>

      <div className="relative bg-white px-5 py-5 text-center dark:bg-neutral-900 lg:px-4 lg:py-4">
        <div className="absolute inset-x-0 top-0 h-px" style={{ background: theme.gradient }} />
        <p className="text-sm text-slate-500 dark:text-neutral-400 lg:text-xs">Congratulations to our winner!</p>

        {showDrawLink && (
          <div
            className="mt-4 flex items-center justify-between rounded-2xl border px-4 py-3.5 text-sm font-bold uppercase tracking-[0.14em] shadow-[0_14px_30px_rgba(15,23,42,0.14)] dark:border-slate-600 lg:mt-3 lg:px-3 lg:py-3 lg:text-xs lg:tracking-[0.12em]"
            style={{
              background: theme.gradient,
              color: themeTextColor,
              borderColor: theme.borderRgba,
            }}
          >
            <span>{winner.drawType === "major" ? "Explore this promotion" : "View mini draws"}</span>
            <ArrowRight className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover/card:translate-x-1" />
          </div>
        )}
      </div>
    </Link>
  );
}
