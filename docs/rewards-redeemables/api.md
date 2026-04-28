# Rewards-Redeemables — API

## Routes

| Method | Path | Purpose |
|---|---|---|
| _TODO_ | `/api/redeemables/**` | List + redeem |
| _TODO_ | `/api/rewards/**` | Public catalog + user-facing reward views |

> _TODO: read [src/app/api/redeemables/](../../src/app/api/redeemables/) and [src/app/api/rewards/](../../src/app/api/rewards/) and document each handler._

## Cross-domain admin routes

Under `/api/admin/**` (in [admin](../admin/)):
- Campaign management (create, run, audit)
- CSV bulk import
- Redemption analytics

## Authorization

- Wallet reads / redemption: authenticated session (NextAuth).
- Public prize catalog: unauthenticated (read-only display).
- Admin campaign tools: admin role check inside handler.
