"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePromoTheme } from "@/stores/usePromoThemeStore";

export default function FloatingGetEntriesButton() {
  const [isVisible, setIsVisible] = useState(false);
  const [isInWinnersOrHowItWorks, setIsInWinnersOrHowItWorks] = useState(false);

  // Handle scroll detection for visibility + animate when Winners or How it Works in view
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const heroSectionHeight = window.innerHeight;
      const viewportHeight = window.innerHeight;

      const allSections = document.querySelectorAll("section");
      let unlockDiscountsSection: HTMLElement | null = null;

      for (const section of allSections) {
        const sectionElement = section as HTMLElement;
        if (sectionElement.textContent?.includes("Unlock Partner Discounts")) {
          unlockDiscountsSection = sectionElement;
          break;
        }
      }

      let shouldHide = false;
      if (unlockDiscountsSection) {
        const sectionTop = unlockDiscountsSection.offsetTop;
        shouldHide = scrollY >= sectionTop - 200;
      }

      setIsVisible(scrollY > heroSectionHeight && !shouldHide);

      // Check if Winners or How it Works sections are in view (animate button)
      const winners = document.getElementById("latest-winners");
      const howItWorks = document.getElementById("how-it-works");
      const checkInView = (el: HTMLElement | null) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.top < viewportHeight * 0.85 && r.bottom > viewportHeight * 0.15;
      };
      setIsInWinnersOrHowItWorks(checkInView(winners) || checkInView(howItWorks));
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const theme = usePromoTheme();
  const handleGetEntries = () => {
    const packagesSection = document.getElementById("packages");
    if (packagesSection) {
      packagesSection.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0, y: 100 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0, y: 100 }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 20,
            duration: 0.5,
          }}
          className="fixed bottom-12 sm:bottom-14 left-0 right-0 flex justify-center z-50"
        >
          <motion.button
            onClick={handleGetEntries}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`group relative inline-flex items-center justify-center px-6 py-2 sm:px-10 sm:py-2.5 rounded-full font-extrabold text-sm sm:text-lg tracking-wide text-white 
                       border border-white/20 backdrop-blur-lg transition-all duration-300
                       ${isInWinnersOrHowItWorks ? "promo-hero-cta-button shimmer-once overflow-hidden" : ""}`}
            style={
              isInWinnersOrHowItWorks
                ? { background: theme.gradientSolid }
                : {
                    background: theme.gradientSolid,
                    boxShadow: `0 0 40px ${theme.shadowRgba}`,
                  }
            }
          >
            <span className="relative z-10">GET ENTRIES</span>

            {!isInWinnersOrHowItWorks && (
              <span
                className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ border: `1px solid ${theme.borderRgba}` }}
              />
            )}
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
