"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "./AdminSidebar";
import DashboardOverview from "./overview/DashboardOverview";
import AllPlatformsManagement from "./AllPlatformsManagement";
import {
  ADMIN_MOBILE_DATE_TOOLBAR_SLOT_ID,
  adminTabUsesMobileLayoutDateToolbar,
} from "./adminMobileDateToolbarSlot";
import MajorDrawManagement from "./MajorDrawManagement";
import MiniDrawManagement from "./MiniDrawManagement";
import DrawResults from "./DrawResults";
import UpcomingDraws from "./UpcomingDraws";
import SubmissionsManagement from "./SubmissionsManagement";
import PromoManagement from "./PromoManagement";
import { AdminDashboardProps } from "@/types/admin";
import UsersManagement from "@/components/admin/UsersManagement";
import AffiliatesManagement from "@/components/admin/AffiliatesManagement";
import FacebookAdsManagement from "@/components/admin/FacebookAdsManagement";
import TikTokAdsManagement from "@/components/admin/TikTokAdsManagement";
import SnapchatAdsManagement from "@/components/admin/SnapchatAdsManagement";
import KlaviyoAnalyticsManagement from "@/components/admin/KlaviyoAnalyticsManagement";
import ABTestingManagement from "@/components/admin/ab-testing/ABTestingManagement";
import ErrorReportsManagement from "@/components/admin/ErrorReportsManagement";
import BlockedTransactionsManagement from "@/components/admin/BlockedTransactionsManagement";
import PastDueChargeHistory from "./PastDueChargeHistory";
import StripeWebhookQueueManagement from "@/components/admin/StripeWebhookQueueManagement";
import PromoAnalyticsManagement from "@/components/admin/PromoAnalyticsManagement";
import CancellationFlowAnalytics from "@/components/admin/CancellationFlowAnalytics";
import ActivityLogManagement from "./ActivityLogManagement";
import SettingsTab from "./SettingsTab";
import UnviewedSubmissionsNotification from "@/components/admin/UnviewedSubmissionsNotification";
import { HeaderThemeToggle } from "@/components/ui/HeaderThemeToggle";
import { Menu, BarChart3 } from "lucide-react";

