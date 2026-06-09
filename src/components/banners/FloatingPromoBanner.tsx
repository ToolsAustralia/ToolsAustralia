"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { useResolvedMultiplier } from "@/hooks/queries/usePromoQueries";
import PromoBadge from "@/components/ui/PromoBadge";
import { useSidebar } from "@/contexts/SidebarContext";
import { usePromoTheme } from "@/stores/usePromoThemeStore";
import type { PromoMultiplier } from "@/types/promo-multiplier";

/**
 * FloatingPromoBanner Component
 * Displays a floating promo badge at the bottom of the screen
 * - On mini draw pages: Shows mini-packages promo if active, otherwise hides banner
 * - On other pages: Syncs with MembershipSection active tab (membership or one-time)
 * - Hides when user is at the bottom of the page and reappears when scrolling up
 * - Hidden on shop pages and admin pages
 */
const FloatingPromoBanner: React.FC = () => {
  const pathname = usePathname();
  const { isAnySidebarOpen } = useSidebar();
  const theme = usePromoTheme();
  const [activeTab, setActiveTab] = useState<"membership" | "one-time">("membership");
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get resolved multipliers (includes scheduled, toggle, and alternating)
  const resolvedMembershipMultiplier = useResolvedMultiplier("membership-packages", "display");
  const resolvedOneTimeMultiplier = useResolvedMultiplier("one-time-packages", "display");
  const resolvedMiniMultiplier = useResolvedMultiplier("mini-packages", "display");

  // Check if we're on a mini draw page (main page or details pages)
  const isMiniDrawPage = pathname?.startsWith("/mini-draws");

  // Check if we're on a promotions landing page (hide - page has its own PromoBanner and CTA)
  const isPromotionsPage = pathname?.startsWith("/promotions");

  // Check if we're on a shop page
  const isShopPage = pathname?.startsWith("/shop");

  // Check if we're on an admin page
  const isAdminPage = pathname?.startsWith("/admin");

  // Check if we're on an affiliate page
  const isAffiliatePage = pathname?.startsWith("/affiliate");

  // Check if we're on a login page
  const isLoginPage = pathname === "/login";

  // Check if we're on a terms page
  const isTermsPage = pathname === "/terms";

  // Check if we're on a privacy page
  const isPrivacyPage = pathname === "/privacy";

  // Check if we're on a competition terms page
  const isCompetitionTermsPage = pathname === "/competition-term-majordraw";

  // On my-account: hide entirely (dashboard has its own layout and bottom nav)
  const isMyAccountPage = pathname?.startsWith("/my-account");

  // Listen for tab changes from MembershipSection
  useEffect(() => {
    const handleTabChange = (event: CustomEvent<{ activeTab: "membership" | "one-time" }>) => {
      setActiveTab(event.detail.activeTab);
    };

    window.addEventListener("membershipTabChanged", handleTabChange as EventListener);

    return () => {
      window.removeEventListener("membershipTabChanged", handleTabChange as EventListener);
    };
  }, []);

  // Handle scroll detection to show/hide banner at bottom of page
  useEffect(() => {
    const handleScroll = () => {
      // Clear any existing timeout to debounce scroll events
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Debounce scroll events for better performance
      scrollTimeoutRef.current = setTimeout(() => {
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const scrollBottom = scrollTop + windowHeight;

        // Threshold: consider user at bottom if within 100px from the bottom
        const bottomThreshold = 100;
        const isAtBottom = scrollBottom >= documentHeight - bottomThreshold;

        // On my-account: also hide when at top (within 150px)
        const topThreshold = 150;
        const isAtTop = scrollTop < topThreshold;

        const currentScrollY = window.scrollY;
        const isScrollingUp = currentScrollY < lastScrollY.current;

        if (isMyAccountPage) {
          // My-account: only show when user has scrolled past top AND not at bottom
          setIsVisible(!isAtTop && !isAtBottom);
        } else {
          // Other pages: hide at bottom, show when scrolled up or not at bottom
          if (isAtBottom) {
            setIsVisible(false);
          } else {
            setIsVisible(isScrollingUp || !isAtBottom);
          }
        }

        lastScrollY.current = currentScrollY;
      }, 10); // Small debounce for smooth performance
    };

    // Initial check on mount
    handleScroll();

    // Add scroll event listener
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [isMyAccountPage]);

  // Effective multiplier for current context (scheduled, toggle, or alternating)
  const activeMultiplier =
    isMiniDrawPage
      ? resolvedMiniMultiplier
      : activeTab === "membership"
        ? resolvedMembershipMultiplier
        : resolvedOneTimeMultiplier;

  // Don't render at all if:
  // - On 404 page
  // - Sidebar is open
  // - On my-account (dashboard has its own layout and bottom nav - avoids conflict)
  // - On promotions page (landing has its own banner and CTA)
  // - On shop page (hide banner on all shop pages)
  // - On admin page (hide banner on all admin pages)
  // - On affiliate page (hide banner on all affiliate pages)
  // - On login page (hide banner on login page)
  // - On terms page (hide banner on terms page)
  // - On privacy page (hide banner on privacy page)
  // - On competition terms page (hide banner on competition terms page)
  // - On mini draw page but no effective multiplier > 1
  // - No effective multiplier > 1 for current context
  if (
    pathname === "/not-found" ||
    isAnySidebarOpen ||
    isMyAccountPage ||
    isPromotionsPage ||
    isShopPage ||
    isAdminPage ||
    isAffiliatePage ||
    isLoginPage ||
    isTermsPage ||
    isPrivacyPage ||
    isCompetitionTermsPage ||
    (isMiniDrawPage && (resolvedMiniMultiplier == null || resolvedMiniMultiplier <= 1)) ||
    activeMultiplier == null ||
    activeMultiplier <= 1
  ) {
    return null;
  }

  // Determine if banner should be visible (considering scroll position)
  const shouldShowBanner = isVisible;

  // Scroll to membership section on click (same as PromoBanner / FloatingGetEntriesButton)
  const handleBannerClick = () => {
    const membershipSection = document.getElementById("membership");
    if (membershipSection) {
      membershipSection.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleBannerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleBannerClick();
    }
  };

  return (
    <AnimatePresence>
      {shouldShowBanner && (
        <motion.div
          key="floating-promo-banner"
          role="button"
          tabIndex={0}
          aria-label="Scroll to membership and packages"
          onClick={handleBannerClick}
          onKeyDown={handleBannerKeyDown}
          data-floating-widget="true"
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
          className="fixed bottom-0 left-0 right-0 z-[40] shadow-2xl border-t-2 border-yellow-300 cursor-pointer select-none pb-[env(safe-area-inset-bottom)]"
          style={{
            background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primary}cc 25%, ${theme.primary}99 50%, ${theme.primary}99 75%, ${theme.primary} 100%)`,
            boxShadow: `0 -10px 30px ${theme.shadowRgba}, 0 0 20px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.3)`,
          }}
        >
          <div className="max-w-7xl mx-auto px-1 sm:px-4 py-1 sm:py-2">
            {/* Centered badge only - no text */}
            <div className="flex items-center justify-center">
              <PromoBadge
                multiplier={activeMultiplier as PromoMultiplier}
                size="small"
                customText="ENTRY BOOST ENDING SOON"
              />
            </div>

            {/* Animated background effect */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, ${theme.shadowRgba.replace(/,\s*0\.6\)/, ", 0.25)")} 25%, ${theme.shadowRgba.replace(/,\s*0\.6\)/, ", 0.35)")} 50%, ${theme.shadowRgba.replace(/,\s*0\.6\)/, ", 0.25)")} 75%, ${theme.shadowRgba.replace(/,\s*0\.6\)/, ", 0.15)")} 100%)`,
                animation: "pulse 2s infinite",
              }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default FloatingPromoBanner;
