"use client";

import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import SheetShell, { SheetHead } from "@/components/ui/SheetShell";
import { useDashboardSheetStore } from "@/stores/useDashboardSheetStore";
import { useMyAccountData } from "@/hooks/queries";
import { useMembershipModal } from "@/hooks/useMembershipModal";
import { queryKeys } from "@/lib/queryKeys";
import SubscriptionTab from "../settings/SubscriptionTab";

// Lazy-loaded: MembershipModal bundles Stripe + payment forms — only mounted
// once the manage sheet is open (or a tier-change modal is active).
const MembershipModal = dynamic(() => import("@/components/modals/MembershipModal"), { ssr: false });

/**
 * "Manage membership" overlay — bottom-sheet on mobile, centered popup on
 * desktop (same mechanics as SupportSheet). Reuses the existing
 * `SubscriptionTab` (SubscriptionManagementModal in `renderAsPanel
 * settingsRedesign` mode), so all plan/billing/cancel/reactivate logic and its
 * child modals are byte-identical to the old Settings → Subscription tab.
 */
export default function ManageSheet() {
  const sheet = useDashboardSheetStore((s) => s.sheet);
  const closeSheet = useDashboardSheetStore((s) => s.closeSheet);
  const { data: session } = useSession();
  const { data: accountData } = useMyAccountData(session?.user?.id);
  const membershipModal = useMembershipModal();
  const queryClient = useQueryClient();
  const user = accountData?.user;

  const onSubscriptionUpdate = () => {
    const userId = session?.user?.id;
    if (!userId) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.users.account(userId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.users.dashboard(userId) });
  };

  return (
    <>
      <SheetShell open={sheet === "manage"} onClose={closeSheet} labelledBy="manage-sheet-title">
        <SheetHead title="Manage membership" sub="Your plan, billing and renewal" onClose={closeSheet} id="manage-sheet-title" />
        <div className="overflow-y-auto px-5 pb-6">
          {user ? (
            <SubscriptionTab
              user={user as Parameters<typeof SubscriptionTab>[0]["user"]}
              membershipModal={membershipModal}
              onSubscriptionUpdate={onSubscriptionUpdate}
            />
          ) : null}
        </div>
      </SheetShell>

      {(sheet === "manage" || membershipModal.isModalOpen) && (
        <MembershipModal
          isOpen={membershipModal.isModalOpen}
          onClose={membershipModal.closeModal}
          selectedPlan={membershipModal.selectedPlan}
          onPlanChange={membershipModal.selectPlan}
          membershipModalConfig={
            membershipModal.openWithPackageSelectionFirst ? { showPackageSelectionFirst: true } : undefined
          }
        />
      )}
    </>
  );
}
