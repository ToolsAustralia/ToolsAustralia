# Staff Permissions Mapping

This document maps each admin API route group to the RBAC permission(s) required to access it.
Updated as each task in the user-roles migration replaces legacy `session.user.role === "admin"` checks.

| Route group | HTTP methods | Permission required |
|---|---|---|
| `/api/admin/users` (list) | GET | `users.view` |
| `/api/admin/users/[id]` | GET | `users.view` |
| `/api/admin/users/[id]` | PATCH | `users.edit` |
| `/api/admin/users/[id]/actions` | POST | `users.edit` |
| `/api/admin/users/[id]/cancel-subscription` | POST | `users.cancelSubscription` |
| `/api/admin/users/[id]/delete` | DELETE | `users.delete` |
| `/api/admin/users/[id]/deletion-summary` | GET | `users.view` |
| `/api/admin/users/search` | GET | `users.view` |
| `/api/admin/users/export` | GET | `users.view` |
| `/api/admin/promo/active` | GET | `promos.view` |
| `/api/admin/promo/active` | POST | _(public — no auth)_ |
| `/api/admin/promo/alternating-multiplier` | GET | `promos.view` |
| `/api/admin/promo/alternating-multiplier` | POST | `promos.edit` |
| `/api/admin/promo/alternating-multiplier/[id]` | PATCH | `promos.edit` |
| `/api/admin/promo/alternating-multiplier/[id]` | DELETE | `promos.edit` |
| `/api/admin/promo/banner-text` | GET | `promos.view` |
| `/api/admin/promo/banner-text` | POST | `promos.edit` |
| `/api/admin/promo/banner-text/active` | GET | _(public — no auth)_ |
| `/api/admin/promo/banner-text/[id]` | PUT | `promos.edit` |
| `/api/admin/promo/banner-text/[id]` | DELETE | `promos.edit` |
| `/api/admin/promo/bonus-entry/active` | GET | `promos.view` |
| `/api/admin/promo/bonus-entry/create` | POST | `promos.edit` |
| `/api/admin/promo/bonus-entry/list` | GET | `promos.view` |
| `/api/admin/promo/bonus-entry/[id]` | PATCH | `promos.edit` |
| `/api/admin/promo/bonus-entry/[id]` | DELETE | `promos.edit` |
| `/api/admin/promo/create` | POST | `promos.edit` |
| `/api/admin/promo/effective` | GET | `promos.view` |
| `/api/admin/promo/end` | POST | `promos.end` |
| `/api/admin/promo/history` | GET | `promos.view` |
| `/api/admin/promo/toggle` | POST | `promos.edit` |
| `/api/admin/promo/link/list` | GET | `promos.view` |
| `/api/admin/promo/link/create` | POST | `promos.edit` |
| `/api/admin/promo/link/[id]` | PATCH | `promos.edit` |
| `/api/admin/promo/link/[id]` | DELETE | `promos.edit` |
| `/api/admin/promo/scheduled/list` | GET | `promos.view` |
| `/api/admin/promo/scheduled/create` | POST | `promos.edit` |
| `/api/admin/promo/scheduled/apply-month` | POST | `promos.edit` |
| `/api/admin/promo/scheduled/[id]` | PATCH | `promos.edit` |
| `/api/admin/promo/scheduled/[id]` | DELETE | `promos.edit` |
| `/api/admin/users/[id]/charge-past-due` | GET | `users.view` |
| `/api/admin/users/[id]/charge-past-due` | POST | `users.charge` |
| `/api/admin/users/[id]/force-charge` | POST | `users.charge` |
| `/api/admin/users/[id]/payment-events` | GET | `users.view` |
| `/api/admin/users/[id]/payment-events/[eventId]/reverse` | POST | `users.refund` |
| `/api/admin/users/[id]/recover-past-due-invoice` | GET | `users.charge` |
| `/api/admin/users/[id]/recover-past-due-invoice` | POST | `users.charge` |
| `/api/admin/ab-testing/experiments` | GET | `abTesting.view` |
| `/api/admin/ab-testing/experiments` | POST | `abTesting.edit` |
| `/api/admin/ab-testing/experiments/[id]` | GET | `abTesting.view` |
| `/api/admin/ab-testing/experiments/[id]` | PATCH | `abTesting.edit` |
| `/api/admin/ab-testing/experiments/[id]` | DELETE | `abTesting.delete` |
| `/api/admin/ab-testing/experiments/[id]/analytics` | GET | `abTesting.view` |
| `/api/admin/ab-testing/experiments/[id]/history` | GET | `abTesting.view` |
| `/api/admin/ab-testing/experiments/[id]/variants` | POST/PATCH/DELETE | `abTesting.edit` |
| `/api/admin/ab-testing/experiments/[id]/winner` | GET | `abTesting.view` |
| `/api/admin/ab-testing/experiments/[id]/winner` | POST | `abTesting.selectWinner` |
| `/api/admin/ab-testing/preview` | POST/DELETE | `abTesting.edit` |
| `/api/admin/activity-log` | GET | `overview.view` |
| `/api/admin/affiliate/[id]` | GET | `affiliates.view` |
| `/api/admin/affiliate/[id]` | PUT | `affiliates.edit` |
| `/api/admin/affiliate/[id]` | DELETE | `affiliates.delete` |
| `/api/admin/affiliate/[id]/process-payout` | POST | `affiliates.processPayout` |
| `/api/admin/affiliate/[id]/referred-users` | POST/DELETE | `affiliates.edit` |
| `/api/admin/affiliate/create` | POST | `affiliates.edit` |
| `/api/admin/affiliate/list` | GET | `affiliates.view` |
| `/api/admin/analytics/spend-by-url` | GET | `facebookAds.view` |
| `/api/admin/analytics/spend-by-url/detail` | GET | `facebookAds.view` |
| `/api/admin/analytics/spend-by-url/sync` | POST | `facebookAds.edit` |
| `/api/admin/cancellation-flow-analytics` | GET | `overview.view` |
| `/api/admin/charge-past-due/decline-summary` | GET | `users.view` |
| `/api/admin/charge-past-due/manual-retries` | GET | `users.view` |
| `/api/admin/charge-past-due/runs` | GET | `users.view` |
| `/api/admin/charge-past-due/runs/[runId]` | GET | `users.view` |
| `/api/admin/dashboard/membership-by-package` | GET | `overview.view` |
| `/api/admin/dashboard/projected-income` | GET | `overview.view` |
| `/api/admin/dashboard/recent-activities` | GET | `overview.view` |
| `/api/admin/dashboard/revenue-breakdown` | GET | `overview.view` |
| `/api/admin/dashboard/revenue-details` | GET | `overview.view` |
| `/api/admin/dashboard/stats` | GET | `overview.view` |
| `/api/admin/dashboard/upcoming-renewals` | GET | `overview.view` |
| `/api/admin/error-reports` | GET | `errorReports.view` |
| `/api/admin/error-reports/[id]` | GET | `errorReports.view` |
| `/api/admin/error-reports/[id]` | PATCH | `errorReports.edit` |
| `/api/admin/error-reports/bulk-delete` | DELETE | `errorReports.delete` |
| `/api/admin/error-reports/bulk-delete` | PATCH | `errorReports.edit` |
| `/api/admin/facebook-ads/hourly-insights` | GET/POST | `facebookAds.view` |
| `/api/admin/facebook-ads/insights` | GET | `facebookAds.view` |
| `/api/admin/facebook-ads/purchase-audit` | GET | `facebookAds.view` |
| `/api/admin/health/dashboard-stats-snapshot` | GET | `overview.view` |
| `/api/admin/health/membership-snapshot` | GET | `overview.view` |
| `/api/admin/invoices/charge-past-due` | GET | `users.view` |
| `/api/admin/invoices/charge-past-due` | POST | `users.charge` |
| `/api/admin/invoices/recover-past-due` | POST | `users.charge` |
| `/api/admin/klaviyo/draw-reset-execute` | POST | `overview.edit` |
| `/api/admin/klaviyo/draw-reset-preview` | GET | `overview.view` |
| `/api/admin/klaviyo/draw-reset-progress` | GET | `overview.view` |
| `/api/admin/major-draw/create` | POST | `majorDraw.edit` |
| `/api/admin/major-draw/current-and-last` | GET | `majorDraw.view` |
| `/api/admin/major-draw/export` | GET | `majorDraw.view` |
| `/api/admin/major-draw/history` | GET | `majorDraw.view` |
| `/api/admin/major-draw/participants` | GET | `majorDraw.view` |
| `/api/admin/major-draw/scheduled-months` | GET | `majorDraw.view` |
| `/api/admin/major-draw/select-winner` | GET | `majorDraw.view` |
| `/api/admin/major-draw/select-winner` | POST | `majorDraw.selectWinner` |
| `/api/admin/major-draw/update` | GET | `majorDraw.view` |
| `/api/admin/major-draw/update` | PUT | `majorDraw.edit` |
| `/api/admin/metrics/debug` | GET | `overview.view` |
| `/api/admin/metrics/users` | GET | `overview.view` |
| `/api/admin/metrics/users/major-draw-comparison` | GET | `overview.view` |
| `/api/admin/mini-draw/[id]` | GET | `miniDraws.view` |
| `/api/admin/mini-draw/[id]` | DELETE | `miniDraws.delete` |
| `/api/admin/mini-draw/[id]/export` | GET | `miniDraws.view` |
| `/api/admin/mini-draw/[id]/select-winner` | POST | `miniDraws.selectWinner` |
| `/api/admin/mini-draw/create` | POST | `miniDraws.edit` |
| `/api/admin/mini-draw/full-capacity-count` | GET | `miniDraws.view` |
| `/api/admin/mini-draw/list` | GET | `miniDraws.view` |
| `/api/admin/mini-draw/order` | POST | `miniDraws.edit` |
| `/api/admin/mini-draw/update` | PUT | `miniDraws.edit` |
| `/api/admin/promo-analytics` | GET | `promos.view` |
| `/api/admin/promo-analytics/channel-detail` | GET | `promos.view` |
| `/api/admin/promo-analytics/page-detail` | GET | `promos.view` |
| `/api/admin/stripe-webhook-queue` | GET | `errorReports.view` |
| `/api/admin/stripe-webhook-queue` | POST | `errorReports.edit` |
| `/api/admin/submissions/unviewed-count` | GET | `overview.view` |
| `/api/contact-submissions` | GET | `submissions.view` |
| `/api/contact-submissions` | POST | _(public — no auth)_ |
| `/api/contact-submissions/[id]` | GET | `submissions.view` |
| `/api/contact-submissions/[id]` | PUT | `submissions.edit` |
| `/api/contact-submissions/[id]` | PATCH (mark read) | `submissions.edit` |
| `/api/contact-submissions/[id]` | DELETE | `submissions.delete` |
| `/api/contact-submissions/[id]/reply` | POST | `submissions.edit` |
| `/api/admin/upsell-multipliers` | GET | `overview.view` |
| `/api/admin/upsell-multipliers` | PUT | `overview.edit` |
| `/api/admin/winners/[id]` | GET | `majorDraw.view` |
| `/api/admin/winners/[id]` | PATCH/DELETE | `majorDraw.edit` |
| `/api/admin/roles` | GET | `settings.view` |
| `/api/admin/roles` | POST | `settings.edit` |
| `/api/admin/roles/[id]` | PATCH | `settings.edit` |
| `/api/admin/roles/[id]` | DELETE | `settings.edit` |
| `/api/admin/staff` | GET | `settings.view` |
| `/api/admin/staff` | POST | `settings.edit` |
| `/api/admin/staff/[id]` | PATCH | `settings.edit` |
| `/api/admin/staff/[id]` | DELETE | `settings.edit` |

