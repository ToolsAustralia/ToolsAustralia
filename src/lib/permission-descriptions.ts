/**
 * Human-readable labels + Discord-style explanations for every area and
 * every permission in the catalog. The Settings -> Roles UI renders these
 * next to each toggle so the role editor knows what they're granting.
 *
 * Keep this file in lockstep with src/lib/permissions.ts: every permission
 * defined there MUST have an entry below. The permission-catalog test
 * enforces this.
 */
import type { Area, Permission } from "./permissions";

export interface AreaMeta {
  /** Short label for the section header (e.g. "Users", "Major Draw"). */
  label: string;
  /** One-line summary shown under the section header. */
  description: string;
}

export interface PermissionMeta {
  /** Label for the toggle row (e.g. "View", "Cancel subscription"). */
  label: string;
  /** Short Discord-style explanation of what this grant allows. */
  description: string;
  /**
   * Treat this action as dangerous in the UI — destructive, irreversible,
   * or money-moving. Renders the toggle and label red when on.
   */
  danger?: boolean;
}

export const AREA_META: Record<Area, AreaMeta> = {
  overview: {
    label: "Overview",
    description: "Admin dashboard, recent activity, and revenue-at-a-glance widgets.",
  },
  users: {
    label: "Users",
    description: "Customer accounts — profile, billing actions, and lifecycle controls.",
  },
  promos: {
    label: "Promos",
    description: "Promotions, links, banner text, scheduled campaigns, and bonus-entry rules.",
  },
  facebookAds: {
    label: "Facebook Ads",
    description: "Ad insights, hourly metrics, purchase audit, and spend-by-URL sync.",
  },
  pageAnalytics: {
    label: "Page Analytics",
    description: "Page-level analytics dashboard.",
  },
  promoAnalytics: {
    label: "Promo Analytics",
    description: "Promo-specific performance, channel mix, and page detail.",
  },
  submissions: {
    label: "Submissions",
    description: "Contact form submissions and inbox counts.",
  },
  miniDraws: {
    label: "Mini Draws",
    description: "Mini-draw read access. Mini-draw writes live under Major Draw.",
  },
  majorDraw: {
    label: "Major Draw",
    description: "Major + mini draws: schedule, edit, declare winners.",
  },
  drawResults: {
    label: "Draw Results",
    description: "Past draw results admin view.",
  },
  upcomingDraws: {
    label: "Upcoming Draws",
    description: "Upcoming draws calendar.",
  },
  affiliates: {
    label: "Affiliates",
    description: "Affiliate program: accounts, commissions, and payouts.",
  },
  errorReports: {
    label: "Error Reports",
    description: "Production error reports captured from runtime.",
  },
  abTesting: {
    label: "A/B Testing",
    description: "Experiments, variants, analytics, and winner declaration.",
  },
  settings: {
    label: "Settings",
    description: "The Settings tab itself — Roles + Staff sub-screens.",
  },
};

