"use client";

import React from "react";
import Image from "next/image";
import { Calendar, Trophy, Ticket, Sparkles } from "lucide-react";
import { formatWinnerNameFromString } from "@/utils/winner-name-formatter";
import type { PastDrawWithUserEntries } from "./types";

const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

function formatDrawDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-AU", DATE_FORMAT_OPTIONS);
}

function getPrizeImageUrl(draw: PastDrawWithUserEntries): string | null {
  if (draw.prize?.images && draw.prize.images.length > 0) {
    return draw.prize.images[0];
  }
  if (draw.winner?.imageUrl) {
    return draw.winner.imageUrl;
  }
  return null;
}

interface PastDrawCardProps {
  draw: PastDrawWithUserEntries;
  drawIndex: number;
  totalDraws: number;
}

/**
 * PastDrawCard — single past-draw row inside PastDrawsModal.
 * Mirrors the suite design language: dark-mode native surface, glowing eyebrow
 * pill, acumin headline, refined entries badge with red gradient, subtle hover
 * lift + red border highlight.
 */
const PastDrawCard: React.FC<PastDrawCardProps> = ({
  draw,
  drawIndex,
  totalDraws,
}) => {
  const imageUrl = getPrizeImageUrl(draw);
  const drawNumber = totalDraws - drawIndex;
  const winnerName = draw.winner ? formatWinnerNameFromString(draw.winner.name) : null;

  return (
    <div className="group relative rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 sm:p-4 shadow-sm transition-all duration-200 overflow-hidden hover:border-red-500/40 dark:hover:border-red-400/40 hover:shadow-[0_8px_24px_rgba(238,0,0,0.12)] hover:-translate-y-px">
      <div className="flex flex-row gap-3 sm:gap-4">
        {/* Prize image — bigger, with subtle red ring on hover */}
        <div className="relative flex-shrink-0 w-24 h-24 sm:w-32 sm:h-32 rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-700 group-hover:border-red-400/50 dark:group-hover:border-red-400/40 transition-colors duration-200">
          {imageUrl ? (
            <>
              <Image
                src={imageUrl}
                alt={draw.prize?.name || draw.name}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-500"
                sizes="(max-width: 640px) 96px, 128px"
              />
              {/* Subtle bottom-fade so any text inside the image stays legible */}
              <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent" />
            </>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-red-100 via-red-200 to-red-300 dark:from-red-950 dark:via-red-900 dark:to-red-950 flex items-center justify-center">
              <Ticket className="w-8 h-8 sm:w-10 sm:h-10 text-red-400 dark:text-red-500" />
            </div>
          )}
        </div>

        {/* Right column — eyebrow pill, headline, meta row, entries badge */}
        <div className="flex-1 min-w-0 flex flex-col justify-between gap-2">
          <div>
            {/* Eyebrow pill — "DRAW #N" matches the hero pill design language */}
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-extrabold tracking-[0.18em] uppercase border border-red-500/30 dark:border-red-400/30 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 mb-1.5">
              <Sparkles className="h-2.5 w-2.5" />
              <span>Draw #{drawNumber}</span>
            </div>

            {/* Acumin headline — matches the suite typography */}
            <h4 className="font-acumin text-[18px] sm:text-[20px] leading-tight uppercase text-neutral-900 dark:text-white truncate">
              {draw.name}
            </h4>
          </div>

          {/* Meta row — date + winner, with iconified glow tiles */}
          <div className="flex flex-wrap items-center gap-2 gap-y-1.5">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-neutral-600 dark:text-neutral-300 font-medium">
              <span
                className="inline-flex items-center justify-center w-4 h-4 rounded bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-400"
                aria-hidden
              >
                <Calendar className="w-2.5 h-2.5" />
              </span>
              {formatDrawDate(draw.drawDate)}
            </span>
            {winnerName && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-neutral-600 dark:text-neutral-300 font-medium min-w-0">
                <span
                  className="inline-flex items-center justify-center w-4 h-4 rounded bg-amber-500/15 dark:bg-amber-500/25 text-amber-600 dark:text-amber-400 flex-none"
                  aria-hidden
                >
                  <Trophy className="w-2.5 h-2.5" />
                </span>
                <span className="truncate max-w-[140px]">{winnerName}</span>
              </span>
            )}
          </div>

          {/* Entries badge — refined red gradient (matches Plan 4 Button primary) */}
          <div>
            <span className="inline-flex items-center gap-1.5 bg-gradient-to-b from-red-600 to-red-800 text-white font-bold text-xs px-2.5 py-1 rounded-md shadow-[0_2px_6px_rgba(238,0,0,0.25)]">
              <Ticket className="w-3 h-3" />
              {draw.userEntryCount.toLocaleString()}{" "}
              {draw.userEntryCount === 1 ? "Entry" : "Entries"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PastDrawCard;
