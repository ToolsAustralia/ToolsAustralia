"use client";

import { useLayoutEffect } from "react";
import { usePromoThemeStore } from "@/stores/usePromoThemeStore";

/**
 * Sets the promo landing page theme based on the current prize slug.
 * Mount this at the top of the promotions page; all child components
 * and modals that use usePromoTheme() will receive the theme.
 */
export default function PromoThemeInitializer({ slug }: { slug: string }) {
  const setSlug = usePromoThemeStore((s) => s.setSlug);

  useLayoutEffect(() => {
    setSlug(slug);
    return () => setSlug(null);
  }, [slug, setSlug]);

  return null;
}
