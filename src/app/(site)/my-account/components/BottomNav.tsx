"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Gift, Ticket, CreditCard, MessageCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/utils/cn";

export interface DashboardNavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Raised center FAB (Draws) in the mobile bottom nav. */
  center?: boolean;
}

/** Shared dashboard navigation model — consumed by BottomNav (mobile) + DeskNav (desktop). */
export const DASHBOARD_NAV: DashboardNavItem[] = [
  { id: "overview", label: "Dashboard", href: "/my-account", icon: LayoutDashboard },
  { id: "rewards", label: "Rewards", href: "/my-account/benefits", icon: Gift },
  { id: "draws", label: "Draws", href: "/my-account/draws", icon: Ticket, center: true },
  { id: "account-membership", label: "Membership", href: "/my-account/membership", icon: CreditCard },
  { id: "support", label: "Support", href: "/my-account/support", icon: MessageCircle },
];

/** Exact match for the dashboard home, prefix match for every sub-route. */
export function isNavItemActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/my-account") return pathname === "/my-account" || pathname === "/my-account/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 w-full max-w-[100vw] border-t border-token bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="Dashboard"
    >
      <div className="grid grid-cols-5 items-end">
        {DASHBOARD_NAV.map((item) => {
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

          return (
            <Link
              key={item.id}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-1 py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600",
                active ? "text-red-600 dark:text-red-500" : "text-muted-token hover:text-primary-token",
              )}
            >
              <Icon className="h-6 w-6" strokeWidth={active ? 2.2 : 1.9} />
              <span className="text-[11px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
