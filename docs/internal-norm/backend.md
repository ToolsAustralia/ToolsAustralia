# Internal Norm — Backend

## Registry — single source of truth

[src/lib/internal-norm/classification.ts](../../src/lib/internal-norm/classification.ts) is the only place that declares "what Norm can call". Each entry:

```ts
"roas.summary": {
  tier: "read",
  requiredPermission: "facebookAds.view",   // catalog entry in @/lib/permissions
  path: "/v1/roas/summary",
  method: "GET",
  summary: "...",
  rateLimit: { perMinute: 10 },             // optional per-endpoint override
  responseSchema: NormRoasSummarySchema,    // presence = "wired"
}
```

**Boot-time validation:** the module's top-level `for` loop throws if any entry's `requiredPermission` isn't in the org-wide `PERMISSIONS` set ([src/lib/permissions.ts](../../src/lib/permissions.ts)). Typos fail the build, not at runtime.

**Wired vs roadmap:** `getWiredEndpoints()` filters to entries that have a `responseSchema`. Only wired entries appear in `/v1/manifest` — Norm cannot discover roadmap-only entries. The admin Endpoints tab shows both with a `wired` boolean.

**Intentionally omitted** (so Norm can never reach them — see comments at top of `classification.ts`): `/api/admin/roles/*`, `/api/admin/staff/*`, `/api/admin/sync-klaviyo-profiles`.

## Manifest pipeline

`npm run build:norm-manifest` ([scripts/build-norm-manifest.ts](../../scripts/build-norm-manifest.ts)) walks the registry, calls `zod-to-json-schema` on each request/response schema, and writes [src/generated/normToolsManifest.json](../../src/generated/normToolsManifest.json). This runs automatically in `prebuild` and `predev` (see `package.json`) alongside the upsell + landing manifests, so any registry edit is reflected on the next dev or deploy.

`GET /v1/manifest` reads from the generated file. Adding a new wired endpoint to the registry auto-publishes it to Norm. Zero manual sync.

## `withNorm` HOF

