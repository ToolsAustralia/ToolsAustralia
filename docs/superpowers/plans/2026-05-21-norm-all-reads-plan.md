# Norm read-tier full coverage plan — 2026-05-21

> **Spec:** [`docs/superpowers/specs/2026-05-20-internal-norm-api-design.md`](../specs/2026-05-20-internal-norm-api-design.md)
> **Recipe:** [`docs/internal-norm/patterns.md`](../../internal-norm/patterns.md) (P1, P3)
> **Already wired (baseline):** `health`, `manifest`, `pending-actions.status`, `roas.summary`, `roas.breakdown`, `dashboard.stats`, `dashboard.revenue-breakdown`.

## Goal

Wire every remaining `tier: "read"` entry in `src/lib/internal-norm/classification.ts` so the read feature is complete. Each endpoint needs:

1. Underlying admin service exists & lean (extract from fat `route.ts` if needed; preserve `requirePermission` guard).
2. Zod response schema in `src/lib/internal-norm/schemas/<domain>.ts`.
3. Registry entry updated with `responseSchema:` (flips it from roadmap-only to wired in the manifest).
4. Norm route file at `src/app/api/internal/norm/v1/<path>/route.ts`.
5. Section added to `docs/internal-norm/norm-context.md` (Returns / Inputs / Data source / Constraints — never "when to use it").
6. Smoke-tested (`200 OK` from `npm run norm:smoke`, or documented blocker).

## Full inventory (78 unwired read endpoints, grouped)

### G1 — Dashboard slices (5)
- [ ] `dashboard.membership-by-package` → `MembershipAnalyticsService` (already lean)
- [ ] `dashboard.projected-income`
- [ ] `dashboard.recent-activities`
- [ ] `dashboard.revenue-details`
- [ ] `dashboard.upcoming-renewals`

### G2 — Activity log (1)
- [ ] `activity-log.list` (FAT route ~520 lines — extract `ActivityLogService`)

### G3 — Error reports (2)
- [ ] `error-reports.list`
- [ ] `error-reports.get`

### G4 — Small standalones (5)
- [ ] `submissions.unviewed-count`
- [ ] `cancellation-flow-analytics.list` (already has `cancellationFlowAnalytics` service)
- [ ] `upsell-multipliers.list`
- [ ] `klaviyo.draw-reset.preview`
- [ ] `klaviyo.draw-reset.progress`

### G5 — Health snapshots (2)
- [ ] `health.dashboard-stats-snapshot`
- [ ] `health.membership-snapshot`

### G6 — Stripe webhook queue + invoices (2)
- [ ] `stripe-webhook-queue.list`
- [ ] `invoices.charge-past-due.preview` (GET on the past-due endpoint)

### G7 — Charge past-due reads (4)
- [ ] `charge-past-due.decline-summary`
- [ ] `charge-past-due.manual-retries.list`
- [ ] `charge-past-due.runs.list`
- [ ] `charge-past-due.run.get` (existing `chargePastDueHistory` service)

### G8 — Facebook ads reads (3)
- [ ] `facebook-ads.insights` (admin route already lean via `FacebookAdsInsightsService`)
- [ ] `facebook-ads.hourly-insights.list`
- [ ] `facebook-ads.purchase-audit`

### G9 — Affiliate reads (2)
- [ ] `affiliate.list`
- [ ] `affiliate.get`

### G10 — A/B testing reads (5)
- [ ] `ab-testing.experiments.list`
- [ ] `ab-testing.experiment.get`
- [ ] `ab-testing.experiment-analytics` (existing `ExperimentAnalyticsService`)
- [ ] `ab-testing.experiment-history`
- [ ] `ab-testing.experiment.winner.get`

