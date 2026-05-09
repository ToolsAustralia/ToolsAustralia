"use client";

import { ChevronRight } from "lucide-react";
import type { CSSProperties } from "react";
import type { WinnerSummary } from "@/types/winner";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { hexToRgbaString } from "@/utils/package-colors/packageColorScheme";
import { formatWinnerName } from "@/utils/winner-name-formatter";
import { getWinnerDisplayDate, getWinnerTestimonyExcerpt } from "@/utils/winners";
import { buildHeroEdgeGlow } from "./theme";
import { cn } from "@/utils/cn";

interface WinnerCinematicHeroProps {
  winner: WinnerSummary;
  variant: "card" | "modal";
  /** Optional click handler — when provided AND variant is "card", renders the Read Full Story link inside the bottom row. */
  onReadFullStory?: () => void;
  className?: string;
}

export default function WinnerCinematicHero({
  winner,
  variant,
  onReadFullStory,
  className = "",
}: WinnerCinematicHeroProps) {
  const theme = usePromoTheme();
  const formattedName = formatWinnerName(winner.winnerFirstName, winner.winnerLastName);
  const prizeLabel = winner.selectedPrize || winner.prize.name;
  const drawTypeLabel = winner.drawType === "major" ? "Major Draw Winner" : "Mini Draw Winner";

  const isCard = variant === "card";

  // Card overlays the testimony excerpt; modal does not (its body shows the full story).
  const cardExcerpt = isCard ? getWinnerTestimonyExcerpt(winner.testimony, 240) : "";

  const labelBorderStyle: CSSProperties = {
    borderColor: hexToRgbaString(theme.primary, 0.55),
  };

  // Background: deep dark base + brand edge glow only. No photo, no vignette.
  const stageBackground = `${buildHeroEdgeGlow(theme.primary, true)}, linear-gradient(135deg, #050811 0%, #0b1326 50%, #050811 100%)`;

  if (isCard) {
    return (
      <div
        className={cn("relative flex h-[340px] w-full flex-col overflow-hidden p-6 sm:h-[360px] sm:p-8 lg:h-[380px] lg:p-10 text-white", className)}
        style={{ background: stageBackground }}
      >
        {/* Top row: draw-type pill + date/state pill — always single row, smaller on mobile */}
        <div className="mb-5 flex flex-nowrap items-center gap-1.5 sm:mb-6 sm:gap-2">
          <span
            className="inline-flex shrink-0 rounded-full border bg-black/40 px-2 py-0.5 text-3xs font-bold uppercase tracking-[0.16em] text-white backdrop-blur-sm sm:px-3 sm:py-1.5 sm:text-2xs sm:tracking-[0.24em]"
            style={labelBorderStyle}
          >
            {drawTypeLabel}
          </span>
          <span className="inline-flex min-w-0 truncate rounded-full border border-white/20 bg-black/40 px-2 py-0.5 text-3xs font-semibold uppercase tracking-[0.12em] text-white/80 backdrop-blur-sm sm:px-3 sm:py-1.5 sm:text-2xs sm:tracking-[0.16em]">
            {getWinnerDisplayDate(winner)}
            {winner.winnerState ? ` · ${winner.winnerState}` : ""}
          </span>
        </div>

        {/* Middle: opening quote mark + excerpt */}
        {cardExcerpt && (
          <div className="mb-6 sm:mb-8">
            <div
              className="font-serif leading-[0.4]"
              style={{ color: theme.primary, fontSize: "44px", opacity: 0.85, marginBottom: "10px" }}
              aria-hidden
            >
              &ldquo;
            </div>
            <p className="line-clamp-4 max-w-[620px] font-serif italic leading-[1.55] tracking-[-0.2px] text-[15px] sm:line-clamp-5 sm:text-[18px] lg:text-[20px]">
              {cardExcerpt}
            </p>
          </div>
        )}

        {/* Bottom: name + prize on the left, Read Full Story link right-aligned on sm+, stacked below on mobile. */}
        <div className="mt-auto flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
          <div className="min-w-0 flex-1">
            <h3 className="font-['Inter'] text-xl font-bold tracking-[-0.3px] sm:text-2xl lg:text-[1.6rem]">
              {formattedName}
            </h3>
            <p className="mt-2 truncate font-['Inter'] text-[12px] font-semibold uppercase leading-relaxed tracking-[0.18em] text-white/70 sm:text-[13px]">
              {prizeLabel}
            </p>
          </div>
          {onReadFullStory && (
            <button
              type="button"
              onClick={onReadFullStory}
              aria-haspopup="dialog"
              aria-label={`Read ${winner.winnerFirstName ?? "winner"}'s full story`}
              className="group inline-flex shrink-0 items-center gap-1.5 self-start text-[12px] font-bold uppercase tracking-[0.18em] underline decoration-2 underline-offset-[6px] transition-opacity duration-200 hover:opacity-90 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none sm:self-end sm:text-[13px]"
              style={{ color: theme.primary, textDecorationColor: theme.primaryLight }}
            >
              Read full story
              <ChevronRight
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
                aria-hidden
              />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Modal variant: short typographic band, centered editorial header.
  return (
    <div
      className={cn("relative flex w-full flex-col items-center justify-center px-6 py-6 text-center sm:px-10 sm:py-7 text-white", className)}
      style={{ background: stageBackground, minHeight: "150px" }}
    >
      <span
        className="mb-3 inline-flex rounded-full border bg-black/40 px-3 py-1.5 text-2xs font-bold uppercase tracking-[0.24em] text-white backdrop-blur-sm"
        style={labelBorderStyle}
      >
        {drawTypeLabel}
      </span>
      <h3 className="font-['Inter'] text-2xl font-extrabold tracking-[-0.5px] sm:text-3xl lg:text-[2rem]">
        {formattedName}
      </h3>
      <p className="mt-1 max-w-[520px] font-['Inter'] text-2xs font-semibold uppercase leading-relaxed tracking-[0.18em] text-white/70 sm:text-[12px]">
        {prizeLabel}
      </p>
    </div>
  );
}
