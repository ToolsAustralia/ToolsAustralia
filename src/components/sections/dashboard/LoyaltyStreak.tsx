"use client";

import type { CSSProperties } from "react";
import { Zap, Crown } from "lucide-react";
import { cn } from "@/utils/cn";
import type { DashboardAccountState } from "@/utils/dashboard/dashboard-state-theme";
import type { TierKey } from "@/utils/membership/tier-visuals";
import {
  streakAccentVars,
  deriveStreakCardState,
  deriveStreakCycleFuse,
  type StreakCardState,
} from "@/utils/dashboard/streak-display";
import { STREAK_MILESTONES, nextStreakMilestone, isRungEarned } from "@/config/streakMilestones";

/* ────────────────────────────────────────────────────────────────────────────
   Membership Streak — dashboard card, rebuilt 1:1 to the Build Kit
   (claudeDesign/Membership milestone streak design). The accent inherits the
   member's package colour via CSS custom properties (--s-*); default is
   tempered steel — never amber (reserved for past-due semantics).
   States: fresh · active · milestone-hit (banner) · at-risk · paused · founding
   + the guest/one-time "Members only" teaser (full ladder as the sell).
   ──────────────────────────────────────────────────────────────────────────── */

interface LoyaltyStreakProps {
  /** Real consecutive-paid-renewals counter (subscription.streakMonths). */
  months: number | null;
  acct: DashboardAccountState;
  tierKey?: TierKey | null;
  /** ISO renewal date — drives the billing-cycle fuse. */
  renewalDateIso?: string | null;
  /** Milestone just landed (celebration session) — shows the banner + gold chip. */
  justHit?: { entries: number; drawName: string } | null;
  /** Best streak before the current generation (fresh-start engrave). */
  prevBestMonths?: number | null;
  /** Retention pause (no live payload signal yet — prop-ready per the Build Kit). */
  paused?: boolean;
  /** Resume-by label for the paused state, e.g. "24 Oct". */
  pausedUntilLabel?: string | null;
  /** Past-due recovery CTA (stays red regardless of tier). */
  onUpdateCard?: () => void;
  /** Guest/one-time teaser CTA → membership modal. */
  onSeeMemberships?: () => void;
  className?: string;
}

/** Anvil — the streak's own mark (Build Kit #ic-streak). */
function AnvilIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 74 30" className={className} fill="currentColor" aria-hidden>
      <path d="M4 2h44c6 0 10 2 14 5 4 2 9 2 12-1v4c-3 4-9 5-14 4-5-.8-8-2-12-2H38v6l8 5v5H20v-5l8-5v-6H16c-2 3-6 4-10 3V6c3 .3 5-1 6-4H4V2z" />
    </svg>
  );
}

const STEEL_FILL = "bg-black/[.05] dark:bg-white/[.06]";
const STEEL_BORDER = "border-black/[.09] dark:border-white/[.11]";

