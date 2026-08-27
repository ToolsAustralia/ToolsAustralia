# Rewards-Redeemables — API

## Routes

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/bonus-codes/v1/issue` | **The Klaviyo bonus-code webhook.** Mints a customer's per-customer bonus code and starts its 72-hour clock, called from inside a Klaviyo flow immediately before the discount email — see below. |
| GET | `/api/redeemables/status` | Eligibility + active campaigns for the caller. **A campaign `code` is returned only when the caller holds a `RedeemableIssuance` for it** — see below. |
| POST | `/api/redeemables/redeem` | Redeem a code/issuance. Failure `error` is human copy, never the raw `RedemptionFailureReason` string — see below. |
| _TODO_ | `/api/redeemables/**` (remaining) | List + redeem |
| _TODO_ | `/api/rewards/**` | Public catalog + user-facing reward views |

> _TODO: read [src/app/api/redeemables/](../../src/app/api/redeemables/) and [src/app/api/rewards/](../../src/app/api/rewards/) and document each handler._

## `POST /api/bonus-codes/v1/issue` — the Klaviyo bonus-code webhook

### In plain English

Klaviyo runs the nurture emails. One step in each of three flows, sitting immediately above the
discount email, calls this address. When the call arrives we create that customer's discount code and
give it exactly 72 hours from that instant; a second later the email goes out with the code printed
in it. Same flow, one step apart, so the code in the email is always fresh.

Nothing travels back into the email — Klaviyo webhooks are one-way. The email carries the code string
hardcoded by the marketing team; this call is what makes that string work for that person.

We answer with `{ "ok": true }` or `{ "ok": false }` and nothing else, on purpose. The answer says
whether the request was accepted, **not** what happened to the customer. Anyone who got hold of the
secret could otherwise walk a list of email addresses and read back who has an account, whether it is
active, and whether they have already used their code.

Two things must be true before the flows are switched on, in this order: the endpoint is live in
production with its secret set, and the three discount campaigns exist in the admin panel. If a
campaign is missing, the email still sends and the code does not work. That is the single easiest way
to ship a broken launch, and it is the reverse of the old runbook.

### Contract

**Headers**

| Header | Required | Notes |
|---|---|---|
| `X-Bonus-Code-Secret` | yes | Static shared secret, compared constant-time with a mandatory byte-length pre-check (`timingSafeEqual` throws on unequal-length buffers). `BONUS_CODE_WEBHOOK_SECRET` accepts a **comma-separated list** so rotation has an overlap window; entries shorter than 16 characters are dropped. **Never logged**, not raw, hashed or truncated. Unset → `500`, never open. |
| `Content-Type` | yes | `application/json` |

**Body** — Zod-validated at the route boundary.

```jsonc
{
  "userId": "{{ person.user_id }}",   // OPTIONAL
  "email":  "{{ person.email }}",     // OPTIONAL, but one of the two is required
  "trigger": "cancel-click"           // REQUIRED: cancel-click | checkout-start | one-time-purchase
}
```

`userId` **must stay optional**, and an empty string must be treated as absent — that is what a merge
tag renders when it has nothing to render, not an edge case. `{{ person.user_id }}` is legitimately
empty on newsletter-form profiles (the subscribe route sets three properties, none of them
`user_id`), at registration (the server-side profile write that sets it is fire-and-forget behind
swallowing catches, and short-circuits entirely when `KLAVIYO_ENABLED === "false"`), and for any
unauthenticated session (the client-side identify only fires when `status === "authenticated"`, and
registration step 1 does not log the user in). Guest checkout-start is the cohort most exposed to
that, and it is one of the three triggers.

**Neither identity field's *shape* may veto the call.** A `userId` that is not an ObjectId is treated
as absent (that is what a half-rendered merge tag looks like), so a malformed `email` is treated the
same way — the schema deliberately does **not** carry `.email()`, because it would `400` a call that
`userId` could have served. A garbage address is safe to carry into the lookup (`z.string()`
guarantees a string, so no operator injection; `User.email` is unique + lowercase + trim, so a
non-address matches nothing) and falls out as `user_not_found`, logged. The `400` is reserved for a
body with **no** identity field at all.

**Customer resolution order** (`src/lib/bonus-code-webhook/resolveCustomer.ts`) — an **else-if**, not
two attempts:

1. `userId`, when present **and** a valid ObjectId → resolve by `_id`. A non-ObjectId value is
   treated as absent, not as an error — that is what a half-rendered merge tag looks like.
2. **Else** `email`, when present → `findOne({ email: email.trim().toLowerCase() })`. Exact and safe:
   `User.email` is `unique` + `lowercase` + `trim` at the schema level.
3. Both present and resolving to **different** users → **refuse**, `console.error`, audit
   `identity_conflict`. A disagreement means a stale or merged Klaviyo profile, which is precisely the
   case where minting to the wrong person is possible. Do not silently prefer one. The refusal answers
   `200` with the same opaque body every other customer-state outcome gets — loud to us, silent to the
   caller; see the status map below for why it is not a `409`. (An email that matches **nothing** while
   the id resolves is *not* a disagreement — an address can change without the profile's `user_id`
   changing — so `byId` wins there.)
4. No match, or `isActive === false` → `user_not_found`.

**A usable `userId` that resolves to nothing is a refusal, not a retry against the email.** The email
branch is the fallback for an **absent** id; it is never a second attempt after a failed lookup. A
stale or merged Klaviyo profile can carry a dead account's `user_id` next to a live address belonging
to somebody else — falling through would mint *that* person's one-per-lifetime grant on a signal that
was never theirs. It is the same substitution `identity_conflict` exists to prevent, except with no
audit row saying so, because there is no second document to disagree with. The cost of refusing is one dead code in one email and
a `user_not_found` row whose *rate* is watchable; the cost of falling through is a bystander's
lifetime grant, burned invisibly. Pinned by the webhook contract suite against a real campaign, so a
regression mints rather than no-ops.

The lookup **does not swallow database errors**: a thrown query reaches the handler's catch and
answers `500`, so the retry can still recover the grant. Returning "not found" on a Mongo blip would
answer `200`, stop the retry, and lose the grant permanently.

**Response body — always opaque.** `{ "ok": true }` or `{ "ok": false }`, where `ok` mirrors the HTTP
**status**, never the outcome. Do not make `ok` mean "did we mint": a richer body turns the endpoint
into a customer-state oracle for anyone holding the secret (iterate ObjectIds or addresses and read
back whether an account exists, whether it is active, whether the grant is spent, and the exact
instant of the window), and with the email fallback it also becomes an "is this address a Tools
Australia customer" oracle for people who never interacted with us. This repo already carries a
written incident of exactly that disclosure class at `src/app/api/codes/validate/route.ts`.

**And the status line counts as body.** Every *customer-state* outcome — minted, spent, no such
account, the identity conflict — answers `200`, byte-identical. A status of its own is an answer of its
own, and reads back to the same sweep. See "Why the identity conflict is not a `409`" below.

**The one deliberate exception** is `400`, which answers
`{ "ok": false, "error": "invalid_body", "trigger": "<the offending value, truncated to 64 chars>" }`
so a flow misconfiguration is visible in Klaviyo's delivery log. That value came from the caller and
leaks nothing about a customer.

All diagnostics go to `console.error` with the `[bonus-code]` prefix — production builds strip
`log`/`info`/`debug`/`warn`, so `error` is the only level that survives. **Treat the prefix as a
rule, not a habit.** With no admin surface and no alerting, a Vercel log filtered on `[bonus-code]`
is the whole incident toolkit; a line without it is invisible at exactly the moment it matters. Two
lines in `CampaignService.ts` were missing it until 2026-08-26 — including the sole producer of the
`error` outcome, the one status whose retry can still recover a grant while the discount email is
already in flight, so an operator saw the route's "mint failed" line and not the line saying why.

### Status map

The governing principle: **a non-2xx exists to make Klaviyo retry.** Return 5xx only where a retry can
actually recover the customer's grant; return 2xx wherever a retry would change nothing, so a
permanent condition does not manufacture a retry storm against a live send.

| Status | Condition | Audit `outcome` | Why this status |
|---|---|---|---|
| `200` | Minted. | `minted` | Done. |
| `200` | Re-armed (lapsed window, outside the re-arm cooldown). | `rearmed` | Done. |
| `200` | A live window already exists. | `already_active` | The customer holds a working code; a retry cannot improve it. Mirrors the Stripe receiver answering 200 to a duplicate delivery. |
| `200` | `redeemedEverAt` is set. | `spent` | Permanent and correct — one grant per person, for life. |
| `200` | Re-arm refused inside `REARM_COOLDOWN_DAYS`. | `expired_no_rearm` | A retry inside the cooldown refuses identically. |
| `200` | No active campaign carries the trigger's code, **or** the customer is not eligible for it. | `not_applicable` | Not retryable. **`CampaignService` `console.error`s the missing campaign** — under this model that is a launch-configuration error, not a benign no-op, and it is the cheapest early warning available. |
| `200` | No such user, or `isActive === false`. | `user_not_found` | Retrying for three days cannot conjure an account. Still logged — a *rising rate* of these is the earliest signal that a flow's merge tags broke. |
| `200` | `userId` and `email` resolve to different users. | `identity_conflict` | **Amended 2026-08-26 — this was a `409`; do not restore it.** A data-integrity refusal, but a *customer-state* one, so it answers like every other customer-state outcome. See "Why the identity conflict is not a `409`" below. Noticed via the `console.error` and the audit row, never via the status. |
| `400` | Body is not JSON, fails Zod, carries an unknown `trigger`, or has neither `userId` nor `email`. | `invalid_body` | Flow misconfiguration. Retrying an invalid enum forever is pure waste. Body echoes the offending `trigger`. |
| `401` | Missing or wrong `X-Bonus-Code-Secret`. | `missing_secret` / `bad_secret` | Honest answer; a retry is harmless because nothing minted. |
| `403` | `VERCEL_ENV !== "production"`. | `not_production` | "Klaviyo only calls the production URL" constrains the intended caller, not the reachable surface — the route exists on every preview deploy and every localhost, and Vercel env vars are set for all environments by default. Belt and braces with scoping the secret to the Production environment. |
| `429` | Daily mint cap reached, or the kill switch is on. | `daily_cap` / `kill_switch` | Fail-closed cap. A retry after the day rolls over (or the switch flips) succeeds, so a retryable status is right. |
| `500` | Unset/unusable server secret. | `misconfigured` | Fail **closed**. Never copy the cron idiom `if (!secret) return true` — on a mint endpoint an unset env var would give the entire product away. |
| `500` | Genuine internal error — DB unreachable, unexpected throw, or the budget gate itself failed. | `error` | **The only status whose retry recovers a grant that would otherwise be lost forever** while the discount email is already in flight. This is why `StampedIssuanceResult.outcome` carries `"error"` separately from `"not_applicable"`; do not collapse them back together. |

#### Why the identity conflict is not a `409`

*Amended 2026-08-26 (final review, must-fix 7). The spec originally mandated `409`; the spec has been
amended to match. This is a recorded decision, not an omission — do not re-add the `409`.*

**The status line is part of the response.** An opaque body buys nothing while one customer-state
outcome answers a status of its own: a distinct status is a distinct answer, readable by exactly the
same sweep the opaque body exists to defeat. And the `409` was reachable on **attacker-chosen input** —
the two lookups run in parallel and the conflict check fires *before* the `isActive` gate, so someone
holding the shared secret posts their **own** account id alongside a probe address and reads the answer
off the status line: `409` means that address belongs to a Tools Australia customer, `200` means it
does not. After their own first call the outcome settles, so every subsequent probe is free and
non-destructive. There is deliberately no rate limiter here, and the daily mint cap counts only
`minted`/`rearmed`, so the probes cost nothing — the sweep is unbounded and unthrottled. That is
customer-list enumeration against people who never interacted with the attacker, which is the whole
reason the body is opaque in the first place.

**The `409` bought nothing operationally.** Klaviyo does not retry a `409` into a fix, nobody watches
the delivery log for one, and the `identity_conflict` audit row already answers the only question an
operator actually asks — *which flow is sending disagreeing identities* — queryably and by rate, which
a status buried in a third-party delivery log does not.

**What is kept.** The route's `console.error` (both ids, opaque, no PII) and the `identity_conflict`
audit row. The condition is invisible **to the caller** only; it is exactly as visible to us as it was.
Deleting either of those is not this change — it is the loss this change was careful to avoid, and
`test:bonus-code-webhook` §5 asserts the audit row for that reason.

**The general rule.** Only conditions that are properties of the **caller** get a status of their own:
`400` (their body), `401` (their secret), `403` (the environment), `429` (our cap), `500` (our fault).
Every condition that is a property of a **customer** answers `200` with a byte-identical body. Before
giving a customer-state outcome its own status, ask what someone holding the secret learns by watching
for it.

**Retry semantics are UNVERIFIED.** No other inbound Klaviyo route exists in this repo to learn from.
The map assumes non-2xx is retried, 2xx is not, and retries are minutes rather than days. Confirm
before launch. The re-arm cooldown (`REARM_COOLDOWN_DAYS`, default 30) is designed so the map stays
safe under either answer: a replayed or re-entered flow cannot hand out a second full window.

### Order of operations, and why

`connectDB` → read the raw body once → **production assertion** → **shared secret** → **daily mint
budget** → Zod → resolve the customer → delegate to `mintBonusCodeForTrigger` → map outcome to status
→ **audit**. The three cheap refusals run before anything touches customer data, and the budget runs
before the mint because it is the only control that still bounds the damage once the secret leaks.

**Middleware never runs for `/api`** (the matcher excludes it outright), so this route owns 100% of
its own authorization. There is no session and no outer gate to fall back on.

**Every path writes an audit row** (`BonusCodeWebhookCall`), refusals included, and the write is
awaited rather than fire-and-forget. That is not bookkeeping: the daily mint budget **counts** those
rows, so a mint whose row never landed is a mint that never counted against the cap. The writer never
throws — losing the grant because a log write hiccuped would be strictly worse than losing the line.
A `400` row carries the `trigger` whenever the submitted value was one of the three, even though the
body as a whole was rejected: that row is what someone reads to find out **which** marketing flow
broke, and a blind row cannot answer it. An unknown trigger value stays out of the row (the model's
`enum` would reject it and take the whole row down with it) and is echoed in the response instead.

### Accepted: an unauthenticated caller can force a Mongo insert (2026-08-26)

**Decided, not overlooked.** Every refusal — wrong secret, wrong environment, unparseable body —
writes its audit row *before* answering, so an unauthenticated flood costs one small insert per
request, and there is deliberately **no rate limiter** in front of it. Recorded here so the next
person does not rediscover it as a surprise and "fix" it by weakening a guard.

Why it stays this way:

- **The audit row is the point.** The response body is opaque by design, so a refusal is invisible
  *except* in these rows. Dropping the row for unauthenticated callers would blind exactly the
  case the trail exists for — an enumeration sweep against a leaked secret is `bad_secret` rows and
  nothing else.
- **A rate limiter here is not an integrity control.** `createDistributedRateLimiter` fails **open**
  by design and `createRateLimiter` is per-lambda and bypassable; and keying on IP would be actively
  harmful, because Klaviyo calls from a shared egress pool, so every customer's flow would collapse
  into one bucket. The real control is the fail-closed daily mint cap, which bounds the thing that
  actually costs money (grants), not the thing that costs a row.
- **The blast radius is bounded and self-clearing.** Rows are ~100 bytes, TTL-purged after 90 days,
  and refusals do not consume mint budget, so a sweep cannot starve the live flows.

**Mitigation available if it is ever abused**, in order of preference: a platform firewall / WAF rule
scoped to `/api/bonus-codes/v1/issue` (Vercel Firewall supports a path-scoped rate limit or an
allow-list of Klaviyo's egress ranges) — it stops the traffic at the edge, before a lambda or a
database connection is spent, which no in-app limiter can do; then, if that is unavailable,
`BONUS_CODE_KILL_SWITCH=true` as break-glass, which still writes rows but mints nothing. Do **not**
answer it by making a guard fail open, and do **not** skip the audit write for refused calls.

### Secret rotation runbook

`BONUS_CODE_WEBHOOK_SECRET` is a comma-separated list precisely so this has no downtime:

1. Append the new secret: `BONUS_CODE_WEBHOOK_SECRET=<old>,<new>` (Vercel → Production only).
2. Marketing updates the webhook step in all three flows to send the new secret.
3. Remove the old one: `BONUS_CODE_WEBHOOK_SECRET=<new>`.

Every candidate is compared with no early exit, so the rotation position of the matching secret is not
observable through response timing. One secret, not three per-trigger secrets: `redeemedEverAt`
already caps every account at three redeemed grants for life and the daily budget caps the aggregate,
so compartmentalisation buys little against tripling the marketing-side config surface.

### Launch order — REVERSED on 2026-08-26. Read this before switching anything on.

**The old order was: build and publish the Klaviyo flow FIRST**, on the `Bonus Code Issued` metric,
then create the campaign. That was right under the old model, where the server minted at the
customer's qualifying act and the flow was only the thing that *delivered* the email. It is now
exactly backwards, and following it is the single easiest way to ship a broken launch.

**The correct order:**

1. Endpoint deployed to production, `BONUS_CODE_WEBHOOK_SECRET` scoped to the **Production**
   environment only.
2. The three campaigns created in the admin panel with `validForHours: 72`. If you set
   `validForHours` to anything other than 72, update Cobber FAQ id 86 in the same change — it states
   "a fixed 72 hours" in customer-facing copy, and `test:chat-faqs` guards the wording, not the
   campaign row, so a mismatch stays green.
3. Smoke-test against a real production account, **against the REAL campaign** — a disposable one is impossible (one fixed code per trigger, and `code` is uniquely indexed). Full procedure, including the cleanup that restores the test account's grant: [gotchas.md → launch order](./gotchas.md#per-customer-bonus-codes-launch-order-is-load-bearing-too--and-it-inverted-on-2026-08-26).
4. **Then** marketing publishes the flows.

Publishing the flows first ships a live sequence emailing a hardcoded code into a void: with no
campaign carrying the code the endpoint answers `200 not_applicable`, the email sends anyway, and
every customer in the cohort gets a code that returns "Invalid campaign code" at checkout. Nothing
alerts: `200` is the correct answer to "there is nothing to mint", Klaviyo will not retry a 2xx, and
the only trace is `console.error("[bonus-code] no active campaign for code", …)`
(`CampaignService.ts:825`) in the Vercel logs — there is no admin screen for bonus codes. The blast
radius is every customer the flow reaches before someone reads that log line.

What is **not** lost: no issuance row is written, so nobody's one-per-lifetime grant is burned and a
later re-run after the campaign exists will mint normally. What **is** lost is the email — the
customer has already been sent a code that did not work, and nothing re-sends it to them
automatically. Recovering that cohort is a marketing re-send, not a system retry.

### Code-visibility rule (`GET /api/redeemables/status`) — Task 10, 2026-08-25

A code is customer-facing PII in the sense that it is redeemable value — it must
be visible **only to a customer who has qualified for it**. The route loads the
caller's own issuances (`RedeemableIssuance.find({ userId }).select("campaignId
status expiresAt redeemedAt")`) into a `heldCampaignIds` set and returns
`code: heldCampaignIds.has(String(campaign._id)) ? campaign.code : undefined`
for both `activeCampaigns[]` and the singular `activeCampaign`. A campaign the
caller has not qualified for still appears (name, dates, `neverExpires`, etc.) —
only `code` is withheld. See
[backend.md](./backend.md#customer-facing-code-visibility-and-expiry-label-task-10-2026-08-25)
for the full rationale and the redeem-route refusal-message mapping.

## Cross-domain admin routes

Under `/api/admin/**` (in [admin](../admin/)):
- Campaign management (create, run, audit)
- CSV bulk import
- Redemption analytics

### `validForHours` contract (create/update campaign)

`CampaignService.createCampaign` and `CampaignService.updateCampaign` both accept an optional
`validForHours` (integer, min 1) alongside the existing `endsAt` / `neverExpires` pair:

- **Create** (`POST /api/admin/monthly-coupon/campaign`): `validForHours` is a plain optional
  number. Rejected by zod `superRefine` when sent together with `neverExpires: true` —
  the two are mutually exclusive (a personal rolling window vs. no expiry at all).
- **Update** (`PUT /api/admin/monthly-coupon/campaign/{id}`): `validForHours` is
  `z.number().int().min(1).nullable().optional()`. `null` is the **clearing sentinel** —
  the only way to unset a previously-set `validForHours` (the field is otherwise stripped
  by two independent undefined-strip layers between the route and `CampaignService`, so a
  bare omission never clears it). The service converts `validForHours: null` into a real
  Mongo `$unset`. The same mutual-exclusion refine as create applies to the update schema —
  `updateCampaign` uses `findByIdAndUpdate(..., { runValidators: true })`, which does **not**
  run the model's `pre("save")` guard. **The authoritative gate is the merged-state check in
  `CampaignService.updateCampaign` (`CampaignService.ts:220-230`)**, not zod: zod only sees the PUT
  payload, so `PUT {neverExpires: true}` on a campaign that already holds `validForHours` passes it
  while leaving both set. Do not remove that guard as redundant — the same stale "zod is the only
  gate" claim was corrected in the model and in `docs/draws/models.md`.
- **Delete** (`DELETE /api/admin/monthly-coupon/campaign/{id}`): always a soft delete
  (`isActive: false`), never a hard delete. A lazily-minted trigger campaign
  (`validForHours` set) normally has zero issuances until a customer hits its eligibility
  moment, so a hard-delete-when-empty branch would race a concurrent trigger and orphan a
  live `RedeemableIssuance` row — the campaign lookup then misses and `purchaseRequirement`
  collapses to `"none"`, so the orphan reads as MORE claimable than a real coupon.
- **Read** (`GET /api/admin/monthly-coupon/campaign` and the mirrored Norm
  `GET /v1/monthly-coupon/campaign`): both project `validForHours` and `issuanceCount`
  (total `RedeemableIssuance` rows for the campaign, any status) from the shared
  `listCampaignsWithRedemptionCounts` helper in `MonthlyCouponQueryService.ts` — the
  `.select()` projection there must list `validForHours` explicitly or it silently reads as
  `undefined` at runtime despite type-checking cleanly.

See [architecture.md](./architecture.md#expiry-precedence-chain) for the full
`validForHours` > `neverExpires` > `endsAt` precedence chain used at redemption/issuance time.

## Authorization

- Wallet reads / redemption: authenticated session (NextAuth).
- Public prize catalog: unauthenticated (read-only display).
- Admin campaign tools: admin role check inside handler.
