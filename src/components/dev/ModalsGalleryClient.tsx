"use client";

import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import type { LocalMembershipPlan } from "@/utils/membership/membership-adapters";
import { getMemberOnlyPackages, getPackagesByType } from "@/data/membershipPackages";
import { miniDrawPackages } from "@/data/miniDrawPackages";
import type { UpsellUserContext, OriginalPurchaseContext } from "@/types/upsell";
import { SAMPLE_UPSELL_OFFERS } from "@/types/upsell";
import type { ErrorContext } from "@/types/error-reporting";
import { DEFAULT_PRIZE_SLUG, getPrizeBySlug } from "@/config/prizes";
import { brandOptions } from "@/utils/brand-utils";
import type { RevenueCategory } from "@/hooks/queries/useAdminQueries";
import AdminMiniDrawModal from "@/components/modals/AdminMiniDrawModal";
import AdminMajorDrawModal from "@/components/modals/AdminMajorDrawModal";
import MajorDrawEditModal from "@/components/modals/MajorDrawEditModal";
import MiniDrawEditModal, { type AdminMiniDrawSummary } from "@/components/modals/MiniDrawEditModal";
import ParticipantsModal from "@/components/modals/ParticipantsModal";
import WinnerSelectionModal from "@/components/modals/WinnerSelectionModal";
import WinnerEditModal from "@/components/modals/WinnerEditModal";
import UserSearchModal from "@/components/modals/UserSearchModal";
import AdminPromoToggle from "@/components/modals/AdminPromoToggle";
import AdminBonusEntryPromoModal from "@/components/modals/AdminBonusEntryPromoModal";
import AdminScheduledPromoModal from "@/components/modals/AdminScheduledPromoModal";
import AdminScheduledPromoCalendarModal from "@/components/modals/AdminScheduledPromoCalendarModal";
import AdminPromoLinkModal from "@/components/modals/AdminPromoLinkModal";
import AdminPromoBannerTextModal from "@/components/modals/AdminPromoBannerTextModal";
import AdminAlternatingMultiplierModal from "@/components/modals/AdminAlternatingMultiplierModal";
import AdminProductModal from "@/components/modals/AdminProductModal";
import RevenueDetailModal from "@/components/modals/RevenueDetailModal";
import MembershipByPackageDetailModal from "@/components/modals/MembershipByPackageDetailModal";

import LoginPromptModal from "@/components/modals/LoginPromptModal";
import LoginModal from "@/components/modals/LoginModal";
import GateClosedModal from "@/components/modals/GateClosedModal";
import ReportProblemModal from "@/components/modals/ReportProblemModal";
import ConfirmationModal from "@/components/modals/ConfirmationModal";
import MembershipModal from "@/components/modals/MembershipModal";
import SpecialPackagesModal from "@/components/modals/SpecialPackagesModal";
import UserSetupModal from "@/components/modals/UserSetupModal";
import UpsellModal from "@/components/modals/UpsellModal";
import PixelConsentModal from "@/components/modals/PixelConsentModal";
import SubscriptionExplainerModal from "@/components/modals/SubscriptionExplainerModal";
import ExistingAccountModal from "@/components/modals/ExistingAccountModal";
import ReferFriendModal from "@/components/modals/ReferFriendModal";
import PartnerModal from "@/components/modals/PartnerModal";
import PackageSelectionModal from "@/components/modals/PackageSelectionModal";
import MiniDrawPackageModal from "@/components/modals/MiniDrawPackageModal";
import CancellationUpsellModal from "@/components/modals/CancellationUpsellModal";
import PastDrawsModal from "@/components/modals/PastDrawsModal";
import PrizeSpecificationsModal from "@/components/modals/PrizeSpecificationsModal";
import PackageDetailModal from "@/components/modals/PackageDetailModal";
import RenewalFailedModal from "@/components/modals/RenewalFailedModal";
import ExportModal from "@/components/modals/ExportModal";
import IconPickerModal from "@/components/modals/ui/IconPickerModal";
import SettingsModal from "@/components/modals/SettingsModal";
import SubscriptionManagementModal from "@/components/modals/SubscriptionManagementModal";
import SavedPaymentMethodsModal from "@/components/modals/SavedPaymentMethodsModal";
import ChannelDetailModal from "@/components/modals/ChannelDetailModal";
import PromoPageDetailModal from "@/components/modals/PromoPageDetailModal";
import AdminMilestoneRewardModal from "@/components/modals/AdminMilestoneRewardModal";
import AdminMonthlyRedeemablesModal from "@/components/modals/AdminMonthlyRedeemablesModal";
import ExperimentFormModal from "@/components/admin/ab-testing/ExperimentFormModal";
import AffiliateDetailModal from "@/components/admin/AffiliateDetailModal";
import UserExportModal from "@/components/admin/UserExportModal";
import CustomDateRangeModal from "@/components/admin/CustomDateRangeModal";
import FullscreenImageViewer from "@/components/ui/FullscreenImageViewer";
import SuccessScreen from "@/components/loading/SuccessScreen";
import PasswordlessLoginModal from "@/components/auth/PasswordlessLoginModal";
import OTPVerificationModal from "@/components/auth/OTPVerificationModal";
import EmailVerificationModal from "@/components/auth/EmailVerificationModal";
import MobileNavSidebarPreview from "@/components/dev/MobileNavSidebarPreview";
import Dropdown, { type DropdownOption } from "@/components/modals/ui/Dropdown";
import DateTimePicker from "@/components/modals/ui/DateTimePicker";
import { ThemeToggleButton } from "@/components/ui/ThemeToggle";
import { useMembershipModal } from "@/hooks/useMembershipModal";
import { useToast } from "@/components/ui/Toast";
import { useAdminUserModal } from "@/contexts/AdminUserModalContext";
import type { UserFilters } from "@/types/admin";
import reachabilityReport from "@/data/dev/modal-reachability.json";
import ChargePastDueModal from "@/components/admin/ChargePastDueModal";
import ChargePastDueUserModal from "@/components/admin/ChargePastDueUserModal";
import ExperimentDetailModal from "@/components/admin/ab-testing/ExperimentDetailModal";
import SubmissionDetailModal, { type PartnerApplication } from "@/components/admin/submissions/SubmissionDetailModal";
import StripePaymentModal from "@/components/modals/StripePaymentModal";
import UnifiedModalManager from "@/components/modals/UnifiedModalManager";
import { useModalPriorityStore } from "@/stores/useModalPriorityStore";

