# Admin — Backend

## Server-only code

[src/server/admin/](../../src/server/admin/):
- `chargePastDueShared.ts` — shared logic for past-due charge retry (used by single + bulk endpoints)
- (other shared admin code)

## Features

[src/features/admin/](../../src/features/admin/) — feature-modular admin code.

## Services

[src/services/admin/](../../src/services/admin/) — admin services (e.g. `membershipAnalyticsPersistence`).

## Routes

[src/app/api/admin/](../../src/app/api/admin/) — extensive route family. Includes:
- User management
- Payment events / refund replay
- Charge past-due (single + bulk)
- Error reports
- Contact submissions
- Partner applications
- Promo management
- Affiliate management
- Draw management
- Analytics dashboards

> _TODO: enumerate the exact subdirectories under api/admin/ and document each._

## Auth pattern

Every handler:
```ts
const session = await getServerSession(authOptions);
const adminCheck = requireAdmin(session);
if (adminCheck) return adminCheck; // 401/403
// ... admin work
```
