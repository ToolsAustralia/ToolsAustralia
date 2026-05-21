# Internal Norm — API

All endpoints share the request shape (bearer + signed headers — see [architecture.md](./architecture.md#auth-chain-ascii)) and the response envelope:

```json
{ "success": true,  "data": { ... }, "requestId": "01J..." }
{ "success": false, "error": "...", "code": "...", "requestId": "01J..." }
```

`requestId` is a ULID written into every `NormCallLog` row — quote it when reporting issues.

## Framework endpoints

### `GET /v1/health`
Tier `read`; required permission `overview.view`. Liveness + signing-secret validation. Norm pings this on startup.

Response: `{ ok: true, version: "v1" }`.

### `GET /v1/manifest`
Tier `read`; required permission `overview.view`. Returns the auto-generated [normToolsManifest.json](../../src/generated/normToolsManifest.json) listing every **wired** endpoint with tier, path, method, summary, and Zod-derived input/output JSONSchema. Norm refreshes this on startup to discover capabilities.

### `GET /v1/pending-actions/:id/status`
Tier `read`; required permission `overview.view`. Norm polls this after submitting a `trigger_human_approve` confirm to learn whether the owner has approved or denied. Returns `{ status: "pending" | "approved" | "denied" | "expired", resolutionOutcome?: {...} }`.

## Wired domain endpoints (Phase 2 + 3)

### `GET /v1/roas/summary`
Tier `read`; required permission `facebookAds.view`; per-endpoint cap 10/min.

Query: `?dateRange=today|yesterday|current-draw|last-draw|all-time|custom` (default `today`); for `custom` also `startDate`, `endDate` (ISO).

Response:
```json
{
  "dateRange": { "range": "today", "start": "...", "end": "..." },
  "spend": 0, "revenue": 0, "profit": 0, "roas": 0,
  "conversions": 0, "impressions": 0, "clicks": 0,
  "ctr": 0, "cpc": 0
}
```

Calls `FacebookAdsInsightsService.getInsights()` ([src/services/facebook-ads/FacebookAdsInsightsService.ts](../../src/services/facebook-ads/FacebookAdsInsightsService.ts)). Draw-based and `all-time` ranges are resolved server-side via [resolveNormDateRange()](../../src/utils/admin/resolveNormDateRange.ts) and passed to the service as `custom`.

### `GET /v1/roas/breakdown`
Tier `read`; required permission `facebookAds.view`; per-endpoint cap 10/min.

Query: `dateRange` (as above) + `level=campaign|adset|ad`.

Response: summary block (as `roas.summary`) plus `level` and `breakdown: Array<{ id, name, level, spend, revenue, profit, roas, conversions, impressions, clicks, ctr, cpc }>`.

### `GET /v1/dashboard/stats`
Tier `read`; required permission `overview.view`.

Query: `dateRange` (default `today`); `custom` also takes `startDate`, `endDate`.

Response (clean projection of the admin endpoint — see [DashboardStatsService](../../src/services/admin/DashboardStatsService.ts)):
```json
{
  "dateRange": { "range": "today", "start": "...", "end": "..." },
  "users": {
    "total": 0, "activeSubscriptions": 0, "newInRange": 0,
    "cancelledMemberships": 0, "totalScheduledCancellation": 0,
    "dropOffRate": 0, "periodChurnRate": null,
    "membershipRenewals": {
      "expectedInRange": 0, "succeededInRange": 0,
      "failedInvoicesInRange": 0, "becamePastDueInRange": 0
    }
  },
  "revenue": {
    "total": 0,
    "breakdown": {
      "membershipPurchase": 0, "membershipRenewal": 0,
      "oneTimePurchase": 0, "additionalOneTimePurchase": 0,
      "miniDraw": 0, "upsell": 0
    }
  },
  "majorDraw": { "totalEntries": 0, "activeDraws": 0 },
  "conversionRate": 0,
  "facebookAds": { "spend": 0, "roas": 0 }
}
```

**Deliberately omitted** vs the admin response: `trends`, `enhanced`, `snapshotMissingForStanding`, `profileCompletionRate`, `cancellationImpact.estimatedMonthlyRevenue`. Reduces noise for the AI consumer and prevents Norm being affected by internal-only field churn.

### `GET /v1/dashboard/revenue-breakdown`
Tier `read`; required permission `overview.view`.

Query: `dateRange` (+ `custom` start/end).

Response: just the `revenue` block from `dashboard.stats`, sliced more verbosely so Norm can answer narrow questions ("renewals revenue last week?") without parsing the bigger stats blob.

### `GET /v1/submissions/unviewed-count`
Tier `read`; required permission `overview.view`.

Response: `{ contact: number, partner: number, total: number }` — counts of unread `ContactSubmission` and `PartnerApplication` rows (`readAt` null/absent). Backed by [`getUnviewedSubmissionsCount`](../../src/services/admin/submissionsCountService.ts) (extracted from the admin route during wiring).

### `GET /v1/cancellation-flow-analytics`
Tier `read`; required permission `overview.view`.

Query: optional `startDate` / `endDate` (`YYYY-MM-DD`, AEST-inclusive). Defaults to a rolling 90-day window so the underlying collection scan is always bounded.

Response: the full `CancellationFlowSummary` from [`getCancellationFlowAnalytics`](../../src/services/admin/cancellationFlowAnalytics.ts) — `triggered`, per-reason breakdown, funnel counts, `saveRate` / `saveRatePct`, per-offer acceptance, `retention90` and `retention90ByOffer` splits, and `otherReasonTexts` for free-text "other" reasons.

### `GET /v1/upsell-multipliers`
Tier `read`; required permission `overview.view`.

Response: `{ membership, oneTime, additional, updatedAt }` — the singleton `UpsellMultiplierConfig` row, via [`getUpsellMultiplierConfig`](../../src/services/upsell/UpsellMultiplierResolver.ts). Each multiplier is a literal from `PROMO_MULTIPLIERS`.

### `GET /v1/klaviyo/draw-reset-preview`
Tier `read`; required permission `overview.view`.

Response: a `PreviewResult` describing which users a post-draw Klaviyo reset *would* sync — `targetDraw`, `cutoffDate`, `totalUsers`, `totalParticipants`, `skippedUsers`, `reductionPercentage`, plus up to 50 `sampleUsers`. Backed by [`getKlaviyoDrawResetPreview`](../../src/services/klaviyo/klaviyoDrawResetService.ts), which delegates to the existing draw-reset util.

### `GET /v1/klaviyo/draw-reset-progress`
Tier `read`; required permission `overview.view`.

Response: `null` when no manual sync is running on the answering process, otherwise `{ isRunning, total, processed, synced, errors, currentUserEmail?, startTime? }`. Sourced from in-process state inside the draw-reset util (see G2 in [gotchas.md](./gotchas.md) for the multi-instance caveat — a different Lambda will see `null`).

## Roadmap (registered but not yet wired)

The [classification registry](../../src/lib/internal-norm/classification.ts) has ~100 additional entries spanning admin domains (A/B testing, affiliates, allowlist, charge-past-due, error reports, mini draws, monthly coupons, promos, users, winners, etc.). They show up in the admin Endpoints tab with a `wired: false` flag but are NOT exposed via `/v1/manifest` — Norm cannot discover or call them until each gets a `responseSchema` + route file. See [patterns.md](./patterns.md) for the recipe.

## Admin-side support endpoints

These live under `/api/admin/internal-norm/*` (regular admin session auth, not Norm auth) and back the admin UI:

- `GET /api/admin/internal-norm/audit` — paginated `NormCallLog` browse with filters
- `GET /api/admin/internal-norm/endpoints` — registry view with `normHasPermission` + `disabled` flags
- `PATCH /api/admin/internal-norm/endpoints/:key` — kill switch toggle
- `GET /api/admin/internal-norm/pending` — pending-actions queue
- `POST /api/admin/internal-norm/pending/:id` — approve or deny
