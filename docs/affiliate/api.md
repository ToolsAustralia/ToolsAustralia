# Affiliate — API

| Method | Path | Purpose |
|---|---|---|
| _TODO_ | `/api/affiliate/**` | Affiliate auth, dashboard data, link management |

> _TODO: read [src/app/api/affiliate/](../../src/app/api/affiliate/) and document each handler._

## Authorization

Affiliate routes use the affiliate-specific auth (`affiliate-auth.ts`), NOT the main NextAuth member session. Don't mix the two — they have different access models.

## Admin reads (paired with Norm)

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/admin/affiliate/list` | Paged + searchable affiliate list with unpaid-commission rollups | `requirePermission("affiliates.view")` |
| GET | `/api/admin/affiliate/[id]` | Affiliate detail: header, commission ledger, payouts, referred users | `requirePermission("affiliates.view")` |
| GET | `/api/internal/norm/v1/affiliate` | Norm projection of the list (PII-safe: omits `email`/`phone`/`bankDetails`) | Norm bearer + signature, `affiliates.view` on Norm role |
| GET | `/api/internal/norm/v1/affiliate/[id]` | Norm projection of the detail (PII-safe — referred users + processing admin collapse to opaque User._id) | Norm bearer + signature, `affiliates.view` on Norm role |

Both Norm routes wrap `listAffiliates` / `getAffiliateDetail` from [src/services/affiliate/AffiliateAdminListService.ts](../../src/services/affiliate/AffiliateAdminListService.ts) — the same code the admin routes call — so per-row numbers cannot diverge. See [docs/internal-norm/norm-context.md](../internal-norm/norm-context.md) for the response schema and PII redaction policy.
