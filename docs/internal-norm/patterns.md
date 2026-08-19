# Internal Norm — Patterns

## P1. The 10-minute recipe for a new Norm endpoint

Goal: wire an existing admin service to a new Norm route. The framework does auth, permission, kill switch, rate limit, audit, and schema validation — you only write a schema, a registry line, and a thin route.

### 1. Pick the underlying admin service

The route MUST delegate to a service under `src/services/**`. If the admin endpoint is still doing work in `route.ts`, extract it first (see [P3](#p3-extract-fat-admin-handlers-before-wrapping)). The corresponding admin route's `requirePermission(...)` permission is the one Norm should require — copy it verbatim.

### 2. Add the Zod response schema

Create or extend the matching file in [src/lib/internal-norm/schemas/](../../src/lib/internal-norm/schemas/) (one file per domain — `roas.ts`, `dashboard.ts`, etc.). The schema is the **contract** with Norm — be conservative about what you expose. Strip internal-only fields, trends, debugging blocks. Reuse `NormDateRangeSchema` from `common.ts` for date-range responses.

### 3. Add the registry entry

In [classification.ts](../../src/lib/internal-norm/classification.ts), add a new key to `NORM_ENDPOINTS`:

```ts
"users.recover-past-due-invoice.preview": {
  tier: "read",
  requiredPermission: "users.charge",        // must exist in PERMISSIONS catalog
  path: "/v1/users/:id/recover-past-due-invoice",
  method: "GET",
  summary: "Preview past-due invoice recovery for a user",
  responseSchema: NormRecoverInvoicePreviewSchema,  // presence = wired
  rateLimit: { perMinute: 30 },              // optional, only if you need a tighter cap
}
```

The module's boot-time loop validates `requiredPermission` against the org catalog — a typo throws at module load (build time, not request time).

### 4. Create the route file

Mirror the admin route's folder path under `src/app/api/internal/norm/v1/`. Keep the body to ~20 lines:

```ts
import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormRecoverInvoicePreviewSchema } from "@/lib/internal-norm/schemas/users";
import { previewRecoverPastDueInvoice } from "@/services/billing/recoverPastDueInvoice";

const QuerySchema = z.object({ userId: z.string() });

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "users.recover-past-due-invoice.preview",
    requiredPermission: "users.charge",
    responseSchema: NormRecoverInvoicePreviewSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams));
    if (!parsed.success) return ctx.error(400, "bad_query", "Invalid", parsed.error.issues);
    const result = await previewRecoverPastDueInvoice(parsed.data.userId);
    return ctx.ok(result);
  },
);
```

The `must-import-service` ESLint rule will refuse to lint a route file with no `@/services/**` import — copy-pasted business logic doesn't get past `npm run lint`.

### 5. Regenerate the manifest

```
npm run build:norm-manifest
```

This rewrites [src/generated/normToolsManifest.json](../../src/generated/normToolsManifest.json). It also runs automatically in `predev` / `prebuild`. The new entry now appears in `GET /v1/manifest` (visible to Norm) and in the admin Endpoints tab.

### 6. Grant the permission to Norm's Role

Open **Settings → Roles → Norm** and tick the permission. Until you do, calls return 403 with `code: "permission_denied"` and the audit log records `permissionChecked: "users.charge"`, `permissionGranted: false`. (The owner is the only one who can grant — implementer never auto-grants in code.)

### 7. Smoke

```
npm run norm:smoke -- GET /api/internal/norm/v1/users/abc123/recover-past-due-invoice
```

You should see `200` with the schema-validated payload. The `requestId` in the response matches a fresh row in the `NormCallLog` collection.

### 8. Update `norm-context.md` ← required, not optional

Add a new endpoint section to [norm-context.md](./norm-context.md) following the existing structure:
- **Returns**: the response shape with field meanings, units, and what's NOT included
- **Inputs**: query/body params as a table
- **Data source**: which service / Mongo collection / upstream API the data comes from
- **Constraints**: tier, required permission, rate limit, side effects (none, for reads)
- **Sample**: literal request + response example

**Authoring principle — describe the tool, not the use case.** Do NOT write "use this when the operator asks X" or "best for questions about Y". That pattern trains pattern-matching instead of reasoning, and ages badly when more endpoints share overlapping data. Let Norm decide when to call based on capability vs operator intent — the same way Anthropic/OpenAI tool descriptions are written. The only "when" guidance that belongs in this file is protocol facts (e.g. "don't poll status speculatively — only after queueing an action").

Also update the "Data domains overview" section at the top if this endpoint adds a new domain or meaningfully overlaps with an existing one (describe the overlap neutrally — "endpoint A returns a subset of endpoint B" — not "if you need X, call A").

Bump the "Last updated" date at the bottom. Then re-feed the file into Norm's context.

## P2. Trigger endpoints — dry-run + confirm

For `trigger_norm_confirm` and `trigger_human_approve` tiers, the recipe is the same but you ship two routes (`…/dry-run`, `…/confirm`) and the underlying service must accept `dryRun: true` (which makes it compute the plan and write nothing). The wrapper handles receipt creation, single-use enforcement, and (for `trigger_human_approve`) queue insertion. The handler stays thin — just call the service with the appropriate `dryRun` flag.

If the service doesn't yet support `dryRun`, add it to the service first (`if (dryRun) return planOnly(...)`) — do NOT branch in the route file.

## P3. Extract fat admin handlers before wrapping

Several admin routes still have business logic inline in `route.ts`. Before wiring a Norm wrapper around them, **extract first**:

1. Create or open the corresponding service under `src/services/<domain>/`.
2. Move the body into a new function. Take args, return the result. **No `Request`/`NextResponse` types in the service** — keep it framework-agnostic.
3. Shrink the admin route to: keep the existing `requirePermission(...)` guard at the top, then `parse query → call service → return json`. The admin route's auth check stays where it is.
4. Confirm the admin route still returns the identical shape (the Norm projection may be a subset — that's fine, the Zod schema enforces the projection).
5. Now write the Norm route from step 4 of P1, importing the same service. By construction, the numbers match.

This is how `FacebookAdsInsightsService` ([src/services/facebook-ads/](../../src/services/facebook-ads/)) and `DashboardStatsService` ([src/services/admin/DashboardStatsService.ts](../../src/services/admin/DashboardStatsService.ts)) came to exist — they were inlined in the admin routes until Phase 2/3 of this domain.

## Brand performance mirror (2026-08-19)

`analytics.brand-performance` → `/v1/analytics/brand-performance` wraps `BrandPerformanceService` — the same service the admin Overview card uses, per the mirror-the-service rule. No aggregation is re-implemented, so the two surfaces cannot drift.

**Projection.** Brand rows carry no identity: they are brands, not people. The only identity-adjacent field is a per-category `userCount`, a DISTINCT count with no ids attached, so the projection is the full service payload minus two things:

- `canonicalUrlsByPlatform` — ad-platform plumbing for the admin drill-down, useless to Norm and needless surface area.
- per-row `comparison` — would double the payload for a consumer that can simply request the other window. `meta.comparison` still names the window used.

**Verified live** (`npm run norm:smoke`, all four variants 200 OK against production data): a schema↔output mismatch is a runtime 500 invisible to `tsc`, so this endpoint was smoke-tested on every `basis` (`landing-page` / `built-prize` / `platform`), both lanes, and with `compare=previous-calendar-month`.

⚠️ Two things a Norm consumer must read before interpreting a row: `meta.lane` (Milwaukee is a member of BOTH lanes and means a different population in each) and `meta.toolboxSpendModel` + `meta.toolboxMixVisitors` (toolbox spend on bare toolset pages is modelled, sometimes from a very small visitor sample).
