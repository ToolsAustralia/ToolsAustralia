"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Account Membership page. MembershipPackagesChart (this page was its last user)
// was removed on 2026-07-02. Removed from this page but KEPT (shared, used
// elsewhere): PartnerBenefitsPromoSection(Client), MembershipSection.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";
import dynamic from "next/dynamic";

import { useQueryClient } from "@tanstack/react-query";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useMembershipCardCta } from "@/hooks/useMembershipCardCta";
import { useMajorDrawPurchaseGate } from "@/hooks/useMajorDrawPurchaseGate";
import { useDashboardSheetStore } from "@/stores/useDashboardSheetStore";
import { useSavedPaymentMethods } from "@/hooks/useSavedPaymentMethods";
import { queryKeys } from "@/lib/queryKeys";
import type SubscriptionManagementModalType from "@/components/modals/SubscriptionManagementModal";
import DashboardPageHeader from "../components/DashboardPageHeader";
import MembershipCurrentPlan from "@/components/sections/account-membership/MembershipCurrentPlan";
import MembershipTierList from "@/components/sections/account-membership/MembershipTierList";
import PastDueTierSwitchModal from "@/components/sections/account-membership/PastDueTierSwitchModal";
import DashboardLoader from "@/components/loading/DashboardLoader";
import type { LocalMembershipPlan } from "@/utils/membership/membership-adapters";

const MembershipModal = dynamic(() => import("@/components/modals/MembershipModal"), { ssr: false });
// Heavy money-path flow — mounted only when a tier change is requested.
const SubscriptionManagementModal = dynamic(() => import("@/components/modals/SubscriptionManagementModal"), { ssr: false });
type SubMgmtUser = React.ComponentProps<typeof SubscriptionManagementModalType>["user"];

