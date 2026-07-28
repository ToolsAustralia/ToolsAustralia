"use client";

import { useEffect, useRef, useState } from "react";
import type { VariantConfig } from "@/models/ab-testing/Variant";
import { PROMO_THEME_SLUG, promoThemeMarkerKey } from "@/lib/ab-testing/promo-theme-slug";

/**
 * SAFETY NET, not a measurement device. A normal `/api/ab-testing/assign` call
 * completes in well under a second; at ~10x that this should essentially never
 * fire. It exists only so a server that accepts the connection and then stalls
 * (which `fetch` neither resolves nor rejects for) cannot leave the promo
 * landing behind the full-screen loader indefinitely — a paid-traffic page
 * stuck on a spinner is worse than an occasional early control reveal.
 *
 * If this fires with any regularity in production, treat the run as
 * CONTAMINATED, not as normal operation: re-tune this value from a measured
 * p99 of `POST /api/ab-testing/assign` (see the rollout runbook in
 * docs/superpowers/plans/2026-07-28-promo-theme-split.md and the caveat in
 * docs/ab-testing/frontend.md).
 */
const ASSIGN_BACKSTOP_MS = 6000;

interface Resolved {
  settled: boolean;
  theme: "light" | "dark" | null;
}

/** True when the visitor has picked a theme themselves — they are not in the test. */
function hasManualThemeChoiceFromStorage(storage: Storage): boolean {
  try {
    const raw = storage.getItem("ta-theme");
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { state?: { userManualOverride?: unknown } } | null;
    return parsed?.state?.userManualOverride === true;
  } catch {
    return false;
  }
}

/** `window.localStorage` can throw `SecurityError` on ACCESS (sandboxed/cross-origin
 * iframes, storage disabled by browser configuration) — not only on `.getItem`/
 * `.setItem`. So the property read itself must sit inside the try, not just the
 * method call that follows it. Every call site below must go through this helper
 * (or wrap the raw `localStorage` reference in its own try) rather than reference
 * `localStorage` bare.
 *
 * Exported (in addition to being used internally) so the access-throws case can
 * be unit-tested directly — see
 * `src/hooks/ab-testing/__tests__/promoThemeInitialState.test.ts`. */
export function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Render-time convenience wrapper over `hasManualThemeChoiceFromStorage` for the
 * real browser `localStorage`. Server-safe: `typeof window === "undefined"` short-circuits. */
function hasManualThemeChoice(): boolean {
  const storage = safeLocalStorage();
  if (!storage) return false;
  return hasManualThemeChoiceFromStorage(storage);
}

/**
 * Pure resolver for `usePromoThemeExperiment`'s `useState` initializer — extracted
 * so the ordering invariant below is unit-testable without a DOM (see
 * `src/hooks/ab-testing/__tests__/promoThemeInitialState.test.ts`, which is the
 * regression guard for the bug this ordering fixed).
 *
 * `storage` is the caller's `localStorage` on the client, or `null` to represent
 * "no window" (the server pass, or a client with storage genuinely unavailable).
 *
 * **Ordering constraint: `!experimentId` MUST be checked BEFORE `storage === null`.**
 * `experimentId` is resolved server-side and baked into the prerendered,
 * CDN-shared ISR HTML — it is identical for every visitor of a given snapshot, so
 * this check needs neither `window` nor `localStorage` and can safely run during
 * the server pass. If the order were flipped, the server pass (where `storage` is
 * always `null`) would bake `settled: false` into the shared HTML even when no
 * experiment is active, and the gate would render a full-screen overlay for every
 * visitor of that snapshot — including search-engine crawlers. Do not "tidy" this
 * back to storage-check-first.
 */
export function resolveInitialPromoThemeState(
  experimentId: string | null,
  storage: Storage | null,
): Resolved {
  if (!experimentId) return { settled: true, theme: null };
  if (!storage) return { settled: false, theme: null };
  if (hasManualThemeChoiceFromStorage(storage)) return { settled: true, theme: null };
  try {
    if (storage.getItem(promoThemeMarkerKey(experimentId))) {
      return { settled: true, theme: null };
    }
  } catch {
    /* storage unavailable — fall through and resolve over the network */
  }
  return { settled: false, theme: null };
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
  const [state, setState] = useState<Resolved>(() =>
    resolveInitialPromoThemeState(experimentId, safeLocalStorage()),
  );

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
      // `fetch` only rejects on a network error — a server that accepts the
      // connection and then stalls never resolves and never rejects, so a
      // timer is the only real backstop against sitting behind the loader
      // forever. `Promise.race` against a plain timeout, not an
      // `AbortController`: see the note below the effect for why this hook
      // deliberately never aborts the request.
      let backstopTimer: ReturnType<typeof setTimeout> | undefined;
      const backstop = new Promise<"backstop">((resolve) => {
        backstopTimer = setTimeout(() => resolve("backstop"), ASSIGN_BACKSTOP_MS);
      });

      try {
        const outcome = await Promise.race([
          fetch("/api/ab-testing/assign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ experimentId, slug: PROMO_THEME_SLUG }),
          }),
          backstop,
        ]);

        if (outcome === "backstop") {
          // The request is still in flight. `/api/ab-testing/assign` persists
          // the VariantAssignment row server-side before it builds the
          // response (see the no-abort note below), so this device's real
          // arm is already recorded and counted — reveal in light rather
          // than holding the page, and do NOT write the device marker: with
          // no theme known here, the next visit is free to retry.
          if (!abortedRef.current) setState({ settled: true, theme: "light" });
          return;
        }

        // The fetch won the race — no stray timer should fire later.
        clearTimeout(backstopTimer);

        const res = outcome;
        if (!res.ok) throw new Error(`assign ${res.status}`);
        const data = (await res.json()) as { variantConfig: VariantConfig | null };
        const assigned = data.variantConfig?.promoTheme?.defaultTheme;
        const theme = assigned === "dark" ? "dark" : "light";
        // Only mark this device as resolved when the server returned a USABLE
        // assignment. `variantConfig: null` (an admin-excluded visitor, or an
        // experiment activated with zero variants — a bad-state activation)
        // must not permanently pin this device to "light, no exposure" for
        // the life of the experiment: leaving the marker unwritten lets a
        // later visit retry once the bad state is fixed. Reveal in light
        // either way — there is nothing to apply without a real assignment.
        if (data.variantConfig) {
          try {
            localStorage.setItem(promoThemeMarkerKey(experimentId), theme);
          } catch {
            /* ignore quota errors — worst case the hold recurs next session */
          }
        }
        if (!abortedRef.current) setState({ settled: true, theme });
      } catch {
        // Network/abort/non-OK response -> control. Reveal in light rather
        // than holding the page: a stuck loader is worse than a control
        // impression.
        if (!abortedRef.current) setState({ settled: true, theme: "light" });
      } finally {
        // Defensive: covers the backstop-won early return (already fired,
        // so this is a no-op) and any throw before the explicit clear above.
        clearTimeout(backstopTimer);
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
    //    fetch finish is strictly better than cancelling it. The same reasoning
    //    is why the backstop above is a plain timer racing the fetch, not an
    //    `AbortController` — do not reintroduce one.
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