const SAMPLE_PLAN: LocalMembershipPlan = {
  id: "tradie-subscription",
  name: "Tradie",
  subtitle: "Gallery preview plan",
  price: 49.99,
  period: "mo",
  features: [{ text: "Monthly entries" }, { text: "Partner discounts" }],
  isPopular: true,
  buttonText: "Select",
  buttonStyle: "primary",
  metadata: { entriesCount: 100 },
};

const MOCK_ERROR_CONTEXT: ErrorContext = {
  errorMessage: "Example error for gallery preview",
  isAuthenticated: false,
  requestUrl: "",
  timestamp: Date.now(),
};

const MOCK_UPSELL_USER: UpsellUserContext = {
  isAuthenticated: true,
  hasDefaultPayment: true,
  recentPurchase: "membership",
  userType: "returning-user",
  totalSpent: 99,
  upsellsShown: 0,
};

const MOCK_ORIGINAL_PURCHASE: OriginalPurchaseContext = {
  paymentIntentId: "pi_dev_preview",
  packageId: "tradie-subscription",
  packageName: "Tradie",
  packageType: "membership",
  price: 49.99,
  entries: 100,
};

const PREVIEW_USER_ID = "000000000000000000000001";
const PREVIEW_MAJOR_DRAW_ID = "000000000000000000000002";
const PREVIEW_BRAND_ID = brandOptions[0]?.value ?? "tools-australia";

const GALLERY_MAJOR_DRAW = {
  _id: PREVIEW_MAJOR_DRAW_ID,
  name: "Gallery Major Draw",
  description: "<p>Preview description for the modal gallery.</p>",
  prize: {
    name: "Milwaukee Packout",
    description: "Full prize copy for layout preview.",
    value: 10_000,
    images: [] as (string | File)[],
    brand: "Milwaukee",
  },
  drawDate: "2026-12-15T12:00:00.000Z",
  activationDate: "2026-11-01T10:00:00.000Z",
  freezeEntriesAt: "2026-12-15T11:30:00.000Z",
  status: "active" as const,
  configurationLocked: false,
};

const GALLERY_MINI_SUMMARY: AdminMiniDrawSummary = {
  _id: "preview-mini-draw",
  name: "Gallery Mini Draw",
  description: "Preview mini draw for the modal gallery.",
  minimumEntries: 100,
  status: "active",
  brandId: PREVIEW_BRAND_ID,
  displayOrder: 1,
  prize: {
    name: "Cordless Combo",
    description: "Prize description",
    value: 2500,
    images: [],
    category: "power-tools",
  },
};

const GALLERY_REVENUE_CATEGORY: RevenueCategory = "membership-purchase";

const GALLERY_EXPORT_FILTERS: UserFilters = { page: 1, limit: 25 };

const GALLERY_SETTINGS_USER = {
  _id: PREVIEW_USER_ID,
  firstName: "Preview",
  lastName: "Member",
  email: "member@toolsaustralia.test",
  isEmailVerified: true,
  mobile: "0400000000",
  state: "NSW",
  profession: "Electrician",
};

const MOCK_CHARGE_RESPONSE = async () => ({
  success: true as const,
  summary: { totalInvoices: 0, processed: 0, succeeded: 0, failed: 0, skipped: 0 },
  results: [] as {
    invoiceId: string;
    customerId: string;
    userId?: string;
    userEmail?: string;
    status: "success" | "failed" | "skipped";
    error?: string;
    amount?: number;
    skipReason?: string;
  }[],
});

const GALLERY_PARTNER_SUBMISSION: PartnerApplication = {
  _id: "gallery-submission-1",
  firstName: "Alex",
  lastName: "Preview",
  businessName: "Preview Plumbing Co",
  email: "partner@gallery.test",
  phone: "0412345678",
  abn: "12123123174",
  goals: "Expand into commercial maintenance.",
  status: "under_review",
  submittedAt: new Date().toISOString(),
  readAt: null,
  replies: [],
};

const GALLERY_SUBSCRIPTION_USER = {
  _id: PREVIEW_USER_ID,
  firstName: "Preview",
  lastName: "Subscriber",
  email: "subscriber@toolsaustralia.test",
  role: "user",
  subscription: {
    packageId: "tradie-subscription" as const,
    isActive: true,
    startDate: "2025-06-01T00:00:00.000Z",
    autoRenew: true,
    status: "active",
  },
  subscriptionPackageData: {
    _id: "tradie-subscription",
    name: "Tradie",
    type: "subscription" as const,
    price: 49.99,
    description: "Gallery preview",
    features: ["Entries", "Discounts"],
    entriesPerMonth: 100,
    isActive: true,
  },
};

const DROPDOWN_GALLERY_OPTIONS: DropdownOption[] = [
  { value: "a", label: "Option Alpha" },
  { value: "b", label: "Option Beta" },
  { value: "c", label: "Option Gamma" },
];

type Entry = {
  id: string;
  label: string;
  category: string;
  note?: string;
  /** When set, compared to `modal-reachability.json` from `npm run analyze:modals`. */
  sourcePath?: string;
};

