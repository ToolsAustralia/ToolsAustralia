"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import DashboardLoader from "@/components/loading/DashboardLoader";
import { useThemeStore } from "@/stores/useThemeStore";
import { usePromoThemeExperiment } from "@/hooks/ab-testing/usePromoThemeExperiment";

/** True once the theme decision is final and promo content may paint. */
const PromoThemeSettledContext = createContext(true);
export function usePromoThemeSettled(): boolean {
  return useContext(PromoThemeSettledContext);
}

interface Props {
  experimentId: string | null;
  children: ReactNode;
}

/**
 * Hold the promo landing on a full-screen loader until the default-theme arm is
 * decided, so a bucketed visitor never sees light snap to dark.
 *
 * OVERLAY, not replacement. `/promotions/[slug]` is ISR-static and deliberately
 * server-renders eight sections for SEO; returning a loader INSTEAD of children
 * would make the shared CDN document a spinner for every visitor, both arms, and
 * for crawlers. So children always render and the loader sits on top
 * (`.ta-loader-root` is already `fixed inset-0` and opaque).
 */
export function PromoThemeExperimentGate({ experimentId, children }: Props) {
  const { settled, theme } = usePromoThemeExperiment(experimentId);
  const [revealed, setRevealed] = useState(() => settled);
  const appliedRef = useRef(false);

  useEffect(() => {
    if (!settled || appliedRef.current) return;
    appliedRef.current = true;

    // ORDER IS LOAD-BEARING. Nothing applies `.dark` synchronously on a theme
    // change: ThemeContext does it in an effect, and useThemeStore.setState
    // lands on a different lane from setRevealed. Writing the class by hand
    // FIRST, then committing the reveal inside flushSync, guarantees the content
    // and the loader teardown paint in one frame with the final theme already
    // on <html>. Persisting via setState must come LAST — it is bookkeeping,
    // not the mechanism.
    const resolved = theme ?? (document.documentElement.classList.contains("dark") ? "dark" : "light");
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    root.style.colorScheme = resolved;

    flushSync(() => setRevealed(true));

    if (theme !== null) {
      useThemeStore.setState({ theme });
    }
  }, [settled, theme]);

  return (
    <PromoThemeSettledContext.Provider value={revealed}>
      <div inert={!revealed} aria-hidden={!revealed ? true : undefined}>
        {children}
      </div>
      {!revealed && <DashboardLoader label="Loading the giveaway…" />}
    </PromoThemeSettledContext.Provider>
  );
}
