# Error Reporting — API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/error-reports/` | Client-side error reporting |
| GET | `/api/admin/error-reports/` | Admin triage list + analytics |
| PATCH | `/api/admin/error-reports/[id]/` | Update status / admin notes |
| PATCH / DELETE | `/api/admin/error-reports/bulk-delete/` | Bulk status update / archive |
| GET | `/api/internal/norm/v1/error-reports` | Norm: paged list (PII-redacted projection of admin list) |
| GET | `/api/internal/norm/v1/error-reports/{id}` | Norm: single-row detail (PII-redacted) |

Both Norm endpoints delegate to `ErrorReportQueryService` so admin and Norm row counts agree by construction. Norm strips email, stack traces, console dumps, hashed IP, browser fingerprint, and referrer; see [internal-norm/norm-context.md](../internal-norm/norm-context.md) for the full projection contract.

## GET `/api/admin/error-reports` — filter query params

| Param | Type | Behaviour |
|---|---|---|
| `status` | `new` \| `investigating` \| `resolved` \| `dismissed` | Exact match. |
| `category` | `payment` \| `network` \| `api` \| `system` \| `recovery` \| `missing` | Exact match, or rows with no category. |
| `severity` | `critical` \| `high` \| `medium` \| `missing` | Exact match, or rows with no severity. |
| `userEmail` | string | Case-insensitive regex against `userEmail` OR `guestEmail`. |
| `autoLogged` | `true` \| `false` | Filters by source. |
| `apiEndpoint` | string | Case-insensitive regex against `apiEndpoint`. The **API** column. |
| `pageUrl` | string | Case-insensitive regex against `route` OR `currentUrl`. The **Page URL** column. |
| `startDate`, `endDate` | ISO date | Inclusive range on `createdAt`. |
| `search` | string | Free-text regex across message, name, notes, endpoints, URLs, emails. |
| `includeArchived` | `true` | Include rows with `archivedAt` set. |
| `userId` | ObjectId | Exact user filter. |

The split between `apiEndpoint` and `pageUrl` is intentional — see [gotchas: Page URL vs API endpoint](./gotchas.md#page-url-vs-api-endpoint).
