# Internal Norm — Gotchas

## `migrate:create-norm` fails on an EMPTY database, and used to fail silently (2026-09-04)

Running the migration against a database that has never held `users` or `roles` — a new
environment, a restored dump, a CI container — fails with:

```
MongoServerError: Unable to acquire IX lock on '<db>.users' within 5ms
code: 24 · codeName: LockTimeout · errorLabels: [ TransientTransactionError ]
```

**Why.** The migration does its work inside a transaction. On a fresh database Mongoose
builds each model's indexes the first time the model is touched, and an index build holds
a lock the transaction cannot acquire within Mongo's 5ms default
(`maxTransactionLockRequestTimeoutMillis`). It only bites the FIRST run: the failed
attempt leaves the collections and indexes behind, so an immediate retry succeeds — which
makes it look intermittent and is why it never reproduces against a warm database.

**How CI avoids it.** `scripts/seed-ci-fixtures.ts` awaits `User.init()` and `Role.init()`
before the migration runs. `Model.init()` resolves only once index builds have finished,
so the cost is paid outside the transaction.

**Two things still true of the migration itself:**

1. **No retry on `TransientTransactionError`.** MongoDB explicitly labels this class as
   retryable and expects the caller to re-run the whole transaction. This one does not, so
   anyone invoking it directly against a fresh database will hit the failure above. Doing
   the `Model.init()` warm-up first is the workaround; a retry loop would be the real fix.
2. **Its inner error handler cannot report this class.** The `catch` block runs
   `await session.abortTransaction()` BEFORE `console.error(...)`, and the abort throws too
   when the commit itself failed — so the original error never prints. The outer handler is
   the backstop, and it used to be `catch(() => process.exit(1))`: exit 1 with no output at
   all. That turned CI run #122 into a guessing game — the log showed the role and user
   created, then a bare exit 1. It now logs the reason.

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

## G9. `norm:smoke` could never fail — it exited 0 on a 500 (fixed 2026-07-31)

`scripts/internal-norm-smoke.ts` printed the status line and the body, then returned normally
whatever the status was. So the one failure mode the script exists to catch — a `responseSchema` ↔
handler-output mismatch, which surfaces as a **runtime 500 inside `withNorm`** and is invisible to
both `tsc` and `next build` — produced a green exit code. Anyone chaining it with `&&`, or reading
the exit code instead of the output, got a false pass.

It now `console.error`s and `process.exit(1)` on any non-2xx. Two consequences:

- A schema change **must** be re-smoked before you claim it works, and the exit code is now
  meaningful evidence.
- Composite scripts are safe to `&&`-chain. `npm run norm:smoke:promo-analytics` does exactly that
  across the summary, page-detail and channel-detail routes.

The underlying trap is unchanged and worth restating: **a required field declared in a
`responseSchema` that the handler does not return is a 500 on every call**, and the type-checker
cannot see it because the handler's return type and the Zod schema are independent declarations.
The 2026-07-31 promo-analytics rewrite would have shipped exactly that (`crossVisits` required,
repository no longer returning it) if the schema had not moved in lockstep.

### The reverse direction is SILENT, not a 500 (2026-08-17)

A field the handler returns but the `responseSchema` does **not** declare is **stripped**, not
rejected — Zod object schemas default to strip. So this failure mode has no 500, no log line, and
no smoke-test signal: Norm simply never sees the key, and an operator reading Norm's answer cannot
tell a missing field from a zero one. G9's exit-code fix does not cover it.

Worked example: `EntriesBySourceSchema` (`src/lib/internal-norm/schemas/major-draw.ts`) gained
`shop: z.number()` alongside the service-side widening. Without that line the new bucket would have
vanished from `/v1/major-draw/participants` output while every smoke test stayed green. The rule:
when a projected shape gains a field, **grep the Norm schema for it** — passing smoke tests prove
nothing about added keys.

### It shipped anyway: `breakdown.shop` 500'd both dashboard endpoints (2026-08-27 → fixed 2026-08-28)

