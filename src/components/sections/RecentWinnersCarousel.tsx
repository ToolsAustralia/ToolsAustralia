"use client";

import { Trophy, Calendar, Award, MapPin } from "lucide-react";
import { formatDateInAEST } from "@/utils/common/timezone";

interface Winner {
  id: string;
  name: string;
  location: string;
  prize: string;
  drawDate: string;
  entryNumber: number;
  prizeValue?: number;
  image?: string;
}

interface WinnersSectionProps {
  className?: string;
  title?: string;
  subtitle?: string;
}

export default function WinnersSection({
  className = "",
  title = "Recent Winners",
  subtitle = "Congratulations to our recent major draw winners! Your dreams can come true too.",
}: WinnersSectionProps) {
  // Mock winners data - in a real app, this would come from props or API
  const winners: Winner[] = [
    {
      id: "1",
      name: "John Smith",
      location: "Sydney, NSW",
      prize: "MG HS SUV",
      drawDate: "2024-01-15",
      entryNumber: 1247,
      prizeValue: 35000,
    },
    {
      id: "2",
      name: "Sarah Johnson",
      location: "Melbourne, VIC",
      prize: "iPhone 15 Pro Max",
      drawDate: "2023-12-15",
      entryNumber: 892,
      prizeValue: 2500,
    },
    {
      id: "3",
      name: "Michael Brown",
      location: "Brisbane, QLD",
      prize: "European Holiday Package",
      drawDate: "2023-11-15",
      entryNumber: 2156,
      prizeValue: 8000,
    },
    {
      id: "4",
      name: "Emma Wilson",
      location: "Perth, WA",
      prize: "Smart Home Package",
      drawDate: "2023-10-15",
      entryNumber: 1843,
      prizeValue: 5000,
    },
    {
      id: "5",
      name: "James Taylor",
      location: "Adelaide, SA",
      prize: "Luxury Spa Retreat",
      drawDate: "2023-09-15",
      entryNumber: 967,
      prizeValue: 2000,
    },
    {
      id: "6",
      name: "Lisa Anderson",
      location: "Hobart, TAS",
      prize: "Cash Prize",
      drawDate: "2023-08-15",
      entryNumber: 1432,
      prizeValue: 10000,
    },
  ];

  return (
    <section
      className={`relative py-16 lg:py-20 bg-gradient-to-br from-gray-50 via-white to-gray-50 w-full overflow-visible ${className}`}
    >
      <div className="relative w-full px-4 sm:px-6 lg:px-8 lg:max-w-7xl lg:mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Trophy className="w-8 h-8 lg:w-10 lg:h-10 text-yellow-500" />
            <h2 className="text-[28px] sm:text-[32px] lg:text-[40px] font-bold text-gray-900 font-['Poppins']">
              🎉 {title}
            </h2>
          </div>
          <p className="text-[16px] lg:text-[18px] text-gray-600 max-w-3xl mx-auto leading-relaxed">{subtitle}</p>
        </div>

        {/* Winners Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {winners.map((winner, index) => (
            <div
              key={winner.id}
              className="bg-white rounded-3xl shadow-lg border border-gray-100 hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 overflow-hidden"
            >
              {/* Winner Image Card */}
              <div className="relative h-48 bg-gradient-to-br from-gray-100 to-gray-200">
                {/* Winner Badge - Top Right */}
                <div className="absolute top-3 right-3 z-10">
                  <div className="bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 text-black px-3 py-1 rounded-full font-bold text-xs shadow-xl shadow-yellow-500/50 border border-yellow-300">
                    WINNER #{index + 1}
                  </div>
                </div>

                {/* Prize Badge - Top Left */}
                <div className="absolute top-3 left-3 z-10">
                  <div className="bg-gradient-to-r from-red-500 via-red-600 to-red-700 text-white px-3 py-1 rounded-full font-bold text-xs shadow-xl shadow-red-500/50 border border-red-400">
                    {winner.prizeValue ? `$${winner.prizeValue.toLocaleString()}` : "PRIZE"}
                  </div>
                </div>

                {/* Placeholder for winner image - you can replace with actual winner photos */}
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center text-white font-bold text-2xl shadow-lg mx-auto mb-2">
                      {winner.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </div>
                    <div className="text-gray-600 text-sm font-medium">Winner Photo</div>
                  </div>
                </div>
              </div>

              {/* Winner Information Below Image */}
              <div className="p-6">
                {/* Winner Name and Location */}
                <div className="text-center mb-4">
                  <h3 className="text-[18px] font-bold text-gray-900 mb-1">{winner.name}</h3>
                  <div className="flex items-center justify-center gap-1 text-gray-600">
                    <MapPin className="w-4 h-4" />
                    <span className="text-[14px]">{winner.location}</span>
                  </div>
                </div>

                {/* Prize Information */}
                <div className="bg-gradient-to-r from-red-50 to-orange-50 rounded-2xl p-4 border border-red-100 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Trophy className="w-5 h-5 text-yellow-500" />
                    <span className="text-[16px] font-semibold text-gray-900">{winner.prize}</span>
                  </div>
                  {winner.prizeValue && (
                    <div className="text-[14px] font-bold text-red-600">
                      ${winner.prizeValue.toLocaleString()} Value
                    </div>
                  )}
                </div>

                {/* Win Details */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-500" />
                    <span className="text-[14px] text-gray-600">
                      Won on {formatDateInAEST(new Date(winner.drawDate), "MMMM dd, yyyy")}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-gray-500" />
                    <span className="text-[14px] text-gray-600">Entry #{winner.entryNumber}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
