"use client";

import React, { useState } from "react";
import InvoicePreview from "./InvoicePreview";
import VerificationEmailPreview from "./VerificationEmailPreview";
import PasswordResetEmailPreview from "./PasswordResetEmailPreview";
import LoginCodeEmailPreview from "./LoginCodeEmailPreview";
import ContactSubmissionEmailPreview from "./ContactSubmissionEmailPreview";
import PartnerApplicationEmailPreview from "./PartnerApplicationEmailPreview";
import AdminReplyEmailPreview from "./AdminReplyEmailPreview";
import PaymentFailedPreview from "./PaymentFailedPreview";
import RenewalFailedPreview from "./RenewalFailedPreview";
import SubscriptionRenewalPreview from "./SubscriptionRenewalPreview";
import MiniDrawFullCapacityPreview from "./MiniDrawFullCapacityPreview";
import WinnerEmailPreview from "./WinnerEmailPreview";
import ReferralRewardEmailPreview from "./ReferralRewardEmailPreview";
import StaffInvitePreview from "./StaffInvitePreview";
import DrawReminderPreview from "./DrawReminderPreview";

export type EmailPreviewTabId =
  | "verification"
  | "password-reset"
  | "login-code"
  | "staff-invite"
  | "winner"
  | "referral"
  | "contact"
  | "partner"
  | "admin-reply"
  | "mini-draw-full"
  | "invoice"
  | "subscription-renewal"
  | "renewal-failed"
  | "payment-failed"
  | "draw-reminder";

type Badge = "SendGrid" | "Klaviyo" | "Future";
type NavItem = { id: EmailPreviewTabId; label: string; badge: Badge };
type NavGroup = { label: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    label: "SendGrid · Transactional",
    items: [
      { id: "verification", label: "Verification", badge: "SendGrid" },
      { id: "password-reset", label: "Password reset", badge: "SendGrid" },
      { id: "login-code", label: "Login code", badge: "SendGrid" },
      { id: "staff-invite", label: "Staff invite", badge: "SendGrid" },
    ],
  },
  {
    label: "SendGrid · Draws & referrals",
    items: [
      { id: "winner", label: "Winner announcement", badge: "SendGrid" },
      { id: "referral", label: "Referral reward", badge: "SendGrid" },
    ],
  },
  {
    label: "SendGrid · Internal / ops",
    items: [
      { id: "contact", label: "Contact notify", badge: "SendGrid" },
      { id: "partner", label: "Partner notify", badge: "SendGrid" },
      { id: "admin-reply", label: "Admin reply", badge: "SendGrid" },
      { id: "mini-draw-full", label: "Mini-draw 100%", badge: "SendGrid" },
    ],
  },
  {
    label: "Klaviyo · Lifecycle (paste-ready)",
    items: [
      { id: "invoice", label: "Invoice / receipt", badge: "Klaviyo" },
      { id: "subscription-renewal", label: "Renewal success", badge: "Klaviyo" },
      { id: "renewal-failed", label: "Renewal failed", badge: "Klaviyo" },
      { id: "payment-failed", label: "Signup failed", badge: "Klaviyo" },
      { id: "draw-reminder", label: "Draw reminder", badge: "Future" },
    ],
  },
];

const ALL_ITEMS = NAV.flatMap((g) => g.items);

const BADGE_CLASS: Record<Badge, string> = {
  SendGrid: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  Klaviyo: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  Future: "bg-gray-200 text-gray-600 dark:bg-neutral-700 dark:text-neutral-300",
};

/**
 * Email Preview Layout — dev-only page body (`/email-preview`).
 * Admin-style left sidebar grouped by sender/purpose. SendGrid items render live from
 * `@/lib/email/templates`; Klaviyo items render the paste-ready design with sample data
 * (source of truth: `email-templates/klaviyo/`).
 */
