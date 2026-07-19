"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { CalendarDays, Clock, Lock, Shield, Trophy, type LucideIcon } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";
import { useLeafTimer } from "@/hooks/useLeafTimer";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import type { ServerMajorDraw } from "@/utils/database/queries/major-draw-server-queries";
import { cn } from "@/utils/cn";

const linkClass =
  "text-inherit visited:text-inherit no-underline decoration-transparent [text-decoration-line:none] transition-opacity hover:opacity-90";

type TrustItem =
  | {
      kind: "text";
      icon: LucideIcon;
      lineMobile: string;
      lineDesktop: string;
      desktopMutedTail?: string;
    }
  | {
      kind: "cert";
      icon: LucideIcon;
      href: string;
      host: string;
      lineDesktopBeforeLink: string;
    };

/** Shared label styles: white-on-steel stencil, all caps. Mobile keeps nowrap + leading-none to hold the bar on one line. */
const labelCn =
  "min-w-0 font-extrabold uppercase tracking-wide text-white text-[clamp(7px,2.2vw,10px)] max-sm:whitespace-nowrap max-sm:leading-none sm:text-xs sm:leading-snug sm:tracking-wide sm:whitespace-normal lg:text-sm";

const TRUST_LABEL_FONT: CSSProperties = {
  fontFamily: "'Oswald', 'Bebas Neue', 'Impact', 'Arial Narrow', sans-serif",
  letterSpacing: "0.06em",
};

const AEST_TIMEZONE = "Australia/Sydney";
const HOUR_MS = 60 * 60 * 1000;

type UrgencyTier = "finalHours" | "drawnTomorrow" | "drawnTonight" | "frozen";

const URGENCY_IMAGE: Record<UrgencyTier, string> = {
  finalHours: "/images/background/promo/finalHours/finalHours.webp",
  drawnTomorrow: "/images/background/promo/finalHours/drawnTomorrow.webp",
  drawnTonight: "/images/background/promo/finalHours/drawnTonight.webp",
  // Frozen reuses drawnTonight — entries are closed but the live draw is still "tonight"
  frozen: "/images/background/promo/finalHours/drawnTonight.webp",
};

const URGENCY_ALT: Record<UrgencyTier, string> = {
  finalHours: "Final hours to enter",
  drawnTomorrow: "Drawn tomorrow",
  drawnTonight: "Drawn tonight",
  frozen: "Drawn tonight",
};

const URGENCY_LABEL: Record<UrgencyTier, string> = {
  finalHours: "FINAL HOURS",
  drawnTomorrow: "DRAWN TOMORROW",
  drawnTonight: "DRAWN TONIGHT",
  frozen: "ENTRIES CLOSED",
};

/**
 * Resolve which urgency tier (if any) the bar should render.
 * - <72h to freeze → "finalHours"
 * - <48h to freeze → "drawnTomorrow"
 * - <24h to freeze → "drawnTonight"
 * - now ≥ freeze but draw is still upcoming (or within 12h-after window) → "frozen"
 * Returns null when normal trust bar should render.
 *
 * Note: `currentMajorDraw.activationDate` is when *this* draw became active (always in the
 * past for an active draw), NOT when entries lock out. Don't use it as a stop condition.
 */
function getUrgencyTier(
  nowMs: number,
  freezeMs: number | null,
  drawMs: number | null
): UrgencyTier | null {
  if (freezeMs == null) return null;
  if (nowMs >= freezeMs) {
    // Show "frozen" through the 30-min freeze window + a short buffer after the live draw.
    // After ~12h past drawDate we assume the draw cycle has flipped and fall back to normal.
    if (drawMs == null || nowMs < drawMs + 12 * HOUR_MS) return "frozen";
    return null;
  }
  const msUntilFreeze = freezeMs - nowMs;
  if (msUntilFreeze < 24 * HOUR_MS) return "drawnTonight";
  if (msUntilFreeze < 48 * HOUR_MS) return "drawnTomorrow";
  if (msUntilFreeze < 72 * HOUR_MS) return "finalHours";
  return null;
}

