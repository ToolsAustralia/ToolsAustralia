"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PrizeSpecSection } from "@/config/prizes";

interface TabBarProps {
  sections: PrizeSpecSection[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

/** Which ends of the tab row still have content past the edge. */
type Overflow = { start: boolean; end: boolean };

/**
 * Section switcher for the spec sheet.
 *
 * Sticks to the top of the scrolling pane (the mobile feature block scrolls away behind
 * it) and stays a single non-wrapping row that scrolls horizontally — a prize with six
 * sections must never push the first spec card off screen. The active pill is filled
 * with `--pbc-accent`, so it re-tints with the selected power toolset.
 *
 * Overflow is signalled by a floating chevron at whichever edge still has tabs past it —
 * no scrollbar rail. The chevrons are real buttons (they page the row by ~80%), so the
 * affordance is usable with a mouse, not just a hint.
 */
export default function TabBar({ sections, activeId, onSelect }: TabBarProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState<Overflow>({ start: false, end: false });

  const measure = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    // 1px tolerance: sub-pixel layout leaves a fractional remainder at the true end.
    const max = el.scrollWidth - el.clientWidth;
    setOverflow({ start: el.scrollLeft > 1, end: el.scrollLeft < max - 1 });
  }, []);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    // Re-measure when the pane resizes (drawer ⇄ dialog at `lg`, orientation change).
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure, sections]);

  /** Keep the selected tab in view when the sheet opens on a section that starts off-screen. */
  useEffect(() => {
    if (!activeId) return;
    rowRef.current
      ?.querySelector(`#pbc-tab-${CSS.escape(activeId)}`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId]);

  const page = (direction: 1 | -1) => {
    const el = rowRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <div className="sticky top-0 z-[3] border-b border-[var(--pbc-border)] bg-[var(--pbc-panel)]">
      <div className="relative">
        <div
          ref={rowRef}
          role="tablist"
          aria-label="Prize sections"
          className="scrollbar-hide flex flex-nowrap gap-2 overflow-x-auto px-[18px] py-[13px] lg:pr-14"
        >
          {sections.map((section) => {
            const isActive = section.id === activeId;
            return (
              <button
                key={section.id}
                id={`pbc-tab-${section.id}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls="pbc-tabpanel"
                onClick={() => onSelect(section.id)}
                className="inline-flex flex-none cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-[13px] py-2 font-poppins text-[11px] font-bold leading-none transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pbc-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--pbc-panel)]"
                style={
                  isActive
                    ? { borderColor: "var(--pbc-accent)", background: "var(--pbc-accent)", color: "#ffffff" }
                    : {
                        borderColor: "var(--pbc-border)",
                        background: "var(--pbc-tab-inactive-bg)",
                        color: "var(--pbc-text)",
                      }
                }
              >
                {section.label}
                {section.items.length > 0 && (
                  <span
                    className="inline-flex h-[15px] min-w-[17px] items-center justify-center rounded-full px-[5px] text-[9px] font-extrabold"
                    style={
                      isActive
                        ? { background: "rgba(255,255,255,.25)", color: "#ffffff" }
                        : { background: "var(--pbc-tab-badge-bg)", color: "var(--pbc-sub)" }
                    }
                  >
                    {section.items.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {overflow.start && <ScrollAffordance side="start" onClick={() => page(-1)} />}
        {overflow.end && <ScrollAffordance side="end" onClick={() => page(1)} />}
      </div>
    </div>
  );
}

/**
 * Floating chevron over the scrolling edge. The gradient behind it fades the tabs out
 * rather than cutting them off, which is what reads as "there is more this way".
 */
function ScrollAffordance({ side, onClick }: { side: "start" | "end"; onClick: () => void }) {
  const isStart = side === "start";
  return (
    <div
      className={`pointer-events-none absolute inset-y-0 z-[1] flex w-14 items-center ${
        isStart ? "left-0 justify-start pl-1.5" : "right-0 justify-end pr-1.5"
      }`}
      style={{
        background: `linear-gradient(to ${isStart ? "right" : "left"}, var(--pbc-panel) 40%, transparent)`,
      }}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={isStart ? "Scroll sections left" : "Scroll sections right"}
        className="pointer-events-auto flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-[var(--pbc-border)] bg-[var(--pbc-control-bg)] text-[var(--pbc-text)] shadow-sm backdrop-blur-sm transition-colors hover:bg-[var(--pbc-chip-strong-bg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pbc-accent)]"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d={isStart ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"} />
        </svg>
      </button>
    </div>
  );
}
