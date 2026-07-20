"use client";

import { useState, useRef, useEffect, type CSSProperties } from "react";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import Link from "next/link";
import { m, AnimatePresence } from "framer-motion";
import { User, LayoutDashboard, Gift, Home } from "lucide-react";
import { useUserContext } from "@/contexts/UserContext";
import { useThemeStore } from "@/stores/useThemeStore";
import { ThemeToggleButton } from "@/components/ui/ThemeToggle";
import { hexToRgbaString } from "@/utils/package-colors/packageColorScheme";
import { useDodgeFloatingObstacles } from "@/components/support-chat/useDodgeFloatingObstacles";

const MENU_ITEMS = [
  { href: "/my-account", label: "My Account", icon: LayoutDashboard },
  { href: "/mini-draws", label: "Mini Draws", icon: Gift },
  { href: "/", label: "Homepage", icon: Home },
] as const;

/**
 * Expandable/collapsible floating menu on promotions pages. Toggle to reveal
 * navigation links. Only shown to authenticated users—keeps guests focused on
 * the promo landing page. Light bg in site light mode, dark bg in site dark mode; brand-accent icon.
 * Positioned bottom-right at fixed distance from bottom so it doesn't shift
 * when the menu expands/compresses.
 */
export default function PromotionsAccountButton() {
  const { isAuthenticated, loading } = useUserContext();
  const promoTheme = usePromoTheme();
  const siteTheme = useThemeStore((s) => s.theme);
  const isLightSite = siteTheme === "light";
  const [isOpen, setIsOpen] = useState(false);
  const menuHoverBg = hexToRgbaString(promoTheme.primary, 0.22);
  const fabShadow = isLightSite
    ? `0 2px 14px rgba(0,0,0,0.08), 0 0 22px ${promoTheme.shadowRgba}`
    : `0 4px 22px rgba(0,0,0,0.55), 0 0 26px ${promoTheme.shadowRgba}`;
  const fabShadowHover = isLightSite
    ? `0 4px 20px rgba(0,0,0,0.12), 0 0 34px ${promoTheme.hoverShadowRgba}`
    : `0 6px 28px rgba(0,0,0,0.6), 0 0 40px ${promoTheme.hoverShadowRgba}`;
  const stackShadow = isLightSite
    ? `0 2px 14px rgba(0,0,0,0.1), 0 0 22px ${promoTheme.shadowRgba}`
    : `0 4px 22px rgba(0,0,0,0.55), 0 0 26px ${promoTheme.shadowRgba}`;
  const fabStackRef = useRef<HTMLDivElement>(null);

  const isVisible = !loading && isAuthenticated;

  // Lift the whole FAB stack (theme toggle + account button) above the full-width
  // floating "Enter Now" bar when it scrolls in — same collision-dodge the Cobber
  // launcher uses. Returns 0 (keep the default bottom-16/sm:bottom-4) when clear.
  const dodgeBottom = useDodgeFloatingObstacles("right", isVisible);

  // Default expanded on desktop (lg: 1024px+)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    if (mq.matches) setIsOpen(true);
  }, []);

  // Close menu when clicking outside (mobile only - desktop stays open)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const node = e.target as Node;
      if (fabStackRef.current?.contains(node)) return;
      setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isVisible && (
        <m.div
          key="promo-account-fab-stack"
          ref={fabStackRef}
          initial={{ opacity: 0, x: 40, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 40, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 350, damping: 28 }}
          className="fixed right-4 bottom-16 z-40 flex flex-col items-end gap-3 sm:bottom-4 transition-[bottom] duration-300 ease-out"
          style={dodgeBottom > 0 ? { bottom: dodgeBottom } : undefined}
        >
          <m.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30, delay: 0.03 }}
          >
            <ThemeToggleButton
              className="group relative flex h-12 w-12 shrink-0 touch-manipulation items-center justify-center rounded-full bg-white/95 dark:bg-black backdrop-blur-sm shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-xl active:scale-95 border border-neutral-200 dark:border-transparent"
              style={{
                boxShadow: stackShadow,
                ...(!isLightSite ? { borderColor: promoTheme.borderRgba } : {}),
              }}
            />
          </m.div>

          {/* Menu is absolutely positioned so its height never stretches this row — theme toggle stays fixed. */}
          <div className="relative h-12 w-12 shrink-0 overflow-visible">
            <AnimatePresence>
              {isOpen && (
                <m.div
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 24 }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  className="absolute bottom-0 right-full mr-2 flex items-end"
                >
                  <div
                    className="flex flex-col w-fit rounded-xl py-2 px-2 shadow-2xl overflow-hidden bg-white dark:bg-black"
                    style={
                      {
                        border: `1px solid ${promoTheme.borderRgba}`,
                        boxShadow: isLightSite
                          ? `0 8px 28px rgba(0,0,0,0.12), 0 0 24px ${promoTheme.shadowRgba}`
                          : `0 12px 40px rgba(0,0,0,0.5), 0 0 28px ${promoTheme.shadowRgba}`,
                        ["--promo-menu-hover" as string]: menuHoverBg,
                      } as CSSProperties
                    }
                  >
                    {MENU_ITEMS.map(({ href, label, icon: Icon }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setIsOpen(false)}
                        className="group flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-semibold text-neutral-800 dark:text-white/90 hover:bg-[color:var(--promo-menu-hover)] hover:text-neutral-950 dark:hover:text-white transition-all duration-200 font-sans whitespace-nowrap"
                      >
                        <Icon
                          className="h-4 w-4 min-w-4 min-h-4 shrink-0 transition-colors"
                          style={{ color: promoTheme.primary }}
                        />
                        {label}
                      </Link>
                    ))}
                  </div>
                </m.div>
              )}
            </AnimatePresence>

            <m.button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              aria-label={isOpen ? "Close account menu" : "Open account menu"}
              aria-expanded={isOpen}
              className="group absolute bottom-0 right-0 z-10 flex items-center justify-center w-12 h-12 rounded-full border backdrop-blur-sm bg-white/95 dark:bg-black border-neutral-200 dark:border-transparent"
              style={{
                ...(!isLightSite ? { borderColor: promoTheme.borderRgba } : {}),
              }}
              animate={{ boxShadow: fabShadow }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              whileHover={{ scale: 1.05, boxShadow: fabShadowHover }}
              whileTap={{ scale: 0.97 }}
            >
              <span
                className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                style={{ boxShadow: `inset 0 0 0 1px ${promoTheme.borderRgba}` }}
              />
              <User className="h-6 w-6 relative z-10 shrink-0" style={{ color: promoTheme.primary }} />
            </m.button>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
