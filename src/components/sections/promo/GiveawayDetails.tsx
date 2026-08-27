"use client";

import { useState, useEffect, type CSSProperties } from "react";
import { Shield } from "lucide-react";
import { useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";

import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { SectionContainer } from "@/components/ui";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { hexToRgbaString } from "@/utils/package-colors/packageColorScheme";
import { NTP_NUMBER, NSW_LICENSE } from "@/constants/legal";

export default function GiveawayDetails() {
  const theme = usePromoTheme();
  const { data: currentMajorDraw, isLoading } = useCurrentMajorDraw();
  const detailsRef = useScrollAnimation();
  const [isMounted, setIsMounted] = useState(false);
  const [formattedDates, setFormattedDates] = useState({
    entriesClose: "TBA",
    drawDate: "TBA",
    timezone: "",
    // Short forms for the mobile fact grid — the long "Thursday, August 27, 2026 at 08:00 PM"
    // string wraps to four lines inside a half-width tile.
    entriesCloseShort: "TBA",
    drawDateShort: "TBA",
    drawDayShort: "",
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

      const short = (d: Date) =>
        `${d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · ${d
          .toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
          .toUpperCase()}${timezoneAbbr ? ` ${timezoneAbbr}` : ""}`;

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
        entriesCloseShort: short(freezeDate),
        drawDateShort: short(drawDate),
        drawDayShort: drawDate.toLocaleDateString(undefined, { day: "numeric", month: "long" }),
      });
    } else {
      setFormattedDates({
        entriesClose: "TBA",
        drawDate: "TBA",
        timezone: "",
        entriesCloseShort: "TBA",
        drawDateShort: "TBA",
        drawDayShort: "",
      });
    }
  }, [currentMajorDraw, isMounted]);

  const datesReady = isMounted && !isLoading;

  /**
   * Mobile rebuild (design handoff, 2026-08-13). The six equal fact cards answered "when /
   * where / who" but never "what do I actually do" — the question a first-time visitor on a
   * phone is asking. So the mobile surface leads with a three-step timeline and demotes the
   * logistics to a compact fact grid underneath. Desktop keeps the six-card grid, where the
   * two-column layout already reads at a glance.
   *
   * Copy note (CLAUDE.md rule 11): entries are a FREE INCLUSION of the pack — never sold,
   * never framed as odds.
   */
  const steps = [
    {
      n: "1",
      title: "Pick a pack",
      body: "Every membership and one-time pack includes free entries.",
    },
    {
      n: "2",
      title: "Your entries land",
      body: datesReady && formattedDates.drawDayShort
        ? `They go straight into the ${formattedDates.drawDayShort} draw.`
        : "They go straight into the next major draw.",
    },
    {
      n: "3",
      title: "Drawn live",
      body: "Picked by randomdraws.com.au and announced live on Facebook. We call the winner on the night.",
    },
  ];

  const facts = [
    { label: "Entries close", value: datesReady ? formattedDates.entriesCloseShort : "TBA" },
    { label: "Draw date", value: datesReady ? formattedDates.drawDateShort : "TBA" },
    { label: "Delivery", value: "Australia-wide, free of charge" },
    { label: "Eligibility", value: "Australian residents 18+ (excl. SA & ACT)" },
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
      {/* Same atmospheric layers as Hear From Our Winners (WinnersTestimony) */}
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

        {/* MOBILE — three-step timeline, then the logistics as a compact fact grid. */}
        {/*
          ONE layout at every width — the design that used to be mobile-only.

          There were two: this numbered rail plus a compact fact grid below the lg
          breakpoint, and a separate six-card logistics grid above it. They said the
          same things in a different order with different copy weights, so the page a
          customer described on the phone was not the page a colleague saw on a
          laptop, and every copy change had to be made twice or silently diverge.

          The numbered rail is the better of the two: it reads as a SEQUENCE (pick,
          land, drawn) which is what a first-time visitor is actually asking, and the
          fact grid keeps the dates and eligibility one glance away without competing
          for the same visual weight.

          Capped at max-w-2xl and centred: the rail is a reading column, and stretched
          across a 1440px viewport its one-line steps would sit in a metre of empty
          space.
        */}
        <div className="mx-auto max-w-2xl">
          <ol className="relative list-none pl-[34px]">
            {/* The rail stops 14px short at each end so it starts and finishes on a marker
                rather than running past the first and last step. */}
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-3.5 left-[13px] top-3.5 w-0.5 rounded-full"
              style={{
                background: `linear-gradient(180deg, ${theme.primary}, ${hexToRgbaString(theme.primary, 0.15)})`,
              }}
            />
            {steps.map((step) => (
              <li key={step.n} className="relative pb-[18px] last:pb-0">
                <span
                  className="absolute -left-[34px] top-0 flex h-7 w-7 items-center justify-center rounded-full border-[3px] border-slate-900 font-sans text-xs font-extrabold text-white"
                  style={{ background: theme.primary }}
                  aria-hidden
                >
                  {step.n}
                </span>
                <h3 className="font-sans text-[15px] font-bold leading-tight text-white">{step.title}</h3>
                <p className="mt-1.5 font-sans text-xs leading-relaxed text-gray-400">{step.body}</p>
              </li>
            ))}
          </ol>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3">
            {facts.map((fact) => (
              <div
                key={fact.label}
                className="rounded-[10px] border border-white/[0.09] bg-white/[0.04] p-3"
              >
                <p className="font-sans text-3xs font-semibold uppercase tracking-[0.1em] text-gray-400">
                  {fact.label}
                </p>
                <p className="mt-1.5 font-sans text-xs font-bold leading-snug text-white">{fact.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-3.5 flex items-center justify-center gap-1.5 border-t border-white/[0.09] pt-3.5">
            <Shield className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
            <p className="text-center font-sans text-3xs leading-relaxed text-gray-400">
              ABN 54 690 397 061 &middot; {NSW_LICENSE} &middot; {NTP_NUMBER}
            </p>
          </div>
        </div>

      </SectionContainer>
    </section>
  );
}
