import { useState, useCallback } from "react";
import { LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { useRouter } from "next/navigation";
import { useUserContext } from "@/contexts/UserContext";
import {
  resolveSubscriptionCreationGate,
  isSubscriptionPlan,
} from "@/utils/subscription/subscription-creation-gate";

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

  const router = useRouter();
  const { userData, loading: userLoading } = useUserContext();

  /**
   * Open the membership modal with an optional plan
   * @param plan - Optional plan to pre-select when opening the modal
   */
  const openModal = useCallback(
    (plan?: LocalMembershipPlan) => {
      // Gate covers every call that passes the plan through THIS function's own argument
      // — package cards and the /membership deep-link do that today. It does NOT see a
      // plan set any other way: a caller that does `setSelectedPlan(plan)` and then calls
      // `openModal()` with no argument bypasses this check, because a plan-less open reads
      // as "not a subscription" below and the gate never inspects `selectedPlan` state.
      // Three live call sites still use that bypass shape (MembershipSection.tsx's
      // deep-link + global-event handlers, my-account/page-client.tsx's global-event
      // handler) — Task 4 converts them to pass the plan through the argument, closing
      // this gap. Not exploitable today (the server still rejects the create), but this
      // comment should not claim more coverage than the code has.
      //
      // A plan-less open is NOT treated as a subscription (spec D6): it opens the picker,
      // and the picker is how a blocking-sub member buys a PACK, which is allowed and is
      // live revenue. A dedicated pre-warm backstop for that path is planned as a
      // follow-up task and is not on this branch yet.
      const gate = resolveSubscriptionCreationGate(userData, {
        isSubscriptionPlan: plan ? isSubscriptionPlan(plan) : false,
        userLoading,
      });
      if (!gate.allowed) {
        router.push(gate.redirectTo);
        return;
      }

      setOpenWithPackageSelectionFirst(false);
      if (plan) {
        setSelectedPlan(plan);
      }
      setIsModalOpen(true);
    },
    [router, userData, userLoading]
  );

  /**
   * Open the membership modal with package selection shown first (same as Enter now on promotions page).
   *
   * `defaultPlan` is the recommended tier, pre-selected BEHIND the picker: the user still chooses,
   * but backing out of the picker leaves them on a real package rather than a placeholder payment
   * step. Called with no argument the behaviour is the original one (no plan at all).
   */
  const openModalWithPackageSelectionFirst = useCallback(
    (defaultPlan?: LocalMembershipPlan) => {
      // Same gate. `defaultPlan` sits BEHIND the picker, so it only blocks when the
      // caller explicitly pre-selects a membership tier for a blocking-sub member.
      const gate = resolveSubscriptionCreationGate(userData, {
        isSubscriptionPlan: defaultPlan ? isSubscriptionPlan(defaultPlan) : false,
        userLoading,
      });
      if (!gate.allowed) {
        router.push(gate.redirectTo);
        return;
      }

      setSelectedPlan(defaultPlan ?? null);
      setOpenWithPackageSelectionFirst(true);
      setIsModalOpen(true);
    },
    [router, userData, userLoading]
  );

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


