export default function AccountMembershipPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const dash = useDashboardState();
  // Dashboard = the member's own account, so the one-time section shows their discounted
  // ADDITIONAL packs (subscription OR current-draw entries → additional-package access),
  // mirroring the control MembershipSection. Without this it always renders the public
  // one-time ladder (e.g. "VIP Pack $1000") instead of the member-priced additional-* packs.
  const cta = useMembershipCardCta({ includeAdditionalForMembers: true });
  // The switch is a resubscribe (new purchase) → gate the tap on the major-draw freeze, matching the
  // server gate on /api/stripe/switch-tier-past-due, so the destructive teardown never runs mid-freeze.
  const { whenGatesOpenElseGateModal } = useMajorDrawPurchaseGate();
  const openSheet = useDashboardSheetStore((s) => s.openSheet);
  const { paymentMethods, subscriptionDefaultPaymentMethodId } = useSavedPaymentMethods();

  const defaultCard =
    paymentMethods.find((m) => m.isDefault) ??
    paymentMethods.find((m) => m.paymentMethodId === subscriptionDefaultPaymentMethodId) ??
    paymentMethods[0];
  const cardMeta = defaultCard?.card;
  const cardLabel = cardMeta
    ? `${cardMeta.brand ? cardMeta.brand.charAt(0).toUpperCase() + cardMeta.brand.slice(1) : "Card"} •••• ${cardMeta.last4}`
    : undefined;

  // Change-tier: tapping a different tier opens the proven orchestrator, pre-targeted
  // to that tier so it jumps straight to the upgrade/downgrade confirm.
  const queryClient = useQueryClient();
  const [changeTierName, setChangeTierName] = React.useState<string | null>(null);
  const onSubscriptionUpdate = () => {
    const userId = session?.user?.id;
    if (!userId) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.users.account(userId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.users.dashboard(userId) });
  };

  // Past-due tier switch: tapping a DIFFERENT tier while past-due can't upgrade/downgrade in
  // place (proration spawns a granting invoice — docs/PAST_DUE_REANCHOR.md). The confirm modal
  // runs the cancel+void teardown, then we open the ordinary subscribe flow for the new tier.
  const [switchTierPlan, setSwitchTierPlan] = React.useState<LocalMembershipPlan | null>(null);
  const onPastDueSwitched = async () => {
    const plan = switchTierPlan;
    setSwitchTierPlan(null);
    const userId = session?.user?.id;
    if (userId) {
      // Await the refetch so the subscribe flow sees the now-`canceled` state (not stale past-due).
      // Invalidate the base users.detail key (["users", id]) — it prefix-matches account + dashboard
      // AND the detail query UserContext + the subscribe modal actually read (account/dashboard-only
      // invalidation never refetches detail, so the modal would keep reading stale past_due).
      await queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
    }
    if (plan) cta.membershipModal.openModal(plan);
  };

  // Recovered-race: the teardown refused to cancel because Stripe already put the sub back to active
  // (a dunning retry succeeded). Close the confirm + refetch so the page re-renders as the resolved
  // active state instead of dead-ending on a red error.
  const onPastDueRecovered = () => {
    setSwitchTierPlan(null);
    const userId = session?.user?.id;
    if (userId) void queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(userId) });
  };

  React.useEffect(() => {
    if (status === "loading") return;
    if (!session) router.push("/login");
  }, [session, status, router]);

  if (status === "loading" || dash.isLoading) {
    return <DashboardLoader label="Loading your membership…" />;
  }

  if (!session) {
    return (
      <div className="min-h-screen-svh flex flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-xl font-semibold text-primary-token dark:text-white">Please sign in to manage your membership.</p>
        <Link href="/login" className="rounded-lg bg-red-600 px-6 py-3 font-semibold text-white hover:bg-red-700">Sign In</Link>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden pb-8">
      <DashboardPageHeader title="Membership" sub="Your plan & billing" icon={CreditCard} stateTheme={dash.stateTheme} />

      <div className="space-y-4 px-[18px] pb-8 pt-4 sm:px-6 lg:px-[26px]">
        <MembershipCurrentPlan
          acct={dash.acct}
          tierKey={dash.subscriptionTierKey}
          tierHex={dash.subscriptionTierHex}
          tierLabel={dash.subscriptionTierLabel}
          user={dash.user}
          paymentLabel={cardLabel}
          onManage={() => openSheet("manage")}
          onPayment={() => openSheet("payment")}
          onBecomeMember={() => {
            // Open with the Tradie SUBSCRIPTION preselected — identical to tapping the Tradie tier
            // card below (cta.onSelect handles the freeze gate + Started Checkout tracking).
            // Fallback to the package picker if the catalog hasn't resolved yet.
            const tradie = cta.membershipPlans.find((p) => p.name.trim().toLowerCase() === "tradie");
            if (tradie) cta.onSelect(tradie);
            else cta.membershipModal.openModalWithPackageSelectionFirst();
          }}
          onBuyPackage={() => cta.membershipModal.openModalWithPackageSelectionFirst()}
        />

        {/* Compact tier list + one-time-pack scroll (matches the prototype MembershipPage),
            driven by the verified useMembershipCardCta state machine. Member tier taps route
            to the real change-tier flow (Settings → Subscription). */}
        <MembershipTierList
          cta={cta}
          isMember={dash.acct === "active"}
          isPastDue={dash.acct === "pastdue"}
          currentTierKey={dash.subscriptionTierKey}
          onManagePlan={() => openSheet("manage")}
          onChangeTier={(name) => setChangeTierName(name)}
          onResolvePayment={() => openSheet("payment")}
          onSwitchTier={(plan) => whenGatesOpenElseGateModal(() => setSwitchTierPlan(plan))}
        />
      </div>

      <MembershipModal
        isOpen={cta.membershipModal.isModalOpen}
        onClose={cta.membershipModal.closeModal}
        selectedPlan={cta.membershipModal.selectedPlan}
        onPlanChange={cta.membershipModal.selectPlan}
        membershipModalConfig={
          cta.membershipModal.openWithPackageSelectionFirst ? { showPackageSelectionFirst: true } : undefined
        }
      />

      {dash.user && changeTierName !== null && (
        <SubscriptionManagementModal
          isOpen
          onClose={() => setChangeTierName(null)}
          user={dash.user as SubMgmtUser}
          onSubscriptionUpdate={onSubscriptionUpdate}
          autoSelectPlanName={changeTierName}
        />
      )}

      {switchTierPlan && (
        <PastDueTierSwitchModal
          isOpen
          onClose={() => setSwitchTierPlan(null)}
          currentTierLabel={dash.subscriptionTierLabel ?? "your plan"}
          newTierName={switchTierPlan.name}
          newTierPrice={switchTierPlan.price}
          onSwitched={onPastDueSwitched}
          onRecovered={onPastDueRecovered}
        />
      )}
    </div>
  );
}
