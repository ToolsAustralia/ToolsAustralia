"use client";

import React, { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useMyAccountData } from "@/hooks/queries";
import { getActivePackage, type ActivePackageUserInput } from "@/utils/membership/get-active-package";
import { TIER_HEX, tierKeyFromName } from "@/utils/membership/tier-visuals";
import BottomNav from "./components/BottomNav";
import DeskNav from "./components/DeskNav";
import SupportSheet from "./components/sheets/SupportSheet";
import ManageSheet from "./components/sheets/ManageSheet";
import PaymentSheet from "./components/sheets/PaymentSheet";

export default function MyAccountLayout({ children }: { children: React.ReactNode }) {
  /** Opt out of site-wide chrome (header/footer/newsletter) while on /my-account
   * routes. The hide rules live in globals.css under body[data-account-layout]. */
  useEffect(() => {
    document.body.setAttribute("data-account-layout", "");
    return () => {
      document.body.removeAttribute("data-account-layout");
    };
  }, []);

  const { data: session } = useSession();
  const { data: accountData } = useMyAccountData(session?.user?.id);
  const user = accountData?.user;

  const activePackage = user ? getActivePackage(user as ActivePackageUserInput) : null;
  const tierKey = activePackage?.packageData?.name ? tierKeyFromName(activePackage.packageData.name) : null;
  const tierHex = tierKey ? TIER_HEX[tierKey] : null;

  // NOTE: no `overflow-x-hidden` on this flex parent — it would compute
  // `overflow-y: auto`, making it the sticky scroll-container and breaking
  // DeskNav's `sticky top-0` (the sidebar would scroll away). The horizontal
  // clip lives on <main> instead.
  return (
    <div className="min-h-screen-svh w-full bg-page lg:flex">
      <DeskNav
        firstName={user?.firstName}
        lastName={user?.lastName}
        email={user?.email}
        tierHex={tierHex}
      />

      {/* Content is flush against the sidebar (no centering gap), matching the prototype. */}
      <main className="min-w-0 max-w-full flex-1 overflow-x-hidden pb-16 lg:pb-0">{children}</main>

      <BottomNav />

      {/* Global overlay sheets (Support / Manage / Payment) — prototype sheet↔modal host. */}
      <SupportSheet />
      <ManageSheet />
      <PaymentSheet />
    </div>
  );
}
