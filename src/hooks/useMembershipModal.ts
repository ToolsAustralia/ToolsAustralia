import { useState, useCallback, useRef } from "react";
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
   *
   * Deliberately NOT gated on `defaultPlan`: the picker is how a member with a blocking
   * subscription buys a pack, and the parked default is not their choice. The step-2 pre-warm
   * backstop guards whatever they actually pick — see the implementation comment.
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
   * The gate must read the user's state AT CALL TIME, not at the time the callback was
   * captured — so it lives in a ref refreshed on every render rather than in the callbacks'
   * closures.
   *
   * The bug this closes was deterministic, not a race. `my-account/membership/page-client.tsx`'s
   * past-due tier switch does `await invalidateQueries(users.detail)` and THEN calls
   * `openModal(plan)`. The click captured `openModal` while the member was — by definition —
   * `past_due`; awaiting a refetch cannot refresh an already-captured closure, so the gate
   * still read `past_due` and redirected to `?open=payment`. By then the switch had already
   * succeeded and the subscription was `canceled` with its invoice voided, stranding the
   * member on a payment sheet for a subscription that no longer existed. Any future async
   * caller (refetch → open) would have hit the same trap, which is why this is fixed here and
   * not at that one call site.
   *
   * Stabilising both callbacks' identity is a side benefit, not the point. No consumer
   * depends on that identity changing when `userData` does: the hook returns a fresh object
   * literal every render anyway, so effects keyed on the returned object re-run regardless.
   */
  const gateInputsRef = useRef({ userData, userLoading });
  gateInputsRef.current = { userData, userLoading };

  /**
   * Open the membership modal with an optional plan
   * @param plan - Optional plan to pre-select when opening the modal
   */
  const openModal = useCallback(
    (plan?: LocalMembershipPlan) => {
      // The gate covers every call that passes the plan through THIS function's own
      // argument — package cards, the `/membership` abandoned-checkout deep-link, and
      // (since 2026-09-01) the global `openMembershipModal`-event handlers in
      // MembershipSection.tsx and my-account/page-client.tsx all call it that way now.
      // It still does NOT see a plan set any other way: a caller that does
      // `setSelectedPlan(plan)` and then calls `openModal()` with no argument still
      // bypasses this check, BY DESIGN — see spec D6 below for why that has to stay open.
      // The one remaining live instance of that shape is `useMajorDrawEntryCta.ts`'s
      // `openEntryFlow` (`setSelectedPlan(correctPlan)` + a bare `openModal()`,
      // ~line 373). It is safe only because of an invariant of THAT caller, not of this
      // function: `correctPlan` there is a ONE-TIME plan whenever the user has a blocking
      // subscription (gate allows one-time regardless), and can only be a SUBSCRIPTION
      // plan when the user has none (gate allows any plan for a non-blocking user). Verify
      // that still holds before adding a second caller of this bypass shape.
      //
      // A plan-less open is NOT treated as a subscription (spec D6): it opens the picker,
      // and the picker is how a blocking-sub member buys a PACK, which is allowed and is
      // live revenue. If a blocking-sub member instead picks a SUBSCRIPTION tier from
      // that picker — or the gate above allowed a subscription plan through because
      // `userLoading` was still true when this ran — a second check backstops step 2:
      // `stepTwoGate` in MembershipModal/index.tsx (~line 1253) re-runs this same gate
      // immediately before the payment pre-warm fires and redirects instead of letting
      // the pre-warm 409 silently.
      const { userData: currentUserData, userLoading: currentUserLoading } = gateInputsRef.current;
      const gate = resolveSubscriptionCreationGate(currentUserData, {
        isSubscriptionPlan: plan ? isSubscriptionPlan(plan) : false,
        userLoading: currentUserLoading,
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
    [router]
  );

  /**
   * Open the membership modal with package selection shown first (same as Enter now on promotions page).
   *
   * `defaultPlan` is the recommended tier, pre-selected BEHIND the picker: the user still chooses,
   * but backing out of the picker leaves them on a real package rather than a placeholder payment
   * step. Called with no argument the behaviour is the original one (no plan at all).
   *
   * Because that default is ours and not theirs, it is not gated — see below.
   */
  const openModalWithPackageSelectionFirst = useCallback(
    (defaultPlan?: LocalMembershipPlan) => {
      // This function does NOT gate on `defaultPlan` — it always asks the gate as if the
      // open were plan-less (`isSubscriptionPlan: false`), which the gate always allows.
      //
      // Why: `defaultPlan` is not a user choice. It is the tier we recommend, parked BEHIND
      // the picker purely so that backing out of the picker lands on a real package instead
      // of an empty payment step. Semantically that is the same plan-less open spec D6
      // deliberately leaves open, and for D6's exact reason — the picker is how a member with
      // a blocking subscription buys a PACK, which is allowed and is live revenue. Gating on
      // the parked default would deny `paused` / `unpaid` / `past_due` members that path from
      // draw-results, the dashboard and the rewards page, and would make the two global
      // `openMembershipModal` listeners disagree for identical input (one passes the plan
      // through, one substitutes a tier).
      //
      // What guards the picker instead: `stepTwoGate` in MembershipModal/index.tsx (~line
      // 1285) re-runs this same gate on whatever the member ACTUALLY selects, immediately
      // before the payment pre-warm fires. A subscription tier chosen from the picker is
      // caught there — which is the right layer for that decision, because that is the first
      // moment a real choice exists.
      //
      // The gate call is kept (rather than dropped) so this stays a chokepoint: a future
      // reason to block that does not depend on the plan type would apply here too.
      const { userData: currentUserData, userLoading: currentUserLoading } = gateInputsRef.current;
      const gate = resolveSubscriptionCreationGate(currentUserData, {
        isSubscriptionPlan: false,
        userLoading: currentUserLoading,
      });
      if (!gate.allowed) {
        router.push(gate.redirectTo);
        return;
      }

      setSelectedPlan(defaultPlan ?? null);
      setOpenWithPackageSelectionFirst(true);
      setIsModalOpen(true);
    },
    [router]
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


















