"use client";

import { useSession } from "next-auth/react";
import SheetShell, { SheetHead } from "@/components/ui/SheetShell";
import { useDashboardSheetStore } from "@/stores/useDashboardSheetStore";
import { useMyAccountData } from "@/hooks/queries";
import PaymentTab from "../settings/PaymentTab";

/**
 * "Payment method" overlay — bottom-sheet on mobile, centered popup on desktop.
 * Reuses the existing `PaymentTab` (PaymentMethodsTab in `settingsRedesign`
 * mode), so saved-card / add-card / default-sync Stripe wiring is unchanged.
 * SheetShell renders nothing until open, so the Stripe bundle only loads on demand.
 */
export default function PaymentSheet() {
  const sheet = useDashboardSheetStore((s) => s.sheet);
  const closeSheet = useDashboardSheetStore((s) => s.closeSheet);
  const { data: session } = useSession();
  const { data: accountData } = useMyAccountData(session?.user?.id);
  const user = accountData?.user;

  return (
    <SheetShell open={sheet === "payment"} onClose={closeSheet} labelledBy="payment-sheet-title">
      <SheetHead title="Payment method" sub="Cards used for membership & one-time packages" onClose={closeSheet} id="payment-sheet-title" />
      <div className="overflow-y-auto px-5 pb-6">{user ? <PaymentTab user={user} /> : null}</div>
    </SheetShell>
  );
}