/** Maps gallery entries to repo paths analyzed for app entry reachability. */
const GALLERY_SOURCE_PATH: Partial<Record<string, string>> = {
  "login-prompt": "src/components/modals/LoginPromptModal.tsx",
  login: "src/components/modals/LoginModal.tsx",
  "existing-account": "src/components/modals/ExistingAccountModal.tsx",
  "user-setup": "src/components/modals/UserSetupModal.tsx",
  "gate-closed": "src/components/modals/GateClosedModal.tsx",
  partner: "src/components/modals/PartnerModal.tsx",
  "pixel-consent": "src/components/modals/PixelConsentModal.tsx",
  "refer-friend": "src/components/modals/ReferFriendModal.tsx",
  membership: "src/components/modals/MembershipModal.tsx",
  "special-packages": "src/components/modals/SpecialPackagesModal.tsx",
  "package-selection": "src/components/modals/PackageSelectionModal.tsx",
  "package-detail": "src/components/modals/PackageDetailModal.tsx",
  upsell: "src/components/modals/UpsellModal.tsx",
  "success-screen": "src/components/loading/SuccessScreen.tsx",
  "cancellation-upsell": "src/components/modals/CancellationUpsellModal.tsx",
  "mini-draw-package": "src/components/modals/MiniDrawPackageModal.tsx",
  "subscription-explainer": "src/components/modals/SubscriptionExplainerModal.tsx",
  "past-draws": "src/components/modals/PastDrawsModal.tsx",
  "renewal-failed": "src/components/modals/RenewalFailedModal.tsx",
  "report-problem": "src/components/modals/ReportProblemModal.tsx",
  confirmation: "src/components/modals/ConfirmationModal.tsx",
  "prize-specs": "src/components/modals/PrizeSpecificationsModal.tsx",
  export: "src/components/modals/ExportModal.tsx",
  "icon-picker": "src/components/modals/ui/IconPickerModal.tsx",
  "admin-mini-draw-create": "src/components/modals/AdminMiniDrawModal.tsx",
  "admin-major-draw-create": "src/components/modals/AdminMajorDrawModal.tsx",
  "admin-major-draw-edit": "src/components/modals/MajorDrawEditModal.tsx",
  "admin-mini-draw-edit": "src/components/modals/MiniDrawEditModal.tsx",
  "admin-participants": "src/components/modals/ParticipantsModal.tsx",
  "admin-winner-select": "src/components/modals/WinnerSelectionModal.tsx",
  "admin-winner-edit": "src/components/modals/WinnerEditModal.tsx",
  "admin-user-search": "src/components/modals/UserSearchModal.tsx",
  "admin-promo-toggle": "src/components/modals/AdminPromoToggle.tsx",
  "admin-bonus-entry-promo": "src/components/modals/AdminBonusEntryPromoModal.tsx",
  "admin-scheduled-promo": "src/components/modals/AdminScheduledPromoModal.tsx",
  "admin-scheduled-promo-calendar": "src/components/modals/AdminScheduledPromoCalendarModal.tsx",
  "admin-promo-link": "src/components/modals/AdminPromoLinkModal.tsx",
  "admin-promo-banner-text": "src/components/modals/AdminPromoBannerTextModal.tsx",
  "admin-alternating-multiplier": "src/components/modals/AdminAlternatingMultiplierModal.tsx",
  "admin-product": "src/components/modals/AdminProductModal.tsx",
  "admin-revenue-detail": "src/components/modals/RevenueDetailModal.tsx",
  "admin-membership-by-package": "src/components/modals/MembershipByPackageDetailModal.tsx",
  "user-export": "src/components/admin/UserExportModal.tsx",
  "admin-affiliate-detail": "src/components/admin/AffiliateDetailModal.tsx",
  "admin-channel-detail": "src/components/modals/ChannelDetailModal.tsx",
  "admin-promo-page-detail": "src/components/modals/PromoPageDetailModal.tsx",
  "admin-milestone-reward": "src/components/modals/AdminMilestoneRewardModal.tsx",
  "admin-monthly-redeemables": "src/components/modals/AdminMonthlyRedeemablesModal.tsx",
  "ab-experiment-form": "src/components/admin/ab-testing/ExperimentFormModal.tsx",
  settings: "src/components/modals/SettingsModal.tsx",
  "subscription-management": "src/components/modals/SubscriptionManagementModal.tsx",
  "saved-payment-methods": "src/components/modals/SavedPaymentMethodsModal.tsx",
  "passwordless-login": "src/components/auth/PasswordlessLoginModal.tsx",
  "otp-verification": "src/components/auth/OTPVerificationModal.tsx",
  "email-verification": "src/components/auth/EmailVerificationModal.tsx",
  "custom-date-range": "src/components/admin/CustomDateRangeModal.tsx",
  "fullscreen-image": "src/components/ui/FullscreenImageViewer.tsx",
  "admin-user-detail": "src/components/admin/UserDetailModal.tsx",
  "admin-charge-past-due": "src/components/admin/ChargePastDueModal.tsx",
  "admin-charge-past-due-user": "src/components/admin/ChargePastDueUserModal.tsx",
  "admin-experiment-detail": "src/components/admin/ab-testing/ExperimentDetailModal.tsx",
  "submission-detail": "src/components/admin/submissions/SubmissionDetailModal.tsx",
  "stripe-payment": "src/components/modals/StripePaymentModal.tsx",
  "unified-modal-manager": "src/components/modals/UnifiedModalManager.tsx",
};

