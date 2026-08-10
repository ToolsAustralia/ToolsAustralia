"use client";

import { useState, useEffect } from "react";
import { m, AnimatePresence } from "framer-motion";
import { usePromoTheme, usePromoThemeStore } from "@/stores/usePromoThemeStore";
import { addRAFScrollListener, addThrottledResize } from "@/utils/dom/listenerHelpers";

/** Button hides once the unlock-discounts section top is within this many px of the viewport top. */
const HIDE_OFFSET_PX = 200;

export default function FloatingGetEntriesButton() {
  const [isVisible, setIsVisible] = useState(false);
  const [isInWinnersOrHowItWorks, setIsInWinnersOrHowItWorks] = useState(false);

  // Visibility = past the hero AND not yet at the unlock-discounts section;
  // pulse animation while the Winners / How-it-works sections are in the
  // 15%–85% viewport band. All section geometry is observed via
  // IntersectionObserver — the per-frame scroll handler only compares
  // scrollY against the viewport height (no DOM queries / layout reads).
  useEffect(() => {
    let pastHero = window.scrollY > window.innerHeight;
    let hidden = false;
    const apply = () => setIsVisible(pastHero && !hidden);

    // (a) Unlock-discounts hide state. The region [-100000px, HIDE_OFFSET_PX]
    // (huge top rootMargin) makes `isIntersecting` ⇔ "section top has crossed
    // the HIDE_OFFSET_PX line or is above it" — a half-open region, so even a
    // programmatic scroll jump can't skip past it unnoticed. Bottom margin
    // depends on viewport height → observer is rebuilt on (throttled) resize.
    let unlockEl: HTMLElement | null = null;
    let hideObserver: IntersectionObserver | null = null;
    const buildHideObserver = () => {
      hideObserver?.disconnect();
      hideObserver = null;
      if (!unlockEl) return;
      hideObserver = new IntersectionObserver(
        (entries) => {
          const next = entries[entries.length - 1].isIntersecting;
          if (next !== hidden) {
            hidden = next;
            apply();
          }
        },
        { rootMargin: `100000px 0px ${HIDE_OFFSET_PX - window.innerHeight}px 0px` }
      );
      hideObserver.observe(unlockEl);
    };

    // (b) Winners / How-it-works band. rootMargin -15% top/bottom shrinks the
    // root to the 15%–85% band, replicating the old per-frame
    // `top < 0.85·vh && bottom > 0.15·vh` check. Percent margins track
    // viewport resizes automatically.
    const bandStates = new Map<Element, boolean>();
    const bandObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) bandStates.set(entry.target, entry.isIntersecting);
        let anyInBand = false;
        bandStates.forEach((v) => {
          if (v) anyInBand = true;
        });
        setIsInWinnersOrHowItWorks(anyInBand);
      },
      { rootMargin: "-15% 0px -15% 0px" }
    );

    // All three target sections are lazy-loaded (next/dynamic), so they can
    // mount well after this button. Resolve them once each via a slow poll —
    // cheaper and simpler than a MutationObserver, and 2 getElementById
    // calls/sec is negligible. Poll stops once everything is found.
    const tryResolveTargets = (): boolean => {
      if (!unlockEl) {
        unlockEl = document.getElementById("unlock-partner-discounts");
        if (unlockEl) buildHideObserver();
      }
      for (const id of ["latest-winners", "how-it-works"]) {
        const el = document.getElementById(id);
        if (el && !bandStates.has(el)) {
          bandStates.set(el, false);
          bandObserver.observe(el);
        }
      }
      return unlockEl !== null && bandStates.size === 2;
    };

    let pollId: number | undefined;
    if (!tryResolveTargets()) {
      pollId = window.setInterval(() => {
        if (tryResolveTargets() && pollId !== undefined) {
          window.clearInterval(pollId);
          pollId = undefined;
        }
      }, 500);
    }

    apply();
    const removeScroll = addRAFScrollListener(window, (scrollY) => {
      // innerHeight is a viewport metric (not a layout read) and must be read
      // live: mobile URL-bar collapse changes it mid-scroll.
      const next = scrollY > window.innerHeight;
      if (next !== pastHero) {
        pastHero = next;
        apply();
      }
    });
    const removeResize = addThrottledResize(buildHideObserver);

    return () => {
      removeScroll();
      removeResize();
      if (pollId !== undefined) window.clearInterval(pollId);
      hideObserver?.disconnect();
      bandObserver.disconnect();
    };
  }, []);

  const theme = usePromoTheme();
  const currentSlug = usePromoThemeStore((s) => s.slug);
  const preferDark = theme.preferDarkBackground ?? false;
  const shouldUseBlackText = preferDark || (currentSlug ?? "").startsWith("dewalt-");
  const handleGetEntries = () => {
    const packagesSection = document.getElementById("packages");
    if (packagesSection) {
      packagesSection.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <m.div
          initial={{ opacity: 0, scale: 0, y: 100 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0, y: 100 }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 20,
            duration: 0.5,
          }}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-0 right-0 flex justify-center z-50 pointer-events-none"
        >
          <m.button
            // The obstacle contract goes on the PILL, not the full-width centering wrapper.
            // The wrapper spans the viewport, so measuring it made the corner controls dodge
            // a bar that visually never reaches them. See docs/shared-ui/frontend.md.
            data-floating-widget="true"
            onClick={handleGetEntries}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={`group relative pointer-events-auto inline-flex items-center justify-center gap-1.5 px-6 py-2.5 sm:px-8 sm:py-3 md:px-10 md:py-3 rounded-full font-extrabold text-sm sm:text-base md:text-lg tracking-wide ${shouldUseBlackText ? "text-black" : "text-white"}
                       border border-white/20 backdrop-blur-[var(--ta-blur)] transition-all duration-300
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
            <span className="relative z-10">Enter Now</span>

            {!isInWinnersOrHowItWorks && (
              <span
                className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ border: `1px solid ${theme.borderRgba}` }}
              />
            )}
          </m.button>
        </m.div>
      )}
    </AnimatePresence>
  );
}
