"use client";

import { useState, useEffect, type CSSProperties } from "react";
import { Clock, Calendar, Truck, Zap, Shield, IdCard } from "lucide-react";
import { useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";

import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { SectionContainer } from "@/components/ui";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { hexToRgbaString } from "@/utils/package-colors/packageColorScheme";

export default function GiveawayDetails() {
  const theme = usePromoTheme();
  const { data: currentMajorDraw, isLoading } = useCurrentMajorDraw();
  const detailsRef = useScrollAnimation();
  const [isMounted, setIsMounted] = useState(false);
  const [formattedDates, setFormattedDates] = useState({
    entriesClose: "TBA",
    drawDate: "TBA",
    timezone: "",
  });

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    if (currentMajorDraw?.drawDate && currentMajorDraw?.freezeEntriesAt) {
      const drawDate = new Date(currentMajorDraw.drawDate);
      const freezeDate = new Date(currentMajorDraw.freezeEntriesAt);

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
    },
    {
      icon: Calendar,
      title: `Draw Date (${formattedDates.timezone || ""})`,
      description: !isMounted || isLoading ? "TBA" : formattedDates.drawDate,
    },
    { icon: Truck, title: "Delivery", description: "Australia-wide, free of charge" },
    { icon: Zap, title: "We'll Call You", description: "Winner contacted by phone at the draw" },
    {
      icon: Shield,
      title: "Eligibility",
      description: "Open to all Australian residents 18+ (Excluding SA & ACT)",
    },
    { icon: IdCard, title: "License Numbers", description: "NTP/16264" },
  ];

  const cardHoverStyle = {
    ["--hiw-hover-glow" as string]: hexToRgbaString(theme.primary, 0.2),
    ["--hiw-hover-border" as string]: hexToRgbaString(theme.primary, 0.45),
  } as CSSProperties;

  return (
    <section
      id="how-it-works"
      ref={detailsRef}
      className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 py-12 sm:py-16 lg:py-20"
      style={cardHoverStyle}
    >
      {/* Same atmospheric layers as Hear From Our Winners (WinnerTestimonySection) */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at top, ${theme.shadowRgba.replace(/,\s*[\d.]+\)/, ", 0.24)")}, transparent 30%)`,
        }}
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-1/3 opacity-80"
        style={{
          background: `radial-gradient(circle at center, ${theme.primaryLight}20, transparent 45%)`,
        }}
      />

      <SectionContainer variant="narrow" className="relative z-10">
        <div className="mb-8 text-center sm:mb-10">
          <div className="mx-auto mb-3 h-1 w-24 rounded-full" style={{ background: theme.gradient }} />
          <h2 className="text-2xl font-bold tracking-tight text-white font-sans sm:text-3xl lg:text-4xl">
            HOW IT WORKS
          </h2>
        </div>

        {/* FAQ-style stack: same spacing as MetallicAccordion in FAQSection */}
        <div className="space-y-3 sm:space-y-4">
          {details.map((detail, index) => (
            <div
              key={index}
              className="relative group bg-gradient-to-br from-gray-900 via-gray-800 to-black backdrop-blur-sm rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-gray-700 transition-all duration-300 hover:shadow-[0_8px_32px_var(--hiw-hover-glow)] hover:border-[color:var(--hiw-hover-border)]"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent pointer-events-none z-10 rounded-lg" />

              <div className="relative z-20 px-4 py-4 sm:px-6 sm:py-5">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="relative flex-shrink-0">
                    <div
                      className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-lg border border-gray-600 bg-gradient-to-br from-gray-800 via-gray-800/90 to-black shadow-[0_4px_16px_rgba(0,0,0,0.35)] relative overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-transparent rounded-lg pointer-events-none" />
                      <detail.icon
                        className="relative z-10 h-4 w-4 sm:h-5 sm:w-5"
                        style={{ color: theme.primary }}
                      />
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-sm sm:text-lg font-sans leading-tight text-white">
                      {detail.title}
                    </h3>
                    <div className="mt-3 border-t border-gray-700 pt-3 sm:mt-4 sm:pt-4">
                      <p className="text-sm leading-relaxed text-gray-300 font-sans sm:text-base">
                        {detail.description}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionContainer>
    </section>
  );
}
