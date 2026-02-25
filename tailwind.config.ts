import type { Config } from "tailwindcss";

const config: Config = {
  safelist: [
    { pattern: /^(text|bg|border|shadow|ring)-premium-gold(\/[\d]+)?$/ },
  ],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/utils/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
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
        red: {
          600: "#ee0000",
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
          // Makita dark teal palette from circuit-style reference
          400: "#065255", // Deep muted teal (edges)
          500: "#008C95", // Primary/vibrant teal
          600: "#00B8C2", // Lighter center
          700: "#065255", // Darkest
          light: "#00B8C2",
          dark: "#065255",
        },
        "premium-gold": "#D4AF37",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "sans-serif"],
        poppins: ["var(--font-poppins)", "Poppins", "sans-serif"],
        agency: ["AgencyFB BlackWide", "sans-serif"],
        acumin: ["Acumin Pro Condensed", "sans-serif"],
      },
      fontSize: {
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
          "0%, 100%": { transform: "scale(1)", boxShadow: "0 0 12px rgba(238, 0, 0, 0.5)" },
          "50%": { transform: "scale(1.05)", boxShadow: "0 0 20px rgba(238, 0, 0, 0.8)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
