"use client";

import { WinnerSummary } from "@/types/winner";
import Image from "next/image";

interface DrawResultCardProps {
  winner: WinnerSummary;
}

export default function DrawResultCard({ winner }: DrawResultCardProps) {
  const selectedDate = new Date(winner.selectedDate);
  const displayImage = winner.imageUrl || winner.prize.images[0] || "/images/placeholders/prize-placeholder.png";

  return (
    <div className="bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow duration-200">
      {/* Prize Image */}
      <div className="aspect-w-16 aspect-h-9 bg-gray-200 rounded-t-lg overflow-hidden relative">
        <Image
          src={displayImage}
          alt={winner.prize.name}
          width={400}
          height={225}
          className="w-full h-48 object-cover"
        />

        {/* Winner Badge */}
        <div className="absolute top-4 right-4 bg-green-500 text-white px-3 py-1 rounded-full text-sm font-medium">
          🎉 Winner Selected
        </div>
      </div>

      <div className="p-6">
        {/* Prize Name and Value */}
        <h3 className="text-xl font-bold text-gray-900 mb-2 line-clamp-2">{winner.prize.name}</h3>
        <p className="text-lg font-semibold text-green-600 mb-4">Value: ${winner.prize.value.toLocaleString()}</p>

        {/* Draw Statistics */}
        <div className="space-y-3 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Winning Entry</span>
            <span className="font-semibold text-gray-900">#{winner.entryNumber}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Cycle</span>
            <span className="font-semibold text-gray-900">#{winner.cycle}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Draw Ended</span>
            <span className="font-semibold text-gray-900">
              {selectedDate.toLocaleDateString("en-AU", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>
        </div>

        {/* Winner Information */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
          <div className="flex items-center mb-2">
            <svg className="w-5 h-5 text-green-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <h4 className="font-semibold text-green-800">Winner Announced!</h4>
          </div>
          <p className="text-green-700 text-sm mb-1">Draw: {winner.drawName}</p>
          <p className="text-green-700 text-sm mb-1">Winning Ticket: #{winner.entryNumber}</p>
          <p className="text-green-600 text-xs">
            Selected on{" "}
            {selectedDate.toLocaleDateString("en-AU", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>

        {/* Odds Information */}
        <div className="text-center mb-4"></div>

        {/* View Details Button */}
        <a
          className="block w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200 text-center"
          href={`/mini-draws/${winner.drawId}`}
        >
          View Draw
        </a>
      </div>
    </div>
  );
}