const BASE_ENTRIES: Omit<Entry, "sourcePath">[] = [
  { id: "login-prompt", label: "LoginPromptModal", category: "Auth" },
  { id: "login", label: "LoginModal", category: "Auth" },
  { id: "existing-account", label: "ExistingAccountModal", category: "Auth" },
  { id: "user-setup", label: "UserSetupModal", category: "Auth" },
  { id: "gate-closed", label: "GateClosedModal", category: "Marketing" },
  { id: "partner", label: "PartnerModal", category: "Marketing" },
  { id: "pixel-consent", label: "PixelConsentModal", category: "Marketing" },
  { id: "refer-friend", label: "ReferFriendModal", category: "Marketing" },
  { id: "membership", label: "MembershipModal", category: "Commerce", note: "Heavy — uses live hooks" },
  { id: "special-packages", label: "SpecialPackagesModal", category: "Commerce" },
  { id: "package-selection", label: "PackageSelectionModal", category: "Commerce", note: "Uses membership API" },
  { id: "package-detail", label: "PackageDetailModal", category: "Commerce" },
  { id: "upsell", label: "UpsellModal", category: "Commerce", note: "Uses payment hooks" },
  {
    id: "success-screen",
    label: "SuccessScreen",
    category: "Commerce",
    note: "Transaction complete overlay (LoadingContext)",
  },
  { id: "cancellation-upsell", label: "CancellationUpsellModal", category: "Commerce" },
  { id: "mini-draw-package", label: "MiniDrawPackageModal", category: "Commerce" },
  {
    id: "stripe-payment",
    label: "StripePaymentModal",
    category: "Commerce",
    note: "Gallery client secret — Stripe UI may error",
  },
  { id: "subscription-explainer", label: "SubscriptionExplainerModal", category: "Account" },
  { id: "past-draws", label: "PastDrawsModal", category: "Account", note: "Fetches when open" },
  { id: "renewal-failed", label: "RenewalFailedModal", category: "Account", note: "Stripe — needs logged-in user for full UI" },
  { id: "report-problem", label: "ReportProblemModal", category: "Account" },
  { id: "confirmation", label: "ConfirmationModal (warning)", category: "Account" },
  { id: "prize-specs", label: "PrizeSpecificationsModal", category: "Account" },
  { id: "export", label: "ExportModal", category: "Admin — data & catalog" },
  { id: "icon-picker", label: "IconPickerModal", category: "Admin — data & catalog" },
  { id: "admin-mini-draw-create", label: "AdminMiniDrawModal", category: "Admin — draws", note: "Create mini draw" },
  { id: "admin-major-draw-create", label: "AdminMajorDrawModal", category: "Admin — draws", note: "Create major draw" },
  { id: "admin-major-draw-edit", label: "MajorDrawEditModal", category: "Admin — draws", note: "Edit major draw" },
  { id: "admin-mini-draw-edit", label: "MiniDrawEditModal", category: "Admin — draws", note: "Edit mini draw" },
  { id: "admin-participants", label: "ParticipantsModal", category: "Admin — draws", note: "API when open" },
  { id: "admin-winner-select", label: "WinnerSelectionModal", category: "Admin — draws" },
  { id: "admin-winner-edit", label: "WinnerEditModal", category: "Admin — draws" },
  { id: "admin-user-search", label: "UserSearchModal", category: "Admin — draws", note: "API when open" },
  { id: "admin-promo-toggle", label: "AdminPromoToggle", category: "Admin — promos", note: "Live promo API" },
  { id: "admin-bonus-entry-promo", label: "AdminBonusEntryPromoModal", category: "Admin — promos" },
  { id: "admin-scheduled-promo", label: "AdminScheduledPromoModal", category: "Admin — promos" },
  {
    id: "admin-scheduled-promo-calendar",
    label: "AdminScheduledPromoCalendarModal",
    category: "Admin — promos",
  },
  { id: "admin-promo-link", label: "AdminPromoLinkModal", category: "Admin — promos" },
  { id: "admin-promo-banner-text", label: "AdminPromoBannerTextModal", category: "Admin — promos" },
  { id: "admin-alternating-multiplier", label: "AdminAlternatingMultiplierModal", category: "Admin — promos" },
  { id: "admin-product", label: "AdminProductModal", category: "Admin — data & catalog" },
  { id: "admin-revenue-detail", label: "RevenueDetailModal", category: "Admin — data & catalog", note: "API when open" },
  {
    id: "admin-membership-by-package",
    label: "MembershipByPackageDetailModal",
    category: "Admin — data & catalog",
    note: "API when open",
  },
  { id: "user-export", label: "UserExportModal", category: "Admin — data & catalog" },
  {
    id: "admin-charge-past-due",
    label: "ChargePastDueModal",
    category: "Admin — billing",
    note: "Mock onConfirm — preview flow without API",
  },
  {
    id: "admin-charge-past-due-user",
    label: "ChargePastDueUserModal",
    category: "Admin — billing",
    note: "Single-user charge — mock onConfirm",
  },
  {
    id: "admin-experiment-detail",
    label: "ExperimentDetailModal",
    category: "Admin — A/B testing",
    note: "Needs valid experimentId in API",
  },
  {
    id: "submission-detail",
    label: "SubmissionDetailModal",
    category: "Admin — submissions",
    note: "Mock partner application",
  },
  { id: "admin-affiliate-detail", label: "AffiliateDetailModal", category: "Admin — partners", note: "API when open" },
  { id: "admin-channel-detail", label: "ChannelDetailModal", category: "Admin — analytics", note: "API when open" },
  {
    id: "admin-promo-page-detail",
    label: "PromoPageDetailModal",
    category: "Admin — analytics",
    note: "API when open",
  },
  { id: "admin-milestone-reward", label: "AdminMilestoneRewardModal", category: "Admin — promos" },
  { id: "admin-monthly-redeemables", label: "AdminMonthlyRedeemablesModal", category: "Admin — promos" },
  { id: "ab-experiment-form", label: "ExperimentFormModal", category: "Admin — A/B testing", note: "Create experiment" },
  { id: "settings", label: "SettingsModal", category: "Account", note: "Profile / tabs" },
  {
    id: "subscription-management",
    label: "SubscriptionManagementModal",
    category: "Account",
    note: "Heavy — hooks & packages",
  },
  { id: "saved-payment-methods", label: "SavedPaymentMethodsModal", category: "Account", note: "Stripe methods" },
  { id: "passwordless-login", label: "PasswordlessLoginModal", category: "Auth" },
  { id: "otp-verification", label: "OTPVerificationModal", category: "Auth", note: "Standalone OTP UI" },
  { id: "email-verification", label: "EmailVerificationModal", category: "Auth" },
  { id: "custom-date-range", label: "CustomDateRangeModal", category: "Overlays — date & pickers" },
  { id: "fullscreen-image", label: "FullscreenImageViewer", category: "Overlays — date & pickers" },
  {
    id: "overlay-mobile-sidebar",
    label: "Mobile nav drawer (shell preview)",
    category: "Overlays — shells",
    note: "Not ModalContainer",
  },
  {
    id: "admin-user-detail",
    label: "UserDetailModal (via admin context)",
    category: "Overlays — shells",
    note: "openUserModal()",
  },
  {
    id: "unified-modal-manager",
    label: "UnifiedModalManager",
    category: "Overlays — orchestration",
    note: "Priority store + trigger strip",
  },
];

const ENTRIES: Entry[] = BASE_ENTRIES.map((e) => ({
  ...e,
  sourcePath: GALLERY_SOURCE_PATH[e.id],
}));

