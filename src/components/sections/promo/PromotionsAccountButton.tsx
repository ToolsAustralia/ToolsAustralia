"use client";

import { useState, useRef, useEffect } from "react";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, LayoutDashboard, Gift, Home } from "lucide-react";
import { useUserContext } from "@/contexts/UserContext";

const MENU_ITEMS = [
  { href: "/my-account", label: "My Account", icon: LayoutDashboard },
  { href: "/mini-draws", label: "Mini Draws", icon: Gift },
  { href: "/", label: "Homepage", icon: Home },
] as const;

/**
 * Expandable/collapsible floating menu on promotions pages. Toggle to reveal
 * navigation links. Only shown to authenticated users—keeps guests focused on
 * the promo landing page. Matches promo page theme: red gradient, dark panel.
 * Positioned bottom-right at fixed distance from bottom so it doesn't shift
 * when the menu expands/compresses.
 */
export default function PromotionsAccountButton() {
  const { isAuthenticated, loading } = useUserContext();
  const theme = usePromoTheme();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isVisible = !loading && isAuthenticated;

  // Default expanded on desktop (lg: 1024px+)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    if (mq.matches) setIsOpen(true);
  }, []);

  // Close menu when clicking outside (mobile only - desktop stays open)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, x: 40, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 40, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 350, damping: 28 }}
          className="fixed right-4 bottom-24 sm:bottom-28 z-40 flex items-end justify-end gap-2"
        >
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="flex items-center gap-2 pr-2"
          >
            <div className="flex flex-col w-fit rounded-xl py-2 px-2 shadow-2xl overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-black" style={{ border: `1px solid ${theme.borderRgba}` }}>
              {MENU_ITEMS.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setIsOpen(false)}
                  className="group flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-semibold text-white/90 hover:bg-[rgba(211,47,47,0.3)] hover:text-white transition-all duration-200 font-['Poppins'] whitespace-nowrap"
                >
                  <Icon className="h-4 w-4 min-w-4 min-h-4 shrink-0 transition-colors" style={{ color: theme.primary }} />
                  {label}
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? "Close menu" : "Open menu"}
        aria-expanded={isOpen}
        className="group relative flex items-center justify-center w-12 h-12 rounded-full font-extrabold text-sm tracking-wide text-white border border-white/20 backdrop-blur-lg transition-all duration-300 hover:shadow-[0_0_45px_rgba(211,47,47,0.5)] shrink-0"
        style={{
          background: theme.gradient,
          boxShadow: `0 0 30px ${theme.shadowRgba}`,
        }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.97 }}
      >
        <span className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ border: `1px solid ${theme.borderRgba}` }} />
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="relative z-10"
        >
          <ChevronLeft className="h-5 w-5" />
        </motion.div>
      </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
