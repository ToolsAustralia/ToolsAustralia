"use client";

import { useState, useEffect } from "react";
import { Clock, Calendar, Truck, Zap, Shield, IdCard } from "lucide-react";
import { useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";

import { useScrollAnimation } from "@/hooks/useScrollAnimation";

export default function GiveawayDetails() {
  const { data: currentMajorDraw, isLoading } = useCurrentMajorDraw();
  const detailsRef = useScrollAnimation();
  const [isMounted, setIsMounted] = useState(false);
  const [formattedDates, setFormattedDates] = useState({
    entriesClose: "TBA",
    drawDate: "TBA",
    timezone: "",
  });

  // Set mounted state after component mounts to prevent hydration mismatch
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    // Only format dates after component has mounted to prevent hydration mismatch
    if (!isMounted) return;

    if (currentMajorDraw?.drawDate && currentMajorDraw?.freezeEntriesAt) {
      const drawDate = new Date(currentMajorDraw.drawDate);
      const freezeDate = new Date(currentMajorDraw.freezeEntriesAt);

      // Get timezone abbreviation
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const timezoneAbbr =
        new Date()
          .toLocaleDateString(undefined, {
            timeZoneName: "short",
          })
          .split(" ")
          .pop() || timezone;

      setFormattedDates({
        entriesClose: freezeDate.toLocaleDateString(undefined, {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        drawDate: drawDate.toLocaleDateString(undefined, {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        timezone: timezoneAbbr,
      });
    } else {
      // Reset to TBA if data is not available
      setFormattedDates({
        entriesClose: "TBA",
        drawDate: "TBA",
        timezone: "",
      });
    }
  }, [currentMajorDraw, isMounted]);

  const details = [
    {
      icon: Clock,
      title: `Entries Close (${formattedDates.timezone || ""})`,
      description: !isMounted || isLoading ? "TBA" : formattedDates.entriesClose,
      color: "text-red-500",
      bgColor: "bg-gradient-to-br from-gray-700/90 via-gray-600/90 to-gray-700/90",
    },
    {
      icon: Calendar,
      title: `Draw Date (${formattedDates.timezone || ""})`,
      description: !isMounted || isLoading ? "TBA" : formattedDates.drawDate,
      color: "text-red-500",
      bgColor: "bg-gradient-to-br from-gray-700/90 via-gray-600/90 to-gray-700/90",
    },
    {
      icon: Truck,
      title: "Delivery",
      description: "Australia-wide, free of charge",
      color: "text-red-500",
      bgColor: "bg-gradient-to-br from-gray-700/90 via-gray-600/90 to-gray-700/90",
    },
    {
      icon: Zap,
      title: "We'll Call You",
      description: "Winner contacted by phone at the draw",
      color: "text-red-500",
      bgColor: "bg-gradient-to-br from-gray-700/90 via-gray-600/90 to-gray-700/90",
    },
    {
      icon: Shield,
      title: "Eligibility",
      description: "Open to all Australian residents 18+ (Excluding SA & ACT)",
      color: "text-red-500",
      bgColor: "bg-gradient-to-br from-gray-700/90 via-gray-600/90 to-gray-700/90",
    },
    {
      icon: IdCard,
      title: "License Numbers",
      description: "NTP/15640",
      color: "text-red-500",
      bgColor: "bg-gradient-to-br from-gray-700/90 via-gray-600/90 to-gray-700/90",
    },
  ];

  return (
    <section
      ref={detailsRef}
      className="py-6 sm:py-12 lg:py-16 relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"
    >
      <div className="w-full px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto relative z-10">
        {/* Section Header */}
        <div className="text-center mb-3 sm:mb-8">
          <h2 className="text-xl sm:text-3xl lg:text-4xl font-bold font-['Poppins'] mb-4 drop-shadow-lg text-white">
            HOW IT WORKS
          </h2>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6 stagger-animation">
          {details.map((detail, index) => (
            <div
              key={index}
              className="relative bg-gradient-to-br from-gray-800/95 via-gray-700/95 to-gray-800/95 backdrop-blur-sm rounded-xl p-3 sm:p-4 
                         shadow-[0_8px_32px_rgba(0,0,0,0.5)]
                         border border-gray-600/40
                         flex items-center gap-2 sm:gap-4"
            >
              {/* Metallic shine overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent rounded-xl pointer-events-none"></div>

              {/* Icon Container - Left Side */}
              <div className="relative flex-shrink-0">
                <div
                  className={`w-8 h-8 sm:w-12 sm:h-12 ${detail.bgColor} backdrop-blur-sm rounded-xl flex items-center justify-center 
                             shadow-[0_4px_16px_rgba(0,0,0,0.3)] border-2 border-white/20 relative overflow-hidden`}
                >
                  {/* Metallic shine effect for icon */}
                  <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent rounded-xl"></div>
                  <detail.icon className={`w-4 h-4 sm:w-6 sm:h-6 ${detail.color} relative z-10`} />
                </div>
              </div>

              {/* Content - Right Side */}
              <div className="flex-1 relative z-10">
                <h3 className="text-sm sm:text-lg font-bold text-white font-['Poppins'] mb-0.5 sm:mb-1 drop-shadow-md">
                  {detail.title}
                </h3>
                <p className="text-gray-200 font-['Inter'] leading-relaxed text-xs sm:text-sm">{detail.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
