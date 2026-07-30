"use client";

import React from "react";
import { cn } from "@/utils/cn";

/**
 * The draw-night timeline: entries open → entries freeze → draw live → next
 * draw opens. Each row is a 9px ring marker on a 1px connector line.
 *
 * A gate with no date still renders (muted, "Not scheduled") rather than being
 * hidden — a missing next draw is precisely the thing an admin needs to notice.
 */
export interface DrawGate {
  label: string;
  time: string | null;
  note: string;
  /** Highlights the gate the draw is currently working toward. */
  current?: boolean;
}

export default function DrawGatesCard({ gates }: { gates: DrawGate[] }) {
  return (
    <section className="rounded-[11px] border border-[var(--line)] bg-[var(--panel)] p-[14px] shadow-[var(--shadow)]">
      <h3 className="font-poppins text-[15px] font-bold text-[var(--text)]">Draw-night gates</h3>

      <ol className="mt-[12px]">
        {gates.map((gate, i) => {
          const isLast = i === gates.length - 1;
          const scheduled = gate.time !== null;
          return (
            <li key={gate.label} className="relative flex gap-[12px] pb-[14px] last:pb-0">
              {/* Marker + connector */}
              <div className="relative flex w-[9px] shrink-0 justify-center">
                <span
                  className={cn(
                    "z-10 mt-[4px] h-[9px] w-[9px] rounded-full border-2 bg-[var(--panel)]",
                    gate.current
                      ? "border-[var(--accent)]"
                      : scheduled
                        ? "border-[var(--text3)]"
                        : "border-[var(--line)]"
                  )}
                  aria-hidden
                />
                {!isLast && <span className="absolute top-[9px] h-full w-px bg-[var(--line)]" aria-hidden />}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-[10px]">
                  <span
                    className={cn(
                      "text-[13px] font-semibold",
                      scheduled ? "text-[var(--text)]" : "text-[var(--text3)]"
                    )}
                  >
                    {gate.label}
                  </span>
                  <span data-figure className="text-[12px] text-[var(--text2)]">
                    {gate.time ?? "Not scheduled"}
                  </span>
                </div>
                <p className="mt-[2px] text-[11.5px] leading-[1.5] text-[var(--text3)]">{gate.note}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