function UnifiedModalGalleryTriggers() {
  const requestModal = useModalPriorityStore((s) => s.requestModal);
  const closeAll = useModalPriorityStore((s) => s.closeModal);

  return (
    <div className="fixed bottom-4 right-4 z-[10001] max-w-sm rounded-xl border border-neutral-200 bg-white/95 p-3 shadow-2xl backdrop-blur-sm dark:border-neutral-600 dark:bg-neutral-900/95">
      <p className="mb-2 text-xs font-semibold text-neutral-800 dark:text-neutral-200">Modal priority triggers</p>
      <p className="mb-2 text-[10px] leading-snug text-neutral-500 dark:text-neutral-400">
        Opens the same modals as production via <code className="rounded bg-neutral-100 px-0.5 dark:bg-neutral-800">requestModal</code>.
        Pixel consent is wired with <code className="rounded bg-neutral-100 px-0.5 dark:bg-neutral-800">isOpen=&#123;false&#125;</code> in the manager — use the dedicated gallery item for that UI.
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className="rounded-md bg-neutral-100 px-2 py-1 text-[10px] font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          onClick={() => requestModal("user-setup", true)}
        >
          User setup
        </button>
        <button
          type="button"
          className="rounded-md bg-neutral-100 px-2 py-1 text-[10px] font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          onClick={() =>
            requestModal("upsell", true, {
              offer: SAMPLE_UPSELL_OFFERS[0],
              userContext: MOCK_UPSELL_USER,
              originalPurchaseContext: MOCK_ORIGINAL_PURCHASE,
            })
          }
        >
          Upsell
        </button>
        <button
          type="button"
          className="rounded-md bg-neutral-100 px-2 py-1 text-[10px] font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          onClick={() => requestModal("special-packages", true)}
        >
          Special packages
        </button>
        <button
          type="button"
          className="rounded-md bg-neutral-100 px-2 py-1 text-[10px] font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          onClick={() =>
            requestModal("gate-closed", true, {
              nextActivationDate: new Date(Date.now() + 7 * 86400000).toISOString(),
              nextDrawName: "Gallery draw",
            })
          }
        >
          Gate closed
        </button>
        <button
          type="button"
          className="rounded-md bg-neutral-100 px-2 py-1 text-[10px] font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          onClick={() =>
            requestModal("subscription-explainer", true, {
              entriesPerMonth: 100,
              packageName: "Tradie",
              userId: PREVIEW_USER_ID,
              lastMonthAccumulatedEntries: 25,
              selectedPackageId: "tradie-subscription",
            })
          }
        >
          Sub explainer
        </button>
        <button
          type="button"
          className="rounded-md bg-neutral-100 px-2 py-1 text-[10px] font-medium hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
          onClick={() => requestModal("renewal-failed", true)}
        >
          Renewal failed
        </button>
        <button
          type="button"
          className="rounded-md border border-red-200 px-2 py-1 text-[10px] font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
          onClick={() => closeAll()}
        >
          Close active
        </button>
      </div>
    </div>
  );
}

