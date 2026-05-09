"use client";

import Image from "next/image";
import { ExternalLink } from "lucide-react";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import CompletedDrawRibbon from "@/components/ui/CompletedDrawRibbon";
import { cn } from "@/utils/cn";

function getContrastText(hex: string) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.62 ? "#111827" : "#ffffff";
}

const surfaceClass = "bg-[#f7f4ee] dark:bg-slate-950/85";

export interface UnifiedCompletedDrawCardProps {
  articleId: string;
  displayName: string;
  descriptionHtml: string;
  imageSrc: string | null;
  drawResultUrl?: string | null;
  imagePriority?: boolean;
}

/** Completed major draw — landscape-friendly image + HTML description (clamped preview). */
export default function UnifiedCompletedDrawCard({
  articleId,
  displayName,
  descriptionHtml,
  imageSrc,
  drawResultUrl,
  imagePriority = false,
}: UnifiedCompletedDrawCardProps) {
  const theme = usePromoTheme();
  const accentBarColor = theme.primaryDark;
  const btnPrimaryStyle = {
    background: accentBarColor,
    color: getContrastText(accentBarColor),
  } as const;

  return (
    <article
      id={articleId}
      className="overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-slate-900/40 dark:shadow-[0_8px_30px_rgba(0,0,0,0.25)] sm:rounded-3xl"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 lg:items-center lg:gap-0">
        <div className="relative order-1 w-full self-start">
          {imageSrc ? (
            <div className="relative w-full overflow-hidden bg-slate-100 dark:bg-slate-900/95">
              <CompletedDrawRibbon kind="major" placement="topLeft" />
              <Image
                src={imageSrc}
                alt={displayName}
                width={1920}
                height={1080}
                className="h-auto w-full object-contain object-center"
                sizes="(max-width: 1024px) 100vw, 50vw"
                priority={imagePriority}
              />
            </div>
          ) : (
            <div
              className="relative flex min-h-[240px] w-full items-center justify-center text-5xl sm:min-h-[280px] sm:text-6xl"
              style={{
                background: `linear-gradient(145deg, ${theme.primaryLight}24, ${theme.primary}18)`,
              }}
            >
              <CompletedDrawRibbon kind="major" placement="topLeft" />
              🎁
            </div>
          )}
        </div>

        <div
          className={cn("order-2 flex flex-col justify-center gap-5 px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-8", surfaceClass)}
        >
          <div>
            <h3
              className="font-['Poppins'] text-xl font-bold leading-snug tracking-tight sm:text-2xl lg:text-[1.65rem]"
              style={{ color: accentBarColor }}
            >
              {displayName}
            </h3>
            {descriptionHtml ? (
              <div
                className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:text-base [&_p]:my-0 [&_p+p]:mt-3 line-clamp-5 sm:line-clamp-6 [&_*:first-child]:mt-0"
                dangerouslySetInnerHTML={{ __html: descriptionHtml }}
              />
            ) : null}
          </div>

          {drawResultUrl ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a
                href={drawResultUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center justify-center px-6 py-2.5 text-center text-xs font-bold uppercase tracking-wide transition-opacity hover:opacity-92 sm:min-w-[10rem]"
                style={btnPrimaryStyle}
              >
                View draw result
                <ExternalLink className="ml-2 h-4 w-4 opacity-90" />
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
