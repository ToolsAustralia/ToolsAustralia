"use client";

import { useMemo, useState } from "react";
import { MapPin, Search, ShieldCheck, Trophy } from "lucide-react";
import type { WinnerSummary } from "@/types/winner";
import { formatWinnerName } from "@/utils/winner-name-formatter";
import { getWinnerSearchableContent } from "@/utils/winners";
import { Stagger } from "../../draw-results/components/Reveal";
import { auDateParts } from "../../draw-results/components/format";
import WinnersTestimony from "./WinnersTestimony";

type Filter = "all" | "major" | "mini";

// [key, full label (sm+)] — the short mobile label is the first word.
const FILTERS: [Filter, string][] = [
  ["all", "All winners"],
  ["major", "Major draws"],
  ["mini", "Mini draws"],
];

// Premium winner card (design: WinnerProCard) — accent-glow dark stage,
// gradient-bordered artwork, name + 1st-prize, location, prize, then a footer
// with the drawn DATE (prize value intentionally omitted) + verify link.
function WallCard({ w }: { w: WinnerSummary }) {
  const winner = formatWinnerName(w.winnerFirstName, w.winnerLastName);
  const { full } = auDateParts(w.wonOnDate || w.selectedDate);
  const img = w.imageUrl || w.prize.images?.[0];
  const isMajor = w.drawType === "major";
  const prizeText = w.selectedPrize || w.prize.name;
  return (
    <article
      className="lp-lift overflow-hidden flex flex-col"
      style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 22, boxShadow: "var(--shadow)" }}
    >
      {/* dark stage with corner accent glow */}
      <div
        className="relative overflow-hidden p-4 sm:p-5"
        style={{ background: "radial-gradient(120% 90% at 80% 0%, color-mix(in srgb, var(--accent) 16%, #0c0f1a), #080a12 70%)" }}
      >
        <div className="flex justify-center mb-3.5">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[9.5px] tracking-[.12em] uppercase font-bold"
            style={{ background: "rgba(2,6,15,.6)", border: "1px solid color-mix(in srgb, var(--accent) 50%, transparent)", color: "#eef0f4" }}
          >
            <Trophy size={12} strokeWidth={2.2} style={{ color: "var(--accent)" }} /> {full} · {isMajor ? "Major" : "Mini"} Draw Winner
          </span>
        </div>
        {/* gradient-bordered prize image */}
        <div
          className="rounded-[18px] p-[2.5px]"
          style={{ background: "linear-gradient(135deg, var(--accent-2), var(--accent) 55%, color-mix(in srgb, var(--accent) 40%, #fff))" }}
        >
          <div
            className="relative overflow-hidden rounded-[15px] flex items-center justify-center"
            style={{ aspectRatio: "4 / 3.4", background: "linear-gradient(180deg,#11131c,#0a0c14)" }}
          >
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element -- external Cloudinary art
              <img src={img} alt={`${winner} — ${prizeText}`} loading="lazy" className="w-full h-full object-contain p-3" />
            ) : (
              <Trophy aria-hidden="true" style={{ width: 52, height: 52, color: "rgba(255,255,255,.3)" }} />
            )}
          </div>
        </div>
        <div className="mt-3.5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="lp-display text-2xl leading-none truncate flex-1 min-w-0" style={{ color: "#fff" }}>
              {winner}
            </h3>
            <span
              className="inline-flex items-center shrink-0 rounded-full px-2.5 py-1 font-mono text-[9px] tracking-[.1em] uppercase font-bold"
              style={{ background: "var(--accent)", color: "var(--on-accent)" }}
            >
              1st Prize
            </span>
          </div>
          {w.winnerState ? (
            <span className="inline-flex items-center gap-1 text-[12px] mt-2" style={{ color: "#9aa0ac" }}>
              <MapPin size={13} /> {w.winnerState}
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-[13px] leading-snug font-medium" style={{ color: "#c2c6cf" }}>
          {prizeText}
        </p>
      </div>
      {/* footer — drawn date + verify (no prize value) */}
      <div
        className="px-5 py-4 flex items-center justify-between gap-3"
        style={{ borderTop: "2px solid color-mix(in srgb, var(--accent) 60%, transparent)" }}
      >
        <div className="min-w-0">
          <div className="font-mono text-[9px] tracking-[.14em] uppercase" style={{ color: "var(--ink-3)" }}>
            Drawn
          </div>
          <div className="lp-display lp-num text-xl" style={{ color: "var(--ink)" }}>
            {full}
          </div>
        </div>
        {w.drawResultUrl ? (
          <a
            href={w.drawResultUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Verify draw on randomdraws.com.au"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 font-mono text-[10px] tracking-[.1em] uppercase font-bold shrink-0 transition-colors"
            style={{ height: 38, border: "1px solid var(--line-2)", color: "var(--accent)" }}
          >
            <ShieldCheck size={15} /> Verify
          </a>
        ) : null}
      </div>
    </article>
  );
}

export default function WinnersBrowser({ winners }: { winners: WinnerSummary[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
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

      {/* winner grid */}
      <section className="py-12 sm:py-20" style={{ background: "var(--bg)" }}>
        <div className="lp-container">
          {shown.length > 0 ? (
            <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {shown.map((w) => (
                <WallCard key={w.id} w={w} />
              ))}
            </Stagger>
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
