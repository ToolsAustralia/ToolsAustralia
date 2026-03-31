"use client";

import { usePathname } from "next/navigation";
import { shouldShowFloatingThemeToggle } from "@/utils/themeToggleVisibility";
import { ThemeToggleButton } from "@/components/ui/ThemeToggle";

/**
 * Floating theme FAB for public `(site)` routes (excludes /my-account, /admin, /promotions).
 * `z-[55]` sits above FloatingCountdownBanner (`z-50`) and FloatingPromoBanner (`z-[40]`).
 */
export default function SiteFloatingThemeToggle() {
  const pathname = usePathname();
  if (!shouldShowFloatingThemeToggle(pathname)) return null;

  return (
    <div className="fixed bottom-32 right-4 z-[55] sm:bottom-36 pointer-events-auto">
      <ThemeToggleButton />
    </div>
  );
}
