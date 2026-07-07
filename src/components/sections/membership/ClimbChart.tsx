"use client";

import { useEffect, useState } from "react";

export interface ClimbGhost {
  name: string;
  color: string;
  cum: number[];
}

/** Lighten (pct>0) / darken (pct<0) a hex color. */
function shade(hex: string, pct: number): string {
  const h = hex.replace("#", "");
  let r = parseInt(h.slice(0, 2), 16);
  let g = parseInt(h.slice(2, 4), 16);
  let b = parseInt(h.slice(4, 6), 16);
  const t = pct < 0 ? 0 : 255;
  const p = Math.abs(pct) / 100;
  r = Math.round((t - r) * p + r);
  g = Math.round((t - g) * p + g);
  b = Math.round((t - b) * p + b);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/** Catmull-Rom → cubic-bezier smoothing (ported from the prototype). */
function climbSmooth(pts: { x: number; y: number }[]): string {
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

/**
 * Six-month "standing entries" climb chart. Pure SVG ported from the prototype's
 * ClimbScene; fed by buildClimbSeries totals. The draw-on animation is skipped
 * under prefers-reduced-motion (renders the final state immediately).
 */
export default function ClimbChart({
  tierName,
  accentHex,
  cum,
  total,
  ghosts,
  compact = false,
}: {
  tierName: string;
  accentHex: string;
  cum: number[];
  total: number;
  ghosts: ClimbGhost[];
  compact?: boolean;
}) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setGrown(true);
      return;
    }
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const mob = compact;
  const W = mob ? 460 : 640;
  const H = mob ? 308 : 322;
  const BASE = mob ? 242 : 256;
  const TOP = mob ? 28 : 30;
  const plot = mob ? 214 : 226;
  const PX0 = mob ? 44 : 60;
  const PX1 = mob ? 416 : 580;
  // sizes scale up on mobile (the SVG renders smaller there, so bump fonts/nodes)
  const fCum = mob ? 17 : 11;
  const fMonth = mob ? 15.5 : 11;
  const fGhost = mob ? 15.5 : 11;
  const nodeR = mob ? 5.5 : 4.5;
  const lastR = mob ? 7.5 : 6;
  const dotGlowR = mob ? 11 : 9;
  const railW = mob ? 3.6 : 3;
  const glowW = mob ? 8.5 : 7;
  const haloR = mob ? 36 : 32;
  const baseX0 = mob ? 30 : 48;
  const cumDY = mob ? 18 : 14;
  const monthDY = mob ? 30 : 26;
  const ghostDY = mob ? 11 : 8;
  const ghostStroke = mob ? 2.6 : 2;
  const ghostR = mob ? 4 : 3;
  const n = cum.length;
  const dx = (PX1 - PX0) / (n - 1);
  const yOf = (v: number) => BASE - (v / total) * plot;
  const mem = cum.map((c, i) => ({ x: PX0 + i * dx, y: yOf(c), c }));
  const end = mem[n - 1];
  const memD = climbSmooth(mem);
  const areaD = `${memD} L ${end.x.toFixed(1)} ${BASE} L ${mem[0].x.toFixed(1)} ${BASE} Z`;
  const tc = accentHex;
  const tcD = shade(tc, -14);
  const tcL = shade(tc, 34);
  const DASH = 1500;
  const draw = {
    strokeDasharray: DASH,
    strokeDashoffset: grown ? 0 : DASH,
    transition: "stroke-dashoffset 1.3s cubic-bezier(.16,1,.3,1)",
  } as const;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Over 6 months on ${tierName}, your membership entries stack to ${total.toLocaleString()} and keep climbing while you stay subscribed.`}
      className="w-full"
    >
      <defs>
        <linearGradient id="cgArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tc} stopOpacity="0.34" />
          <stop offset="100%" stopColor={tc} stopOpacity="0" />
        </linearGradient>
        <linearGradient id="cgRail" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor={tcD} />
          <stop offset="100%" stopColor={tcL} />
        </linearGradient>
        <radialGradient id="cgHalo">
          <stop offset="0%" stopColor={tcL} stopOpacity="0.6" />
          <stop offset="70%" stopColor={tc} stopOpacity="0" />
        </radialGradient>
      </defs>
      {mem.map((m, i) => (
        <line key={`gl${i}`} x1={m.x} y1={TOP - 4} x2={m.x} y2={BASE} stroke="rgba(255,255,255,.05)" strokeWidth="1" />
      ))}
      <line x1={baseX0} y1={BASE} x2={PX1 + 8} y2={BASE} stroke="rgba(255,255,255,.14)" strokeWidth="1" />
      <path d={areaD} fill="url(#cgArea)" style={{ opacity: grown ? 1 : 0, transition: "opacity 1.1s ease" }} />
      {ghosts.map((g, gi) => {
        const gp = g.cum.map((c, i) => ({ x: PX0 + i * dx, y: yOf(c) }));
        const ge = gp[n - 1];
        const gm = gp[3];
        return (
          <g
            key={`gh${gi}`}
            style={{ opacity: grown ? 1 : 0, transition: "opacity .9s ease", transitionDelay: `${0.5 + gi * 0.16}s` }}
          >
            <path
              d={climbSmooth(gp)}
              fill="none"
              stroke={g.color}
              strokeWidth={ghostStroke}
              strokeOpacity="0.5"
              strokeDasharray="4 5"
              strokeLinecap="round"
            />
            <circle cx={ge.x} cy={ge.y} r={ghostR} fill={g.color} fillOpacity="0.65" />
            <text x={gm.x} y={gm.y - ghostDY} textAnchor="middle" style={{ fill: g.color, font: `700 ${fGhost}px Inter` }}>
              {g.name}
            </text>
          </g>
        );
      })}
      <path d={memD} fill="none" stroke={tc} strokeWidth={glowW} strokeLinecap="round" style={{ ...draw, opacity: 0.4, filter: "blur(5px)" }} />
      <path d={memD} fill="none" stroke="url(#cgRail)" strokeWidth={railW} strokeLinecap="round" style={draw} />
      {mem.map((m, i) => (
        <g
          key={`nd${i}`}
          style={{ opacity: grown ? 1 : 0, transition: "opacity .5s ease", transitionDelay: `${350 + i * 95}ms` }}
        >
          {i === n - 1 && <circle cx={m.x} cy={m.y} r={haloR} fill="url(#cgHalo)" />}
          <circle cx={m.x} cy={m.y} r={dotGlowR} fill={tc} opacity="0.22" />
          <circle cx={m.x} cy={m.y} r={i === n - 1 ? lastR : nodeR} fill={tc} stroke="#fff" strokeWidth={i === n - 1 ? 1.6 : 1.3} />
          {i < n - 1 && (
            <text x={m.x} y={m.y - cumDY} textAnchor="middle" style={{ fill: "#e5e7eb", font: `700 ${fCum}px Inter` }}>
              {m.c.toLocaleString()}
            </text>
          )}
          <text x={m.x} y={BASE + monthDY} textAnchor="middle" style={{ fill: "#9ca3af", font: `600 ${fMonth}px Inter` }}>
            {`Mo ${i + 1}`}
          </text>
        </g>
      ))}
    </svg>
  );
}
