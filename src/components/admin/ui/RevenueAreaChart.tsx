"use client";
import { useId, useRef, useState } from "react";

function smoothPath(pts: readonly (readonly [number, number])[]) {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

export function RevenueAreaChart({
  data, ticks, axisLabel, accent = "#ee0000", height = 230, valueFmt = (v: number) => String(v), minPointPx = 24, pointLabels,
}: { data: number[]; ticks: string[]; axisLabel: string; accent?: string; height?: number; valueFmt?: (v: number) => string; minPointPx?: number; pointLabels?: string[] }) {
  const n = data.length;
  const [hover, setHover] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const gid = "revArea" + useId().replace(/[^a-zA-Z0-9]/g, "");

  const vMax = Math.max(...data), vMin = Math.min(...data);
  const pad = (vMax - vMin) * 0.18 || vMax * 0.1 || 1;
  const top = vMax + pad, bot = Math.max(0, vMin - pad), rng = top - bot || 1;
  const W = 720, H = height, PADX = 6, PADT = 12, PADB = 6;
  const innerW = W - PADX * 2, innerH = H - PADT - PADB;
  const xOf = (i: number) => PADX + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yOf = (v: number) => PADT + innerH - ((v - bot) / rng) * innerH;
  const pts = data.map((v, i) => [xOf(i), yOf(v)] as const);
  const line = smoothPath(pts);
  const area = line ? `${line} L ${xOf(n - 1).toFixed(1)} ${H - PADB} L ${PADX} ${H - PADB} Z` : "";
  const gridVals = [1, 0.66, 0.33, 0].map((f) => bot + f * rng);
  const tickFor = (i: number) => ticks[Math.round((i / (n - 1)) * (ticks.length - 1))];

  // Dense series get a min-width so points don't compress into "worms"; sparse
  // series still fill the available width (max with 100%).
  const minWidth = `max(100%, ${n * minPointPx}px)`;

  // Map a clientX to the nearest data index. Read the inner plot element's rect —
  // its rendered width equals the SVG (== inner scroll content) width, and
  // getBoundingClientRect is viewport-relative so it accounts for horizontal scroll.
  const scrubAt = (clientX: number) => {
    const r = plotRef.current!.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    const frac = Math.max(0, Math.min(1, (x - PADX) / innerW));
    setHover(Math.round(frac * (n - 1)));
  };
  const onMove = (ev: React.MouseEvent) => scrubAt(ev.clientX);
  // Touch devices have no hover — let the user DRAG horizontally to move the focus
  // and scan the graph. `touch-action: pan-y` keeps vertical page scroll working
  // while we capture the horizontal drag. The focus stays put after lifting so the
  // value remains readable.
  const onTouch = (ev: React.TouchEvent) => {
    const t = ev.touches[0];
    if (t) scrubAt(t.clientX);
  };

  return (
    <div className="flex">
      <div className="relative w-12 shrink-0" style={{ height }}>
        {gridVals.map((gv, i) => (
          <span key={i} className="absolute right-2 -translate-y-1/2 text-[10px] text-neutral-400 dark:text-neutral-500 num" style={{ top: `${(yOf(gv) / H) * 100}%` }}>{valueFmt(Math.round(gv))}</span>
        ))}
      </div>
      <div className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden">
        <div style={{ minWidth }}>
          <div ref={plotRef} className="relative select-none" style={{ height, touchAction: "pan-y" }} onMouseMove={onMove} onMouseLeave={() => setHover(null)} onTouchStart={onTouch} onTouchMove={onTouch}>
            <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="overflow-visible">
              <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity="0.26" />
                <stop offset="100%" stopColor={accent} stopOpacity="0" />
              </linearGradient></defs>
              {gridVals.map((gv, i) => (
                <line key={i} x1={PADX} x2={W - PADX} y1={yOf(gv)} y2={yOf(gv)} stroke="currentColor" className="text-neutral-100 dark:text-neutral-800/70" strokeWidth="1" />
              ))}
              {area && <path d={area} fill={`url(#${gid})`} />}
              {line && <path d={line} fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
              {hover != null && pts[hover] && (
                <g>
                  <line x1={pts[hover][0]} x2={pts[hover][0]} y1={PADT} y2={H - PADB} stroke={accent} strokeWidth="1" strokeDasharray="3 3" opacity="0.55" />
                  <circle cx={pts[hover][0]} cy={pts[hover][1]} r="4.5" fill="white" stroke={accent} strokeWidth="2.5" />
                </g>
              )}
            </svg>
            {hover != null && pts[hover] && (
              // Flip the tooltip BELOW the point when it's near the top, so it never
              // extends above the plot — that lets the chart stay within its own box
              // (no negative-margin headroom hack) and stops it overlapping/stealing
              // clicks from the header toggle above it.
              <div
                className="absolute z-10 pointer-events-none"
                style={{
                  left: `${(pts[hover][0] / W) * 100}%`,
                  top: `${(pts[hover][1] / H) * 100}%`,
                  transform:
                    pts[hover][1] < 56
                      ? "translate(-50%, 10px)"
                      : "translate(-50%, calc(-100% - 10px))",
                }}
              >
                <div className="px-2.5 py-1.5 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-lg whitespace-nowrap">
                  <p className="font-display font-bold text-xs num leading-none">{valueFmt(data[hover])}</p>
                  <p className="text-[9px] opacity-70 mt-0.5">{axisLabel} {pointLabels?.[hover] ?? tickFor(hover)}</p>
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-between mt-2">
            {ticks.map((t, i) => <span key={i} className="text-[10px] text-neutral-400 dark:text-neutral-500 num">{t}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}