/** "Wed 27 May · 8:00pm AEST" / "Tomorrow · 8:00pm AEST" / "Tonight · 8:00pm AEST" */
function formatDeadlineLabel(deadline: Date, now: Date): string {
  const tz = AEST_TIMEZONE;
  const time = `${formatInTimeZone(deadline, tz, "h:mm")}${formatInTimeZone(deadline, tz, "a").toLowerCase()}`;
  const tzAbbr =
    new Intl.DateTimeFormat("en-AU", { timeZone: tz, timeZoneName: "short" })
      .formatToParts(deadline)
      .find((p) => p.type === "timeZoneName")?.value ?? "AEST";
  const deadlineDay = formatInTimeZone(deadline, tz, "yyyy-MM-dd");
  const todayDay = formatInTimeZone(now, tz, "yyyy-MM-dd");
  const tomorrowDay = formatInTimeZone(new Date(now.getTime() + 24 * HOUR_MS), tz, "yyyy-MM-dd");
  if (deadlineDay === todayDay) return `Tonight · ${time} ${tzAbbr}`;
  if (deadlineDay === tomorrowDay) return `Tomorrow · ${time} ${tzAbbr}`;
  return `${formatInTimeZone(deadline, tz, "EEE d MMM")} · ${time} ${tzAbbr}`;
}

/* ────────────────────────────────────────────────────────────────────────
 * Workshop-plaque palette
 *   Workshop substrate (brushed steel + brass rivets + hazard borders) is
 *   the visual signature of this bar across every state. Hazard yellow and
 *   the steel tones stay constant — the universal "caution" channel. The
 *   active promo theme tints the small icons (and the brass nameplate icon
 *   in urgency states) without overwriting the workshop metaphor.
 * ──────────────────────────────────────────────────────────────────────── */

const STEEL_BG = "linear-gradient(180deg, #2a2c30 0%, #3a3d44 50%, #25272b 100%)";
const STEEL_GRAIN =
  "repeating-linear-gradient(180deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 3px), repeating-linear-gradient(180deg, rgba(0,0,0,0.18) 0 1px, transparent 1px 5px)";
const HAZARD_STRIPE = "repeating-linear-gradient(45deg, #facc15 0 14px, #0a0a0a 14px 28px)";
const HAZARD_STRIPE_FROZEN =
  "repeating-linear-gradient(45deg, #facc15 0 10px, #7f1d1d 10px 20px)";
const BRASS_BG = "linear-gradient(180deg, #e5c073 0%, #c79a44 45%, #8e6a22 100%)";
const BRASS_RIM =
  "inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -1px 0 rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.6)";
const RED_BG = "linear-gradient(180deg, #f87171 0%, #dc2626 45%, #7f1d1d 100%)";

const ENGRAVED_TEXT: CSSProperties = {
  color: "#3a2a08",
  textShadow: "0 -1px 0 rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.35)",
  fontFamily: "'Saira Stencil One', 'Oswald', 'Impact', 'Arial Narrow', sans-serif",
  letterSpacing: "0.08em",
};

const ENGRAVED_TEXT_RED: CSSProperties = {
  color: "#3a0808",
  textShadow: "0 -1px 0 rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.35)",
  fontFamily: "'Saira Stencil One', 'Oswald', 'Impact', 'Arial Narrow', sans-serif",
  letterSpacing: "0.08em",
};

const STENCIL_TEXT: CSSProperties = {
  fontFamily: "'Oswald', 'Bebas Neue', 'Impact', 'Arial Narrow', sans-serif",
  letterSpacing: "0.06em",
};

/** Hazard border thickness escalates with urgency. Default state shows a thin brass rule (not hazard) so the hazard channel retains its urgency meaning when it appears. */
const HAZARD_HEIGHT: Record<UrgencyTier, string> = {
  finalHours: "6px",
  drawnTomorrow: "8px",
  drawnTonight: "10px",
  frozen: "10px",
};

/** Default-state edge: 2 px brass rule with the active brand colour bleeding into the middle stop. */
function buildBrassRule(themePrimary: string): string {
  return `linear-gradient(90deg, transparent 0%, #c79a44 18%, ${themePrimary} 50%, #c79a44 82%, transparent 100%)`;
}

