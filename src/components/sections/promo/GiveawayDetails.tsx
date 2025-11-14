"use client";

import { useState, useEffect } from "react";
import { Clock, Calendar, Truck, Zap, Shield, Gift } from "lucide-react";
import { useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";

import { useScrollAnimation } from "@/hooks/useScrollAnimation";

export default function GiveawayDetails() {
  const { data: currentMajorDraw, isLoading } = useCurrentMajorDraw();
  const detailsRef = useScrollAnimation();
  const [formattedDates, setFormattedDates] = useState({
    entriesClose: "",
    drawDate: "",
    timezone: "",
  });

  useEffect(() => {
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
    }
  }, [currentMajorDraw]);

  const details = [
    {
      icon: Clock,
      title: `Entries Close (${formattedDates.timezone || "Loading..."})`,
      description: isLoading ? "Loading..." : formattedDates.entriesClose || "TBA",
      color: "text-red-500",
      bgColor: "bg-gradient-to-br from-slate-600/80 via-slate-500/80 to-slate-600/80",
    },
    {
      icon: Calendar,
      title: `Draw Date (${formattedDates.timezone || "Loading..."})`,
      description: isLoading ? "Loading..." : formattedDates.drawDate || "TBA",
      color: "text-red-500",
      bgColor: "bg-gradient-to-br from-slate-600/80 via-slate-500/80 to-slate-600/80",
    },
    {
      icon: Truck,
      title: "Delivery",
      description: "Australia-wide, free of charge",
      color: "text-red-500",
      bgColor: "bg-gradient-to-br from-slate-600/80 via-slate-500/80 to-slate-600/80",
    },
    {
      icon: Zap,
      title: "Entry Type",
      description: "Auto or manual entry via package",
      color: "text-red-500",
      bgColor: "bg-gradient-to-br from-slate-600/80 via-slate-500/80 to-slate-600/80",
    },
    {
      icon: Shield,
      title: "Eligibility",
      description: "Open to all Australian residents 18+",
      color: "text-red-500",
      bgColor: "bg-gradient-to-br from-slate-600/80 via-slate-500/80 to-slate-600/80",
    },
    {
      icon: Gift,
      title: "Bonus Entries",
      description: "For package subscribers",
      color: "text-red-500",
      bgColor: "bg-gradient-to-br from-slate-600/80 via-slate-500/80 to-slate-600/80",
    },
  ];

  return (
    <section
      ref={detailsRef}
      className="py-6 sm:py-12 lg:py-16 bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900 relative overflow-hidden"
    >
      {/* Add metallic shine overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-white/5 pointer-events-none"></div>
      <div className="w-full px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto relative z-10">
        {/* Section Header */}
        <div className="text-center mb-3 sm:mb-8">
          <h2 className="text-xl sm:text-3xl lg:text-4xl font-bold text-white font-['Poppins'] mb-4 drop-shadow-lg">
            KEY DETAILS
          </h2>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6 stagger-animation">
          {details.map((detail, index) => (
            <div
              key={index}
              className="relative bg-gradient-to-br from-slate-700/80 via-slate-600/80 to-slate-700/80 backdrop-blur-sm rounded-xl p-3 sm:p-4 
                         shadow-[0_8px_32px_rgba(0,0,0,0.4)]
                         border border-slate-500/30
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
                <p className="text-slate-200 font-['Inter'] leading-relaxed text-xs sm:text-sm">{detail.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