/** The medallion: conic progress ring (30°/level) around the tier-tinted disc. */
function Medallion({
  lvl,
  state,
}: {
  lvl: number;
  state: StreakCardState | "teaser";
}) {
  const capped = Math.min(Math.max(lvl, 0), 12);
  const isMax = state === "founding";
  const isEmpty = state === "fresh";
  const isDim = state === "atrisk";
  const isFrozen = state === "paused";
  const size = isMax ? 158 : 150;
  const hole = isMax ? "56px, #000 57px" : "54px, #000 55px";

  const ringBackground = isMax
    ? "conic-gradient(from -90deg, var(--s-hi), var(--s-ring), var(--s-b), var(--s-ring), var(--s-hi))"
    : `repeating-conic-gradient(from -90deg, rgba(0,0,0,0) 0 27deg, var(--bg-surface) 27deg 30deg), conic-gradient(from -90deg, ${
        isFrozen ? "#aeb8c2" : "var(--s-ring)"
      } 0 ${capped * 30}deg, ${"rgba(127,127,127,.12)"} 0)`;
  const mask = `radial-gradient(circle, #0000 ${hole})`;

  const discBackground = isEmpty
    ? "radial-gradient(120% 120% at 32% 22%, #fff 0, #f0e9db 60%, #d8cbb2 100%)"
    : isFrozen
      ? "radial-gradient(120% 120% at 32% 22%, #fafbfc 0, #dde2e9 26%, #a3adba 60%, #5f6875 100%)"
      : "radial-gradient(120% 120% at 32% 22%, var(--s-core) 0, var(--s-hi) 26%, var(--s-b) 60%, var(--s-em) 100%)";
  const discShadow = isFrozen
    ? "inset 0 2px 3px rgba(255,255,255,.6), inset 0 -9px 15px rgba(40,47,58,.5), 0 8px 18px -6px rgba(40,47,58,.4)"
    : "inset 0 2px 4px rgba(255,255,255,.6), inset 0 -10px 16px var(--s-sh), 0 10px 22px -6px var(--s-sh), 0 2px 6px rgba(0,0,0,.12)";

  return (
    <div
      className={cn("absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2", isDim && "saturate-50 brightness-[.97]")}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span
        className={cn(
          "absolute inset-0 rounded-full",
          !isDim && !isFrozen && "motion-safe:animate-[ta-streak-glowpulse_3s_ease-in-out_infinite]",
          isDim && "opacity-80"
        )}
        style={{
          background: ringBackground,
          WebkitMask: mask,
          mask,
          ...(isMax || isFrozen ? { filter: isMax ? "drop-shadow(0 0 14px var(--s-glow))" : "drop-shadow(0 0 10px rgba(150,160,175,.4))" } : {}),
        }}
      />
      <span
        className="absolute left-1/2 top-1/2 flex h-[104px] w-[104px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full"
        style={{ background: discBackground, boxShadow: discShadow }}
      >
        {isMax ? (
          <Crown className="mb-[1px] h-4 w-[26px] text-white drop-shadow-[0_1px_1px_rgba(120,53,15,.5)]" fill="currentColor" strokeWidth={0} />
        ) : (
          <Zap
            className={cn("-mb-px h-[19px] w-[19px]", isEmpty ? "text-[var(--s-b)]" : "text-white drop-shadow-[0_1px_1px_rgba(120,53,15,.5)]")}
            fill="currentColor"
            strokeWidth={0}
          />
        )}
        <span
          className={cn("font-['Poppins'] text-[42px] font-extrabold leading-[.9] tracking-[-.02em] tabular-nums", isEmpty ? "text-[var(--s-b)]" : "text-white")}
          style={isEmpty ? undefined : { textShadow: "0 1px 2px var(--s-sh)" }}
        >
          {lvl}
        </span>
        <span
          className={cn("mt-[3px] text-[8px] font-bold tracking-[.16em]", isEmpty ? "text-[var(--s-b)]" : "text-white/90")}
        >
          {isMax ? "FOUNDING" : "LEVEL"}
        </span>
      </span>
    </div>
  );
}

/** Billing-cycle fuse: 4px track, tier-gradient fill, glowing head dot. */
function CycleFuse({ fx, left, right }: { fx: number; left: string; right: React.ReactNode }) {
  return (
    <div className="mx-0.5 mb-3 mt-0.5">
      <div className={cn("relative h-1 rounded-full border", STEEL_FILL, STEEL_BORDER)}>
        <span
          className="absolute inset-0 origin-left rounded-full"
          style={{ background: "linear-gradient(90deg, var(--s-em), var(--s-b) 70%, var(--s-hi))", transform: `scaleX(${fx})` }}
        />
        <span
          className="absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full"
          style={{ left: `calc(${fx * 100}% - 3px)`, background: "var(--s-core)", boxShadow: "0 0 8px 2px var(--s-glow)" }}
        />
      </div>
      <div className="mt-[7px] flex justify-between text-[10.5px] font-semibold leading-none text-muted-token">
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}

/** The floating "+N free entries" pill above a rung. */
function RungAmount({ entries, compact, className }: { entries: number; compact?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute -top-[19px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[5px] border border-token bg-surface px-1.5 py-[3px] text-[8.5px] font-bold leading-none text-[var(--s-b)] shadow-sm",
        className
      )}
    >
      +{entries}
      {!compact && " free entries"}
    </span>
  );
}

