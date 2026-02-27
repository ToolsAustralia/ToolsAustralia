"use client";

import { useLayoutEffect } from "react";
import { usePromoThemeStore } from "@/stores/usePromoThemeStore";

/**
 * Sets the promo landing page theme based on the current prize slug.
 * Mount this at the top of the promotions page; all child components
 * and modals that use usePromoTheme() will receive the theme.
 * When toolsetSlug is provided (e.g. on /promotions/ryobi), used for Ryobi dark mode override.
 */
export default function PromoThemeInitializer({
  slug,
  toolsetSlug,
}: {
  slug: string;
  toolsetSlug?: string | null;
}) {
  const setSlug = usePromoThemeStore((s) => s.setSlug);
  const setToolsetSlug = usePromoThemeStore((s) => s.setToolsetSlug);

  useLayoutEffect(() => {
    setSlug(slug);
    setToolsetSlug(toolsetSlug ?? null);
    return () => {
      setSlug(null);
      setToolsetSlug(null);
    };
  }, [slug, toolsetSlug, setSlug, setToolsetSlug]);

  return null;
}
