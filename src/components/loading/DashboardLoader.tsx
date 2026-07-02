"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { cn } from "@/utils/cn";

// Rotating status lines (from the Claude Design source). Shown only when the caller
// passes no explicit `label` — used on the member dashboard where the flavor fits.
const DEFAULT_MESSAGES = [
  "Loading your dashboard",
  "Counting your entries",
  "Lining up the next draw",
  "Tightening the last bolt",
];

interface DashboardLoaderProps {
  /** Static status line. When omitted, cycles the default brand messages. */
  label?: string;
  /** Extra classes on the fixed full-screen wrapper. */
  className?: string;
  /** Force the light palette regardless of theme — for light-only surfaces (affiliate dashboard). */
  light?: boolean;
}

/** Friction-spark inline style (CSS custom props consumed by the taSpark keyframe). */
const spark = (sx: string, sy: string, delay: string): CSSProperties =>
  ({ "--sx": sx, "--sy": sy, animationDelay: delay } as CSSProperties);

/**
 * Full-screen dashboard loader — a 1:1 port of the Claude Design "Dashboard Loader"
 * (a socket ratchet driving a hex bolt on a premium medallion: rotating telemetry
 * ticks, warm core glow, pulsing halo, sheen sweep, impact flash, friction sparks,
 * contact shadow) with a ticked progress tape + cycling status. Theme-adaptive
 * (light/dark medallion via the app's `.dark` class) and reduced-motion safe.
 * Replaces the old spinners across the member / admin / affiliate dashboards.
 */
