"use client";

import { useEffect } from "react";
import Script from "next/script";
import { KLAVIYO_QUEUE_SNIPPET } from "@/utils/security/inline-snippets";

/**
 * Klaviyo Script Loader Component
 *
 * Loads Klaviyo onsite JavaScript for browser tracking in TWO stages
 * (2026-07-19 perf split — see docs/tracking/rules.md):
 *
 * 1. `klaviyo-onsite-queue` (afterInteractive, ~1 KB inline): installs Klaviyo's
 *    official window.klaviyo Proxy + window._klOnsite queue ONLY. Any
 *    identify/track/page call made from hydration onward buffers here.
 * 2. `klaviyo-onsite-suite` (lazyOnload): the actual ~80 KB gz onsite suite
 *    (klaviyo.js + its 6 sub-bundles), deferred to browser idle after the load
 *    event so it never competes with hydration on ad-landing pages. When it
 *    arrives it drains the queue — nothing is dropped, only delivered later.
 *
 * DO NOT collapse these back into one lazyOnload script: the queue must exist at
 * afterInteractive or every event fired before browser idle (initial page view,
 * session identify, Viewed Giveaway) is silently dropped — the helpers in
 * `utils/tracking/klaviyo-helpers.ts` bail when window.klaviyo is undefined.
 *
 * New developers: this is the ONLY place we load the Klaviyo onsite script.
 * Do not copy/paste the snippet elsewhere – use the helpers in
 * `utils/tracking/klaviyo-helpers.ts` or the `useKlaviyoTracking` hook instead.
 *
 * @param companyId - Klaviyo Company ID (e.g., "X2Lz2L")
 * @param disabled - Whether to disable Klaviyo tracking (useful for development/testing)
 */
interface KlaviyoScriptLoaderProps {
  companyId?: string;
  disabled?: boolean;
}

export default function KlaviyoScriptLoader({ companyId, disabled = false }: KlaviyoScriptLoaderProps) {
  // Suite injection: idle-deferred BUT first-event-triggered (2026-07 final-review fix).
  // Pure lazyOnload lost every event queued before browser idle when the visitor bounced
  // (incl. the authed Started Checkout that triggers the abandoned-checkout email). The
  // first klaviyo push now loads the suite immediately, so a tracked visitor's events
  // ship as fast as pre-split; event-less visitors keep the full idle deferral.
  useEffect(() => {
    if (disabled || !companyId) return;

    const inject = () => {
      if (document.getElementById("klaviyo-onsite-suite")) return;
      const s = document.createElement("script");
      s.id = "klaviyo-onsite-suite";
      s.async = true;
      s.src = `https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=${companyId}`;
      s.setAttribute("data-tracking-pixel", "true");
      document.head.appendChild(s);
    };

    // First-event trigger: patch the queue's push. The queue snippet (afterInteractive)
    // may install _klOnsite before or after this effect runs, so retry briefly.
    let origPush: ((...args: unknown[]) => number) | null = null;
    let patchedQueue: unknown[] | null = null;
    const tryPatch = () => {
      const q = (window as { _klOnsite?: unknown[] })._klOnsite;
      if (!q || !Array.isArray(q) || origPush) return false;
      if (q.length > 0) {
        inject(); // events queued before we got here — ship them now
        return true;
      }
      origPush = q.push.bind(q);
      patchedQueue = q;
      q.push = (...args: unknown[]) => {
        inject();
        return origPush!(...args);
      };
      return true;
    };
    const patchTimers = [0, 500, 1500].map((ms) => window.setTimeout(tryPatch, ms));

    // Idle fallback: mirrors the old lazyOnload timing for visitors who never track.
    let idleHandle: number | null = null;
    let usedIdleCallback = false;
    let loadListener: (() => void) | null = null;
    const scheduleIdle = () => {
      if (typeof window.requestIdleCallback === "function") {
        usedIdleCallback = true;
        idleHandle = window.requestIdleCallback(inject, { timeout: 4000 });
      } else {
        idleHandle = window.setTimeout(inject, 3500);
      }
    };
    if (document.readyState === "complete") {
      scheduleIdle();
    } else {
      loadListener = scheduleIdle;
      window.addEventListener("load", loadListener, { once: true });
    }

    return () => {
      patchTimers.forEach(clearTimeout);
      if (idleHandle !== null) {
        if (usedIdleCallback && typeof window.cancelIdleCallback === "function") {
          window.cancelIdleCallback(idleHandle);
        } else {
          clearTimeout(idleHandle);
        }
      }
      if (loadListener) window.removeEventListener("load", loadListener);
      if (patchedQueue && origPush) patchedQueue.push = origPush; // restore
    };
  }, [companyId, disabled]);

  // If tracking is disabled or no company ID is configured, do not load Klaviyo.
  if (disabled || !companyId) {
    return null;
  }

  return (
    <Script
      id="klaviyo-onsite-queue"
      strategy="afterInteractive"
      data-tracking-pixel="true"
      // Klaviyo's official proxy/queue snippet, minus its script-injection tail
      // (the suite loads via the effect above: first event OR browser idle). The FIXED
      // string lives in inline-snippets.ts because its sha256 is allowlisted in
      // csp.ts — no nonce needed, no interpolation allowed.
      dangerouslySetInnerHTML={{ __html: KLAVIYO_QUEUE_SNIPPET }}
    />
  );
}