const EmailPreviewLayout: React.FC = () => {
  const [activeTab, setActiveTab] = useState<EmailPreviewTabId>("verification");
  const [navOpen, setNavOpen] = useState(false);

  const activeItem = ALL_ITEMS.find((i) => i.id === activeTab) ?? ALL_ITEMS[0];

  function renderPanel() {
    switch (activeTab) {
      case "verification":
        return <VerificationEmailPreview />;
      case "password-reset":
        return <PasswordResetEmailPreview />;
      case "login-code":
        return <LoginCodeEmailPreview />;
      case "staff-invite":
        return <StaffInvitePreview />;
      case "winner":
        return <WinnerEmailPreview />;
      case "referral":
        return <ReferralRewardEmailPreview />;
      case "contact":
        return <ContactSubmissionEmailPreview />;
      case "partner":
        return <PartnerApplicationEmailPreview />;
      case "admin-reply":
        return <AdminReplyEmailPreview />;
      case "mini-draw-full":
        return <MiniDrawFullCapacityPreview />;
      case "invoice":
        return <InvoicePreview />;
      case "subscription-renewal":
        return <SubscriptionRenewalPreview />;
      case "renewal-failed":
        return <RenewalFailedPreview />;
      case "payment-failed":
        return <PaymentFailedPreview />;
      case "draw-reminder":
        return <DrawReminderPreview />;
      default:
        return null;
    }
  }

  const Sidebar = (
    <nav className="flex h-full flex-col">
      <div className="border-b border-gray-200 px-4 py-4 dark:border-neutral-800">
        <p className="text-sm font-bold uppercase tracking-wide text-gray-900 dark:text-neutral-100">Email previews</p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-neutral-400">{ALL_ITEMS.length} templates · dev only</p>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {NAV.map((group) => (
          <div key={group.label} className="mb-4">
            <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-neutral-500">
              {group.label}
            </p>
            {group.items.map((item) => {
              const active = item.id === activeTab;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setNavOpen(false);
                  }}
                  className={`mb-0.5 flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    active
                      ? "bg-red-50 font-semibold text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900"
                      : "text-gray-700 hover:bg-gray-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  }`}
                >
                  <span className="truncate">{item.label}</span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${BADGE_CLASS[item.badge]}`}>
                    {item.badge}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-950">
      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-r border-gray-200 bg-white lg:block dark:border-neutral-800 dark:bg-neutral-900">
          {Sidebar}
        </aside>

        {/* Mobile drawer */}
        {navOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setNavOpen(false)} />
            <aside className="absolute left-0 top-0 h-full w-72 border-r border-gray-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
              {Sidebar}
            </aside>
          </div>
        )}

        {/* Main */}
        <main className="min-w-0 flex-1">
          {/* Top bar */}
          <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-gray-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/90">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              className="rounded-md border border-gray-300 p-2 text-gray-600 lg:hidden dark:border-neutral-700 dark:text-neutral-300"
              aria-label="Open template list"
            >
              <span className="block h-0.5 w-4 bg-current" />
              <span className="mt-1 block h-0.5 w-4 bg-current" />
              <span className="mt-1 block h-0.5 w-4 bg-current" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-gray-900 dark:text-neutral-100">{activeItem.label}</h1>
              <p className="truncate text-xs text-gray-500 dark:text-neutral-400">
                {activeItem.badge === "Klaviyo"
                  ? "Klaviyo paste-ready (sample data) · source: email-templates/klaviyo/"
                  : activeItem.badge === "Future"
                    ? "Not wired — prepared for future use"
                    : "SendGrid · rendered live from src/lib/email/templates.ts"}
              </p>
            </div>
            <span className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${BADGE_CLASS[activeItem.badge]}`}>
              {activeItem.badge}
            </span>
          </div>

          <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
            <div className="rounded-lg bg-white p-4 shadow-sm sm:p-6 dark:bg-neutral-900 dark:ring-1 dark:ring-neutral-800">
              {renderPanel()}
            </div>
            <div className="mt-6 rounded-lg bg-blue-50 p-4 text-sm text-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
              <p className="font-semibold">Note</p>
              <p className="mt-1">
                Mock data is used for all previews. <strong>SendGrid</strong> rows render live from the same template
                functions as production. <strong>Klaviyo</strong> rows show the paste-ready design with sample values; the
                source of truth for pasting is <code className="rounded bg-blue-100 px-1 dark:bg-blue-900/50">email-templates/klaviyo/</code>.
                This page is only available in development.
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default EmailPreviewLayout;
