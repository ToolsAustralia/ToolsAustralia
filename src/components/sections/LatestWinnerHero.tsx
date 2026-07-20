"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Archivo, Space_Mono } from "next/font/google";
import { ArrowRight, ChevronDown } from "lucide-react";
import WinnerBoardCard from "@/app/(site)/draw-results/components/WinnerBoardCard";
import { Stagger } from "@/app/(site)/draw-results/components/Reveal";
import { DEFAULT_PRIZE_SLUG } from "@/config/prize-summaries";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { useWinnersFeed, WINNERS_FEED_LIMIT } from "@/hooks/queries/useWinnersQueries";
import type { WinnerSummary } from "@/types/winner";
import { cn } from "@/utils/cn";

// The Winners Board uses the shared `.ta-results` design system, which expects
// these font vars. Self-load them so the board renders correctly on every host
// page (homepage, promotions, my-account) — same pattern as WinnersTestimony.
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  style: ["normal", "italic"],
  variable: "--font-archivo",
  display: "swap",
});
const spaceMono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-space-mono", display: "swap" });

// One page = 8 tiles → 2 rows on desktop (4 cols) / 4 rows on mobile (2 cols).
const PAGE = 8;
// The board is a teaser: cap at the most recent 16 (2 "See More" pages), then link
// to /winners. We share the larger winners feed with the testimony carousel (one
// fetch per page) and slice down to this here.
const BOARD_MAX = 16;

interface LatestWinnerHeroProps {
  className?: string;
  contentWrapperClassName?: string;
}

// Latest Winners cards stay navigational (drive conversion): major → the promo
// page, mini → the mini-draws index (mirrors the previous WinnerCard behaviour).
function winnerHref(w: WinnerSummary): string {
  return w.drawType === "major" ? `/promotions/${DEFAULT_PRIZE_SLUG}` : "/mini-draws";
}

export default function LatestWinnerHero({ className = "", contentWrapperClassName }: LatestWinnerHeroProps) {
  const theme = usePromoTheme();
  const [visible, setVisible] = useState(PAGE);

  // Shared winners feed (one fetch per page, reused by the testimony carousel).
  // The board is a teaser, so cap at the most recent BOARD_MAX.
  const { data: feed = [], isLoading: loading } = useWinnersFeed(WINNERS_FEED_LIMIT);
  const winners = useMemo(() => feed.slice(0, BOARD_MAX), [feed]);

  const shown = useMemo(() => winners.slice(0, visible), [winners, visible]);
  const remaining = winners.length - visible;

  // Pipe the active promo accent into the board's `--accent` so the tiles
  // recolour on themed promotion pages (the board otherwise uses brand red).
  const taStyle = {
    background: "transparent",
    "--accent": theme.primary,
    "--accent-2": theme.primaryDark,
  } as CSSProperties;

  if (loading) {
    // Skeleton mirrors the real board exactly (same `.ta-results`/`.lw-grid`
    // structure, same heading, PAGE tiles) so nothing shifts on fetch-resolve.
    return (
      <section className={cn("relative overflow-hidden py-8 sm:py-10", className)} aria-hidden="true">
        <div className={contentWrapperClassName || "max-w-7xl mx-auto"}>
          <div className="mb-8 text-center">
            <div className="mx-auto mb-3 h-1 w-24 rounded-full" style={{ background: theme.gradient }} />
            <h2 className="text-3xl font-bold tracking-tight text-slate-950 font-sans dark:text-white sm:text-4xl">
              Latest Winners
            </h2>
          </div>
          <div className={cn("ta-results", archivo.variable, spaceMono.variable)} style={taStyle}>
            <div className="lw-grid">
              {Array.from({ length: PAGE }).map((_, index) => (
                <div key={index} className="lw-tile">
                  <div className="lw-photo animate-pulse" />
                  <div className="lw-body">
                    <div className="h-3 w-3/4 rounded animate-pulse" style={{ background: "var(--line-2)" }} />
                    <div className="h-3 w-2/5 rounded animate-pulse" style={{ background: "var(--line)" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!winners.length) {
    return null;
  }

  return (
    <section id="latest-winners" className={cn("relative overflow-hidden py-8 sm:py-10", className)}>
      <div className={contentWrapperClassName || "max-w-7xl mx-auto"}>
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 h-1 w-24 rounded-full" style={{ background: theme.gradient }} />
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 font-sans dark:text-white sm:text-4xl">
            Latest Winners
          </h2>
        </div>

        {/* Winners Board grid — 2 cols (mobile) / 4 cols (desktop), 8 per page. */}
        <div className={cn("ta-results", archivo.variable, spaceMono.variable)} style={taStyle}>
          <Stagger className="lw-grid">
            {shown.map((w) => (
              <WinnerBoardCard key={w.id} w={w} href={winnerHref(w)} />
            ))}
          </Stagger>
        </div>

        <div className="mt-8 text-center">
          {remaining > 0 ? (
            <button
              type="button"
              onClick={() => setVisible((count) => count + PAGE)}
              className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-slate-500 winner-motion-button hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white"
            >
              See More <ChevronDown className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <Link
              href="/winners"
              className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-slate-500 winner-motion-button hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white"
            >
              View All Winners
            </Link>
          )}
        </div>

        <div className="mt-8 text-center sm:mt-10">
          <Link
            href="#membership"
            className="inline-flex items-center gap-2 rounded-full border bg-slate-950 px-6 py-3.5 text-sm font-bold uppercase tracking-[0.14em] text-white shadow-[0_14px_30px_rgba(15,23,42,0.18)] winner-motion-button dark:bg-white dark:text-slate-950"
            style={{ borderColor: theme.borderRgba }}
          >
            Join our next giveaway
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
