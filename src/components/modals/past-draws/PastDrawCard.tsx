"use client";

import React from "react";
import Image from "next/image";
import { Calendar, Award, Ticket } from "lucide-react";
import { formatWinnerNameFromString } from "@/utils/winner-name-formatter";
import type { PastDrawWithUserEntries } from "./types";

const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "long",
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

const PastDrawCard: React.FC<PastDrawCardProps> = ({
  draw,
  drawIndex,
  totalDraws,
}) => {
  const imageUrl = getPrizeImageUrl(draw);
  const drawNumber = totalDraws - drawIndex;

  return (
    <div className="group relative rounded-2xl border border-gray-100 bg-white p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden">
      <div className="flex flex-row gap-3 sm:gap-4">
        {/* Prize Image */}
        <div className="relative flex-shrink-0 w-24 h-24 sm:w-32 sm:h-32 rounded-xl overflow-hidden">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={draw.prize?.name || draw.name}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-500"
              sizes="(max-width: 640px) 96px, 128px"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-red-100 via-red-200 to-red-300 flex items-center justify-center">
              <Ticket className="w-8 h-8 sm:w-10 sm:h-10 text-red-400" />
            </div>
          )}
          {imageUrl && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
          )}
        </div>

        {/* Draw Info */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          {/* Header Row */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center bg-gray-100 text-gray-600 text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full">
                Draw #{drawNumber}
              </span>
            </div>
            <h4 className="text-sm sm:text-base font-bold text-gray-900 font-['Poppins'] truncate leading-tight">
              {draw.name}
            </h4>
          </div>

          {/* Date + Winner Row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Calendar className="w-3 h-3 text-red-500 flex-shrink-0" />
              <span>{formatDrawDate(draw.drawDate)}</span>
            </div>
            {draw.winner && (
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <Award className="w-3 h-3 text-red-500 flex-shrink-0" />
                <span className="truncate max-w-[120px]">
                  {formatWinnerNameFromString(draw.winner.name)}
                </span>
              </div>
            )}
          </div>

          {/* Your Entries Badge */}
          <div className="mt-2">
            <span className="inline-flex items-center gap-1.5 bg-gradient-to-r from-amber-400 to-yellow-500 text-black font-bold text-xs sm:text-sm px-2.5 py-1 rounded-lg shadow-sm">
              <Ticket className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              {draw.userEntryCount} {draw.userEntryCount === 1 ? "Entry" : "Entries"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PastDrawCard;