/**
 * Tempering rail — the six milestone rungs (Lv.2 … Lv.12). The NEXT rung shows
 * its reward persistently; hovering ANY rung reveals that level's reward (and
 * hides the persistent pill so two pills never collide).
 */
function TemperingRail({ months, showAllAmounts }: { months: number; showAllAmounts?: boolean }) {
  const next = nextStreakMilestone(months);
  return (
    // pt-5 = headroom the pills float into; the hover group is the PLATES ROW
    // (gaps included), so the persistent pill can't flicker while the cursor
    // crosses between plates.
    <div className="mb-3 pt-5">
      <div className="group/rail flex gap-1.5">
        {STREAK_MILESTONES.map((rung) => {
          const earned = !showAllAmounts && isRungEarned(rung.level, months);
          const isNext = showAllAmounts ? rung.level === STREAK_MILESTONES[0].level : rung.level === next.rungLevel && months < 12;
          return (
            <div
              key={rung.level}
              className={cn(
                "group/plate relative flex h-[30px] flex-1 items-center justify-center rounded-[7px] border font-['Poppins'] text-[10.5px] font-extrabold",
                earned
                  ? "border-[var(--s-b)] text-[#241a04] shadow-[inset_0_1px_0_rgba(255,255,255,.5),inset_0_-2px_4px_var(--s-sh)]"
                  : isNext
                    ? "border-[var(--s-b)] text-[var(--s-b)] motion-safe:animate-[ta-streak-pulse_2.2s_ease-in-out_infinite]"
                    : cn(STEEL_FILL, STEEL_BORDER, "text-muted-token")
              )}
              style={earned ? { background: "linear-gradient(180deg, var(--s-hi), var(--s-b) 88%)" } : undefined}
            >
              Lv.{rung.level}
              {showAllAmounts ? (
                // Guest teaser: the whole ladder is the sell — every amount visible.
                <RungAmount entries={rung.entries} compact />
              ) : (
                <>
                  {/* Persistent pill on the NEXT rung — hidden whenever the cursor is
                      anywhere on the rail (a hover pill takes over; no overlaps). */}
                  {isNext && <RungAmount entries={rung.entries} className="group-hover/rail:hidden" />}
                  {/* Hover pill on EVERY rung — hover a level to see its reward. */}
                  <RungAmount entries={rung.entries} className="hidden group-hover/plate:block" />
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function LoyaltyStreak({
  months,
  acct,
  tierKey,
  renewalDateIso,
  justHit,
  prevBestMonths,
  paused = false,
  pausedUntilLabel,
  onUpdateCard,
  onSeeMemberships,
  className,
}: LoyaltyStreakProps) {
  const m = Math.max(months ?? 0, 0);
  const isTeaser = acct === "none" || acct === "onetime";
  const state = isTeaser ? null : deriveStreakCardState(acct, m, paused);
  if (!isTeaser && !state) return null;

  const accent = streakAccentVars(isTeaser ? null : tierKey);
  const fuse = deriveStreakCycleFuse(renewalDateIso ?? null);
  const next = nextStreakMilestone(m);

  const cardStyle = accent as unknown as CSSProperties;

  /* ── guest / one-time teaser — the full ladder as the sell ── */
  if (isTeaser) {
    return (
      <section
        className={cn(
          "relative overflow-hidden rounded-[17px] border border-token bg-surface p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.5),0_1px_2px_rgba(60,47,4,.05),0_10px_28px_-14px_rgba(60,47,4,.16)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,.05),0_1px_2px_rgba(0,0,0,.35),0_12px_30px_-14px_rgba(0,0,0,.6)]",
          className
        )}
        style={cardStyle}
      >
        <span className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(190px at 50% 40%, rgba(217,119,6,.20), transparent 70%)" }} />
        <div className="relative mb-2 flex items-center justify-between">
          <span className="inline-flex items-center gap-[7px] font-['Poppins'] text-[13.5px] font-extrabold text-primary-token dark:text-white">
            <AnvilIcon className="h-3 w-[21px]" /> Streak
          </span>
          <span className="rounded-full border px-2.5 py-1.5 text-[12px] font-semibold leading-none backdrop-blur-[4px]" style={{ borderColor: "color-mix(in srgb, var(--s-b) 42%, transparent)", color: "var(--s-b)" }}>
            Members only
          </span>
        </div>
        <div className="relative h-[150px]">
          <Medallion lvl={12} state="teaser" />
        </div>
        <TemperingRail months={0} showAllAmounts />
        <p className="text-[12px] leading-[1.55] text-muted-token">
          <b className="font-semibold text-primary-token dark:text-white">Join to start a streak.</b> Each milestone drops free entries into the Major Draw.
        </p>
        {onSeeMemberships && (
          <button
            type="button"
            onClick={onSeeMemberships}
            className="mt-2.5 block w-full rounded-[9px] bg-gradient-to-b from-red-400 to-red-600 py-[11px] text-center text-[13px] font-bold leading-none text-white shadow-[inset_0_1px_0_rgba(255,255,255,.25),0_6px_16px_-6px_rgba(220,38,38,.55)] transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-safe:active:translate-y-px"
          >
            See memberships
          </button>
        )}
      </section>
    );
  }

  /* ── member card copy per state ── */
  const chip = (() => {
    if (justHit) return { label: `+${justHit.entries} free entries`, gold: true };
    switch (state) {
      case "fresh":
        return { label: "New streak" };
      case "atrisk":
        return { label: "Payment issue", risk: true };
      case "paused":
        return { label: "Paused", frozen: true };
      case "founding":
        return { label: "Founding member", gold: true };
      default:
        return { label: `${m} month${m === 1 ? "" : "s"}` };
    }
  })();

  const footer = (() => {
    switch (state) {
      case "fresh":
        return (
          <>
            <b className="font-semibold text-primary-token dark:text-white">Fresh steel.</b> Every renewal builds your streak — +{STREAK_MILESTONES[0].entries} free entries at your 2nd.
          </>
        );
      case "atrisk":
        return (
          <>
            <b className="font-semibold text-primary-token dark:text-white">Your streak&rsquo;s safe.</b> Fix your card and it carries on — nothing banked is lost.
          </>
        );
      case "paused":
        return (
          <>
            <b className="font-semibold text-primary-token dark:text-white">Held safe.</b> Come back{pausedUntilLabel ? <> by <span className="font-bold text-[var(--s-b)]">{pausedUntilLabel}</span></> : null} and it carries straight on.
          </>
        );
      case "founding":
        return (
          <>
            <b className="font-semibold text-primary-token dark:text-white">+{next.entries} free entries</b> at Lv.{next.level} — the ladder repeats every year.
            {fuse && (
              <>
                {" "}Renews <span className="font-bold text-[var(--s-b)]">{fuse.renewsLabel}</span>.
              </>
            )}
          </>
        );
      default:
        return next.toGo === 1 ? (
          <>
            <b className="font-semibold text-primary-token dark:text-white">Next renewal does it:</b> +{next.entries} free entries, automatic.
            {fuse && (
              <>
                {" "}Renews <span className="font-bold text-[var(--s-b)]">{fuse.renewsLabel}</span>.
              </>
            )}
          </>
        ) : (
          <>
            <b className="font-semibold text-primary-token dark:text-white">+{next.entries} free entries</b> land at Lv.{next.level} — {next.toGo} renewals to go. Straight into that month&rsquo;s Major Draw.
          </>
        );
    }
  })();

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[17px] border border-token bg-surface p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.5),0_1px_2px_rgba(60,47,4,.05),0_10px_28px_-14px_rgba(60,47,4,.16)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,.05),0_1px_2px_rgba(0,0,0,.35),0_12px_30px_-14px_rgba(0,0,0,.6)]",
        className
      )}
      style={cardStyle}
    >
      {/* tier-tinted ambient glow */}
      <span className="pointer-events-none absolute inset-0 opacity-10 dark:opacity-[.18]" style={{ background: "radial-gradient(150px at 50% 34%, var(--s-glow), transparent 70%)" }} />

      <div className="relative mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-[7px] font-['Poppins'] text-[13.5px] font-extrabold text-primary-token dark:text-white">
          <AnvilIcon className="h-3 w-[21px]" /> Streak
        </span>
        <span
          className={cn(
            "rounded-full border px-2.5 py-1.5 text-[12px] font-semibold leading-none backdrop-blur-[4px]",
            chip.gold && "border-[var(--s-b)] font-bold text-[#241a04] shadow-[inset_0_1px_0_rgba(255,255,255,.45)]",
            chip.frozen && "border-[rgba(120,132,146,.5)] text-[#69737f]"
          )}
          style={
            chip.gold
              ? { background: "linear-gradient(180deg, var(--s-hi), var(--s-b))" }
              : chip.frozen
                ? undefined
                : {
                    borderColor: "color-mix(in srgb, var(--s-b) 42%, transparent)",
                    color: "var(--s-b)",
                    ...(chip.risk ? { background: "color-mix(in srgb, var(--s-b) 9%, transparent)" } : {}),
                  }
          }
        >
          {chip.label}
        </span>
      </div>

      <div className="relative h-[150px]">
        {state === "paused" && (
          <span className="absolute -inset-x-[18px] -inset-y-3 z-10 rounded-[14px] border border-[rgba(160,172,186,.5)]" style={{ background: "linear-gradient(180deg, rgba(255,255,255,.38), rgba(255,255,255,.05))" }} />
        )}
        <Medallion lvl={Math.min(m, 12)} state={state as StreakCardState} />
      </div>

      {state !== "paused" && fuse && (
        <CycleFuse
          fx={fuse.fx}
          left={`Day ${fuse.day} of ${fuse.totalDays}`}
          right={state === "atrisk" ? "Payment due" : <>Renews <b className="text-[var(--s-b)]">{fuse.renewsLabel}</b></>}
        />
      )}

      {state !== "founding" && <TemperingRail months={m} />}

      {justHit && (
        <div
          className="mb-2.5 rounded-[9px] border px-3 py-2 text-[12px] font-semibold leading-[1.5] text-primary-token dark:text-white"
          style={{
            background: "linear-gradient(90deg, color-mix(in srgb, var(--s-b) 16%, transparent), transparent)",
            borderColor: "color-mix(in srgb, var(--s-b) 25%, transparent)",
          }}
        >
          <b className="text-[var(--s-b)]">+{justHit.entries} free entries</b> landed in the {justHit.drawName}.
        </div>
      )}

      <p className="text-[12px] leading-[1.55] text-muted-token">{footer}</p>

      {state === "fresh" && (prevBestMonths ?? 0) > 0 && (
        <div className="mt-1.5 text-[9px] font-bold uppercase tracking-[.12em] text-muted-token">PREV. BEST · {prevBestMonths} MONTHS</div>
      )}

      {state === "atrisk" && onUpdateCard && (
        <button
          type="button"
          onClick={onUpdateCard}
          className="mt-2.5 block w-full rounded-[9px] bg-gradient-to-b from-red-400 to-red-600 py-[11px] text-center text-[13px] font-bold leading-none text-white shadow-[inset_0_1px_0_rgba(255,255,255,.25),0_6px_16px_-6px_rgba(220,38,38,.55)] transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 motion-safe:active:translate-y-px"
        >
          Update card
        </button>
      )}
    </section>
  );
}