The forward trap G9 describes landed in production for a day. The merch merge added a required
`shop: RevenueBucketSchema` to `NormDashboardStatsSchema.revenue.breakdown`
(`src/lib/internal-norm/schemas/dashboard.ts`) and widened `DashboardStatsService` to produce the
bucket — but neither Norm route that projects that shape gained the matching line. Both
`/v1/dashboard/stats` and `/v1/dashboard/revenue-breakdown` therefore failed `ctx.ok()`'s
`safeParse` and returned `500 response_schema_invalid` on **every** call until the two projections
were added.

Two things made it invisible:

- **`tsc` was green.** `ctx.ok` is generic `<T>(data: T)`, so the object literal is never checked
  against the Zod shape — exactly the independence G9 warns about.
- **The admin sibling was fine.** `/api/admin/dashboard/revenue-breakdown` builds its own object
  and already had `shop`, so the admin UI showed correct merch revenue while Norm was dark. A
  working admin tab is **not** evidence that the Norm mirror works.

`NormRevenueBreakdownSchema` is derived (`NormDashboardStatsSchema.shape.revenue.shape.breakdown`),
so one schema edit silently obligated **two** routes. When a shared or derived schema gains a
required key, grep every route that builds it — the count is rarely one. This is the concrete case
CLAUDE.md rule 10 exists to prevent, and the cheap check is `npm run norm:smoke` against a dev
server, which since G9 exits non-zero on the 500.

## G10. A schema-correct route still 500s when the DATA is malformed (2026-09-03)

G9 covers the two failure modes where the **schema and the handler disagree**. There is a third,
and it fires when both are perfectly correct: **the documents in Mongo do not satisfy the model's
own contract**, so a faithful projection produces a row the `responseSchema` rightly rejects.

Found by a full-surface smoke of all 97 endpoints: `GET /v1/monthly-coupon/campaign` returned
`500 handler_exception` on every call. Root cause was three `MonthlyEntryCampaign` documents
written **straight to Mongo**, bypassing Mongoose — which means bypassing both `required`
validators and `timestamps: true`:

| `_id` | name | what was absent |
| --- | --- | --- |
| `69b55d0b549a6c10596d1702` | Monthly Free Entries (2026-03, **active**) | `code`, `neverExpires`, `requiresPurchase`, `purchaseRequirement` |
| `69b74fc3cec6ce320de28e0b` | TEST300 (inactive) | `purchaseRequirement` |
| `6a8feff89cdc8f797f03465d` | probe / `PROBECROSS1` (**active**) | `monthKey`, `createdAt`, `updatedAt`, `entriesAmount`, `targetingMode`, + the above |

Two distinct crashes came out of that one cause: `row.createdAt.toISOString()` threw *before* any
schema could run, and rows that survived serialisation still failed `ctx.ok()`'s `safeParse`.

What makes this class hard to see:

- **`tsc` is green and the types actively lie.** `MonthlyCampaignListRow` declares
  `createdAt: Date`, but the value comes from `.lean()`, which returns whatever the document holds
  — `undefined` for a field that was never written. A non-optional TS type is a claim about the
  code, never about the collection.
- **The admin sibling was fine again.** `/api/admin/monthly-coupon/campaign` passes the `Date`
  objects through raw and has no response validation, so the admin UI listed all 26 campaigns
  while Norm could read none. As in the `breakdown.shop` case: *a working admin tab is not
  evidence that the Norm mirror works.*
- **The failure cascaded.** With the list dead, Norm had no way to obtain a campaign id, so
  `/v1/monthly-coupon/campaign/{id}/redemptions` was unreachable too. A broken list endpoint
  silently takes its `:id` children with it.

**The guard.** `projectUsableRows` in the route now validates each projected row against
`MonthlyCampaignRowSchema` (exported from `src/lib/internal-norm/schemas/monthly-coupon.ts` for
exactly this) and drops the failures with a `console.error` naming the `_id` and the issues.
`count` reports rows actually returned. Norm now sees the 23 valid campaigns instead of nothing.

**Dropping a row is damage control, not the fix.** Two of the three rows are legacy campaigns that
predate fields added later — one of them *active* — so the durable fix is a backfill giving them
schema-valid values, plus deleting the stray probe document. Until that runs, Norm's campaign list
is short by those rows. When adding a `required` field to a model that already has documents,
**backfill in the same change**, or every Norm route projecting that model starts failing on the
old rows.

