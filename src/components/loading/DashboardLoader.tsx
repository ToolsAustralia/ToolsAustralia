"use client";

import Image from "next/image";
import { cn } from "@/utils/cn";

// Full wordmark, per the Header: light UI uses the default artwork; dark UI uses the
// high-contrast white-text artwork. Two <Image>s swapped by `dark:` visibility so the
// correct mark shows even before hydration (theme class is set by themeBootstrap).
const LOGO_LIGHT = "/images/logo.webp";
const LOGO_DARK = "/images/Tools Australia Logo/White-Text Logo.webp";

interface DashboardLoaderProps {
  /** Optional status line under the mark (e.g. "Loading your account…"). */
  label?: string;
  /** Extra classes on the full-height wrapper (e.g. an admin background override). */
  className?: string;
}

/**
 * Full-height, brand-forward dashboard loader — replaces the old thin red arc
 * spinners across the member / admin / affiliate dashboards. Shows the Tools
 * Australia wordmark (correct artwork per light/dark) with a soft brand glow +
 * breathing pulse over an indeterminate progress sweep. Reduced-motion safe.
 */
export default function DashboardLoader({ label, className }: DashboardLoaderProps) {
  return (
    <div className={cn("flex min-h-screen-svh w-full flex-col items-center justify-center gap-6 bg-page px-6", className)}>
      <div className="relative flex items-center justify-center">
        {/* Soft brand glow behind the mark */}
        <span aria-hidden className="absolute h-28 w-28 rounded-full bg-red-500/20 blur-2xl motion-safe:animate-pulse dark:bg-red-500/25" />
        <div className="relative h-[46px] w-[150px] motion-safe:animate-[ta-loader-breathe_2.4s_ease-in-out_infinite] sm:h-[52px] sm:w-[168px]">
          <Image src={LOGO_LIGHT} alt="Tools Australia" fill sizes="168px" className="object-contain dark:hidden" priority />
          <Image src={LOGO_DARK} alt="Tools Australia" fill sizes="168px" className="hidden object-contain dark:block" priority />
        </div>
      </div>

      {/* Indeterminate progress sweep */}
      <div className="relative h-[3px] w-40 overflow-hidden rounded-full bg-black/[.08] dark:bg-white/[.12]" role="progressbar" aria-label={label ?? "Loading"}>
        <span className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-red-600 to-transparent motion-safe:animate-[ta-loader-sweep_1.25s_ease-in-out_infinite] motion-reduce:w-full motion-reduce:animate-pulse" />
      </div>

      {label && <p className="text-[13px] font-medium text-muted-token">{label}</p>}
    </div>
  );
}
