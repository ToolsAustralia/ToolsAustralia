import { useState, useCallback } from "react";
import { LocalMembershipPlan } from "@/utils/membership/membership-adapters";

interface UseMembershipModalReturn {
  isModalOpen: boolean;
  selectedPlan: LocalMembershipPlan | null;
  openModal: (plan?: LocalMembershipPlan) => void;
  /**
   * Open the modal with package selection shown first (the "Enter now" behaviour).
   *
   * `defaultPlan` is the tier we recommend FOR the user (Foreman) — it sits behind the picker so
   * dismissing lands on a real, payable package instead of an empty payment step. Omit it to open
   * on a placeholder, which is what the dashboard CTAs do.
   */
  openModalWithPackageSelectionFirst: (defaultPlan?: LocalMembershipPlan) => void;
  closeModal: () => void;
  selectPlan: (plan: LocalMembershipPlan) => void;
  setSelectedPlan: (plan: LocalMembershipPlan | null) => void;
  /** When true, MembershipModal should receive membershipModalConfig={{ showPackageSelectionFirst: true }} */
  openWithPackageSelectionFirst: boolean;
}

/**
 * Custom hook for managing MembershipModal state and interactions
 * Provides a single source of truth for all MembershipModal operations
 */
export const useMembershipModal = (defaultPlan?: LocalMembershipPlan): UseMembershipModalReturn => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<LocalMembershipPlan | null>(defaultPlan || null);
  const [openWithPackageSelectionFirst, setOpenWithPackageSelectionFirst] = useState(false);

  /**
   * Open the membership modal with an optional plan
   * @param plan - Optional plan to pre-select when opening the modal
   */
  const openModal = useCallback((plan?: LocalMembershipPlan) => {
    console.log("🎯 Opening MembershipModal", plan ? `with plan: ${plan.name}` : "with default plan");
    setOpenWithPackageSelectionFirst(false);
    if (plan) {
      setSelectedPlan(plan);
    }
    setIsModalOpen(true);
  }, []);

  /**
   * Open the membership modal with package selection shown first (same as Enter now on promotions page).
   *
   * `defaultPlan` is the recommended tier, pre-selected BEHIND the picker: the user still chooses,
   * but backing out of the picker leaves them on a real package rather than a placeholder payment
   * step. Called with no argument the behaviour is the original one (no plan at all).
   */
  const openModalWithPackageSelectionFirst = useCallback((defaultPlan?: LocalMembershipPlan) => {
    console.log("🎯 Opening MembershipModal with package selection first");
    setSelectedPlan(defaultPlan ?? null);
    setOpenWithPackageSelectionFirst(true);
    setIsModalOpen(true);
  }, []);

  /**
   * Close the membership modal and reset state
   */
  const closeModal = useCallback(() => {
    console.log("🔄 Closing MembershipModal");
    setIsModalOpen(false);
    setSelectedPlan(null);
    setOpenWithPackageSelectionFirst(false);
  }, []);

  /**
   * Select a plan within the modal (for plan switching)
   * @param plan - The plan to select
   */
  const selectPlan = useCallback((plan: LocalMembershipPlan) => {
    console.log("📋 Selecting plan in modal:", plan.name);
    setSelectedPlan(plan);
  }, []);

  return {
    isModalOpen,
    selectedPlan,
    openModal,
    openModalWithPackageSelectionFirst,
    closeModal,
    selectPlan,
    setSelectedPlan,
    openWithPackageSelectionFirst,
  };
};


















