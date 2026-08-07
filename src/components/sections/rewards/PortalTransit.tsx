"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Lock, Tag, Check, AlertTriangle } from "lucide-react";
import { cn } from "@/utils/cn";

/** Friction-spark inline style (CSS custom props consumed by the shared taSpark keyframe). */
const spark = (sx: string, sy: string, delay: string): CSSProperties =>
  ({ "--sx": sx, "--sy": sy, animationDelay: delay } as CSSProperties);

/** Circumference of the r=55 rewards ring — 2πr, pinned so the dash maths stays readable. */
const RING_CIRCUMFERENCE = 345.6;

/** A step exceeding this reads as stalled; we swap the caption but keep the rig running. */
const STALL_MS = 6000;

export type PortalTransitPhase = "working" | "done" | "error";

export interface PortalTransitProps {
  /** Variant B — prepends the "Consent recorded" step. */
  consent?: boolean;
  /** Drives the whole screen. The host owns this; the component never decides it is done. */
  phase: PortalTransitPhase;
  /** Member's given name, e.g. "Marcus T." — omitted renders the footer without it. */
  memberName?: string | null;
  /** Tier label, e.g. "Boss". Used in the footer and the verifying caption. */
  tierLabel?: string | null;
  /** Catalogue access, e.g. 100. */
  accessPct?: number | null;
  /** Customer-facing failure copy, shown when `phase === "error"`. */
  errorMessage?: string | null;
  onCancel: () => void;
  onRetry?: () => void;
}

const BASE_STEPS = [
  "Verifying your membership",
  "Issuing a one-time secure token",
  "Opening Tools Australia Rewards",
] as const;

/**
 * PortalTransit — full-viewport takeover for the MyRewards SSO hand-off.
 *
 * Holds the member for the ~2.5–3.5s the exchange takes, tells them what is happening,
 * proves the session is theirs, and leaves an escape hatch.
 *
 * HONEST PACING, ONE ENDPOINT. `POST /api/partner-discount/sso` is a SINGLE request, so
 * there are no per-step backend milestones to subscribe to. Rather than fake three fixed
 * delays, the step index advances on a timer only up to the LAST step and parks there —
 * so the screen can never claim "opening the portal" while the token request is still in
 * flight. The host flipping `phase` to `done` is the only thing that completes it. If the
 * response lands early the screen jumps straight to success; if it is slow the caption
 * switches to reassurance at 6s. Splitting the route into real milestones is the only way
 * to make these steps literally true — noted in docs/partner/architecture.md.
 *
 * NOT a modal: `position: fixed; inset: 0` with nothing behind it interactive. Announces
 * the active step via `role="status"` so a screen-reader user hears progress, and traps
 * focus on the only actionable control (Cancel / Try again).
 */
