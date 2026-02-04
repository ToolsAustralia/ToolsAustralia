import { useState, useCallback } from "react";
import { LocalMembershipPlan } from "@/utils/membership/membership-adapters";

interface UseMembershipModalReturn {
  isModalOpen: boolean;
  selectedPlan: LocalMembershipPlan | null;
  openModal: (plan?: LocalMembershipPlan) => void;
  /** Open modal and show package selection first (same as Enter now on promotions page). Clears any pre-selected plan. */
  openModalWithPackageSelectionFirst: () => void;
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
   * Clears any pre-selected plan so the user sees all packages.
   */
  const openModalWithPackageSelectionFirst = useCallback(() => {
    console.log("🎯 Opening MembershipModal with package selection first");
    setSelectedPlan(null);
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


