[src/lib/internal-norm/withNorm.ts](../../src/lib/internal-norm/withNorm.ts) is the only entry point a route file should use. See [architecture.md](./architecture.md#withnorm-orchestration-order) for step order. Key points:

- The handler receives a `NormCtx` with `ctx.ok(data)` (validates against `responseSchema` before serialising) and `ctx.error(status, code, message, details?)`.
- `ctx.url` is a parsed `URL` for query reading; `ctx.request` is the raw `Request` if you need headers/body.
- A registry-vs-route tier mismatch logs `console.error` but doesn't block — the wrapper trusts the route's declared tier for the request, the warning is for diagnosis.

## Permissions check

[src/lib/internal-norm/permissions.ts](../../src/lib/internal-norm/permissions.ts) exposes `getNormPermissions()` and `hasNormPermission(perm)`. It loads the Norm User (matched by `email: "norm@internal.toolsaustralia.com.au"`), resolves `roleId` → `Role.permissions`, and caches the set for **30 seconds in-process**. When the owner edits the Norm Role in Settings → Roles, revocations take effect within ~30s on every Vercel instance.

## Kill switch

Two layers, both consulted on every request via a 30s cache:

1. **Env override** — `NORM_DISABLED_REGISTRY_KEYS` comma-separated list. Wins over the DB. Useful for emergency disable without DB access.
2. **Mongo per-key flag** — [NormEndpointSettings](./models.md#normendpointsettings) doc with `disabled: true`. Toggleable from the admin Endpoints tab with no redeploy.

A disabled endpoint returns `503 { code: "disabled" }`.

## Rate limits

[src/lib/internal-norm/rateLimits.ts](../../src/lib/internal-norm/rateLimits.ts) keys by `(tier, registryKey, clientKey)` and stacks two windows — per-minute and per-day — via the shared `createRateLimiter` factory. The router takes the **minimum** of the tier cap and any per-endpoint override:

| Tier | per minute | per day |
|---|---:|---:|
| `read` | 120 | 20,000 |
| `write_safe` | 30 | 1,000 |
| `trigger_norm_confirm` | 20 | 500 |
| `trigger_human_approve` | 10 | 100 |

`roas.summary` and `roas.breakdown` set `perEndpointPerMinute: 10` because Facebook's Marketing API rate-limits us upstream. A 429 always includes `Retry-After`.

## Audit — `NormCallLog`

[src/lib/internal-norm/audit.ts](../../src/lib/internal-norm/audit.ts) writes exactly one [NormCallLog](./models.md#normcalllog) row per call. `beginAudit` runs before the handler (captures request shape + permission outcome); `endAudit` patches in `responseStatus`, `durationMs`, `responseHash`, and `errorCode`. Bodies are **never** stored — only sha256 hashes. The collection has a TTL index of 90 days on `createdAt`.

Audit writes are best-effort. A Mongo failure inside `beginAudit` / `endAudit` is logged via `console.error` and does **not** block the response — the security checklist requires this so an audit-log outage cannot DoS Norm.

## Where the business logic lives

Route files under `src/app/api/internal/norm/v1/**` are **thin**: parse query → call a service → `ctx.ok(serviceResult)`. The work happens in the services Norm shares with the admin UI:

- ROAS: `FacebookAdsInsightsService` ([src/services/facebook-ads/](../../src/services/facebook-ads/))
- Dashboard: `DashboardStatsService` ([src/services/admin/DashboardStatsService.ts](../../src/services/admin/DashboardStatsService.ts)) — **shared service, so its output shape can grow without Norm asking.** The `/v1/dashboard/stats` route defends against that by **explicitly picking** each field it forwards (never spreading the upstream object), and `NormDashboardStatsSchema` is a non-strict Zod object, so new upstream fields are stripped rather than tripping the runtime `responseSchema` validation. **Keep it that way** — a spread here would turn every future admin-side addition into an unreviewed Norm disclosure and a potential 500. Most recent example: the 2026-07-24 `signups` / `platformRevenue` / `platformRoas` additions to `attributedRevenue` reached Norm not at all, by design (see [norm-context.md](./norm-context.md) for the note + the deliberate not-yet-mirrored flag).
- Submissions inbox: `getUnviewedSubmissionsCount` ([src/services/admin/submissionsCountService.ts](../../src/services/admin/submissionsCountService.ts)) — extracted from the admin route during wiring so both the admin GET and the Norm route call the same code.
- Cancellation flow: `getCancellationFlowAnalytics` ([src/services/admin/cancellationFlowAnalytics.ts](../../src/services/admin/cancellationFlowAnalytics.ts)) — already a service; route just builds the AEST-aware window from optional `startDate`/`endDate`.
- Upsell config: `getUpsellMultiplierConfig` ([src/services/upsell/UpsellMultiplierResolver.ts](../../src/services/upsell/UpsellMultiplierResolver.ts)) — added alongside the existing `getAllUpsellMultipliers` to include the `updatedAt` timestamp.
- Klaviyo draw reset: `getKlaviyoDrawResetPreview` / `getKlaviyoDrawResetProgress` ([src/services/klaviyo/klaviyoDrawResetService.ts](../../src/services/klaviyo/klaviyoDrawResetService.ts)) — thin service wrapper around the long-standing draw-reset util so the admin and Norm routes share the same import path. The util itself stays under `src/utils/integrations/klaviyo/` because cron and migrations also import it.
- Date ranges: `resolveNormDateRange` ([src/utils/admin/resolveNormDateRange.ts](../../src/utils/admin/resolveNormDateRange.ts)) — resolves draw-based and `all-time` ranges to absolute ISO dates server-side so Norm doesn't need to know draw dates.

This is enforced by the [must-import-service ESLint rule](./rules.md#norm-must-import-service).
