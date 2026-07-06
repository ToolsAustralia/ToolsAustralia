"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Account settings — a single consolidated page (Claude redesign). The old
// tabbed IA (Account / Subscription / Password / Payment via ?tab=) was removed
// on 2026-07-02: subscription + payment now live in overlay sheets
// (useDashboardSheetStore "manage" / "payment", opened from the Membership page
// and dashboard), and this page folds personal details + appearance + password
// into one screen. SettingsSidebar / SubscriptionTab / PaymentTab are no longer
// used here (Subscription/Payment tabs are reused inside the sheets).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { totalSignOut } from "@/utils/auth/total-sign-out";
import { Settings as SettingsIcon, LogOut, Palette, AlertTriangle, Crown } from "lucide-react";
import { getPackageIcon } from "@/utils/images/package-icons";
import { useMyAccountData } from "@/hooks/queries";
import { useDashboardState } from "@/hooks/useDashboardState";
import { formatDisplayName } from "@/utils/display-name";
import { hasFailedRenewal } from "@/utils/subscription/subscription-helpers";
import { Monogram } from "@/components/ui/Monogram";
import DashboardPageHeader from "../components/DashboardPageHeader";
import ThemePicker from "../components/settings/ThemePicker";
import ProfileTab from "../components/settings/ProfileTab";
import PasswordTab from "../components/settings/PasswordTab";
import { SettingsBadge } from "../components/settings/ui/primitives";
import DashboardLoader from "@/components/loading/DashboardLoader";

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { data: accountData, isLoading: loading, error } = useMyAccountData(session?.user?.id);
  const dash = useDashboardState();

  React.useEffect(() => {
    if (status === "loading") return;
    if (!session) router.push("/login");
  }, [session, status, router]);

  const handleSignOut = useCallback(() => {
    void totalSignOut({ callbackUrl: "/" });
  }, []);

  if (status === "loading" || loading) {
    return <DashboardLoader label="Loading settings…" />;
  }

  if (error || !accountData) {
    return (
      <div className="min-h-screen-svh flex items-center justify-center">
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold text-gray-900 dark:text-white">Error Loading Settings</h1>
          <p className="mb-4 text-gray-600 dark:text-gray-400">{error instanceof Error ? error.message : "An error occurred"}</p>
          <button onClick={() => window.location.reload()} className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const { user } = accountData;
  const hasFailed = hasFailedRenewal(user as unknown as import("@/models/User").IUser);
  const displayName = formatDisplayName(user.firstName, user.lastName) || user.email;
  const subtitle = [user.profession, user.state].filter(Boolean).join(" · ") || user.email;
  const isMember = Boolean(user.subscription?.isActive) && !hasFailed;
  const tierIcon = dash.tierKey ? getPackageIcon(`${dash.tierKey}-subscription`) : null;

  return (
    <div>
      <DashboardPageHeader
        title="Account settings"
        sub="Your details"
        icon={SettingsIcon}
        stateTheme={dash.stateTheme}
        showBack
        onBack={() => router.push("/my-account")}
      />

      <div className="mx-auto max-w-3xl space-y-5 px-3 py-5 sm:px-6 sm:py-8">
        {/* Identity card */}
        <div className="flex items-center gap-4 rounded-3xl border border-token bg-surface p-5 shadow-sm">
          <Monogram firstName={user.firstName} lastName={user.lastName} tierHex={dash.subscriptionTierHex ?? "#ee0000"} onBrand size={52} radius={16} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-['Poppins'] text-base font-bold text-primary-token dark:text-white sm:text-lg">{displayName}</h2>
            <p className="truncate text-xs text-muted-token sm:text-sm">{subtitle}</p>
          </div>
          {hasFailed ? (
            <SettingsBadge tone="danger" icon={AlertTriangle}>Past due</SettingsBadge>
          ) : isMember ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-token bg-surface px-2.5 py-1 text-xs font-bold text-primary-token dark:text-white">
              {tierIcon ? (
                <Image src={tierIcon} alt="" width={16} height={16} className="h-4 w-4 object-contain" />
              ) : (
                <Crown className="h-3.5 w-3.5 text-amber-500" />
              )}
              {dash.tierLabel ?? "Member"}
            </span>
          ) : dash.acct === "onetime" ? (
            // A one-time pack buyer is a paying customer with an active pack, not a guest — match
            // DashboardHero ("One-time pack") + MembershipCurrentPlan ("One-time").
            <SettingsBadge tone="info">One-time</SettingsBadge>
          ) : (
            <SettingsBadge tone="neutral">Guest</SettingsBadge>
          )}
        </div>

        {/* Personal details + email verification (reused, self-contained) */}
        <ProfileTab user={user} />

        {/* Appearance (Light / Dark) */}
        <div className="rounded-2xl border border-token bg-surface p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-black/[.05] text-muted-token dark:bg-white/[.08]">
              <Palette className="h-5 w-5" />
            </span>
            <div>
              <p className="font-['Poppins'] text-base font-bold text-primary-token dark:text-white">Appearance</p>
              <p className="text-xs text-muted-token">Choose how the dashboard looks</p>
            </div>
          </div>
          <ThemePicker />
        </div>

        {/* Password & security (reused, self-contained) */}
        <PasswordTab userEmail={user.email} hasPassword={user.hasPassword} />

        {/* Sign out */}
        <button
          type="button"
          onClick={handleSignOut}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-surface py-3.5 text-sm font-bold text-red-600 transition-colors hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:border-red-900/60 dark:hover:bg-red-950/20"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </div>
  );
}
