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
import { useDashboardSheetStore } from "@/stores/useDashboardSheetStore";
import { useSavedPaymentMethods } from "@/hooks/useSavedPaymentMethods";
import { queryKeys } from "@/lib/queryKeys";
import type SubscriptionManagementModalType from "@/components/modals/SubscriptionManagementModal";
import DashboardPageHeader from "../components/DashboardPageHeader";
import MembershipCurrentPlan from "@/components/sections/account-membership/MembershipCurrentPlan";
import MembershipTierList from "@/components/sections/account-membership/MembershipTierList";

const MembershipModal = dynamic(() => import("@/components/modals/MembershipModal"), { ssr: false });
// Heavy money-path flow — mounted only when a tier change is requested.
const SubscriptionManagementModal = dynamic(() => import("@/components/modals/SubscriptionManagementModal"), { ssr: false });
type SubMgmtUser = React.ComponentProps<typeof SubscriptionManagementModalType>["user"];

export default function AccountMembershipPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const dash = useDashboardState();
  const cta = useMembershipCardCta();
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

  React.useEffect(() => {
    if (status === "loading") return;
    if (!session) router.push("/login");
  }, [session, status, router]);

  if (status === "loading" || dash.isLoading) {
    return (
      <div className="min-h-screen-svh flex items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
      </div>
    );
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
    <div className="min-h-screen-svh w-full min-w-0 max-w-full overflow-x-hidden pb-8">
      <DashboardPageHeader title="Membership" sub="Your plan & billing" icon={CreditCard} stateTheme={dash.stateTheme} showBack />

      <div className="space-y-4 px-[18px] pb-8 pt-4 sm:px-6 lg:px-[26px]">
        <MembershipCurrentPlan
          acct={dash.acct}
          tierKey={dash.tierKey}
          tierHex={dash.tierHex}
          tierLabel={dash.tierLabel}
          user={dash.user}
          paymentLabel={cardLabel}
          onManage={() => openSheet("manage")}
          onPayment={() => openSheet("payment")}
          onBecomeMember={() => cta.membershipModal.openModal()}
          onBuyPackage={() => cta.membershipModal.openModal()}
        />

        {/* Compact tier list + one-time-pack scroll (matches the prototype MembershipPage),
            driven by the verified useMembershipCardCta state machine. Member tier taps route
            to the real change-tier flow (Settings → Subscription). */}
        <MembershipTierList
          cta={cta}
          isMember={dash.acct === "active"}
          onManagePlan={() => openSheet("manage")}
          onChangeTier={(name) => setChangeTierName(name)}
        />
      </div>

      <MembershipModal
        isOpen={cta.membershipModal.isModalOpen}
        onClose={cta.membershipModal.closeModal}
        selectedPlan={cta.membershipModal.selectedPlan}
        onPlanChange={cta.membershipModal.selectPlan}
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
    </div>
  );
}
