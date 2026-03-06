"use client";

import { WinnerSummary } from "@/types/winner";
import Image from "next/image";
import { Calendar } from "lucide-react";
import { formatWinnerName } from "@/utils/winner-name-formatter";

interface DrawResultCardProps {
  winner: WinnerSummary;
}

export default function DrawResultCard({ winner }: DrawResultCardProps) {
  const selectedDate = new Date(winner.selectedDate);
  const displayImage = winner.imageUrl || winner.prize.images[0] || "/images/placeholders/prize-placeholder.png";
  const winnerDisplayName = formatWinnerName(winner.winnerFirstName, winner.winnerLastName);

  const formatDate = (date: Date) =>
    date.toLocaleDateString("en-AU", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  return (
    <div className="group relative bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200/50 overflow-hidden hover:shadow-xl hover:scale-[1.02] transition-all duration-500">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-gradient-to-br from-red-50/20 via-transparent to-red-50/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="relative z-10">
        {/* Prize Image */}
        <div className="relative w-full h-40 sm:h-48 rounded-t-2xl overflow-hidden">
          <Image
            src={displayImage}
            alt={winner.prize.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-700"
            sizes="(max-width: 640px) 50vw, 25vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
          <div className="absolute top-3 right-3">
            <span className="bg-gradient-to-r from-red-500 to-red-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg">
              ✓ Completed
            </span>
          </div>
        </div>

        {/* Draw Information - matches CompletedDrawsSection (no sub text, no trophy icon) */}
        <div className="p-4 sm:p-5 space-y-4">
          <h3 className="text-lg font-bold text-gray-900 font-['Poppins'] leading-tight line-clamp-2">
            {winner.drawName}
          </h3>

          {/* Draw Stats - stack on mobile for readability */}
          <div className="flex flex-col sm:grid sm:grid-cols-2 gap-2 sm:gap-3">
            <div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-4 h-4 text-red-500 shrink-0" />
                <span className="text-xs font-medium text-gray-600 whitespace-nowrap">Drawn</span>
              </div>
              <p className="text-sm font-bold text-gray-900 break-words">{formatDate(selectedDate)}</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-gray-600 whitespace-nowrap">Winner</span>
              </div>
              <p className="text-sm font-bold text-gray-900 break-words">{winnerDisplayName}</p>
            </div>
          </div>

          {/* View Draw Button */}
          <a
            href={`/mini-draws/${winner.drawId}`}
            className="block w-full bg-gradient-to-r from-red-600 to-red-700 text-white px-4 py-2.5 rounded-xl text-center font-semibold text-sm hover:from-red-700 hover:to-red-800 transition-all duration-200 shadow-md"
          >
            View Draw
          </a>
        </div>
      </div>
    </div>
  );
}
