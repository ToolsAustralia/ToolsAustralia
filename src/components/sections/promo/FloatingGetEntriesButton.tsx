"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function FloatingGetEntriesButton() {
  const [isVisible, setIsVisible] = useState(false);

  // Handle scroll detection
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const heroSectionHeight = window.innerHeight; // Full viewport height

      // Find the UnlockDiscounts section by looking for the section with the specific text
      const allSections = document.querySelectorAll("section");
      let unlockDiscountsSection: HTMLElement | null = null;

      // Look for section containing "Unlock Massive Partner Discounts" text
      for (const section of allSections) {
        const sectionElement = section as HTMLElement;
        if (sectionElement.textContent?.includes("Unlock Massive Partner Discounts")) {
          unlockDiscountsSection = sectionElement;
          break;
        }
      }

      let shouldHide = false;
      if (unlockDiscountsSection) {
        const sectionTop = unlockDiscountsSection.offsetTop;
        // Hide button when user reaches the UnlockDiscounts section
        shouldHide = scrollY >= sectionTop - 200; // Hide 200px before reaching the section
      }

      // Show button when user scrolls past the hero section, but hide when reaching UnlockDiscounts
      setIsVisible(scrollY > heroSectionHeight && !shouldHide);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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
            className="group relative inline-flex items-center justify-center px-6 py-2 sm:px-10 sm:py-2.5 rounded-full font-extrabold text-sm sm:text-lg tracking-wide text-white 
                       bg-gradient-to-br from-red-600 via-red-700 to-red-800 shadow-[0_0_40px_rgba(220,38,38,0.6)]
                       border border-white/20 backdrop-blur-lg transition-all duration-300 hover:shadow-[0_0_60px_rgba(239,68,68,0.8)]"
          >
            <span className="relative z-10">GET ENTRIES</span>

            {/* glowing ring animation */}
            <span className="absolute inset-0 rounded-full border border-red-400/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
