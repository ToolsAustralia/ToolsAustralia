"use client";

import Image from "next/image";
import Link from "next/link";
import { MapPin, ChevronRight } from "lucide-react";
import { useMajorDrawWinners } from "@/hooks/queries/useWinnersQueries";
import { getInitials } from "@/utils/display-name";

const ACCENTS = ["#c8102e", "#d9a520", "#ffd200", "#00c2ed", "#ff7a1a"];

function monthLabel(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-AU", { month: "short", year: "numeric" });
}

/** Recent major-draw winners — real winners (state, not suburb; monogram fallback for missing photos). */
export default function DrawWinners() {
  const { data, isLoading } = useMajorDrawWinners();
  const winners = (data ?? []).slice(0, 5);

  if (!isLoading && winners.length === 0) return null;

  return (
    <section className="rounded-3xl border border-token bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-token">Recent winners</span>
        <Link href="/winners" className="inline-flex items-center gap-0.5 text-sm font-semibold text-red-600 hover:underline dark:text-red-400">
          See all <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {isLoading ? (
        <div className="mt-3 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-black/[.05] dark:bg-white/[.06]" />
          ))}
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {winners.map((w, i) => {
            const accent = ACCENTS[i % ACCENTS.length];
            const name = `${w.winnerFirstName} ${w.winnerLastName}`.trim();
            return (
              <li key={w.id} className="flex items-center gap-3 rounded-2xl border border-token bg-black/[.03] p-2.5 dark:bg-white/[.04]">
                <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl" style={{ background: `linear-gradient(150deg, ${accent}, ${accent}99)` }}>
                  {w.imageUrl ? (
                    <Image src={w.imageUrl} alt={name} fill className="object-cover" sizes="44px" />
                  ) : (
                    <span className="grid h-full w-full place-items-center font-poppins text-sm font-black text-white/90">
                      {getInitials(w.winnerFirstName, w.winnerLastName)}
                    </span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-primary-token dark:text-white">{name}</div>
                  <div className="truncate text-xs text-muted-token">{w.selectedPrize || "Major draw prize"}</div>
                </div>
                <div className="shrink-0 text-right">
                  {w.winnerState && (
                    <div className="inline-flex items-center gap-0.5 text-xs text-muted-token">
                      <MapPin className="h-3 w-3" /> {w.winnerState}
                    </div>
                  )}
                  <div className="text-[11px] text-muted-token">{monthLabel(w.drawDate ?? w.selectedDate)}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
