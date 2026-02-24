import { create } from "zustand";
import { getLandingPageThemeFromSlug, getPromoPrimaryTheme } from "@/utils/package-colors/packageColorScheme";

export type PromoLandingTheme = ReturnType<typeof getLandingPageThemeFromSlug>;

interface PromoThemeState {
  slug: string | null;
  theme: PromoLandingTheme;
  setSlug: (slug: string | null) => void;
}

/**
 * Get theme from slug, or default (Milwaukee) when slug is null
 */
function resolveTheme(slug: string | null): PromoLandingTheme {
  if (slug) {
    return getLandingPageThemeFromSlug(slug);
  }
  const defaultTheme = getPromoPrimaryTheme();
  return {
    ...defaultTheme,
    badgeStyle: {
      background: `linear-gradient(135deg, ${defaultTheme.primaryLight} 0%, ${defaultTheme.primary} 25%, ${defaultTheme.primaryDark} 50%, #0a0a0a 75%, ${defaultTheme.primary} 100%)`,
      boxShadow: `0 0 40px ${defaultTheme.shadowRgba}, 0 4px 20px rgba(154, 12, 36, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.7)`,
      border: `1px solid ${defaultTheme.borderRgba}`,
    },
  };
}

export const usePromoThemeStore = create<PromoThemeState>((set) => ({
  slug: null,
  theme: resolveTheme(null),
  setSlug: (slug) => set({ slug, theme: resolveTheme(slug) }),
}));

export function usePromoTheme(): PromoLandingTheme {
  return usePromoThemeStore((s) => s.theme);
}
