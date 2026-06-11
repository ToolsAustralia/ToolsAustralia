"use client";

import { useState } from "react";
import { Calendar, ExternalLink, MapPin } from "lucide-react";
import type { WinnerSummary } from "@/types/winner";
import { formatWinnerName } from "@/utils/winner-name-formatter";
import { Reveal, Stagger } from "./Reveal";
import PrizeImage from "./PrizeImage";
import { auDateParts } from "./format";

type RegisterFilter = "all" | "major" | "mini";

// [key, short label (mobile), full label (sm+)]
const FILTERS: [RegisterFilter, string, string][] = [
  ["all", "All", "All"],
  ["major", "Major", "Major draws"],
  ["mini", "Mini", "Mini draws"],
];

function TypeTag({ type }: { type: WinnerSummary["drawType"] }) {
  const isMajor = type === "major";
  return (
    <span
      className="font-mono text-[9px] tracking-[.12em] uppercase px-2 py-0.5 rounded-full"
      style={{
        background: isMajor ? "color-mix(in srgb, var(--accent) 16%, transparent)" : "var(--panel-2)",
        color: isMajor ? "var(--accent)" : "var(--ink-3)",
        border: isMajor ? "none" : "1px solid var(--line)",
      }}
    >
      {isMajor ? "Major" : "Mini"}
    </span>
  );
}

