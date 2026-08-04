"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import { cn } from "@/utils/cn";
import { Monogram } from "@/components/ui/Monogram";
import { formatDisplayName } from "@/utils/display-name";
import { useDashboardSheetStore } from "@/stores/useDashboardSheetStore";
import { DASHBOARD_NAV, isNavItemActive } from "./BottomNav";
import { usePartnerCatalogueSpotlight, SpotlightDot, rewardsTabPulseKey } from "./PartnerCatalogueSpotlight";

interface DeskNavProps {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  /** Owned tier hex for the footer monogram tile. */
  tierHex?: string | null;
}

/** Desktop-only left sidebar (>=lg). Shares the nav model with the mobile bottom nav. */
export default function DeskNav({ firstName, lastName, email, tierHex }: DeskNavProps) {
  const pathname = usePathname();
  const openSheet = useDashboardSheetStore((s) => s.openSheet);
  const spotlight = usePartnerCatalogueSpotlight();
  const pulseKey = rewardsTabPulseKey(pathname);

  return (
    <aside className="sticky top-0 hidden h-screen-svh w-[236px] shrink-0 flex-col border-r border-token bg-surface lg:flex">
      <div className="flex h-[68px] items-center px-5">
        <Link href="/my-account" aria-label="Tools Australia dashboard" className="inline-flex items-center">
          <Image
            src="/images/Tools Australia Logo/Primary Logo.webp"
            alt="Tools Australia"
            width={140}
            height={44}
            className="h-9 w-auto dark:hidden"
          />
          <Image
            src="/images/Tools Australia Logo/White-Text Logo.webp"
            alt="Tools Australia"
            width={140}
            height={44}
            className="hidden h-9 w-auto dark:block"
          />
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2" aria-label="Dashboard">
        {DASHBOARD_NAV.map((item) => {
          const Icon = item.icon;
          const active = isNavItemActive(pathname, item.href);
          const navClass = cn(
            "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600",
            active
              ? "bg-red-600 text-white dark:bg-red-500"
              : "text-muted-token hover:bg-black/[.04] hover:text-primary-token dark:hover:bg-white/[.06]",
          );
          // Matches BottomNav: a one-time dot + "New" pill until the member has seen the
          // catalogue, plus a halo that re-pulses on every arrival and does not retire.
          const isRewards = item.id === "rewards";
          const showSpotlight = isRewards && spotlight.show;
          const pulse = isRewards && pulseKey ? pulseKey : null;
          const inner = (
            <>
              <span
                key={pulse ?? undefined}
                className={cn("relative", pulse && "ta-nudge-attention rounded-full")}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.2 : 1.9} />
                {showSpotlight && <SpotlightDot pulsing={spotlight.pulsing} className="pointer-events-none absolute -right-1 -top-1" />}
              </span>
              {item.label}
              {showSpotlight && (
                <span className="ml-auto rounded-full bg-red-600 px-1.5 py-[1px] text-[9px] font-black uppercase tracking-wide text-white">
                  New
                </span>
              )}
            </>
          );
          // Support opens an overlay sheet (prototype behavior), not a route.
          if (item.id === "support") {
            return (
              <button key={item.id} type="button" onClick={() => openSheet("support")} className={navClass}>
                {inner}
              </button>
            );
          }
          return (
            <Link key={item.id} href={item.href} aria-current={active ? "page" : undefined} className={navClass}>
              {inner}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-token p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <Monogram firstName={firstName} lastName={lastName} tierHex={tierHex ?? "#ee0000"} onBrand size={38} radius={12} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-primary-token dark:text-white">
              {formatDisplayName(firstName, lastName) || "Member"}
            </div>
            {email && <div className="truncate text-xs text-muted-token">{email}</div>}
          </div>
          <Link
            href="/my-account/settings"
            aria-label="Settings"
            className="grid h-9 w-9 place-items-center rounded-lg text-muted-token transition-colors hover:bg-black/[.04] hover:text-primary-token focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:hover:bg-white/[.06]"
          >
            <Settings className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </aside>
  );
}
