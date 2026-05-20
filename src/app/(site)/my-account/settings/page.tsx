"use client";

import React, { useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  LogOut,
  Sparkles,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useMyAccountData, type MyAccountData } from "@/hooks/queries";
import { useMembershipModal } from "@/hooks/useMembershipModal";
import { queryKeys } from "@/lib/queryKeys";
import { formatDisplayName } from "@/utils/display-name";
import { hasFailedRenewal } from "@/utils/subscription/subscription-helpers";
import { useSavedPaymentMethods } from "@/hooks/useSavedPaymentMethods";
import MembershipBadge from "@/components/ui/MembershipBadge";
import { SettingsBadge } from "../components/settings/ui/primitives";
import SettingsSidebar, { SETTINGS_TABS, VALID_TAB_IDS, type SettingsSection } from "../components/settings/SettingsSidebar";

// Lazy-loaded: MembershipModal bundles Stripe + payment forms.
const MembershipModal = dynamic(() => import("@/components/modals/MembershipModal"), {
  ssr: false,
});
import DashboardHeader from "../components/DashboardHeader";
import ProfileTab from "../components/settings/ProfileTab";
import PasswordTab from "../components/settings/PasswordTab";
import SubscriptionTab from "../components/settings/SubscriptionTab";
import PaymentTab from "../components/settings/PaymentTab";

// ---------------------------------------------------------------------------
// State deriver — pure, no hooks
// ---------------------------------------------------------------------------

type SettingsUserState = "member" | "past_due" | "guest";

