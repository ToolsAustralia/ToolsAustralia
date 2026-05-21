"use client";

import React from "react";
import { Award, Loader2 } from "lucide-react";
import { useCompletedMajorDraws } from "@/hooks/queries/useMajorDrawQueries";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import UnifiedCompletedDrawCard from "./UnifiedCompletedDrawCard";
import { cn } from "@/utils/cn";

function getContrastText(hex: string) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.62 ? "#111827" : "#ffffff";
}

interface CompletedDrawsSectionProps {
  className?: string;
}

const CompletedDrawsSection: React.FC<CompletedDrawsSectionProps> = ({ className = "" }) => {
  const theme = usePromoTheme();
  const badgeText = getContrastText(theme.primary);

  const { data: completedDrawsData, isLoading, error } = useCompletedMajorDraws();

  const completedDraws = completedDrawsData?.draws || [];

  const shellClass = `rounded-2xl border p-6 sm:p-8 dark:bg-slate-900/40 ${className}`;

  if (isLoading) {
    return (
      <section
        className={shellClass}
        style={{ borderColor: theme.borderRgba.replace("0.4)", "0.2)") }}
      >
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <Loader2 className="h-10 w-10 animate-spin" style={{ color: theme.primary }} />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Loading major draw results…</p>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section
        className={shellClass}
        style={{ borderColor: theme.borderRgba.replace("0.4)", "0.2)") }}
      >
        <div className="py-12 text-center">
          <p className="mb-4 text-red-600 dark:text-red-400">{error.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-white transition hover:opacity-95"
            style={{ background: theme.gradient }}
          >
            Try again
          </button>
        </div>
      </section>
    );
  }

  if (completedDraws.length === 0) {
    return (
      <section
        className={shellClass}
        style={{ borderColor: theme.borderRgba.replace("0.4)", "0.2)") }}
      >
        <div className="py-14 text-center">
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl shadow-lg"
            style={{ background: theme.gradient }}
          >
            <Award className="h-8 w-8" style={{ color: badgeText }} />
          </div>
          <h3 className="mb-2 text-xl font-semibold text-slate-900 font-['Poppins'] dark:text-white">
            No completed major draws yet
          </h3>
          <p className="text-slate-600 dark:text-slate-400">Check back soon for results.</p>
        </div>
      </section>
    );
  }

  return (
    <div className={cn("relative", className)}>
      <div className="space-y-8 sm:space-y-10">
        {completedDraws.map((draw, index) => {
          const drawKey = String(draw._id);
          const displayName = (draw.prize?.name && draw.prize.name.trim()) || draw.name;
          const displayDescriptionHtml =
            draw.prize?.description && draw.prize.description.trim()
              ? draw.prize.description
              : draw.description || "";
          const imageSrc = draw.prize?.images?.[0] ?? null;

          return (
            <UnifiedCompletedDrawCard
              key={draw._id}
              articleId={`major-draw-${drawKey}`}
              displayName={displayName}
              descriptionHtml={displayDescriptionHtml}
              imageSrc={imageSrc}
              drawResultUrl={draw.winner?.drawResultUrl ?? null}
              imagePriority={index === 0}
            />
          );
        })}
      </div>
    </div>
  );
};

export default CompletedDrawsSection;
