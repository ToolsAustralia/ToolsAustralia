"use client";

import { useState } from "react";
import { Check, ExternalLink } from "lucide-react";

interface DrawsMajorHeroProps {
  drawName: string;
  drawStatus: string;
}

type PrizePick = "a" | "b";

// Prize framing copy (matches the prototype `D.prize`; the tool-combo prize is
// presentation framing over the real catalogue).
const PRIZE: Record<PrizePick, { tagline: string; title: string; items: string[] }> = {
  a: {
    tagline: "Win the lot",
    title: "The Ultimate Tradie Setup",
    items: [
      "Your pick of brand — Milwaukee, DeWalt, Makita & more",
      "Toolbox + power-tool kit + storage system",
      "$5,000 cash on top",
    ],
  },
  b: {
    tagline: "Take the lot in cash",
    title: "Straight Cash",
    items: ["$10,000 cash, tax-free", "Paid straight to your bank", "Spend it however you like"],
  },
};

/** Premium dark major-draw hero — prize picker (setup vs $10k cash) + "View this promotion". */
export default function DrawsMajorHero({ drawName, drawStatus }: DrawsMajorHeroProps) {
  const [prize, setPrize] = useState<PrizePick>("a");
  const p = PRIZE[prize];
  const isCompleted = drawStatus === "completed";

  return (
    <section className="relative overflow-hidden px-5 pb-6 pt-5 text-white" style={{ background: "linear-gradient(160deg,#1a1a1e,#0b0b0d)" }}>
      <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(360px 200px at 82% -20%,rgba(238,0,0,.32),transparent 62%)" }} />
      <span aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(135deg,rgba(255,255,255,.04) 0 1px,transparent 1px 16px)" }} />

      <div className="relative flex items-center gap-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-full px-[11px] py-[7px] text-[10px] font-extrabold uppercase tracking-[0.1em]" style={{ background: "linear-gradient(180deg,#ff2a2a,#c40d0d)" }}>
          <span className="h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_0_3px_rgba(255,255,255,.3)]" /> {isCompleted ? "Drawn" : "Live"} · {drawName}
        </span>
        <span className="ml-auto text-[11px] font-semibold text-white/60">Drawn 8:30 PM AEST</span>
      </div>

      <div className="relative mt-[18px] text-center">
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">{p.tagline}</div>
        <div className="mt-2.5 text-balance font-['Poppins'] text-[27px] font-black leading-[1.05]">{p.title}</div>
      </div>

      <div className="relative mt-4 flex gap-1.5 rounded-full border border-white/15 bg-white/[0.08] p-1">
        {([{ k: "a", l: "Ultimate Setup" }, { k: "b", l: "$10,000 Cash" }] as const).map((o) => (
          <button
            key={o.k}
            type="button"
            onClick={() => setPrize(o.k)}
            aria-pressed={prize === o.k}
            className="flex-1 rounded-full py-[9px] text-[11.5px] font-extrabold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            style={prize === o.k ? { background: "#fff", color: "#0b0b0d" } : { color: "rgba(255,255,255,.75)" }}
          >
            {o.l}
          </button>
        ))}
      </div>

      <div className="relative mt-4 flex flex-col gap-[9px]">
        {p.items.map((it) => (
          <div key={it} className="flex items-center gap-2.5 text-[12px] font-semibold text-white/90">
            <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-[#ee0000]/90 text-white">
              <Check className="h-[11px] w-[11px]" />
            </span>
            {it}
          </div>
        ))}
      </div>

      <a
        href="/promotions"
        target="_blank"
        rel="noopener noreferrer"
        className="relative mt-[18px] flex items-center justify-center gap-2 rounded-full bg-white px-[18px] py-[13px] text-[12.5px] font-extrabold text-[#0b0b0d] shadow-[0_14px_30px_-16px_rgba(0,0,0,.6)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        View this promotion <ExternalLink className="h-[15px] w-[15px]" />
      </a>
    </section>
  );
}
