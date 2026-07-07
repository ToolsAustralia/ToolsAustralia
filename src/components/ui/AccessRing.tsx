"use client";
import React, { type ReactNode } from "react";
import { cn } from "@/utils/cn";

/**
 * Single-arc SVG progress ring with the prototype's recessed "instrument" face
 * (inset-shadow disk behind the children) + an arc glow. Used for every
 * partner-catalogue access % on the page. `premium`/`pulse` give the VIP 100%
 * ring its golden glowing treatment.
 */
export default function AccessRing({
  percent,
  size = 104,
  stroke = 10,
  color,
  trackColor = "rgba(0,0,0,0.08)",
  glow,
  pulse = false,
  children,
  className,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  color: string;
  trackColor?: string;
  glow?: string;
  pulse?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, percent));
  const offset = c * (1 - pct / 100);
  const faceSize = Math.round(size * 0.74);
  const glowColor = glow ?? color;
  return (
    <div className={cn("relative inline-grid place-items-center", className)} style={{ width: size, height: size }}>
      {/* recessed instrument face */}
      <span
        aria-hidden
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: faceSize,
          height: faceSize,
          background: "radial-gradient(circle at 50% 34%, rgba(255,255,255,.16), rgba(0,0,0,.12))",
          boxShadow: pulse
            ? "inset 0 1px 2px rgba(0,0,0,.28), inset 0 -1px 1px rgba(255,255,255,.16), 0 0 30px -2px rgba(255,214,120,.95)"
            : "inset 0 1px 2px rgba(0,0,0,.28), inset 0 -1px 1px rgba(255,255,255,.16)",
        }}
      />
      <svg
        width={size}
        height={size}
        className={cn("relative -rotate-90", pulse && "animate-[ring-pulse_2.6s_cubic-bezier(.16,1,.3,1)_infinite]")}
        aria-hidden
        style={{ filter: `drop-shadow(0 0 5px ${glowColor})` }}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(.16,1,.3,1)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}
