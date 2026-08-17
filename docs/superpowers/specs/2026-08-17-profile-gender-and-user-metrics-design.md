# Profile gender + user-metrics scalability — design

**Date:** 2026-08-17
**Branch:** `feature/profile-gender`
**Status:** awaiting review

Two tracks in one spec, at the user's direction. They share a single surface — the `/admin`
Users Breakdown panel — so shipping the gender breakdown into a currently-timing-out endpoint
would be building on sand. Phase 1 fixes the endpoint and is independently verifiable; Phases
2–5 add the field.

---

## 1. Problem

### 1a. `/api/admin/metrics/users` returns nothing (confirmed defect)

Production runtime logs, `main`:

```
08:11:37 GET /api/admin/metrics/users 504 [error/serverless]
    Vercel Runtime Timeout Error: Task timed out after 10 seconds
08:11:24 GET /api/admin/metrics/users 504   (same)
08:11:12 GET /api/admin/metrics/users 504   (same)
```

Three attempts ~12s apart — `retry: 2` in
[`useUserMetrics`](../../../src/hooks/useUserMetrics.ts) means 3 tries, so expanding the panel
costs ~36s of spinner and then falls through to the `!isLoading && !data` empty state at
[`UsersBreakdownSection.tsx:183`](../../../src/app/admin/component/overview/UsersBreakdownSection.tsx).
The panel has never shown data at current data volume.

### MEASURED 2026-08-17 — the query layer is NOT the cause

Run: `npm run verify:user-metrics` (timings) and `-- --service` (real service through Mongoose),
both read-only against production.

| Measurement | Result |
|---|---|
| users / paymentevents / BenefitsGranted | **927** / 2,304 / 2,304 |
| All five queries, all-time, sequential (raw driver) | **833ms** |
| `getUserMetrics({})` all-time via the real service | **904ms** cold, 758ms warm |
| Full cold path incl. `connectDB` + model init | **2.73s** |

**At this data volume none of the query-shape problems below can produce a 10s timeout.** The
original plan to rewrite `UserMetricsService` into a `$facet` aggregation was therefore rejected
as overengineering for 927 users — it is retained in §10 as a threshold-triggered future action,
not work for this branch.

### The structural defect that CAN produce exactly this failure

`vercel.json` gives this route `maxDuration: 10` (the `api/**` catch-all). `connectDB` is
configured with `serverSelectionTimeoutMS: 10000`, `connectTimeoutMS: 10000`, and
`connectWithRetry`'s TLS backoff of `[1000, 2000, 4000]` — **7 seconds of sleeps** across up to
four attempts, each able to wait 10s. `minPoolSize: 0` on Vercel means every cold container
opens a fresh TLS connection, and the file is visibly built around recurring TLS failures
(`isSSLRetryableError`, "clear cache on SSL errors to force fresh connection").

**A function whose budget (10s) is smaller than its own connection-failure path (up to 47s)
cannot surface a connection error — it can only 504.** That is a correctness bug in the budget,
independent of whether TLS is currently misbehaving.

**Why it has been undiagnosable:** every diagnostic in that path is `console.log` /
`console.warn`, and `next.config.ts` `removeConsole` strips both from production builds. The one
surviving `console.error` runs only *after* the retry ladder finishes — which never happens when
the platform kills the function first. No connection-error log appears in the window containing
the 504s, which is consistent with (but does not prove) death mid-retry.

**Honest limit of this diagnosis:** the specific unaccounted ~7s cannot be attributed from
outside the function. Phase 1 therefore ships the instrumentation that makes the next occurrence
self-reporting, rather than claiming a root cause.

### Query-shape problems (real, cheap to fix, NOT the current cause)

Fixed as hardening because they are correct improvements and take the endpoint from ~1s to
~0.3s — explicitly not as the cure for the 504:

