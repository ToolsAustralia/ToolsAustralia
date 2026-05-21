// src/lib/internal-norm/classification.ts
import type { z } from "zod";
import { ALL_PERMISSIONS, type Permission } from "@/lib/permissions";
import { NormRoasSummarySchema, NormRoasBreakdownSchema } from "./schemas/roas";
import { NormDashboardStatsSchema, NormRevenueBreakdownSchema } from "./schemas/dashboard";
import { NormSubmissionsUnviewedCountSchema } from "./schemas/submissions";
import { NormCancellationFlowAnalyticsSchema } from "./schemas/cancellation-flow";
import { NormUpsellMultipliersSchema } from "./schemas/upsell";
import {
  NormKlaviyoDrawResetPreviewSchema,
  NormKlaviyoDrawResetProgressSchema,
} from "./schemas/klaviyo";
import {
  NormChargePastDueDeclineSummarySchema,
  NormChargePastDueManualRetriesListSchema,
  NormChargePastDueRunDetailSchema,
  NormChargePastDueRunsListSchema,
} from "./schemas/charge-past-due";
import {
  NormPromoAnalyticsChannelDetailSchema,
  NormPromoAnalyticsPageDetailSchema,
  NormPromoAnalyticsSummarySchema,
} from "./schemas/promo-analytics";
import {
  NormMetricsDebugSchema,
  NormUserMajorDrawComparisonSchema,
  NormUserMetricsSchema,
} from "./schemas/metrics";
import {
  NormAllowlistActionsListSchema,
  NormAllowlistBlockedCardsListSchema,
  NormAllowlistStatsSchema,
} from "./schemas/allowlist";
import {
  NormErrorReportDetailSchema,
  NormErrorReportsListSchema,
} from "./schemas/error-reports";
import {
  NormDashboardStatsSnapshotHealthSchema,
  NormMembershipSnapshotHealthSchema,
} from "./schemas/health";
import { NormStripeWebhookQueueListSchema } from "./schemas/stripe-webhook-queue";
import { NormChargePastDuePreviewSchema } from "./schemas/invoices";
import { NormAffiliateListSchema, NormAffiliateDetailSchema } from "./schemas/affiliate";
import {
  NormExperimentsListSchema,
  NormExperimentDetailSchema,
  NormExperimentAnalyticsSchema,
  NormExperimentHistorySchema,
  NormExperimentWinnerSchema,
} from "./schemas/ab-testing";
import {
  NormFacebookAdsInsightsSchema,
  NormFacebookAdsHourlyInsightsSchema,
  NormFacebookAdsPurchaseAuditSchema,
} from "./schemas/facebook-ads";
import {
  NormMajorDrawCurrentAndLastSchema,
  NormMajorDrawExportAggregateSchema,
  NormMajorDrawHistorySchema,
  NormMajorDrawParticipantsSchema,
  NormMajorDrawScheduledMonthsSchema,
  NormMajorDrawSelectWinnerPreviewSchema,
  NormMajorDrawUpdateGetSchema,
} from "./schemas/major-draw";
import {
  NormMiniDrawExportAggregateSchema,
  NormMiniDrawFullCapacityCountSchema,
  NormMiniDrawGetSchema,
  NormMiniDrawListSchema,
} from "./schemas/mini-draw";
import { NormWinnerDetailSchema } from "./schemas/winners";
import {
  NormAnalyticsSpendByUrlDetailSchema,
  NormAnalyticsSpendByUrlListSchema,
} from "./schemas/analytics-spend";

// "forbidden" is NOT a tier — endpoints not in the registry are simply unreachable.
// Tier and Permission are orthogonal axes: tier = orchestration shape; permission = "is Norm allowed?".
export const NORM_TIERS = [
  "read",
  "write_safe",
  "trigger_norm_confirm",
  "trigger_human_approve",
] as const;
export type NormTier = (typeof NORM_TIERS)[number];

export interface NormEndpointSpec {
  tier: NormTier;
  /** Permission from @/lib/permissions that Norm's Role must hold to call this endpoint. */
  requiredPermission: Permission;
  path: string;          // "/v1/roas/summary"
  method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  summary: string;
  rateLimit?: { perMinute?: number; perDay?: number };
  responseSchema?: z.ZodTypeAny;
  requestSchema?: z.ZodTypeAny;
  /** True if the underlying admin route still uses requireAdminUser (not requirePermission). Follow-up to migrate. */
  legacyAdminCheck?: boolean;
}

