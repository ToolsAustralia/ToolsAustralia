"use client";

import { useEffect, useRef } from "react";
import { useMajorDrawPurchaseGate } from "@/hooks/useMajorDrawPurchaseGate";
import type { LocalMembershipPlan } from "@/utils/membership/membership-adapters";

/**
 * Wire a package section's MembershipModal to the global `openMembershipModal` event.
 *
 * The promo hero, giveaway countdown, and other entry CTAs open the membership flow by
 * dispatching a `window` `"openMembershipModal"` CustomEvent (via
 * `useMajorDrawEntryCta.openEntryFlow({ openLocalModal: false })`) rather than owning a modal
 * themselves. A package SECTION on the page is expected to listen for that event and open its
 * modal. If the section that renders on a given page doesn't listen, the hero "Enter Now" button
 * silently does nothing — which is exactly the bug that hit the A/B treatment when it replaced
 * the control section without re-implementing the listener.
 *
 * This hook centralizes that contract so any section (control, A/B treatment, or a future variant)
 * opts in with ONE line and cannot forget the plumbing:
 *   - it subscribes/unsubscribes to the event for the component's lifetime,
 *   - it forwards the pre-selected plan from `event.detail.plan` (may be undefined),
 *   - it forwards `event.detail.packageSelectionFirst` — the caller asked for the "Select Your
 *     Package" picker instead of a pre-selected tier (promotions-page CTAs), in which case there
 *     is no plan to forward,
 *   - and it applies the major-draw purchase gate automatically (matching the shared behavior),
 *     so callers only describe HOW to open their modal, never whether the gate allows it.
 *
 * `onOpen` is read through a ref, so the latest closure is always used without re-subscribing.
 */
export function useOpenMembershipModalListener(
  onOpen: (plan?: LocalMembershipPlan, options?: { packageSelectionFirst?: boolean }) => void,
): void {
  const { whenGatesOpenElseGateModal } = useMajorDrawPurchaseGate();

  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const gateRef = useRef(whenGatesOpenElseGateModal);
  gateRef.current = whenGatesOpenElseGateModal;

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail ?? {};
      const plan = detail.plan as LocalMembershipPlan | undefined;
      const packageSelectionFirst = detail.packageSelectionFirst === true;
      gateRef.current(() => onOpenRef.current(plan, { packageSelectionFirst }));
    };
    window.addEventListener("openMembershipModal", handler as EventListener);
    return () => window.removeEventListener("openMembershipModal", handler as EventListener);
  }, []);
}