export default function DashboardLoader({ label, className, light }: DashboardLoaderProps) {
  const messages = label ? [label] : DEFAULT_MESSAGES;
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (messages.length <= 1) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let hideTimer: ReturnType<typeof setTimeout>;
    const cycle = setInterval(() => {
      setVisible(false);
      hideTimer = setTimeout(() => {
        setIdx((i) => (i + 1) % messages.length);
        setVisible(true);
      }, 180);
    }, 950);
    return () => {
      clearInterval(cycle);
      clearTimeout(hideTimer);
    };
    // messages is derived from `label`; re-run only when that changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [label]);

  const status = messages[idx] ?? messages[0];

  return (
    <div className={cn("ta-loader-root fixed inset-0 z-[100] flex items-center justify-center px-6", light && "ta-loader-light", className)}>
      <div className="ta-loader">
        <div className="ta-loader-scene">
          <svg width="138" height="138" viewBox="0 0 138 138" fill="none" aria-hidden="true">
            <defs>
              <linearGradient id="taLoRed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff4438" /><stop offset="1" stopColor="#c20c0c" /></linearGradient>
              <linearGradient id="taLoMetal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#54545f" /><stop offset=".52" stopColor="#2a2a31" /><stop offset="1" stopColor="#141419" /></linearGradient>
              <linearGradient id="taLoGrip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff4438" /><stop offset="1" stopColor="#b60a0a" /></linearGradient>
              <radialGradient id="taLoBore" cx=".5" cy=".42" r=".62"><stop offset="0" stopColor="#0b0b0e" /><stop offset=".7" stopColor="#171720" /><stop offset="1" stopColor="#2b2b34" /></radialGradient>
              <linearGradient id="taLoSheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".85" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
              <radialGradient id="taLoShadow" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#000" stopOpacity=".38" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
              <mask id="taLoRing"><circle cx="69" cy="69" r="27" fill="#fff" /><circle cx="69" cy="69" r="16" fill="#000" /></mask>
              <clipPath id="taDiscClip"><circle cx="69" cy="69" r="60" /></clipPath>
              <linearGradient id="taDiscL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#e7eaef" /></linearGradient>
              <linearGradient id="taDiscD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1b1b22" /><stop offset="1" stopColor="#0c0c10" /></linearGradient>
              <linearGradient id="taGloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".8" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
              <radialGradient id="taVig" cx=".5" cy=".5" r=".5"><stop offset=".6" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".1" /></radialGradient>
              <radialGradient id="taWarm" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#ff3b30" stopOpacity=".95" /><stop offset="1" stopColor="#ff3b30" stopOpacity="0" /></radialGradient>
            </defs>

            {/* contact shadow */}
            <ellipse className="ta-lo-shadow" cx="69" cy="132" rx="44" ry="6.5" fill="url(#taLoShadow)" />

            {/* outer pulsing glow ring */}
            <circle className="ta-lo-halo" cx="69" cy="69" r="63" fill="none" stroke="#ee0000" strokeWidth="1.5" opacity=".4" />

            {/* premium medallion */}
            <circle className="ta-lo-disc" cx="69" cy="69" r="60" />
            <rect className="ta-lo-gloss" clipPath="url(#taDiscClip)" x="9" y="9" width="120" height="62" fill="url(#taGloss)" />
            <circle className="ta-lo-vig" cx="69" cy="69" r="60" fill="url(#taVig)" />
            <circle className="ta-lo-rim" cx="69" cy="69" r="60" fill="none" strokeWidth="1.5" />

            {/* rotating telemetry ticks */}
            <circle className="ta-lo-spin" cx="69" cy="69" r="52" fill="none" stroke="#ee0000" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 9" opacity=".3" />

            {/* warm core glow */}
            <circle className="ta-lo-warm" cx="69" cy="69" r="42" fill="url(#taWarm)" />

            <g className="ta-lo-rig">
              {/* red hex nut */}
              <polygon points="107,69 88,101.9 50,101.9 31,69 50,36.1 88,36.1" fill="url(#taLoRed)" />
              <polygon points="107,69 88,101.9 50,101.9 31,69 50,36.1 88,36.1" fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="2" />
              <polygon points="50,36.1 88,36.1 69,43" fill="rgba(255,255,255,.16)" />

              {/* ratchet handle (pivots on the socket) */}
              <g className="ta-lo-wrench">
                <rect x="65" y="62.5" width="61" height="13" rx="6.5" fill="url(#taLoMetal)" />
                <rect x="106" y="58.5" width="21" height="21" rx="6" fill="url(#taLoGrip)" />
                <circle cx="116" cy="69" r="2.6" fill="rgba(255,255,255,.55)" />
              </g>

              {/* socket */}
              <circle cx="69" cy="69" r="27" fill="url(#taLoMetal)" />
              <circle cx="69" cy="69" r="27" fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="1.5" />
              {/* sheen sweep, clipped to the metal ring */}
              <g mask="url(#taLoRing)"><g transform="rotate(18 69 69)"><rect className="ta-lo-sheen" x="62" y="30" width="14" height="78" fill="url(#taLoSheen)" /></g></g>
              {/* deep bore */}
              <circle cx="69" cy="69" r="16" fill="url(#taLoBore)" />
              <path d="M55 66 A16 16 0 0 1 83 60" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="1.4" strokeLinecap="round" />

              {/* impact flash + driven bolt */}
              <circle className="ta-lo-flash" cx="69" cy="69" r="15" fill="#ff3b30" />
              <g className="ta-lo-bolt">
                <polygon points="80,69 74.5,78.5 63.5,78.5 58,69 63.5,59.5 74.5,59.5" fill="url(#taLoRed)" />
                <polygon points="80,69 74.5,78.5 63.5,78.5 58,69 63.5,59.5 74.5,59.5" fill="none" stroke="rgba(255,255,255,.24)" strokeWidth="1.4" />
                <circle cx="69" cy="69" r="2.4" fill="rgba(255,255,255,.4)" />
              </g>
            </g>

            {/* friction sparks off the rim */}
            <circle className="ta-lo-spark" cx="69" cy="42" r="3" fill="#ffd23f" style={spark("-19px", "-14px", "0s")} />
            <circle className="ta-lo-spark" cx="69" cy="42" r="2.4" fill="#ff8a00" style={spark("14px", "-17px", ".05s")} />
            <circle className="ta-lo-spark" cx="69" cy="42" r="2" fill="#ffd23f" style={spark("23px", "-4px", ".1s")} />
            <circle className="ta-lo-spark" cx="69" cy="42" r="1.7" fill="#fff0b8" style={spark("-9px", "-21px", ".03s")} />
            <circle className="ta-lo-spark" cx="69" cy="42" r="1.6" fill="#ff8a00" style={spark("4px", "-23px", ".14s")} />
          </svg>
        </div>

        <div className="ta-loader-txt">
          <div className="ta-loader-mark">Tools Australia</div>
          <div className="ta-loader-status" style={{ opacity: visible ? 1 : 0 }}>{status}</div>
          <div className="ta-loader-tape" role="progressbar" aria-label="Loading">
            <div className="ta-loader-tape-fill" />
            <div className="ta-loader-tape-ticks" />
          </div>
        </div>
      </div>
    </div>
  );
}
