"use client";

import React, { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useMyAccountData } from "@/hooks/queries";
import { getActivePackage, type ActivePackageUserInput } from "@/utils/membership/get-active-package";
import { TIER_HEX, tierKeyFromName } from "@/utils/membership/tier-visuals";
import BottomNav from "./components/BottomNav";
import DeskNav from "./components/DeskNav";

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

  return (
    <div className="min-h-screen-svh w-full min-w-0 max-w-full overflow-x-hidden bg-page lg:flex">
      <DeskNav
        firstName={user?.firstName}
        lastName={user?.lastName}
        email={user?.email}
        tierHex={tierHex}
      />

      <main className="min-w-0 flex-1 pb-16 lg:pb-0">
        <div className="mx-auto w-full max-w-[1180px]">{children}</div>
      </main>

      <BottomNav />
    </div>
  );
}
