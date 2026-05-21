"use client";

import { X } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import type { WinnerSummary } from "@/types/winner";
import { ModalContainer } from "@/components/modals/ui";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { hexToRgbaString } from "@/utils/package-colors/packageColorScheme";
import { stripRichTextHtml } from "@/utils/winners";
import WinnerCinematicHero from "./WinnerCinematicHero";
import { readableBrandOnLight } from "./theme";
import { cn } from "@/utils/cn";

interface WinnerStoryModalProps {
  winner: WinnerSummary | null;
  onClose: () => void;
}

export default function WinnerStoryModal({ winner, onClose }: WinnerStoryModalProps) {
  const theme = usePromoTheme();
  const { theme: siteTheme } = useTheme();
  const isDark = siteTheme === "dark";

  const isOpen = winner !== null;

  const shellBg = isDark ? "bg-[#0a0d18]" : "bg-[#fafaf7]";
  const proseColor = isDark ? "text-[#cfd5e0]" : "text-[#1f2937]";
  const eyebrowLineGradient = `linear-gradient(90deg, transparent, ${hexToRgbaString(theme.primary, 0.5)})`;
  const eyebrowLineGradientReverse = `linear-gradient(90deg, ${hexToRgbaString(theme.primary, 0.5)}, transparent)`;
  const accentColor = isDark ? theme.primary : readableBrandOnLight(theme.primary);

  const paragraphs = winner
    ? stripRichTextHtml(winner.testimony).split(/\n+/).filter(Boolean)
    : [];

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      size="4xl"
      height="fixed"
      fixedHeight="max-h-[92dvh]"
    >
      {/* ModalContainer keeps children mounted during close animation, so winner can be null here. */}
      {winner ? (
        <div className={cn("relative flex h-full flex-col overflow-hidden", shellBg)}>
          {/* Close button overlaid on hero */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 z-30 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white backdrop-blur-sm transition hover:bg-black/70 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>

          {/* Hero band */}
          <WinnerCinematicHero winner={winner} variant="modal" />

          {/* Editorial body — scrolls if it overflows */}
          <div className="flex-1 overflow-y-auto px-6 py-8 sm:px-10 sm:py-9 lg:px-11 lg:py-10">
            {/* Eyebrow with flanking gradient lines */}
            <div
              className="mb-6 flex items-center gap-3 text-2xs font-extrabold uppercase tracking-[0.32em]"
              style={{ color: accentColor }}
            >
              <span
                aria-hidden
                className="h-px flex-1"
                style={{ background: eyebrowLineGradient }}
              />
              The Story
              <span
                aria-hidden
                className="h-px flex-1"
                style={{ background: eyebrowLineGradientReverse }}
              />
            </div>

            {/* Story prose with brand-colored drop cap on first paragraph */}
            <div className={cn("font-serif text-[16px] leading-[1.7] tracking-[-0.1px] sm:text-[18px] sm:leading-[1.75]", proseColor)}>
              {paragraphs.length === 0 ? (
                <p className="italic opacity-70">No story shared yet.</p>
              ) : (
                paragraphs.map((para, idx) => {
                  if (idx === 0 && para.length > 0) {
                    return (
                      <p key={idx} className="mb-5 [display:flow-root]">
                        <span
                          className="float-left mr-3 mt-1 font-serif text-[46px] font-bold leading-[0.85] sm:text-[60px]"
                          style={{ color: accentColor }}
                        >
                          {para.charAt(0)}
                        </span>
                        {para.slice(1)}
                      </p>
                    );
                  }
                  return (
                    <p key={idx} className="mb-5 last:mb-0">
                      {para}
                    </p>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}
    </ModalContainer>
  );
}
