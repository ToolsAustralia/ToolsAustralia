"use client";

import { usePromoTheme, usePromoThemeStore } from "@/stores/usePromoThemeStore";
import { cn } from "@/utils/cn";

type RibbonPlacement = "topLeft" | "overlayCenter";

export type CompletedDrawRibbonKind = "major" | "mini";

interface CompletedDrawRibbonProps {
  className?: string;
  /** `topLeft` = horizontal ribbon from top-left (expands with text). `overlayCenter` = centered banner. */
  placement?: RibbonPlacement;
  /** Ribbon label (shown uppercase via styles): major vs mini draw. */
  kind?: CompletedDrawRibbonKind;
}

/**
 * Draw-type ribbon — promo theme gradient, no chromatic distortion.
 */
export default function CompletedDrawRibbon({
  className = "",
  placement = "topLeft",
  kind = "major",
}: CompletedDrawRibbonProps) {
  const theme = usePromoTheme();
  const ribbonLabel = kind === "mini" ? "Mini draw" : "Major draw";
  const slug = usePromoThemeStore((s) => s.slug);
  const preferDark = theme.preferDarkBackground ?? false;
  const isDewaltSlug = (slug ?? "").toLowerCase().startsWith("dewalt-");
  const useDarkText = preferDark || isDewaltSlug;

  const labelClass = `font-poppins font-black uppercase leading-none tracking-[0.08em] ${
    useDarkText ? "text-black" : "text-white"
  }`;

  const baseShadow = useDarkText ? "none" : "0 1px 1px rgba(0,0,0,0.35)";
  const barStyle = {
    background: theme.gradientSolid,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), 0 3px 10px rgba(0,0,0,0.2)",
  } as const;

  if (placement === "topLeft") {
    return (
      <div
        role="status"
        aria-label={kind === "mini" ? "Mini draw" : "Major draw"}
        className={cn("pointer-events-none absolute left-0 top-0 z-20 w-max max-w-[min(100%,calc(100%-0.5rem))] select-none shadow-md", className)}
        style={{
          ...barStyle,
          clipPath: "polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)",
        }}
      >
        <span
          className={cn(labelClass, "block whitespace-nowrap px-3 py-2 text-[0.55rem] tracking-[0.1em] sm:px-4 sm:py-2.5 sm:text-[0.65rem] sm:tracking-[0.14em]")}
          style={{ textShadow: baseShadow }}
        >
          {ribbonLabel}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn("pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center px-3 pt-2 sm:px-4 sm:pt-3", className)}
    >
      <div
        role="status"
        aria-label={kind === "mini" ? "Mini draw" : "Major draw"}
        className={cn("relative isolate flex max-w-[calc(100%-1.5rem)] items-center justify-center whitespace-nowrap rounded-t-md px-9 py-2", labelClass, "text-xs shadow-md sm:max-w-[min(100%,20rem)] sm:px-11 sm:py-2.5 sm:text-sm sm:tracking-[0.12em]")}
        style={{
          ...barStyle,
          clipPath: "polygon(4% 0%, 96% 0%, 100% 100%, 50% 88%, 0% 100%)",
          textShadow: baseShadow,
        }}
      >
        <span
          className="pointer-events-none absolute -left-1 bottom-0 top-0 z-0 w-2 opacity-40 sm:-left-1.5 sm:w-2.5"
          style={{
            background: `linear-gradient(90deg, ${theme.primaryDark}cc, transparent)`,
            clipPath: "polygon(100% 0%, 100% 100%, 0% 100%)",
          }}
          aria-hidden
        />
        <span
          className="pointer-events-none absolute -right-1 bottom-0 top-0 z-0 w-2 opacity-40 sm:-right-1.5 sm:w-2.5"
          style={{
            background: `linear-gradient(270deg, ${theme.primaryDark}cc, transparent)`,
            clipPath: "polygon(0% 0%, 100% 100%, 0% 100%)",
          }}
          aria-hidden
        />
        <span className="relative z-10">{ribbonLabel}</span>
      </div>
    </div>
  );
}
