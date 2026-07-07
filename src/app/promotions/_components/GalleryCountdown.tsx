"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";

function Cell({ v, l }: { v: number; l: string }) {
  return (
    <div className="flex min-w-[52px] flex-col items-center gap-0.5 rounded-xl bg-gradient-to-br from-red-500 via-red-600 to-red-700 px-2.5 py-2 shadow-[0_8px_18px_-8px_rgba(238,0,0,.6)] ring-1 ring-red-300/30">
      <span className="text-[20px] font-black leading-none tabular-nums text-white drop-shadow-[0_1px_2px_rgba(0,0,0,.35)]">
        {String(v).padStart(2, "0")}
      </span>
      <span className="text-[8px] font-bold uppercase tracking-[0.14em] text-red-100">{l}</span>
    </div>
  );
}

/**
 * Live major-draw countdown for the gallery hero — the same red countdown-chip vocabulary the
 * dashboard EntryWallet / promo pages use. Renders nothing until the draw resolves (no layout
 * jank: the hero reserves no space for it) and nothing when the draw isn't active.
 */
export default function GalleryCountdown() {
  const { data: draw } = useCurrentMajorDraw();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const target = draw?.drawDate ? new Date(draw.drawDate).getTime() : NaN;
  if (!Number.isFinite(target) || draw?.status !== "active") return null;

  const ms = Math.max(0, target - now);
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms / 3_600_000) % 24);
  const m = Math.floor((ms / 60_000) % 60);

  return (
    <div className="mt-7 flex flex-col items-center gap-2.5">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
        <Clock className="h-3.5 w-3.5 text-red-500" /> {draw.name ?? "Major draw"} closes in
      </span>
      <div className="flex gap-2">
        <Cell v={d} l="days" />
        <Cell v={h} l="hrs" />
        <Cell v={m} l="mins" />
      </div>
    </div>
  );
}
