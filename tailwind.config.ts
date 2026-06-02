import type { Config } from "tailwindcss";
import { BRAND_THEMES } from "./src/config/brand-theme";

const config: Config = {
  darkMode: "class",
  safelist: [
    { pattern: /^(text|bg|border|shadow|ring)-premium-gold(\/[\d]+)?$/ },
    // NOTE: Dynamic class builders in prize-brand-colors.ts / brand-theme.ts /
    // packageColorScheme.ts construct `[#hex]` arbitraries at runtime via
    // template literals. Tailwind's `pattern` safelist cannot generate
    // unbounded arbitrary-value classes (it warns when it can't), so we don't
    // try. If a brand color stops rendering, add the specific `[#hex]` class
    // strings here as explicit entries (e.g. "from-[#ce2b05]"), or — better —
    // refactor the consumer to use a static class. See
    // docs/shared-ui/tailwind-conventions.md §8 for the codemod-safe pattern.
  ],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/utils/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      screens: {
        // Custom breakpoint at 540px to match the modal `@media (max-width: 540px)`
        // queries we're porting off styled-jsx. Used as `max-xs:`/`xs:` variants.
        // Tailwind defaults sm=640px, so xs sits below that.
        xs: "540px",
      },
      colors: {
        primary: {
          50: "#fef2f2",
          100: "#fee2e2",
          200: "#fecaca",
          300: "#fca5a5",
          400: "#f87171",
          500: "#ef4444",
          600: "#dc2626",
          700: "#b91c1c",
          800: "#991b1b",
          900: "#7f1d1d",
        },
        // Brand red palette — extends Tailwind's defaults to cover the 13 distinct
        // brand-red shades found in the audit. red-600 stays as #ee0000 (existing
        // override). Codemod sweep-brand-red maps each [#hex] literal to a token here.
        red: {
          50: "#fef2f2",
          100: "#fee2e2",
          200: "#fecaca",
          300: "#fca5a5",
          400: "#ff4444",  // gradient companion (76 sites)
          500: "#ec0000",  // slightly darker (4 sites)
          600: "#ee0000",  // brand primary (existing override; 409 sites)
          650: "#e60000",  // reset-password gradient (30 sites)
          675: "#cc0000",  // hover/darker pair (68 sites)
          700: "#b91c1c",  // Tailwind default — restored to avoid breaking 162 existing red-700 usages
          800: "#991b1b",  // Tailwind default
          900: "#7f1d1d",  // Tailwind default
        },
        gray: {
          50: "#f9fafb",
          100: "#f3f4f6",
          200: "#e5e7eb",
          300: "#d1d5db",
          400: "#9ca3af",
          500: "#6b7280",
          600: "#4b5563",
          700: "#374151",
          800: "#1f2937",
          900: "#111827",
        },
        makita: {
          400: "#065255",
          500: "#008C95",
          600: "#00B8C2",
          700: "#065255",
          light: "#00B8C2",
          dark: "#065255",
        },
        "premium-gold": "#D4AF37",
        // Membership tier semantic colors — used by Cancellation/Renewal/Downgrade
        // modals and MembershipSection for tradie/foreman/boss theming via cva().
        "brand-tier": {
          tradie: "#00c2ed",   // makita teal
          foreman: "#ffd200",  // dewalt yellow
          boss: "#ee0000",     // boss red (= red-600)
        },
        brand: {
          dewalt: {
            primary: BRAND_THEMES.dewalt.light.primary,
            secondary: BRAND_THEMES.dewalt.light.secondary,
            accent: BRAND_THEMES.dewalt.light.accent,
          },
          makita: {
            primary: BRAND_THEMES.makita.light.primary,
            secondary: BRAND_THEMES.makita.light.secondary,
            accent: BRAND_THEMES.makita.light.accent,
          },
          milwaukee: {
            primary: BRAND_THEMES.milwaukee.light.primary,
            secondary: BRAND_THEMES.milwaukee.light.secondary,
            accent: BRAND_THEMES.milwaukee.light.accent,
          },
          ryobi: {
            primary: BRAND_THEMES.ryobi.light.primary,
            secondary: BRAND_THEMES.ryobi.light.secondary,
            accent: BRAND_THEMES.ryobi.light.accent,
          },
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "sans-serif"],
        poppins: ["var(--font-poppins)", "Poppins", "sans-serif"],
        display: ["var(--font-poppins)", "ui-sans-serif", "system-ui", "sans-serif"],
        agency: ["AgencyFB BlackWide", "sans-serif"],
        acumin: ["Acumin Pro Condensed", "sans-serif"],
      },
      fontWeight: {
        bold: "800",
        extrabold: "900",
        black: "900",
      },
      fontSize: {
        // Micro-text scale — sub-12px sizes used in dense UI (admin tables, modal
        // microcopy, badge labels). Eliminates 589 arbitrary `text-[Npx]` literals.
        // text-[9px] rounds to text-3xs (8px); text-[11px] rounds to text-2xs (10px).
        // Documented in docs/shared-ui/tailwind-conventions.md.
        "3xs": "8px",
        "2xs": "10px",
        "agency-title": ["2.8125rem", { lineHeight: "0.79" }],
        "6xl": ["3.75rem", { lineHeight: "1" }],
        "7xl": ["4.5rem", { lineHeight: "1" }],
        "8xl": ["6rem", { lineHeight: "1" }],
        "9xl": ["8rem", { lineHeight: "1" }],
      },
      spacing: {
        "18": "4.5rem",
        "88": "22rem",
        "128": "32rem",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      boxShadow: {
        xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
        "2xl": "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        lift: "0 1px 0 rgba(0,0,0,0.02), 0 12px 32px -16px rgba(0,0,0,0.18)",
        "lift-dark": "0 1px 0 rgba(255,255,255,0.04), 0 16px 40px -20px rgba(0,0,0,0.7)",
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-in-out",
        "slide-up": "slideUp 0.5s ease-out",
        "bounce-slow": "bounce 2s infinite",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        "glow-pulse-yellow": "glow-pulse-yellow 2s ease-in-out infinite",
        "glow-pulse-purple": "glow-pulse-purple 2s ease-in-out infinite",
        "glow-pulse-gold": "glow-pulse-gold 2s ease-in-out infinite",
        "glow-pulse-orange": "glow-pulse-orange 2s ease-in-out infinite",
        "border-glow-yellow": "border-glow-yellow 2s ease-in-out infinite",
        "border-glow-blue": "border-glow-blue 2s ease-in-out infinite",
        "border-glow-purple": "border-glow-purple 2s ease-in-out infinite",
        "border-glow-gold": "border-glow-gold 2s ease-in-out infinite",
        "border-glow-orange": "border-glow-orange 2s ease-in-out infinite",
        "badge-pulse": "badgePulse 1.5s ease-in-out infinite",
        "pulse-ring": "pulseRing 1.8s ease-out infinite",
        // Migrated from inline <style> blocks per Phase 0 of the cleanup spec:
        "spin-reverse": "spin-reverse 1.5s linear infinite",
        "sparkle": "sparkle 2.5s ease-in-out infinite",
        "member-benefit-float": "memberBenefitFloat 6s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        lineExpand: {
          "0%": { opacity: "0", transform: "scaleX(0.3)" },
          "60%": { opacity: "1", transform: "scaleX(1)" },
          "100%": { opacity: "1", transform: "scaleX(1)" },
        },
        fadeSlideUp: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        badgePulse: {
          // Was rgba(238,0,0,…) — that's the same color as red-600 (#ee0000).
          // Hand-converted at Phase 0 because the codemod can't match rgb form.
          "0%, 100%": { transform: "scale(1)", boxShadow: "0 0 12px rgb(238 0 0 / 0.5)" },
          "50%": { transform: "scale(1.05)", boxShadow: "0 0 20px rgb(238 0 0 / 0.8)" },
        },
        // Migrated from src/components/ui/PaymentLoadingSpinner.tsx
        "spin-reverse": {
          from: { transform: "rotate(360deg)" },
          to: { transform: "rotate(0deg)" },
        },
        // Migrated from src/components/loading/SuccessScreen.tsx
        // Note: original used `var(--drift)` set inline by JSX. The migrated version
        // keeps that pattern — the keyframe references the var, JSX still sets it.
        sparkle: {
          "0%, 100%": { opacity: "0", transform: "scale(0) translateY(0)" },
          "50%": { opacity: "1", transform: "scale(1) translateY(calc(var(--drift, 20px) * -1))" },
        },
        // Migrated from src/components/sections/promo/PartnerBenefitsPromoSection.tsx
        memberBenefitFloat: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        pulseRing: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(238,0,0,0.45)" },
          "50%": { boxShadow: "0 0 0 8px rgba(238,0,0,0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
