"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { usePromoPageTracking } from "@/hooks/usePromoPageTracking";
import { PromotionsGuestThemeToggle } from "@/components/ui/ThemeToggle";

/**
 * Wraps promotions layout content.
 *
 * - Dark mode on Ryobi slug pages (pathname-based)
 * - usePromoPageTracking() for visit analytics and attribution storage
 * - Scroll to top when navigating to toolset landing pages so users see the hero
 *
 * @see docs/PROMO_PAGE_ANALYTICS.md
 */
export default function PromotionsLayoutShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  usePromoPageTracking();

  useEffect(() => {
    // Land at the top on EVERY promotions navigation — toolset landings AND evergreen
    // prize pages (e.g. ryobi-milwaukee → hikoki-milwaukee). Next's default scroll-to-top
    // isn't reliable for same-[slug]-segment param changes, so scroll explicitly here in
    // the layout. Keyed on `pathname`, it runs AFTER the new route's DOM commits — so the
    // old content is already gone (no premature snap) and toolbox `?query` changes (which
    // don't change pathname) don't trigger it.
    window.scrollTo(0, 0);
  }, [pathname]);

  const isRyobiPage =
    pathname === "/promotions/ryobi-sidchrome" ||
    pathname === "/promotions/ryobi-milwaukee" ||
    pathname === "/promotions/ryobi";

  return (
    <div className={isRyobiPage ? "dark" : ""}>
      <PromotionsGuestThemeToggle />
      {children}
    </div>
  );
}
