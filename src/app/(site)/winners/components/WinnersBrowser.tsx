"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import type { WinnerSummary } from "@/types/winner";
import { formatWinnerName } from "@/utils/winner-name-formatter";
import { getWinnerSearchableContent } from "@/utils/winners";
import { Stagger } from "../../draw-results/components/Reveal";
import WinnerBoardCard from "../../draw-results/components/WinnerBoardCard";
import WinnersTestimony from "./WinnersTestimony";

type Filter = "all" | "major" | "mini";

// [key, full label (sm+)] — the short mobile label is the first word.
const FILTERS: [Filter, string][] = [
  ["all", "All winners"],
  ["major", "Major draws"],
  ["mini", "Mini draws"],
];

// Reveal the board in pages so a large archive doesn't dump hundreds of tiles
// at once (matches the design's "Show N more" behaviour).
const PAGE = 8;

export default function WinnersBrowser({ winners }: { winners: WinnerSummary[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(PAGE);
  const q = query.trim().toLowerCase();

  const shown = useMemo(() => {
    let list = filter === "all" ? winners : winners.filter((w) => w.drawType === filter);
    if (q) {
      list = list.filter(
        (w) =>
          formatWinnerName(w.winnerFirstName, w.winnerLastName).toLowerCase().includes(q) ||
          getWinnerSearchableContent(w).includes(q)
      );
    }
    return list;
  }, [filter, q, winners]);

  // Any change to the filter or search resets the board back to the first page.
  useEffect(() => {
    setVisible(PAGE);
  }, [filter, q]);

  const paged = shown.slice(0, visible);
  const remaining = shown.length - visible;

  return (
    <>
      {/* sticky filter + search — one row at every width */}
      <div
        className="sticky top-[60px] sm:top-[70px] z-30"
        style={{ background: "var(--surface)", borderBottom: "1px solid var(--line)", borderTop: "1px solid var(--line)" }}
      >
        <div className="lp-container py-3 sm:py-4 flex flex-row items-center gap-2 sm:gap-3">
          <div
            className="inline-flex p-1 rounded-xl shrink-0"
            style={{ background: "var(--panel)", border: "1px solid var(--line)" }}
            role="tablist"
            aria-label="Filter winners"
          >
            {FILTERS.map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={filter === k}
                onClick={() => setFilter(k)}
                className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg font-mono text-[10px] sm:text-[10.5px] tracking-[.06em] sm:tracking-[.08em] uppercase font-bold transition-all whitespace-nowrap"
                style={{
                  background: filter === k ? "var(--accent)" : "transparent",
                  color: filter === k ? "var(--on-accent)" : "var(--ink-2)",
                }}
              >
                <span className="sm:hidden">{label.split(" ")[0]}</span>
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-0">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--ink-3)" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search winners"
              placeholder="Search names, prizes, draws…"
              className="w-full rounded-xl py-2 sm:py-2.5 pl-9 sm:pl-10 pr-3 text-[13px] sm:text-[14px] outline-none transition-colors"
              style={{ background: "var(--panel)", border: "1px solid var(--line)", color: "var(--ink)" }}
            />
          </div>
          <div className="hidden md:block font-mono text-[11px] tracking-[.1em] uppercase shrink-0" style={{ color: "var(--ink-3)" }}>
            {shown.length} / {winners.length}
          </div>
        </div>
      </div>

      {/* winners board */}
      <section className="py-12 sm:py-20" style={{ background: "var(--bg)" }}>
        <div className="lp-container">
          {shown.length > 0 ? (
            <>
              <Stagger className="lw-grid">
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
                    Showing {paged.length} of {shown.length} winners
                  </span>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-[14px]" style={{ color: "var(--ink-3)" }}>
              No winners match this {filter === "all" ? "search" : "filter"} yet — try clearing it or check back after
              the next live draw.
            </p>
          )}
        </div>
      </section>

      {shown.length > 0 ? <WinnersTestimony winners={shown} /> : null}
    </>
  );
}