| # | Cause | Evidence |
|---|---|---|
| 1 | **`PaymentEvent.eventType` is unindexed.** `$match: { eventType: "BenefitsGranted", timestamp: {range} }` uses the single-field `timestamp` index for the range, then filters `eventType` in memory — an all-time range scans every PaymentEvent ever written. Two of the five queries do this. | [`PaymentEvent.ts:147-158`](../../../src/models/PaymentEvent.ts) declares `timestamp` and `packageType_1_timestamp_-1` but **no `eventType` index** |
| 2 | **The panel always asks for all time.** `UsersBreakdownSection` calls `useUserMetrics({ enabled: isExpanded })` with no dates, so the service defaults `startDate = new Date(0)` and `asOfDate = null` (live mode = walk every user's `subscription`). | [`UserMetricsService.ts:27-33`](../../../src/services/metrics/UserMetricsService.ts) |
| 3 | **Five sequential round-trips, no `Promise.all`.** Whatever each costs, they add. | [`UserMetricsService.ts:33-257`](../../../src/services/metrics/UserMetricsService.ts) |
| 4 | **Documents cross the wire where only counts are needed.** Every in-range user document is fetched to increment counters; every BenefitsGranted event is fetched to sum a price. | same |
| 5 | **Unbounded `$in`.** `ReferralEvent.find({ inviteeUserId: { $in: userIds } })` ships an N-element array. | [`UserMetricsService.ts:46`](../../../src/services/metrics/UserMetricsService.ts) |
| 6 | **Tightest cap on the page.** No `admin/metrics/users` entry in `vercel.json`, so the `api/**` catch-all `maxDuration: 10` applies. Sibling `admin/dashboard/stats` gets `60`. | [`vercel.json`](../../../vercel.json) |

**`/api/internal/norm/v1/metrics/users` calls the same service under the same 10s cap, so
Norm's `metrics.users` tool is silently broken too.** Not previously noticed because Norm
failures surface as a tool error, not a visible spinner.

Cause 6 is the one with teeth today: it is what turns any slow connection into a 504 instead of
an error you can read. Causes 1, 4 and 5 scale badly with data volume but cost ~1s at 927 users;
they are fixed as hardening. Cause 2 is deliberately left alone (see §3).

### 1b. Gender is not collected

[`advanced-matching.ts:23`](../../../src/lib/tracking/advanced-matching.ts) documents `ge` as a
Meta parameter "we deliberately don't collect". Meanwhile
[`privacy/page.tsx:78`](../../../src/app/(site)/privacy/page.tsx) already tells customers we
collect gender — the policy is ahead of the code.

---

## 2. Locked decisions

| Decision | Value | Rationale |
|---|---|---|
| Value set | `"male"` \| `"female"` only | User's call. Anyone who is neither, or prefers not to answer, leaves it blank. Accepted consequence: blank conflates "declined" with "never asked", so no bucket may imply anything about blank users. |
| Required? | **No**, everywhere | Consistent with leaving it blank as the catch-all. |
| Capture points | `UserSetupModal` step 2 (optional, non-gating) + `/my-account/settings` Profile tab | Coverage without friction. Step 2 already re-fires for existing members missing any of state/profession/birthdate, so gender gets asked organically. |
| Consumers | Meta `ge`, Klaviyo property, admin breakdown, Norm mirror | All four requested. |
| Incomplete-profile users | Excluded **at chart level only** | Profile-driven charts (profession/state/age/gender) count only members who answered, with an explicit `N of M answered` denominator. `signupSource`, `membershipStatus`, `membershipByPackage`, `purchaseHistory` keep full-population counts. Filtering the whole endpoint would drop active paying members from the active count and make `/admin` disagree with other dashboards. |
| Measurement | Production, read-only | Only data that reproduces a 10s timeout gives trustworthy timings. |

---

## 3. Phase 1 — make the endpoint able to succeed, and able to explain itself

**Goal, in priority order:**

1. The route can no longer be killed before its own connection layer gives up — so a failure
   produces a readable error instead of a 504.
2. When it is slow, it says which stage was slow, in logs that survive a production build.
3. The known-inefficient query shapes are fixed because they are cheap and correct — explicitly
   *not* because they are the cause.

**Invariant:** every number the endpoint returns today must be identical after the change.

**On cause #2 (always-all-time):** deliberately not fixed. Scoping the panel to the admin date
filter would change what the panel *means*, and at 927 users an all-time scan costs ~150ms.
Listed in §10.

### 3.1 Measurement — DONE

`scripts/verify-user-metrics-parity.ts` (read-only; `--timings` default, `--service` mode drives
the real service through Mongoose). Results recorded in §1a. Conclusion: the query layer accounts
for ~1s of a 10s timeout, so the rewrite originally specced here is not justified.

The script stays in the repo as a regression tool, wired as `verify:user-metrics`.

### 3.2 Make the function budget exceed its own failure path

`vercel.json`: `maxDuration: 60` for `src/app/api/admin/metrics/users/route.ts` **and**
`src/app/api/internal/norm/v1/metrics/users/route.ts`.

This is not padding for a slow query — it is what allows `connectDB`'s 10s server-selection
timeout and its retry ladder to actually complete and *return an error*. A 10s budget guarantees
the platform kills the function first, which is why six consecutive failures produced zero
diagnostic output.

### 3.3 Make the connection path visible in production

`next.config.ts` `removeConsole` strips `console.log` / `console.info` / `console.debug` /
`console.warn` from production builds. Every diagnostic in `src/lib/mongodb.ts` uses a stripped
level, so the one code path most likely to be failing is silent in the only environment where it
fails.

Convert the connection-lifecycle diagnostics in `src/lib/mongodb.ts` to `console.error`:
the retry warning in `connectWithRetry`, the unhealthy-cache-clear warning, and the
`disconnected` handler. Keep the success line at `console.log` (noise, not signal).

Add stage timing to `UserMetricsService.getUserMetrics` behind a single `console.error` emitted
only when total elapsed exceeds a threshold (2s), so a healthy request logs nothing and a slow
one self-reports which stage cost the time. This is the mechanism that makes the next occurrence
diagnosable — it is the deliverable, not a debug leftover.

### 3.4 Index `PaymentEvent.eventType` (hardening)

`{ eventType: 1, timestamp: -1 }`. Every PaymentEvent query in the app filters on
`eventType` first; today none of the eleven indexes leads with it (confirmed by reading the live
index list), so those queries range-scan `timestamp` and discard non-matching event types in
memory. Cheap to fix, benefits every caller, and prevents cause 1 from ever becoming the problem.

**Ship it as a migration script, not a bare `schema.index()`.** There is no `autoIndex` override
in [`mongodb.ts`](../../../src/lib/mongodb.ts), so Mongoose's default would have production build
it at runtime on first model use — inside the very 10s budget that is already failing.

1. `scripts/migrations/2026-08-17-payment-event-eventtype-timestamp-index.ts` — explicit
   creation, `background: true`, idempotent, `--dry-run` prints the current index list.
2. Add the matching `PaymentEventSchema.index(...)` declaration so fresh environments get it.
3. Run the migration before deploying.

### 3.5 Return counts, not documents (hardening)

Add `aggregateNetBenefitsSummaryWithMatch(match)` to
[`payment-event-net-queries.ts`](../../../src/utils/payment/payment-event-net-queries.ts),
returning `{ count, totalRevenue, byPackageType }` via `$group` with the same refund-exclusion
semantics. `UserMetricsService.purchaseHistory` consumes it instead of pulling 2,304 documents
across the wire to sum a number.

**Add alongside; do not change** `fetchNetBenefitsGrantedInRange` — `revenue-breakdown`,
`MembershipAnalyticsService` and `PaymentEventRepository` depend on its document output.

### 3.6 Parallelize (hardening)

`Q1 → Q2` is a genuine dependency; `Q3`, `Q4`, `Q5` are independent. Run
`Promise.all([chain(Q1,Q2), Q3, Q4, Q5])`. Measured effect at current volume: ~833ms → ~475ms.
The unbounded `$in` in Q2 shrinks naturally with the range and costs 30ms at 927 ids; left as-is
rather than restructured, since replacing it now would be speculative.

### 3.7 Explicitly NOT doing

- **No `$facet` rewrite of the user buckets.** Measured at ~150ms for all 927 users. Rewriting
  ~250 lines of subtle business rules (self-referral exclusion, trialing-as-active, snapshot
  override, `bucketUnmatched`, `normalizeProfession`) to save 150ms would add real regression risk
  for no benefit, and `normalizeProfession` / `getAgeGroup` are arbitrary JS transforms that would
  have to be reimplemented as aggregation stages. Revisit only if §9's threshold trips.
- **No narrowing of the panel's range.** Changes what the panel means; §10.

---

## 4. Phase 2 — the field

- [`User.ts`](../../../src/models/User.ts): `gender?: "male" | "female"` on `IUser`; schema field
  with an allow-empty validator mirroring `state`'s (empty string passes, unknown value fails).
- New `src/data/genders.ts`: `GENDERS = [{ value: "male", label: "Male" }, { value: "female", label: "Female" }]`
  — sibling of `professions.ts` / `australianStates.ts`, matching their export shape so
  `SelectMenu` consumes it unchanged.
- **No data migration.** Absent = blank = the intended catch-all.

---

## 5. Phase 3 — capture

| File | Change |
|---|---|
| [`api/user/update-profile/route.ts`](../../../src/app/api/user/update-profile/route.ts) | `gender: z.enum(["male","female"]).optional()`; assign when `!== undefined`; include in the response body alongside `profession`/`state` |
| [`api/user/setup/route.ts`](../../../src/app/api/user/setup/route.ts) | optional `gender` on `stateProfessionOnlySchema`; **not** added to the `completeSetupOnly` required check |
| [`UserSetupModal/index.tsx`](../../../src/components/modals/UserSetupModal/index.tsx) | `SelectMenu` for gender in step 2; **not** added to `stepsNeeded`; must not gate Continue |
| [`ProfileTab.tsx`](../../../src/app/(site)/my-account/components/settings/ProfileTab.tsx) | `SelectMenu`; **no** amber "Required" chip and **not** added to the missing-fields list — it is the one genuinely optional field on that form |

Both write paths already call `ensureUserProfileSynced`, so Klaviyo picks gender up for free
once Phase 4b lands.

---

## 6. Phase 4 — consumers

### 6a. Meta Advanced Matching `ge`

Verified spec: `ge` accepts **a single lowercase letter, `f` or `m`, blank if unknown**,
SHA-256 hashed like every other parameter. So `male → "m"`, `female → "f"`, anything else
omitted entirely — Meta's own prescribed behaviour for unknown, not a workaround.

- [`advanced-matching.ts`](../../../src/lib/tracking/advanced-matching.ts): add `ge?: string` to
  `AdvancedMatchingFields`, `gender?: string` to `AdvancedMatchingInput`, map and hash; delete
  the now-false "fields we deliberately don't collect" comment for gender.
- **Thread gender through every hash site or none.** Partial adoption produces different user
  hashes on browser vs server and *degrades* match quality rather than improving it. Sites:
  `providers/facebook.ts`, `facebook.ts`, `registration-user-data.ts`,
  `ConversionPixelsAdvancedMatching.tsx`, `facebook-helpers.ts`,
  `pixel-purchase-tracking.ts`.
- Extend the existing parity tests: `advanced-matching.test.ts`,
  `capi-userdata-enrichment.test.ts`, `facebook-emq.test.ts`, `facebook.test.ts`.

**Compliance gate before this sub-phase ships:** the privacy policy discloses that gender is
*collected*, but it has **not** been verified to disclose *sharing it with advertising
platforms*, which sending hashed `ge` to Meta does. Confirm the policy covers it — and update it
if not — before 6a goes live. 6b/6c do not depend on this.

### 6b. Klaviyo

One line beside `profession` in
[`klaviyo-helpers.ts:248-256`](../../../src/utils/integrations/klaviyo/klaviyo-helpers.ts):
`gender: user.gender || undefined`. Property names in that block are lowercase (`state`,
`profession`), so the property is `gender`, not `Gender`. `cleanProperties` already drops
undefined values, so blank gender is never sent. Mirror in `bulk-import.ts` if it maps the same
field set. Document in `docs/tracking/KLAVIYO_INTEGRATION.md`.

### 6c. Admin breakdown + Norm

- `UserMetrics` type: `gender: Record<string, number>`; buckets `Male`, `Female`, `Not set`.
- `UserMetricsService`: `gender` added to the existing `.select()` list and counted in the
  existing in-memory loop — three lines, no extra query (the `$facet` rewrite was rejected in
  §3.7, so the loop is where bucketing still lives).
- New `src/components/admin/metrics/users/GenderBreakdown.tsx` mirroring `ProfessionBreakdown`;
  wired into `UsersBreakdownSection`.
- **Chart-level denominators** (per §2): profession, state, age and gender charts each render
  `N of M answered` using the existing `excludedCount` / `grandTotal` mechanism already present
  for profession.
- Norm lockstep: `NormUserMetricsSchema` in
  [`schemas/metrics.ts`](../../../src/lib/internal-norm/schemas/metrics.ts), the route's
  `ctx.ok({...})` projection, `npm run build:norm-manifest`, and
  `docs/internal-norm/norm-context.md`. A schema/output mismatch is a runtime 500 invisible to
  `tsc` — verify with `npm run norm:smoke`.

---

## 7. Testing & verification

| What | How |
|---|---|
| Phase 1 output parity | `npm run verify:user-metrics -- --service` prints the service's own totals (users / active / purchases). Because §3.7 rejected the rewrite, the only behavioural change is `purchaseHistory` moving to `$group` — parity for that is asserted by comparing `count` / `totalRevenue` / `byPackageType` against the document-based path in the same run. |
| Phase 1 latency | `npm run verify:user-metrics` before and after; target well under 10s so `maxDuration: 60` is never the reason it passes. |
| Panel actually returns data | Expand Users Breakdown on `/admin` and confirm data renders — the user's stated acceptance bar. Re-check Vercel runtime logs for absence of new 504s. |
| Meta hash parity | Extend the four existing test files; assert identical hashes for the same user across browser and CAPI paths, and that non-`male`/`female` omits `ge` entirely. |
| Norm | `npm run norm:smoke` |
| Repo gates | `npm run lint`, `npm run type-check`, `npm run test:chat-faqs` after the Cobber corpus change |

New tests get matching `test:*` entries in `package.json` or they are undiscoverable.

---

## 8. Docs & compliance

Hook-enforced:

- **CUSTOMER.md** — new `User` field *and* new customer data sent to third parties (Meta,
  Klaviyo). Both are listed triggers.
- **Cobber** (rule 5c) — gender is a new customer-visible profile field: FAQ entries, a bullet
  in the systemPrompt ACCOUNT SELF-SERVICE MAP (navigation only), `npm run build:chat-knowledge-pack`,
  and a deliberate count bump in `faqs.test.ts`.
- **BUSINESS.md / README.md** — Meta gaining a new matching parameter is arguably a
  tracking-provider capability change; confirm against `BUSINESS_TRIGGER_GLOBS` and update if
  triggered.

Domain docs per the manifest: `metrics-analytics` (service rework), `admin` (breakdown +
component), `subscription` (owns `User.ts`), `tracking` (Meta + Klaviyo), `internal-norm`
(schema + context), `infrastructure` (`vercel.json`, migration script), `shared-ui` (modal),
`dashboard-account` (`/my-account`), `config-and-data` (`src/data/genders.ts`),
`payment` (`payment-event-net-queries.ts`).

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| **The 504 has a cause I have not proven.** The query layer is measured at ~1s, so ~7s is unattributed. The fix makes failure survivable and self-reporting rather than claiming a cure. | §3.2 lets the function outlive its own connection timeout; §3.3 makes the connection path and slow stages log at `console.error` so the next occurrence is readable. **If 504s persist after deploy, the new logs name the stage — that is the designed next step, not a surprise.** |
| `purchaseHistory` `$group` disagrees with the document path | Both computed in the same verify run and compared; `$group` reuses the identical refund-exclusion stages. |
| A growth threshold silently re-creates the problem | `verify:user-metrics` is a standing tool. Revisit §3.7's rejected rewrite when all-time `getUserMetrics` exceeds ~3s or users exceed ~50k. |
| Index build blocks production | Created ahead of deploy via migration script with `background: true`, idempotent. |
| Partial Meta gender threading degrades match quality | All-or-nothing across the six sites; parity tests assert it. |
| Norm schema drift → runtime 500 | `norm:smoke` in the verification list. |
| Sending gender to Meta outruns the privacy policy | Explicit compliance gate before 6a ships. |

---

## 10. Out of scope

- Refactoring the other `fetchNetBenefitsGrantedInRange` callers.
- Making the Users Breakdown panel respect the admin date filter (a legitimate improvement, but
  it changes what the panel *means*; raise separately).
- Registration-time gender capture (rejected — conversion-path risk).
- Backfilling gender for existing members (impossible; only they can supply it).
- A "prefer not to say" / non-binary option (explicitly declined; blank covers it).
