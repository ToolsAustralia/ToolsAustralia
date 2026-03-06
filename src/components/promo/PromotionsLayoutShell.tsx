"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { usePromoPageTracking } from "@/hooks/usePromoPageTracking";
import { isToolsetLandingSlug } from "@/config/promo-landing-slugs";

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

  const slug = pathname?.replace(/^\/promotions\/?/, "") || "";
  const isToolsetPage = isToolsetLandingSlug(slug);

  useEffect(() => {
    if (isToolsetPage) {
      window.scrollTo(0, 0);
    }
  }, [pathname, isToolsetPage]);

  const isRyobiPage =
    pathname === "/promotions/ryobi-sidchrome" ||
    pathname === "/promotions/ryobi-milwaukee" ||
    pathname === "/promotions/ryobi";

  return (
    <div className={isRyobiPage ? "dark" : ""}>
      {children}
    </div>
  );
}