export default function ModalsGalleryClient() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [iconPickerValue, setIconPickerValue] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [galleryDropdownValue, setGalleryDropdownValue] = useState("");
  const [galleryDateValue, setGalleryDateValue] = useState("");

  const membershipModal = useMembershipModal(SAMPLE_PLAN);
  const { showToast } = useToast();
  const { openUserModal } = useAdminUserModal();

  const close = useCallback(() => setOpenId(null), []);

  const handleActivate = useCallback(
    (e: Entry) => {
      if (e.id === "overlay-mobile-sidebar") {
        setMobileSidebarOpen(true);
        setOpenId(null);
        return;
      }
      if (e.id === "admin-user-detail") {
        openUserModal(PREVIEW_USER_ID);
        setOpenId(null);
        return;
      }
      setOpenId(e.id);
    },
    [openUserModal]
  );

  const isEntryActive = useCallback(
    (e: Entry) => openId === e.id || (e.id === "overlay-mobile-sidebar" && mobileSidebarOpen),
    [openId, mobileSidebarOpen]
  );

  const specialPackages = useMemo(() => {
    const member = getMemberOnlyPackages().filter((p) => p.type === "one-time");
    if (member.length > 0) return member;
    return getPackagesByType("one-time").slice(0, 4);
  }, []);

  const prizeCatalogEntry = useMemo(() => getPrizeBySlug(DEFAULT_PRIZE_SLUG), []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return ENTRIES;
    return ENTRIES.filter(
      (e) =>
        e.label.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.id.includes(q)
    );
  }, [filter]);

  const grouped = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of filtered) {
      const list = m.get(e.category) ?? [];
      list.push(e);
      m.set(e.category, list);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const reachablePathSet = useMemo(() => {
    const set = new Set<string>();
    for (const m of reachabilityReport.modals) {
      if (m.reachable) set.add(m.path);
    }
    return set;
  }, []);

  const unreachableInventoryPaths = useMemo(
    () => reachabilityReport.modals.filter((m) => !m.reachable).map((m) => m.path),
    []
  );

  const gallerySourcePathSet = useMemo(() => {
    const s = new Set<string>();
    for (const e of ENTRIES) {
      if (e.sourcePath) s.add(e.sourcePath);
    }
    return s;
  }, []);

  const reachableModalsMissingFromGallery = useMemo(
    () =>
      reachabilityReport.modals
        .filter((m) => m.reachable && !gallerySourcePathSet.has(m.path))
        .map((m) => m.path)
        .sort(),
    [gallerySourcePathSet]
  );

  const analyzedAt = reachabilityReport.generatedAt;
  const analyzedDate = useMemo(() => {
    try {
      return new Date(analyzedAt).toLocaleString();
    } catch {
      return analyzedAt;
    }
  }, [analyzedAt]);

  const isOpen = (id: string) => openId === id;

  const prevOpenIdRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevOpenIdRef.current;
    prevOpenIdRef.current = openId;
    if (prev === "unified-modal-manager" && openId !== "unified-modal-manager") {
      useModalPriorityStore.getState().closeModal();
    }
  }, [openId]);

  return (
    <div className="min-h-dvh bg-neutral-100 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="sticky top-0 z-50 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/90">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Overlay &amp; modal gallery</h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Development only — modals (portals), drawers, popovers, and in-page pickers for layout and dark-mode review.
              Use the theme toggle, then open an item from the list or try the embedded popover demos below.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:max-w-md sm:flex-row sm:items-center">
            <label className="block min-w-0 flex-1">
                <span className="sr-only">Filter overlays</span>
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by name\u2026"
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              />
            </label>
            <div className="flex shrink-0 items-center justify-end gap-2 sm:justify-center">
              <span className="text-xs text-neutral-500 dark:text-neutral-400 sm:hidden">Theme</span>
              <ThemeToggleButton className="group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-300 bg-white/90 shadow-md transition-all duration-300 hover:scale-105 active:scale-95 dark:border-neutral-600 dark:bg-neutral-900/90" />
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pt-4">
        <div className="rounded-xl border border-neutral-200 bg-white p-4 text-sm shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            App entry reachability (static)
          </h2>
          <p className="mt-2 text-neutral-700 dark:text-neutral-300">
            <strong>{reachabilityReport.reachableModalCount}</strong> of{" "}
            <strong>{reachabilityReport.modalInventoryCount}</strong> tracked modal/overlay files are imported (directly
            or transitively) from Next.js route entry files — so they can ship in the app bundle.{" "}
            <strong>{reachabilityReport.unreachableModalCount}</strong> are{" "}
            <span className="text-amber-700 dark:text-amber-400">not reachable</span> from those seeds (often dead code,
            or only referenced from scripts/tests). List items mark{" "}
            <span className="whitespace-nowrap rounded bg-emerald-100 px-1 font-semibold text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200">
              Graph
            </span>{" "}
            /{" "}
            <span className="whitespace-nowrap rounded bg-amber-100 px-1 font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
              No graph
            </span>
            .
          </p>
          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            Last report: {analyzedDate}. Refresh after routing changes:{" "}
            <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">npm run analyze:modals</code>
            <span className="mx-1 text-neutral-400">·</span>
            {reachabilityReport.method.slice(0, 160)}
            …
          </p>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[280px,1fr]">
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          {grouped.map(([category, items]) => (
            <div key={category}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                {category}
              </h2>
              <ul className="space-y-1">
                {items.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => handleActivate(e)}
                      className={`flex w-full flex-col rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        isEntryActive(e)
                          ? "bg-red-600 text-white"
                          : "bg-white hover:bg-neutral-50 dark:bg-neutral-900 dark:hover:bg-neutral-800"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 flex-1 font-medium">{e.label}</span>
                        {e.sourcePath ? (
                          reachablePathSet.has(e.sourcePath) ? (
                            <span
                              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                                isEntryActive(e)
                                  ? "bg-white/20 text-white"
                                  : "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/45 dark:text-emerald-200"
                              }`}
                              title="This file is reachable from Next.js app entry points (static import graph)."
                            >
                              Graph
                            </span>
                          ) : (
                            <span
                              className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                                isEntryActive(e)
                                  ? "bg-white/20 text-white"
                                  : "bg-amber-100 text-amber-950 dark:bg-amber-900/45 dark:text-amber-200"
                              }`}
                              title="Not reachable from app entries in static analysis — verify before deleting."
                            >
                              No graph
                            </span>
                          )
                        ) : (
                          <span
                            className={`shrink-0 text-[10px] font-medium ${
                              isEntryActive(e) ? "text-white/70" : "text-neutral-400 dark:text-neutral-500"
                            }`}
                            title="Gallery-only shell or not mapped to a single tracked file."
                          >
                            —
                          </span>
                        )}
                      </div>
                      {e.note ? (
                        <span
                          className={`mt-0.5 text-xs ${
                            isEntryActive(e) ? "text-white/80" : "text-neutral-500 dark:text-neutral-500"
                          }`}
                        >
                          {e.note}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>

        <section className="space-y-6 rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <div>
            <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">How to use</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-600 dark:text-neutral-400">
              <li>List items open centered modals (portal), shell previews, or context-driven overlays.</li>
              <li>Toggle theme to check light and dark surfaces together.</li>
              <li>
                APIs and Stripe may show loading or errors without real sessions — this page is for visual review.
              </li>
              <li>
                Add new entries in{" "}
                <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">ModalsGalleryClient.tsx</code> when
                you ship new overlays.
              </li>
            </ul>
          </div>

          {unreachableInventoryPaths.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-4 dark:border-amber-800/60 dark:bg-amber-950/25">
              <h3 className="text-sm font-semibold text-amber-950 dark:text-amber-100">
                Tracked modal files not reachable from app entries
              </h3>
              <p className="mt-1 text-xs text-amber-900/90 dark:text-amber-200/80">
                These paths are not in the static import graph starting from Next.js route seeds. They may be unused, only
                pulled in from scripts/tests, or reached via dynamic imports the scanner does not see.
              </p>
              <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-y-auto pl-5 font-mono text-xs text-amber-950 dark:text-amber-100/90">
                {unreachableInventoryPaths.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {reachableModalsMissingFromGallery.length > 0 ? (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-950">
              <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                In app graph but not in this gallery list
              </h3>
              <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                Reachable from app entries; add a preview row in{" "}
                <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">ModalsGalleryClient.tsx</code> if you
                want them here.
              </p>
              <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-y-auto pl-5 font-mono text-xs text-neutral-700 dark:text-neutral-300">
                {reachableModalsMissingFromGallery.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-950">
            <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Popover-style controls</h3>
            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
              Dropdown and date picker panels stack above content (same z-index patterns as modals).
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Dropdown
                options={DROPDOWN_GALLERY_OPTIONS}
                value={galleryDropdownValue}
                onChange={setGalleryDropdownValue}
                placeholder="Gallery dropdown"
                label="Dropdown"
              />
              <DateTimePicker
                type="date"
                value={galleryDateValue}
                onChange={(ev) => setGalleryDateValue(ev.target.value)}
                label="Date picker"
                placeholder="Pick a date"
              />
            </div>
          </div>

          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-950">
            <h3 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Toasts</h3>
            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
              Fixed stack from <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">ToastProvider</code>.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  showToast({ title: "Gallery success", message: "Toast preview — success styling.", type: "success" })
                }
                className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                Success toast
              </button>
              <button
                type="button"
                onClick={() =>
                  showToast({ title: "Gallery error", message: "Toast preview — error styling.", type: "error" })
                }
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Error toast
              </button>
              <button
                type="button"
                onClick={() =>
                  showToast({ title: "Gallery info", message: "Neutral / info toast preview.", type: "info" })
                }
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
              >
                Info toast
              </button>
            </div>
          </div>

          {openId ? (
            <p className="text-sm text-red-600 dark:text-red-400">
              Open: <strong>{ENTRIES.find((e) => e.id === openId)?.label ?? openId}</strong>
            </p>
          ) : null}
          {mobileSidebarOpen ? (
            <p className="text-sm text-red-600 dark:text-red-400">
              Open: <strong>Mobile nav drawer (preview)</strong>
            </p>
          ) : null}
          {iconPickerValue ? (
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Last icon picked: <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">{iconPickerValue}</code>
            </p>
          ) : null}
        </section>
      </div>

      <LoginPromptModal isOpen={isOpen("login-prompt")} onClose={close} />
      <LoginModal isOpen={isOpen("login")} onClose={close} email="preview@toolsaustralia.test" />
      <ExistingAccountModal isOpen={isOpen("existing-account")} onClose={close} conflictField="email" email="preview@toolsaustralia.test" />
      <UserSetupModal isOpen={isOpen("user-setup")} onClose={close} onComplete={close} initialStep={1} />
      <GateClosedModal
        isOpen={isOpen("gate-closed")}
        onClose={close}
        nextActivationDate={new Date(Date.now() + 7 * 86400000).toISOString()}
        nextDrawName="Preview Draw"
      />
      <PartnerModal isOpen={isOpen("partner")} onClose={close} />
      <PixelConsentModal isOpen={isOpen("pixel-consent")} onCloseAction={close} onAccept={close} onDecline={close} />
      <ReferFriendModal
        isOpen={isOpen("refer-friend")}
        onCloseAction={close}
        userId={PREVIEW_USER_ID}
        userFirstName="Preview"
      />
      <MembershipModal isOpen={isOpen("membership")} onClose={close} selectedPlan={SAMPLE_PLAN} />
      <SpecialPackagesModal
        isOpen={isOpen("special-packages")}
        onClose={close}
        packages={specialPackages}
        onPackageSelect={() => {}}
      />
      <PackageSelectionModal
        isOpen={isOpen("package-selection")}
        onClose={close}
        currentPlan={SAMPLE_PLAN}
        onPlanSelect={() => {}}
      />
      <PackageDetailModal
        isOpen={isOpen("package-detail")}
        onClose={close}
        packageData={{
          name: "Tradie",
          type: "subscription",
          description: "Gallery preview copy.",
          features: ["Monthly entries", "Partner discounts"],
          entriesPerMonth: 100,
          totalEntries: 100,
        }}
        membershipType="subscription"
        accumulation={{ entriesPerMonth: 100, lastMonthAccumulatedEntries: 30, selectedPackageId: "tradie-subscription" }}
        hasActiveSubscription
        hasAccessToAdditionalPackages
      />
      <UpsellModal
        isOpen={isOpen("upsell")}
        onClose={close}
        offer={SAMPLE_UPSELL_OFFERS[0]}
        userContext={MOCK_UPSELL_USER}
        originalPurchaseContext={MOCK_ORIGINAL_PURCHASE}
        onAccept={() => {}}
        onDecline={() => {}}
      />
      <SuccessScreen
        isVisible={isOpen("success-screen")}
        title="Successful!"
        subtitle="Tradie activated"
        benefits={[
          { text: "Tradie membership activated", icon: "gift", highlight: true },
          { text: "Bonus entries applied to your account", icon: "zap" },
        ]}
        autoCloseDelay={0}
        onAutoClose={close}
      />
      <CancellationUpsellModal isOpen={isOpen("cancellation-upsell")} onClose={close} onRedeem={close} onDecline={close} />
      <MiniDrawPackageModal
        isOpen={isOpen("mini-draw-package")}
        onClose={close}
        package={miniDrawPackages[0]}
        onPurchase={() => {}}
      />
      <SubscriptionExplainerModal
        isOpen={isOpen("subscription-explainer")}
        onClose={close}
        entriesPerMonth={100}
        packageName="Tradie"
        lastMonthAccumulatedEntries={25}
        selectedPackageId="tradie-subscription"
      />
      <PastDrawsModal isOpen={isOpen("past-draws")} onClose={close} userId={PREVIEW_USER_ID} />
      <RenewalFailedModal isOpen={isOpen("renewal-failed")} onClose={close} />
      <ReportProblemModal isOpen={isOpen("report-problem")} onClose={close} errorContext={MOCK_ERROR_CONTEXT} />
      <ConfirmationModal
        isOpen={isOpen("confirmation")}
        onClose={close}
        onConfirm={close}
        type="warning"
        title="Preview confirmation"
        message="This is a sample warning confirmation for the modal gallery."
        confirmText="Confirm"
        cancelText="Cancel"
      />
      <PrizeSpecificationsModal
        isOpen={isOpen("prize-specs")}
        onClose={close}
        prize={prizeCatalogEntry ?? null}
      />
      <ExportModal
        isOpen={isOpen("export")}
        onClose={close}
        majorDrawId="draw_preview"
        majorDrawName="Preview Major Draw"
        totalParticipants={128}
      />
      <IconPickerModal
        isOpen={isOpen("icon-picker")}
        onClose={close}
        onSelect={(name) => {
          setIconPickerValue(name);
          close();
        }}
        title="Pick an icon (preview)"
      />

      <AdminMiniDrawModal isOpen={isOpen("admin-mini-draw-create")} onClose={close} />
      <AdminMajorDrawModal isOpen={isOpen("admin-major-draw-create")} onClose={close} />
      <MajorDrawEditModal
        isOpen={isOpen("admin-major-draw-edit")}
        onCloseAction={close}
        onSaveAction={async () => {}}
        majorDraw={GALLERY_MAJOR_DRAW}
      />
      <MiniDrawEditModal
        isOpen={isOpen("admin-mini-draw-edit")}
        onClose={close}
        miniDraw={GALLERY_MINI_SUMMARY}
        onSave={async () => {}}
      />
      <ParticipantsModal
        isOpen={isOpen("admin-participants")}
        onClose={close}
        majorDrawId={PREVIEW_MAJOR_DRAW_ID}
        majorDrawName={GALLERY_MAJOR_DRAW.name}
      />
      <WinnerSelectionModal
        isOpen={isOpen("admin-winner-select")}
        onClose={close}
        onWinnerSelected={async () => {}}
        drawId={PREVIEW_MAJOR_DRAW_ID}
        drawName={GALLERY_MAJOR_DRAW.name}
        drawType="major"
        totalEntries={500}
        enableImageField
      />
      <WinnerEditModal
        isOpen={isOpen("admin-winner-edit")}
        onClose={close}
        winnerId="preview-winner"
        winnerName="Alex Preview"
        drawName={GALLERY_MAJOR_DRAW.name}
        drawType="major"
        currentTestimony="<p>Great prize!</p>"
        currentSelectedPrize={DEFAULT_PRIZE_SLUG}
        currentImageUrl={null}
        currentDrawResultUrl={null}
        onUpdate={async () => {}}
      />
      <UserSearchModal
        isOpen={isOpen("admin-user-search")}
        onClose={close}
        onUserSelect={() => {}}
        title="Search users (gallery)"
        majorDrawId={PREVIEW_MAJOR_DRAW_ID}
      />
      <AdminPromoToggle isOpen={isOpen("admin-promo-toggle")} onClose={close} />
      <AdminBonusEntryPromoModal isOpen={isOpen("admin-bonus-entry-promo")} onClose={close} />
      <AdminScheduledPromoModal isOpen={isOpen("admin-scheduled-promo")} onClose={close} />
      <AdminScheduledPromoCalendarModal isOpen={isOpen("admin-scheduled-promo-calendar")} onClose={close} />
      <AdminPromoLinkModal isOpen={isOpen("admin-promo-link")} onClose={close} />
      <AdminPromoBannerTextModal isOpen={isOpen("admin-promo-banner-text")} onClose={close} />
      <AdminAlternatingMultiplierModal isOpen={isOpen("admin-alternating-multiplier")} onClose={close} />
      <AdminProductModal isOpen={isOpen("admin-product")} onClose={close} />
      <RevenueDetailModal
        isOpen={isOpen("admin-revenue-detail")}
        onClose={close}
        category={GALLERY_REVENUE_CATEGORY}
        dateRange="all-time"
      />
      <MembershipByPackageDetailModal
        isOpen={isOpen("admin-membership-by-package")}
        onClose={close}
        packageId="tradie-subscription"
        packageName="Tradie"
      />

      <ChargePastDueModal isOpen={isOpen("admin-charge-past-due")} onClose={close} onConfirm={MOCK_CHARGE_RESPONSE} />
      <ChargePastDueUserModal
        isOpen={isOpen("admin-charge-past-due-user")}
        onClose={close}
        targetUserId={PREVIEW_USER_ID}
        memberLabel="Gallery preview member"
        onConfirm={MOCK_CHARGE_RESPONSE}
      />
      <ExperimentDetailModal
        isOpen={isOpen("admin-experiment-detail")}
        onClose={close}
        experimentId={PREVIEW_USER_ID}
      />
      {isOpen("submission-detail") ? (
        <SubmissionDetailModal
          submission={GALLERY_PARTNER_SUBMISSION}
          type="partner"
          onClose={close}
          onUpdated={() => {}}
        />
      ) : null}
      <StripePaymentModal
        isOpen={isOpen("stripe-payment")}
        onClose={close}
        clientSecret="pi_gallery_invalid_client_secret"
        packageName="Tradie"
        packageId="tradie-subscription"
        amount={4999}
        onPaymentSuccess={() => {}}
      />
      {openId === "unified-modal-manager" ? (
        <>
          <UnifiedModalManager />
          <UnifiedModalGalleryTriggers />
        </>
      ) : null}

      <UserExportModal
        isOpen={isOpen("user-export")}
        onClose={close}
        filters={GALLERY_EXPORT_FILTERS}
        totalUsers={42}
      />
      <AffiliateDetailModal
        isOpen={isOpen("admin-affiliate-detail")}
        onClose={close}
        onUpdate={() => {}}
        affiliateId="000000000000000000000099"
      />
      <ChannelDetailModal
        isOpen={isOpen("admin-channel-detail")}
        onClose={close}
        utmSource="google"
        startDate="2026-01-01"
        endDate="2026-03-31"
        summaryFromParent={{ visits: 1200, signups: 40, conversions: 12, revenue: 3500 }}
      />
      <PromoPageDetailModal
        isOpen={isOpen("admin-promo-page-detail")}
        onClose={close}
        pageType="promo-page"
        slug="gallery-preview"
        pageLabel="Gallery promo page"
        startDate="2026-01-01"
        endDate="2026-03-31"
        summaryFromParent={{ visits: 800, signups: 25, conversions: 8, revenue: 2100 }}
      />
      <AdminMilestoneRewardModal isOpen={isOpen("admin-milestone-reward")} onClose={close} />
      <AdminMonthlyRedeemablesModal isOpen={isOpen("admin-monthly-redeemables")} onClose={close} />
      <ExperimentFormModal isOpen={isOpen("ab-experiment-form")} onClose={close} onSuccess={close} />

      <SettingsModal
        isOpen={isOpen("settings")}
        onClose={close}
        user={GALLERY_SETTINGS_USER}
        membershipModal={membershipModal}
      />
      <SubscriptionManagementModal
        isOpen={isOpen("subscription-management")}
        onClose={close}
        user={GALLERY_SUBSCRIPTION_USER}
        membershipModal={membershipModal}
      />
      <SavedPaymentMethodsModal isOpen={isOpen("saved-payment-methods")} onClose={close} />

      <PasswordlessLoginModal isOpen={isOpen("passwordless-login")} onClose={close} onLoginSuccess={() => close()} />
      <OTPVerificationModal
        isOpen={isOpen("otp-verification")}
        onClose={close}
        email="preview@toolsaustralia.test"
        mobile="0400000000"
        onVerificationSuccess={() => close()}
        onResendOTP={async () => {}}
      />
      <EmailVerificationModal
        isOpen={isOpen("email-verification")}
        onCloseAction={close}
        email="preview@toolsaustralia.test"
        userName="Preview"
        onVerificationSuccessAction={() => close()}
        onSkipAction={close}
        onWrongEmailAction={close}
        isMandatory={false}
      />

      <CustomDateRangeModal
        isOpen={isOpen("custom-date-range")}
        onClose={close}
        onApply={() => close()}
        majorDraws={[
          {
            _id: PREVIEW_MAJOR_DRAW_ID,
            name: GALLERY_MAJOR_DRAW.name,
            activationDate: GALLERY_MAJOR_DRAW.activationDate,
            drawDate: GALLERY_MAJOR_DRAW.drawDate,
            status: GALLERY_MAJOR_DRAW.status,
          },
        ]}
      />

      <FullscreenImageViewer
        isOpen={isOpen("fullscreen-image")}
        onClose={close}
        initialIndex={0}
        images={[{ src: "/images/Tools Australia Logo/Primary Logo.webp", alt: "Gallery image" }]}
        title="Fullscreen viewer (dev)"
      />

      <MobileNavSidebarPreview isOpen={mobileSidebarOpen} onClose={() => setMobileSidebarOpen(false)} />
    </div>
  );
}
