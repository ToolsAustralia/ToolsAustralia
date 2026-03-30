"use client";



import Image from "next/image";

import Link from "next/link";

import { ArrowRight, Award, Calendar, Gift, MapPin } from "lucide-react";

import { DEFAULT_PRIZE_SLUG } from "@/config/prizes";

import type { WinnerSummary } from "@/types/winner";

import { usePromoTheme } from "@/stores/usePromoThemeStore";

import { formatWinnerName } from "@/utils/winner-name-formatter";

import { getWinnerDisplayDate } from "@/utils/winners";



export type WinnerCardData = WinnerSummary;



interface WinnerCardProps {

  winner: WinnerCardData;

  className?: string;

}



function getContrastText(hex: string) {

  const clean = hex.replace("#", "");

  const r = parseInt(clean.slice(0, 2), 16);

  const g = parseInt(clean.slice(2, 4), 16);

  const b = parseInt(clean.slice(4, 6), 16);

  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

  return luminance > 0.62 ? "#111827" : "#ffffff";

}



export default function WinnerCard({ winner, className = "" }: WinnerCardProps) {

  const theme = usePromoTheme();

  const themeTextColor = getContrastText(theme.primary);



  const displayImage =

    winner.imageUrl || winner.prize.images[0] || "/images/placeholders/prize-placeholder.png";

  const formattedName = formatWinnerName(winner.winnerFirstName, winner.winnerLastName);

  const prizeLabel = winner.selectedPrize || winner.prize.name;

  const destination =

    winner.drawType === "major"

      ? `/promotions/${DEFAULT_PRIZE_SLUG}`

      : `/mini-draws/${winner.drawId}`;



  return (

    <article

      className={`relative overflow-hidden rounded-[24px] border bg-white shadow-[0_18px_42px_rgba(15,23,42,0.10)] dark:border-neutral-700 dark:bg-neutral-900 ${className}`}

      style={{ borderColor: theme.borderRgba }}

    >

      <div className="h-1.5" style={{ background: theme.gradient }} />



      <div className="relative h-64 overflow-hidden bg-slate-950 sm:h-72 lg:h-[20rem]">

        <div className="group relative h-full w-full">

          <Image

            src={displayImage}

            alt={`${formattedName} - ${winner.drawName}`}

            fill

            className="object-cover transition-transform duration-700 ease-out motion-reduce:transition-none group-hover:scale-[1.03] motion-reduce:group-hover:scale-100"

            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"

          />

        </div>



        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent pointer-events-none" />

        <div

          className="pointer-events-none absolute inset-0"

          style={{

            background: `radial-gradient(circle at top right, ${theme.shadowRgba.replace(/,\s*[\d.]+\)/, ", 0.22)")}, transparent 38%)`,

          }}

        />



        <div className="absolute left-4 right-4 top-4 z-10 flex items-start justify-between gap-3">

          <div

            className={`inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] shadow-[0_10px_24px_rgba(0,0,0,0.2)] backdrop-blur ${

              winner.drawType === "major" ? "text-white" : "bg-amber-300/95 text-slate-950"

            }`}

            style={

              winner.drawType === "major"

                ? { background: theme.gradient, color: themeTextColor }

                : undefined

            }

          >

            {winner.drawType === "major" ? "Major Draw" : "Mini Draw"}

          </div>



          {winner.selectedPrize && (

            <div

              className="max-w-[60%] rounded-full border bg-slate-950/72 px-3 py-1.5 text-[11px] font-medium text-white/90 backdrop-blur"

              style={{ borderColor: theme.borderRgba }}

            >

              <span className="inline-flex items-center gap-1.5 truncate">

                <Gift className="h-3.5 w-3.5 flex-shrink-0" style={{ color: theme.primaryLight }} />

                <span className="truncate">{winner.selectedPrize}</span>

              </span>

            </div>

          )}

        </div>



        <div className="absolute inset-x-0 bottom-0 z-10 p-4 sm:p-5">

          <div

            className="rounded-[20px] border bg-white/10 p-4 text-white backdrop-blur-md"

            style={{ borderColor: theme.borderRgba }}

          >

            <div className="mb-2 flex flex-wrap items-center gap-2">

              <h3 className="text-xl font-bold tracking-tight font-['Poppins'] sm:text-2xl lg:text-[1.75rem]">

                {formattedName}

              </h3>

              {winner.winnerState && (

                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/85">

                  <MapPin className="h-3.5 w-3.5" style={{ color: theme.primaryLight }} />

                  {winner.winnerState}

                </span>

              )}

            </div>



            <p className="max-w-2xl text-sm text-slate-100/90 sm:text-[15px]">

              Won <span className="font-semibold text-white">{prizeLabel}</span> in{" "}

              <span className="font-semibold text-white">{winner.drawName}</span>.

            </p>

          </div>

        </div>

      </div>



      <div className="space-y-4 p-5 sm:space-y-5 sm:p-6">

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

          <div

            className="rounded-2xl border bg-slate-50/90 p-4 dark:border-slate-700 dark:bg-slate-800/50"

            style={{ borderColor: `${theme.borderRgba.replace("0.4)", "0.2)")}` }}

          >

            <div

              className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-2xl text-white shadow-[0_12px_24px_rgba(0,0,0,0.18)]"

              style={{ background: theme.gradient }}

            >

              <Award className="h-4 w-4" style={{ color: themeTextColor }} />

            </div>

            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">

              Draw

            </p>

            <p className="text-base font-semibold text-slate-950 dark:text-white">{winner.drawName}</p>

          </div>



          <div

            className="rounded-2xl border bg-slate-50/90 p-4 dark:border-slate-700 dark:bg-slate-800/50"

            style={{ borderColor: `${theme.borderRgba.replace("0.4)", "0.25)")}` }}

          >

            <div

              className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-2xl border text-white shadow-[0_12px_24px_rgba(15,23,42,0.16)]"

              style={{ borderColor: theme.borderRgba, background: `linear-gradient(145deg, ${theme.primaryDark}, ${theme.primary})` }}

            >

              <Calendar className="h-4 w-4" style={{ color: themeTextColor }} />

            </div>

            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">

              Won On

            </p>

            <p className="text-base font-semibold text-slate-950 dark:text-white">{getWinnerDisplayDate(winner)}</p>

          </div>

        </div>



        <Link

          href={destination}

          className="group/link flex items-center justify-between rounded-2xl border px-4 py-3.5 text-sm font-bold uppercase tracking-[0.14em] shadow-[0_14px_30px_rgba(15,23,42,0.14)] transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(15,23,42,0.18)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 dark:border-slate-600"

          style={{

            background: theme.gradient,

            color: themeTextColor,

            borderColor: theme.borderRgba,

          }}

        >

          <span>{winner.drawType === "major" ? "Explore this promotion" : "View draw details"}</span>

          <ArrowRight className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover/link:translate-x-1" />

        </Link>

      </div>

    </article>

  );

}


