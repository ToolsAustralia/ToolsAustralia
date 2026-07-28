# Partner — API

| Method | Path | Purpose |
|---|---|---|
| _TODO_ | `/api/partner-applications/**` | Partner brand application submission |
| _TODO_ | `/api/partner-discount/**` | Discount catalog reads, eligibility checks |

> _TODO: read [src/app/api/partner-applications/](../../src/app/api/partner-applications/) and [src/app/api/partner-discount/](../../src/app/api/partner-discount/) and document each handler._

## POST /api/partner-discount/sso — MyRewards SSO hand-off (2026-06-24)

Mints a MyRewards/iGoDirect SSO token and returns the portal redirect URL. Identity comes from the NextAuth session (no request body). Thin handler ([route](../../src/app/api/partner-discount/sso/route.ts)); logic in [utils/partner-discounts/sso-access.ts](../../src/utils/partner-discounts/sso-access.ts) + [sso-flow.ts](../../src/utils/partner-discounts/sso-flow.ts).

> **Error bodies are customer copy (2026-07-28, panel F-014):** the JSON `error` strings render
> inline under the "Open partner portal" buttons via `usePartnerDiscountSso` — 404 (flag dark) /
> 403 (no active access → points at My Account → Rewards) / 502 / 500 all carry customer-facing
> "partner portal" wording, not API-speak. Write any new error path in that voice (rule 11 +
> BRAND_VOICE).

Flow: `requireSameOrigin` → distributed rate-limit (`partner-discount-sso`, fail-open courtesy cap) → `requireAuthenticatedUserDoc` → **reconcile-then-read** (`reconcilePartnerDiscountAccess`) → **403 if no active access** → `generatePortalSso` signs + POSTs `/generatetoken` → best-effort `PartnerDiscountSsoIssuance` log → `{ success: true, data: { redirectUrl } }`.

Statuses: 401 unauth · 403 no-access / cross-origin · 429 rate · 502 vendor unavailable · 500.

- **`member_level` is intentionally NOT sent yet** — gated on iGoDirect's encoding answer (implementation-plan §5a); the resolved tier is still recorded in the issuance log. One documented line at the `generatePortalSso` call flips it on.
- **PII (owner-approved 2026-06-24):** sends `firstname` / `lastname` / `email` (so the member's portal profile pre-fills) plus the opaque `member_id`. Mobile is not in MyRewards' SSO payload. This makes a **member-deletion / anonymisation API + DPA** a firm vendor ask (implementation-plan §5 #7).
- **GO-LIVE GATE (enforced in code):** the route is **inert in production by default** — returns `404` unless `PARTNER_DISCOUNT_SSO_ENABLED=true` (always on in local dev). So merging to main is safe; flip the flag in Vercel only after the vendor deprovisioning + `member_level` + member-deletion/DPA answers (implementation-plan "Go-live gate"). **Not** an admin route → no Norm mirror.

## GET /api/partner-discount/member-status — iGoDirect live member-status read (2026-07-16)

The vendor-facing read iGoDirect's MyRewards portal calls at **SSO sign-in, page load, and offer redemption** to check a member's live discount access. We are the source of truth; the portal reflects it. Thin handler ([route](../../src/app/api/partner-discount/member-status/route.ts)); pure logic in [utils/partner-discounts/member-status.ts](../../src/utils/partner-discounts/member-status.ts) + the shared [sso-access.ts](../../src/utils/partner-discounts/sso-access.ts) decision. Full brief: [igodirect-member-status-api-plan.md](./igodirect-member-status-api-plan.md); test `npm run test:member-status`.

```
GET /api/partner-discount/member-status?member_id=<User._id>[&event=sign_in|page_load|redeem]
Authorization: Bearer <IGODIRECT_MEMBER_STATUS_KEY>
```

Flow: go-live flag gate → distributed rate-limit (`partner-discount-member-status`, 600/min, fail-open courtesy cap — the bearer is the boundary) → constant-time bearer check (fail-LOUD 500 when the env key is unset, never open) → `member_id` ObjectId validation → `User.findById` → **reconcile-then-read** (`reconcilePartnerDiscountAccess`) → wire shape.

**Contract (FIXED with the vendor; additive-only):** `200 { active, member_level, expires_at }`.
- `member_level`: partner-catalog % (5–100) or `null`; `null` while `active:true` is the fail-closed tier anomaly (logged via `console.error`; vendor treats as minimal access).
- `expires_at`: ISO-8601 UTC — pack window end, or the subscriber's **next renewal date** (rolls forward while subscribed; documented for the vendor so they don't treat it as a hard stop). Past-due members in grace stay `active:true` by design (see [gotchas.md](./gotchas.md) "Past-due interaction").
- A member with no access is `200 { active:false, ... }` — **not** 403; 4xx is reserved for caller errors.

Statuses: `400 invalid_member_id` · `401 unauthorized` · `404 unknown_member` · `429` + `Retry-After` · `503 disabled` (flag off) · `500 server_error`. Every response carries `Cache-Control: no-store` (+ `dynamic = "force-dynamic"`) — accuracy is the whole point; nothing may cache it. `event` is observability-only and never changes the answer.

Env (both registered in `.env.example`): `IGODIRECT_MEMBER_STATUS_KEY` (bearer secret — we mint it, ≥32 random bytes, handed to iGoDirect over a secure channel), `IGODIRECT_MEMBER_STATUS_ENABLED` (go-live gate, 503 in prod unless `true`; always on in local dev). **Not** an admin route → no Norm mirror.
