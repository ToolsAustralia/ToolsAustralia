"use client";

import { usePathname } from "next/navigation";

/**
 * Wraps promotions layout content and applies dark mode when on Ryobi slug pages.
 * Uses pathname-based detection for immediate application (no theme store lag).
 * Enables dark: Tailwind variants for neon green (#E0FF00) on dark backgrounds.
 */
export default function PromotionsLayoutShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
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
