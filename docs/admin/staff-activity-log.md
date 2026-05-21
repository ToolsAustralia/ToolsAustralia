# Staff Activity Log

> **Status:** Design approved 2026-05-20 — see [docs/superpowers/specs/2026-05-20-staff-activity-logging-design.md](../superpowers/specs/2026-05-20-staff-activity-logging-design.md). Implementation pending. This document is the living reference and will be filled in section-by-section as code lands.

The Staff Activity Log is the audit trail of every mutation made by staff or admin users in the admin panel. It's the answer to "who changed this?" and "is anyone trying to do things they shouldn't?".

## What it is

A separate audit trail from the existing customer-event aggregator at `/api/admin/activity-log`. The customer aggregator answers "what's happening on the site?" — the staff log answers "what is the admin team doing inside the admin?".

Captures:
- Every successful mutation (200 / 201) — who did what, when, against which resource.
- Every blocked attempt (403) — useful for spotting privilege drift or social-engineering attempts.

Does not capture (held back from Phase 1 — see [spec](../superpowers/specs/2026-05-20-staff-activity-logging-design.md#held-back-from-phase-1-with-rationale)):
- Read traffic (opening user profiles, viewing dashboards).
- Before/after field diffs on mutations.
- IP address / user agent.
- Validation errors (400) or server errors (500).

## Where it lives in the UI

- **Top-level page:** `/admin/staff-activity`. Sidebar group: **Audit** (last group, below Team). Filter by actor, action, status, date range. Infinite scroll. 403 rows carry a red ⚠️ badge.
- **Per-user embed:** the **Activity** tab inside `UserDetailModal` shows only rows where `resourceType = "User"` and `resourceId` matches that user — quick forensic shortcut when investigating a single account.

## Permission gating

The new `audit.view` permission gates both surfaces:

| Permission | Grants |
|---|---|
| `audit.view` | Opens `/admin/staff-activity`. Reveals the Activity tab inside `UserDetailModal`. |

Super-admin (`userType: "admin"`) bypasses the permission check via the standard super-admin bypass — they always see the log without needing to grant `audit.view` to the Admin role. Custom roles opt in by toggling `audit.view` in the role editor.

The audit log itself is **immutable** by design — there's no `audit.edit` or `audit.delete` permission in Phase 1. The Mongo TTL index is the only deletion path (180 days).

## How rows get written

Mutation route handlers swap `requirePermission(...)` for `requirePermissionWithAudit(...)` from `src/lib/audit-log.ts`. The helper:

1. Runs the same permission check.
2. Returns a `log(status)` closure the handler calls after success.
3. On a 403, the helper writes the forbidden row itself before returning the `NextResponse`.

Writes are **awaited but best-effort** — a `try/catch` around `StaffActivity.create()` ensures Mongo hiccups never break the user-facing action.

**Which routes are instrumented?** Every admin mutation route (~50 handlers in Phase 1). View / list routes stay on plain `requirePermission` and do not write to the log. See `docs/admin/staff-permissions-mapping.md` — every row marked POST / PATCH / PUT / DELETE in the admin section goes through `requirePermissionWithAudit`.

## Row shape

Stored in the `StaffActivity` Mongo collection (`src/models/StaffActivity.ts`):

| Field | Type | Notes |
|---|---|---|
| `actorId` | ObjectId → User | Who did it |
| `actorEmail` | string (snapshot) | Survives user deletion |
| `actorRoleName` | string (snapshot) | Survives role rename / delete |
| `action` | string | Permission string, e.g. `"users.charge"` |
| `method` | enum | GET / POST / PATCH / PUT / DELETE |
| `path` | string | Pathname only, e.g. `/api/admin/users/abc/charge-past-due` |
| `resourceType` | string? | Mongoose model name when applicable: `"User"`, `"Role"`, `"Promo"`, etc. |
| `resourceId` | string? | Mongo `_id` of the affected resource when known |
| `status` | number | 200, 201, or 403 |
| `timestamp` | Date | TTL field — rows auto-delete after 180 days |

Snapshotting `actorEmail` and `actorRoleName` is deliberate. When a staff member is removed or a role is renamed, historical rows still read `"maya@example.com (Customer Support)"`. Without snapshots, deletions would corrupt the audit history.

## API

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/admin/staff-activity` | `audit.view` | Cursor-paginated list with filters |

Query params: `actorId`, `action`, `status`, `resourceType`, `resourceId`, `from`, `to`, `cursor`, `limit` (default 25, max 100).

The GET endpoint itself does NOT log to the audit collection (reads aren't audited in Phase 1). It uses plain `requirePermission("audit.view")`, not `requirePermissionWithAudit`.

## Retention

180 days, enforced by a Mongo TTL index on `timestamp`. Mongo prunes expired rows in the background; there's no application code involved. To change the window: edit the `expireAfterSeconds` value in `src/models/StaffActivity.ts` and either drop + recreate the index manually or run `db.staffactivities.dropIndex("timestamp_1")` so Mongoose re-creates it on next connect.

## Smoke checklist

See [docs/auth/rbac-smoke-checklist.md](../auth/rbac-smoke-checklist.md) for the manual checklist that exercises the feature end-to-end (Admin happy path, Customer Support forbidden attempt, embedded per-user view, sidebar gating).

## What's held back from Phase 1

The spec explains every deferral in detail at [docs/superpowers/specs/2026-05-20-staff-activity-logging-design.md#held-back-from-phase-1-with-rationale](../superpowers/specs/2026-05-20-staff-activity-logging-design.md#held-back-from-phase-1-with-rationale). Headlines:

- No before/after diffs on changes.
- No IP / user-agent capture.
- No logging of customer-data reads.
- No N-row expansion for bulk operations (one row per call, not per affected id).
- No alerting on 403 spikes.
- No embedded Activity tab in `AffiliateDetailModal` / `ExperimentDetailModal` / draws — `UserDetailModal` only.
- Allowlist routes still use the legacy `requireAdminUser` helper and aren't audit-instrumented yet.
- No CSV export, no on-demand purge endpoint, no configurable retention.

## Future work checklist

Mirror of the spec's [future work checklist](../superpowers/specs/2026-05-20-staff-activity-logging-design.md#future-work-checklist). When picking one up, update both lists with the PR link.

- [ ] Capture before/after diffs (`StaffActivity.changes`)
- [ ] Capture IP + user-agent on each row
- [ ] Optional read logging (`audit.logReads`)
- [ ] Embedded Activity tab in `AffiliateDetailModal`
- [ ] Embedded Activity tab in `ExperimentDetailModal`
- [ ] Embedded Activity tab in `MajorDraw` + `MiniDraw` detail surfaces
- [ ] N-row expansion (or `metadata.resourceIds`) for bulk operations
- [ ] Migrate `requireAdminUser` allowlist routes into the audit pipeline
- [ ] Suspicious-pattern alerts (403 spikes by actor)
- [ ] Configurable retention via env var
- [ ] Full-text search across actor + resource names
- [ ] CSV export (gated by new `audit.export`)
- [ ] On-demand purge (gated by new `audit.delete`, GDPR rationale)

## Related docs

- [permissions-catalog.md](../auth/permissions-catalog.md) — `audit` area + `audit.view` entry
- [roles.md](../auth/roles.md) — RBAC overview, force-restart behavior
- [staff-permissions-mapping.md](./staff-permissions-mapping.md) — route → permission map (every mutation row also writes to the audit log)
- [admin-layout.md](./admin-layout.md) — sidebar grouping, including the Audit group
