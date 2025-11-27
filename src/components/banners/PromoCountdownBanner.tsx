"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import { useActivePromos } from "@/hooks/queries/usePromoQueries";
import PromoBadge from "@/components/ui/PromoBadge";
import { useSidebar } from "@/contexts/SidebarContext";

const PromoCountdownBanner: React.FC = () => {
  const pathname = usePathname();
  const { data: promos } = useActivePromos();
  const { isAnySidebarOpen } = useSidebar();
  const [currentPromoIndex, setCurrentPromoIndex] = useState(0);

  // Get current promo
  const currentPromo = promos && promos.length > 0 ? promos[currentPromoIndex] : null;

  // Auto-switch between promos every 5 seconds - animation will trigger on re-render
  useEffect(() => {
    if (!promos || promos.length <= 1) return;

    const switchInterval = setInterval(() => {
      setCurrentPromoIndex((prevIndex) => (prevIndex + 1) % promos.length);
    }, 5000);

    return () => clearInterval(switchInterval);
  }, [promos]);

  // Framer Motion animation variants
  const bannerVariants = {
    initial: {
      opacity: 0,
      y: 20,
      scale: 0.95,
    },
    animate: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.6,
        ease: [0.25, 0.46, 0.45, 0.94] as const,
        staggerChildren: 0.1,
      },
    },
    exit: {
      opacity: 0,
      y: -20,
      scale: 0.95,
      transition: {
        duration: 0.3,
        ease: [0.55, 0.06, 0.68, 0.19] as const,
      },
    },
  };

  const itemVariants = {
    initial: {
      opacity: 0,
      y: 10,
      scale: 0.9,
    },
    animate: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.4,
        ease: [0.25, 0.46, 0.45, 0.94] as const,
      },
    },
  };

  // Don't render if no active promos or on 404 page (updated for toggle system - no expiration check)
  if (pathname === "/not-found" || !promos || promos.length === 0 || !currentPromo) {
    return null;
  }

  return (
    <>
      <style jsx>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      <AnimatePresence>
        {!isAnySidebarOpen && (
          <motion.div
            key="promo-banner"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="fixed bottom-0 left-0 right-0 z-[40] shadow-2xl border-t-2 border-yellow-300"
            style={{
              background: `linear-gradient(135deg, #ef4444 0%, #dc2626 25%, #b91c1c 50%, #991b1b 75%, #ef4444 100%)`,
              boxShadow: `0 -10px 30px rgba(239, 68, 68, 0.7), 0 0 20px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.3)`,
            }}
          >
            <div className="max-w-7xl mx-auto px-1 sm:px-4 py-1 sm:py-2">
              {/* Desktop layout - horizontal only */}
              <div className="hidden sm:flex items-center justify-center gap-4">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`desktop-${currentPromoIndex}`}
                    className="flex items-center gap-4"
                    variants={bannerVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    {/* Promo badge */}
                    <motion.div variants={itemVariants}>
                      <PromoBadge multiplier={currentPromo.multiplier} size="small" />
                    </motion.div>

                    {/* Promo text - single line (timer removed in toggle system) */}
                    <motion.div
                      variants={itemVariants}
                      className="text-white text-xs sm:text-sm font-bold whitespace-nowrap"
                    >
                      {currentPromo.type === "one-time-packages" ? "ONE-TIME PROMO" : "MINI DRAW PROMO"}: Get{" "}
                      {currentPromo.multiplier}x entries on all{" "}
                      {currentPromo.type === "one-time-packages" ? "packages" : "mini packages"}!
                    </motion.div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Mobile layout - horizontal scrolling with animation */}
              <div className="sm:hidden">
                <div
                  className="flex items-center justify-center gap-1 text-white overflow-x-auto hide-scrollbar"
                  style={{
                    scrollbarWidth: "none",
                    msOverflowStyle: "none",
                  }}
                >
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`mobile-${currentPromoIndex}`}
                      className="flex items-center gap-2"
                      variants={bannerVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                    >
                      {/* Promo badge */}
                      <motion.div className="flex-shrink-0" variants={itemVariants}>
                        <PromoBadge multiplier={currentPromo.multiplier} size="small" />
                      </motion.div>

                      {/* Promo text (timer removed in toggle system) */}
                      <motion.div className="flex-shrink-0 text-white" variants={itemVariants}>
                        <div className="text-[10px] font-bold whitespace-nowrap">
                          {currentPromo.type === "one-time-packages" ? "ONE-TIME" : "MINI DRAW"}{" "}
                          {currentPromo.multiplier}x ENTRIES!
                        </div>
                      </motion.div>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* Animated background effect */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: `linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(239, 68, 68, 0.25) 25%, rgba(220, 38, 38, 0.35) 50%, rgba(185, 28, 28, 0.25) 75%, rgba(239, 68, 68, 0.15) 100%)`,
                animation: "pulse 2s infinite",
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default PromoCountdownBanner;