Reach for a row-level guard whenever a Norm route projects a collection that predates its current
schema. Prefer `safeParse` against the row schema over hand-picking fields to null-check — the
first guard written here checked only the four date/identity fields and still 500'd, because two
other rows were broken in fields nobody had thought to list.

## G11. `ctx.ok` validated against `responseSchema` but shipped the UNVALIDATED object (fixed 2026-09-03)

For as long as the gateway has existed, `ctx.ok` computed `const parsed = responseSchema.safeParse(data)`,
used `parsed.success` to decide 200-vs-500, and then serialised **`data`** — the handler's original
object. `parsed.data`, the stripped value, was bound and thrown away.

Zod strips undeclared keys **on the parsed output**. Discard that output and nothing is stripped,
so the `responseSchema` was a *gate* (does this pass?) and never a *projection* (send only this).

That distinction is load-bearing, not academic. `withNorm.ts:104-109` gives the schema projection as
the express reason read-tier endpoints skip the per-permission grant:

> the PII boundary lives in each endpoint's `responseSchema` projection, not in the role grant

No Norm schema is `.strict()` (0 hits across all 36 schema files), so an undeclared key neither
failed validation nor was removed — it simply shipped. Three docs asserted the strip as fact
(`gotchas.md` G9's "reverse direction", `rules.md` R5, `backend.md`'s `NormDashboardStatsSchema`
note); all three described the intended design, and the implementation did not match any of them.

**What actually leaked.** A before/after key-shape capture across all 76 parameterless GET endpoints
(69 reachable at 200) found exactly two responses carrying undeclared keys:

| Endpoint | Undeclared keys that reached Norm |
| --- | --- |
| `/v1/cancellation-flow-analytics` | `otherReasonTexts[*].userEmail`, `.userFirstName`, `.userLastName`, `.userId` |
| `/v1/facebook-ads/health/insights` | `rows[*].snoozedUntil` |

The first is real customer PII — every member who typed a free-text cancellation reason had their
email and surname handed to Norm, in a payload whose schema (`schemas/cancellation-flow.ts:43-47`)
declares only `{text, startedAt, outcome}`, so nothing Norm reads even mentioned the fields. The
second is the reverse: `norm-context.md:558` states the operator-only `snoozedUntil` "is dropped
from the Norm projection" — it was not being dropped, it was shipping as `null`.

**The fix** returns `parsed.data` when a `responseSchema` is present. Verified by that same capture:
**no endpoint changed status, no keys were added, and the only keys removed are the six above** —
closing the PII leak and making the `snoozedUntil` doc true. Guarded by a case in
`src/lib/internal-norm/__tests__/withNorm.test.ts` that emits `userEmail`/`userLastName` through a
schema declaring neither; it fails with `actual: 'leak@example.com'` if `ctx.ok` ever reverts.

**Two lessons.**

- A Zod schema strips nothing unless you *use what it returns*. `safeParse` for validation and
  `parsed.data` for projection are different acts; only the first was being performed.
- **Verify a projection empirically, not by reading the schema.** The schema was correct the whole
  time. Every reviewer who checked "does `cancellation-flow.ts` declare an email field?" got the
  right answer — no — and the wrong conclusion. Capturing the actual response body is the only
  check that distinguishes a declared shape from a delivered one.

Endpoints that declare PII in their schema are a **separate** matter this fix does not touch —
`schemas/receipts.ts:49-52` exposes customer email by a recorded owner decision, and
`klaviyo.ts` / `invoices.ts` / `charge-past-due.ts` declare email and full names with no such
record. Zod ships those either way; narrowing them is an owner decision, not a bug fix.

## eslint/rules/index.js now hosts non-Norm rules too (2026-07-19)

The local ESLint plugin registered as `internal-norm` gained `no-eager-stripe` (a payment-perf guardrail — see docs/payment/gotchas.md). The plugin NAMESPACE no longer implies Norm-only content; if more general rules accumulate, renaming the namespace (e.g. `local-rules`) is a sanctioned future cleanup — coordinate with every `eslint.config.mjs` reference when doing so.
