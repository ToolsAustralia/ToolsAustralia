import { useState } from "react";

export type DonutSegment = { id: string; label: string; color: string; value: number; count?: number };

export function Donut({
  segments, size = 168, thickness = 22, centerLabel, centerSub, onSegmentClick,
}: { segments: DonutSegment[]; size?: number; thickness?: number; centerLabel: string; centerSub?: string; onSegmentClick?: (segment: DonutSegment) => void }) {
  const r = (size - thickness) / 2, cx = size / 2, cy = size / 2;
  const C = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const [hi, setHi] = useState<number | null>(null);
  let acc = 0;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" className="text-neutral-100 dark:text-neutral-800" strokeWidth={thickness} />
        {segments.map((s, i) => {
          const frac = s.value / total, dash = frac * C;
          const el = (
            <circle key={s.id} cx={cx} cy={cy} r={r} fill="none" stroke={s.color}
              strokeWidth={hi === i ? thickness + 4 : thickness}
              strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-acc * C}
              strokeLinecap="butt" className="transition-all duration-200 cursor-pointer"
              onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)}
              onClick={onSegmentClick ? () => onSegmentClick(s) : undefined}
              style={{ opacity: hi == null || hi === i ? 1 : 0.4 }} />
          );
          acc += frac;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="font-display font-extrabold text-2xl text-neutral-900 dark:text-white num leading-none">
          {hi != null ? (segments[hi].count ?? segments[hi].value).toLocaleString("en-AU") : centerLabel}
        </span>
        <span className="text-2xs text-neutral-500 dark:text-neutral-400 mt-1 font-semibold">{hi != null ? segments[hi].label : centerSub}</span>
      </div>
    </div>
  );
}
