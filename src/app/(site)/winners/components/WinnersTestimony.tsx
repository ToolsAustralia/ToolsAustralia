"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archivo, Newsreader, Space_Mono } from "next/font/google";
import { ChevronRight, Play, X } from "lucide-react";
import type { WinnerSummary } from "@/types/winner";
import { cn } from "@/utils/cn";
import { formatWinnerName } from "@/utils/winner-name-formatter";
import { getWinnerTestimonyExcerpt, hasWinnerTestimony, stripRichTextHtml } from "@/utils/winners";
import { Reveal } from "../../draw-results/components/Reveal";
import { auDateParts } from "../../draw-results/components/format";

// Self-loaded so this section renders identically on ANY host page (homepage,
// promotions, my-account) — not just the scoped /winners + /draw-results routes.
// The shared `.ta-results` stylesheet is loaded globally in the root layout.
const archivo = Archivo({ subsets: ["latin"], weight: ["600", "700", "800", "900"], style: ["normal", "italic"], variable: "--font-archivo", display: "swap" });
const spaceMono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-space-mono", display: "swap" });
const newsreader = Newsreader({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"], variable: "--font-newsreader", display: "swap" });

// Cinematic testimony card (design: CinematicCard) — top-right + bottom-left
// accent corner glows, accent-tinted border, editorial serif quote.
function CinematicCard({ w, onOpen }: { w: WinnerSummary; onOpen: (id: string) => void }) {
  const major = w.drawType === "major";
  const { full } = auDateParts(w.wonOnDate || w.selectedDate);
  const name = formatWinnerName(w.winnerFirstName, w.winnerLastName);
  const prizeText = w.selectedPrize || w.prize.name;
  return (
    <div
      className="relative overflow-hidden flex flex-col text-white"
      style={{
        minHeight: 360,
        borderRadius: 24,
        padding: "clamp(24px,3vw,40px)",
        background:
          "radial-gradient(130% 120% at 100% 0%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 42%), radial-gradient(120% 120% at 0% 100%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 45%), linear-gradient(135deg, #050811 0%, #0b1326 52%, #050811 100%)",
        border: "1px solid color-mix(in srgb, var(--accent) 28%, transparent)",
        boxShadow: "var(--shadow)",
      }}
    >
      <div className="flex flex-nowrap items-center gap-2 mb-5">
        <span
          className="inline-flex shrink-0 rounded-full px-3 py-1.5 font-mono text-[9.5px] tracking-[.18em] uppercase font-bold"
          style={{ background: "rgba(2,6,15,.45)", border: "1px solid color-mix(in srgb, var(--accent) 55%, transparent)" }}
        >
          {major ? "Major Draw Winner" : "Mini Draw Winner"}
        </span>
        <span
          className="inline-flex min-w-0 truncate rounded-full px-3 py-1.5 font-mono text-[9.5px] tracking-[.14em] uppercase font-semibold"
          style={{ background: "rgba(2,6,15,.45)", border: "1px solid rgba(255,255,255,.18)", color: "rgba(255,255,255,.78)" }}
        >
          {full}
          {w.winnerState ? ` · ${w.winnerState}` : ""}
        </span>
      </div>
      <div className="mb-6">
        <div aria-hidden="true" className="winners-serif" style={{ color: "var(--accent)", fontSize: 52, lineHeight: 0.3, opacity: 0.9, marginBottom: 14 }}>
          &ldquo;
        </div>
        <p
          className="winners-serif"
          style={{
            fontStyle: "italic",
            fontSize: "clamp(16px,1.5vw,21px)",
            lineHeight: 1.55,
            maxWidth: 640,
            color: "#eef0f4",
            display: "-webkit-box",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {getWinnerTestimonyExcerpt(w.testimony, 248)}
        </p>
      </div>
      <div className="mt-auto flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1">
          <h3 className="lp-display text-2xl sm:text-3xl leading-none" style={{ color: "#fff" }}>
            {name}
          </h3>
          <p className="mt-2 truncate font-mono text-[10.5px] uppercase tracking-[.16em]" style={{ color: "rgba(255,255,255,.66)" }}>
            {prizeText}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpen(w.id)}
          aria-haspopup="dialog"
          className="group inline-flex shrink-0 items-center gap-1.5 self-start sm:self-end font-mono text-[11px] font-bold uppercase tracking-[.16em] transition-opacity hover:opacity-80"
          style={{
            color: "var(--accent)",
            textUnderlineOffset: 6,
            textDecoration: "underline",
            textDecorationThickness: 2,
            textDecorationColor: "color-mix(in srgb, var(--accent) 55%, transparent)",
          }}
        >
          Read full story
          <span className="transition-transform group-hover:translate-x-0.5">
            <ChevronRight size={15} />
          </span>
        </button>
      </div>
    </div>
  );
}

function StoryModal({ w, onClose }: { w: WinnerSummary | null; onClose: () => void }) {
  useEffect(() => {
    if (!w) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [w, onClose]);
  if (!w) return null;
  // Testimony is rich-text HTML — strip tags to clean paragraphs (block tags
  // become newlines) so we never render raw <p> markup.
  const paras = stripRichTextHtml(w.testimony)
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const major = w.drawType === "major";
  const { full } = auDateParts(w.wonOnDate || w.selectedDate);
  const name = formatWinnerName(w.winnerFirstName, w.winnerLastName);
  const prizeText = w.selectedPrize || w.prize.name;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true" aria-label={`${name}'s story`}>
      <div className="absolute inset-0" onClick={onClose} style={{ background: "rgba(4,6,12,.74)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }} />
      <div
        className="relative w-full overflow-hidden flex flex-col"
        style={{ maxWidth: 720, maxHeight: "90dvh", borderRadius: 24, background: "var(--panel)", border: "1px solid var(--line-2)", boxShadow: "0 40px 90px -30px rgba(0,0,0,.8)" }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-20 inline-flex items-center justify-center rounded-full transition-colors"
          style={{ width: 36, height: 36, background: "rgba(2,6,15,.55)", border: "1px solid rgba(255,255,255,.2)", color: "#fff" }}
        >
          <X size={17} />
        </button>
        <div
          className="relative flex flex-col items-center justify-center text-center px-6 py-4 text-white shrink-0"
          style={{ background: "radial-gradient(130% 130% at 50% 0%, color-mix(in srgb, var(--accent) 24%, transparent), transparent 50%), linear-gradient(135deg, #050811, #0b1326 55%, #050811)" }}
        >
          <span
            className="mb-2 inline-flex rounded-full px-3 py-1 font-mono text-[9px] tracking-[.2em] uppercase font-bold"
            style={{ background: "rgba(2,6,15,.45)", border: "1px solid color-mix(in srgb, var(--accent) 55%, transparent)" }}
          >
            {major ? "Major Draw Winner" : "Mini Draw Winner"}
          </span>
          <h3 className="lp-display text-xl sm:text-2xl" style={{ color: "#fff" }}>
            {name}
          </h3>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[.16em] max-w-[90%]" style={{ color: "rgba(255,255,255,.68)" }}>
            {prizeText}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-7 sm:px-10 sm:py-9">
          <div className="text-center font-mono text-[10px] uppercase tracking-[.18em] mb-4" style={{ color: "var(--ink-3)" }}>
            {full}
            {w.winnerState ? ` · ${w.winnerState}` : ""}
          </div>
          <div className="mb-6 flex items-center gap-3 font-mono text-[10px] font-bold uppercase tracking-[.28em]" style={{ color: "var(--accent)" }}>
            <span className="h-px flex-1" style={{ background: "linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 55%, transparent))" }} />
            The story
            <span className="h-px flex-1" style={{ background: "linear-gradient(90deg, color-mix(in srgb, var(--accent) 55%, transparent), transparent)" }} />
          </div>
          <div className="winners-serif" style={{ color: "var(--ink-2)", fontSize: 17, lineHeight: 1.72 }}>
            {paras.map((p, i) =>
              i === 0 ? (
                <p key={i} className="mb-5" style={{ display: "flow-root" }}>
                  <span className="winners-serif" style={{ float: "left", marginRight: 12, marginTop: 6, fontSize: 54, fontWeight: 700, lineHeight: 0.82, color: "var(--accent)" }}>
                    {p.charAt(0)}
                  </span>
                  {p.slice(1)}
                </p>
              ) : (
                <p key={i} className="mb-5 last:mb-0">
                  {p}
                </p>
              )
            )}
          </div>
          {w.watchUrl ? (
            <div className="mt-7 pt-5 flex justify-center" style={{ borderTop: "1px solid var(--line)" }}>
              <a href={w.watchUrl} target="_blank" rel="noopener noreferrer" className="lp-btn lp-btn-ghost lp-btn-md">
                <Play size={17} /> <span>Watch the draw</span>
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function WinnersTestimony({ winners }: { winners: WinnerSummary[] }) {
  const stories = useMemo(() => winners.filter((w) => hasWinnerTestimony(w)), [winners]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  const scrollTo = useCallback(
    (i: number) => {
      const track = trackRef.current;
      const n = stories.length;
      if (!track || n === 0) return;
      const clamped = ((i % n) + n) % n;
      const child = track.children[clamped] as HTMLElement | undefined;
      if (child) track.scrollTo({ left: child.offsetLeft - (track.clientWidth - child.clientWidth) / 2, behavior: "smooth" });
    },
    [stories.length]
  );

  const onScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const center = track.scrollLeft + track.clientWidth / 2;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < stories.length; i++) {
      const c = track.children[i] as HTMLElement | undefined;
      if (!c) continue;
      const cc = c.offsetLeft + c.clientWidth / 2;
      const d = Math.abs(cc - center);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setIdx(best);
  }, [stories.length]);

  if (stories.length === 0) return null;
  const multi = stories.length > 1;
  const storyWinner = stories.find((w) => w.id === openId) ?? null;

  return (
    <div className={cn("ta-results", archivo.variable, spaceMono.variable, newsreader.variable)} style={{ background: "transparent" }}>
      <section className="relative overflow-hidden py-16 sm:py-20 lg:py-24" style={{ borderTop: "1px solid var(--line)" }}>
      <div className="lp-glow" style={{ width: 520, height: 340, left: "50%", top: -140, transform: "translateX(-50%)", opacity: 0.12 }} />
      <div className="lp-container relative">
        <Reveal className="text-center mb-9 lg:mb-12">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[.3em] mb-3" style={{ color: "var(--accent)" }}>
            — Real stories —
          </div>
          <h2 className="lp-display lp-italic text-2xl sm:text-4xl lg:text-5xl" style={{ color: "var(--ink)" }}>
            Hear from our winners.
          </h2>
          <div className="mx-auto mt-4 h-[2px] w-12 rounded-full" style={{ background: "linear-gradient(90deg, var(--accent-2), var(--accent))" }} />
        </Reveal>

        <div className="relative">
          {multi ? (
            <>
              <button
                type="button"
                onClick={() => scrollTo(idx - 1)}
                aria-label="Previous story"
                className="hidden lg:flex absolute left-0 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-colors"
                style={{ width: 48, height: 48, background: "var(--panel)", border: "1px solid var(--line-2)", color: "var(--ink)", boxShadow: "var(--shadow)" }}
              >
                <ChevronRight size={20} style={{ transform: "rotate(180deg)" }} />
              </button>
              <button
                type="button"
                onClick={() => scrollTo(idx + 1)}
                aria-label="Next story"
                className="hidden lg:flex absolute right-0 top-1/2 z-20 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full transition-colors"
                style={{ width: 48, height: 48, background: "var(--panel)", border: "1px solid var(--line-2)", color: "var(--ink)", boxShadow: "var(--shadow)" }}
              >
                <ChevronRight size={20} />
              </button>
            </>
          ) : null}

          <div ref={trackRef} onScroll={onScroll} className="lp-noscroll flex overflow-x-auto snap-x snap-mandatory" style={{ gap: 20, scrollPadding: 16 }}>
            {stories.map((w) => (
              <div key={w.id} className="snap-center shrink-0" style={{ flexBasis: "min(92%, 720px)" }}>
                <CinematicCard w={w} onOpen={setOpenId} />
              </div>
            ))}
            <div className="shrink-0" style={{ width: 1 }} />
          </div>
        </div>

        {multi ? (
          <div className="mt-7 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => scrollTo(idx - 1)}
              aria-label="Previous story"
              className="lg:hidden inline-flex items-center justify-center rounded-full"
              style={{ width: 42, height: 42, background: "var(--panel)", border: "1px solid var(--line-2)", color: "var(--ink)" }}
            >
              <ChevronRight size={18} style={{ transform: "rotate(180deg)" }} />
            </button>
            <div className="flex items-center gap-2">
              {stories.map((w, i) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => scrollTo(i)}
                  aria-label={`Go to story ${i + 1}`}
                  className="rounded-full transition-all"
                  style={{ height: 9, width: i === idx ? 30 : 9, background: i === idx ? "linear-gradient(90deg, var(--accent-2), var(--accent))" : "var(--line-2)" }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => scrollTo(idx + 1)}
              aria-label="Next story"
              className="lg:hidden inline-flex items-center justify-center rounded-full"
              style={{ width: 42, height: 42, background: "var(--panel)", border: "1px solid var(--line-2)", color: "var(--ink)" }}
            >
              <ChevronRight size={18} />
            </button>
            <span className="lg:hidden lp-num text-[12.5px] font-medium" style={{ color: "var(--ink-3)" }}>
              {idx + 1}/{stories.length}
            </span>
          </div>
        ) : null}
      </div>

      <StoryModal w={storyWinner} onClose={() => setOpenId(null)} />
      </section>
    </div>
  );
}
