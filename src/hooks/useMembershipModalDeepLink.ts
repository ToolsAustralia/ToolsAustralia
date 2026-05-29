"use client";

import { useEffect, useRef } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { useMemberships } from "@/hooks/useMemberships";
import {
  convertToLocalPlan,
  type LocalMembershipPlan,
} from "@/utils/membership/membership-adapters";

/**
 * Reads `?openMembership=1&packageId=<id>` from the URL on mount and invokes
 * `onOpen(plan)` with the resolved `LocalMembershipPlan`. Cleans the URL
 * params after dispatching so refreshing doesn't loop.
 *
 * Powers the Klaviyo abandoned-checkout email's deep-link CTA — see
 * `buildCheckoutResumeUrl` in `src/utils/integrations/klaviyo/checkout-resume-url.ts`.
 *
 * Call this from any host page that renders `<MembershipModal>` with its own
 * `openModal` callback wired in. The callback is host-controlled because
 * different hosts need different gate logic (e.g. MembershipSection wraps the
 * open in `whenGatesOpenElseGateModal`, while /membership opens directly).
 *
 * **Single-fire guarantee (fixed 2026-05-29):** even though `onOpen` is
 * typically passed as an inline arrow function (new reference every render)
 * and `useSearchParams` may not propagate the post-`router.replace` URL
 * change before the next effect tick, this hook fires `onOpen` AT MOST ONCE
 * per mount. A `useRef` flag latches after the first dispatch and short-
 * circuits all subsequent effect runs. Without this lock, the inline-
 * callback re-render cascade combined with the async URL update caused the
 * deep-link logic to fire repeatedly — and when paired with the major-draw
 * loading race, that produced an unkillable "Gates Are Closed" modal loop.
 *
 * The `onOpen` callback is intentionally read from a ref (not the deps) so
 * its reference instability doesn't drive re-renders. The latest version is
 * always invoked — but only once.
 *
 * Edge cases handled:
 * - `useMemberships()` still loading → defers until data arrives.
 * - `packageId` doesn't resolve to a known package → URL still cleaned,
 *   `firedRef` still latched, modal does NOT open.
 * - URL params can be re-applied after firing (e.g. via browser back / next
 *   navigation) — the latch resets on unmount, so navigating back to the page
 *   with the deep-link params still works.
 *
 * NOT included: the deep-link does NOT re-fire `Started Checkout` Klaviyo
 * event. The original "Enter Now" click already fired the event that
 * triggered the abandoned-checkout flow; this is a follow-up to complete
 * the same funnel, not a fresh entry.
 */
export function useMembershipModalDeepLink(
  onOpen: (plan: LocalMembershipPlan) => void,
): void {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { subscriptionPackages, oneTimePackages, loading } = useMemberships();

  // Latch: once we have dispatched (or skipped due to stale link), don't
  // re-evaluate this mount cycle, regardless of how many times deps change
  // or how slowly the URL update propagates through useSearchParams.
  const firedRef = useRef(false);

  // Hold the latest onOpen in a ref so the effect can call the freshest
  // closure without listing onOpen in deps (avoids the inline-callback
  // re-render cascade that drove the original bug).
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);

  useEffect(() => {
    if (loading) return;
    if (firedRef.current) return;

    const openFlag = searchParams?.get("openMembership");
    const packageId = searchParams?.get("packageId");
    if (openFlag !== "1" || !packageId) return;

    // Latch immediately — before any side effect — so a re-render triggered
    // by router.replace / state changes below doesn't re-enter this branch.
    firedRef.current = true;

    // Resolve the API plan by canonical packageId; fall back to silent no-op
    // if the link is stale and the package no longer exists.
    const apiPlan = [...subscriptionPackages, ...oneTimePackages].find(
      (p) => p._id === packageId,
    );

    // Clean URL params via `window.history.replaceState` instead of
    // `router.replace`. DJ caught this: `router.replace` in Next.js App Router
    // triggers an RSC stream refetch on every call — visible as repeated
    // `GET /promotions/<slug>?utm_*` entries in the dev server terminal
    // (even though the browser network tab is silent because nothing is
    // navigating). React Strict Mode's double-mount + the modal-priority
    // store's re-render cascade amplified that into what looked like an
    // endless loop.
    //
    // `history.replaceState` updates the URL bar WITHOUT touching the router
    // — no RSC refetch, no log spam, no chance of cascading re-renders. The
    // `useSearchParams` hook won't see the change until React's next render
    // pass, but we don't care: the `firedRef` latch above ensures this effect
    // can't re-enter regardless of what `useSearchParams` returns.
    if (typeof window !== "undefined") {
      const next = new URLSearchParams(searchParams?.toString() ?? "");
      next.delete("openMembership");
      next.delete("packageId");
      const nextSearch = next.toString();
      window.history.replaceState(
        null,
        "",
        `${pathname}${nextSearch ? `?${nextSearch}` : ""}`,
      );
    }

    if (!apiPlan) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          `[useMembershipModalDeepLink] packageId="${packageId}" not found in current memberships data — skipping auto-open`,
        );
      }
      return;
    }

    // Defer to next tick so the host's downstream modal state and any
    // sibling `openMembershipModal` event listeners are installed first.
    const timer = setTimeout(() => {
      onOpenRef.current(convertToLocalPlan(apiPlan));
    }, 0);

    return () => clearTimeout(timer);
    // onOpen intentionally NOT in deps — read from ref above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, subscriptionPackages, oneTimePackages, loading, pathname]);
}