| `/api/users/[id]` | GET (self) | _(any authenticated user — self-only)_ |
| `/api/users/[id]` | GET (other user) | `users.view` |
| `/api/users/[id]/my-account` | GET (self) | _(any authenticated user — self-only)_ |
| `/api/users/[id]/my-account` | GET (other user) | `users.view` |
| `/api/upload/cloudinary` | POST, DELETE | `promos.edit` |
| `/api/major-draw/select-winner` | POST | `majorDraw.selectWinner` |
| `/api/partner-applications` | GET | `users.view` |
| `/api/partner-applications` | POST | _(public — no auth required)_ |
| `/api/partner-applications/[id]` | GET | `users.view` |
| `/api/partner-applications/[id]` | PUT | `users.edit` |
| `/api/partner-applications/[id]` | PATCH (mark read) | `users.view` |
| `/api/partner-applications/[id]` | DELETE | `users.edit` |
| `/api/debug/check-admin` | GET | _(open to any authenticated caller — diagnostic only)_ |

## Notes

- All `/api/admin/**` routes and the non-admin routes listed above now use `requirePermission()` — the legacy `session.user.role === "admin"` pattern has been fully removed from API routes.
- The `requirePermission()` helper (`src/lib/api-auth-permissions.ts`) includes a legacy bridge: existing `admin`-role users without a `roleId` are granted every permission during the transition window.
- Cron routes (`/api/admin/cron/**`) and staff/roles management routes use their own auth patterns and are excluded from this table.
- `/api/debug/check-admin` is intentionally ungated — it is a diagnostic endpoint that reports the caller's session/DB role, `userType`, and `permissions` fields. It does not expose sensitive data beyond what the session already contains.
