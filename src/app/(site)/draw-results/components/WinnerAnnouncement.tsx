"use client";

import { WinnerSummary } from "@/types/winner";
import Image from "next/image";
import Link from "next/link";
import { Trophy, Target, Clock, CheckCircle } from "lucide-react";

interface WinnerAnnouncementProps {
  latestWinner: WinnerSummary;
}

export default function WinnerAnnouncement({ latestWinner }: WinnerAnnouncementProps) {
  const heroImage =
    latestWinner.imageUrl || latestWinner.prize.images[0] || "/images/placeholders/prize-placeholder.png";

  return (
    <div className="bg-gradient-to-br from-[#ee0000] via-red-600 to-red-700 rounded-2xl shadow-xl p-6 sm:p-8 mb-8 text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-black/10"></div>
      <div className="relative">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
            <Trophy className="w-8 h-8 text-white" />
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold font-['Poppins']">Latest Winner!</h2>
            <p className="text-white/90">Congratulations to our most recent mini draw winner</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
          {/* Prize Details */}
          <div className="space-y-4">
            <div>
              <h3 className="text-xl sm:text-2xl font-bold mb-2 font-['Poppins']">{latestWinner.prize.name}</h3>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-white/90">Prize Value:</span>
                <span className="text-2xl font-bold text-white">${latestWinner.prize.value.toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm sm:text-base">
                <div className="p-1.5 bg-white/20 rounded-lg">
                  <Target className="w-4 h-4 text-white" />
                </div>
                <span>
                  Winning Ticket: <strong>#{latestWinner.entryNumber}</strong>
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm sm:text-base">
                <div className="p-1.5 bg-white/20 rounded-lg">
                  <Clock className="w-4 h-4 text-white" />
                </div>
                <span>
                  Selected:{" "}
                  <strong>
                    {new Date(latestWinner.selectedDate).toLocaleDateString("en-AU", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm sm:text-base">
                <div className="p-1.5 bg-white/20 rounded-lg">
                  <CheckCircle className="w-4 h-4 text-white" />
                </div>
                <span>
                  Cycle: <strong>#{latestWinner.cycle}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Prize Image and Status */}
          <div className="flex flex-col items-center text-center">
            <div className="w-32 h-32 sm:w-40 sm:h-40 mx-auto mb-4 bg-white/20 rounded-2xl overflow-hidden backdrop-blur-sm">
              <Image
                src={heroImage}
                alt={latestWinner.prize.name}
                width={160}
                height={160}
                className="w-full h-full object-contain p-2"
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2">
                <CheckCircle className="w-5 h-5 text-white" />
                <p className="text-white font-semibold">Winner Confirmed</p>
              </div>
              <div className="bg-white/20 rounded-xl p-4 backdrop-blur-sm">
                <p className="text-white font-medium">Draw: {latestWinner.drawName}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="mt-8 pt-6 border-t border-white/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-white/90 text-sm sm:text-base">
                Want to be the next winner? Join our active mini draws!
              </p>
            </div>
            <Link
              href="/mini-draws"
              className="inline-flex items-center justify-center bg-white text-[#ee0000] px-4 sm:px-6 py-2 sm:py-3 rounded-xl hover:bg-gray-100 transition-colors duration-200 font-semibold text-sm sm:text-base shadow-lg w-auto"
            >
              <Target className="w-4 h-4 mr-2" />
              View Active Draws
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