export const PERMISSION_META: Record<Permission, PermissionMeta> = {
  // Overview
  "overview.view": {
    label: "View",
    description: "Open the admin dashboard and see recent activity, revenue widgets, and KPI snapshots.",
  },
  "overview.edit": {
    label: "Edit",
    description: "Adjust upsell multipliers and run Klaviyo draw-reset operations from the dashboard.",
  },

  // Users
  "users.view": {
    label: "View",
    description: "Browse the customer list, search, open user detail, see payment history and deletion summary.",
  },
  "users.edit": {
    label: "Edit",
    description: "Edit names, mobile, address, notes, and status flags. Send verification / password-reset emails. Clear saved payment methods.",
  },
  "users.charge": {
    label: "Charge",
    description: "Manually charge past-due invoices, force-charge a customer's saved card, or recover a missed invoice. Moves money from the customer.",
    danger: true,
  },
  "users.cancelSubscription": {
    label: "Cancel subscription",
    description: "End a customer's active subscription. The billing relationship stops (at period end by default).",
    danger: true,
  },
  "users.refund": {
    label: "Refund / reverse",
    description: "Re-run refund-reversal processing for a payment event when webhooks were missed. Adjusts entry ledgers and benefits.",
    danger: true,
  },
  "users.delete": {
    label: "Delete",
    description: "Permanently delete a user and cascade-clean their data across collections. Cannot be undone.",
    danger: true,
  },

  // Promos
  "promos.view": {
    label: "View",
    description: "See the promo list, history, analytics, and bonus-entry / banner configurations.",
  },
  "promos.edit": {
    label: "Edit",
    description: "Create promos, toggle them on/off, schedule them, manage links, banner text, alternating multipliers, and bonus-entry rules.",
  },
  "promos.end": {
    label: "End promo",
    description: "Permanently end a live promo. Once ended it cannot be re-opened.",
    danger: true,
  },

  // Facebook Ads
  "facebookAds.view": {
    label: "View",
    description: "Open Facebook ad insights, hourly metrics, purchase audit, and spend-by-URL reports.",
  },
  "facebookAds.edit": {
    label: "Edit",
    description: "Trigger spend-by-URL syncs and refresh ad metrics from the dashboard.",
  },

  // Page Analytics
  "pageAnalytics.view": {
    label: "View",
    description: "Open the page-level analytics dashboard.",
  },

  // Promo Analytics
  "promoAnalytics.view": {
    label: "View",
    description: "Open promo-specific analytics including channel detail and page-level breakdown.",
  },

  // Submissions
  "submissions.view": {
    label: "View",
    description: "See the contact-form submission badge and unread count in the admin layout.",
  },

  // Mini Draws
  "miniDraws.view": {
    label: "View",
    description: "Read-only access to mini-draw data. Mini-draw write actions are gated under Major Draw.",
  },

  // Major Draw
  "majorDraw.view": {
    label: "View",
    description: "See major-draw history, participants, scheduled months, current state, and mini-draw lists / exports.",
  },
  "majorDraw.edit": {
    label: "Edit",
    description: "Create / update major draws. Create, update, reorder, and delete mini-draws.",
  },
  "majorDraw.selectWinner": {
    label: "Select winner",
    description: "Pick a winner for a major or mini draw. The selection is recorded as a Winner document and cannot be undone.",
    danger: true,
  },

  // Draw Results
  "drawResults.view": {
    label: "View",
    description: "Open the past draw results admin view.",
  },

  // Upcoming Draws
  "upcomingDraws.view": {
    label: "View",
    description: "Open the upcoming draws calendar.",
  },

  // Affiliates
  "affiliates.view": {
    label: "View",
    description: "See the affiliate list, individual affiliate detail, and referred-users data.",
  },
  "affiliates.edit": {
    label: "Edit",
    description: "Create affiliates, update their details (name, email, password, status), link or unlink referred users.",
  },
  "affiliates.processPayout": {
    label: "Process payout",
    description: "Mark all pending commissions for an affiliate as paid. This is the audit trail for money going out.",
    danger: true,
  },
  "affiliates.delete": {
    label: "Delete affiliate",
    description: "Delete an affiliate account entirely. Cannot be undone.",
    danger: true,
  },

  // Error Reports
  "errorReports.view": {
    label: "View",
    description: "Read error reports captured from production runtime.",
  },
  "errorReports.edit": {
    label: "Edit",
    description: "Update an individual report's status (acknowledge, resolve) and bulk-update statuses.",
  },
  "errorReports.delete": {
    label: "Bulk archive",
    description: "Bulk soft-delete (archive) error reports. The underlying documents are kept but hidden from default queries.",
    danger: true,
  },

  // A/B Testing
  "abTesting.view": {
    label: "View",
    description: "Open the experiment list, variants, per-experiment analytics, and history.",
  },
  "abTesting.edit": {
    label: "Edit",
    description: "Create and edit experiments, manage variants, preview them, and pause / resume runs.",
  },
  "abTesting.selectWinner": {
    label: "Declare winner",
    description: "Declare an experiment's winning variant. Locks the variant choice for downstream traffic.",
    danger: true,
  },
  "abTesting.delete": {
    label: "Archive experiment",
    description: "Soft-delete (archive) an experiment in draft or paused state.",
    danger: true,
  },

  // Settings
  "settings.view": {
    label: "View",
    description: "Open the Settings tab. Required to see Roles + Staff sub-screens.",
  },
  "settings.edit": {
    label: "Edit",
    description: "Create and edit roles, invite staff, change a staff member's role, and deactivate staff.",
  },
};
