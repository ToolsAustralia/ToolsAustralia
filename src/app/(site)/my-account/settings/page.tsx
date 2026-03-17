"use client";

import React, { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  User,
  CreditCard,
  KeyRound,
  Wallet,
  AlertTriangle,
  LogOut,
} from "lucide-react";
import { useMyAccountData } from "@/hooks/queries";
import { useMembershipModal } from "@/hooks/useMembershipModal";
import DashboardHeader from "../components/DashboardHeader";
import ProfileTab from "../components/settings/ProfileTab";
import PasswordTab from "../components/settings/PasswordTab";
import SubscriptionTab from "../components/settings/SubscriptionTab";
import PaymentTab from "../components/settings/PaymentTab";

type SettingsSection = "profile" | "subscription" | "password" | "payment";

const SETTINGS_ITEMS: Array<{
  id: SettingsSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  showAlert?: boolean;
}> = [
  { id: "profile", label: "Profile", icon: User },
  { id: "subscription", label: "Subscription", icon: CreditCard },
  { id: "password", label: "Password", icon: KeyRound },
  { id: "payment", label: "Payment Methods", icon: Wallet },
];

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const membershipModal = useMembershipModal();

  const {
    data: accountData,
    isLoading: loading,
    error,
  } = useMyAccountData(session?.user?.id);

  const [activeSection, setActiveSection] = useState<SettingsSection | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      router.push("/login");
    }
  }, [session, status, router]);

  useEffect(() => {
    const tab = searchParams?.get("tab");
    if (tab && ["profile", "subscription", "password", "payment"].includes(tab)) {
      setActiveSection(tab as SettingsSection);
    }
  }, [searchParams]);

  if (status === "loading" || loading) {
    return (
      <div>
        <DashboardHeader title="Settings" showBackButton />
        <div className="min-h-screen-svh flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Loading settings...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !accountData) {
    return (
      <div>
        <DashboardHeader title="Settings" showBackButton />
        <div className="min-h-screen-svh flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Error Loading Settings</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {error instanceof Error ? error.message : "An error occurred"}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { user } = accountData;
  const hasFailed = user.subscription?.status === "past_due" && !user.subscription?.isActive;

  const headerTitle = activeSection
    ? SETTINGS_ITEMS.find((i) => i.id === activeSection)?.label ?? "Settings"
    : "Settings";

  const handleBackClick = () => {
    if (activeSection) {
      setActiveSection(null);
    } else {
      router.back();
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem("wasAuthenticated");
    localStorage.removeItem("topBarHidden");
    signOut({ callbackUrl: "/" });
  };

  return (
    <div>
      <DashboardHeader
        title={headerTitle}
        showBackButton
        showRenewalAlert={hasFailed}
        onBackClick={handleBackClick}
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {activeSection === null ? (
          <ul className="divide-y divide-gray-200 dark:divide-neutral-700">
            {SETTINGS_ITEMS.map((item) => {
              const Icon = item.icon;
              const showAlert = item.id === "subscription" && hasFailed;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setActiveSection(item.id)}
                    className="w-full flex items-center gap-3 py-4 sm:py-5 text-left hover:opacity-80 transition-opacity"
                  >
                    <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-[#ee0000] dark:text-red-500 flex-shrink-0" />
                    <span className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
                      {item.label}
                    </span>
                    {showAlert && (
                      <AlertTriangle
                        className="w-4 h-4 text-amber-500 animate-pulse flex-shrink-0 ml-1"
                        strokeWidth={2.5}
                      />
                    )}
                  </button>
                </li>
              );
            })}
            <li>
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 py-4 sm:py-5 text-left hover:opacity-80 transition-opacity"
              >
                <LogOut className="w-5 h-5 sm:w-6 sm:h-6 text-[#ee0000] dark:text-red-500 flex-shrink-0" />
                <span className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
                  Sign Out
                </span>
              </button>
            </li>
          </ul>
        ) : (
          <div className="space-y-4">
            {activeSection === "profile" && <ProfileTab user={user} />}
            {activeSection === "subscription" && (
              <SubscriptionTab
                user={user as Parameters<typeof SubscriptionTab>[0]["user"]}
                membershipModal={membershipModal}
              />
            )}
            {activeSection === "password" && <PasswordTab userEmail={user.email} />}
            {activeSection === "payment" && <PaymentTab user={user} />}
          </div>
        )}
      </div>
    </div>
  );
}
