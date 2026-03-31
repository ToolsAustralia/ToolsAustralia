"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { ClipboardCheck, Sparkles } from "lucide-react";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { getFallbackImagePath, getImageForMode, resolveEvergreenHeroImages } from "@/utils/promo/landing-image-resolver";

function getContrastText(hex: string) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.62 ? "#111827" : "#ffffff";
}

export interface DrawResultsHeroProps {
  majorCompleted: number;
  miniWins: number;
  allWinners: number;
}

export default function DrawResultsHero({ majorCompleted, miniWins, allWinners }: DrawResultsHeroProps) {
  const theme = usePromoTheme();
  const themeTextColor = getContrastText(theme.primary);
  const themeMode = useThemeStore((s) => s.theme);
  const [imageError, setImageError] = useState(false);

  const heroImagePaths = useMemo(() => {
    if (imageError) {
      const fallback = getFallbackImagePath();
      return { desktop: fallback, mobile: fallback };
    }
    const extended = resolveEvergreenHeroImages();
    return {
      desktop: getImageForMode(extended, themeMode, "desktop"),
      mobile: getImageForMode(extended, themeMode, "mobile"),
    };
  }, [imageError, themeMode]);

  const stats = [
    { label: "Major draws", value: majorCompleted },
    { label: "Mini wins", value: miniWins },
    { label: "All wins", value: allWinners },
  ] as const;

  return (
    <section className="relative min-h-[min(92vw,420px)] overflow-hidden bg-slate-950 py-10 sm:min-h-[min(78vw,480px)] sm:py-14 lg:min-h-[320px] lg:py-20">
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 lg:hidden">
          <Image
            src={heroImagePaths.mobile}
            alt="Tools and prizes collage"
            fill
            unoptimized
            priority
            className="object-cover"
            style={{ objectPosition: "50% 35%" }}
            onError={() => setImageError(true)}
          />
        </div>
        <div className="absolute inset-0 hidden lg:block">
          <Image
            src={heroImagePaths.desktop}
            alt="Tools and prizes collage"
            fill
            unoptimized
            priority
            sizes="100vw"
            className="object-cover"
            style={{ objectPosition: "50% 42%" }}
            onError={() => setImageError(true)}
          />
        </div>
        {/* Readability scrim over all-prizes collage */}
        <div
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.9)_0%,rgba(2,6,23,0.72)_38%,rgba(2,6,23,0.45)_100%)] sm:bg-[linear-gradient(103deg,rgba(2,6,23,0.93)_0%,rgba(2,6,23,0.72)_38%,rgba(2,6,23,0.38)_72%,rgba(2,6,23,0.2)_100%)]"
          aria-hidden
        />
      </div>

      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background: `radial-gradient(circle at top, ${theme.shadowRgba.replace(/,\s*[\d.]+\)/, ", 0.18)")}, transparent 36%)`,
        }}
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-[min(100%,52rem)] opacity-80"
        style={{
          background: `radial-gradient(circle at 70% 40%, ${theme.primaryLight}20, transparent 50%)`,
        }}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center sm:items-start">
          <div className="mb-3 h-1 w-20 rounded-full" style={{ background: theme.gradient }} />
          <span
            className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur"
            style={{ borderColor: theme.borderRgba, backgroundColor: "rgba(2,6,23,0.55)" }}
          >
            <Sparkles className="h-3.5 w-3.5" style={{ color: theme.primaryLight }} />
            Official draw results
          </span>
        </div>

        <div className="mt-5 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div
              className="hidden shrink-0 rounded-[24px] p-4 shadow-[0_20px_40px_rgba(0,0,0,0.35)] sm:inline-flex"
              style={{ background: theme.gradient }}
            >
              <ClipboardCheck className="h-9 w-9" style={{ color: themeTextColor }} />
            </div>
            <div className="text-center sm:text-left">
              <h1 className="text-4xl font-bold leading-tight text-white font-['Poppins'] sm:text-5xl lg:text-6xl">
                Every draw, on the record
              </h1>
              <p className="mx-auto mt-4 max-w-3xl text-sm leading-7 text-slate-200 sm:mx-0 sm:text-base lg:text-lg">
                Completed majors and mini draws—draw dates, confirmed winners, and the same transparency you
                expect from Tools Australia.
              </p>
            </div>
          </div>

          <dl
            className="flex flex-wrap justify-center gap-x-8 gap-y-5 border-t border-white/[0.08] pt-6 text-white sm:justify-start sm:gap-x-10 lg:max-w-xl lg:justify-start lg:border-t-0 lg:border-l lg:pl-10 lg:pt-0"
            style={{
              borderLeftColor: theme.borderRgba.replace("0.4)", "0.25)"),
            }}
          >
            {stats.map((stat) => (
              <div key={stat.label} className="text-center sm:text-left">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {stat.label}
                </dt>
                <dd className="mt-1 font-['Poppins'] text-2xl font-bold tabular-nums tracking-tight text-white sm:text-3xl">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
