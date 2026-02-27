import { create } from "zustand";
import { getLandingPageThemeFromSlug, getPromoPrimaryTheme } from "@/utils/package-colors/packageColorScheme";

export type PromoLandingTheme = ReturnType<typeof getLandingPageThemeFromSlug>;

interface PromoThemeState {
  slug: string | null;
  /** Toolset slug when on toolset landing page - used for Ryobi dark mode override */
  toolsetSlug: string | null;
  theme: PromoLandingTheme;
  setSlug: (slug: string | null) => void;
  setToolsetSlug: (toolsetSlug: string | null) => void;
}

/**
 * Get theme from slug, or default (Milwaukee) when slug is null.
 * When toolsetSlug is "ryobi", force preferDarkBackground for dark CTA/button styling.
 */
function resolveTheme(slug: string | null, toolsetSlug: string | null): PromoLandingTheme {
  let theme: PromoLandingTheme;
  if (slug) {
    theme = getLandingPageThemeFromSlug(slug);
  } else {
    const defaultTheme = getPromoPrimaryTheme();
    theme = {
      ...defaultTheme,
      badgeStyle: {
        background: `linear-gradient(135deg, ${defaultTheme.primaryLight} 0%, ${defaultTheme.primary} 25%, ${defaultTheme.primaryDark} 50%, #0a0a0a 75%, ${defaultTheme.primary} 100%)`,
        boxShadow: `0 0 40px ${defaultTheme.shadowRgba}, 0 4px 20px rgba(154, 12, 36, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.7)`,
        border: `1px solid ${defaultTheme.borderRgba}`,
      },
    };
  }
  if (toolsetSlug === "ryobi") {
    return { ...theme, preferDarkBackground: true };
  }
  return theme;
}

export const usePromoThemeStore = create<PromoThemeState>((set) => ({
  slug: null,
  toolsetSlug: null,
  theme: resolveTheme(null, null),
  setSlug: (slug) => set((s) => ({ slug, theme: resolveTheme(slug, s.toolsetSlug) })),
  setToolsetSlug: (toolsetSlug) =>
    set((s) => ({ toolsetSlug, theme: resolveTheme(s.slug, toolsetSlug) })),
}));

export function usePromoTheme(): PromoLandingTheme {
  return usePromoThemeStore((s) => s.theme);
}
