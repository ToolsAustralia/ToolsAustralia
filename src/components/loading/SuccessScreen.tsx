"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Check, Gift, Star, Zap, Ticket, Tag } from "lucide-react";
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
            className="absolute rounded-full"
            style={{
              width: sparkle.size,
              height: sparkle.size,
              left: `${sparkle.left}%`,
              top: `${sparkle.top}%`,
              background: `hsl(${sparkle.hue}, 92%, 74%)`,
              animation: `sparkle ${sparkle.duration}s ease-in-out ${sparkle.delay}s infinite`,
              ["--drift" as string]: `${sparkle.drift}px`,
              opacity: 0,
              boxShadow: "0 0 14px rgba(52, 211, 153, 0.5)",
            }}
          />
        ))}
      </div>

      {/* Card */}
      <div
        className="relative w-full max-w-sm sm:max-w-md mx-auto overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-[0_30px_80px_-18px_rgba(16,185,129,0.45)] animate-in zoom-in-90 slide-in-from-bottom-4 duration-500"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top accent gradient */}
        <div className="h-1.5 bg-gradient-to-r from-emerald-400 via-green-500 to-teal-500" />
        <div className="pointer-events-none absolute -right-14 -top-14 h-36 w-36 rounded-full bg-emerald-100 blur-2xl" />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-28 w-28 rounded-full bg-teal-100 blur-2xl" />

        <div className="relative p-5 sm:p-8">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700 sm:text-[11px]">
              <Zap className="h-3.5 w-3.5" />
              Transaction complete
            </div>
            <div className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 sm:text-xs">
              Secure
            </div>
          </div>

          {/* Checkmark */}
          <div className="mb-5 sm:mb-6 flex justify-center">
            <div className="relative">
              <div className="absolute -inset-2 rounded-full border-2 border-emerald-200/70" />
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
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1.5 sm:mb-2 tracking-tight animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300 text-center">
            {title}
          </h2>
          <p className="text-sm sm:text-base text-gray-500 mb-5 sm:mb-6 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-400 text-center">
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
                      ? "bg-gradient-to-r from-amber-50 via-yellow-50 to-orange-50 border border-amber-200/70"
                      : "bg-gradient-to-r from-emerald-50 via-green-50 to-teal-50 border border-emerald-200/70"
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
                      benefit.highlight ? "text-amber-900" : "text-emerald-900"
                    }`}
                  >
                    {benefit.text}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Dismiss hint */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-center text-[10px] sm:text-xs text-gray-500 animate-in fade-in duration-500 delay-1000" style={{ animationFillMode: "both" }}>
            Tap anywhere to dismiss
          </div>
        </div>

        {/* Progress bar */}
        {autoCloseDelay > 0 && (
          <div className="h-1.5 bg-gray-100">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 via-green-500 to-teal-500 transition-[width] duration-100 ease-linear"
              style={{ width: `${100 - progress}%` }}
            />
          </div>
        )}
      </div>

      {/* Sparkle keyframe */}
      <style jsx>{`
        @keyframes sparkle {
          0%,
          100% {
            opacity: 0;
            transform: scale(0) translateY(0);
          }
          50% {
            opacity: 1;
            transform: scale(1) translateY(calc(var(--drift, 20px) * -1));
          }
        }
      `}</style>
    </div>
  );
};

export default SuccessScreen;