### G11 — Major draw reads (7) — *MIND schema (activationDate/drawDate/status enum)*
- [ ] `major-draw.current-and-last`
- [ ] `major-draw.export`
- [ ] `major-draw.history`
- [ ] `major-draw.participants`
- [ ] `major-draw.scheduled-months`
- [ ] `major-draw.select-winner.preview` (GET on select-winner)
- [ ] `major-draw.update.get` (GET on update)

### G12 — Mini draw reads (4)
- [ ] `mini-draw.full-capacity-count`
- [ ] `mini-draw.list`
- [ ] `mini-draw.get` (`/v1/mini-draw/:id`)
- [ ] `mini-draw.export` (`/v1/mini-draw/:id/export`)

### G13 — Winners + analytics spend-by-url (3)
- [ ] `winners.get`
- [ ] `analytics.spend-by-url.list`
- [ ] `analytics.spend-by-url.detail`

### G14 — Metrics reads (3)
- [ ] `metrics.debug`
- [ ] `metrics.users` (existing `UserMetricsService`)
- [ ] `metrics.users.major-draw-comparison` (existing `UserMajorDrawComparisonService`)

### G15 — Promo core reads (3)
- [ ] `promo.active`
- [ ] `promo.effective`
- [ ] `promo.history`

### G16 — Promo sub-domain reads (8)
- [ ] `promo.alternating-multiplier.list`
- [ ] `promo.banner-text.list`
- [ ] `promo.banner-text.active`
- [ ] `promo.bonus-entry.list`
- [ ] `promo.bonus-entry.active`
- [ ] `promo.link.list`
- [ ] `promo.scheduled.list`

### G17 — Promo analytics reads (3)
- [ ] `promo-analytics.summary` (existing `PromoAnalyticsService`)
- [ ] `promo-analytics.channel-detail`
- [ ] `promo-analytics.page-detail`

### G18 — Allowlist reads (3 LEGACY admin checks)
- [ ] `allowlist.actions.list` (existing `AllowlistService`)
- [ ] `allowlist.blocked-cards.list`
- [ ] `allowlist.stats`

### G19 — Milestone rewards reads (1 LEGACY)
- [ ] `milestone-rewards.list` (existing `MilestoneService`)

### G20 — Monthly coupon reads (6 LEGACY — note these are POST-tier reads)
- [ ] `monthly-coupon.campaigns.list`
- [ ] `monthly-coupon.campaign.redemptions`
- [ ] `monthly-coupon.target-users.manual`
- [ ] `monthly-coupon.target-users.csv`
- [ ] `monthly-coupon.target-users.filter`
- [ ] `monthly-coupon.target-users.dynamic`

### G21 — Users reads (8) — *PII-CAREFUL projections*
- [ ] `users.list` (FAT route ~355 lines — extract `UserListService` or admin/users service)
- [ ] `users.search`
- [ ] `users.export` (returns CSV/Excel — Norm shape needs decision: omit, return URL, or returns aggregate-only)
- [ ] `users.get`
- [ ] `users.deletion-summary`
- [ ] `users.charge-past-due.preview`
- [ ] `users.recover-past-due-invoice.preview`
- [ ] `users.payment-events.list`

---

## Execution rules

- Per-group commit: `feat(internal-norm): wire <domain> reads (<N> endpoints)`.
- Run `npm run build:norm-manifest && npm run lint && npm run type-check` per commit.
- Smoke each endpoint via `npm run norm:smoke -- GET "<path>"`. Aggregate results.
- 403 from smoke = correct wiring, Norm Role doesn't grant the permission. Record in summary.
- After 12-ish completed groups, regen manifest test passes.

## Status legend (filled in as work progresses)

`✅ shipped` — schema + registry + route + doc + smoke 200
`⚠️ shipped-403` — wired correctly, Norm Role lacks permission (operator action)
`🔵 shipped-deferred` — code complete, smoke needs live data
`❌ blocked` — see notes
`🗑️ removed` — orphan, removed from registry

## Session summary location

`docs/superpowers/session-reports/2026-05-21-norm-all-reads.md` — written as the final commit of the session.
