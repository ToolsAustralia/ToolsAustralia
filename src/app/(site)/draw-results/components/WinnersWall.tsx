"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { WinnerSummary } from "@/types/winner";
import { Reveal, Stagger } from "./Reveal";
import WinnerBoardCard from "./WinnerBoardCard";
import { fmtNum } from "./format";

// Reveal the board in pages (matches the /winners board + the design's
// "Show N more" behaviour).
const PAGE = 8;

export default function WinnersWall({
  winners,
  totalWinners,
}: {
  winners: WinnerSummary[];
  totalWinners: number;
}) {
  const [visible, setVisible] = useState(PAGE);
  if (winners.length === 0) return null;

  const paged = winners.slice(0, visible);
  const remaining = winners.length - visible;

  return (
    <section id="wall" className="py-14 sm:py-24" style={{ background: "var(--bg)" }}>
      <div className="lp-container">
        <Reveal className="max-w-2xl">
          <span className="lp-kicker">The wall</span>
          <h2 className="lp-display lp-italic text-2xl sm:text-4xl lg:text-5xl mt-4" style={{ color: "var(--ink)" }}>
            Real gear. Real winners.
          </h2>
          <p className="mt-4 text-[15px]" style={{ color: "var(--ink-2)" }}>
            Every winner is announced live and verified at randomdraws.com.au, then shipped their prize free
            Australia-wide — or paid the cash.
          </p>
          <div className="mt-6 flex items-baseline gap-3">
            <span className="lp-display lp-num text-4xl" style={{ color: "var(--accent)" }}>
              {fmtNum(totalWinners)}
            </span>
            <span className="text-[13px]" style={{ color: "var(--ink-3)" }}>
              winners and counting
            </span>
          </div>
        </Reveal>

        <Stagger className="lw-grid mt-8 sm:mt-12">
          {paged.map((w) => (
            <WinnerBoardCard key={w.id} w={w} />
          ))}
        </Stagger>

        {remaining > 0 ? (
          <div className="lw-more">
            <button type="button" className="lw-morebtn" onClick={() => setVisible((v) => v + PAGE)}>
              Show {Math.min(PAGE, remaining)} more <ChevronDown size={16} />
            </button>
            <span className="lw-count">
              Showing {paged.length} of {winners.length} winners
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
