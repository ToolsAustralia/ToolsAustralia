# Internal "Norm" API — Design

**Status:** Draft, pending implementation
**Author:** DJ + Claude
**Date:** 2026-05-20
**Worktree branch:** `agent-admin-apis`

## Purpose

Expose this codebase's admin data and (eventually) admin actions to "Norm", an external OpenClaw AI assistant running on a Mac mini server, via a dedicated, secure, scalable HTTP namespace under `/api/internal/norm/v1/*`.

Norm is operated only by site owners. The goal is for Norm to be able to answer questions like "how's ROAS today?", "how many active subs?", "what failed renewals happened this week?" and — over time — to safely take owner-confirmed actions ("retry this past-due invoice", "end this promo", "send this Klaviyo blast"). The framework must let new endpoints be added in minutes, not days, while preventing classes of mistakes that come from giving an LLM direct write access to a production business system.

This spec ships:
1. The **framework** (auth, audit, rate-limit, dry-run/confirm flow, manifest, kill switches)
2. The **classification matrix** that names a tier for every existing `/api/admin/**` endpoint — the roadmap
3. The **first two domains' read endpoints** end-to-end: ROAS and Dashboard Stats
4. The **admin UI** for observing Norm's activity and approving high-risk queued actions
5. **Documentation** under `docs/internal-norm/` plus README.md / BUSINESS.md updates

