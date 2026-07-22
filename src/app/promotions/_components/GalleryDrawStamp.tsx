"use client";

import { useEffect, useState } from "react";
import { useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";
import { formatMajorDrawChipUtc } from "@/utils/common/timezone";

/** One tick per 30s: the line only resolves to days + hours, so a 1s timer would burn frames for nothing. */
const TICK_MS = 30_000;

interface GalleryDrawStampProps {
  /** Shown until the draw resolves — "Live preview" / "Cash option". */
  fallback: string;
}

/**
 * The pill over the live-preview case: the draw stamp and how long is left,
 * "DRAWN 31 JUL · 9:59AM AEST · 08D 19H LEFT".
 *
 * The date half reuses `formatMajorDrawChipUtc`, the same AEST/AEDT stamp the
 * prize-builder hero prints, so the two surfaces can never disagree about when
 * the draw closes.
 *
 * Falls back to the selection's own tag rather than collapsing: the draw is a
 * client query, so on the first frame (and whenever no draw is active) the pill
 * still has to say something, and the case has a fixed slot for it.
 */
export default function GalleryDrawStamp({ fallback }: GalleryDrawStampProps) {
  const { data: draw } = useCurrentMajorDraw();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const drawDate = draw?.drawDate ? new Date(draw.drawDate) : null;
  const target = drawDate?.getTime() ?? NaN;

  const label = () => {
    if (!drawDate || !Number.isFinite(target) || draw?.status !== "active") return fallback;
    const ms = Math.max(0, target - now);
    const pad = (n: number) => String(n).padStart(2, "0");
    const days = pad(Math.floor(ms / 86_400_000));
    const hours = pad(Math.floor((ms / 3_600_000) % 24));
    // `formatMajorDrawChipUtc` returns "31 JUL · 9:59AM AEST"; the clock half is
    // hidden on phones, where the full string overflows the pill.
    const [date, clock] = formatMajorDrawChipUtc(drawDate).split(" · ");
    return (
      <>
        Drawn {date}
        {clock && <span className="hidden sm:inline"> · {clock}</span>} · {days}d {hours}h left
      </>
    );
  };

  return (
    <span className="absolute left-3.5 top-3.5 z-[2] rounded-full bg-white/95 px-[11px] py-1.5 font-poppins text-[8.5px] font-extrabold uppercase leading-none tracking-[0.16em] tabular-nums text-[#0c0d10] shadow-[0_4px_12px_-4px_rgba(0,0,0,0.3)]">
      {label()}
    </span>
  );
}
