"use client";

import { useEffect, useRef, useState } from "react";
import { useModalPriorityStore, type ModalType } from "@/stores/useModalPriorityStore";
import {
  isLandingCooldownActive,
  setLandingCooldownUntilMs,
  clearLandingCooldown,
  clearPostPurchaseLanding,
} from "@/utils/dashboard-landing-session";

const PRIMARY_LANDING_MODALS: ModalType[] = ["upsell", "user-setup"];

const COOLDOWN_MS = 4000;

/**
 * Coordinates secondary dashboard interrupts (explainer, refer-a-friend) and FAB spotlight
 * so they wait until primary landing modals (upsell / user-setup) finish plus a short cooldown.
 */
export function useDashboardLandingOrchestration(enabled: boolean) {
  const activeModal = useModalPriorityStore((s) => s.activeModal);
  const modalQueueLength = useModalPriorityStore((s) => s.modalQueue.length);
  const prevModalRef = useRef<ModalType | null>(null);
  const [cooldownRev, setCooldownRev] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const prev = prevModalRef.current;
    if (prev && PRIMARY_LANDING_MODALS.includes(prev) && activeModal === null) {
      clearPostPurchaseLanding();
      setLandingCooldownUntilMs(Date.now() + COOLDOWN_MS);
      setCooldownRev((x) => x + 1);
    }
    prevModalRef.current = activeModal;
  }, [activeModal, enabled]);

  // Re-render when cooldown window ends (sessionStorage timestamp passes)
  useEffect(() => {
    if (!enabled) return;
    if (!isLandingCooldownActive()) return;
    const id = window.setInterval(() => {
      if (!isLandingCooldownActive()) {
        clearLandingCooldown();
        setCooldownRev((x) => x + 1);
        window.clearInterval(id);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [enabled, activeModal, cooldownRev]);

  const cooldownActive = isLandingCooldownActive();
  const allowSecondaryModals = !activeModal && modalQueueLength === 0 && !cooldownActive;
  const suppressRewardsSpotlight = Boolean(activeModal) || cooldownActive;

  return { allowSecondaryModals, suppressRewardsSpotlight, cooldownActive };
}
