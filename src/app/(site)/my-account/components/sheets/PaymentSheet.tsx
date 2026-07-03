"use client";

import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import SheetShell, { SheetHead } from "@/components/ui/SheetShell";
import { useDashboardSheetStore } from "@/stores/useDashboardSheetStore";
import { useDashboardState } from "@/hooks/useDashboardState";
import { useMyAccountData } from "@/hooks/queries";
import PaymentTab from "../settings/PaymentTab";

// Past-due resolve engine — reused (embedded) so the card sheet itself retries the
// failed invoice and resumes the subscription (handles declines / 3DS / add-card-
// then-retry / force-charge). No separate RenewalFailedModal popup.
const RenewalFailedModal = dynamic(() => import("@/components/modals/RenewalFailedModal"), { ssr: false });

/**
 * "Payment method" overlay — bottom-sheet on mobile, centered popup on desktop.
 * Reuses the existing `PaymentTab` (PaymentMethodsTab in `settingsRedesign`
 * mode), so saved-card / add-card / default-sync Stripe wiring is unchanged.
 * For a PAST-DUE member it also renders the embedded resolve flow above the card
 * list, so this one sheet both resumes the subscription and manages cards.
 * SheetShell renders nothing until open, so the Stripe bundle only loads on demand.
 */
export default function PaymentSheet() {
  const sheet = useDashboardSheetStore((s) => s.sheet);
  const closeSheet = useDashboardSheetStore((s) => s.closeSheet);
  const { data: session } = useSession();
  const { data: accountData } = useMyAccountData(session?.user?.id);
  const dash = useDashboardState();
  const user = accountData?.user;
  const isPastDue = dash.acct === "pastdue";

  return (
    <SheetShell open={sheet === "payment"} onClose={closeSheet} labelledBy="payment-sheet-title">
      <SheetHead title="Payment method" sub="Cards used for membership & one-time packages" onClose={closeSheet} id="payment-sheet-title" />
      <div className="space-y-5 overflow-y-auto px-5 pb-6">
        {isPastDue && <RenewalFailedModal isOpen embedded onClose={closeSheet} />}
        {user ? <PaymentTab user={user} /> : null}
      </div>
    </SheetShell>
  );
}
