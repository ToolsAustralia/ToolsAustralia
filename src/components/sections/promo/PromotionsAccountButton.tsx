"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { m, useReducedMotion } from "framer-motion";
import { LayoutDashboard, Gift, Sun, Moon, ChevronDown } from "lucide-react";
import { useUserContext } from "@/contexts/UserContext";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { useDodgeFloatingObstacles } from "@/components/support-chat/useDodgeFloatingObstacles";

/**
 * Promotions floating menu — a hamburger that morphs into a vertical column of discs.
 *
 * Docks BOTTOM-LEFT. The Cobber launcher owns bottom-right on `/promotions` now, same as
 * every other page (`src/app/promotions/layout.tsx` no longer passes `side="left"`), so the
 * two corners finally match the rest of the site.
 *
 * WHY A COLUMN AND NOT AN ARC: an arc fan was the original design, but three 44px discs need
 * ~96° of sweep at a tight radius and only ~50° is usable — past vertical is the screen edge,
 * and reaching horizontal collides with the centred floating "Enter Now" pill (which occupies
 * x 132–257, y 16–58 on a 390px viewport). Forcing three discs into 50° needs a ~115px radius,
 * i.e. FURTHER out. A vertical column keeps every disc inside a 44px lane on the far left, so
 * it is clear of that pill at any height. Don't "improve" this back into an arc.
 *
 * THE MORPH IS ONE-TO-ONE: the three hamburger bars ARE the three discs. Closed, each item is
 * scaled down to a bar; open, it travels up the column and rounds out. Nothing appears from
 * nowhere, and the bottom bar always becomes the bottom disc so the order never shuffles.
 *
 * Members only — guests get the lone theme toggle (`PromotionsGuestThemeToggle`) in the same
 * corner, so the two are mutually exclusive and never stack.
 */

/** Shared dock geometry — must match the Tailwind classes on the container below. */
const TRIGGER_PX = 48;
const DISC_PX = 44;
/** Distance from the trigger centre to the first disc centre, then the pitch between discs. */
const FIRST_OFFSET = 62;
const PITCH = 50;
/** Closed bar positions relative to the trigger centre (bottom bar → bottom disc). */
const BAR_Y = [9, 0, -9];

type MenuItem = {
  key: string;
  label: string;
  icon: typeof LayoutDashboard;
  href?: string;
};

/**
 * Bottom-to-top. My Account sits nearest the thumb because it's the most-tapped of the three;
 * the theme toggle is furthest because it's the least. Reorder this array to change the column.
 */
const MENU_ITEMS: MenuItem[] = [
  { key: "account", label: "My Account", icon: LayoutDashboard, href: "/my-account" },
  { key: "mini-draws", label: "Mini Draws", icon: Gift, href: "/mini-draws" },
  { key: "theme", label: "Theme", icon: Sun },
];

