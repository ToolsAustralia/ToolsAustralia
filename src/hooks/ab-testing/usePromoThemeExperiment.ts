"use client";

import { useEffect, useRef, useState } from "react";
import type { VariantConfig } from "@/models/ab-testing/Variant";

/** Sentinel slug target. Must match the experiment's slugTargets and the seed script. */
export const PROMO_THEME_SLUG = "__promo-theme__";

/** Device-scoped marker: this device already resolved this experiment. */
export function promoThemeMarkerKey(experimentId: string): string {
  return `ta_promo_theme_${experimentId}`;
}

interface Resolved {
  settled: boolean;
  theme: "light" | "dark" | null;
}

/** True when the visitor has picked a theme themselves — they are not in the test. */
function hasManualThemeChoice(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem("ta-theme");
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { state?: { userManualOverride?: unknown } } | null;
    return parsed?.state?.userManualOverride === true;
  } catch {
    return false;
  }
}

/**
 * Resolve the promo landing default-theme arm for this visitor.
 *
 * Returns `settled: true` SYNCHRONOUSLY (before any request) when the visitor is
 * not in the test — no active experiment, a manual theme choice, or this device
 * already resolved it. That matters: the gate derives its initial state from
 * `settled`, so a synchronous `true` means the overlay never enters the DOM at
 * all for the common case, rather than mounting and unmounting.
 *
 * `theme` is non-null only when a NEW decision needs applying; a returning
 * device gets `null` because the theme is already in `ta-theme` and the
 * CSP-hashed bootstrap snippet applied it before paint.
 */
export function usePromoThemeExperiment(experimentId: string | null): Resolved {
  const [state, setState] = useState<Resolved>(() => {
    // `experimentId` is resolved server-side and baked into the prerendered,
    // CDN-shared HTML — it is the same for every visitor of a given ISR
    // snapshot, so this check needs neither `window` nor `localStorage` and
    // MUST run before the environment guard below. If the order were
    // flipped, the server pass (where `window` is always undefined) would
    // bake `settled: false` into the shared HTML even when no experiment is
    // active, and the later gate would render a full-screen overlay for
    // every visitor of that snapshot — including crawlers. Do not "tidy"
    // this back to environment-check-first.
    if (!experimentId) return { settled: true, theme: null };
    if (typeof window === "undefined") return { settled: false, theme: null };
    if (hasManualThemeChoice()) return { settled: true, theme: null };
    try {
      if (localStorage.getItem(promoThemeMarkerKey(experimentId))) {
        return { settled: true, theme: null };
      }
    } catch {
      /* storage unavailable — fall through and resolve over the network */
    }
    return { settled: false, theme: null };
  });

  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    if (state.settled) return;
    if (!experimentId) {
      setState({ settled: true, theme: null });
      return;
    }

    let aborted = false;
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch("/api/ab-testing/assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ experimentId, slug: PROMO_THEME_SLUG }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`assign ${res.status}`);
        const data = (await res.json()) as { variantConfig: VariantConfig | null };
        const assigned = data.variantConfig?.promoTheme?.defaultTheme;
        const theme = assigned === "dark" ? "dark" : "light";
        try {
          localStorage.setItem(promoThemeMarkerKey(experimentId), theme);
        } catch {
          /* ignore quota errors — worst case the hold recurs next session */
        }
        if (!aborted) setState({ settled: true, theme });
      } catch {
        // Network/abort/admin-excluded -> control. Reveal in light rather than
        // holding the page: a stuck loader is worse than a control impression.
        if (!aborted) setState({ settled: true, theme: "light" });
      }
    })();

    return () => {
      aborted = true;
      controller.abort();
    };
    // `state.settled` is read once for the early-out; re-running on its change
    // would re-fire the request. The ranRef guard makes this effect single-shot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experimentId]);

  // Guard: if the visitor toggled the theme in another tab between mount and
  // resolution, drop the assignment rather than overriding their choice.
  if (state.theme !== null && hasManualThemeChoice()) {
    return { settled: true, theme: null };
  }
  return state;
}
