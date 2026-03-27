"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCurrentMajorDraw } from "@/hooks/queries/useMajorDrawQueries";
import { getPrizeBrandColors } from "@/utils/prize-brand-colors";
import { getLandingPageThemeFromSlug } from "@/utils/package-colors/packageColorScheme";
import { formatMajorDrawLiveDateLineUtc } from "@/utils/common/timezone";
import { useMajorDrawEntryCta } from "@/hooks/useMajorDrawEntryCta";
import type { PrizeSlug } from "@/config/prizes";

interface GiveawayCountdownTimerProps {
  activeSlug: PrizeSlug;
  className?: string;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export default function GiveawayCountdownTimer({ activeSlug, className = "" }: GiveawayCountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [drawDateLabel, setDrawDateLabel] = useState("Draw date TBA");
  const [isMounted, setIsMounted] = useState(false);
  const { data: currentMajorDraw } = useCurrentMajorDraw();
  const { openEntryFlow } = useMajorDrawEntryCta();

  const brandColors = getPrizeBrandColors(activeSlug);
  const lpTheme = getLandingPageThemeFromSlug(activeSlug);
  const drawTitle = currentMajorDraw?.name?.trim() || "Major draw";

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (currentMajorDraw?.drawDate) {
      setDrawDateLabel(formatMajorDrawLiveDateLineUtc(new Date(currentMajorDraw.drawDate)));
    } else {
      setDrawDateLabel("Draw date TBA");
    }
  }, [currentMajorDraw]);

  useEffect(() => {
    const drawDate = currentMajorDraw?.drawDate ? new Date(currentMajorDraw.drawDate).getTime() : null;

    if (!drawDate || Number.isNaN(drawDate)) {
      setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const difference = drawDate - now;

      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((difference % (1000 * 60)) / 1000),
        });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [currentMajorDraw?.drawDate]);

  const isCompleted = currentMajorDraw?.status === "completed";
  const isQueued = currentMajorDraw?.status === "queued";
  const isFrozen = currentMajorDraw?.status === "frozen";
  const drawDateObj = currentMajorDraw?.drawDate ? new Date(currentMajorDraw.drawDate) : null;
  const msUntilDraw = isMounted && drawDateObj ? drawDateObj.getTime() - Date.now() : null;
  const daysUntilDraw = msUntilDraw !== null ? msUntilDraw / (1000 * 60 * 60 * 24) : null;
  const shouldShowCountdown =
    !isCompleted && msUntilDraw !== null && msUntilDraw > 0 && daysUntilDraw !== null && daysUntilDraw <= 3;

  if (!isMounted) {
    return null;
  }

  const accentBorderStyle = { borderColor: lpTheme.borderRgba };
  const cornerAccentClass =
    "pointer-events-none absolute h-6 w-6 border-white/25 sm:h-10 sm:w-10 dark:border-white/15";

  /** Frozen state uses a dark neutral panel — always light text. Otherwise use prize brand text tokens. */
  const surfaceText = isFrozen ? "text-white" : brandColors.textColor;
  const surfaceMuted = isFrozen ? "text-white/85" : brandColors.subtitleTextColor;

  /**
   * Ryobi / DeWalt (etc.) use text-black on bright brand gradients — dark "glass" tiles made that illegible.
   * Use elevated brand-tinted tiles + recessed live-draw bar; keep dark translucent tiles for white-text brands.
   */
  const useLightCountdownInner = !isFrozen && brandColors.textColor.includes("black");
  const isRyobi = activeSlug.startsWith("ryobi-");
  const isDewalt = activeSlug.startsWith("dewalt-");

  /** Raised digit tiles: pale brand tint, highlight, shadow — not flat white. */
  const lightTileSurfaceStyle: CSSProperties | undefined = useLightCountdownInner
    ? isRyobi
      ? {
          borderColor: "rgba(0,0,0,0.22)",
          background: "linear-gradient(165deg, #f5ff8a 0%, #e8ff2e 38%, #e0ff00 72%, #c8eb00 100%)",
          boxShadow:
            "0 5px 20px rgba(224,255,0,0.35), 0 1px 0 rgba(255,255,255,0.7) inset, inset 0 -2px 8px rgba(80,100,10,0.14)",
        }
      : isDewalt
        ? {
            borderColor: "rgba(120,70,0,0.28)",
            background: "linear-gradient(165deg, #fffef6 0%, #ffe894 45%, #ffd24a 100%)",
            boxShadow:
              "0 5px 18px rgba(130,80,0,0.18), 0 1px 0 rgba(255,255,255,0.75) inset, inset 0 -2px 6px rgba(180,120,0,0.14)",
          }
        : {
            borderColor: `${lpTheme.primaryDark}55`,
            background: "linear-gradient(165deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.88) 100%)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
          }
    : undefined;

  /** Live-draw strip: Ryobi & DeWalt = vibrant gradients (same family as digit tiles), raised highlight — not dark recessed bands. */
  const liveDrawBarStyle: CSSProperties | undefined =
    useLightCountdownInner && !isFrozen
      ? isRyobi
        ? {
            borderColor: "rgba(0,0,0,0.22)",
            background: "linear-gradient(165deg, #f7ff99 0%, #eaff33 35%, #e0ff00 65%, #b8e000 100%)",
            boxShadow:
              "0 6px 24px rgba(224,255,0,0.4), 0 1px 0 rgba(255,255,255,0.8) inset, inset 0 -3px 12px rgba(60,80,0,0.18)",
          }
        : isDewalt
          ? {
              borderColor: "rgba(120,70,0,0.28)",
              background: "linear-gradient(165deg, #fffbeb 0%, #ffe48a 38%, #ffcc33 100%)",
              boxShadow:
                "0 6px 22px rgba(120,70,0,0.14), 0 1px 0 rgba(255,255,255,0.82) inset, inset 0 -3px 10px rgba(180,120,0,0.22)",
            }
          : {
              borderColor: `${lpTheme.primaryDark}60`,
              background: `linear-gradient(180deg, ${lpTheme.primaryDark}cc 0%, ${lpTheme.primary}99 100%)`,
              boxShadow: "inset 0 2px 8px rgba(0,0,0,0.2)",
            }
      : undefined;

  /** Copy on live-draw bar: dark type on bright Ryobi/DeWalt bands; frozen stays light on dark overlay. */
  const liveDrawLabelClass =
    isFrozen ? surfaceMuted : useLightCountdownInner && (isRyobi || isDewalt) ? "text-black/90" : surfaceMuted;
  const liveDrawDateClass =
    isFrozen
      ? surfaceText
      : useLightCountdownInner && (isRyobi || isDewalt)
        ? "text-black font-bold"
        : surfaceText;

  const handleOpenMembership = () => {
    openEntryFlow({ openLocalModal: false });
  };

  const countdownCardInteractiveClass =
    "cursor-pointer select-none outline-none transition-[transform,box-shadow] hover:brightness-[1.02] active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ";

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={`relative ${className}`}
    >
      {shouldShowCountdown ? (
        <div
          role="button"
          tabIndex={0}
          aria-label={`Enter now — ${drawTitle}, countdown to live draw`}
          className={`relative overflow-hidden rounded-xl border-2 shadow-xl dark:shadow-black/40 sm:rounded-2xl sm:shadow-2xl ${countdownCardInteractiveClass} ${useLightCountdownInner ? "focus-visible:ring-black/40" : "focus-visible:ring-white/60"}`}
          style={{
            ...accentBorderStyle,
            boxShadow: `0 14px 36px -10px rgba(0,0,0,0.32), 0 0 0 1px ${lpTheme.borderRgba}`,
          }}
          onClick={handleOpenMembership}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleOpenMembership();
            }
          }}
        >
          {/* Brand gradient from prize slug (Milwaukee = Tools Australia red, DeWalt/Makita/Ryobi = package theme) */}
          <div
            className="absolute inset-0 opacity-[0.97] dark:opacity-100"
            style={{
              background: isFrozen
                ? "linear-gradient(135deg, #171717 0%, #262626 45%, #171717 100%)"
                : lpTheme.gradientSolid,
            }}
          />

          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent dark:via-white/5"
            animate={{ x: ["-200%", "200%"] }}
            transition={{ duration: 3, repeat: Infinity, repeatDelay: 2, ease: "easeInOut" }}
          />

          <div
            className="absolute inset-0 opacity-[0.12] dark:opacity-[0.08]"
            style={{
              backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
              backgroundSize: "24px 24px",
              color: isFrozen ? "#ffffff" : lpTheme.primary,
            }}
          />

          <div className="relative z-10 px-2.5 py-3 sm:px-4 sm:py-4">
            <AnimatePresence>
              {isFrozen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-2 sm:mb-3"
                >
                  <div className="rounded-lg border border-white/20 bg-black/35 p-2 backdrop-blur-md sm:rounded-xl sm:p-3">
                    <div className="text-center">
                      <div className={`text-[11px] font-bold uppercase tracking-wider sm:text-xs ${surfaceText}`}>
                        Entry period closed
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mb-2 text-center sm:mb-3">
              <h3
                className={`font-agency text-sm font-[950] uppercase leading-tight tracking-wide sm:text-xl lg:text-2xl ${surfaceText} drop-shadow-sm ${useLightCountdownInner ? "[text-shadow:0_1px_0_rgba(255,255,255,0.6)]" : ""}`}
              >
                {drawTitle}
              </h3>
            </div>

            <div className="mb-2 grid grid-cols-4 gap-1.5 sm:mb-3 sm:gap-2 lg:gap-2.5">
              {(
                [
                  { label: "Days", value: timeLeft.days },
                  { label: "Hours", value: timeLeft.hours },
                  { label: "Mins", value: timeLeft.minutes },
                  { label: "Secs", value: timeLeft.seconds },
                ] as const
              ).map((unit, index) => (
                <motion.div
                  key={unit.label}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.1, duration: 0.4 }}
                  className="relative group"
                >
                  <div
                    className={`absolute -inset-0.5 rounded-xl opacity-0 blur-md transition-opacity duration-300 group-hover:opacity-100 sm:rounded-2xl ${useLightCountdownInner ? "bg-black/10" : ""}`}
                    style={useLightCountdownInner ? undefined : { backgroundColor: lpTheme.borderRgba }}
                  />

                  <div
                    className={`relative overflow-hidden rounded-lg border-2 p-1.5 sm:rounded-xl sm:p-2.5 lg:p-3 ${
                      useLightCountdownInner ? "" : "backdrop-blur-md bg-black/35 shadow-xl dark:bg-black/45"
                    }`}
                    style={useLightCountdownInner ? lightTileSurfaceStyle : accentBorderStyle}
                  >
                    <div
                      className={`absolute inset-0 bg-gradient-to-br to-transparent ${
                        useLightCountdownInner
                          ? isRyobi
                            ? "from-white/45 via-transparent to-lime-400/10"
                            : isDewalt
                              ? "from-white/55 via-transparent to-amber-200/15"
                              : "from-white/80 via-white/25 dark:from-white/70 dark:via-white/15"
                          : "from-white/10 via-transparent dark:from-white/5"
                      }`}
                    />

                    {unit.label === "Secs" && (
                      <motion.div
                        className={`absolute inset-0 ${useLightCountdownInner ? "bg-black/[0.06]" : "bg-white/5"}`}
                        animate={{ opacity: [0, useLightCountdownInner ? 0.35 : 0.25, 0] }}
                        transition={{ duration: 1, repeat: Infinity }}
                      />
                    )}

                    <div className="relative z-10">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={unit.value}
                          initial={{ rotateX: -90, opacity: 0 }}
                          animate={{ rotateX: 0, opacity: 1 }}
                          exit={{ rotateX: 90, opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className={`mb-0.5 font-['Poppins'] text-xl font-bold tabular-nums sm:text-2xl lg:text-4xl ${surfaceText}`}
                        >
                          {String(unit.value).padStart(2, "0")}
                        </motion.div>
                      </AnimatePresence>

                      <div className={`text-[8px] font-bold uppercase tracking-wider sm:text-[10px] lg:text-xs ${surfaceMuted}`}>
                        {unit.label}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.4 }}
              className={`rounded-lg border-2 px-2.5 py-2 sm:rounded-full sm:px-4 sm:py-2 ${
                isFrozen
                  ? "bg-black/35 backdrop-blur-md dark:bg-black/45"
                  : useLightCountdownInner
                    ? ""
                    : "bg-black/30 backdrop-blur-md dark:bg-black/40"
              }`}
              style={
                isFrozen
                  ? accentBorderStyle
                  : useLightCountdownInner && liveDrawBarStyle
                    ? liveDrawBarStyle
                    : accentBorderStyle
              }
            >
              <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-center leading-snug">
                <span className={`text-[9px] font-semibold uppercase tracking-wider sm:text-[11px] lg:text-xs ${liveDrawLabelClass}`}>
                  Live draw
                </span>
                <span className={`hidden sm:inline ${liveDrawLabelClass}`}>·</span>
                <span className={`text-[11px] sm:text-xs lg:text-sm ${liveDrawDateClass}`}>{drawDateLabel}</span>
              </div>
            </motion.div>

            {daysUntilDraw !== null && daysUntilDraw < 1 && !isFrozen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
                className="mt-2 sm:mt-3"
              >

              </motion.div>
            )}
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-label={`Enter now — ${drawTitle}, ${drawDateLabel}`}
          className={`relative overflow-hidden rounded-xl border-2 border-neutral-300 bg-gradient-to-br from-neutral-100 via-white to-neutral-100 shadow-lg dark:border-neutral-600 dark:from-neutral-900 dark:via-neutral-950 dark:to-neutral-900 dark:shadow-black/50 sm:rounded-2xl sm:shadow-2xl ${countdownCardInteractiveClass} focus-visible:ring-neutral-500`}
          style={{ boxShadow: `0 0 0 1px ${lpTheme.borderRgba}33, 0 14px 36px -10px rgba(0,0,0,0.22)` }}
          onClick={handleOpenMembership}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleOpenMembership();
            }
          }}
        >
          <div
            className="absolute inset-x-0 top-0 h-1 opacity-90 dark:opacity-80"
            style={{ background: lpTheme.gradientSolid }}
          />

          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-black/[0.03] to-transparent dark:via-white/[0.04]"
            animate={{ x: ["-100%", "100%"] }}
            transition={{ duration: 4, repeat: Infinity, repeatDelay: 3, ease: "easeInOut" }}
          />

          <div className="relative z-10 px-3 py-3 text-center sm:px-5 sm:py-4">
            <p className="font-agency text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-600 dark:text-neutral-300 sm:text-xs">
              {drawTitle}
            </p>
            <p className="mt-1.5 font-agency text-base font-bold text-neutral-900 dark:text-white sm:text-xl lg:text-2xl">
              {drawDateLabel}
            </p>
           

            {(isQueued || isCompleted) && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white/80 px-2.5 py-1 dark:border-neutral-600 dark:bg-neutral-800/80 sm:mt-2.5 sm:px-3 sm:py-1.5"
              >
                <div
                  className="h-2 w-2 animate-pulse rounded-full"
                  style={{ backgroundColor: lpTheme.primary }}
                />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-300 sm:text-xs">
                  {isCompleted ? "Draw completed" : "Next draw coming soon"}
                </span>
              </motion.div>
            )}
          </div>
        </div>
      )}

      <div className={`${cornerAccentClass} -left-1 -top-1 rounded-tl-2xl border-l-2 border-t-2`} style={accentBorderStyle} />
      <div className={`${cornerAccentClass} -right-1 -top-1 rounded-tr-2xl border-r-2 border-t-2`} style={accentBorderStyle} />
      <div className={`${cornerAccentClass} -bottom-1 -left-1 rounded-bl-2xl border-b-2 border-l-2`} style={accentBorderStyle} />
      <div className={`${cornerAccentClass} -bottom-1 -right-1 rounded-br-2xl border-b-2 border-r-2`} style={accentBorderStyle} />
    </motion.div>
  );
}
