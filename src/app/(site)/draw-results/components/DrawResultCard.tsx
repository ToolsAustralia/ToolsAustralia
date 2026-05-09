"use client";

import { WinnerSummary } from "@/types/winner";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Calendar, ExternalLink, UserRound } from "lucide-react";
import { formatWinnerName } from "@/utils/winner-name-formatter";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import CompletedDrawRibbon from "@/components/ui/CompletedDrawRibbon";

function getContrastText(hex: string) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.62 ? "#111827" : "#ffffff";
}

interface DrawResultCardProps {
  winner: WinnerSummary;
}

/** Compact card for completed mini draws (mixed aspect imagery — not the major landscape layout). */
export default function DrawResultCard({ winner }: DrawResultCardProps) {
  const theme = usePromoTheme();
  const ctaColor = getContrastText(theme.primary);
  const selectedDate = new Date(winner.selectedDate);
  const displayImage = winner.imageUrl || winner.prize.images[0] || "/images/promotion/PrizeHeader/PrizeHeader.webp";
  const winnerDisplayName = formatWinnerName(winner.winnerFirstName, winner.winnerLastName);

  const formatDate = (date: Date) =>
    date.toLocaleDateString("en-AU", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  return (
    <article
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_50px_rgba(15,23,42,0.12)] dark:border-slate-700/80 dark:bg-slate-900/60 dark:shadow-[0_8px_30px_rgba(0,0,0,0.35)] dark:hover:shadow-[0_24px_56px_rgba(0,0,0,0.45)] sm:rounded-3xl"
      style={{ borderColor: `${theme.borderRgba.replace("0.4)", "0.2)")}` }}
    >
      <div
        className="h-1.5 w-full shrink-0 opacity-95 transition-opacity group-hover:opacity-100"
        style={{ background: theme.gradient }}
      />

      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: `radial-gradient(120% 80% at 100% 0%, ${theme.primaryLight}18, transparent 55%)`,
        }}
      />

      <div className="relative z-10 flex flex-1 flex-col">
        <div className="relative aspect-[4/3] w-full overflow-hidden sm:aspect-[16/11]">
          <CompletedDrawRibbon kind="mini" placement="topLeft" />
          <Image
            src={displayImage}
            alt={winner.prize.name}
            fill
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
            sizes="(max-width: 640px) 50vw, 25vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/15 to-transparent" />
        </div>

        <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
          <h3 className="line-clamp-2 text-base font-bold leading-snug text-slate-950 font-['Poppins'] dark:text-white sm:text-lg">
            {winner.drawName}
          </h3>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
            <div className="flex gap-3 rounded-xl border border-slate-200/80 bg-slate-50/90 px-3 py-2.5 dark:border-slate-700/70 dark:bg-slate-800/50">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0" style={{ color: theme.primary }} />
              <div className="min-w-0">
                <p className="text-2xs font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                  Drawn
                </p>
                <p className="text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">
                  {formatDate(selectedDate)}
                </p>
              </div>
            </div>
            <div className="flex gap-3 rounded-xl border border-slate-200/80 bg-slate-50/90 px-3 py-2.5 dark:border-slate-700/70 dark:bg-slate-800/50">
              <UserRound className="mt-0.5 h-4 w-4 shrink-0" style={{ color: theme.primary }} />
              <div className="min-w-0">
                <p className="text-2xs font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                  Winner
                </p>
                <p className="text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100 break-words">
                  {winnerDisplayName}
                </p>
              </div>
            </div>
          </div>

          {winner.drawResultUrl ? (
            <a
              href={winner.drawResultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-auto inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-center text-sm font-bold shadow-[0_10px_26px_rgba(15,23,42,0.12)] transition-[transform,box-shadow] duration-200 hover:scale-[1.01] hover:shadow-[0_14px_34px_rgba(15,23,42,0.16)] active:scale-[0.99] dark:shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
              style={{ background: theme.gradient, color: ctaColor }}
            >
              View draw result
              <ExternalLink className="h-4 w-4 opacity-90" />
            </a>
          ) : (
            <Link
              href={`/mini-draws/${winner.drawId}`}
              className="mt-auto inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-center text-sm font-bold shadow-[0_10px_26px_rgba(15,23,42,0.12)] transition-[transform,box-shadow] duration-200 hover:scale-[1.01] hover:shadow-[0_14px_34px_rgba(15,23,42,0.16)] active:scale-[0.99] dark:shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
              style={{ background: theme.gradient, color: ctaColor }}
            >
              View draw
              <ArrowRight className="h-4 w-4 opacity-90" />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
