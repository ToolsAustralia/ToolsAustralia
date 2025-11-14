import { useState, useCallback } from "react";
import { LocalMembershipPlan } from "@/utils/membership/membership-adapters";

interface UseMembershipModalReturn {
  isModalOpen: boolean;
  selectedPlan: LocalMembershipPlan | null;
  openModal: (plan?: LocalMembershipPlan) => void;
  closeModal: () => void;
  selectPlan: (plan: LocalMembershipPlan) => void;
  setSelectedPlan: (plan: LocalMembershipPlan | null) => void;
}

/**
 * Custom hook for managing MembershipModal state and interactions
 * Provides a single source of truth for all MembershipModal operations
 */
export const useMembershipModal = (defaultPlan?: LocalMembershipPlan): UseMembershipModalReturn => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<LocalMembershipPlan | null>(defaultPlan || null);

  /**
   * Open the membership modal with an optional plan
   * @param plan - Optional plan to pre-select when opening the modal
   */
  const openModal = useCallback((plan?: LocalMembershipPlan) => {
    console.log("🎯 Opening MembershipModal", plan ? `with plan: ${plan.name}` : "with default plan");

    if (plan) {
      setSelectedPlan(plan);
    }
    setIsModalOpen(true);
  }, []);

  /**
   * Close the membership modal and reset state
   */
  const closeModal = useCallback(() => {
    console.log("🔄 Closing MembershipModal");
    setIsModalOpen(false);
    setSelectedPlan(null);
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
    closeModal,
    selectPlan,
    setSelectedPlan,
  };
};


