export default function AdminPage({ user, navigateTo, selectedTab = "overview" }: AdminDashboardProps) {
  const router = useRouter();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isClosingMobileSidebar, setIsClosingMobileSidebar] = useState(false);

  // Handle mobile sidebar close with animation
  const handleCloseMobileSidebar = () => {
    setIsClosingMobileSidebar(true);
    setTimeout(() => {
      setIsMobileSidebarOpen(false);
      setIsClosingMobileSidebar(false);
    }, 300);
  };

  // Handle keyboard navigation (Escape key)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isMobileSidebarOpen) {
          handleCloseMobileSidebar();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMobileSidebarOpen]);

  // Disable background scrolling when sidebar is open
  useEffect(() => {
    if (isMobileSidebarOpen) {
      const scrollY = window.scrollY;
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
    } else {
      const scrollY = document.body.style.top;
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";

      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || "0") * -1);
      }
    }

    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
    };
  }, [isMobileSidebarOpen]);

  // Access gating happens in two places that are sufficient on their own:
  // - src/app/admin/layout.tsx server-side: blocks any non-staff/non-admin user.
  // - src/app/admin/page.tsx client-side: redirects staff without `overview.view`
  //   to their first accessible tab via firstAccessibleTabId(has).
  // Each tab/sub-tab additionally self-gates by its `requires` permission. So no
  // panel-level "isAdmin" check is needed here — that legacy check rejected
  // custom-role staff even when their role granted them tabs.

  return (
    <div className="h-screen-dvh bg-gray-50 dark:bg-neutral-950 flex text-gray-900 dark:text-neutral-100">
      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
        <>
          {/* Backdrop Overlay */}
          <div className="lg:hidden fixed inset-0 bg-black/50 z-[60] animate-fade-in" />

          {/* Mobile Sidebar */}
          <div
            className={`lg:hidden fixed top-0 left-0 h-full w-80 max-w-[85vw] bg-white dark:bg-neutral-900 z-[70] shadow-2xl ${
              isClosingMobileSidebar ? "sidebar-slide-out" : "sidebar-slide-in"
            } flex flex-col`}
          >
            <AdminSidebar
              selectedTab={selectedTab}
              onNavigateToSite={() => {
                navigateTo("home");
                handleCloseMobileSidebar();
              }}
              user={user}
              isMobile={true}
              onClose={handleCloseMobileSidebar}
            />
          </div>
        </>
      )}

      {/* Desktop Sidebar */}
      <div className="hidden lg:block w-[17.5rem] shrink-0">
        <AdminSidebar
          selectedTab={selectedTab}
          onNavigateToSite={() => navigateTo("home")}
          user={user}
          isMobile={false}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar — on mobile overview, bottom border lives on date row so header + filters read as one block */}
        <div className="bg-white dark:bg-neutral-900 px-4 lg:px-6 py-3 flex-shrink-0 border-b border-gray-200 dark:border-neutral-800 shadow-sm dark:shadow-none">
          <div className="flex items-center justify-between gap-4 w-full">
            <div className="flex items-center gap-3 min-w-0">
              {/* Mobile Menu Button */}
              <button
                onClick={() => setIsMobileSidebarOpen(true)}
                className="lg:hidden w-8 h-8 text-gray-600 dark:text-neutral-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-neutral-800 transition-all duration-200 rounded-lg flex items-center justify-center"
                aria-label="Open admin menu"
              >
                <Menu className="h-4 w-4" />
              </button>

              <div>
                <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white capitalize">
                  {selectedTab.replace("-", " ")}
                </h1>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-neutral-400 hidden sm:block">
                  {selectedTab === "overview" && "Dashboard overview and key metrics"}
                  {selectedTab === "major-draw" && "Monthly major draw management"}
                  {selectedTab === "mini-draws" &&
                    "Create mini draws; edit each winner’s testimony and photo from the draw card (not under Draw Results)"}
                  {selectedTab === "draw-results" && "View and manage draw results"}
                  {selectedTab === "upcoming-draws" && "Manage upcoming mini draws"}
                  {selectedTab === "submissions" && "Partner applications and contact form submissions"}
                  {selectedTab === "users" && "User account management and administration"}
                  {selectedTab === "promos" && "Manage promotional campaigns and entry multipliers"}
                  {selectedTab === "promo-analytics" && "Track visits, signups, and conversions by promotion page"}
                  {selectedTab === "klaviyo" && "Klaviyo campaign & flow revenue, scheduled sends, and hourly"}
                  {selectedTab === "all-platforms" && "Combined ad effectiveness — spend, revenue, ROAS, and hourly across every platform"}
                  {selectedTab === "cancellation-flow" && "Cancellation-flow funnel, save rate, and retention analytics"}
                  {selectedTab === "ab-testing" && "Manage A/B testing experiments and analyze variant performance"}
                  {selectedTab === "error-reports" && "View and manage error reports from users"}
                  {selectedTab === "blocked-transactions" && "Stripe issuer-blocked cards — review and allowlist"}
                  {selectedTab === "past-due-history" && "History of bulk and manual past-due charge attempts"}
                  {selectedTab === "stripe-webhook-queue" && "Async Stripe webhook processing queue — replay failed events"}
                  {selectedTab === "activity-log" && "Complete activity history with filters and search"}
                  {selectedTab === "team" && "Manage staff accounts, roles, and audit logs"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Mobile: date filter sits inline in the header, beside the theme toggle */}
              {adminTabUsesMobileLayoutDateToolbar(selectedTab ?? "") && (
                <div className="lg:hidden" id={ADMIN_MOBILE_DATE_TOOLBAR_SLOT_ID} />
              )}
              <HeaderThemeToggle className="shrink-0" />
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto admin-scrollbar p-4 lg:p-6 bg-gray-50 dark:bg-neutral-950 min-h-0">
          {/* OVERVIEW TAB */}
          {selectedTab === "overview" && <DashboardOverview />}

          {/* MINI DRAWS TAB */}
          {selectedTab === "mini-draws" && <MiniDrawManagement />}

          {/* MAJOR DRAW TAB */}
          {selectedTab === "major-draw" && <MajorDrawManagement />}

          {/* DRAW RESULTS TAB */}
          {selectedTab === "draw-results" && <DrawResults />}

          {/* UPCOMING DRAWS TAB */}
          {selectedTab === "upcoming-draws" && <UpcomingDraws />}

          {/* SUBMISSIONS TAB */}
          {selectedTab === "submissions" && <SubmissionsManagement />}

          {/* USERS TAB */}
          {selectedTab === "users" && <UsersManagement />}

          {/* PROMOS TAB */}
          {selectedTab === "promos" && <PromoManagement />}

          {/* AFFILIATES TAB */}
          {selectedTab === "affiliates" && <AffiliatesManagement />}

          {/* A/B TESTING TAB */}
          {selectedTab === "ab-testing" && <ABTestingManagement />}

          {/* ERROR REPORTS TAB */}
          {selectedTab === "error-reports" && <ErrorReportsManagement />}

          {/* BLOCKED TRANSACTIONS TAB */}
          {selectedTab === "blocked-transactions" && <BlockedTransactionsManagement />}

          {/* PAST-DUE CHARGE HISTORY TAB */}
          {selectedTab === "past-due-history" && <PastDueChargeHistory />}

          {/* STRIPE WEBHOOK QUEUE TAB */}
          {selectedTab === "stripe-webhook-queue" && <StripeWebhookQueueManagement />}

          {/* FACEBOOK ADS TAB */}
          {selectedTab === "facebook-ads" && <FacebookAdsManagement />}

          {/* TIKTOK ADS TAB */}
          {selectedTab === "tiktok-ads" && <TikTokAdsManagement />}

          {/* SNAPCHAT ADS TAB */}
          {selectedTab === "snapchat-ads" && <SnapchatAdsManagement />}

          {/* KLAVIYO TAB */}
          {selectedTab === "klaviyo" && <KlaviyoAnalyticsManagement />}

          {/* ALL-PLATFORMS AGGREGATE TAB */}
          {selectedTab === "all-platforms" && <AllPlatformsManagement />}

          {/* PROMO ANALYTICS TAB */}
          {selectedTab === "promo-analytics" && <PromoAnalyticsManagement />}

          {/* CANCELLATION FLOW ANALYTICS TAB */}
          {selectedTab === "cancellation-flow" && <CancellationFlowAnalytics />}

          {/* ACTIVITY LOG TAB */}
          {selectedTab === "activity-log" && <ActivityLogManagement />}

          {/* TEAM TAB (Staff + Roles + Logs sub-screens) */}
          {selectedTab === "team" && <SettingsTab />}

          {/* Placeholder for other tabs - temporarily disabled since tabs are hidden */}
          {false && (
            <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-lg dark:shadow-none border-2 border-red-100 dark:border-red-900/40 p-6 sm:p-8 text-center">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-red-600 to-red-700 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <BarChart3 className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white mb-2 capitalize">
                {selectedTab.replace("-", " ")} Management
              </h3>
              <p className="text-sm text-gray-600 dark:text-neutral-400">
                {selectedTab.charAt(0).toUpperCase() + selectedTab.slice(1)} management interface will be available in a
                future update.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Floating notification for unviewed submissions (exclude submissions page) */}
      {selectedTab !== "submissions" && (
        <UnviewedSubmissionsNotification onViewSubmissions={() => router.push("/admin/submissions")} />
      )}
    </div>
  );
}
