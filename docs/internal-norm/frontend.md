# Internal Norm — Frontend

The Norm-facing surface has no public frontend — Norm calls the API from the Mac mini. The admin UI for **observing** Norm and **approving** queued actions lives under the **Team → Norm** entry in `AdminPage.tsx`, with three sub-tabs.

Implementation: [src/app/admin/component/internal-norm/](../../src/app/admin/component/internal-norm/) (`AuditLogTab.tsx`, `EndpointsTab.tsx`, `PendingActionsTab.tsx`).

## Audit tab

[AuditLogTab.tsx](../../src/app/admin/component/internal-norm/AuditLogTab.tsx) — paginated browser of [NormCallLog](./models.md#normcalllog) rows. Cursor-paginated against `GET /api/admin/internal-norm/audit`. Columns: `createdAt`, `tier`, `registryKey`, `method`, `path`, `responseStatus`, `durationMs`, `requestId`. Use this to:

- See exactly which endpoints Norm has hit today (and at what rate)
- Spot 403s — those mean the Norm Role is missing a permission. The `permissionChecked` / `permissionGranted` fields tell you which one.
- Spot 503s — kill switch was flipped, or `NORM_DISABLED_REGISTRY_KEYS` includes the key.
- Match a Norm-side error to a server-side log via `requestId` (ULID).

Bodies are never stored — only `queryHash` / `bodyHash` / `responseHash` — so the audit cannot leak PII even on a `users.*` endpoint.

## Endpoints tab

[EndpointsTab.tsx](../../src/app/admin/component/internal-norm/EndpointsTab.tsx) — the full classification matrix from [classification.ts](../../src/lib/internal-norm/classification.ts), fetched via `GET /api/admin/internal-norm/endpoints`. Each row shows:

- `registryKey`, `tier`, `path`, `method`, `summary`
- `requiredPermission` (link out to **Settings → Roles → Norm** when missing)
- `normHasPermission` — ✓ or ✗ based on the live Norm Role
- `wired` — does a real route file exist? (Roadmap-only entries are listed but cannot be called.)
- `disabled` — kill switch toggle, writes through to `NormEndpointSettings`
- `legacyAdminCheck` — flag for the ~15 entries whose underlying admin route still uses `requireAdminUser` (follow-up to migrate to `requirePermission`)

The kill switch toggle calls `PATCH /api/admin/internal-norm/endpoints/:key` and takes effect within one request cycle (the 30s cache is bypassed on writes).

## Pending tab

[PendingActionsTab.tsx](../../src/app/admin/component/internal-norm/PendingActionsTab.tsx) — the queue for `trigger_human_approve` actions Norm has submitted. Each card shows the receipt's `plan` (summary, affected entities, money delta, warnings) exactly as Norm saw it during the dry-run, plus Norm's optional `reasonText`. Owner clicks **Approve** (runs the underlying service) or **Deny** (with optional reason). A small badge on the tab title shows the unresolved count.

## Norm Role management

Editing the Norm Role's permission set (adding `facebookAds.view`, removing `users.export`, etc.) happens in the existing **Settings → Roles** UI alongside human staff roles — no dedicated screen. Revocations propagate within ~30s due to the in-process permission cache.
