# Internal Norm — Gotchas

## G1. Replay nonce TTL ≠ receipt TTL

Two different TTLs, easy to confuse:

- **Nonce cache TTL = 5 minutes** ([auth.ts](../../src/lib/internal-norm/auth.ts)) — set deliberately to be **larger than 2× the clock-skew tolerance** (30s). Within this window, a replayed `X-Norm-Nonce` returns 401 `replay`.
- **Receipt TTL = 5 minutes** ([NormTriggerReceipt.ts](../../src/models/NormTriggerReceipt.ts)) — happens to be the same number but is unrelated. A dry-run receipt must be confirmed within 5 minutes or Mongo's TTL index deletes it (confirm then returns 409). Setting these to coincidentally the same value is fine; don't conflate the mechanism.

## G2. Multi-instance nonce cache caveat

The replay nonce cache is **per-process in-memory** (see the comment in [auth.ts](../../src/lib/internal-norm/auth.ts#L33-L40)). On Vercel — where each Lambda instance and each region has its own cache — a replayed request that lands on a *different* instance within the 30s clock-skew window would NOT be rejected.

Why this is acceptable today: low volume (single Norm operator), and forging a replay requires possession of **both** the bearer and the signing secret — so a successful replay is no different from an attacker who already has full credentials. If Norm's volume grows or the threat model widens, back the cache with Redis or Mongo (single source of truth across instances) and remove the in-memory map.

## G3. Signing-string canonicalisation pitfalls

The signing string is six lines joined by `\n`:

```
method + "\n" + path + "\n" + sortedQuery + "\n" + sha256(rawBody) + "\n" + timestamp + "\n" + nonce
```

Easy mistakes:
- **path** is `url.pathname` only — no host, no scheme, no query string. The query is its own line.
- **sortedQuery** must NOT include the leading `?`. The smoke client uses `url.search.replace(/^\?/, "")` — match it.
- **rawBody** is the exact request body bytes. GET / HEAD send `""`. JSON bodies must be hashed *before* any reformatting — if you re-serialise on the client, the hash diverges and the signature fails.
- Both sides hash with `sha256`. The body sha is what goes into the signing string — never the raw body.

Off-by-a-newline = 401 `bad-signature`. The smoke script is the reference implementation.

## G4. AEST timezone for draw-based ranges

[resolveNormDateRange](../../src/utils/admin/resolveNormDateRange.ts) resolves `today`, `yesterday`, `current-draw`, `last-draw`, `all-time` server-side **in AEST** (using `date-fns-tz`). Norm sends a logical range token, not absolute dates, so it never needs to know the draw cadence (27th of month per BUSINESS.md) or DST transitions. If you add a new range value, add it to BOTH the registry's query-schema enum AND `resolveNormDateRange` — otherwise the route returns 400 before the resolver runs.

The DST-edge regression scripts under [scripts/test-dst-transitions.ts](../../scripts/test-dst-transitions.ts) cover date-sensitive billing; the same `date-fns-tz` discipline applies here.

## G5. Fat-handler refactor pattern — extract first, shrink second

Wiring Norm around a route that still has business logic in `route.ts` will violate `must-import-service` AND make the "numbers match the admin dashboard" invariant unverifiable. Do NOT bypass by stubbing an import.

The correct pattern:
1. Extract the body to a new function under `src/services/<domain>/`. Take args; return a value. No `Request`/`NextResponse` types in the service.
2. Shrink the admin route to keep its `requirePermission(...)` guard, then `parse → call service → return`.
3. Verify the admin response is byte-identical against a known input.
4. Write the Norm route — its Zod `responseSchema` may be a strict subset (cleaner projection) but the underlying numbers must match.

Done in this order, the Norm and admin paths are mechanically guaranteed to agree. See `FacebookAdsInsightsService` and `DashboardStatsService` for worked examples.

## G6. `serviceAccount: true` filters Norm out of staff lists

The Norm User row has `serviceAccount: true`. The admin user list and Settings → Staff list both filter `serviceAccount: true` out by default — so Norm doesn't appear as a clickable team member. If you're debugging "where is Norm in the staff list?" — it isn't, and shouldn't be. Find Norm via the dedicated Settings → Roles → Norm path or by querying directly.

## G7. Migration is idempotent — re-run safe

`npm run migrate:create-norm` ([scripts/migrations/2026-05-20-create-norm-user-and-role.ts](../../scripts/migrations/2026-05-20-create-norm-user-and-role.ts)) upserts both the "Norm" Role and the Norm User. Safe to re-run. If you reset the Mongo DB locally, this is the first command to run after a fresh `npm run dev`, otherwise the permission check returns 403 with "Norm role missing permission" for everything.

## G8. Audit-log write failures are silent by design

Per the security checklist: a `NormCallLog` write failure logs `console.error` and does NOT fail the request. This protects Norm from an audit-collection outage taking it offline, but means "missing audit row" is not the same as "request didn't happen". Cross-reference with server logs (the `requestId` ULID appears in both) when investigating.

## eslint/rules/index.js now hosts non-Norm rules too (2026-07-19)

The local ESLint plugin registered as `internal-norm` gained `no-eager-stripe` (a payment-perf guardrail — see docs/payment/gotchas.md). The plugin NAMESPACE no longer implies Norm-only content; if more general rules accumulate, renaming the namespace (e.g. `local-rules`) is a sanctioned future cleanup — coordinate with every `eslint.config.mjs` reference when doing so.
