"use client";

import { useEffect, useRef, useState } from "react";
import type { VariantConfig } from "@/models/ab-testing/Variant";
import { PROMO_THEME_SLUG, promoThemeMarkerKey } from "@/lib/ab-testing/promo-theme-slug";

// Re-exported so existing client-side importers of this hook module keep working. The
// DEFINITION site is now `@/lib/ab-testing/promo-theme-slug` — a boundary-neutral module —
// because a Server Component cannot read a value from a `"use client"` module (see that
// file's header comment). Server Components must import directly from there, not from here.
export { PROMO_THEME_SLUG, promoThemeMarkerKey };

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
  // Ref, not a per-invocation closure local: see the reset line at the top of
  // the effect below for why a plain `let aborted = false` inside the effect
  // body is NOT equivalent here and silently strands the hook.
  const abortedRef = useRef(false);

  useEffect(() => {
    // Strict Mode (dev-only) runs mount -> cleanup -> mount on the SAME
    // component instance, refs preserved. `ranRef` makes the FIRST mount the
    // only one that ever starts a fetch; the synthetic cleanup from that
    // first mount still runs, and it flips `abortedRef.current = true` (see
    // below). Un-poisoning it here, on every entry to this effect, cancels
    // that out on the second (real) mount, so the in-flight fetch from the
    // first mount is still allowed to settle state when it resolves. A
    // genuine final unmount never re-enters this effect, so the flag it set
    // in cleanup sticks for good and the eventual `setState` is correctly
    // skipped.
    abortedRef.current = false;

    if (ranRef.current) return;
    ranRef.current = true;
    if (state.settled) return;
    if (!experimentId) {
      setState({ settled: true, theme: null });
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/ab-testing/assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ experimentId, slug: PROMO_THEME_SLUG }),
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
        if (!abortedRef.current) setState({ settled: true, theme });
      } catch {
        // Network/abort/admin-excluded -> control. Reveal in light rather than
        // holding the page: a stuck loader is worse than a control impression.
        if (!abortedRef.current) setState({ settled: true, theme: "light" });
      }
    })();

    // Deliberately NOT aborting the in-flight request here. Two reasons:
    // 1. React Strict Mode's ref-preserving double-invoke (see above) would
    //    strand the request: the `ranRef` guard means only the FIRST mount
    //    ever starts a fetch, so cancelling it in cleanup would leave nothing
    //    for the second (real) mount to use, and the hook would never settle.
    // 2. Even outside Strict Mode, aborting buys nothing: `/api/ab-testing/assign`
    //    writes the VariantAssignment row server-side before it builds the
    //    response, so a client-side abort can't undo the assignment — it can
    //    only discard a result the server already persisted. Letting the
    //    fetch finish is strictly better than cancelling it.
    // `abortedRef` alone is sufficient to skip a setState after a REAL unmount.
    return () => {
      abortedRef.current = true;
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
