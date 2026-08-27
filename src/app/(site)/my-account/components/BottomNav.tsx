"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Gift, Ticket, CreditCard, MessageCircle, Package, ShoppingBag, type LucideIcon } from "lucide-react";
import { cn } from "@/utils/cn";
import { useDashboardSheetStore } from "@/stores/useDashboardSheetStore";
import { usePartnerCatalogueSpotlight, SpotlightDot, rewardsTabPulseKey } from "./PartnerCatalogueSpotlight";

export interface DashboardNavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Raised center FAB (Draws) in the mobile bottom nav. */
  center?: boolean;
  /**
   * Shown in the desktop sidebar only. The mobile bottom bar is a fixed five-item
   * layout built around a raised centre item — a sixth entry does not fit, and
   * squeezing one in degrades every other target. Secondary destinations follow the
   * same pattern Settings already does: sidebar entry on desktop, a direct link
   * from the dashboard on mobile.
   */
  desktopOnly?: boolean;
}

/** Shared dashboard navigation model — consumed by BottomNav (mobile) + DeskNav (desktop). */
export const DASHBOARD_NAV: DashboardNavItem[] = [
  { id: "overview", label: "Dashboard", href: "/my-account", icon: LayoutDashboard },
  { id: "rewards", label: "Rewards", href: "/my-account/rewards", icon: Gift },
  { id: "draws", label: "Draws", href: "/my-account/draws", icon: Ticket, center: true },
  { id: "account-membership", label: "Membership", href: "/my-account/membership", icon: CreditCard },
  { id: "support", label: "Support", href: "/my-account/support", icon: MessageCircle },
  { id: "orders", label: "Orders", href: "/my-account/orders", icon: Package, desktopOnly: true },
  // The only item that leaves /my-account, and deliberately so: a member had no route
  // to the shop from the dashboard at all. `isNavItemActive` prefix-matches, and no
  // dashboard route begins with /shop, so this never renders as the active tab.
  { id: "shop", label: "Shop", href: "/shop", icon: ShoppingBag, desktopOnly: true },
];

/** Exact match for the dashboard home, prefix match for every sub-route. */
export function isNavItemActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/my-account") return pathname === "/my-account" || pathname === "/my-account/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function BottomNav() {
  const pathname = usePathname();
  const openSheet = useDashboardSheetStore((s) => s.openSheet);
  const spotlight = usePartnerCatalogueSpotlight();
  // Changes on every dashboard navigation away from Rewards — remounts the icon wrapper so
  // the CSS pulse replays. Null while on Rewards. See rewardsTabPulseKey.
  const pulseKey = rewardsTabPulseKey(pathname);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 w-full max-w-[100vw] border-t border-token bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="Dashboard"
    >
      <div className="grid grid-cols-5 items-end">
        {DASHBOARD_NAV.filter((item) => !item.desktopOnly).map((item) => {
          const Icon = item.icon;
          const active = isNavItemActive(pathname, item.href);

          if (item.center) {
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className="flex min-h-16 flex-col items-center justify-end gap-1 pb-1.5 focus:outline-none"
              >
                <span
                  className={cn(
                    "-mt-5 grid h-14 w-14 place-items-center rounded-full text-white shadow-lg ring-4 ring-surface transition-transform",
                    "bg-gradient-to-b from-red-500 to-red-700",
                    "focus-visible:ring-2 focus-visible:ring-red-600 motion-safe:active:translate-y-px",
                    active && "from-red-600 to-red-800",
                  )}
                >
                  <Icon className="h-6 w-6" strokeWidth={2.2} />
                </span>
                <span className={cn("text-[11px] font-medium", active ? "text-red-600 dark:text-red-500" : "text-muted-token")}>
                  {item.label}
                </span>
              </Link>
            );
          }

          const itemClass = cn(
            "flex min-h-16 flex-col items-center justify-center gap-1 py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600",
            active ? "text-red-600 dark:text-red-500" : "text-muted-token hover:text-primary-token",
          );
          // "Something new lives in here" — the partner catalogue is reached from inside
          // Rewards, so without a cue on the tab most members never discover it. TWO cues,
          // with different lifetimes on purpose: the dot is a one-time "NEW" marker that
          // retires once the member has looked, while the halo re-pulses on every arrival
          // because the tab stays worth pointing at long after it stops being new.
          const isRewards = item.id === "rewards";
          const showSpotlight = isRewards && spotlight.show;
          const pulse = isRewards && pulseKey ? pulseKey : null;
          const itemInner = (
            <>
              <span
                key={pulse ?? undefined}
                className={cn("relative", pulse && "ta-nudge-attention rounded-full")}
              >
                <Icon className="h-6 w-6" strokeWidth={active ? 2.2 : 1.9} />
                {showSpotlight && <SpotlightDot pulsing={spotlight.pulsing} className="pointer-events-none absolute -right-1 -top-0.5" />}
              </span>
              <span className="text-[11px] font-medium">{item.label}</span>
            </>
          );

          // Support opens an overlay sheet (prototype behavior), not a route.
          if (item.id === "support") {
            return (
              <button key={item.id} type="button" onClick={() => openSheet("support")} aria-label={item.label} className={itemClass}>
                {itemInner}
              </button>
            );
          }

          return (
            <Link key={item.id} href={item.href} aria-label={item.label} aria-current={active ? "page" : undefined} className={itemClass}>
              {itemInner}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
