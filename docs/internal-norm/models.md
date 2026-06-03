# Internal Norm — Models

Four collections back the Norm framework. All sit in their own collection (no shared keyspace with admin data) and each has a TTL or unique-key invariant that the framework relies on.

## `NormCallLog`

[src/models/NormCallLog.ts](../../src/models/NormCallLog.ts). One row per `withNorm`-handled request — including 401 / 403 / 503 / 429 rejections — written best-effort and never blocking the response.

```ts
{
  requestId: string,                  // ULID, also returned to the caller
  registryKey: string,                // e.g. "roas.summary"
  tier: "read" | "write_safe" | "trigger_norm_confirm" | "trigger_human_approve",
  method: string, path: string,
  queryHash: string, bodyHash: string,
  ip: string, userAgent: string,
  signatureValid: boolean,
  rateLimitState: { remaining, limit, windowMs },
  permissionChecked: string,          // route's requiredPermission
  permissionGranted: boolean,         // had Norm's Role granted it at request time?
  tierContext: {
    dryRunReceiptId?, confirmedFromReceiptId?,
    pendingActionId?, humanApproverId?,
  },
  responseStatus: number, durationMs: number,
  responseHash: string, errorCode?: string,
  createdAt: Date,                    // TTL 90 days
}
```

Indexes: `requestId`, `registryKey`, `(registryKey, createdAt -1)`, `(responseStatus, createdAt -1)`. Bodies are NEVER stored — only sha256 hashes — so the collection cannot leak PII even when Norm hits `users.*` endpoints.

## `NormTriggerReceipt`

[src/models/NormTriggerReceipt.ts](../../src/models/NormTriggerReceipt.ts). The single-use ticket issued by a dry-run that authorises a corresponding confirm.

```ts
{
  receiptId: string,                  // "norm_rcpt_<ulid>", unique
  registryKey: string,
  inputsHash: string,                 // sha256(canonicalised dry-run body)
  plan: {
    summary: string,
    affectedEntities: Array<{ type, id }>,
    moneyDelta?: { currency, amount },  // amount in CENTS
    warnings: string[],
  },
  signature: string,                  // HMAC of canonicalised receipt
  used: boolean,                      // atomic flip on confirm
  usedAt?: Date,
  expiresAt: Date,                    // TTL = expiresAt (now + 5 min)
  createdAt: Date,
}
```

Confirm step uses `findOneAndUpdate({ receiptId, used: false }, { $set: { used: true } })` — the atomic filter+update guarantees single-use even under concurrent retries. Hash mismatch between the receipt's `inputsHash` and the confirm's body → 409 (Norm cannot smuggle different inputs).

## `NormPendingAction`

[src/models/NormPendingAction.ts](../../src/models/NormPendingAction.ts). The queue for `trigger_human_approve` actions awaiting owner approval.

```ts
{
  receiptId: string,
  registryKey: string,
  originalBody: Mixed,                // stored in full so approve can re-run the service
  plan: Mixed,                        // copy of the receipt's plan for the UI
  reasonText?: string,                // optional context Norm passed
  status: "pending" | "approved" | "denied" | "expired",
  resolvedAt?: Date,
  resolvedBy?: ObjectId,              // the approving admin User
  resolutionNote?: string,
  resolutionOutcome?: { ok, errorCode },
  createdAt: Date,
  expiresAt: Date,                    // TTL = createdAt + 24h
}
```

Indexes: `receiptId`, `registryKey`, `status`, `createdAt`. Norm polls `GET /v1/pending-actions/:id/status` to learn the resolution.

## `NormEndpointSettings`

[src/models/NormEndpointSettings.ts](../../src/models/NormEndpointSettings.ts). One row per registry key (on-demand upsert), used only for the kill switch.

```ts
{
  registryKey: string,                // unique
  disabled: boolean,                  // default false
  updatedBy?: ObjectId,               // admin User who flipped it
  updatedAt: Date,
}
```

`withNorm` consults this on every request with a 30s cache, but the cache is invalidated on write so a flip takes effect within one request cycle. The env var `NORM_DISABLED_REGISTRY_KEYS` (comma-separated) acts as a deployment-level override that wins over the DB — handy for emergency disable without DB access.

## Reuses, not new

Norm does **not** introduce a new User schema — Norm is a regular `User` row (`userType: "staff"`, `serviceAccount: true`, `roleId` → the "Norm" `Role`). The seeding migration is [scripts/migrations/2026-05-20-create-norm-user-and-role.ts](../../scripts/migrations/2026-05-20-create-norm-user-and-role.ts) and is idempotent (`npm run migrate:create-norm`).
