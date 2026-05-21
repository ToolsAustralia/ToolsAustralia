# Internal Norm — Rules

## R1. Must-import-service

Every file under `src/app/api/internal/norm/**` MUST contain at least one `import` from `@/services/**`. Enforced by the custom ESLint rule [eslint/rules/norm-must-import-service.js](../../eslint/rules/norm-must-import-service.js), registered via [eslint/rules/index.js](../../eslint/rules/index.js).

This is a strong tripwire against copy-pasting business logic into route files. It doesn't prove the import is *used* — that's deliberate; the rule is a habit-enforcer, not a static analysis. If you genuinely need a route with no service dependency (e.g. `health`), import `@/services/admin/DashboardStatsService` as a type-only import or refactor — don't disable the rule.

The rule exists because the entire **value** of the Norm framework is that numbers match the admin dashboard by construction. If a route file reimplements aggregation, that invariant is dead.

## R2. Registry is the single source of truth

[classification.ts](../../src/lib/internal-norm/classification.ts) is the only place new endpoint metadata is declared. No parallel lists, no per-folder index files, no scattered constants.

- A new endpoint must add an entry there, not just create a route file.
- Editing `path`, `method`, `tier`, `requiredPermission`, or `summary` happens in classification.ts only.
- Removing an endpoint = remove the registry entry AND delete the route file (Norm cannot call orphan routes — the manifest filters wired entries — but leaving an orphan route file confuses humans).

## R3. No business logic in route files

Route files are thin. The standard shape is:

```ts
1. import withNorm + the response schema + the service
2. parse query/body with Zod
3. call the service
4. return ctx.ok(serviceResult)
```

If a route exceeds ~30 lines, refactor — extract the work into a service helper. The layering rule from the top-level CLAUDE.md (`app → services → repositories/lib → models`) applies in full to Norm routes.

## R4. Permissions catalog only

Every `requiredPermission` in the registry MUST be a string from the [PERMISSIONS catalog](../../src/lib/permissions.ts). The module's boot-time loop throws on any missing key — so a typo is a build error, not a runtime 403.

When a new admin capability needs a permission Norm should be able to hold, **add the permission to the catalog first** (with the standard `area.action` shape), grant it in the admin Settings → Roles UI, then reference it from the Norm registry. Never invent a Norm-only permission scheme.

## R5. Schemas at the boundary

`responseSchema` is the contract with Norm. `ctx.ok(data)` runs `safeParse`, and a mismatch returns a 500 with `code: "response_schema_invalid"` to Norm — internal-only fields that leak through the service should be stripped here, not relied on at the consumer.

For request bodies / query strings, validate with a separate Zod schema declared inline in the route file. Reject with `ctx.error(400, "bad_query", ..., parsed.error.issues)`.

## R6. No PII bodies in audit

`NormCallLog` stores `queryHash`, `bodyHash`, `responseHash` — never the bodies themselves. The 90-day TTL is by design. If a future tier ever needs to capture full bodies (e.g. `read_pii` for auditor access), it must be opt-in per-registry-key and gated by a separate permission, not enabled globally.

## R7. Norm permission model: reads open, writes/triggers explicitly granted

Norm's `User.userType` is `"staff"`, not `"admin"`. The super-admin bypass in `requirePermission` does NOT apply to Norm.

- **Read-tier endpoints** (`tier: "read"`) bypass the per-permission grant. Reads are inherently safe (no mutation, no money movement, no external comms), and the PII boundary lives in each endpoint's `responseSchema` projection (e.g. user reads strip email/lastName/mobile at the schema level — gating them by role would be defense-in-depth, not the primary guard). Operator control over reads still comes from three independent mechanisms: (a) registry omission — an endpoint not in `NORM_ENDPOINTS` is unreachable; (b) per-endpoint kill switch in the admin Endpoints tab; (c) tier + per-endpoint rate limits. `requiredPermission` stays in the registry as documentation and is validated against the catalog at boot, but is NOT checked at request time for reads.
- **Write/trigger tiers** (`write_safe`, `trigger_norm_confirm`, `trigger_human_approve`) still require an explicit grant on the Norm Role. Every mutating capability is an owner decision in Settings → Roles → Norm.

The seeding migration grants `facebookAds.view` + `overview.view`. Those grants no longer affect read endpoints (reads are always allowed) but remain the baseline for any future write/trigger endpoints that reference those permissions.

## R8. Two-secret rotation

`NORM_BEARER_TOKEN` and `NORM_SIGNING_SECRET` are independent env vars, generated separately. Quarterly rotation rotates them independently — never share a single secret between bearer and signing.