function DrawRow({ d }: { d: WinnerSummary }) {
  const { day, mon, yr } = auDateParts(d.wonOnDate || d.selectedDate);
  // Always the draw's own artwork (major-draw landscape image / mini-draw prize
  // shot) — never the winner's personal photo.
  const img = d.prize.images?.[0];
  const winner = formatWinnerName(d.winnerFirstName, d.winnerLastName);
  return (
    <article className="lp-card lp-lift overflow-hidden" style={{ borderRadius: 16 }}>
      {/* Always four columns — date · image · winner details · view result — at
          every width (no vertical stacking on mobile). Mobile widths are scaled
          down; the column partition stays identical. */}
      <div className="grid grid-cols-[48px_72px_minmax(0,1fr)_auto] sm:grid-cols-[104px_200px_minmax(0,1fr)_auto] items-stretch">
        {/* 1 · date */}
        <div
          className="flex flex-col items-center justify-center px-1 py-3 sm:py-5"
          style={{ background: "var(--panel-2)", borderRight: "1px solid var(--line)" }}
        >
          <span className="lp-display lp-num text-xl sm:text-[34px] leading-none" style={{ color: "var(--ink)" }}>
            {day}
          </span>
          <span
            className="font-mono text-[8px] sm:text-[10px] tracking-[.1em] uppercase mt-0.5 sm:mt-1 text-center leading-tight"
            style={{ color: "var(--accent)" }}
          >
            {mon} {yr}
          </span>
        </div>
        {/* 2 · image (shown on mobile too) */}
        <div
          className="flex items-center justify-center p-2 sm:p-3"
          style={{ background: "linear-gradient(180deg,var(--plinth-a),var(--plinth-b))", borderRight: "1px solid var(--line)" }}
        >
          <PrizeImage src={img} alt={d.prize.name} className="object-contain" style={{ maxHeight: 96, maxWidth: "100%" }} />
        </div>
        {/* 3 · winner details */}
        <div className="px-3 sm:px-5 py-3 sm:py-4 flex flex-col justify-center min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="lp-display text-[15px] sm:text-lg" style={{ color: "var(--ink)" }}>
              {winner}
            </span>
            {d.winnerState ? (
              <span className="inline-flex items-center gap-1 text-[11px] sm:text-[12px]" style={{ color: "var(--ink-3)" }}>
                <MapPin size={12} /> {d.winnerState}
              </span>
            ) : null}
            <TypeTag type={d.drawType} />
          </div>
          <p className="mt-1 sm:mt-1.5 text-[12px] sm:text-[14px] leading-snug" style={{ color: "var(--ink-2)" }}>
            {d.prize.name}
          </p>
        </div>
        {/* 4 · view result (no divider) */}
        {d.drawResultUrl ? (
          <div className="flex items-center justify-center px-2 sm:px-5">
            <a
              href={d.drawResultUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View draw result on randomdraws.com.au"
              title="View result on randomdraws.com.au"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 sm:px-3 font-mono text-[10px] tracking-[.08em] uppercase font-bold transition-colors"
              style={{ height: 34, border: "1px solid var(--line-2)", color: "var(--accent)" }}
            >
              <ExternalLink size={14} />
              <span className="hidden sm:inline">View result</span>
            </a>
          </div>
        ) : null}
      </div>
    </article>
  );
}

// Major draws get a richer landscape treatment — big draw artwork + prize
// description + "View draw result" — reimagined from the old completed-draw card
// in the new design language. Mini draws use the compact DrawRow above.
function MajorDrawResultCard({ d }: { d: WinnerSummary }) {
  const { full } = auDateParts(d.wonOnDate || d.selectedDate);
  const img = d.prize.images?.[0];
  const winner = formatWinnerName(d.winnerFirstName, d.winnerLastName);
  return (
    <article className="lp-card lp-lift overflow-hidden grid sm:grid-cols-[1.05fr_1fr]">
      {/* landscape draw artwork */}
      <div
        className="relative flex items-center justify-center p-4 sm:p-6"
        style={{ background: "linear-gradient(180deg,var(--plinth-a),var(--plinth-b))", minHeight: 180 }}
      >
        <PrizeImage src={img} alt={d.prize.name} className="w-full object-contain" style={{ maxHeight: 300 }} />
        <div className="absolute left-4 top-4">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full lp-badge"
            style={{ background: "var(--accent)" }}
          >
            <span className="lp-display text-[11px] tracking-wide" style={{ color: "var(--on-accent)" }}>
              Major draw
            </span>
          </span>
        </div>
      </div>
      {/* details */}
      <div className="p-5 sm:p-7 flex flex-col justify-center min-w-0">
        <div className="font-mono text-[10px] tracking-[.16em] uppercase" style={{ color: "var(--accent)" }}>
          Winner · {winner}
          {d.winnerState ? ` · ${d.winnerState}` : ""}
        </div>
        <h3 className="lp-display text-xl sm:text-2xl lg:text-3xl mt-2" style={{ color: "var(--ink)" }}>
          {d.prize.name}
        </h3>
        <div className="mt-4 flex items-center gap-2 text-[12px]" style={{ color: "var(--ink-3)" }}>
          <Calendar size={14} style={{ color: "var(--accent)" }} /> Drawn {full}
        </div>
        {d.drawResultUrl ? (
          <div className="mt-5">
            <a
              href={d.drawResultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="lp-btn lp-btn-accent lp-btn-md lp-shine"
            >
              <ExternalLink size={16} strokeWidth={2.1} />
              <span>View draw result</span>
            </a>
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function ResultsRegister({ winners }: { winners: WinnerSummary[] }) {
  const [filter, setFilter] = useState<RegisterFilter>("all");
  const shown = filter === "all" ? winners : winners.filter((w) => w.drawType === filter);

  // Year span from the full dataset (newest first).
  const years = winners
    .map((w) => auDateParts(w.wonOnDate || w.selectedDate).yr)
    .filter(Boolean);
  const newest = years[0];
  const oldest = years[years.length - 1];
  const span = newest && oldest ? (newest === oldest ? newest : `${oldest}–${newest.slice(2)}`) : "";

  return (
    <section
      id="results"
      aria-labelledby="results-heading"
      className="py-12 sm:py-20"
      style={{ background: "var(--surface)", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}
    >
      <div className="lp-container">
        {/* ledger bar */}
        <Reveal
          className="flex flex-row items-center justify-between gap-3 pb-5"
          style={{ borderBottom: "2px solid var(--ink)" }}
        >
          <div className="min-w-0">
            <h2 id="results-heading" className="lp-display text-lg sm:text-2xl" style={{ color: "var(--ink)" }}>
              Draw results
            </h2>
            <div
              className="font-mono text-[9.5px] sm:text-[11px] tracking-[.1em] sm:tracking-[.12em] uppercase mt-0.5 sm:mt-1"
              style={{ color: "var(--ink-3)" }}
            >
              {shown.length} {shown.length === 1 ? "result" : "results"}
              {span ? ` · ${span}` : ""}
            </div>
          </div>
          <div
            className="inline-flex p-1 rounded-xl shrink-0"
            style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
          >
            {FILTERS.map(([k, short, full]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg font-mono text-[10px] sm:text-[10.5px] tracking-[.06em] sm:tracking-[.08em] uppercase font-bold transition-all whitespace-nowrap"
                style={{
                  background: filter === k ? "var(--accent)" : "transparent",
                  color: filter === k ? "var(--on-accent)" : "var(--ink-2)",
                }}
              >
                <span className="sm:hidden">{short}</span>
                <span className="hidden sm:inline">{full}</span>
              </button>
            ))}
          </div>
        </Reveal>

        {shown.length > 0 ? (
          <Stagger className="mt-6 space-y-3 sm:space-y-4">
            {shown.map((d) =>
              d.drawType === "major" ? (
                <MajorDrawResultCard key={d.id} d={d} />
              ) : (
                <DrawRow key={d.id} d={d} />
              )
            )}
          </Stagger>
        ) : (
          <p className="mt-8 text-[14px]" style={{ color: "var(--ink-3)" }}>
            No {filter === "all" ? "" : filter + " "}draw results to show yet — check back after the next live draw.
          </p>
        )}
      </div>
    </section>
  );
}
