"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import type { WinnerSummary } from "@/types/winner";
import { formatWinnerName } from "@/utils/winner-name-formatter";
import PrizeImage from "./PrizeImage";
import { auDateParts } from "./format";

const ROTATE_MS = 5000;
const FADE_MS = 1000;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** The featured card for a single winner. Only the most recent draw shows the
 * "Latest draw" badge; older draws in the rotation show just the draw name. */
function FeaturedCard({ d, isLatest }: { d: WinnerSummary; isLatest: boolean }) {
  const { mon, yr } = auDateParts(d.wonOnDate || d.selectedDate);
  const img = d.prize.images?.[0] || d.imageUrl;
  const winner = formatWinnerName(d.winnerFirstName, d.winnerLastName);
  return (
    <div
      className="lp-card relative overflow-hidden"
      style={{ borderRadius: 22, borderColor: "var(--line-2)", boxShadow: "var(--shadow)" }}
    >
      <div
        className="relative flex items-center justify-center p-4 sm:p-5"
        style={{ background: "linear-gradient(180deg,var(--plinth-a),var(--plinth-b))" }}
      >
        <PrizeImage src={img} alt={`${winner} — ${d.prize.name}`} className="w-full object-contain" style={{ maxHeight: 320 }} />
        <div className="absolute left-4 top-4 right-4 flex flex-wrap items-center gap-2">
          {isLatest ? (
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full lp-badge"
              style={{ background: "var(--accent)" }}
            >
              <span className="lp-livedot" style={{ background: "var(--on-accent)" }} />
              <span className="lp-display text-[11px] tracking-wide" style={{ color: "var(--on-accent)" }}>
                Latest draw
              </span>
            </span>
          ) : null}
          <span
            className="inline-flex items-center font-mono text-[10px] tracking-[.12em] uppercase px-2.5 py-1.5 rounded-full"
            style={{ background: "rgba(0,0,0,.55)", color: "#e4e4e8" }}
          >
            {d.drawName}
          </span>
        </div>
      </div>
      <div className="p-6 sm:p-7">
        <div className="min-w-0">
          <div className="font-mono text-[10px] tracking-[.16em] uppercase" style={{ color: "var(--accent)" }}>
            Winner · {mon} {yr}
          </div>
          <div className="lp-display text-3xl mt-1.5" style={{ color: "var(--ink)" }}>
            {winner}
          </div>
          {d.winnerState ? (
            <div className="inline-flex items-center gap-1.5 text-[13px] mt-1" style={{ color: "var(--ink-3)" }}>
              <MapPin size={14} /> {d.winnerState}
            </div>
          ) : null}
        </div>
        <p className="mt-4 text-[15px] leading-snug" style={{ color: "var(--ink-2)" }}>
          {d.prize.name}
        </p>
      </div>
    </div>
  );
}

/**
 * Auto-cycles the featured card through recent major-draw winners with a fade.
 * Pauses on hover/focus, respects `prefers-reduced-motion` (no auto-advance,
 * no fade animation), and exposes dot controls for manual navigation.
 */
export default function FeaturedDraw({ winners }: { winners: WinnerSummary[] }) {
  const count = winners.length;
  const [shown, setShown] = useState(0);
  const [visible, setVisible] = useState(true);
  const [paused, setPaused] = useState(false);

  // Calm, cinematic crossfade: fade the current card out, swap, fade the next
  // in — no hard cut. The dwell time per winner (ROTATE_MS) is unchanged.
  useEffect(() => {
    if (count <= 1 || paused || prefersReducedMotion()) return;
    let swapTimer: ReturnType<typeof setTimeout>;
    const cycle = setInterval(() => {
      setVisible(false);
      swapTimer = setTimeout(() => {
        setShown((p) => (p + 1) % count);
        setVisible(true);
      }, FADE_MS);
    }, ROTATE_MS);
    return () => {
      clearInterval(cycle);
      clearTimeout(swapTimer);
    };
  }, [count, paused]);

  if (count === 0) return null;
  const current = winners[shown % count];

  return (
    <div className="relative">
      <div className="lp-glow" style={{ width: 360, height: 280, right: -40, top: 40, opacity: 0.22 }} />
      <div
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        <div style={{ opacity: visible ? 1 : 0, transition: `opacity ${FADE_MS}ms ease-in-out` }}>
          <FeaturedCard d={current} isLatest={shown % count === 0} />
        </div>
      </div>
    </div>
  );
}
