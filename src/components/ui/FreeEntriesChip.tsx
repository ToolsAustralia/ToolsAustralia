"use client";

import { cn } from "@/utils/cn";

/**
 * The "+N free entries" stat chip — the gold/amber sibling of the red countdown CDBox
 * (rounded-xl · gradient · outer shadow · inset ring · Poppins-black number). "FREE" is a
 * corner **badge**, not a second label row, so the chip stays one-number-tall and compact.
 *
 * Single source for the three surfaces that show it: the dashboard EntryWallet renewal note
 * (gold) + past-due note (amber), and the resolve popup/sheet RenewalPreviewNote (amber).
 */
export default function FreeEntriesChip({ value, tone }: { value: number; tone: "gold" | "amber" }) {
  const gold = tone === "gold";
  return (
    <span
      className={cn(
        "relative flex min-w-[56px] shrink-0 flex-col items-center gap-0.5 rounded-xl px-3 py-2",
        gold
          ? "bg-gradient-to-br from-[#f6dd8c] via-[#e9c65f] to-[#d4af37] text-[#241a02] shadow-[0_8px_18px_-8px_rgba(212,175,55,.6),inset_0_0_0_1px_rgba(246,221,140,.5)]"
          : "bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 text-white shadow-[0_8px_18px_-8px_rgba(217,119,6,.55),inset_0_0_0_1px_rgba(253,211,120,.45)]",
      )}
    >
      <span
        className={cn(
          "absolute -right-1.5 -top-1.5 rounded-full bg-white px-1.5 py-[1px] text-[7.5px] font-black uppercase tracking-[0.06em] shadow-[0_2px_5px_-1px_rgba(0,0,0,.35)]",
          gold ? "text-[#9a7b1e]" : "text-amber-700",
        )}
      >
        Free
      </span>
      <span
        className={cn(
          "num font-['Poppins'] text-[20px] font-black leading-none tracking-[-.02em]",
          gold ? "[text-shadow:0_1px_1px_rgba(255,255,255,.25)]" : "[text-shadow:0_1px_1px_rgba(120,60,0,.3)]",
        )}
      >
        +{value.toLocaleString()}
      </span>
      <span className="text-[8px] font-extrabold uppercase leading-[1.1] tracking-[0.12em] opacity-90">Entries</span>
    </span>
  );
}
