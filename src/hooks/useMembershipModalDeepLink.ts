"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
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
 * Edge cases handled:
 * - `useMemberships()` still loading → defers until data arrives.
 * - `packageId` doesn't resolve to a known package → URL still cleaned, but
 *   the modal does NOT open (avoids loud errors on stale links).
 * - Listener installed via setTimeout(0) so the host's modal state and any
 *   downstream `openMembershipModal` listeners are ready before we dispatch.
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
  const router = useRouter();
  const pathname = usePathname();
  const { subscriptionPackages, oneTimePackages, loading } = useMemberships();

  useEffect(() => {
    if (loading) return;

    const openFlag = searchParams?.get("openMembership");
    const packageId = searchParams?.get("packageId");
    if (openFlag !== "1" || !packageId) return;

    // Resolve the API plan by canonical packageId; fall back to silent no-op
    // if the link is stale and the package no longer exists.
    const apiPlan = [...subscriptionPackages, ...oneTimePackages].find(
      (p) => p._id === packageId,
    );

    // Always clean URL params (even when package not found) so refreshing
    // the page doesn't loop or surface the stale params anywhere.
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    next.delete("openMembership");
    next.delete("packageId");
    const nextSearch = next.toString();
    router.replace(`${pathname}${nextSearch ? `?${nextSearch}` : ""}`, {
      scroll: false,
    });

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
      onOpen(convertToLocalPlan(apiPlan));
    }, 0);

    return () => clearTimeout(timer);
  }, [
    searchParams,
    subscriptionPackages,
    oneTimePackages,
    loading,
    onOpen,
    pathname,
    router,
  ]);
}