/** Brass rivet — radial-gradient sphere with inset highlights so it reads as a real bolt head. */
function Rivet({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      // Smaller + tighter to the corners on mobile so the short bar reads as four distinct
      // corner bolts. At the previous 8px size / 8px inset the top and bottom rivets collapsed
      // onto each other in the middle of the short mobile bar (looking like one centred blob).
      // Full 8px size and 8px inset restored from sm up, where the bar is tall enough.
      className={cn("absolute rounded-full h-1.5 w-1.5 sm:h-2 sm:w-2", className)}
      style={{
        background:
          "radial-gradient(circle at 35% 30%, #f3d07a 0%, #b8893a 45%, #5a3f10 100%)",
        boxShadow:
          "inset 0 -1px 1px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.4), 0 1px 1px rgba(0,0,0,0.5)",
      }}
    />
  );
}

/** Shared steel chassis: top + bottom edge band (hazard in urgency states, brand-tinted brass rule in default), brushed-steel body, brass rivets at all four inset corners. */
function WorkshopShell({
  tier,
  isFrozen,
  themePrimary,
  ariaLabel,
  children,
}: {
  tier: UrgencyTier | null;
  isFrozen: boolean;
  themePrimary: string;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  const isUrgent = tier !== null;
  const edgeStyle: CSSProperties = isUrgent
    ? {
        height: HAZARD_HEIGHT[tier],
        background: isFrozen ? HAZARD_STRIPE_FROZEN : HAZARD_STRIPE,
      }
    : { height: 2, background: buildBrassRule(themePrimary) };
  return (
    <div
      className="relative z-10 w-full overflow-hidden"
      style={{ background: STEEL_BG }}
      aria-label={ariaLabel}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: STEEL_GRAIN, opacity: 0.55 }}
      />
      <div className="w-full" style={edgeStyle} />
      <div className="relative box-border w-full min-w-0 max-w-none max-sm:py-1.5 py-2 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:px-6 sm:py-3 lg:px-10 xl:px-14 2xl:px-16">
        <Rivet className="left-1 top-1 sm:left-2 sm:top-2" />
        <Rivet className="right-1 top-1 sm:right-2 sm:top-2" />
        <Rivet className="left-1 bottom-1 sm:left-2 sm:bottom-2" />
        <Rivet className="right-1 bottom-1 sm:right-2 sm:bottom-2" />
        {children}
      </div>
      <div className="w-full" style={edgeStyle} />
    </div>
  );
}

interface PromoTrustBarProps {
  /**
   * Server-fetched current major draw. Used for first paint so the urgency variant
   * doesn't flicker through a stale client-cached value from a previous draw state.
   * The client hook (`useCurrentMajorDraw`) is consulted only when this is absent.
   */
  initialMajorDraw?: ServerMajorDraw | null;
}