export default function PortalTransit({
  consent = false,
  phase,
  memberName,
  tierLabel,
  accessPct,
  errorMessage,
  onCancel,
  onRetry,
}: PortalTransitProps) {
  const steps = consent ? ["Consent recorded", ...BASE_STEPS] : [...BASE_STEPS];
  const total = steps.length;
  const done = phase === "done";
  const errored = phase === "error";

  // Consent already happened before this mounted, so variant B starts a step in.
  const [index, setIndex] = useState(consent ? 1 : 0);
  const [stalled, setStalled] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Advance to — but never past — the final step. Only `phase` completes the screen.
  useEffect(() => {
    if (done || errored) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const start = consent ? 1 : 0;
    for (let n = start + 1; n < total; n++) {
      timers.push(setTimeout(() => setIndex(n), 820 * (n - start)));
    }
    timers.push(setTimeout(() => setStalled(true), STALL_MS));
    return () => timers.forEach(clearTimeout);
  }, [consent, total, done, errored]);

  // Move focus in on mount and keep it inside — only one control is ever focusable.
  useEffect(() => {
    cancelRef.current?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        cancelRef.current?.focus();
      }
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", trap);
    return () => document.removeEventListener("keydown", trap);
  }, [onCancel]);

  // Lock the page behind the takeover — it is a takeover, not an overlay.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const activeIndex = done ? total : index;
  const progress = Math.min(1, activeIndex / total);
  const tier = tierLabel ?? "membership";

  const captions = consent
    ? [
        "Consent saved against your membership…",
        `Checking your ${tier} membership…`,
        "Minting a token that works once…",
        "Loading your unlocked catalogue…",
      ]
    : [
        `Checking your ${tier} membership…`,
        "Minting a token that works once…",
        "Loading your unlocked catalogue…",
      ];

  const title = errored ? "We couldn't open Rewards" : done ? "You're in" : "Opening Tools Australia Rewards";
  const caption = errored
    ? errorMessage ?? "Something went wrong on the way to the portal."
    : done
      ? `${accessPct != null ? `${accessPct}% of the catalogue unlocked — ` : ""}redirecting…`
      : stalled
        ? "Still working — the partner portal is taking a little longer than usual."
        : captions[index] ?? captions[0];

  return (
    <div
      ref={rootRef}
      className="ta-pt-root fixed inset-0 z-[110] overflow-hidden"
      role="status"
      aria-live="polite"
      aria-label={title}
    >
      <div className="ta-pt-ambient" aria-hidden />
      <div className="ta-pt-grid" aria-hidden />

      {/* Top chrome */}
      <div className="absolute inset-x-0 top-0 flex h-14 items-center justify-between gap-2.5 px-[18px]">
        <span
          className="inline-flex items-center gap-[9px] text-[9.5px] font-extrabold uppercase leading-none tracking-[0.26em]"
          style={{ color: "var(--pt-faint)" }}
        >
          <span className="grid h-5 w-5 flex-none place-items-center rounded-[6px] bg-gradient-to-br from-[#ff2a2a] to-[#c40d0d] font-poppins text-[9px] font-black leading-none tracking-normal text-white">
            TA
          </span>
          <span className="hidden sm:inline">
            {consent ? "Secure sign-on · consent given" : "Secure sign-on"}
          </span>
          <span className="sm:hidden">{consent ? "Consent given" : "Secure sign-on"}</span>
        </span>
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          className="flex-none rounded-[9px] border px-3 py-2 text-[11px] font-bold leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
          style={{
            color: "var(--pt-soft)",
            background: "var(--pt-cancel-bg)",
            borderColor: "var(--pt-hair)",
          }}
        >
          Cancel
        </button>
      </div>

      {/* Centred stack */}
      <div className="absolute inset-x-0 bottom-[22px] top-14 flex flex-col items-center justify-center gap-[18px] px-[18px] sm:bottom-0 sm:gap-[22px]">
        {/* Handoff rail */}
        <div className="ta-pt-rise flex items-center gap-2 sm:gap-[14px]" aria-hidden>
          <div
            className="grid h-10 w-10 flex-none place-items-center rounded-[12px] bg-gradient-to-br from-[#ff2a2a] to-[#c40d0d] font-poppins text-[12px] font-black leading-none text-white sm:h-[50px] sm:w-[50px] sm:rounded-[14px] sm:text-[14px]"
            style={{ boxShadow: "0 14px 26px -14px rgba(238,0,0,.9)" }}
          >
            TA
          </div>

          <div className="ta-pt-wire w-[26px] sm:w-[52px]">
            <span className="ta-pt-packet" style={{ background: "#ff5a4a", boxShadow: "0 0 10px #ff2a2a" }} />
          </div>

          <PortalMedallion progress={progress} phase={phase} />

          <div className="ta-pt-wire w-[26px] sm:w-[52px]">
            <span
              className="ta-pt-packet"
              style={{ background: "#f7d768", boxShadow: "0 0 10px #d4af37", animationDelay: "0.55s" }}
            />
          </div>

          <div
            className="grid h-10 w-10 flex-none place-items-center rounded-[12px] border border-[#d4af37]/55 bg-[#fffdf5] text-[#9c7614] sm:h-[50px] sm:w-[50px] sm:rounded-[14px] dark:border-[#d4af37]/50 dark:bg-[#16161a] dark:text-[#f7d768]"
            style={{ boxShadow: "0 14px 26px -18px rgba(15,23,42,.45)" }}
          >
            <Tag className="h-[22px] w-[22px]" strokeWidth={1.9} />
          </div>
        </div>

        {/* Title + caption */}
        <div className="ta-pt-rise flex flex-col items-center gap-1.5">
          <h2
            className="m-0 text-center font-poppins text-[18px] font-extrabold leading-[1.25] tracking-[-0.01em] sm:text-[22px]"
            style={{ color: "var(--pt-ink)" }}
          >
            {title}
          </h2>
          <p
            className="m-0 max-w-[250px] text-center text-[12px] font-medium leading-[1.5] sm:max-w-[400px] sm:text-[13px]"
            style={{ color: "var(--pt-soft)" }}
          >
            {caption}
          </p>
        </div>

        {errored ? (
          // Never leave the member on a spinner — give them both ways out.
          <div className="flex w-[262px] flex-col gap-2.5 sm:w-[330px]">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="w-full rounded-[11px] bg-gradient-to-b from-[#f7d768] to-[#d4af37] px-[18px] py-[15px] text-[13.5px] font-extrabold text-[#241a02] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
                style={{ boxShadow: "0 12px 24px -12px rgba(212,175,55,.9)" }}
              >
                Try again
              </button>
            )}
            <button
              type="button"
              onClick={onCancel}
              className="w-full rounded-[11px] border px-[18px] py-[14px] text-[13px] font-extrabold focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
              style={{ color: "var(--pt-soft)", borderColor: "var(--pt-hair)" }}
            >
              Back to Rewards
            </button>
          </div>
        ) : (
          <>
            {/* Step list */}
            <div className="flex w-[262px] flex-col gap-[9px] sm:w-[330px] sm:gap-2.5">
              {steps.map((label, n) => {
                const state = n < activeIndex ? "done" : n === activeIndex ? "active" : "pending";
                return (
                  <div key={label} className="flex items-center gap-2.5">
                    {state === "done" ? (
                      <span
                        className="grid h-[18px] w-[18px] flex-none place-items-center rounded-full"
                        style={{
                          color: "var(--pt-good)",
                          background: "color-mix(in srgb, var(--pt-good) 14%, transparent)",
                        }}
                      >
                        <Check className="h-[11px] w-[11px]" strokeWidth={3.4} />
                      </span>
                    ) : state === "active" ? (
                      <span className="ta-pt-dot-active h-[18px] w-[18px] flex-none rounded-full" />
                    ) : (
                      <span className="ta-pt-dot-pending h-[18px] w-[18px] flex-none rounded-full" />
                    )}
                    <span
                      className={cn(
                        "text-[12.5px] leading-[1.35] sm:text-[13px]",
                        state === "active" ? "font-bold" : "font-medium"
                      )}
                      style={{
                        color:
                          state === "active"
                            ? "var(--pt-ink)"
                            : state === "done"
                              ? "color-mix(in srgb, var(--pt-ink) 45%, transparent)"
                              : "color-mix(in srgb, var(--pt-ink) 27%, transparent)",
                      }}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Progress tape */}
            <div
              className="ta-pt-tape h-[9px] w-[262px] sm:h-[11px] sm:w-[330px]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={activeIndex}
            >
              <div className="ta-pt-tape-fill" style={{ width: `${Math.round(Math.max(6, progress * 100))}%` }} />
              <div className="ta-pt-tape-ticks" />
            </div>
          </>
        )}

        {/* Footer meta */}
        <div
          className="flex flex-wrap items-center justify-center gap-2 text-center text-[10px] font-medium leading-[1.4] sm:text-[11px]"
          style={{ color: "var(--pt-faint)" }}
        >
          <span data-cs-mask className="inline-flex items-center gap-1.5">
            {errored ? <AlertTriangle className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
            {[memberName, tierLabel, accessPct != null ? `${accessPct}% catalogue` : null]
              .filter(Boolean)
              .join(" · ") || "Secure sign-on"}
          </span>
          <span
            className="h-[3px] w-[3px] rounded-full"
            style={{ background: "color-mix(in srgb, var(--pt-ink) 26%, transparent)" }}
          />
          {/* 60 MINUTES, not 60 seconds. The vendor enforces a 60-min TTL on the token their
              /generatetoken returns (docs/partner/igodirect-integration-playbook.md §9); our
              own signed JWT carries no exp at all. The design handoff said "60s" — wrong. */}
          <span>Single-use sign-on link · expires in 60 min</span>
        </div>
      </div>
    </div>
  );
}

/**
 * The brand medallion — the DashboardLoader's impact-driver rig scaled to clear the
 * gold rewards ring, plus the ring itself and the success mark. Geometry is the design's
 * (rig at ~0.89× the dashboard loader's so it sits inside r=55); the ANIMATION is the
 * shared `ta*` keyframes, so the two loaders can never drift in cadence.
 */
function PortalMedallion({ progress, phase }: { progress: number; phase: PortalTransitPhase }) {
  const working = phase === "working";
  const done = phase === "done";
  const errored = phase === "error";

  return (
    <div className="relative h-[118px] w-[118px] flex-none sm:h-[150px] sm:w-[150px]">
      <svg viewBox="0 0 138 138" fill="none" aria-hidden className="h-full w-full">
        <defs>
          <linearGradient id="ptRed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ff4438" />
            <stop offset="1" stopColor="#c20c0c" />
          </linearGradient>
          <linearGradient id="ptMetal" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#54545f" />
            <stop offset=".52" stopColor="#2a2a31" />
            <stop offset="1" stopColor="#141419" />
          </linearGradient>
          <linearGradient id="ptGrip" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ff4438" />
            <stop offset="1" stopColor="#b60a0a" />
          </linearGradient>
          <radialGradient id="ptBore" cx=".5" cy=".42" r=".62">
            <stop offset="0" stopColor="#0b0b0e" />
            <stop offset=".7" stopColor="#171720" />
            <stop offset="1" stopColor="#2b2b34" />
          </radialGradient>
          <linearGradient id="ptGloss" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".85" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <clipPath id="ptClip">
            <circle cx="69" cy="69" r="60" />
          </clipPath>
          <linearGradient id="ptGold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f7d768" />
            <stop offset="1" stopColor="#d4af37" />
          </linearGradient>
          <radialGradient id="ptGlow" cx=".5" cy=".5" r=".5">
            <stop offset="0" stopColor="#ff3b30" stopOpacity=".95" />
            <stop offset="1" stopColor="#ff3b30" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ptDiscL" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#e7eaef" />
          </linearGradient>
          <linearGradient id="ptDiscD" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#20202a" />
            <stop offset="1" stopColor="#0c0c10" />
          </linearGradient>
        </defs>

        <circle className="ta-pt-halo" cx="69" cy="69" r="64" fill="none" stroke="#ee0000" strokeWidth="1.4" />
        <circle className="ta-pt-disc" cx="69" cy="69" r="60" />
        <rect className="ta-pt-gloss" clipPath="url(#ptClip)" x="9" y="9" width="120" height="58" fill="url(#ptGloss)" />
        <circle className="ta-pt-rim" cx="69" cy="69" r="60" fill="none" strokeWidth="1.5" />

        {/* Rewards ring — track + gold progress */}
        <circle className="ta-pt-track" cx="69" cy="69" r="55" fill="none" strokeWidth="3" />
        <circle
          className="ta-pt-ring"
          cx="69"
          cy="69"
          r="55"
          fill="none"
          stroke="url(#ptGold)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
          transform="rotate(-90 69 69)"
        />

        <circle
          className="ta-pt-spin"
          cx="69"
          cy="69"
          r="47"
          fill="none"
          stroke="#ee0000"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray="2 9"
          opacity=".28"
        />
        <circle className="ta-pt-warm" cx="69" cy="69" r="40" fill="url(#ptGlow)" />

        {working && (
          <>
            <g className="ta-pt-rig">
              <polygon points="103,69 86,98.4 52,98.4 35,69 52,39.6 86,39.6" fill="url(#ptRed)" />
              <polygon
                points="103,69 86,98.4 52,98.4 35,69 52,39.6 86,39.6"
                fill="none"
                stroke="rgba(255,255,255,.2)"
                strokeWidth="2"
              />
              <polygon points="52,39.6 86,39.6 69,45.8" fill="rgba(255,255,255,.14)" />

              <g className="ta-pt-wrench">
                <rect x="65" y="63" width="55" height="12" rx="6" fill="url(#ptMetal)" />
                <rect x="102" y="59.5" width="19" height="19" rx="5.5" fill="url(#ptGrip)" />
              </g>

              <circle cx="69" cy="69" r="24" fill="url(#ptMetal)" />
              <circle cx="69" cy="69" r="24" fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="1.5" />
              <circle cx="69" cy="69" r="14.5" fill="url(#ptBore)" />

              <g className="ta-pt-bolt">
                <polygon points="79,69 74,77.7 64,77.7 59,69 64,60.3 74,60.3" fill="url(#ptRed)" />
                <polygon
                  points="79,69 74,77.7 64,77.7 59,69 64,60.3 74,60.3"
                  fill="none"
                  stroke="rgba(255,255,255,.24)"
                  strokeWidth="1.3"
                />
              </g>
            </g>

            <circle className="ta-pt-spark" cx="69" cy="45" r="2.6" fill="#ffd23f" style={spark("-17px", "-13px", "0s")} />
            <circle className="ta-pt-spark" cx="69" cy="45" r="2.1" fill="#ff8a00" style={spark("13px", "-16px", ".05s")} />
            <circle className="ta-pt-spark" cx="69" cy="45" r="1.7" fill="#fff0b8" style={spark("-8px", "-20px", ".03s")} />
          </>
        )}

        {done && (
          <g className="ta-pt-success">
            <circle className="ta-pt-check-halo" cx="69" cy="69" r="31" />
            <circle cx="69" cy="69" r="23" fill="var(--pt-good)" />
            <path
              className="ta-pt-check"
              d="M59 69.5 66.5 77 80 62.5"
              fill="none"
              strokeWidth="4.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        )}

        {errored && (
          <g className="ta-pt-success">
            <circle cx="69" cy="69" r="31" fill="rgba(238,0,0,.13)" />
            <circle cx="69" cy="69" r="23" fill="#ee0000" />
            <path d="M69 58v13" fill="none" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" />
            <circle cx="69" cy="79.5" r="2.6" fill="#fff" />
          </g>
        )}
      </svg>
    </div>
  );
}
