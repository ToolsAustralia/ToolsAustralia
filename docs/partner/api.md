# Partner — API

| Method | Path | Purpose |
|---|---|---|
| _TODO_ | `/api/partner-applications/**` | Partner brand application submission |
| _TODO_ | `/api/partner-discount/**` | Discount catalog reads, eligibility checks |

> _TODO: read [src/app/api/partner-applications/](../../src/app/api/partner-applications/) and [src/app/api/partner-discount/](../../src/app/api/partner-discount/) and document each handler._

## POST /api/partner-discount/sso — MyRewards SSO hand-off (2026-06-24)

Mints a MyRewards/iGoDirect SSO token and returns the portal redirect URL. Identity comes from the NextAuth session (no request body). Thin handler ([route](../../src/app/api/partner-discount/sso/route.ts)); logic in [utils/partner-discounts/sso-access.ts](../../src/utils/partner-discounts/sso-access.ts) + [sso-flow.ts](../../src/utils/partner-discounts/sso-flow.ts).

Flow: `requireSameOrigin` → distributed rate-limit (`partner-discount-sso`, fail-open courtesy cap) → `requireAuthenticatedUserDoc` → **reconcile-then-read** (`reconcilePartnerDiscountAccess`) → **403 if no active access** → `generatePortalSso` signs + POSTs `/generatetoken` → best-effort `PartnerDiscountSsoIssuance` log → `{ success: true, data: { redirectUrl } }`.

Statuses: 401 unauth · 403 no-access / cross-origin · 429 rate · 502 vendor unavailable · 500.

- **`member_level` is intentionally NOT sent yet** — gated on iGoDirect's encoding answer (implementation-plan §5a); the resolved tier is still recorded in the issuance log. One documented line at the `generatePortalSso` call flips it on.
- **PII (owner-approved 2026-06-24):** sends `firstname` / `lastname` / `email` (so the member's portal profile pre-fills) plus the opaque `member_id`. Mobile is not in MyRewards' SSO payload. This makes a **member-deletion / anonymisation API + DPA** a firm vendor ask (implementation-plan §5 #7).
- **Not released to members** until the deprovisioning/re-sync question is resolved (button stays unwired). **Not** an admin route → no Norm mirror.