Out of scope for this spec (future work, separate specs):
- Any write or trigger endpoint implementations (only the framework + classification matrix entries for them)
- Norm-side code (Norm's tools fetcher, Norm's prompt, Norm's config) — that lives in the Mac mini repo
- A static-IP / Vercel WAF allowlist as a defense layer — can be added later without breaking the framework

## Key decisions (log)

| # | Decision | Why |
|---|---|---|
| 1 | Norm's authority ceiling = **read + low-risk writes + confirmed triggers** (with separate Norm-confirm and human-approve sub-tiers for triggers) | DJ wants Norm to be useful for action, not just analytics. But triggers must never be one-call from Norm. |
| 2 | Spec ships framework + full classification matrix + first 2 domains (ROAS, Dashboard Stats), not all domains in one go | "Don't overengineer" — five focused phases over a six-week mega-spec. Validates the framework on pure-read domains before introducing write/trigger surface. |
| 3 | Auth = **bearer token + HMAC-signed request + replay guard**, NOT bearer-only and NOT IP-based | Defense in depth. Two independent secrets, replay protection, no infra dependencies on dynamic IPs. Battle-tested pattern (Stripe webhooks, AWS SigV4). |
| 4 | First domains = ROAS + Dashboard Stats, both pure-read | Validates the read path of the framework end-to-end without write/trigger risk. Highest immediate utility for Norm. |
| 5 | Safety model = **4 tiers** (`read` / `write_safe` / `trigger_norm_confirm` / `trigger_human_approve`) — orthogonal to the permission catalog (see decision 11). "Forbidden" is not a tier; an endpoint is unreachable to Norm if it's absent from the registry, or registered with a `requiredPermission` Norm's Role doesn't hold. | Fine-grained control over the orchestration shape, separated from authorization. |
| 6 | Norm is a `userType: "staff"` User row with a dedicated "Norm" `Role`, `serviceAccount: true` — see decision 10 for the full story | The legacy `role: "norm"` idea from earlier drafts is dropped — the `role` field is being phased out. The new model puts Norm under the same governance as human staff, manageable via Settings → Roles. |
| 7 | `trigger_human_approve` queues to an admin UI page; **no Slack/email push** | DJ is the only Norm operator. When DJ asks Norm to do something high-risk, DJ knows to go approve it. Push notifications would be noise. |
| 8 | Targeted refactor of dashboard + facebook-ads route handlers into services as part of this spec | The handlers are already too fat per the layering rule. Extracting them gives Norm a clean call site AND guarantees identical numbers vs the admin dashboard. Not unrelated refactoring — it's required for correctness. |
| 9 | Phasing = 5 phases (framework → ROAS → Dashboard Stats → matrix + admin UI → docs) | Each phase is shippable independently and produces a user-visible win. |
| 10 | **Norm integrates with the new RBAC** (merged from `feature/user-roles`): Norm is a `userType: "staff"` user with `roleId` pointing to a dedicated "Norm" Role | Maximum alignment with the new permission system. Owner manages Norm's authority from the existing Settings → Roles UI — no code change to grant or revoke a Norm capability. |
| 11 | Tier model and Permission catalog are **orthogonal axes**: permission answers "allowed at all?"; tier answers "what confirmation shape?" | Cleaner separation. Permissions reuse the org-wide catalog; tiers only encode the orchestration flow. The "forbidden" tier from the original draft is dropped — "forbidden" = "permission not in Norm's Role". |
| 12 | Owner grants Norm permissions via Settings → Roles UI; implementer never auto-grants in code | Every new Norm capability is an explicit owner decision. The Endpoints admin tab makes the granted/not-granted state visible per endpoint. |

## Architecture

### Namespace and URL conventions

All Norm endpoints live under `/api/internal/norm/v1/*`. The `v1` version segment lets us add `v2` side-by-side later without breaking Norm.

URL patterns Norm can pattern-match:

| Tier | Pattern | Example |
|---|---|---|
| `read` | `GET …/v1/{domain}/{noun}` | `GET /v1/roas/summary` |
| `write_safe` | `POST …/v1/{domain}/{verb}` | `POST /v1/error-reports/acknowledge` |
| `trigger_norm_confirm` | `POST …/v1/{domain}/{verb}/dry-run` then `POST …/v1/{domain}/{verb}/confirm` | `POST /v1/charge-past-due/retry-one/dry-run` |
| `trigger_human_approve` | Same two-step shape but `…/confirm` queues instead of executes | `POST /v1/klaviyo/blast/confirm` |

Framework endpoints (mandatory):
- `GET /v1/health` — liveness + signing-secret validation (Norm pings on startup)
- `GET /v1/manifest` — full tools manifest (Norm fetches on startup to discover capabilities)

### Auth model

Every request to `/api/internal/norm/v1/*` must carry:

- `Authorization: Bearer <NORM_BEARER_TOKEN>` — long-lived bearer (rotate quarterly)
- `X-Norm-Timestamp: <unix_ms>` — request time
- `X-Norm-Nonce: <128-bit hex>` — unique per request
- `X-Norm-Signature: <hex(HMAC-SHA256(NORM_SIGNING_SECRET, signing_string))>` — request signature

Where `signing_string` is the canonical concatenation:
```
method + "\n" + path + "\n" + sortedQuery + "\n" + sha256(rawBody) + "\n" + timestamp + "\n" + nonce
```

Server rejects if:
- Bearer missing/invalid → `401`
- Timestamp older than 30s OR more than 30s in the future → `401` (clock skew bound)
- Nonce already seen in last 5 minutes → `401` (replay guard, in-memory or Redis-backed)
- Signature doesn't match → `401`
- Path not in the classification registry → `404`
- Endpoint's `disabled` flag is true → `503`
- Rate limit exceeded for this tier or this endpoint's per-day cap → `429` with `Retry-After`

Env vars:
- `NORM_BEARER_TOKEN` — long-lived, single value, rotate quarterly
- `NORM_SIGNING_SECRET` — separate from bearer; rotate independently

Two independent secrets means a single leaked credential is recoverable: rotate the leaked one without touching the other.

### Identity model

Norm is represented in MongoDB as a single dedicated `User` document **plus** a dedicated `Role` document, both seeded by one idempotent migration:

**Norm `User`:**
- `email`: `norm@internal.toolsaustralia.com.au` (synthetic, never receives mail)
- `firstName: "Norm"`, `lastName: "(AI Assistant)"`
- `userType`: `"staff"` — slots Norm under the new RBAC system alongside human staff
- `roleId`: ObjectId of the seeded "Norm" Role (below)
- `serviceAccount`: `true` — new boolean field on `User`. The admin UI's user list and the Settings → Staff list filter `serviceAccount: true` out by default so Norm doesn't show up as a clickable team member.
- `role` (the legacy `"user" | "admin"` field): left at the default `"user"`. The legacy bridge in `requirePermission` doesn't apply to Norm because Norm has `userType: "staff"`, not the absence of `userType`.

**Norm `Role`:**
- `name`: `"Norm"`
- `color`: `"#2563eb"` (any distinct hex)
- `permissions`: initially `["facebookAds.view", "overview.view"]` — just enough for ROAS + Dashboard Stats. Owner edits this from Settings → Roles to grant additional capabilities later.
- `isSystem`: `true` — prevents accidental deletion/rename from the admin UI
- `createdBy`: `null`

**Why this is the right shape under the new RBAC:**
- Existing services that reference `adminUserId` (charge runs, promo audit, error-report acknowledgement) attribute Norm naturally — `userType: "staff"` is a valid internal user.
- Owner can grant or revoke a permission from the **existing** Settings → Roles UI; no code change, no redeploy.
- When the owner edits the Norm Role, `User.tokenVersion` bumping applies to JWT users — Norm has no JWT, but `withNorm` re-loads Norm's permission set with a 30-second cache, so the effect is the same: revocations take effect within seconds.
- The seeded Admin role is **not** reused — Norm explicitly does NOT bypass permission checks via `userType: "admin"`. Norm is governed by explicit permissions only.

### Tier model

The tier model and the permission catalog are **orthogonal axes**:
- **Permission** (from [src/lib/permissions.ts](src/lib/permissions.ts)) answers: *is Norm allowed to call this endpoint at all?* Enforced by `withNorm`'s permission-check step against Norm's Role.
- **Tier** answers: *what orchestration shape does the call use?* (Single call / two-step Norm-confirm / two-step human-approve.)

| Tier | What it allows | Examples |
|---|---|---|
| `read` | Pure GETs. Idempotent. No mutation. | ROAS summary, dashboard stats, error report list, user lookup. |
| `write_safe` | Single-call POST/PATCH that affects at most one record, has no money/comms side-effects, and is reversible. | Acknowledge an error report, tag a user, add an internal note. |
| `trigger_norm_confirm` | Two-step: `…/dry-run` + `…/confirm`. Receipt-bound. Norm can self-execute. | Retry ONE specific past-due invoice, end a specific promo, downgrade ONE specific user. |
| `trigger_human_approve` | Two-step shape, but `…/confirm` only queues. Owner must click approve in admin UI to execute. | Klaviyo blast to all users, mass past-due retry run, select major-draw winner, refund > $X. |

**"Forbidden" is not a tier.** An endpoint is effectively forbidden to Norm in either of two ways:
1. The endpoint is never registered (the typed registry simply omits it).
2. The endpoint IS registered with a `requiredPermission`, but the Norm Role does not grant that permission. Calls return 403 from `withNorm`'s permission-check step.

Both the tier and the required permission are declared in the classification registry — one source of truth.

### Trigger protocol (dry-run + confirm)

For `trigger_norm_confirm` and `trigger_human_approve` endpoints:

**Dry-run step.** Norm POSTs to `…/<action>/dry-run` with the same body it would use for the real call. Server:
1. Validates auth + signature normally
2. Runs the underlying admin service in **simulation mode**. Services that don't already support this get a `dryRun: true` parameter added — they compute everything they'd do, return the plan, write nothing.
3. Returns a **receipt**:
    ```ts
    {
      receiptId: "norm_rcpt_<ulid>",            // single-use
      registryKey: "charge-past-due.retry-one",
      tier: "trigger_norm_confirm",
      inputsHash: sha256(canonicalised body),    // binds receipt to exact inputs
      plan: {
        summary: "Retry $12.99 charge for user abc123",
        affectedEntities: [
          { type: "User", id: "abc123" },
          { type: "Invoice", id: "in_xyz" }
        ],
        moneyDelta: { currency: "AUD", amount: 1299 },
        warnings: ["Card last4 4242 was declined 3× in last 30d"]
      },
      expiresAt: now + 5min,
      nonce: "<crypto random>"
    }
    ```
4. Receipt is HMAC-signed with `NORM_SIGNING_SECRET`, persisted to `NormTriggerReceipt` collection with a 5-minute TTL index.

**Confirm step (`trigger_norm_confirm`).** Norm POSTs to `…/<action>/confirm` with `{ receiptId, originalBody }`. Server:
1. Validates auth + signature
2. Looks up receipt by ID — if missing, expired, or already used → `409 Conflict`
3. Recomputes `inputsHash` from `originalBody` — if it doesn't match the stored hash → `409` (Norm cannot mutate inputs between steps)
4. Atomically marks the receipt `used: true` (Mongo `findOneAndUpdate` with `used: false` filter — single-use guarantee even under concurrent calls)
5. Calls the underlying admin service for real (no `dryRun` flag)
6. Writes both `NormCallLog` rows (dry-run and confirm) with `confirmedFromReceiptId` linking them

**Confirm step (`trigger_human_approve`).** Same as above through step 4, but instead of executing immediately:
- Server writes a `NormPendingAction` document containing the receipt, original body, Norm's optional `reasonText`, and `status: "pending"`
- Returns `202 Accepted` with the pending-action ID
- A badge appears on `/admin/internal-norm/pending` showing the unresolved count
- Owner reviews the plan in the admin UI and clicks approve or deny
  - Approve → service runs; `NormPendingAction.status = "approved"`; outcome written to `NormCallLog`
  - Deny → `status = "denied"` with optional denial reason; no service call
- Norm receives the resolution by polling `GET /v1/pending-actions/<id>/status` (or via an optional webhook, future)

### Rate limits

Per-tier rate limits, keyed by signing-key ID (currently always Norm's key). Reuses existing `createRateLimiter` factory.

| Tier | Per minute | Per day (hard cap) |
|---|---|---|
| `read` | 120 | 20,000 |
| `write_safe` | 30 | 1,000 |
| `trigger_norm_confirm` dry-run | 20 | 500 |
| `trigger_norm_confirm` confirm | 10 | 200 |
| `trigger_human_approve` queue | 10 | 100 |
| **All tiers combined** | 200 | — |

Each endpoint can also declare a per-endpoint override in the registry (e.g. `roas.summary` may want 10/min instead of 120/min because Facebook's API rate-limits us upstream). The router takes the minimum of tier and per-endpoint caps.

### Audit (`NormCallLog`)

Every Norm call writes exactly one `NormCallLog` document:

```ts
{
  _id, requestId,
  registryKey: "roas.summary",
  tier: "read",
  method: "GET",
  path: "/api/internal/norm/v1/roas/summary",
  queryHash: "<sha256>",          // hash by default; full query only for read_pii (if/when added)
  bodyHash: "<sha256>",           // hash by default
  ip, userAgent,
  signatureValid: true,
  rateLimitState: { remaining: 119, limit: 120 },
  permissionChecked: "facebookAds.view",   // the route's requiredPermission
  permissionGranted: true,                 // whether Norm's Role had it at request time
  tierContext: {
    dryRunReceiptId?: string,
    confirmedFromReceiptId?: string,
    pendingActionId?: string,
    humanApproverId?: ObjectId    // populated when trigger_human_approve resolves
  },
  responseStatus: 200,
  durationMs: 42,
  responseHash: "<sha256>",       // sha256 of body; body itself NOT stored by default
  errorCode?: string,              // populated on non-2xx
  createdAt: Date
}
```

- Index on `createdAt` (TTL = 90 days)
- Index on `(registryKey, createdAt)` for the audit UI
- A future `read_pii` tier would override the default and store full request + response

### Scalability mechanisms

The framework is built so adding a new Norm endpoint is a 10-minute job:

1. **Typed registry as the single source of truth.** `src/lib/internal-norm/classification.ts` declares every endpoint:
    ```ts
    export const NORM_ENDPOINTS = {
      "roas.summary": {
        tier: "read",
        requiredPermission: "facebookAds.view",  // from src/lib/permissions.ts catalog
        path: "/v1/roas/summary",
        method: "GET",
        summary: "Facebook ad spend, ROAS, profit for a date range",
        rateLimit: { perMinute: 10 },             // optional override
        responseSchema: NormRoasSummarySchema,    // Zod
      },
      // ...every other endpoint
    } as const satisfies Record<string, NormEndpointSpec>;
    ```
    Boot-time checks:
    - Router refuses to start if a route file exists with no matching registry entry, OR a registry entry has no route file. Drift impossible.
    - Every entry's `requiredPermission` must be a valid permission from `PERMISSIONS` (the org-wide catalog) — typo in a permission string fails the build.

2. **`withNorm()` HOF wraps every handler.**
    ```ts
    export const GET = withNorm("read", "roas.summary", async (ctx) => {
      const result = await facebookAdsInsightsService.getInsights(ctx.input);
      return ctx.ok(NormRoasSummarySchema, result);
    });
    ```
    `withNorm` runs in this order:
    1. **Auth** (bearer + HMAC + replay) — 401 on failure
    2. **Permission check** — load Norm's User → resolve `roleId` → fetch `Role.permissions` (30s in-memory cache, invalidated on `User.tokenVersion` bump) → reject 403 if the route's `requiredPermission` is not in the set
    3. **Kill switch** — 503 if disabled
    4. **Rate limit** — 429 if exceeded
    5. **Handler** — or dry-run / confirm orchestration for trigger tiers
    6. **Audit log** — record everything including `permissionChecked` and `permissionGranted`
    7. **Response schema validation** — 500 if handler returned a shape that fails Zod
    The handler body is the only thing that varies per endpoint.

3. **Reuse existing admin services — never duplicate.** A custom ESLint rule (`internal-norm/must-import-service`) requires every file under `src/app/api/internal/norm/**` to include at least one `import` from `@/services/**`. Doesn't prove the import is *used*, but is a strong tripwire against copy-pasting service logic into route files. Numbers stay identical to the admin dashboard by construction.

4. **Auto-generated tools manifest.** `build:norm-manifest` walks the registry and emits `src/generated/normToolsManifest.json` with each endpoint's tier, path, method, summary, input schema, output schema. Both `GET /v1/manifest` and the docs page serve from this file. **Adding an endpoint to the registry auto-publishes it to Norm. Zero manual sync.**

5. **Per-endpoint kill switch.** Endpoint-disable state lives in a Mongo `NormEndpointSettings` document (one row per registry key, on-demand upsert) — toggleable from the admin UI with no redeploy. `withNorm` consults this on every request (with a 30s in-memory cache) and returns `503` for disabled keys. A `NORM_DISABLED_REGISTRY_KEYS` env var (comma-separated) acts as a deployment-level override that wins over the DB state — useful for emergency disable without DB access.

6. **Folder layout mirrors `src/app/api/admin/`.** When the admin endpoint is `api/admin/dashboard/stats/route.ts`, the Norm wrapper is `api/internal/norm/v1/dashboard/stats/route.ts`. Trivial to find the pair.

7. **`NormCallLog` is generic.** New endpoints get audit for free — no schema change.

## Domains shipped in this spec

### Domain 1 — ROAS

**Refactor first:**
- New service `src/services/facebook-ads/FacebookAdsInsightsService.ts` exposing `getInsights({ dateRange, level, startDate?, endDate? })`
- Move the body of [src/app/api/admin/facebook-ads/insights/route.ts](src/app/api/admin/facebook-ads/insights/route.ts) into the service. The admin route shrinks to ~15 lines: **the existing `requirePermission("facebookAds.view")` guard at line 49 stays**, followed by query parse + service call + return. The extracted service has NO auth check of its own — the guard at the route layer is what protects the admin path.
- New utility `src/utils/admin/resolveNormDateRange.ts` accepting `today | yesterday | current-draw | last-draw | all-time | custom` and resolving draw-based ranges server-side (currently the frontend resolves them to `custom` before calling — for Norm we resolve server-side so Norm doesn't need to know draw dates)

**Norm endpoints:** Both `tier: "read"`, both `requiredPermission: "facebookAds.view"`.

`GET /v1/roas/summary?dateRange=<>`
Response (Zod-validated):
```ts
{
  dateRange: { range: "today" | …, start: ISO, end: ISO },
  spend: number,           // dollars
  revenue: number,         // dollars
  profit: number,          // dollars
  roas: number,            // ratio (revenue/spend)
  conversions: number,
  impressions: number,
  clicks: number,
  ctr: number,             // percent
  cpc: number              // dollars
}
```

`GET /v1/roas/breakdown?dateRange=<>&level=campaign|adset|ad`
Same summary block plus a `breakdown: Array<{ id, name, spend, revenue, roas, conversions, impressions, clicks, ctr, cpc }>` keyed by `level`.

### Domain 2 — Dashboard Stats

**Refactor first:**
- New service `src/services/admin/DashboardStatsService.ts` exposing `getStats({ dateRange, startDate?, endDate? })`
- Move the orchestration body of [src/app/api/admin/dashboard/stats/route.ts](src/app/api/admin/dashboard/stats/route.ts) into the service. The admin route shrinks: **the existing `requirePermission("overview.view")` guard at line 34 stays**, followed by query parse + service call + return. The extracted service has NO auth check of its own.
- Reuses already-clean sub-services: `readStatsForRange`, `DashboardMetricsService`, `MembershipAnalyticsService`, `trendCalculationService`

**Norm endpoints:** Both `tier: "read"`, both `requiredPermission: "overview.view"`.

`GET /v1/dashboard/stats?dateRange=<>`
Response is a **clean projection** of the admin response — no internal-only fields:
```ts
{
  dateRange: { range, start, end },
  users: {
    total: number, activeSubscriptions: number, newInRange: number,
    cancelledMemberships: number, totalScheduledCancellation: number,
    dropOffRate: number, periodChurnRate: number | null,
    membershipRenewals: { expectedInRange, succeededInRange, failedInvoicesInRange, becamePastDueInRange }
  },
  revenue: { total: number, breakdown: { membershipPurchase, membershipRenewal, oneTimePurchase, additionalOneTimePurchase, miniDraw, upsell } },
  majorDraw: { totalEntries: number, activeDraws: number },
  conversionRate: number,
  facebookAds: { spend: number, roas: number }
}
```
**Deliberately omitted** from the Norm projection: trends (Norm can compute deltas itself if needed), `enhanced` block, `snapshotMissingForStanding`, `profileCompletionRate`, `cancellationImpact.estimatedMonthlyRevenue`. Reduces noise for the AI consumer and stops Norm from being affected by internal-only fields churning.

`GET /v1/dashboard/revenue-breakdown?dateRange=<>`
Tier: `read`. Just the revenue breakdown, sliced more verbosely so Norm can answer narrow questions ("renewals revenue last week?") without parsing the bigger stats blob.

## Phasing

Each phase is independently shippable and produces a user-visible win.

### Phase 1 — Framework foundation

- Migration: idempotent script (`scripts/migrations/2026-05-20-create-norm-user-and-role.ts`) that upserts BOTH:
  1. The `"Norm"` `Role` with initial `permissions: ["facebookAds.view", "overview.view"]`, `color: "#2563eb"`, `isSystem: true`
  2. The Norm `User` row with `email: "norm@internal.toolsaustralia.com.au"`, `userType: "staff"`, `roleId: <Norm role id>`, `serviceAccount: true`
  Safe to re-run.
- New models: `NormCallLog`, `NormTriggerReceipt`, `NormPendingAction`
- Auth lib: `src/lib/internal-norm/auth.ts` (bearer + HMAC + replay guard with nonce cache)
- `src/lib/internal-norm/permissions.ts` — loads Norm User → Role → permission set with 30s cache; exposes `getNormPermissions()` and a small `hasPermission(perm)` helper
- `src/lib/internal-norm/withNorm.ts` HOF (auth, **permission check**, kill switch, rate-limit, audit, error mapping, dry-run/confirm orchestration)
- `src/lib/internal-norm/classification.ts` — empty registry + types
- `src/lib/internal-norm/schemas/` — empty
- `scripts/build-norm-manifest.ts` + npm script `build:norm-manifest`
- Endpoints: `GET /v1/health`, `GET /v1/manifest`
- Env vars: `NORM_BEARER_TOKEN`, `NORM_SIGNING_SECRET`, `NORM_DISABLED_REGISTRY_KEYS` (comma-separated)
- Tests: end-to-end auth (good token + good signature → 200; bad bearer → 401; replayed nonce → 401; clock skew > 30s → 401; etc.)
- **Win:** Norm can hit `/v1/health` and `/v1/manifest` from the Mac mini; auth flow is proven; no business data exposed yet.

### Phase 2 — ROAS domain

- Refactor: extract `FacebookAdsInsightsService` from the admin route
- Add `resolveNormDateRange()` utility supporting all six range values
- Zod schemas: `NormRoasSummarySchema`, `NormRoasBreakdownSchema`
- Registry entries: `roas.summary`, `roas.breakdown`
- Route files: `src/app/api/internal/norm/v1/roas/summary/route.ts`, `…/v1/roas/breakdown/route.ts`
- Tests: numbers match the admin route for the same date range; bad date range params rejected; schema validation rejects responses with missing fields
- **Win:** Norm can answer ROAS questions — same numbers the admin dashboard shows.

### Phase 3 — Dashboard Stats domain

- Refactor: extract `DashboardStatsService` from the admin route (larger of the two extractions)
- Zod schemas: `NormDashboardStatsSchema`, `NormRevenueBreakdownSchema`
- Registry entries: `dashboard.stats`, `dashboard.revenue-breakdown`
- Route files
- Tests: numbers match the admin route; the omitted-fields projection is exactly as designed (no leakage of `enhanced`, `snapshotMissingForStanding`, etc.)
- **Win:** Norm can answer business-state questions — revenue, members, churn, draws.

### Phase 4 — Classification matrix + admin UI

- Fill `classification.ts` with **every** existing admin endpoint. Each entry declares both `tier` (`read` / `write_safe` / `trigger_norm_confirm` / `trigger_human_approve`) AND `requiredPermission` (from the org-wide catalog in [src/lib/permissions.ts](src/lib/permissions.ts)). For endpoints already calling `requirePermission(...)`, copy the same permission string. For the ~15 admin endpoints still on legacy `requireAdminUser`, pick the most sensible catalog entry (usually the area's `.view` for GETs or `.edit`/`.delete` for mutating ones) and flag the entry with a `legacyAdminCheck: true` marker for follow-up.
- New admin pages:
  - `/admin/internal-norm/audit` — `NormCallLog` browser with filters by tier / registry key / status / time / `permissionChecked`; per-row "view full request/response hash"; per-endpoint kill-switch toggle
  - `/admin/internal-norm/endpoints` — every registry entry with three columns: `requiredPermission`, `norm-role-grants-it?` (✓/✗ with a link to Settings → Roles → Norm), and `disabled?` toggle
  - `/admin/internal-norm/pending` — `NormPendingAction` queue; one-click approve/deny with optional reason; shows the receipt's plan exactly as Norm saw it
- Admin nav badge: count of pending actions
- **Norm Role management itself is delegated to the existing Settings → Roles UI — no new screens for that.**
- Tests: kill-switch flips an endpoint to 503 within one request cycle; revoking a permission from the Norm Role causes the next request to that endpoint to return 403; approve actually executes the underlying service; deny doesn't
- **Win:** full observability; canonical roadmap for future Norm endpoints exists in code; trigger_human_approve flow is ready even though no triggers are wired up yet; permission grants visible at a glance.

### Phase 5 — Documentation + manifest sync

- New `docs/internal-norm/` domain folder with standard 8-doc structure: `README.md`, `architecture.md`, `api.md`, `backend.md`, `frontend.md`, `models.md`, `patterns.md`, `rules.md`, `gotchas.md`, `testing.md`
- New entry in CLAUDE.md Domain Manifest:
    ```json
    "internal-norm": {
      "docs": "docs/internal-norm/",
      "paths": [
        "src/lib/internal-norm/**",
        "src/app/api/internal/norm/**",
        "src/services/facebook-ads/**",
        "src/services/admin/DashboardStatsService.ts",
        "src/models/NormCallLog.ts",
        "src/models/NormTriggerReceipt.ts",
        "src/models/NormPendingAction.ts",
        "src/app/admin/internal-norm/**",
        "scripts/build-norm-manifest.ts",
        "src/generated/normToolsManifest.json"
      ]
    }
    ```
- Update `README.md` — add "Internal Norm API (admin AI assistant integration)" under "Live" platform features
- Update `BUSINESS.md` — add the same to whichever section it currently lists internal/operational systems
- **Win:** code, docs, and business status are in sync; future contributors can extend the framework safely.

## Models — schema sketches

### `NormCallLog`

```ts
{
  _id: ObjectId,
  requestId: string,                // ULID, also returned in response headers
  registryKey: string,
  tier: "read" | "write_safe" | "trigger_norm_confirm" | "trigger_human_approve",
  method: string,
  path: string,
  queryHash: string,
  bodyHash: string,
  ip: string,
  userAgent: string,
  signatureValid: boolean,
  rateLimitState: { remaining: number, limit: number, windowMs: number },
  permissionChecked: string,        // e.g. "facebookAds.view"
  permissionGranted: boolean,       // whether Norm's Role had it at request time
  tierContext: {
    dryRunReceiptId?: string,
    confirmedFromReceiptId?: string,
    pendingActionId?: ObjectId,
    humanApproverId?: ObjectId
  },
  responseStatus: number,
  durationMs: number,
  responseHash: string,
  errorCode?: string,
  createdAt: Date                   // TTL 90 days
}
```

### `NormTriggerReceipt`

```ts
{
  _id: ObjectId,
  receiptId: string,                // norm_rcpt_<ulid>
  registryKey: string,
  inputsHash: string,
  plan: {
    summary: string,
    affectedEntities: Array<{ type: string, id: string }>,
    moneyDelta?: { currency: string, amount: number },   // cents
    warnings: string[]
  },
  signature: string,                // HMAC of canonicalised receipt
  used: boolean,                    // atomic flip on confirm
  usedAt?: Date,
  expiresAt: Date,                  // TTL index = expiresAt
  createdAt: Date
}
```

### `NormPendingAction`

```ts
{
  _id: ObjectId,
  receiptId: string,
  registryKey: string,
  originalBody: object,             // stored in full so approve can re-run service
  plan: object,                     // copy of the receipt's plan for the UI
  reasonText?: string,              // optional context Norm passed
  status: "pending" | "approved" | "denied" | "expired",
  resolvedAt?: Date,
  resolvedBy?: ObjectId,
  resolutionNote?: string,
  resolutionOutcome?: { ok: boolean, errorCode?: string },
  createdAt: Date,
  expiresAt: Date                   // TTL = createdAt + 24h
}
```

## Open questions / explicit defer

None blocking. Things deliberately deferred:

- **Static IP / Vercel WAF allowlist** as an extra defense layer — orthogonal to this spec, can be added later without breaking the framework
- **A second signing key for read-only audits** (e.g. a SOC-2 auditor's own Norm key) — out of scope for this spec
- **Webhook callback to Norm when a `trigger_human_approve` resolves** — Norm can poll for now; webhook can be added later
- **`read_pii` tier** — not needed yet; the 5-tier model has room for it later if we ever expose user contact details

## Security checklist

- [ ] Bearer + signing secret are **separate** env vars, generated independently, not committed
- [ ] HMAC uses constant-time comparison (`crypto.timingSafeEqual`)
- [ ] Nonce dedup window is at least 2× the clock-skew tolerance
- [ ] `dryRun: true` flow path on existing services is covered by tests — must never write under any code path
- [ ] Receipt `used` flip is atomic (Mongo `findOneAndUpdate` filter on `used: false`)
- [ ] Kill switch returns 503 within one request (no stale-cache window)
- [ ] `NormCallLog` writes are best-effort and never block the response — failure to log is logged separately, not propagated
- [ ] Norm `User` has `userType: "staff"` (NOT `"admin"`); the super-admin bypass in `requirePermission` does NOT apply to Norm
- [ ] Norm Role name is `"Norm"`, `isSystem: true`, holds ONLY the permissions explicitly granted by the owner
- [ ] `withNorm`'s permission-check step runs BEFORE handler invocation; 403 audited
- [ ] Every registry entry's `requiredPermission` is validated against `PERMISSIONS` at boot
- [ ] Response Zod validation catches schema drift before it reaches Norm

## Conventions inherited from the codebase

- Strict layering: `app → services → repositories/lib → models`. Norm endpoints obey this.
- Zod for validation at the API boundary (input + output).
- Mongo connection via `src/lib/mongodb.ts` only.
- `console.error` (not `console.log`) for any log line that must survive production / staging.
- Docs live under `docs/<domain>/` per the Domain Manifest. The Norm domain folder is created in Phase 5.
- README.md / BUSINESS.md updated in the same task when business-level facts change (Phase 5).
