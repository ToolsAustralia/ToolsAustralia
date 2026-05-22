# Internal Norm domain

Secure HTTP namespace at `/api/internal/norm/v1/*` that exposes read-only analytics (and, in time, owner-confirmed actions) to **Norm**, the external OpenClaw AI assistant running on the Mac mini server. Norm is operated only by site owners. The framework lets new endpoints be added in minutes, while keeping write/trigger surface gated by a dry-run + confirm protocol (and, for high-risk operations, a human approve queue in the admin UI).

## Index

- [architecture.md](./architecture.md) — 4-tier model, `withNorm` orchestration order, auth chain
- [api.md](./api.md) — every wired endpoint with request/response examples
- [backend.md](./backend.md) — registry → manifest pipeline, kill switch, rate limits, `NormCallLog`
- [frontend.md](./frontend.md) — Audit, Endpoints, Pending tabs under Team → Norm
- [models.md](./models.md) — `NormCallLog`, `NormTriggerReceipt`, `NormPendingAction`, `NormEndpointSettings`
- [patterns.md](./patterns.md) — the 10-minute recipe for adding a new Norm endpoint
- [rules.md](./rules.md) — must-import-service, registry as source of truth, no business logic in route files
- [gotchas.md](./gotchas.md) — replay vs receipt TTL, signing canonicalisation, AEST timezone, fat-handler refactor pattern, multi-instance nonce cache
- [testing.md](./testing.md) — `npm run norm:smoke` and the `test:norm-*` script family

## Related domains

- **[auth](../auth/)** — Norm is a `userType: "staff"` User row with a dedicated "Norm" `Role`. Permission catalog lives in `src/lib/permissions.ts`.
- **[admin](../admin/)** — the underlying admin services Norm calls (`DashboardStatsService`, etc.) live here.
- **[billing-stripe](../billing-stripe/)** — services Norm wraps for revenue / past-due / payment-events queries.