// Wired endpoints (have responseSchema) appear in the published manifest.
// Roadmap-only entries (no responseSchema) appear in the admin Endpoints UI but
// are NOT exposed via the manifest — Norm cannot discover or call them yet.
//
// Endpoints intentionally OMITTED from this registry (so Norm can never reach them):
//   - /api/admin/roles/*        (role catalog management — admin's own job)
//   - /api/admin/staff/*        (staff/user provisioning — admin's own job)
//   - /api/admin/sync-klaviyo-profiles (unsecured mass-sync; dev/migration only)
// Omission = unreachable; no entry, no key.
export const NORM_ENDPOINTS = {
  // ─── Framework infra ──────────────────────────────────────────────────
  health: {
    tier: "read",
    requiredPermission: "overview.view",
    path: "/v1/health",
    method: "GET",
    summary: "Liveness + signing-secret validation",
  },
  manifest: {
    tier: "read",
    requiredPermission: "overview.view",
    path: "/v1/manifest",
    method: "GET",
    summary: "Full tools manifest for Norm capability discovery",
  },
  "pending-actions.status": {
    tier: "read",
    requiredPermission: "overview.view",
    path: "/v1/pending-actions/:id/status",
    method: "GET",
    summary: "Norm polls a pending action's resolution status",
  },

  // ─── ROAS (wired) ─────────────────────────────────────────────────────
  "roas.summary": {
    tier: "read",
    requiredPermission: "facebookAds.view",
    path: "/v1/roas/summary",
    method: "GET",
    summary: "Headline ad spend, revenue, ROAS, profit for a date range",
    rateLimit: { perMinute: 10 },
    responseSchema: NormRoasSummarySchema,
  },
  "roas.breakdown": {
    tier: "read",
    requiredPermission: "facebookAds.view",
    path: "/v1/roas/breakdown",
    method: "GET",
    summary: "Per-campaign/adset/ad ROAS breakdown for a date range",
    rateLimit: { perMinute: 10 },
    responseSchema: NormRoasBreakdownSchema,
  },

  // ─── Dashboard (wired + roadmap) ──────────────────────────────────────
  "dashboard.stats": {
    tier: "read",
    requiredPermission: "overview.view",
    path: "/v1/dashboard/stats",
    method: "GET",
    summary: "Headline business stats: revenue, users, members, draws, conversion, ROAS",
    responseSchema: NormDashboardStatsSchema,
  },
  "dashboard.revenue-breakdown": {
    tier: "read",
    requiredPermission: "overview.view",
    path: "/v1/dashboard/revenue-breakdown",
    method: "GET",
    summary: "Revenue total + per-category breakdown for a date range",
    responseSchema: NormRevenueBreakdownSchema,
  },
  "dashboard.membership-by-package": {
    tier: "read",
    requiredPermission: "overview.view",
    path: "/v1/dashboard/membership-by-package",
    method: "GET",
    summary: "Active membership counts grouped by package",
  },
  "dashboard.projected-income": {
    tier: "read",
    requiredPermission: "overview.view",
    path: "/v1/dashboard/projected-income",
    method: "GET",
    summary: "Projected income for the upcoming billing window",
  },
  "dashboard.recent-activities": {
    tier: "read",
    requiredPermission: "overview.view",
    path: "/v1/dashboard/recent-activities",
    method: "GET",
    summary: "Recent admin/site activity feed for dashboard",
  },
  "dashboard.revenue-details": {
    tier: "read",
    requiredPermission: "overview.view",
    path: "/v1/dashboard/revenue-details",
    method: "GET",
    summary: "Per-source revenue detail for a date range",
  },
  "dashboard.upcoming-renewals": {
    tier: "read",
    requiredPermission: "overview.view",
    path: "/v1/dashboard/upcoming-renewals",
    method: "GET",
    summary: "Subscriptions due to renew soon",
  },

  // ─── Activity log (roadmap) ───────────────────────────────────────────
  "activity-log.list": {
    tier: "read",
    requiredPermission: "overview.view",
    path: "/v1/activity-log",
    method: "GET",
    summary: "Recent admin activity feed",
  },

  // ─── A/B testing (roadmap) ────────────────────────────────────────────
  "ab-testing.experiments.list": {
    tier: "read",
    requiredPermission: "abTesting.view",
    path: "/v1/ab-testing/experiments",
    method: "GET",
    summary: "List A/B experiments (paged, filterable by status / search)",
    responseSchema: NormExperimentsListSchema,
  },
  "ab-testing.experiments.create": {
    tier: "write_safe",
    requiredPermission: "abTesting.edit",
    path: "/v1/ab-testing/experiments",
    method: "POST",
    summary: "Create a new A/B experiment",
  },
  "ab-testing.experiment.get": {
    tier: "read",
    requiredPermission: "abTesting.view",
    path: "/v1/ab-testing/experiments/:id",
    method: "GET",
    summary: "Get a single A/B experiment with its variant summaries",
    responseSchema: NormExperimentDetailSchema,
  },
  "ab-testing.experiment.update": {
    tier: "write_safe",
    requiredPermission: "abTesting.edit",
    path: "/v1/ab-testing/experiments/:id",
    method: "PATCH",
    summary: "Update an A/B experiment",
  },
  "ab-testing.experiment.delete": {
    tier: "trigger_human_approve",
    requiredPermission: "abTesting.delete",
    path: "/v1/ab-testing/experiments/:id",
    method: "DELETE",
    summary: "Delete an A/B experiment",
  },
  "ab-testing.experiment-analytics": {
    tier: "read",
    requiredPermission: "abTesting.view",
    path: "/v1/ab-testing/experiments/:id/analytics",
    method: "GET",
    summary: "Aggregate analytics for an A/B experiment: per-variant metrics, significance, stopping rules, winner",
    responseSchema: NormExperimentAnalyticsSchema,
  },
  "ab-testing.experiment-history": {
    tier: "read",
    requiredPermission: "abTesting.view",
    path: "/v1/ab-testing/experiments/:id/history",
    method: "GET",
    summary: "Mutation history (audit log) for an A/B experiment",
    responseSchema: NormExperimentHistorySchema,
  },
  "ab-testing.variants.create": {
    tier: "write_safe",
    requiredPermission: "abTesting.edit",
    path: "/v1/ab-testing/experiments/:id/variants",
    method: "POST",
    summary: "Add a variant to an A/B experiment",
  },
  "ab-testing.variants.update": {
    tier: "write_safe",
    requiredPermission: "abTesting.edit",
    path: "/v1/ab-testing/experiments/:id/variants",
    method: "PATCH",
    summary: "Update a variant on an A/B experiment",
  },
  "ab-testing.variants.delete": {
    tier: "trigger_norm_confirm",
    requiredPermission: "abTesting.edit",
    path: "/v1/ab-testing/experiments/:id/variants",
    method: "DELETE",
    summary: "Remove a variant from an A/B experiment",
  },
  "ab-testing.experiment.select-winner": {
    tier: "trigger_human_approve",
    requiredPermission: "abTesting.selectWinner",
    path: "/v1/ab-testing/experiments/:id/winner",
    method: "POST",
    summary: "Lock in a winning variant for an A/B experiment",
  },
  "ab-testing.experiment.winner.get": {
    tier: "read",
    requiredPermission: "abTesting.view",
    path: "/v1/ab-testing/experiments/:id/winner",
    method: "GET",
    summary: "Read the auto-determined winner + currently-declared winner for an A/B experiment",
    responseSchema: NormExperimentWinnerSchema,
  },
  "ab-testing.preview.create": {
    tier: "write_safe",
    requiredPermission: "abTesting.edit",
    path: "/v1/ab-testing/preview",
    method: "POST",
    summary: "Create a preview cookie pinning A/B variant choices",
  },
  "ab-testing.preview.clear": {
    tier: "write_safe",
    requiredPermission: "abTesting.edit",
    path: "/v1/ab-testing/preview",
    method: "DELETE",
    summary: "Clear an A/B preview cookie",
  },

  // ─── Affiliate (roadmap) ──────────────────────────────────────────────
  "affiliate.list": {
    tier: "read",
    requiredPermission: "affiliates.view",
    path: "/v1/affiliate",
    method: "GET",
    summary: "List affiliates (PII-safe projection: omits email/phone/bank details)",
    responseSchema: NormAffiliateListSchema,
  },
  "affiliate.create": {
    tier: "write_safe",
    requiredPermission: "affiliates.edit",
    path: "/v1/affiliate",
    method: "POST",
    summary: "Create a new affiliate",
  },
  "affiliate.get": {
    tier: "read",
    requiredPermission: "affiliates.view",
    path: "/v1/affiliate/:id",
    method: "GET",
    summary: "Get a single affiliate with commissions, payouts, and referred users (PII-safe projection)",
    responseSchema: NormAffiliateDetailSchema,
  },
  "affiliate.update": {
    tier: "write_safe",
    requiredPermission: "affiliates.edit",
    path: "/v1/affiliate/:id",
    method: "PUT",
    summary: "Update an affiliate",
  },
  "affiliate.delete": {
    tier: "trigger_human_approve",
    requiredPermission: "affiliates.delete",
    path: "/v1/affiliate/:id",
    method: "DELETE",
    summary: "Delete an affiliate (irreversible)",
  },
  "affiliate.process-payout": {
    tier: "trigger_human_approve",
    requiredPermission: "affiliates.processPayout",
    path: "/v1/affiliate/:id/process-payout",
    method: "POST",
    summary: "Process pending affiliate payout — money movement, requires human approve",
  },
  "affiliate.referred-users.attach": {
    tier: "trigger_norm_confirm",
    requiredPermission: "affiliates.edit",
    path: "/v1/affiliate/:id/referred-users",
    method: "POST",
    summary: "Attach a user to an affiliate (may backfill commissions)",
  },
  "affiliate.referred-users.detach": {
    tier: "trigger_norm_confirm",
    requiredPermission: "affiliates.edit",
    path: "/v1/affiliate/:id/referred-users",
    method: "DELETE",
    summary: "Detach a user from an affiliate",
  },

  // ─── Allowlist (roadmap; legacy admin checks) ─────────────────────────
  "allowlist.actions.list": {
    tier: "read",
    requiredPermission: "users.view",
    legacyAdminCheck: true,
    path: "/v1/allowlist/actions",
    method: "GET",
    summary: "List allowlist actions (audit feed)",
    responseSchema: NormAllowlistActionsListSchema,
  },
  "allowlist.apply": {
    tier: "trigger_human_approve",
    requiredPermission: "users.charge",
    legacyAdminCheck: true,
    path: "/v1/allowlist/apply",
    method: "POST",
    summary: "Apply allowlist entry to unblock a card — may trigger charges",
  },
  "allowlist.reverse": {
    tier: "trigger_human_approve",
    requiredPermission: "users.charge",
    legacyAdminCheck: true,
    path: "/v1/allowlist/reverse",
    method: "POST",
    summary: "Reverse an allowlist entry; re-block a previously allowed card",
  },
  "allowlist.blocked-cards.list": {
    tier: "read",
    requiredPermission: "users.view",
    legacyAdminCheck: true,
    path: "/v1/allowlist/blocked-cards",
    method: "GET",
    summary: "List currently blocked cards",
    responseSchema: NormAllowlistBlockedCardsListSchema,
  },
  "allowlist.stats": {
    tier: "read",
    requiredPermission: "users.view",
    legacyAdminCheck: true,
    path: "/v1/allowlist/stats",
    method: "GET",
    summary: "Allowlist summary stats",
    responseSchema: NormAllowlistStatsSchema,
  },

  // ─── Analytics — spend-by-url (wired list/detail; sync roadmap) ───────
  "analytics.spend-by-url.list": {
    tier: "read",
    requiredPermission: "facebookAds.view",
    path: "/v1/analytics/spend-by-url",
    method: "GET",
    summary: "Ad spend grouped by destination URL for a date range (materialized daily rows summed per canonical URL)",
    responseSchema: NormAnalyticsSpendByUrlListSchema,
  },
  "analytics.spend-by-url.detail": {
    tier: "read",
    requiredPermission: "facebookAds.view",
    path: "/v1/analytics/spend-by-url/detail",
    method: "GET",
    summary: "Per-ad spend / delivery / conversion breakdown for one or more canonical destination URLs",
    responseSchema: NormAnalyticsSpendByUrlDetailSchema,
  },
  "analytics.spend-by-url.sync": {
    tier: "trigger_human_approve",
    requiredPermission: "facebookAds.edit",
    path: "/v1/analytics/spend-by-url/sync",
    method: "POST",
    summary: "Trigger ad-destination URL sync from Meta",
  },

  // ─── Cancellation-flow analytics (roadmap) ───────────────────────────
  "cancellation-flow-analytics.list": {
    tier: "read",
    requiredPermission: "overview.view",
    path: "/v1/cancellation-flow-analytics",
    method: "GET",
    summary: "Cancellation funnel analytics",
    responseSchema: NormCancellationFlowAnalyticsSchema,
  },

  // ─── Charge past-due (wired) ──────────────────────────────────────────
  "charge-past-due.decline-summary": {
    tier: "read",
    requiredPermission: "users.view",
    path: "/v1/charge-past-due/decline-summary",
    method: "GET",
    summary: "Summary of recent past-due decline reasons",
    responseSchema: NormChargePastDueDeclineSummarySchema,
  },
  "charge-past-due.manual-retries.list": {
    tier: "read",
    requiredPermission: "users.view",
    path: "/v1/charge-past-due/manual-retries",
    method: "GET",
    summary: "List manual past-due retry attempts",
    responseSchema: NormChargePastDueManualRetriesListSchema,
  },
  "charge-past-due.runs.list": {
    tier: "read",
    requiredPermission: "users.view",
    path: "/v1/charge-past-due/runs",
    method: "GET",
    summary: "List past-due charge job runs",
    responseSchema: NormChargePastDueRunsListSchema,
  },
  "charge-past-due.run.get": {
    tier: "read",
    requiredPermission: "users.view",
    path: "/v1/charge-past-due/runs/:runId",
    method: "GET",
    summary: "Get details for a single past-due charge run",
    responseSchema: NormChargePastDueRunDetailSchema,
  },

  // ─── Error reports (wired list/get; rest roadmap) ─────────────────────
  "error-reports.list": {
    tier: "read",
    requiredPermission: "errorReports.view",
    path: "/v1/error-reports",
    method: "GET",
    summary: "List error reports (paged, filterable) with status/severity rollup counts",
    responseSchema: NormErrorReportsListSchema,
  },
  "error-reports.get": {
    tier: "read",
    requiredPermission: "errorReports.view",
    path: "/v1/error-reports/:id",
    method: "GET",
    summary: "Get a single error report by id (PII-redacted projection)",
    responseSchema: NormErrorReportDetailSchema,
  },
  "error-reports.update": {
    tier: "write_safe",
    requiredPermission: "errorReports.edit",
    path: "/v1/error-reports/:id",
    method: "PATCH",
    summary: "Update an error report (status, notes)",
  },
  "error-reports.bulk-delete": {
    tier: "trigger_human_approve",
    requiredPermission: "errorReports.delete",
    path: "/v1/error-reports/bulk-delete",
    method: "DELETE",
    summary: "Bulk-delete error reports (irreversible, many rows)",
  },
  "error-reports.bulk-update": {
    tier: "trigger_human_approve",
    requiredPermission: "errorReports.edit",
    path: "/v1/error-reports/bulk-delete",
    method: "PATCH",
    summary: "Bulk-update error report statuses",
  },

  // ─── Facebook ads (wired list/hourly/audit; sync roadmap) ─────────────
  "facebook-ads.insights": {
    tier: "read",
    requiredPermission: "facebookAds.view",
    path: "/v1/facebook-ads/insights",
    method: "GET",
    summary: "Facebook ad insights for a date range: summary + per-item breakdown at the requested level",
    rateLimit: { perMinute: 10 },
    responseSchema: NormFacebookAdsInsightsSchema,
  },
  "facebook-ads.hourly-insights.list": {
    tier: "read",
    requiredPermission: "facebookAds.view",
    path: "/v1/facebook-ads/hourly-insights",
    method: "GET",
    summary: "Hourly Facebook ad insights for an AEST date range, merged with local PaymentEvent revenue",
    rateLimit: { perMinute: 10 },
    responseSchema: NormFacebookAdsHourlyInsightsSchema,
  },
  "facebook-ads.hourly-insights.sync": {
    tier: "trigger_human_approve",
    requiredPermission: "facebookAds.view",
    path: "/v1/facebook-ads/hourly-insights",
    method: "POST",
    summary: "Trigger hourly Facebook insights sync",
  },
  "facebook-ads.purchase-audit": {
    tier: "read",
    requiredPermission: "facebookAds.view",
    path: "/v1/facebook-ads/purchase-audit",
    method: "GET",
    summary: "Reconcile local PaymentEvent (non-renewal) revenue vs Meta Insights purchase revenue",
    responseSchema: NormFacebookAdsPurchaseAuditSchema,
  },

  // ─── Health snapshots (roadmap) ───────────────────────────────────────
  "health.dashboard-stats-snapshot": {
    tier: "read",
    requiredPermission: "overview.view",
    path: "/v1/health/dashboard-stats-snapshot",
    method: "GET",
    summary: "Dashboard stats daily snapshot health",
    responseSchema: NormDashboardStatsSnapshotHealthSchema,
  },
  "health.membership-snapshot": {
    tier: "read",
    requiredPermission: "overview.view",
    path: "/v1/health/membership-snapshot",
    method: "GET",
    summary: "Membership daily snapshot health",
    responseSchema: NormMembershipSnapshotHealthSchema,
  },

  // ─── Invoices (roadmap) ───────────────────────────────────────────────
  "invoices.charge-past-due.preview": {
    tier: "read",
    requiredPermission: "users.view",
    path: "/v1/invoices/charge-past-due",
    method: "GET",
    summary: "Preview the upcoming past-due charge run",
    responseSchema: NormChargePastDuePreviewSchema,
  },
  "invoices.charge-past-due.run": {
    tier: "trigger_human_approve",
    requiredPermission: "users.charge",
    path: "/v1/invoices/charge-past-due",
    method: "POST",
    summary: "Trigger a past-due charge run — moves money across many users",
  },
  "invoices.recover-past-due": {
    tier: "trigger_human_approve",
    requiredPermission: "users.charge",
    path: "/v1/invoices/recover-past-due",
    method: "POST",
    summary: "Recover a past-due invoice via Stripe collection-pause flow",
  },

  // ─── Klaviyo draw reset (roadmap) ────────────────────────────────────
  "klaviyo.draw-reset.preview": {
    tier: "read",
    requiredPermission: "overview.view",
    path: "/v1/klaviyo/draw-reset-preview",
    method: "GET",
    summary: "Preview the post-draw Klaviyo profile reset",
    responseSchema: NormKlaviyoDrawResetPreviewSchema,
  },
  "klaviyo.draw-reset.execute": {
    tier: "trigger_human_approve",
    requiredPermission: "overview.edit",
    path: "/v1/klaviyo/draw-reset-execute",
    method: "POST",
    summary: "Execute the post-draw Klaviyo profile reset (mass external sync)",
  },
  "klaviyo.draw-reset.progress": {
    tier: "read",
    requiredPermission: "overview.view",
    path: "/v1/klaviyo/draw-reset-progress",
    method: "GET",
    summary: "Progress of an in-flight Klaviyo draw reset",
    responseSchema: NormKlaviyoDrawResetProgressSchema,
  },

  // ─── Major draw (roadmap) ─────────────────────────────────────────────
  "major-draw.create": {
    tier: "trigger_human_approve",
    requiredPermission: "majorDraw.edit",
    path: "/v1/major-draw/create",
    method: "POST",
    summary: "Create a new major draw",
  },
  "major-draw.current-and-last": {
    tier: "read",
    requiredPermission: "majorDraw.view",
    path: "/v1/major-draw/current-and-last",
    method: "GET",
    summary: "Current + most recent major draw with AEST date ranges",
    responseSchema: NormMajorDrawCurrentAndLastSchema,
  },
  "major-draw.export": {
    tier: "read",
    requiredPermission: "majorDraw.view",
    path: "/v1/major-draw/export",
    method: "GET",
    summary: "Aggregate-only major-draw export: eligibility counts + per-state breakdown (no per-user PII)",
    responseSchema: NormMajorDrawExportAggregateSchema,
  },
  "major-draw.history": {
    tier: "read",
    requiredPermission: "majorDraw.view",
    path: "/v1/major-draw/history",
    method: "GET",
    summary: "Paged major-draw history with per-draw winner summary and rollup stats",
    responseSchema: NormMajorDrawHistorySchema,
  },
  "major-draw.participants": {
    tier: "read",
    requiredPermission: "majorDraw.view",
    path: "/v1/major-draw/participants",
    method: "GET",
    summary: "Paged participants for a major draw (PII-safe projection: omits lastName/email/mobile)",
    responseSchema: NormMajorDrawParticipantsSchema,
  },
  "major-draw.scheduled-months": {
    tier: "read",
    requiredPermission: "majorDraw.view",
    path: "/v1/major-draw/scheduled-months",
    method: "GET",
    summary: "Months with scheduled major draws (for calendar restriction UI)",
    responseSchema: NormMajorDrawScheduledMonthsSchema,
  },
  "major-draw.select-winner": {
    tier: "trigger_human_approve",
    requiredPermission: "majorDraw.selectWinner",
    path: "/v1/major-draw/select-winner",
    method: "POST",
    summary: "Select winner for a major draw — irreversible, public-facing",
  },
  "major-draw.select-winner.preview": {
    tier: "read",
    requiredPermission: "majorDraw.view",
    path: "/v1/major-draw/select-winner",
    method: "GET",
    summary: "Read the recorded winner for a major draw (if any) — PII-safe projection",
    responseSchema: NormMajorDrawSelectWinnerPreviewSchema,
  },
  "major-draw.update": {
    tier: "write_safe",
    requiredPermission: "majorDraw.edit",
    path: "/v1/major-draw/update",
    method: "PUT",
    summary: "Update an existing major draw",
  },
  "major-draw.update.get": {
    tier: "read",
    requiredPermission: "majorDraw.view",
    path: "/v1/major-draw/update",
    method: "GET",
    summary: "Read editable major-draw fields (name, description, status, dates, prize meta) for the update form",
    responseSchema: NormMajorDrawUpdateGetSchema,
  },

  // ─── Metrics (wired) ──────────────────────────────────────────────────
  "metrics.debug": {
    tier: "read",
    requiredPermission: "overview.view",
    path: "/v1/metrics/debug",
    method: "GET",
    summary: "Engineer-facing debug snapshot of recent BenefitsGranted PaymentEvents (sample + total count)",
    responseSchema: NormMetricsDebugSchema,
  },
  "metrics.users": {
    tier: "read",
    requiredPermission: "overview.view",
    path: "/v1/metrics/users",
    method: "GET",
    summary: "Aggregate user metrics for a date range: signup source, profession, state, age, membership, purchase history",
    responseSchema: NormUserMetricsSchema,
  },
  "metrics.users.major-draw-comparison": {
    tier: "read",
    requiredPermission: "overview.view",
    path: "/v1/metrics/users/major-draw-comparison",
    method: "GET",
    summary: "Per-draw user/revenue totals + percent comparison between two major draws",
    responseSchema: NormUserMajorDrawComparisonSchema,
  },

  // ─── Milestone rewards (roadmap; legacy admin) ────────────────────────
  "milestone-rewards.list": {
    tier: "read",
    requiredPermission: "promos.view",
    legacyAdminCheck: true,
    path: "/v1/milestone-rewards",
    method: "GET",
    summary: "List milestone rewards",
  },
  "milestone-rewards.create": {
    tier: "write_safe",
    requiredPermission: "promos.edit",
    legacyAdminCheck: true,
    path: "/v1/milestone-rewards",
    method: "POST",
    summary: "Create a milestone reward",
  },
  "milestone-rewards.update": {
    tier: "write_safe",
    requiredPermission: "promos.edit",
    legacyAdminCheck: true,
    path: "/v1/milestone-rewards/:id",
    method: "PUT",
    summary: "Full-update a milestone reward",
  },
  "milestone-rewards.patch": {
    tier: "write_safe",
    requiredPermission: "promos.edit",
    legacyAdminCheck: true,
    path: "/v1/milestone-rewards/:id",
    method: "PATCH",
    summary: "Partial-update a milestone reward",
  },
  "milestone-rewards.delete": {
    tier: "trigger_human_approve",
    requiredPermission: "promos.delete",
    legacyAdminCheck: true,
    path: "/v1/milestone-rewards/:id",
    method: "DELETE",
    summary: "Delete a milestone reward",
  },

  // ─── Mini draws (roadmap) ─────────────────────────────────────────────
  "mini-draw.create": {
    tier: "write_safe",
    requiredPermission: "miniDraws.edit",
    path: "/v1/mini-draw/create",
    method: "POST",
    summary: "Create a mini draw",
  },
  "mini-draw.full-capacity-count": {
    tier: "read",
    requiredPermission: "miniDraws.view",
    path: "/v1/mini-draw/full-capacity-count",
    method: "GET",
    summary: "Count of mini draws at full capacity (status=completed) awaiting winner selection",
    responseSchema: NormMiniDrawFullCapacityCountSchema,
  },
  "mini-draw.list": {
    tier: "read",
    requiredPermission: "miniDraws.view",
    path: "/v1/mini-draw/list",
    method: "GET",
    summary: "Paged list of mini draws with per-row latest-winner join",
    responseSchema: NormMiniDrawListSchema,
  },
  "mini-draw.order": {
    tier: "write_safe",
    requiredPermission: "miniDraws.edit",
    path: "/v1/mini-draw/order",
    method: "POST",
    summary: "Reorder mini draws",
  },
  "mini-draw.update": {
    tier: "write_safe",
    requiredPermission: "miniDraws.edit",
    path: "/v1/mini-draw/update",
    method: "PUT",
    summary: "Update a mini draw",
  },
  "mini-draw.get": {
    tier: "read",
    requiredPermission: "miniDraws.view",
    path: "/v1/mini-draw/:id",
    method: "GET",
    summary: "Get a single mini draw detail (no per-participant rows; counts only)",
    responseSchema: NormMiniDrawGetSchema,
  },
  "mini-draw.delete": {
    tier: "trigger_human_approve",
    requiredPermission: "miniDraws.delete",
    path: "/v1/mini-draw/:id",
    method: "DELETE",
    summary: "Delete a mini draw",
  },
  "mini-draw.export": {
    tier: "read",
    requiredPermission: "miniDraws.view",
    path: "/v1/mini-draw/:id/export",
    method: "GET",
    summary: "Aggregate-only mini-draw export: participant counts + per-state breakdown (no per-user PII)",
    responseSchema: NormMiniDrawExportAggregateSchema,
  },
  "mini-draw.select-winner": {
    tier: "trigger_human_approve",
    requiredPermission: "miniDraws.selectWinner",
    path: "/v1/mini-draw/:id/select-winner",
    method: "POST",
    summary: "Select winner for a mini draw — irreversible",
  },

  // ─── Monthly coupon (roadmap; legacy admin) ───────────────────────────
  "monthly-coupon.campaigns.list": {
    tier: "read",
    requiredPermission: "promos.view",
    legacyAdminCheck: true,
    path: "/v1/monthly-coupon/campaign",
    method: "GET",
    summary: "List monthly-coupon campaigns",
  },
  "monthly-coupon.campaigns.create": {
    tier: "trigger_human_approve",
    requiredPermission: "promos.edit",
    legacyAdminCheck: true,
    path: "/v1/monthly-coupon/campaign",
    method: "POST",
    summary: "Create a monthly-coupon campaign (issues to many users)",
  },
  "monthly-coupon.campaign.update": {
    tier: "trigger_human_approve",
    requiredPermission: "promos.edit",
    legacyAdminCheck: true,
    path: "/v1/monthly-coupon/campaign/:id",
    method: "PUT",
    summary: "Update a monthly-coupon campaign (audience changes affect many users)",
  },
  "monthly-coupon.campaign.delete": {
    tier: "trigger_human_approve",
    requiredPermission: "promos.delete",
    legacyAdminCheck: true,
    path: "/v1/monthly-coupon/campaign/:id",
    method: "DELETE",
    summary: "Delete a monthly-coupon campaign",
  },
  "monthly-coupon.campaign.toggle": {
    tier: "trigger_norm_confirm",
    requiredPermission: "promos.edit",
    legacyAdminCheck: true,
    path: "/v1/monthly-coupon/campaign/:id/toggle",
    method: "PATCH",
    summary: "Toggle a monthly-coupon campaign on/off",
  },
  "monthly-coupon.campaign.redemptions": {
    tier: "read",
    requiredPermission: "promos.view",
    legacyAdminCheck: true,
    path: "/v1/monthly-coupon/campaign/:id/redemptions",
    method: "GET",
    summary: "Redemptions for a monthly-coupon campaign",
  },
  "monthly-coupon.target-users.manual": {
    tier: "read",
    requiredPermission: "promos.view",
    legacyAdminCheck: true,
    path: "/v1/monthly-coupon/target-users/manual",
    method: "POST",
    summary: "Resolve manually-supplied user IDs for coupon targeting",
  },
  "monthly-coupon.target-users.csv": {
    tier: "read",
    requiredPermission: "promos.view",
    legacyAdminCheck: true,
    path: "/v1/monthly-coupon/target-users/csv",
    method: "POST",
    summary: "Resolve CSV-supplied user IDs for coupon targeting",
  },
  "monthly-coupon.target-users.filter": {
    tier: "read",
    requiredPermission: "promos.view",
    legacyAdminCheck: true,
    path: "/v1/monthly-coupon/target-users/filter",
    method: "POST",
    summary: "Resolve users matching a coupon-targeting filter",
  },
  "monthly-coupon.target-users.dynamic": {
    tier: "read",
    requiredPermission: "promos.view",
    legacyAdminCheck: true,
    path: "/v1/monthly-coupon/target-users/dynamic",
    method: "POST",
    summary: "Resolve users via dynamic segment for coupon targeting",
  },

  // ─── Promo analytics (wired) ──────────────────────────────────────────
  "promo-analytics.summary": {
    tier: "read",
    requiredPermission: "promos.view",
    path: "/v1/promo-analytics",
    method: "GET",
    summary: "Promo analytics summary: per-page + per-UTM-source visits, signups, conversions, revenue",
    responseSchema: NormPromoAnalyticsSummarySchema,
  },
  "promo-analytics.channel-detail": {
    tier: "read",
    requiredPermission: "promos.view",
    path: "/v1/promo-analytics/channel-detail",
    method: "GET",
    summary: "Promo analytics for a single utmSource: pages and campaigns it drove",
    responseSchema: NormPromoAnalyticsChannelDetailSchema,
  },
  "promo-analytics.page-detail": {
    tier: "read",
    requiredPermission: "promos.view",
    path: "/v1/promo-analytics/page-detail",
    method: "GET",
    summary: "Promo analytics for a single page: per-UTM-campaign attribution + visits-from",
    responseSchema: NormPromoAnalyticsPageDetailSchema,
  },

  // ─── Promo — core (roadmap) ───────────────────────────────────────────
  "promo.active": {
    tier: "read",
    requiredPermission: "promos.view",
    path: "/v1/promo/active",
    method: "GET",
    summary: "Currently-active promo",
  },
  "promo.active.refresh": {
    tier: "write_safe",
    requiredPermission: "promos.view",
    path: "/v1/promo/active",
    method: "POST",
    summary: "Refresh the active-promo cache",
  },
  "promo.create": {
    tier: "write_safe",
    requiredPermission: "promos.edit",
    path: "/v1/promo/create",
    method: "POST",
    summary: "Create a promo",
  },
  "promo.effective": {
    tier: "read",
    requiredPermission: "promos.view",
    path: "/v1/promo/effective",
    method: "GET",
    summary: "Resolve currently-effective promo for context",
  },
  "promo.end": {
    tier: "trigger_human_approve",
    requiredPermission: "promos.end",
    path: "/v1/promo/end",
    method: "POST",
    summary: "End an active promo (public-facing, irreversible)",
  },
  "promo.history": {
    tier: "read",
    requiredPermission: "promos.view",
    path: "/v1/promo/history",
    method: "GET",
    summary: "Promo history",
  },
  "promo.toggle": {
    tier: "trigger_norm_confirm",
    requiredPermission: "promos.edit",
    path: "/v1/promo/toggle",
    method: "POST",
    summary: "Toggle a promo on/off",
  },

  // ─── Promo — alternating multiplier ──────────────────────────────────
  "promo.alternating-multiplier.list": {
    tier: "read",
    requiredPermission: "promos.view",
    path: "/v1/promo/alternating-multiplier",
    method: "GET",
    summary: "List alternating-multiplier promos",
  },
  "promo.alternating-multiplier.create": {
    tier: "write_safe",
    requiredPermission: "promos.edit",
    path: "/v1/promo/alternating-multiplier",
    method: "POST",
    summary: "Create an alternating-multiplier promo",
  },
  "promo.alternating-multiplier.update": {
    tier: "write_safe",
    requiredPermission: "promos.edit",
    path: "/v1/promo/alternating-multiplier/:id",
    method: "PATCH",
    summary: "Update an alternating-multiplier promo",
  },
  "promo.alternating-multiplier.delete": {
    tier: "trigger_human_approve",
    requiredPermission: "promos.delete",
    path: "/v1/promo/alternating-multiplier/:id",
    method: "DELETE",
    summary: "Delete an alternating-multiplier promo",
  },

  // ─── Promo — banner text ─────────────────────────────────────────────
  "promo.banner-text.list": {
    tier: "read",
    requiredPermission: "promos.view",
    path: "/v1/promo/banner-text",
    method: "GET",
    summary: "List promo banner texts",
  },
  "promo.banner-text.create": {
    tier: "write_safe",
    requiredPermission: "promos.edit",
    path: "/v1/promo/banner-text",
    method: "POST",
    summary: "Create a promo banner text",
  },
  "promo.banner-text.active": {
    tier: "read",
    requiredPermission: "promos.view",
    path: "/v1/promo/banner-text/active",
    method: "GET",
    summary: "Currently-active promo banner text",
  },
  "promo.banner-text.update": {
    tier: "write_safe",
    requiredPermission: "promos.edit",
    path: "/v1/promo/banner-text/:id",
    method: "PUT",
    summary: "Update a promo banner text",
  },
  "promo.banner-text.delete": {
    tier: "trigger_human_approve",
    requiredPermission: "promos.delete",
    path: "/v1/promo/banner-text/:id",
    method: "DELETE",
    summary: "Delete a promo banner text",
  },

  // ─── Promo — bonus entry ─────────────────────────────────────────────
  "promo.bonus-entry.list": {
    tier: "read",
    requiredPermission: "promos.view",
    path: "/v1/promo/bonus-entry/list",
    method: "GET",
    summary: "List bonus-entry promos",
  },
  "promo.bonus-entry.active": {
    tier: "read",
    requiredPermission: "promos.view",
    path: "/v1/promo/bonus-entry/active",
    method: "GET",
    summary: "Currently-active bonus-entry promo",
  },
  "promo.bonus-entry.create": {
    tier: "write_safe",
    requiredPermission: "promos.edit",
    path: "/v1/promo/bonus-entry/create",
    method: "POST",
    summary: "Create a bonus-entry promo",
  },
  "promo.bonus-entry.update": {
    tier: "write_safe",
    requiredPermission: "promos.edit",
    path: "/v1/promo/bonus-entry/:id",
    method: "PATCH",
    summary: "Update a bonus-entry promo",
  },
  "promo.bonus-entry.delete": {
    tier: "trigger_human_approve",
    requiredPermission: "promos.delete",
    path: "/v1/promo/bonus-entry/:id",
    method: "DELETE",
    summary: "Delete a bonus-entry promo",
  },

  // ─── Promo — link ────────────────────────────────────────────────────
  "promo.link.list": {
    tier: "read",
    requiredPermission: "promos.view",
    path: "/v1/promo/link/list",
    method: "GET",
    summary: "List promo links",
  },
  "promo.link.create": {
    tier: "write_safe",
    requiredPermission: "promos.edit",
    path: "/v1/promo/link/create",
    method: "POST",
    summary: "Create a promo link",
  },
  "promo.link.update": {
    tier: "write_safe",
    requiredPermission: "promos.edit",
    path: "/v1/promo/link/:id",
    method: "PATCH",
    summary: "Update a promo link",
  },
  "promo.link.delete": {
    tier: "trigger_human_approve",
    requiredPermission: "promos.delete",
    path: "/v1/promo/link/:id",
    method: "DELETE",
    summary: "Delete a promo link",
  },

  // ─── Promo — scheduled ───────────────────────────────────────────────
  "promo.scheduled.list": {
    tier: "read",
    requiredPermission: "promos.view",
    path: "/v1/promo/scheduled/list",
    method: "GET",
    summary: "List scheduled promos",
  },
  "promo.scheduled.create": {
    tier: "write_safe",
    requiredPermission: "promos.edit",
    path: "/v1/promo/scheduled/create",
    method: "POST",
    summary: "Schedule a new promo",
  },
  "promo.scheduled.update": {
    tier: "write_safe",
    requiredPermission: "promos.edit",
    path: "/v1/promo/scheduled/:id",
    method: "PATCH",
    summary: "Update a scheduled promo",
  },
  "promo.scheduled.delete": {
    tier: "trigger_human_approve",
    requiredPermission: "promos.delete",
    path: "/v1/promo/scheduled/:id",
    method: "DELETE",
    summary: "Delete a scheduled promo",
  },
  "promo.scheduled.apply-month": {
    tier: "trigger_human_approve",
    requiredPermission: "promos.edit",
    path: "/v1/promo/scheduled/apply-month",
    method: "POST",
    summary: "Apply all scheduled promos for a month (public-facing batch)",
  },

  // ─── Stripe webhook queue (roadmap) ──────────────────────────────────
  "stripe-webhook-queue.list": {
    tier: "read",
    requiredPermission: "errorReports.view",
    path: "/v1/stripe-webhook-queue",
    method: "GET",
    summary: "List Stripe webhook queue items",
    responseSchema: NormStripeWebhookQueueListSchema,
  },
  "stripe-webhook-queue.retry": {
    tier: "trigger_norm_confirm",
    requiredPermission: "errorReports.edit",
    path: "/v1/stripe-webhook-queue",
    method: "POST",
    summary: "Retry / requeue a Stripe webhook queue item",
  },

  // ─── Submissions (roadmap) ───────────────────────────────────────────
  "submissions.unviewed-count": {
    tier: "read",
    requiredPermission: "overview.view",
    path: "/v1/submissions/unviewed-count",
    method: "GET",
    summary: "Count of unviewed contact submissions",
    responseSchema: NormSubmissionsUnviewedCountSchema,
  },

  // ─── Upsell multipliers (roadmap) ────────────────────────────────────
  "upsell-multipliers.list": {
    tier: "read",
    requiredPermission: "overview.view",
    path: "/v1/upsell-multipliers",
    method: "GET",
    summary: "List upsell multipliers",
    responseSchema: NormUpsellMultipliersSchema,
  },
  "upsell-multipliers.update": {
    tier: "write_safe",
    requiredPermission: "overview.edit",
    path: "/v1/upsell-multipliers",
    method: "PUT",
    summary: "Update upsell multipliers",
  },

  // ─── Users (roadmap) ─────────────────────────────────────────────────
  "users.list": {
    tier: "read",
    requiredPermission: "users.view",
    path: "/v1/users",
    method: "GET",
    summary: "List users",
  },
  "users.search": {
    tier: "read",
    requiredPermission: "users.view",
    path: "/v1/users/search",
    method: "GET",
    summary: "Search users",
  },
  "users.export": {
    tier: "read",
    requiredPermission: "users.export",
    path: "/v1/users/export",
    method: "GET",
    summary: "Export users (PII export, audit-worthy)",
  },
  "users.get": {
    tier: "read",
    requiredPermission: "users.view",
    path: "/v1/users/:id",
    method: "GET",
    summary: "Get a single user",
  },
  "users.update": {
    tier: "write_safe",
    requiredPermission: "users.edit",
    path: "/v1/users/:id",
    method: "PATCH",
    summary: "Update a single user record",
  },
  "users.delete": {
    tier: "trigger_human_approve",
    requiredPermission: "users.delete",
    path: "/v1/users/:id",
    method: "DELETE",
    summary: "Delete a user (irreversible)",
  },
  "users.deletion-summary": {
    tier: "read",
    requiredPermission: "users.view",
    path: "/v1/users/:id/deletion-summary",
    method: "GET",
    summary: "Preview the impact of deleting a user",
  },
  "users.actions": {
    tier: "trigger_norm_confirm",
    requiredPermission: "users.edit",
    path: "/v1/users/:id/actions",
    method: "POST",
    summary: "Perform a single admin action on a user",
  },
  "users.cancel-subscription": {
    tier: "trigger_human_approve",
    requiredPermission: "users.cancelSubscription",
    path: "/v1/users/:id/cancel-subscription",
    method: "POST",
    summary: "Cancel a user's subscription",
  },
  "users.charge-past-due.preview": {
    tier: "read",
    requiredPermission: "users.view",
    path: "/v1/users/:id/charge-past-due",
    method: "GET",
    summary: "Preview past-due charge for a single user",
  },
  "users.charge-past-due.run": {
    tier: "trigger_norm_confirm",
    requiredPermission: "users.charge",
    path: "/v1/users/:id/charge-past-due",
    method: "POST",
    summary: "Charge a single user's past-due invoice",
  },
  "users.force-charge": {
    tier: "trigger_human_approve",
    requiredPermission: "users.charge",
    path: "/v1/users/:id/force-charge",
    method: "POST",
    summary: "Force-charge a user — explicit money movement",
  },
  "users.recover-past-due-invoice.preview": {
    tier: "read",
    requiredPermission: "users.charge",
    path: "/v1/users/:id/recover-past-due-invoice",
    method: "GET",
    summary: "Preview past-due invoice recovery for a user",
  },
  "users.recover-past-due-invoice.run": {
    tier: "trigger_norm_confirm",
    requiredPermission: "users.charge",
    path: "/v1/users/:id/recover-past-due-invoice",
    method: "POST",
    summary: "Recover a single past-due invoice via Stripe collection-pause flow",
  },
  "users.payment-events.list": {
    tier: "read",
    requiredPermission: "users.view",
    path: "/v1/users/:id/payment-events",
    method: "GET",
    summary: "List payment events for a user",
  },
  "users.payment-events.reverse": {
    tier: "trigger_human_approve",
    requiredPermission: "users.refund",
    path: "/v1/users/:id/payment-events/:eventId/reverse",
    method: "POST",
    summary: "Reverse a single payment event (refund-class money movement)",
  },

  // ─── Winners (wired get; update/delete roadmap) ───────────────────────
  "winners.get": {
    tier: "read",
    requiredPermission: "majorDraw.view",
    path: "/v1/winners/:id",
    method: "GET",
    summary: "Get a single winner record with the joined draw name (PII-safe projection: firstName + state only)",
    responseSchema: NormWinnerDetailSchema,
  },
  "winners.update": {
    tier: "write_safe",
    requiredPermission: "majorDraw.edit",
    path: "/v1/winners/:id",
    method: "PATCH",
    summary: "Update a winner record",
  },
  "winners.delete": {
    tier: "trigger_human_approve",
    requiredPermission: "majorDraw.edit",
    path: "/v1/winners/:id",
    method: "DELETE",
    summary: "Delete a winner record (irreversible, public-facing)",
  },
} as const satisfies Record<string, NormEndpointSpec>;

export type NormEndpointKey = keyof typeof NORM_ENDPOINTS;

export function getEndpoint(key: string): NormEndpointSpec | undefined {
  return (NORM_ENDPOINTS as Record<string, NormEndpointSpec>)[key];
}

/**
 * Returns the set of endpoints that have been "wired" (a corresponding route file
 * exists, signaled by the presence of a responseSchema). The classification matrix
 * may contain many roadmap entries without responseSchema; the manifest builder
 * filters to wired entries so Norm only discovers what it can actually call.
 */
export function getWiredEndpoints(): NormEndpointSpec[] {
  return Object.values(NORM_ENDPOINTS as Record<string, NormEndpointSpec>).filter((e) => !!e.responseSchema);
}

/**
 * Boot-time validation: every registry entry's requiredPermission must be a valid
 * catalog permission. Catches typos at module-load time.
 */
for (const [key, spec] of Object.entries(NORM_ENDPOINTS)) {
  if (!ALL_PERMISSIONS.has(spec.requiredPermission)) {
    throw new Error(`NORM_ENDPOINTS["${key}"].requiredPermission "${spec.requiredPermission}" is not in PERMISSIONS catalog`);
  }
}