export default function PromotionsAccountButton() {
  const { isAuthenticated, loading } = useUserContext();
  const promoTheme = usePromoTheme();
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const isLightSite = theme === "light";
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const isVisible = !loading && isAuthenticated;

  // Lift above any bottom-left floating obstacle. 48 = the trigger, the element that actually
  // owns the corner (the discs sit above it and can't be reached by a bottom-anchored bar).
  const dodgeBottom = useDodgeFloatingObstacles("left", isVisible, TRIGGER_PX);

  // Close on outside click and on Escape. Both only while open.
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  if (!isVisible) return null;

  const discShadow = isLightSite
    ? `0 6px 18px rgba(0,0,0,0.18), 0 0 18px ${promoTheme.shadowRgba}`
    : `0 8px 22px rgba(0,0,0,0.55), 0 0 20px ${promoTheme.shadowRgba}`;

  // prefers-reduced-motion: snap instead of travelling. This animation is interaction-driven,
  // not always-on, so it needs the reduced-motion gate but not a device-tier gate.
  const spring = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 420, damping: 32, mass: 0.8 };

  return (
    <div
      ref={rootRef}
      // `promo-dock-supersedes`: hidden below `lg` while PromoBottomDock is mounted — its
      // drawer carries the same three items there. See globals.css.
      className="promo-dock-supersedes fixed bottom-5 left-5 z-40 transition-[bottom] duration-300 ease-out"
      style={dodgeBottom > 0 ? { bottom: dodgeBottom } : undefined}
    >
      {/* The 320px radial scrim that used to sit here was REMOVED on 2026-08-11 (owner call).
          It faded in behind the open column to keep the dark-glass discs readable over bright
          prize art, but it read as a large grey smudge over the hero on the promo pages — more
          distracting than the contrast problem it solved. The discs keep their own
          `backdrop-blur-sm` + border, which is what actually carries their legibility.
          If contrast ever becomes a genuine problem on a specific hero, tint THAT disc rather
          than reintroducing a full-bleed circle over the artwork. */}
      {MENU_ITEMS.map((item, i) => {
        const y = -(FIRST_OFFSET + i * PITCH);
        const Icon = item.key === "theme" ? (isLightSite ? Moon : Sun) : item.icon;
        const label = item.key === "theme" ? (isLightSite ? "Dark mode" : "Light mode") : item.label;

        const disc = (
          <m.span
            className="flex items-center justify-center rounded-full border backdrop-blur-sm"
            style={{ width: DISC_PX, height: DISC_PX, color: promoTheme.primary }}
            initial={false}
            animate={{
              // Closed, the disc IS a hamburger bar — it has to be the accent colour, not the
              // dark glass, or it's a dark bar on a dark trigger and the button looks empty.
              backgroundColor: isOpen
                ? isLightSite
                  ? "rgba(255,255,255,0.96)"
                  : "rgba(18,18,20,0.93)"
                : promoTheme.primary,
              borderColor: isOpen ? promoTheme.borderRgba : "rgba(0,0,0,0)",
              boxShadow: isOpen ? discShadow : "0 0 0 rgba(0,0,0,0)",
            }}
            transition={{ duration: reduceMotion ? 0 : 0.32 }}
          >
            {/* An icon squashed into a 3px bar is visual noise — hide it until the disc lands. */}
            <m.span
              className="flex"
              initial={false}
              animate={{ opacity: isOpen ? 1 : 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2, delay: reduceMotion ? 0 : (isOpen ? 0.2 + i * 0.05 : 0) }}
            >
              <Icon className="h-5 w-5 shrink-0" />
            </m.span>
          </m.span>
        );

        return (
          <m.div
            key={item.key}
            className="absolute bottom-0 left-0 flex items-center gap-2.5"
            initial={false}
            animate={
              isOpen
                ? { y, scaleX: 1, scaleY: 1, opacity: 1 }
                : { y: BAR_Y[i], scaleX: 0.44, scaleY: 0.075, opacity: 1 }
            }
            transition={{ ...spring, delay: reduceMotion ? 0 : (isOpen ? i * 0.05 : (2 - i) * 0.04) }}
            style={{
              // The bars sit ON the trigger's face while closed, so they must not eat its click.
              pointerEvents: isOpen ? "auto" : "none",
              transformOrigin: "22px 22px",
              // The 48px trigger and the 44px disc share a centre: (24,24) vs (22,22).
              left: 2,
              bottom: 2,
              // MUST out-stack the trigger: the trigger renders after these in DOM order, so
              // without this it paints over the bars and the closed button looks empty.
              zIndex: 2,
            }}
          >
            {item.href ? (
              <Link
                href={item.href}
                aria-label={label}
                tabIndex={isOpen ? undefined : -1}
                onClick={() => setIsOpen(false)}
                className="rounded-full"
              >
                {disc}
              </Link>
            ) : (
              <button
                type="button"
                aria-label={label}
                tabIndex={isOpen ? undefined : -1}
                onClick={toggleTheme}
                className="rounded-full"
              >
                {disc}
              </button>
            )}

            {/* Label pill — fades in only once the disc has landed. Counter-scaled so it is
                never squashed by the parent's bar transform while closed. */}
            <m.span
              aria-hidden
              className="whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-bold"
              style={{
                background: isLightSite ? "rgba(255,255,255,0.94)" : "rgba(16,16,18,0.9)",
                borderColor: isLightSite ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.12)",
                color: isLightSite ? "#111" : "#fff",
                boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
              }}
              animate={{ opacity: isOpen ? 1 : 0, x: isOpen ? 0 : -10 }}
              transition={{ duration: reduceMotion ? 0 : 0.26, delay: reduceMotion ? 0 : (isOpen ? 0.18 + i * 0.05 : 0) }}
            >
              {label}
            </m.span>
          </m.div>
        );
      })}

      {/* Trigger. Sits BELOW the bars so they read as its face, but stays clickable because
          the bars are pointer-events:none while closed. */}
      <m.button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-label={isOpen ? "Close menu" : "Open menu"}
        className="relative flex items-center justify-center rounded-full border backdrop-blur-sm"
        style={{
          width: TRIGGER_PX,
          height: TRIGGER_PX,
          zIndex: 1,
          background: isLightSite ? "rgba(255,255,255,0.96)" : "rgba(16,16,18,0.94)",
          borderColor: isOpen ? promoTheme.borderRgba : isLightSite ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.16)",
        }}
        animate={{
          scale: isOpen ? 0.86 : 1,
          boxShadow: isOpen
            ? `0 6px 18px rgba(0,0,0,0.5), 0 0 30px ${promoTheme.shadowRgba}`
            : `0 6px 18px rgba(0,0,0,0.35), 0 0 18px ${promoTheme.shadowRgba}`,
        }}
        transition={spring}
        whileTap={{ scale: isOpen ? 0.82 : 0.94 }}
      >
        <m.span
          className="flex items-center justify-center"
          animate={{ opacity: isOpen ? 1 : 0, scale: isOpen ? 1 : 0.5 }}
          transition={{ duration: reduceMotion ? 0 : 0.2, delay: reduceMotion ? 0 : (isOpen ? 0.18 : 0) }}
        >
          <ChevronDown className="h-[18px] w-[18px]" style={{ color: promoTheme.primary }} />
        </m.span>
      </m.button>
    </div>
  );
}