export default function PromoTrustBar({ initialMajorDraw }: PromoTrustBarProps = {}) {
  const theme = usePromoTheme();
  const { data: currentMajorDraw, isSuccess: currentDrawResolved } = useCurrentMajorDraw();
  // 60s tick is enough — the bar shows down to minutes, not seconds.
  const nowMs = useLeafTimer(60_000);

  // Prefer the server-fetched prop on first paint. The client hook may return
  // stale cached data from a previous draw state; the page just re-rendered
  // server-side so the prop is authoritative.
  // Client-resolved data WINS once the query settles; the server-baked prop is only a
  // first-paint seed. Under ISR + Vercel stale-while-revalidate the baked prop can be
  // minutes-to-hours old on a stale-served copy — preferring it pinned outdated draw
  // state for whole sessions (2026-07 final-review fix). isSuccess (not truthiness)
  // decides so a resolved "no active draw" (null) also correctly clears the seed.
  const draw = currentDrawResolved ? currentMajorDraw : initialMajorDraw;
  const freezeMs = draw?.freezeEntriesAt ? new Date(draw.freezeEntriesAt).getTime() : null;
  const drawMs = draw?.drawDate ? new Date(draw.drawDate).getTime() : null;

  const tier = getUrgencyTier(nowMs, freezeMs, drawMs);

  if (tier !== null && freezeMs != null) {
    const isFrozen = tier === "frozen";
    const referenceDate = isFrozen && drawMs != null ? new Date(drawMs) : new Date(freezeMs);
    const dateLabel = formatDeadlineLabel(referenceDate, new Date(nowMs));
    const TimerIcon = isFrozen ? Lock : Clock;
    const plaqueBg = isFrozen ? RED_BG : BRASS_BG;
    const engraved = isFrozen ? ENGRAVED_TEXT_RED : ENGRAVED_TEXT;
    // Theme tints the small icon inside the brass nameplate — preserves workshop look,
    // signals the active package without rewriting the substrate.
    const nameplateIconColor = isFrozen ? "#3a0808" : theme.primary;
    // Brand colour bleeds underneath the brass plaque as a 3 px coloured shadow,
    // giving the plaque a brand-tinted "shelf" without changing its surface metal.
    // Frozen keeps the pure brass rim — red entries-closed signal should not be muddied.
    const plaqueShadow = isFrozen
      ? BRASS_RIM
      : `${BRASS_RIM}, 0 3px 0 0 ${theme.primary}`;

    return (
      <WorkshopShell
        tier={tier}
        isFrozen={isFrozen}
        themePrimary={theme.primary}
        ariaLabel={isFrozen ? "Entries closed — draw airing live" : "Final hours to enter"}
      >
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Brass nameplate — desktop only. On mobile the urgency image carries the tier label. */}
            <div
              className="relative hidden sm:inline-flex items-center px-2.5 py-1.5 rounded-[2px] flex-shrink-0"
              style={{ background: plaqueBg, boxShadow: plaqueShadow }}
            >
              <TimerIcon
                className="h-3.5 w-3.5 mr-1.5 flex-shrink-0"
                style={{ color: nameplateIconColor }}
                aria-hidden
              />
              <span
                className="text-[13px] lg:text-sm font-extrabold whitespace-nowrap"
                style={engraved}
              >
                {URGENCY_LABEL[tier]}
              </span>
            </div>
            {/* Mobile: standalone timer icon (replaces the dropped nameplate so the deadline still has a leading glyph). */}
            <TimerIcon
              className="sm:hidden h-4 w-4 flex-shrink-0"
              style={{ color: isFrozen ? "#fca5a5" : theme.primary }}
              aria-hidden
            />
            <div className="min-w-0">
              <div
                className="text-[8px] sm:text-[10px] lg:text-[11px] uppercase font-bold leading-none"
                style={{
                  ...STENCIL_TEXT,
                  color: isFrozen ? "#fca5a5" : theme.primaryLight,
                }}
              >
                {isFrozen ? "Entries closed" : "Entries close"}
              </div>
              <div
                className="text-[11px] sm:text-sm lg:text-base font-bold text-white leading-tight truncate"
                style={STENCIL_TEXT}
              >
                {isFrozen ? `Draw live · ${dateLabel.replace(/^Tonight · |^Tomorrow · /, "")}` : dateLabel}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end flex-shrink-0">
            <Image
              src={URGENCY_IMAGE[tier]}
              alt={URGENCY_ALT[tier]}
              width={450}
              height={150}
              priority
              className="block h-auto w-auto"
              style={{ height: "clamp(36px, 7vw, 64px)" }}
              sizes="(min-width: 1024px) 280px, (min-width: 640px) 200px, 150px"
            />
          </div>
        </div>
      </WorkshopShell>
    );
  }

  const trustItems: TrustItem[] = [
    {
      kind: "text",
      icon: Trophy,
      lineMobile: "Drawn live",
      lineDesktop: "Winners drawn live",
      desktopMutedTail: "· on Facebook",
    },
    {
      kind: "cert",
      icon: Shield,
      href: "https://randomdraws.com.au",
      host: "randomdraws.com.au",
      lineDesktopBeforeLink: "Govt-certified draws · ",
    },
    {
      kind: "text",
      icon: CalendarDays,
      lineMobile: "Drawn every 27th",
      lineDesktop: "Drawn every 27th",
    },
  ];

  return (
    <WorkshopShell
      tier={null}
      isFrozen={false}
      themePrimary={theme.primary}
      ariaLabel="Trust and giveaway information"
    >
      {/* max-sm:px-5 holds the edge items off the corner rivets on mobile. Kept as a standard
          utility (not an arbitrary value) so Turbopack HMR regenerates it reliably. */}
      <div className="flex w-full min-w-0 flex-row flex-nowrap items-center justify-between gap-2 max-sm:px-5 sm:justify-center sm:gap-6 md:gap-10 lg:justify-between lg:gap-6 xl:gap-10">
        {trustItems.map((item) => {
          const Icon = item.icon;
          const key = item.kind === "text" ? item.lineDesktop : item.host;

          /** Mobile: all three columns are content-width and the row is justify-between, so
           *  "Drawn live" sits at the left, "Drawn every 27th" at the right, and the cert centred
           *  between them. The cert keeps the flex-item default (no grow; can shrink via the base
           *  `min-w-0`) — restoring its old `flex-1` would collapse the gaps and stretch the centre
           *  column again. Clearance from the corner rivets comes from the row's `max-sm:px-5`
           *  (a standard utility, so HMR regenerates it reliably). From sm up the base `sm:flex-1`
           *  takes over. The cert is rendered at every breakpoint
           *  in the normal state — the urgency state replaces the whole trust-items layout, so it
           *  disappears automatically during finalHours / drawnTomorrow / drawnTonight / frozen. */
          const shellMobile =
            item.kind === "cert"
              ? ""
              : "max-sm:flex-none max-sm:shrink-0 max-sm:basis-auto";

          if (item.kind === "cert") {
            return (
              <div
                key={key}
                className={cn("flex min-w-0 items-center justify-center sm:flex-1", shellMobile)}
              >
                <div className="inline-flex min-w-0 max-w-full items-center gap-0.5 sm:gap-2">
                  <Icon
                    className="h-3.5 w-3.5 flex-shrink-0 sm:h-5 sm:w-5"
                    style={{ color: theme.primary }}
                    aria-hidden
                  />
                  {/* Cert link stays white at every breakpoint — readability on dark steel
                      beats brand expression for an attribution link. The explicit text-white
                      MUST come after linkClass: twMerge keeps the last colour utility, and
                      linkClass's `text-inherit` otherwise wins and lets the link fall back to
                      the page's dark body text (bg-white page) — black-on-steel on mobile. */}
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(labelCn, "min-w-0 lg:hidden", linkClass, "text-white visited:text-white")}
                    style={TRUST_LABEL_FONT}
                    aria-label="Government-certified draws — randomdraws.com.au"
                  >
                    {item.host}
                  </a>
                  <p
                    className={cn(labelCn, "hidden min-w-0 max-w-full lg:inline")}
                    style={TRUST_LABEL_FONT}
                  >
                    <span>{item.lineDesktopBeforeLink}</span>
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(linkClass, "inline")}
                    >
                      {item.host}
                    </a>
                  </p>
                </div>
              </div>
            );
          }

          return (
            <div
              key={key}
              className={cn("flex min-w-0 items-center justify-center sm:flex-1 lg:justify-center", shellMobile)}
            >
              <div className="inline-flex max-w-full items-center gap-0.5 sm:gap-2">
                <Icon
                  className="h-3.5 w-3.5 flex-shrink-0 sm:h-5 sm:w-5"
                  style={{ color: theme.primary }}
                  aria-hidden
                />
                <p className={cn(labelCn, "m-0 max-w-full sm:leading-snug")} style={TRUST_LABEL_FONT}>
                  <span className="lg:hidden">{item.lineMobile}</span>
                  <span className="hidden lg:inline">
                    {item.lineDesktop}
                    {item.desktopMutedTail != null ? (
                      <span className="font-semibold text-neutral-300"> {item.desktopMutedTail}</span>
                    ) : null}
                  </span>
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </WorkshopShell>
  );
}