function deriveSettingsUserState(
  user: MyAccountData["user"],
  hasFailed: boolean,
  membershipTier?: string,
): { state: SettingsUserState; tierLabel?: string; tierPrice?: number } {
  if (hasFailed) {
    return {
      state: "past_due",
      tierLabel: user.subscriptionPackageData?.name,
      tierPrice: user.subscriptionPackageData?.price,
    };
  }
  if (user.subscription?.isActive) {
    return {
      state: "member",
      tierLabel: user.subscriptionPackageData?.name ?? membershipTier,
      tierPrice: user.subscriptionPackageData?.price,
    };
  }
  if (user.enrichedOneTimePackages?.some((p) => p.isActive)) {
    return { state: "member" };
  }
  return { state: "guest" };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const membershipModal = useMembershipModal();
  const queryClient = useQueryClient();

  const {
    data: accountData,
    isLoading: loading,
    error,
  } = useMyAccountData(session?.user?.id);

  // Real saved cards (brand/last4) for the index payment preview. Resolves the
  // user internally; degrades gracefully to count text while loading/absent.
  const {
    paymentMethods: savedCards,
    subscriptionDefaultPaymentMethodId,
    loading: cardsLoading,
  } = useSavedPaymentMethods();

  // ?tab= is single source of truth for active section
  const tabParam = searchParams?.get("tab");
  const activeSection: SettingsSection | null =
    tabParam && VALID_TAB_IDS.has(tabParam) ? (tabParam as SettingsSection) : null;

  const setActiveTab = useCallback(
    (id: SettingsSection) => {
      router.push(`/my-account/settings?tab=${id}`, { scroll: false });
    },
    [router],
  );

  const handleSubscriptionUpdate = useCallback(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.users.account(userId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.users.dashboard(userId) });
  }, [queryClient, session?.user?.id]);

  // Session guard
  React.useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      router.push("/login");
    }
  }, [session, status, router]);

  const handleSignOut = useCallback(() => {
    localStorage.removeItem("wasAuthenticated");
    localStorage.removeItem("topBarHidden");
    signOut({ callbackUrl: "/" });
  }, []);

  const handleBackClick = useCallback(() => {
    if (activeSection) {
      router.push("/my-account/settings", { scroll: false });
    } else {
      router.back();
    }
  }, [activeSection, router]);

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const { user } = accountData;
  const hasFailed = hasFailedRenewal(user as unknown as import("@/models/User").IUser);

  const headerTitle = activeSection
    ? (SETTINGS_TABS.find((i) => i.id === activeSection)?.label ?? "Settings")
    : "Settings";

  const { state: userState, tierLabel, tierPrice } = deriveSettingsUserState(
    user,
    hasFailed,
    accountData.insights?.membershipTier,
  );

  const isGuest = userState === "guest";
  const isPastDue = userState === "past_due";

  // Display name for the identity card.
  const displayName = formatDisplayName(user.firstName, user.lastName) || user.email;

  // Subscription card summary
  const subscriptionEndDate = user.subscription?.endDate
    ? new Date(user.subscription.endDate).toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  const subscriptionPrimary = (() => {
    if (isGuest) return "No active plan";
    if (isPastDue) return "Payment failed — tap to resolve";
    const base = tierLabel ?? "Member";
    return tierPrice ? `${base} · $${tierPrice}/mo` : base;
  })();

  const subscriptionSecondary = (() => {
    if (!isGuest && !isPastDue && subscriptionEndDate) {
      return `Next billing ${subscriptionEndDate}`;
    }
    return undefined;
  })();

  const subscriptionTone = isPastDue ? "danger" : isGuest ? undefined : "success";

  // Payment card summary — prefer the real Stripe brand/last4 of the default
  // card; fall back to the saved-method count while Stripe data loads/absent.
  const paymentCount = savedCards.length || (user.savedPaymentMethods?.length ?? 0);
  const defaultCard =
    savedCards.find((m) => m.isDefault) ??
    savedCards.find((m) => m.paymentMethodId === subscriptionDefaultPaymentMethodId) ??
    savedCards[0];
  const defaultCardMeta = defaultCard?.card;
  let paymentPrimary: string;
  let paymentSecondary: string | undefined;
  if (paymentCount === 0) {
    paymentPrimary = "No cards saved";
    paymentSecondary = undefined;
  } else if (defaultCardMeta) {
    const brand = defaultCardMeta.brand
      ? defaultCardMeta.brand.charAt(0).toUpperCase() + defaultCardMeta.brand.slice(1)
      : "Card";
    paymentPrimary = `${brand} •••• ${defaultCardMeta.last4}`;
    paymentSecondary =
      defaultCard?.isDefault || defaultCard?.paymentMethodId === subscriptionDefaultPaymentMethodId
        ? "Default"
        : undefined;
  } else {
    // Methods exist but Stripe card meta not yet resolved (or still loading).
    paymentPrimary = cardsLoading
      ? "Loading cards…"
      : `${paymentCount} card${paymentCount > 1 ? "s" : ""} saved`;
    paymentSecondary =
      !cardsLoading &&
      (savedCards.some((m) => m.isDefault) || (user.savedPaymentMethods?.some((m) => m.isDefault) ?? false))
        ? "Default set"
        : undefined;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div>
      <DashboardHeader
        title={headerTitle}
        showBackButton
        showRenewalAlert={hasFailed}
        onBackClick={handleBackClick}
      />

      {activeSection === null ? (
        /* ── Settings Index ────────────────────────────────────────────────── */
        <div className="max-w-3xl mx-auto px-3 sm:px-6 py-5 sm:py-8">
          {/* Identity card */}
          <div className="flex items-center gap-4 p-5 mb-5 rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-lift dark:shadow-lift-dark">
            <div className="flex-1 min-w-0">
              <h2 className="font-poppins font-bold text-base sm:text-lg text-neutral-900 dark:text-white truncate">
                {displayName}
              </h2>
              <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 truncate">
                {user.email}
              </p>
            </div>
            {!isGuest && !isPastDue &&
              (user.subscriptionPackageData ? (
                <MembershipBadge
                  packageData={user.subscriptionPackageData}
                  isActive
                  membershipType={user.subscriptionPackageData.type ?? "subscription"}
                  className="shrink-0"
                />
              ) : (
                <SettingsBadge tone="success" icon={CheckCircle2}>
                  Member
                </SettingsBadge>
              ))}
            {isPastDue && (
              <SettingsBadge tone="danger" icon={AlertTriangle}>
                Past due
              </SettingsBadge>
            )}
            {isGuest && <SettingsBadge tone="neutral">Guest</SettingsBadge>}
          </div>

          {/* Past-due hero — only when relevant */}
          {hasFailed && (
            <button
              type="button"
              onClick={() => setActiveTab("subscription")}
              className="w-full text-left mb-5 p-5 rounded-3xl border border-red-200/80 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 transition hover:bg-red-100/60 dark:hover:bg-red-950/50"
            >
              <div className="flex items-center gap-4">
                <div className="shrink-0 w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center animate-pulse-ring">
                  <AlertTriangle className="w-6 h-6" strokeWidth={2.5} />
                </div>
                <div className="flex-1">
                  <p className="font-poppins font-bold text-base text-red-700 dark:text-red-300">
                    Renewal failed — restore your benefits
                  </p>
                  <p className="text-xs sm:text-sm text-red-700/80 dark:text-red-300/80 mt-0.5">
                    Pay invoice or update your card to keep your accumulated entries.
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-red-600/70 dark:text-red-400/70" strokeWidth={2} />
              </div>
            </button>
          )}

          {/* Guest CTA */}
          {isGuest && (
            <button
              type="button"
              onClick={() => setActiveTab("subscription")}
              className="w-full text-left mb-5 p-5 rounded-3xl border border-neutral-900 dark:border-white bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 transition hover:bg-neutral-800 dark:hover:bg-neutral-100"
            >
              <div className="flex items-center gap-4">
                <div className="shrink-0 w-12 h-12 rounded-2xl bg-white/15 dark:bg-neutral-900/10 flex items-center justify-center">
                  <Sparkles className="w-6 h-6" strokeWidth={2} />
                </div>
                <div className="flex-1">
                  <p className="font-poppins font-bold text-base">Pick a plan to unlock benefits</p>
                  <p className="text-xs sm:text-sm opacity-80 mt-0.5">From $20/mo · Cancel anytime</p>
                </div>
                <ChevronRight className="w-5 h-5 opacity-80" strokeWidth={2} />
              </div>
            </button>
          )}

          <h3 className="font-poppins font-bold text-sm tracking-[0.14em] uppercase text-neutral-500 dark:text-neutral-400 mb-3">
            Account settings
          </h3>

          {/* Tab preview cards */}
          <div className="grid sm:grid-cols-2 gap-3">
            {SETTINGS_TABS.map((t) => {
              const alertHere = t.id === "subscription" && hasFailed;

              // Build per-tab summary
              let primary = "";
              let secondary: string | undefined;
              let tone: "danger" | "success" | undefined;

              if (t.id === "profile") {
                primary = user.isEmailVerified ? "Verified" : "Not verified";
              } else if (t.id === "subscription") {
                primary = subscriptionPrimary;
                secondary = subscriptionSecondary;
                if (subscriptionTone === "danger") tone = "danger";
                else if (subscriptionTone === "success") tone = "success";
              } else if (t.id === "password") {
                primary = "Change your account password";
              } else if (t.id === "payment") {
                primary = paymentPrimary;
                secondary = paymentSecondary;
              }

              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className="group text-left p-4 sm:p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-300 dark:hover:border-neutral-700 hover:shadow-md transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                        alertHere
                          ? "bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400"
                          : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 group-hover:bg-red-50 dark:group-hover:bg-red-950/30 group-hover:text-red-600 dark:group-hover:text-red-400"
                      }`}
                    >
                      <t.icon className="w-5 h-5" strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-poppins font-bold text-base text-neutral-900 dark:text-white">
                          {t.label}
                        </p>
                        <ChevronRight
                          className="w-4 h-4 text-neutral-400 group-hover:translate-x-0.5 transition shrink-0"
                          strokeWidth={2}
                        />
                      </div>
                      <p
                        className={`text-xs sm:text-sm font-semibold mt-1 ${
                          tone === "danger"
                            ? "text-red-600 dark:text-red-400"
                            : tone === "success"
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-neutral-700 dark:text-neutral-200"
                        }`}
                      >
                        {primary}
                      </p>
                      {secondary && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                          {secondary}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}

            {/* Sign out card */}
            <button
              type="button"
              onClick={handleSignOut}
              className="group sm:col-span-2 flex items-center gap-3 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-red-200 dark:hover:border-red-900/60 hover:bg-red-50/30 dark:hover:bg-red-950/20 transition-colors text-left"
            >
              <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400">
                <LogOut className="w-5 h-5" strokeWidth={2} />
              </div>
              <div className="flex-1">
                <p className="font-poppins font-bold text-base text-neutral-900 dark:text-white">Sign out</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  End your session on this device
                </p>
              </div>
              <ChevronRight
                className="w-4 h-4 text-neutral-400 group-hover:translate-x-0.5 transition shrink-0"
                strokeWidth={2}
              />
            </button>
          </div>

        </div>
      ) : (
        /* ── Tab view ────────────────────────────────────────────────────── */
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-5 sm:py-8">
          {/* Mobile: segmented strip — extends to screen edges (negative margins
              cancel the parent container's px-3 sm:px-6 padding). Hidden at lg+. */}
          <div className="lg:hidden -mx-3 sm:-mx-6">
            <SettingsSidebar
              activeTab={activeSection}
              setActiveTab={setActiveTab}
              hasAlert={hasFailed}
              isMobile
            />
          </div>

          <div className="grid lg:grid-cols-[260px_1fr] lg:gap-8">
            {/* Desktop sidebar */}
            <div className="hidden lg:block">
              <SettingsSidebar
                activeTab={activeSection}
                setActiveTab={setActiveTab}
                hasAlert={hasFailed}
                onSignOut={handleSignOut}
              />
            </div>

            {/* Tab content */}
            <div className="min-w-0 pt-6 sm:pt-8 lg:pt-0">
              {activeSection === "profile" && <ProfileTab user={user} />}
              {activeSection === "subscription" && (
                <SubscriptionTab
                  user={user as Parameters<typeof SubscriptionTab>[0]["user"]}
                  membershipModal={membershipModal}
                  onSubscriptionUpdate={handleSubscriptionUpdate}
                />
              )}
              {activeSection === "password" && (
                <PasswordTab
                  userEmail={user.email}
                  isEmailVerified={user.isEmailVerified}
                  hasPassword={user.hasPassword}
                />
              )}
              {activeSection === "payment" && <PaymentTab user={user} />}
            </div>
          </div>
        </div>
      )}

      <MembershipModal
        isOpen={membershipModal.isModalOpen}
        onClose={membershipModal.closeModal}
        selectedPlan={membershipModal.selectedPlan}
        onPlanChange={membershipModal.selectPlan}
        membershipModalConfig={
          membershipModal.openWithPackageSelectionFirst ? { showPackageSelectionFirst: true } : undefined
        }
      />
    </div>
  );
}
