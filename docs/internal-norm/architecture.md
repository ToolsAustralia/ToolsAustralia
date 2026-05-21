# Internal Norm — Architecture

## Position in the stack

A thin wrapper layer over the existing admin services. Norm is a `userType: "staff"` User with a dedicated **"Norm" Role** governed by the same RBAC catalog as human staff ([src/lib/permissions.ts](../../src/lib/permissions.ts)). The owner grants or revokes Norm capabilities from **Settings → Roles → Norm** — no code change.

Norm endpoints live under `/api/internal/norm/v1/*`. The `v1` segment exists so a `v2` can ship side-by-side later. Folder layout mirrors `/api/admin/*` (admin `dashboard/stats/route.ts` ↔ Norm `internal/norm/v1/dashboard/stats/route.ts`) so the pair is trivial to find.

## Tier model

The tier and the permission are **orthogonal axes** — permission answers *is Norm allowed at all?* (enforced by `withNorm`'s permission step against the Norm Role); tier answers *what orchestration shape?* (single call vs two-step dry-run+confirm vs queued).

| Tier | Shape | Examples |
|---|---|---|
| `read` | Pure GET, idempotent, no mutation | ROAS summary, dashboard stats, error report list |
| `write_safe` | Single-call POST/PATCH; one record; reversible; no money / comms | Acknowledge error report, tag user |
| `trigger_norm_confirm` | `…/dry-run` then `…/confirm` — Norm self-executes after receipt | Retry ONE past-due invoice, end a specific promo |
| `trigger_human_approve` | Same two-step shape but `…/confirm` only queues; owner approves in admin UI | Klaviyo blast, bulk past-due retry, select major-draw winner |

"Forbidden" is **not** a tier — an endpoint is unreachable either by being absent from the registry, or by being registered with a `requiredPermission` Norm's Role doesn't hold (returns 403).

## `withNorm` orchestration order

Every Norm route handler is wrapped in [withNorm()](../../src/lib/internal-norm/withNorm.ts). The wrapper runs these steps in order, short-circuiting on the first failure:

1. **Auth** — bearer + HMAC + replay guard. 401 on any failure.
2. **Permission check** — load Norm User → resolve `roleId` → fetch `Role.permissions` (30s in-memory cache). 403 if missing, audited.
3. **Kill switch** — `NormEndpointSettings.disabled` check (30s cache). 503 if disabled.
4. **Rate limit** — tier + per-endpoint caps via shared `createRateLimiter`. 429 + `Retry-After`.
5. **Handler** — runs with a `NormCtx` exposing `ctx.ok(data)` and `ctx.error(status, code, msg)`.
6. **Audit log** — `NormCallLog` row with `requestId`, hashes (not bodies), `permissionChecked`, `permissionGranted`, `responseStatus`, `durationMs`.
7. **Response schema validation** — `ctx.ok(data)` runs `responseSchema.safeParse(data)`; 500 on schema drift before Norm ever sees the bad payload.

The handler body is the only thing that varies per endpoint. Everything else is uniform.

## Auth chain (ASCII)

```
Norm (Mac mini)
  │
  │  Authorization: Bearer <NORM_BEARER_TOKEN>
  │  X-Norm-Timestamp: <unix_ms>
  │  X-Norm-Nonce:     <128-bit hex>
  │  X-Norm-Signature: hex(HMAC-SHA256(secret, signing_string))
  │
  │  signing_string =
  │    method "\n" path "\n" sortedQuery "\n"
  │    sha256(rawBody) "\n" timestamp "\n" nonce
  ▼
┌─────────────────────────────────────────────┐
│ verifyNormRequest (auth.ts)                 │
│  ├─ bearer matches NORM_BEARER_TOKEN?       │ no → 401 bad-bearer
│  ├─ timestamp within ±30s?                  │ no → 401 stale-timestamp
│  ├─ nonce unseen in last 5min?              │ no → 401 replay
│  └─ HMAC matches?                           │ no → 401 bad-signature
└─────────────────────────────────────────────┘
  │ ok
  ▼
┌─────────────────────────────────────────────┐
│ hasNormPermission(requiredPermission)       │ no → 403 permission_denied
└─────────────────────────────────────────────┘  (Settings → Roles → Norm
  │ ok                                            grants the permission)
  ▼
┌─────────────────────────────────────────────┐
│ isEndpointDisabled(registryKey)             │ yes → 503 disabled
└─────────────────────────────────────────────┘  (env override or Mongo flag)
  │ ok
  ▼
┌─────────────────────────────────────────────┐
│ checkNormRateLimit(tier, registryKey)       │ over → 429 rate_limited
└─────────────────────────────────────────────┘
  │ ok
  ▼
  handler(ctx) → ctx.ok(data) → schema.safeParse → 200 { success, data, requestId }
  │
  ▼
  NormCallLog row written (best-effort, non-blocking)
```

Two independent secrets (`NORM_BEARER_TOKEN`, `NORM_SIGNING_SECRET`) means a single leaked credential is recoverable by rotating just that one.

## Trigger protocol (dry-run + confirm)

For the two trigger tiers, the orchestration is the same shape:

1. **Dry-run** — same body as the real call. Service runs in `dryRun: true` mode, writes nothing, returns a **plan** (summary, affected entities, money delta, warnings). Server persists a `NormTriggerReceipt` with `inputsHash`, HMAC signature, and a 5-minute TTL.
2. **Confirm** — Norm POSTs `{ receiptId, originalBody }`. Server atomically flips `used: true` (Mongo `findOneAndUpdate` with `used: false` filter — single-use guarantee even under concurrent retries) and either:
   - `trigger_norm_confirm` → executes the service immediately
   - `trigger_human_approve` → writes a `NormPendingAction`, returns 202; owner approves/denies in the admin UI

Mutating `originalBody` between dry-run and confirm produces a hash mismatch → 409. Norm cannot smuggle different inputs through a stale receipt.
