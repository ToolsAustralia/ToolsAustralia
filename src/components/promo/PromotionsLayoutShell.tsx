"use client";

import { usePathname } from "next/navigation";
import { usePromoPageTracking } from "@/hooks/usePromoPageTracking";

/**
 * Wraps promotions layout content.
 *
 * - Dark mode on Ryobi slug pages (pathname-based)
 * - usePromoPageTracking() for visit analytics and attribution storage
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
