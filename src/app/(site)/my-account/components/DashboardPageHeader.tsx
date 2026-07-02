"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, type LucideIcon } from "lucide-react";
import type { DashboardStateTheme } from "@/utils/dashboard/dashboard-state-theme";

interface DashboardPageHeaderProps {
  title: string;
  sub?: string;
  icon?: LucideIcon;
  /** Account-state theme for the recolored band (from useDashboardState). */
  stateTheme: DashboardStateTheme;
  /** Show a back chevron. Routes to the dashboard home unless `onBack` is given. */
  showBack?: boolean;
  /** Custom back handler (overrides the default /my-account route). */
  onBack?: () => void;
}

/**
 * Colored, state-recolored page-header band for the dashboard sub-pages
 * (Rewards / Membership / Settings). Ported from the prototype `PageHeader`:
 * gradient background + gold seam + diagonal glow + title/sub + action icon.
 */
export default function DashboardPageHeader({
  title,
  sub,
  icon: Icon,
  stateTheme,
  showBack = false,
  onBack,
}: DashboardPageHeaderProps) {
  const router = useRouter();
  return (
    <section
      className="relative overflow-hidden rounded-b-3xl px-5 pb-6 pt-6 sm:px-6 sm:pt-8"
      style={{ background: stateTheme.gradient, color: stateTheme.ink }}
    >
      <span className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-[#d4af37] to-transparent" />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full opacity-30"
        style={{ background: `radial-gradient(circle, ${stateTheme.accent}, transparent 70%)` }}
      />

      <div className="relative flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {showBack && (
            <button
              type="button"
              onClick={() => (onBack ? onBack() : router.push("/my-account"))}
              aria-label="Back"
              className="-ml-1 grid h-9 w-9 place-items-center rounded-full bg-white/15 transition-colors hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <div>
            {sub && <div className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.12em] opacity-80 sm:text-[11px] sm:tracking-[0.18em]">{sub}</div>}
            <h1 className="font-['Poppins'] text-2xl font-extrabold leading-tight">{title}</h1>
          </div>
        </div>
        {Icon && (
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/15">
            <Icon className="h-5 w-5" />
          </span>
        )}
      </div>
    </section>
  );
}
