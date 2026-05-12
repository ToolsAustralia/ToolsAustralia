"use client";

import Image from "next/image";
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

/** Shared label styles: all caps. On mobile, nowrap + leading-none keeps the bar to a single line (no height jump). */
const labelCn =
  "min-w-0 font-extrabold uppercase tracking-wide text-[clamp(7px,2.2vw,10px)] max-sm:whitespace-nowrap max-sm:leading-none sm:text-xs sm:leading-snug sm:tracking-wide sm:whitespace-normal lg:text-sm";

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
  const { data: currentMajorDraw } = useCurrentMajorDraw();
  // 60s tick is enough — the bar shows down to minutes, not seconds.
  const nowMs = useLeafTimer(60_000);

  // Prefer the server-fetched prop on first paint. The client hook may return
  // stale cached data from a previous draw state; the page just re-rendered
  // server-side so the prop is authoritative.
  const draw = initialMajorDraw ?? currentMajorDraw;
  const freezeMs = draw?.freezeEntriesAt ? new Date(draw.freezeEntriesAt).getTime() : null;
  const drawMs = draw?.drawDate ? new Date(draw.drawDate).getTime() : null;

  const tier = getUrgencyTier(nowMs, freezeMs, drawMs);

  if (tier !== null && freezeMs != null) {
    const isFrozen = tier === "frozen";
    const referenceDate = isFrozen && drawMs != null ? new Date(drawMs) : new Date(freezeMs);
    const dateLabel = formatDeadlineLabel(referenceDate, new Date(nowMs));
    const TimerIcon = isFrozen ? Lock : Clock;
    const accentColor = isFrozen ? "#dc2626" : theme.primary;

    return (
      <div
        className="relative z-10 w-full min-w-0 max-w-none bg-white dark:bg-neutral-950 border-b border-slate-200/80 dark:border-neutral-800"
        aria-label={isFrozen ? "Entries closed — draw airing live" : "Final hours to enter"}
      >
        <div className="box-border w-full min-w-0 max-w-none max-sm:py-1.5 py-2 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:px-6 sm:py-3 lg:px-10 xl:px-14 2xl:px-16">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <TimerIcon
                className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0"
                style={{ color: accentColor }}
                aria-hidden
              />
              <div className="min-w-0">
                <div
                  className="font-extrabold uppercase tracking-wide leading-none"
                  style={{
                    color: isFrozen ? "#dc2626" : undefined,
                    fontSize: "clamp(8px, 1.4vw, 11px)",
                  }}
                >
                  <span className={isFrozen ? "" : "text-gray-900 dark:text-white"}>
                    {isFrozen ? "Entries closed" : "Entries close"}
                  </span>
                </div>
                <div
                  className="font-bold text-gray-900 dark:text-white leading-tight"
                  style={{ fontSize: "clamp(11px, 1.8vw, 15px)" }}
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
                style={{ height: "clamp(40px, 8vw, 72px)" }}
                sizes="(min-width: 1024px) 320px, (min-width: 640px) 220px, 160px"
              />
            </div>
          </div>
        </div>
      </div>
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
    <div
      className="relative z-10 w-full min-w-0 max-w-none bg-white dark:bg-neutral-950 border-b border-slate-200/80 dark:border-neutral-800"
      aria-label="Trust and giveaway information"
    >
      <div className="box-border w-full min-w-0 max-w-none max-sm:py-1.5 py-2.5 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:px-6 sm:py-4 lg:px-10 xl:px-14 2xl:px-16">
        <div className="flex w-full min-w-0 flex-row flex-nowrap items-center justify-between gap-1 sm:justify-center sm:gap-6 md:gap-10 lg:justify-between lg:gap-6 xl:gap-10">
          {trustItems.map((item) => {
            const Icon = item.icon;
            const key = item.kind === "text" ? item.lineDesktop : item.host;

            /** Mobile: side columns content-width; center (cert) flex-1 so URL fits one line */
            const shellMobile =
              item.kind === "cert"
                ? "max-sm:flex-1 max-sm:min-w-0 max-sm:basis-0"
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
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(labelCn, "min-w-0 text-gray-900 dark:text-white sm:hidden", linkClass)}
                      aria-label="Government-certified draws — randomdraws.com.au"
                    >
                      {item.host}
                    </a>
                    <p className={cn(labelCn, "hidden min-w-0 max-w-full text-gray-900 dark:text-white sm:inline")}>
                      <span>{item.lineDesktopBeforeLink}</span>
                      <a href={item.href} target="_blank" rel="noopener noreferrer" className={cn(linkClass, "inline")}>
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
                  <p
                    className={cn(labelCn, "m-0 max-w-full text-gray-900 dark:text-white sm:leading-snug")}
                  >
                    <span className="sm:hidden">{item.lineMobile}</span>
                    <span className="hidden sm:inline">
                      {item.lineDesktop}
                      {item.desktopMutedTail != null ? (
                        <span className="font-semibold text-gray-500 dark:text-neutral-400"> {item.desktopMutedTail}</span>
                      ) : null}
                    </span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
