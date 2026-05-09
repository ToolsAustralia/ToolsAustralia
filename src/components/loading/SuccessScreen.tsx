"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Check, Gift, Star, Zap, Ticket, Tag, ShieldCheck } from "lucide-react";
import { Z_INDEX } from "@/constants/z-index";

interface Benefit {
  text: string;
  icon?: "gift" | "star" | "zap" | "ticket" | "tag";
  highlight?: boolean;
}

interface SuccessScreenProps {
  title: string;
  subtitle: string;
  benefits: Benefit[];
  isVisible?: boolean;
  autoCloseDelay?: number;
  onAutoClose?: () => void;
}

const SuccessScreen: React.FC<SuccessScreenProps> = ({
  title,
  subtitle,
  benefits,
  isVisible = true,
  autoCloseDelay = 4500,
  onAutoClose,
}) => {
  const [progress, setProgress] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const normalizeForComparison = useCallback((value: string) => {
    return value
      .toLowerCase()
      .replace(/successfully/g, "")
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }, []);

  const visibleBenefits = useMemo(() => {
    const subtitleKey = normalizeForComparison(subtitle);
    const titleKey = normalizeForComparison(title);

    const seen = new Set<string>();
    return benefits.filter((benefit) => {
      const key = normalizeForComparison(benefit.text);
      if (!key) return false;
      if (key === subtitleKey || key === titleKey) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [benefits, normalizeForComparison, subtitle, title]);

  const sparkles = useMemo(
    () =>
      Array.from({ length: 16 }).map((_, index) => ({
        id: index,
        left: 6 + Math.random() * 88,
        top: 8 + Math.random() * 84,
        size: 4 + Math.random() * 8,
        hue: 120 + Math.random() * 80,
        duration: 1.8 + Math.random() * 2.4,
        delay: Math.random() * 1.8,
        drift: 14 + Math.random() * 20,
      })),
    [],
  );

  useEffect(() => {
    if (!isVisible) {
      setProgress(0);
      setDismissed(false);
      return;
    }

    if (autoCloseDelay <= 0 || !onAutoClose) return;

    const interval = 50;
    const step = (interval / autoCloseDelay) * 100;
    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev + step;
        if (next >= 100) {
          clearInterval(timer);
          return 100;
        }
        return next;
      });
    }, interval);

    const closeTimer = setTimeout(() => {
      onAutoClose();
    }, autoCloseDelay);

    return () => {
      clearInterval(timer);
      clearTimeout(closeTimer);
    };
  }, [autoCloseDelay, onAutoClose, isVisible]);

  const handleDismiss = useCallback(() => {
    if (dismissed) return;
    setDismissed(true);
    onAutoClose?.();
  }, [dismissed, onAutoClose]);

  const getIcon = (iconType?: string) => {
    const cls = "w-3.5 h-3.5 sm:w-4 sm:h-4";
    switch (iconType) {
      case "gift":
        return <Gift className={cls} />;
      case "star":
        return <Star className={cls} />;
      case "zap":
        return <Zap className={cls} />;
      case "ticket":
        return <Ticket className={cls} />;
      case "tag":
        return <Tag className={cls} />;
      default:
        return <Gift className={cls} />;
    }
  };

  if (!isVisible) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-3 sm:p-4 cursor-pointer"
      style={{ zIndex: Z_INDEX.TOAST_LOADING }}
      onClick={handleDismiss}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/85 animate-in fade-in duration-300" />

      {/* Sparkle particles (CSS-only) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {sparkles.map((sparkle) => (
          <div
            key={sparkle.id}
            className="absolute rounded-full animate-sparkle"
            style={{
              width: sparkle.size,
              height: sparkle.size,
              left: `${sparkle.left}%`,
              top: `${sparkle.top}%`,
              background: `hsl(${sparkle.hue}, 92%, 74%)`,
              ["--drift" as string]: `${sparkle.drift}px`,
              animationDuration: `${sparkle.duration}s`,
              animationDelay: `${sparkle.delay}s`,
              opacity: 0,
              boxShadow: "0 0 14px rgba(52, 211, 153, 0.5)",
            }}
          />
        ))}
      </div>

      {/* Card */}
      <div
        className="relative mx-auto w-full max-w-sm overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-[0_30px_80px_-18px_rgba(16,185,129,0.45)] animate-in zoom-in-90 slide-in-from-bottom-4 duration-500 dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-[0_30px_80px_-18px_rgba(16,185,129,0.2)] sm:max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top accent gradient */}
        <div className="h-1.5 bg-gradient-to-r from-emerald-400 via-green-500 to-teal-500" />
        <div className="pointer-events-none absolute -right-14 -top-14 h-36 w-36 rounded-full bg-emerald-100 blur-2xl dark:bg-emerald-500/15" />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-28 w-28 rounded-full bg-teal-100 blur-2xl dark:bg-teal-500/15" />

        <div className="relative p-5 sm:p-8">
          {/* Status strip — typographic / editorial, not pill buttons */}
          <div className="mb-6 flex items-center justify-between gap-4 border-b border-gray-100/90 pb-4 dark:border-neutral-800 sm:mb-7 sm:pb-5">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className="h-9 w-0.5 shrink-0 rounded-full bg-gradient-to-b from-emerald-400 via-emerald-500 to-teal-500 shadow-[0_0_12px_rgba(52,211,153,0.35)] dark:shadow-[0_0_14px_rgba(52,211,153,0.2)] sm:h-10"
                aria-hidden
              />
              <p className="min-w-0 text-2xs font-semibold uppercase tracking-[0.2em] text-emerald-800 dark:text-emerald-300/95 sm:text-2xs">
                Transaction complete
              </p>
            </div>
            <div
              className="flex shrink-0 flex-col items-end gap-0.5 text-right"
              title="Processed over a secure connection"
            >
              <div className="flex items-center gap-1.5 text-gray-600 dark:text-neutral-400">
                <ShieldCheck
                  className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400/90"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <span className="text-2xs font-medium tracking-wide sm:text-xs">Secure</span>
              </div>
              <span className="text-3xs font-normal tracking-wide text-gray-400 dark:text-neutral-600 sm:text-2xs">
                Encrypted
              </span>
            </div>
          </div>

          {/* Checkmark */}
          <div className="mb-5 sm:mb-6 flex justify-center">
            <div className="relative">
              <div className="absolute -inset-2 rounded-full border-2 border-emerald-200/70 dark:border-emerald-400/35" />
              <div
                className="absolute inset-0 rounded-full bg-emerald-400/20 animate-ping"
                style={{ animationDuration: "2.2s" }}
              />
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-emerald-500 to-green-600 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/30 animate-in zoom-in-50 duration-700 delay-150">
                <Check className="w-8 h-8 sm:w-10 sm:h-10 text-white stroke-[3] animate-in fade-in zoom-in-75 duration-400 delay-500" />
              </div>
            </div>
          </div>

          {/* Title */}
          <h2 className="mb-1.5 text-center text-xl font-bold tracking-tight text-gray-900 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300 dark:text-neutral-100 sm:mb-2 sm:text-2xl">
            {title}
          </h2>
          <p className="mb-5 animate-in fade-in slide-in-from-bottom-2 text-center text-sm text-gray-500 delay-400 duration-500 dark:text-neutral-400 sm:mb-6 sm:text-base">
            {subtitle}
          </p>

          {/* Benefits */}
          {visibleBenefits.length > 0 && (
            <div className="space-y-2 sm:space-y-2.5 mb-5 sm:mb-6">
              {visibleBenefits.map((benefit, index) => (
                <div
                  key={index}
                  className={`flex items-center gap-2.5 sm:gap-3 rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 animate-in slide-in-from-left-4 fade-in duration-500 shadow-sm ${
                    benefit.highlight
                      ? "border border-amber-200/70 bg-gradient-to-r from-amber-50 via-yellow-50 to-orange-50 dark:border-amber-500/35 dark:from-amber-950/55 dark:via-yellow-950/45 dark:to-orange-950/55"
                      : "border border-emerald-200/70 bg-gradient-to-r from-emerald-50 via-green-50 to-teal-50 dark:border-emerald-500/35 dark:from-emerald-950/55 dark:via-green-950/45 dark:to-teal-950/55"
                  }`}
                  style={{ animationDelay: `${index * 100 + 600}ms`, animationFillMode: "both" }}
                >
                  <div
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      benefit.highlight
                        ? "bg-gradient-to-br from-amber-500 to-yellow-600 text-white shadow-sm shadow-amber-500/25"
                        : "bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-sm shadow-emerald-500/25"
                    }`}
                  >
                    {getIcon(benefit.icon)}
                  </div>
                  <span
                    className={`font-medium text-xs sm:text-sm ${
                      benefit.highlight
                        ? "text-amber-900 dark:text-amber-100"
                        : "text-emerald-900 dark:text-emerald-100"
                    }`}
                  >
                    {benefit.text}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Dismiss hint */}
          <div
            className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-center text-2xs text-gray-500 animate-in fade-in duration-500 delay-1000 dark:border-neutral-700 dark:bg-neutral-800/90 dark:text-neutral-400 sm:text-xs"
            style={{ animationFillMode: "both" }}
          >
            Tap anywhere to dismiss
          </div>
        </div>

        {/* Progress bar */}
        {autoCloseDelay > 0 && (
          <div className="h-1.5 bg-gray-100 dark:bg-neutral-800">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 via-green-500 to-teal-500 transition-[width] duration-100 ease-linear"
              style={{ width: `${100 - progress}%` }}
            />
          </div>
        )}
      </div>

    </div>
  );
};

export default SuccessScreen;
