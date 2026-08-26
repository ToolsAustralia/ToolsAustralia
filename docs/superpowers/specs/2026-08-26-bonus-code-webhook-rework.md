# Spec — Bonus-code issuance moves to a Klaviyo webhook

**Branch:** `feature/coupon-klaviyo` · **Status:** unmerged, `git rev-list --count main..HEAD` = 0, 91 uncommitted working-tree files. Nothing in this spec has ever run in production.

---

## 1. In plain English

**What we built, and why it doesn't work.**

We built a system that hands a customer a personal discount code at one of three moments: when they click cancel, when they buy a one-off pack without being a member, and when a guest starts checkout. The moment it fired, we minted the code and started its clock ticking.

The marketing team doesn't email people at that moment. They run nurture sequences — the discount email lands somewhere between two and a half days and seventeen days after the qualifying moment. A code whose clock started at the qualifying moment is already dead by the time the email arrives. Two of the three flows would have shipped a guaranteed-expired code to every customer in them.

**What changes.**

The clock now starts when the email is about to send, not when the customer qualified.

Klaviyo's flows get a new step placed immediately before the discount email: a webhook that calls us. When that call arrives, we create the customer's code and give it exactly 72 hours from that instant. Then the email goes out with the code printed in it. Same flow, one step apart, so the code is always fresh.

**What the marketing team does.**

Three things, in this order, and the order matters:

1. We give them a URL and a secret. They add a webhook step to each of the three flows, immediately above the discount email, with a small piece of text that tells us who the customer is and which flow it is.
2. Somebody on our side creates the three discount campaigns in the admin panel first. If the campaign doesn't exist when the flow runs, the email still sends and the code doesn't work. **The campaigns must exist before the flows are switched on.** This is the reverse of the old launch order and it is the single easiest way to ship a broken launch.
3. They hardcode the code string into the email. Nothing comes back from us into the email — Klaviyo webhooks are one-way.

**What changes for a customer.**

Almost nothing visible, with one exception. Today every bonus code expires at 11:59pm Sydney time. Under the new model a code expires exactly 72 hours after it was issued — so if it was issued at 2:47pm on a Friday, it dies at 2:47pm on the Monday. That is a real change to what the wallet, the checkout page, the email and the support chatbot all tell people, and every one of those has to be updated. Twice a year, when daylight saving shifts, the displayed time will move by an hour (a Friday 2pm issue expires Monday 3pm). That is correct for "exactly 72 hours" and it will look like a bug to anyone who doesn't know, so it goes in the docs.

**What we are deleting, and why.**

The three internal triggers. They were the whole point of the old design and they are the whole problem with it — they start the clock at the wrong moment. All three come out, along with the machinery that existed only to serve them: the five-second budget we used to put on the email send (it existed because the mint was blocking a customer's registration; a webhook blocks nobody), and the calendar-day expiry maths.

**What we are NOT deleting, despite it looking dead.**

The email we send when a code is issued. The email is no longer *needed* to deliver anything — the discount email carries the code now. But it is the only record anywhere that says "we issued this person a code and here's whether the notification went out." There is no admin screen that shows a customer's bonus codes. If we drop it, the answer to "why didn't this customer get their code?" becomes "nobody can tell you." It stays, as a measurement and support record.

**What is deliberately not covered.**

- **The win-back flow's own trigger.** The marketing team's cancellation flow needs to start when someone clicks cancel. Today the only cancellation signal we send to Klaviyo fires when the subscription actually dies at the end of the paid period — up to a month later. That gap is real and this change does not close it, so this spec adds a separate cancel-time signal. It is a companion to this work, not a consequence of it.
- **A new admin screen for bonus codes.** There isn't one today and we're not building one. We are keeping the existing per-code record so that when someone eventually builds it, the data is there.
- **Per-campaign variation of the 72 hours.** It stays configurable in the admin panel (it already is), defaulted to 72. We are not hardcoding it and we are not building anything new around it.
- **Cancelling the discount email when the code fails to mint.** Klaviyo sends the email regardless of what we answer. There is no way to stop it from our side. The mitigations are: make failures loud in our logs, make them retryable where a retry helps, and get the launch order right.

---

## 2. The endpoint contract

### `POST /api/bonus-codes/v1/issue`

**Headers**

| Header | Required | Notes |
|---|---|---|
| `X-Bonus-Code-Secret` | yes | Static shared secret. Compared constant-time with a mandatory length pre-check (`timingSafeEqual` throws on unequal-length buffers — see the idiom at `src/lib/internal-norm/auth.ts:91-95`). The env var accepts a **comma-separated list** so rotation has an overlap window. Never logged, not even truncated. |
| `Content-Type` | yes | `application/json` |

**Body** (Zod-validated at the route boundary)

```jsonc
{
  "userId": "{{ person.user_id }}",   // OPTIONAL — see below
  "email":  "{{ person.email }}",     // OPTIONAL, but one of the two is required
  "trigger": "cancel-click"           // REQUIRED, z.enum of the three values
}
```

`userId` **must be optional.** `{{ person.user_id }}` legitimately renders empty:
- Newsletter-form profiles never receive it (`src/app/api/newsletter/subscribe/route.ts:17-24` sets three properties, none of them `user_id`).
- At registration the server-side profile write that sets it is fire-and-forget behind swallowing catches (`src/app/api/auth/register/route.ts:950-953`; `createKlaviyoProfileAndSubscribe` swallows its own throws at `src/utils/integrations/klaviyo/klaviyo-profile-sync.ts:318-322` and short-circuits entirely when `KLAVIYO_ENABLED === "false"` at `:299-302`).
- The client-side identify only fires for `status === "authenticated"` (`src/components/tracking/KlaviyoUserIdentifier.tsx:44`), and register step 1 does not log the user in.

Guest checkout-start (`LOCKIN100`) is the cohort most exposed to this, and it is one of the three triggers.

**Customer resolution order**
1. If `userId` is present and a valid ObjectId → resolve by `_id`.
2. Else if `email` is present → `findOne({ email: email.trim().toLowerCase() })`. Safe and exact: `User.email` is `unique` + `lowercase` + `trim` at the schema level (`src/models/User.ts:370-376`).
3. If **both** are present and resolve to **different** users → **refuse** (`409`), `console.error`. A disagreement means a stale or merged Klaviyo profile, which is precisely the case where minting to the wrong person is possible. Do not silently prefer one.

**Clarification, 2026-08-26 (fix round 1, finding F1).** Step 2 is an **else-if**, and the implementation must read it that way: the email branch is the fallback for an **absent** `userId`, never a second attempt after a present-and-valid one failed to resolve. A usable `userId` that names no account → `user_not_found` (200), full stop. The first implementation fell through to the email, which lets a stale or merged profile carrying a dead account's `user_id` alongside a live address mint **that** person's one-per-lifetime grant on a signal that was never theirs — the same substitution rule 3 refuses, except silent, because there is no second document to disagree with. A `userId` that is not a valid ObjectId is still treated as **absent** (a half-rendered merge tag), so the fallback applies there as designed.

**Neither identity field's *shape* may veto the call (fix round 1, finding F4).** Since a non-ObjectId `userId` is tolerated and treated as absent, a malformed `email` must be tolerated identically — the Zod schema carries **no** `.email()`, because it would `400` a call that `userId` could have served, and Klaviyo merge tags render partially in the wild. A garbage address is safe to carry into the lookup (`z.string()` guarantees a string, so no operator injection; the unique + lowercase + trim schema means a non-address matches nothing) and falls out as `user_not_found`. `400` is reserved for a body with **no** identity field at all.

**Response body: always opaque.**

```json
{ "ok": true }
```

or `{ "ok": false }`. Nothing else. A richer body — `{ outcome: "spent", expiresAt: "…" }` — turns the endpoint into a customer-state oracle for anyone holding the secret: iterate ObjectIds or emails and read back whether an account exists, whether it is active, whether the grant is spent, and the exact instant of the window. With the email fallback it also becomes an "is this address a Tools Australia customer" oracle for people who never interacted with the attacker. This repo already carries a written incident of exactly that disclosure class at `src/app/api/codes/validate/route.ts:16-24`. Diagnostics go to `console.error` with the existing `[bonus-code]` prefix (`src/services/redeemables/mintBonusCodeForTrigger.ts:147,166`) — production builds strip `log/info/debug/warn` but keep `error` (`next.config.ts` `compiler.removeConsole`).

### Status map

The governing principle: **a non-2xx exists to make Klaviyo retry.** Return 5xx only where a retry can actually recover the customer's grant. Return 2xx wherever a retry would change nothing, so we do not manufacture retry storms for permanent conditions.

| Status | Condition | Why this status |
|---|---|---|
| `200` | Minted. | Done. |
| `200` | Re-armed (lapsed window, outside the re-arm cooldown). | Done. |
| `200` | `already_active` — a live window already exists. | The customer holds a working code. A retry cannot improve it. Mirrors the Stripe receiver, which answers 200 to a duplicate delivery rather than an error (`src/app/api/stripe/webhook/route.ts:42-50,59`). |
| `200` | `spent` — `redeemedEverAt` is set. | Permanent and correct. One grant per person for life (`src/utils/redeemables/bonus-code-policy.ts:43-46`). |
| `200` | No active campaign carries the trigger's code. | The documented inert state (`src/services/redeemables/CampaignService.ts:805`). **But `console.error` it** — under the new model this is a launch-configuration error, not a benign no-op, and it is the cheapest early warning we have. |
| `200` | Customer not resolvable (no such user, `isActive === false`). | Retrying for three days cannot conjure an account. Still `console.error` — a *rising rate* of these is the earliest signal that the flow's merge tags broke. |
| `200` | Customer resolved but not eligible for the campaign. | Audience filters legitimately excluded them. Not retryable. |
| `400` | Body fails Zod, unknown `trigger`, neither `userId` nor `email` present. | Flow misconfiguration. Retrying an invalid enum value forever is pure waste. Echo the offending `trigger` value in the body so it surfaces in Klaviyo's delivery log — this is the one case where a non-opaque body is worth it, because it leaks nothing about a customer. |
| `401` | Missing or wrong `X-Bonus-Code-Secret`. | Honest answer. A retry is harmless because nothing minted. |
| `403` | `process.env.VERCEL_ENV !== "production"`. | See §9. |
| `409` | `userId` and `email` resolve to different users. | Data-integrity refusal. A retry with the same body will refuse identically, but the loud status is what gets it noticed. |
| `429` | Daily issuance budget exhausted or kill switch on. | Fail-closed cap (§9). A retry after the day rolls over succeeds, so a retryable status is right. |
| `500` | **Genuine internal error** — DB unreachable, unexpected throw. | This is the only status where a retry recovers a grant that would otherwise be lost forever. **This status is currently unreachable and that is the blocker in §9.** |

**Retry semantics are UNVERIFIED.** There is no existing inbound Klaviyo route anywhere under `src/app/api` to learn from (only `admin/klaviyo`, `health/klaviyo`, `test/klaviyo-*`), and the Klaviyo MCP server is unauthenticated in this session. The map above assumes non-2xx is retried, 2xx is not, and retries are minutes rather than days. **Confirm this before launch** (§9, item 5). The re-arm cooldown below is designed so that the map is safe under either answer.

### Re-arm cooldown (new, required)

The webhook body always carries a trigger, so `hasTrigger` is permanently true and `decideRearm` rule 3 (`src/utils/redeemables/bonus-code-policy.ts:51-52`) returns `"rearmed"` for **any** lapsed row. A late retry, a flow re-entry, or the marketing team re-running a flow therefore silently hands out a second full 72-hour window and a second email — "one grant per person for life" quietly becomes "one per flow re-entry." Nothing today prevents this and nothing about a `{campaignId, userId}` unique index helps: that index stops concurrent double-*inserts* (`src/models/RedeemableIssuance.ts:109`), not sequential replays.

Add a cooldown in `decideRearm`: refuse a re-arm within `REARM_COOLDOWN_DAYS` (default 30) of `firstIssuedAt`, returning `expired_no_rearm`. `firstIssuedAt` is already preserved across every re-arm via `$min` specifically so it can answer this question (`src/services/redeemables/CampaignService.ts:645-647` and its comment).

Under the old end-of-day model this hole was partly masked: `BonusCodeNotifier`'s dedupe key is `issuanceId:expiresAtISO` (`src/services/redeemables/BonusCodeNotifier.ts:43-45`), so two re-arms on the same Sydney day collapsed into one email. An exact 72-hour offset makes every re-arm a distinct instant, so that collapse **silently disappears**. The cooldown replaces it, deliberately and visibly.

---

## 3. The expiry computation

Exact-offset arithmetic on epoch milliseconds. DST-safe by construction — DST is a property of the calendar projection, not of the timeline, so millisecond arithmetic cannot be affected by it. **No `date-fns-tz`, no calendar triple, no `createAESTDateAsUTC`, and — critically — no `.setUTCSeconds(59, 999)`.**

New home: `src/utils/redeemables/bonus-code-policy.ts`, whose header already states the contract this satisfies ("Pure: no DB, no ambient clock. `now` is always injected"). It does not belong in `src/utils/common/timezone.ts` — there is no timezone in it.

```ts
/**
 * Exact expiry offset for a per-customer bonus code.
 *
 * Epoch-millisecond arithmetic, deliberately. The predecessor
 * (endOfDayAESTAfterDays) added CALENDAR days in Australia/Sydney and snapped to
 * 23:59:59.999 local, because the emailed deadline was a wall-clock time. Under
 * the webhook model the deadline is a DURATION from the instant Klaviyo called
 * us, so the correct arithmetic is the timeline, not the calendar.
 *
 * TRADE, stated so nobody "fixes" it: duration-exact is NOT wall-clock-stable.
 * Across a Sydney DST transition the displayed time-of-day shifts by one hour —
 * a Fri 2:00pm AEST issue expires Mon 3:00pm AEDT (verified: elapsed 72.0h).
 * That is the OPPOSITE trade from the old model, which pinned the wall clock and
 * let the real duration float between 13 and 15 days — the exact bug
 * expiry-window.test.ts was written to catch.
 *
 * DO NOT re-apply `.setUTCSeconds(59, 999)`. That existed only because
 * createAESTDateAsUTC hardcodes seconds to :00 and the redemption gate is
 * strictly exclusive (`expiresAt: { $gt: now }`, RedemptionService.ts:247), so a
 * 23:59:00.000 bound would kill the coupon 60s before the emailed "11:59pm". An
 * exact offset is already millisecond-precise; re-applying it would silently
 * make every window 72h + up to 59.999s.
 */
export function expiryAfterHours(from: Date, hours: number): Date {
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}
```

Wired into the existing precedence chain, replacing the `personalWindowGoverns` branch:

```ts
// src/services/redeemables/CampaignService.ts:50-60 — precedence UNCHANGED:
//   validForHours > neverExpires > campaign.endsAt
export function resolveIssuanceExpiry(
  campaign: Pick<IMonthlyEntryCampaign, "validForHours" | "neverExpires" | "endsAt">,
  issuedAt: Date
): Date | null {
  if (personalWindowGoverns(campaign)) {
    return expiryAfterHours(issuedAt, campaign.validForHours as number);
  }
  if (campaign.neverExpires) return NEVER_EXPIRES_ISSUANCE_DATE;
  return campaign.endsAt ?? null;
}
```

`personalWindowGoverns` keeps its name and its role as *the* definition of "personal window" — only the field it reads changes:

```ts
// src/utils/redeemables/bonus-code-policy.ts:60-62
export function personalWindowGoverns(campaign: { validForHours?: number | null }): boolean {
  return typeof campaign.validForHours === "number" && campaign.validForHours >= 1;
}
```

**Field decision: rename `validForDays` → `validForHours`. Do not add a second field.**

1. **No migration exists to protect.** `git grep -n validForDays main -- src` returns empty; `git rev-list --count main..HEAD` = 0. The field has never existed outside this working tree, and the mint path additionally refuses to run outside `VERCEL_ENV === "production"` on code that has never shipped. No production document can carry it via any app path. (One theoretical exception: a hand-written Mongo document. A one-line `countDocuments({ validForDays: { $exists: true } })` before renaming settles it.)
2. **Two window fields would fork one concept** across 8 production consult sites and triple the mutual-exclusion matrix — `neverExpires × validForDays` is already guarded in four separate places (`src/app/api/admin/monthly-coupon/campaign/route.ts:49-55`, `src/app/api/admin/monthly-coupon/campaign/[id]/route.ts:25-30`, `src/models/MonthlyEntryCampaign.ts:174-175`, `src/services/redeemables/CampaignService.ts:221-229`). Exactly the "one concept, one name" fork the global CLAUDE.md rule forbids.
3. **Do not hardcode 72 and delete the field.** It is not only the arithmetic input — it is the **flag** that distinguishes a trigger campaign from a legacy one at all 8 consult sites, including two leak defences that exist to stop a one-per-lifetime grant being burned silently (`src/services/redeemables/CampaignService.ts:332` cron refusal, `:444` wallet-sweep refusal). Removing it would require a replacement boolean — strictly worse than keeping a number.
4. `validForHours` matches existing repo vocabulary (`partnerDiscountHours`, `discountHours` — `src/models/User.ts:130,311`), so no new term is being coined.

Keep `min: 1`. One hour is a legitimate window and the `>= 1` threshold is load-bearing as the personal-window predicate.

---

## 4. Ordered change list

### ADD

| # | File | Change | Why |
|---|---|---|---|
| A1 | `src/utils/redeemables/bonus-code-policy.ts` (new export, after `:53`) | `expiryAfterHours(from, hours)` per §3. | Replaces the calendar-day helper. Pure module, matches the file's stated contract. |
| A2 | `src/utils/redeemables/bonus-code-policy.ts:39-53` | `decideRearm` gains a 4th param `firstIssuedAt?: Date \| null` and a cooldown: refuse re-arm within `REARM_COOLDOWN_DAYS` of it → `expired_no_rearm`. | The webhook always supplies a trigger, so rule 3 never refuses and every late retry / flow re-entry grants a second window. See §2. |
| A3 | `src/lib/bonus-code-webhook/auth.ts` (new) | Constant-time secret check over `BONUS_CODE_WEBHOOK_SECRET` (comma-separated list). Fail **closed** on an unset secret → `{ ok: false, status: 500, reason: "misconfigured" }`. | Copy the length-guarded shape at `src/lib/internal-norm/auth.ts:91-95` (`safeEqualHex` at `:66-73` is module-private and cannot be imported). **Do NOT copy `src/app/api/cron/monthly-redeemables-issuance/route.ts:9-14** — `if (!cronSecret) return true` fails OPEN and compares with `===`; it is the most dangerous nearest-neighbour in the repo. |
| A4 | `src/lib/bonus-code-webhook/budget.ts` (new) | Fail-closed daily issuance cap + env kill switch. Pattern: `src/lib/support-chat/costGuard.ts:110-143` — `try { … } catch { return { ok: false } }`, so a DB outage **blocks** minting rather than uncapping it. Env: `BONUS_CODE_DAILY_MINT_CAP` (default 500), `BONUS_CODE_KILL_SWITCH`. | The only control that survives a leaked secret. `withChatbot`'s header names this exact pattern as "the real backstop against abuse" precisely because the rate limiter is not (`src/lib/support-chat/withChatbot.ts:21-23`). BUSINESS.md:766 already concedes "No cap exists on total issuance … no per-campaign budget and no alert." |
| A5 | `src/lib/bonus-code-webhook/audit.ts` (new) | Best-effort durable row for **every** call — accepted, refused, errored: `requestId`, hashed IP, `trigger`, resolved `userId`, outcome, status. Never throws; dynamic imports keep Mongoose off the module top level. | Pattern: `src/lib/support-chat/audit.ts:1-69` (`hashIp` at `:19-21`, `writeChatAudit` at `:43-69`). **Not** `NormCallLog` — it requires a `registryKey` and a Norm-tier enum (`src/models/NormCallLog.ts:5-52`), so reusing it would register a Klaviyo marketing endpoint inside Norm's admin gateway and inherit rule-10 lockstep. The `RedeemableIssuance` row cannot capture refused calls or enumeration sweeps. |
| A6 | `src/models/BonusCodeWebhookCall.ts` (new) | The audit model for A5. TTL-indexed (90 days). | One new model, justified: without it the only incident-response answer is `console.error` in finite Vercel log retention. |
| A7 | `src/app/api/bonus-codes/v1/issue/route.ts` (new) | Thin handler: `connectDB()` → read raw body once via `request.text()` → env assertion → secret → budget → Zod → resolve customer → delegate to `mintBonusCodeForTrigger` → map outcome to status → audit. | House conventions all from `src/app/api/stripe/webhook/route.ts:18-64`. Middleware never runs for `/api` (negative lookahead at `src/middleware.ts:257`), so this route owns 100% of its authorization. |
| A8 | `src/utils/integrations/klaviyo/klaviyo-events.ts` (~`:1000`, after the bonus-code builder) | `createSubscriptionCancellationRequestedEvent(user, data)` → event name **`"Subscription Cancellation Requested"`**. Properties: `user_id`, `...formatCanonicalPackageData({ … })` from a real `membershipPackages` lookup, `cancelled_at` (ISO, from `user.subscription.cancelledAt`), `access_ends_at` (ISO, from `user.subscription.endDate`). | The win-back flow's trigger. Title Case matches the 21-name catalogue and is unambiguously distinct from `"Subscription Cancelled"`. Every property is canonical or `*_at`, so it passes the CI fence at `src/utils/integrations/klaviyo/__tests__/canonical-events-shape.test.ts:74-78` with **no** `CANONICAL_KEYS` addition. Use `formatCanonicalPackageData` (`src/utils/integrations/klaviyo/klaviyo-helpers.ts:707-719`), never the legacy formatter — the existing cancellation event hardcodes `packageName: "Subscription"` (`src/services/stripe-webhook-handlers/index.ts:2783`) and ships the raw package id twice as both `tier` and `package_id` (`:2782,2784`), so a template cannot print a tier name from it. Do not repeat that. |
| A9 | `src/utils/integrations/klaviyo/klaviyo-events.ts:449-464` | Add `had_active_subscription: boolean` to `createOneTimePackagePurchasedEvent`, passed the **pre-grant** `user.subscription?.isActive`. Add the key to `CANONICAL_KEYS` (`canonical-events-shape.test.ts:28-67`) **and** the property table in `docs/tracking/KLAVIYO_INTEGRATION.md:311-314` in the same edit. | This is the discriminator that dies with the deleted call site (`src/utils/payment/payment-processing.ts:1456`) and it cannot be reconstructed days later. The event carries no membership status today, so a Klaviyo flow could only filter on the live `has_active_subscription` profile property (`klaviyo-helpers.ts:271-272`) — which is false for paused and past-due members and **true** for scheduled-cancel members. Past-tense name marks the point-in-time semantics without forking the vocabulary. |
| A10 | `.env.example` (beside `KLAVIYO_*` at `:75-80`) | Register `BONUS_CODE_WEBHOOK_SECRET`, `BONUS_CODE_DAILY_MINT_CAP`, `BONUS_CODE_KILL_SWITCH` with comments + blank/safe placeholders. | Rule 9: `.env.example` is the registry; register in the same commit. Set the values in this worktree's `.env.local`, the main folder's `.env.local`, **and** Vercel (production environment only) at the same time. Verify with `npm run check:env`. |
| A11 | `CLAUDE.md` Domain Manifest → **rewards-redeemables** `paths` | Add `"src/app/api/bonus-codes/**"`. | No manifest glob matches it today — `src/app/api/codes/**` is a different path under minimatch — so `findDomain` returns null (`.claude/hooks/doc-sync.mjs:216-223`) and the route is a permanent orphan. Reuse the existing domain: it already owns `src/services/redeemables/**`, `src/app/api/redeemables/**`, `src/utils/redeemables/**`, `src/models/RedeemableIssuance.ts`, and `docs/rewards-redeemables/` already carries the whole bonus-code narrative. Do not create a new domain (rules 3 and 4). Also add `src/lib/bonus-code-webhook/**` and `src/models/BonusCodeWebhookCall.ts`. |
| A12 | `.claude/hooks/doc-sync.mjs:25-52` and `:63-85` | Add `"src/app/api/bonus-codes/**"` and `"src/utils/redeemables/**"` to **both** `BUSINESS_TRIGGER_GLOBS` and `CUSTOMER_TRIGGER_GLOBS`. | Verified gaps. `src/utils/redeemables/**` is in neither list today, yet `bonus-code-policy.ts` owns `BonusCodeTrigger`, `personalWindowGoverns` and `isCampaignRedeemable` — the rename lands squarely there and would trigger no block. The new route is likewise invisible to both, and it is the single most business-material file in the change. |
| A13 | `package.json` (beside `:480-487`) | `test:bonus-code-expiry` repointed (see §7), plus `test:bonus-code-webhook`. | Rule: a new test file without a `test:*` entry is undiscoverable. |

### CHANGE

| # | File:line | Change | Why |
|---|---|---|---|
| C1 | `src/services/redeemables/CampaignService.ts:828` | The catch returns `{ outcome: "error" }`, **not** `not_applicable`. Widen `StampedIssuanceResult.outcome` at `:37` to `RearmOutcome \| "not_applicable" \| "error"`. Leave the five deliberate no-op returns (`:572`, `:692`, `:786`, `:805`, `:811`, `:816`) as `not_applicable`. | **THE BLOCKER.** Today six causes — invalid ObjectId, no campaign, user missing/inactive, ineligible, unresolvable expiry, *and the catch-all including a transient Mongo failure* — collapse into one value. The endpoint literally cannot choose between "nothing to do, do not retry" and "the database blinked, please retry." Without this, the entire status map in §2 is unwritable and every infra blip becomes a permanently lost grant with a discount email already in flight. Also add an explicit `console.error("[bonus-code] no active campaign for code", …)` on the `:805` path. |
| C2 | `src/services/redeemables/mintBonusCodeForTrigger.ts:134` | Signature becomes `(user: IUser, trigger: BonusCodeTrigger): Promise<StampedIssuanceResult>` — return the outcome instead of `void`. Update the file's JSDoc (`:2-9`) from "the ONE call site shape for the three eligibility moments" to "the service the Klaviyo webhook route delegates to." Keep the name and the never-throws contract. | Repurpose, do not delete. Its body is exactly the orchestration the endpoint needs, and the layering rule that caused it to be extracted (`docs/auth/api.md:27`, "a route handler must not orchestrate a mint-and-email") applies identically to the new route. The route needs the outcome to pick a status. |
| C3 | `src/services/redeemables/mintBonusCodeForTrigger.ts:137-154` | Keep the `VERCEL_ENV !== "production"` gate. Update the comment to name the webhook route as the caller. | See §9. |
| C4 | `src/services/redeemables/mintBonusCodeForTrigger.ts:163` | Replace `notifyWithinBudget(...)` with a direct `await BonusCodeNotifier.notify(...)`. | See D4 — the budget's entire justification (`:28-35`) is the awaited registration hot path, which a webhook handler does not have. |
| C5 | `src/services/redeemables/CampaignService.ts:57` | `endOfDayAESTAfterDays(issuedAt, campaign.validForDays)` → `expiryAfterHours(issuedAt, campaign.validForHours)`. Drop the import at `:13`, add the new one. | §3. |
| C6 | `src/services/redeemables/CampaignService.ts:590` | Pass `existing?.firstIssuedAt ?? existing?.issuedAt` into `decideRearm` as the 4th arg. | Wires A2. |
| C7 | **All `validForDays` → `validForHours` sites.** Typed (tsc catches): `src/models/MonthlyEntryCampaign.ts:22,96,98`; `src/utils/redeemables/bonus-code-policy.ts:60,61,77`; `src/services/redeemables/CampaignService.ts:51,107,151`. | Mechanical rename. | |
| C8 | **The `.select()` / query-key sites — tsc does NOT catch these.** `src/services/redeemables/RedeemablesWalletService.ts:81`; `src/services/redeemables/MonthlyCouponQueryService.ts:83`; `src/services/redeemables/CampaignCodeValidationService.ts:89`; **query legs**: `src/services/redeemables/RedemptionService.ts:92` and `src/services/redeemables/CampaignCodeValidationService.ts:87` (both `{ validForDays: { $gte: 1 } }`). | Rename the string literal. | A missed projection reads back `undefined` with no compile error — `RedeemablesWalletService.ts:74-78` carries an in-code warning that this exact omission "silently defeats" both `isRedeemableNow` and the expiry label, which means it has bitten before. A missed **query leg** is worse: it matches zero documents forever, so live personal-window codes stop working with no error anywhere. **Grep for the string literal, not the identifier.** |
| C9 | `src/lib/internal-norm/schemas/monthly-coupon.ts:50,53` **and** `src/app/api/internal/norm/v1/monthly-coupon/campaign/route.ts:37` | Rename in lockstep, then `npm run build:norm-manifest` and `npm run norm:smoke`, then update `docs/internal-norm/norm-context.md`. | Rule 10. A schema↔output mismatch is a **runtime 500** invisible to `tsc`. |
| C10 | Guards + clearing + probe: `src/models/MonthlyEntryCampaign.ts:174-175,189,200`; `src/services/redeemables/CampaignService.ts:221-229,248-253`; `src/app/api/admin/monthly-coupon/campaign/route.ts:23,49-53,82,137`; `src/app/api/admin/monthly-coupon/campaign/[id]/route.ts:18,25-29`; `src/app/api/cron/monthly-redeemables-issuance/route.ts:25,32`; `src/services/redeemables/MonthlyCouponQueryService.ts:52,54,123`. | Rename all. | Six guard copies of the same mutual-exclusion rule. Renaming three of six leaves an inconsistent set — and `pre('save')` does **not** run on the update path (`src/models/MonthlyEntryCampaign.ts:166-173`), so the merged-state guard at `CampaignService.ts:221-229` is the only authoritative one there. The three leak defences (`cron route:32`, `CampaignService.ts:332`, `:444`) all key off this field; missing one silently reclassifies a trigger campaign as legacy and re-opens mass-minting. |
| C11 | `src/components/modals/AdminMonthlyRedeemablesModal.tsx:52,121,134-144,180,237-253,281,332,472,496-498,511-512` and label `:505` / placeholder `:514` / helper copy `:515-518`; `src/components/admin/MonthlyRedeemablesCampaignPanel.tsx:22,57,60,62-63,400-401` | Rename + label "Per-customer window (**hours**)", placeholder `"e.g. 72 — leave blank for a fixed end date"`, chips `"{n}-hour window per customer"`. **Rewrite the helper copy**: it currently promises the window starts "this many days after THEY qualify" — under the webhook model the anchor is when the flow fires the webhook, 2.5–17 days later. Those are now different moments. | Two separate wrongnesses: the unit, and the anchor. |
| C12 | `src/services/subscription/CancelSubscriptionService.ts:34-43,75` and `src/app/api/stripe/cancel-subscription/route.ts:48-51` | **Rename** `mintBonusCode` → `isMemberChurn`. Keep the `= false` default and the JSDoc rationale verbatim. | Do not delete it (see §5/D2 exclusion). It is the only thing in the codebase that distinguishes member churn from the two non-churn cancellations, and the new cancel-time event needs exactly that gate. Rename rather than adding a second boolean — one act-shaped flag, one decision point. `CancelSubscriptionOptions` is re-exported (`src/services/subscription/index.ts:1`) but the only importers of `cancelSubscription` are the two cancel routes and `switchTierPastDue.ts:127`, so the change is contained. |
| C13 | `src/services/subscription/CancelSubscriptionService.ts:185-192` | Replace the mint block with `if (isMemberChurn) klaviyo.trackEventBackground(createSubscriptionCancellationRequestedEvent(user, …))`. Place it **after** `await user.save()` at `:162` so `cancelledAt` / `endDate` / `autoRenew` are already persisted. Fire-and-forget, not awaited (`trackEventBackground` returns `void` — `src/lib/klaviyo.ts:1846`). | The win-back flow needs a cancel-**click** trigger. `"Subscription Cancelled"` fires only from `handleSubscriptionDeleted` (`src/services/stripe-webhook-handlers/index.ts:2778-2787`), which for a cancel-at-period-end cancellation arrives at period end — up to a month later — and is not even guaranteed then (early-returns at `:2642-2649` and `:2693-2705`). A segment trigger cannot substitute: on the period-end path `subscription.status` is **not** changed (`status = "canceled"` is set only in the `shouldCancelImmediately` branch at `:139-145`), so `deriveMembershipStatus` still reports `active` after the profile sync at `:194`. |
| C14 | `src/services/subscription/CancelSubscriptionService.ts:171-172` | Amend the duplicate-suppression comment with an explicit named carve-out for `"Subscription Cancellation Requested"`. | Without it the next reader deletes the new emit as a rule violation — three rule docs say the webhook is the only emitter. |
| C15 | `src/app/api/auth/register/route.ts:137` | Revert `fireKlaviyoStartedCheckoutForGuestRegistration` to a **sync** `void` function; drop the four `await`s at `:554`, `:693`, `:795`, `:959`; update the JSDoc at `:130-136`. **Keep the helper** — it emits `"Started Checkout"` (`:158-169`), the flow entry point for the guest checkout-start nurture the webhook now lives inside. | The only awaited expression in the body was the mint (`:180`). Lint will **not** catch a leftover `await`-on-void: the ESLint config is not type-aware (`eslint.config.mjs:18`, `next/core-web-vitals` + `next/typescript`, no `await-thenable`). Remove them deliberately. |
| C16 | `src/services/redeemables/BonusCodeNotifier.ts:21-34` | Keep the inner `VERCEL_ENV` backstop. Update the comment to name the webhook route. | Cheap; the failure mode it guards (emailing a real customer from a preview) is unchanged. |

### DELETE

| # | File:line | What goes |
|---|---|---|
| D1 | `src/app/api/auth/register/route.ts:35, 172-183` | The `mintBonusCodeForTrigger` import and the entire mint block + its inner try/catch. |
| D2 | `src/services/subscription/CancelSubscriptionService.ts:25, 185-192` | The import and the mint block. (The **option** is renamed, not deleted — C12.) |
| D3 | `src/utils/payment/payment-processing.ts:34, 1451-1466` | The import and the `packageType === "one-time" && !user.subscription?.isActive` block. **`IUser` at `:34` is a separate import and is still used at `:1908, :1989, :2058, :2140` — do not remove it.** |
| D4 | `src/services/redeemables/mintBonusCodeForTrigger.ts:27-61, 63-124` | `NOTIFY_TIMEOUT_MS`, `NOTIFY_UNCONFIRMED_ERROR`, `notifyWithinBudget`, and the `RedeemableIssuance` import at `:21` that only the unconfirmed-marker write uses. |
| D5 | `src/utils/common/timezone.ts:288-323` | `endOfDayAESTAfterDays` and its doc block. **Nothing else in that file.** |
| D6 | `src/utils/common/__tests__/expiry-window.test.ts` | Whole file (replaced — §7). |
| D7 | `src/services/redeemables/__tests__/bonus-code-trigger.test.ts:45, 224-283 (partial), 486-620` | Sections 3-5, the `BONUS_CODE_BY_TRIGGER` import, the BACKIN200 refuse-to-run guard, the Klaviyo stub + identity gate, the `VERCEL_ENV` save/restore, the SIGINT/SIGTERM handler. See §7 for the load-order trap. |

---

## 5. Deletion list with evidence

Every claim below was verified by reading the file, not by trusting a name.

### D1–D3 — the three internal trigger call sites

`grep -rn mintBonusCodeForTrigger src` returns exactly four hits: the declaration at `src/services/redeemables/mintBonusCodeForTrigger.ts:134`, and three production callers — `src/app/api/auth/register/route.ts:180`, `src/services/subscription/CancelSubscriptionService.ts:187`, `src/utils/payment/payment-processing.ts:1461` — plus one test require at `src/services/redeemables/__tests__/bonus-code-trigger.test.ts:263`. The symbol is deliberately **not** re-exported from `src/services/redeemables/index.ts` (`docs/rewards-redeemables/backend.md:16` says so explicitly), so no other reachability path exists. Nothing in `scripts/`, `e2e/`, or the Norm schemas references any of it.

**The module itself is NOT deleted** — see C2. Its body is the orchestration the endpoint needs, and inlining it in the route handler would recreate the layering violation that caused it to be extracted (`src/services/redeemables/mintBonusCodeForTrigger.ts:2-9`).

### D4 — the notify wait budget

`NOTIFY_UNCONFIRMED_ERROR` is exported at `:61` and has **no importer anywhere** in `src` or `scripts`. `NOTIFY_TIMEOUT_MS` (`:52`) and `notifyWithinBudget` (`:64-124`) are module-private with one caller each (`:163`). The stated justification is entirely about the registration hot path: "this call is AWAITED on the registration path, ahead of the Meta/TikTok CAPI work — and every other blocking outbound call on that route is bounded at 5s… A 30s stall cannot fail a registration but reads to the customer exactly like one" (`:28-35`). A dedicated webhook handler has no host request to protect. **Delete the third `notifyError` state from `docs/rewards-redeemables/models.md:21` in the same change** — it documents the marker by name and instructs support "Do not re-send on the unconfirmed marker without checking Klaviyo first."

### D5 — `endOfDayAESTAfterDays`

Declared `src/utils/common/timezone.ts:305`. `grep -rn endOfDayAESTAfterDays src scripts` returns exactly two non-declaration hits: `src/services/redeemables/CampaignService.ts:13` (import) and `:57` (the sole production call), plus `src/utils/common/__tests__/expiry-window.test.ts:1,60,70`. That single call site is `resolveIssuanceExpiry`'s personal-window branch, which is unreachable from every non-trigger path: the cron filters personal-window campaigns out (`src/app/api/cron/monthly-redeemables-issuance/route.ts:32`), `issueCampaignToUsers` refuses them for `issuedBy === "cron"` (`src/services/redeemables/CampaignService.ts:332`, and the cron is its only caller at `route.ts:51`), and the wallet sweep is refused by the leak defence because it passes no trigger (`CampaignService.ts:444`).

It dies because the **window semantics** change, not because the triggers are removed.

**Two adjacent traps — do not follow the dependency graph in either direction:**
- **Down:** it calls `createAESTDateAsUTC` at `:314`, which has roughly a hundred callers across admin dashboards, the anchor-day-24 billing logic (`src/utils/billing/anchor-billing.ts:77,134`), promo calendars, draws and four scripts. **Keep it.**
- **Sideways:** `getAESTAbbreviation` at `:326` looks orphaned next to the deleted function — its only caller is `formatExpiryLabelAEST` one line below at `:345`. But `formatExpiryLabelAEST` survives with four production callers: `src/services/redeemables/RedeemablesWalletService.ts:159` and `:200` (the second serves **milestone** issuances, unrelated to bonus codes), `src/services/redeemables/CampaignCodeValidationService.ts:47`, and `src/utils/integrations/klaviyo/klaviyo-events.ts:985`. **Keep both.**

### D7 — the trigger-test sections

Sections 3-5 exercise only the deleted mint path, the `VERCEL_ENV` gate and the notifier. **But the load order is a trap that a naive deletion will spring** — see §7.

### NOT deleted, despite looking dead

- **`BonusCodeNotifier`** — sole caller is `mintBonusCodeForTrigger:72`. Kept because the event is kept (§6).
- **`notifiedAt` / `notifyError`** (`src/models/RedeemableIssuance.ts:31,33` and schema `:101-102`) — three writers (`BonusCodeNotifier.ts:53-54`, `mintBonusCodeForTrigger.ts:110`, `CampaignService.ts:646` clearing on re-arm), zero readers. Kept because the event is kept. **`:110` goes with D4; the other two stay.**

  **Deletion-safety warning if a future change does drop them:** `notifiedAt` is a **name collision** with an unrelated live feature. `src/lib/email/templates.ts:304` declares `notifiedAt: Date` on the mini-draw full-capacity email payload and **reads** it at `:308`, fed from `src/lib/email/email-service.ts:264,272`, previewed at `src/components/email-preview/MiniDrawFullCapacityPreview.tsx:18,26`. Scope any deletion by path, never by symbol; put `src/lib/email/**` and `src/components/email-preview/**` on the forbidden list.
- **`BONUS_CODE_BY_TRIGGER`** (`src/config/bonusCodes.ts:19-23`) — its only consumer moves from the trigger helper to the endpoint. The endpoint's stated job is "maps trigger → campaign code"; this is that map. Note it is in `BUSINESS_TRIGGER_GLOBS` (`.claude/hooks/doc-sync.mjs:34`), so editing it forces a README/BUSINESS touch.

---

## 6. What survives untouched — do not re-litigate

| Thing | Evidence it is not trigger-coupled |
|---|---|
| `decideRearm` | Reachable from the **wallet read path**: `RedeemablesWalletService.ts:60` → `CampaignService.ts:765` (`ensureActiveCampaignIssuancesForUser`, `:740`) → `createIssuanceForUser` (`:564`) → `:590`. Only the cooldown param is added (A2). |
| `personalWindowGoverns` | Six non-trigger consumers: `RedemptionService.ts:234,251`; `RedeemablesWalletService.ts:117`; `CampaignCodeValidationService.ts:127,134`; `MonthlyRedeemablesCampaignPanel.tsx:62,400`; `CampaignService.ts:54,332,444,469`. Field renamed, semantics identical. |
| `isCampaignRedeemable` | Consumed by the redemption gate (`RedemptionService.ts:191`), independent of how a code was minted. |
| `BonusCodeTrigger` | Consumed by `CampaignService.ts:8,437,568,782` — the endpoint still passes a trigger, so the targeting relaxation still fires. |
| `CampaignService.ensureCampaignIssuanceForUser` shape | `:779`. Resolve by code → eligibility with trigger → mint/re-arm → never throw. Exactly what the endpoint needs. Only the return **union** widens (C1). |
| `triggerIsTargeting` relaxation | `CampaignService.ts:469`. Waives exactly two things — active-subscription and email-verified — and the comment at `:461-478` is explicit that manual/CSV pins, `excludeUserIds`, states, `membershipTiers`, `topEntriesPercent` and the inactivity window all still gate. Unchanged. |
| `redeemedEverAt` / `firstIssuedAt` | `RedeemableIssuance.ts:27,29`. `redeemedEverAt` is what holds "one grant per person for life" across a refund; read by `RedemptionService.ts:234,251`, `RedeemablesWalletService.ts:142,176`, `CampaignCodeValidationService.ts:127`. `firstIssuedAt` now also anchors the cooldown. |
| `formatExpiryLabelAEST` + `getAESTAbbreviation` | Four production callers (§5, D5). |
| `createAESTDateAsUTC` | ~100 callers including anchor-day-24 billing. |
| `resolveIssuanceExpiry`'s `neverExpires` / `endsAt` branches | Serve the legacy cron bulk-issuance path (`CampaignService.ts:349` inside `issueCampaignToUsers`). |
| The four `isInitialSubscriptionInvoice` gates on `campaignCode` | `src/services/stripe-webhook-handlers/index.ts:4347,4397,4434,4451` (predicate `:4324`). They stop a **renewal** invoice auto-redeeming a re-armed grant — and re-arm survives this change. |
| The batch-instant hoisting in `issueCampaignToUsers` | `CampaignService.ts:346-349`. Still correct; it just stops being load-bearing, because an exact offset has no midnight cliff. |
| `unique_id` on `KlaviyoEvent` | `src/types/klaviyo.ts:177`, spread into the payload at `src/lib/klaviyo.ts:1802`. Generic transport wiring. |
| `"Started Checkout"` emit | `register/route.ts:158-169`. The flow entry point for the guest checkout-start nurture. Only the helper's async-ness reverts. |
| The strictly-exclusive redemption gate | `RedemptionService.ts:247` (`expiresAt: { $gt: now }`). Unchanged — only the `:59.999` compensation for it goes. |

**Decisions made, so a reviewer does not reopen them:**

- **Keep `"Bonus Code Issued"`.** It is no longer needed to populate the email, but `BonusCodeNotifier.notify` is the only writer of `notifiedAt` / `notifyError` (`BonusCodeNotifier.ts:49-56`), and `grep -rn "RedeemableIssuance" src/app/api/admin/ src/services/admin/` returns **zero hits** — there is no admin or Norm surface anywhere that reads a customer's issuances. Dropping the emit is a support-tooling regression disguised as a marketing-metrics decision. Emit it from the endpoint after a successful mint. **Drop the wait budget** (D4).
- **No rate limiter on this route.** The fail-closed daily budget (A4) is the global cap and it is the only control that survives a leaked secret. `createDistributedRateLimiter` **fails open** by design (`src/utils/security/rateLimiter.ts:130-134`) and `createRateLimiter` is per-lambda and bypassable (`:77-87`), so neither is an integrity control. Keying on IP would be actively harmful — Klaviyo calls from a shared egress pool, so every customer's flow collapses into one bucket, throttling legitimate sends while capping nothing per-customer. Per-customer protection is `redeemedEverAt` + `decideRearm` + the new cooldown.
- **One secret, comma-separated for rotation — not three per-trigger secrets.** Compartmentalisation would cut a leaked-secret take by two thirds, but `redeemedEverAt` already caps every account at three redeemed grants for life and the daily budget caps the aggregate, so the marginal benefit is small against tripling the marketing-side config surface. Rotation without downtime is the real requirement and the comma list buys it: add new → marketing updates flows → remove old.
- **No cancellation `reason` on the new event in v1.** It is the most useful segmentation field, but `startFlow` persists it (`src/services/subscription/CancellationFlowService.ts:96-105`) while the cancel POST body carries only `{ cancelAtPeriodEnd }` (`src/components/modals/CancellationFlowModal/Step4Confirm.tsx:76-79`) — so it costs an extra query on the cancel path for a value that can be null (`types.ts:81` types `eventId` as `string | null`), plus a `CANONICAL_KEYS` addition. Flagged as a follow-up, not shipped.

---

## 7. Test list

This repo has no test runner. Tests are standalone `tsx` scripts wired to their own `package.json` script.

### NEW

**`src/utils/redeemables/__tests__/expiry-hours.test.ts`** → `"test:bonus-code-expiry": "tsx src/utils/redeemables/__tests__/expiry-hours.test.ts"` (repoints the existing entry at `package.json:480`; the old file is deleted).

Pure, no DB. Must assert:
1. **DST spring-forward** — `from = 2026-10-02T04:00:00.000Z` (Fri 2 Oct 2:00pm AEST), `+72h` → elapsed exactly `72 * 3600 * 1000` ms, and `formatExpiryLabelAEST` reads `3:00PM AEDT`. This is the wall-clock shift; assert it deliberately so nobody "fixes" it.
2. **DST fall-back** — `from = 2026-04-03T04:00:00.000Z` (Fri 3 Apr 3:00pm AEDT) → `2:00PM AEST`, elapsed exactly 72h.
3. **Plain winter, year rollover, leap day** — elapsed exactly 72h in each.
4. **No second rounding** — `expiryAfterHours(new Date("2026-06-10T13:47:33.421Z"), 72).getUTCMilliseconds() === 421`. This is the guard against someone re-introducing `.setUTCSeconds(59, 999)`.
5. `formatExpiryLabelAEST` still renders correctly for a non-midnight instant.

**`src/lib/bonus-code-webhook/__tests__/webhook-contract.test.ts`** → `"test:bonus-code-webhook"`. Pure, stubbed deps:
- Missing header → 401; wrong-length header → 401 (**not** a thrown `timingSafeEqual`); unset server secret → 500.
- Unknown `trigger` → 400.
- Neither `userId` nor `email` → 400.
- `userId` + `email` disagreeing → 409.
- Service returns `"error"` → **500**; returns `not_applicable` → **200**. This is the assertion that pins C1 and it is the most important test in the change.
- Budget gate returns `{ ok: false }` → 429.
- `VERCEL_ENV !== "production"` → 403.
- Response body is exactly `{ ok: true }` / `{ ok: false }` on every path except 400.

**Add to `src/utils/redeemables/__tests__/bonus-code-policy.test.ts`**: the re-arm cooldown — a lapsed row with `firstIssuedAt` inside the cooldown returns `expired_no_rearm` even with `hasTrigger: true`; outside it returns `rearmed`; a row with no `firstIssuedAt` behaves as before.

### MUST CHANGE

| Suite | Assertions that change | Assertions that must NOT change |
|---|---|---|
| `test:bonus-code-expiry` (`src/utils/common/__tests__/expiry-window.test.ts`) | **Whole file deleted.** Not patchable: `:1` imports the deleted function; all five `CASES` (`:24-55`) assert an end-of-day instant, an `11:59PM` label and a 14-whole-Sydney-day span simultaneously; `:68-72` pins the `:59.999` hack that must be removed; and `sydneySpanDays` (`:16-21`) measures whole calendar days and cannot express 72 hours. Replaced by the new file above. | — |
| `test:issuance-expiry` (`src/services/redeemables/__tests__/issuance-expiry.test.ts`) | `:44` (14-day end-of-day instant `2026-06-24T13:59:59.999Z`), `:46-49` (the `23:59` label readback), `:58-66` (the two beats-`neverExpires` cases keep their **precedence** claim, lose their expected **value**). **Delete `:53` outright** — `validForDays: 1 → end of the NEXT Sydney day` encodes the "rest of today plus one whole day" off-by-one that day granularity *requires*; it is meaningless under an exact offset, so port nothing. | `:70` (below-floor falls through to `endsAt`), `:71-75` (undefined → `endsAt`), `:78-83` (`neverExpires` sentinel; outranks `endsAt`), `:86`, `:90-95` (null cases). The precedence chain stays fully covered. |
| `test:bonus-code-mint` (`src/services/redeemables/__tests__/bonus-code-mint.test.ts`) | `:255` ("deadline lands 7 Sydney days after the mint" — uses `addCalendarDays` at `:100-105`, which has no hour concept), `:256-257` ("last second of that Sydney day" / "the last millisecond of it"), `:384-388` (the 10-day re-arm equivalent). `:216,:243,:354-355,:375-376` (notify-field defaults + clear-on-re-arm) **survive** because the event survives. `:171` is a hand-written end-of-day fixture — it still passes (it is an input) but becomes a misleading artefact; update it. All `validForDays:` fixtures at `:142,223,268,303,331,425,537,561,585,586` rename. | Sections 3, 4, 6, 7, 7b, 8 — driver contract, refund lifecycle, concurrency, legacy parity (`:532-556`), sweep leak. None assert expiry arithmetic. |
| `test:bonus-code-trigger` (`src/services/redeemables/__tests__/bonus-code-trigger.test.ts`) | **Read this row before touching the file.** Sections 3-5 (`:486`, `:513`, `:560`) are deleted. The `require("../mintBonusCodeForTrigger")` sits at **`:263`, in module-level setup**, above the `try {` that opens section 1 at `:284` — so it must move or go in the same edit even though the module survives (its signature changes). The **BACKIN200 refuse-to-run guard at `:238-248` runs BEFORE the sections** and exists solely so section 3 can create that campaign under a unique index on `code` — delete it with sections 3-5, or the day the real BACKIN200 campaign is created (which the launch runbook requires) sections 1-2 become permanently unrunnable for a reason that no longer exists. Also delete: the `BONUS_CODE_BY_TRIGGER` import (`:45`), the Klaviyo stub + identity gate (`:266-272`), the `VERCEL_ENV` save/restore (`:276`), the SIGINT/SIGTERM handler (`:277-283`). Rename the suite and its `test:*` entry to reflect that what remains tests `CampaignService`, not any trigger. | **Sections 1 (`:289`) and 2 (`:341`) must be re-run green.** They are the only coverage of the trigger-as-targeting relaxation and the email-verified waiver — the exact eligibility contract the new endpoint depends on. A green run is the only proof; a load failure and a pass look identical in a scrollback nobody read. |
| `test:bonus-code-policy` (`src/utils/redeemables/__tests__/bonus-code-policy.test.ts`) | `:63-67` names the field five times — rename, plus the new cooldown block. | Everything else. |
| `test:campaign-window`, `test:code-visibility` | Fixture renames only (`campaign-window.test.ts:147,163,179,200,265,287,300,323,338,355,362,373,389,434,483,491`; `code-visibility.test.ts:115`). | **Every assertion.** I checked all of them: `campaign-window` creates each issuance with an **explicit** `expiresAt` via `makeIssuance` (`:107-121`) and passes `validForDays: 14` purely as the personal-window **flag**; the two `formatExpiryLabelAEST` assertions (`:310`, `:402`) derive their expected string from the issuance's own stored value. Zero exposure to the unit change. |
| `test:trigger-eligibility` | Only the stale prose reference to `CancelSubscriptionService` at `:90`. | `:55` and the whole substance — it is a pure test of `isUserEligibleForCampaign`'s trigger relaxation, which the endpoint still depends on. |
| `canonical-events-shape` (`src/utils/integrations/klaviyo/__tests__/canonical-events-shape.test.ts`) | Add `had_active_subscription` to `CANONICAL_KEYS` (`:28-67`) and a shape test for `createSubscriptionCancellationRequestedEvent`. **`:362` hardcodes `"Tuesday 8 September 2026, 11:59PM AEST"`** — end-of-day-specific, wrong under an exact window even though the event survives. | `testBonusCodeIssuedShape` (`:332`) and `testBonusCodeIssuedEmitsThePassedExpiresAt` (`:363`) both survive, as do the three bonus-code `CANONICAL_KEYS` at `:58-61`. |
| `test:chat-faqs` | Re-run after the FAQ edit; the corpus-count assertion in `src/data/__tests__/faqs.test.ts` is bumped only if entry **count** changes (it does not — id 86 is edited in place). | The banned-word list. |

### Verification gates before "done"

```bash
npm run lint && npm run type-check            # necessary, NOT sufficient — see below
grep -rn "mintBonusCodeForTrigger" src        # must return ONLY the module + the new route
grep -rn "endOfDayAESTAfterDays" src scripts  # must return NOTHING
grep -rn "validForDays" src scripts           # must return NOTHING (grep the STRING, not the identifier)
grep -rn "ensureCampaignIssuanceForUser" src --include=*.ts | grep -v __tests__   # must show a production caller
npm run build:norm-manifest && npm run norm:smoke
npm run build:chat-knowledge-pack && npm run test:chat-faqs
npm run test:bonus-code-expiry test:bonus-code-policy test:issuance-expiry \
        test:campaign-window test:trigger-eligibility test:bonus-code-mint \
        test:bonus-code-trigger test:code-visibility test:bonus-code-webhook
npm run check:env
```

**Lint and type-check cannot catch a half-done deletion.** `@typescript-eslint/no-unused-vars` is `"warn"`, not `"error"` (`eslint.config.mjs:30`), and `tsconfig.json` has no `noUnusedLocals` — so leaving the orphan imports at `register/route.ts:35`, `CancelSubscriptionService.ts:25`, `payment-processing.ts:34` ships green, keeping a live-looking mint module imported into the Stripe webhook path with no caller. The greps are the acceptance check.

---

## 8. Documentation updates, per file

**Domain docs (rule 2 — the Stop hook blocks on these):**

| File | What is now false |
|---|---|
| `docs/rewards-redeemables/patterns.md:111-126` | **The largest rewrite.** The wiring table rows 1-3 (all three call sites); `:117-120` "Cancel-click means the cancellation COMMIT… the personal window and the trigger share one instant" — the window now anchors at the **webhook** instant, which is the entire point of the change; `:122-126` the "Known gap — authed checkout-start is unwired" note dissolves, because a Klaviyo flow does not care whether the source event was client- or server-emitted. |
| `docs/rewards-redeemables/architecture.md:44-60, :69` | The ASCII diagram's "TRIGGER PATH (cancel-click \| checkout-start \| one-time-purchase) caller → ensureCampaignIssuanceForUser"; the precedence row naming `endOfDayAESTAfterDays` and `23:59:59.999 Australia/Sydney`. |
| `docs/rewards-redeemables/backend.md:15, :92-105, :175` | `:15` "the one call-site shape for all three eligibility triggers"; `:92` the wait-budget section; `:175` "Wired to all three triggers." **Also fix `:100-105`, which is already wrong today** — it claims that on timeout "the notify runs on and still writes `notifiedAt`/`notifyError`", a claim the code comment at `mintBonusCodeForTrigger.ts:38-50` explicitly retracts. |
| `docs/rewards-redeemables/gotchas.md:13-14, :31, :157-171` | `:13` calendar-day snapping; `:157-162` step 1 "Build the Klaviyo flow FIRST, on the `Bonus Code Issued` metric, rendering `expires_at_label` verbatim"; `:167-171` "this path cannot be rehearsed on a preview deploy — the first genuine trigger after switch-on *is* the integration test." **The runbook inverts**: campaigns + endpoint + secret first, flows published last. Add the DST wall-clock-shift note here. |
| `docs/rewards-redeemables/models.md:21` | The third `notifyError` state (the unconfirmed marker) goes with D4. |
| `docs/rewards-redeemables/testing.md:19, :73, :136` | The `endOfDayAESTAfterDays` suite entry; "The production gate. Outside production `mintBonusCodeForTrigger` writes no issuance row"; the per-caller coverage note. |
| `docs/auth/api.md:17-36` | **Delete the whole block.** It documents the checkout-start mint end to end, including `:24`, `:27`, `:28` (5s budget), `:30` ("now `async` and awaited at all four call sites"), `:32`. |
| `docs/payment/backend.md:233-246` | **Delete.** Documents the one-time-purchase mint including the code fence at `:238`. **Keep `:248-252`** — unrelated, about `checkAndRedeemCampaign`'s `console.error`. |
| `docs/subscription/backend.md:48, :52, :54-60` | Step 10 becomes the cancel-time Klaviyo emit; the `mintBonusCode` table re-scoped to `isMemberChurn`; `:52`'s "only emitted from `customer.subscription.deleted`, never from this service path" becomes doubly wrong. |
| `docs/subscription/rules.md:19, :35-37` | R4's "exclusively… the cancel API path does not fire any external tracking event" needs a named carve-out for `"Subscription Cancellation Requested"`. Also fix the stale line reference at `:19` (`CancelSubscriptionService.ts:88-104` is now `:99-115`). **And remove the phantom "Meta CAPI cancellation"** — `src/lib/facebook.ts` has no cancellation emitter and `handleSubscriptionDeleted` calls only `klaviyo.trackEventBackground` (`stripe-webhook-handlers/index.ts:2778-2787`). |
| `docs/billing-stripe/rules.md:9-11` | Same rule, second copy. Same carve-out, same phantom-Meta fix. |
| `docs/tracking/rules.md:7-9` | Same rule, third copy. Amend in lockstep or the three drift. |
| `docs/tracking/KLAVIYO_INTEGRATION.md:216, :285, :297, :301, :311-314` | `Bonus Code Issued` gains a webhook-supplied `trigger`; the three-trigger enum rows change; the "Environment gate" paragraph is rewritten around the endpoint. **Add two sections**: `Subscription Cancellation Requested`, and the `had_active_subscription` property row. |
| `docs/config-and-data/backend.md:26-30` | "Consumers: the cancel service, `grantBenefits`, and the guest-registration helper" → the webhook endpoint. |
| `docs/infrastructure/backend.md:17-25` | `:21-22`'s parenthetical names the three dead call sites. The cron-exclusion lock itself is **correct and stays** (renamed field). |
| `docs/infrastructure/testing.md:334, :338` | The two inline suite descriptions (day granularity; the `VERCEL_ENV` gate). |
| `docs/shared-ui/architecture.md:74, :76` | The `endOfDayAESTAfterDays` helper-table entry and its `11:59PM` example. |
| `docs/internal-norm/norm-context.md:3537, :3556` | `validForHours` in lockstep with C9 + `npm run build:norm-manifest`. |
| `docs/ai-chatbot/runbook.md:48-59` | §2a: "the personal deadline (11:59pm Sydney on the customer's own date)" and "the moment an admin creates a campaign carrying `BACKIN200` / `LOCKIN100` / `EXTRA100`, customers start receiving codes by email" — creating the campaign is no longer sufficient nor the trigger. |
| `docs/rewards-redeemables/` (new page) | The endpoint contract, the status map with its retry rationale, the secret-rotation runbook, and the launch order. |

**Root docs (rules 5 / 5b — hook-enforced):**

- `BUSINESS.md:299, :306-307, :310-318, :342-346, :766` — `validForHours`; "expires `validForDays` days after *that* customer's own eligibility moment (end of day, Sydney time)" → exactly 72 hours from the webhook instant; the "Enrolment is by ACT, not by audience" three-row Moment table becomes a three-row Flow table; `:342-346` and the whole `:766` coming-soon runbook cell. **Also record the new daily issuance cap** — `:766` currently states "No cap exists on total issuance… no per-campaign budget and no alert," which A4 fixes.
- `CUSTOMER.md:442, :618-628` — `:442` "A member-initiated cancellation… also enrols the customer in the `cancel-click` win-back bonus code" → it now emits a cancel-time Klaviyo signal a flow may later act on. `:618-628` the three-moment table, "Three moments now enrol a customer server-side", "The event is emitted only in production", and `:628`'s "Not yet wired: the *authenticated* checkout-start moment… components cannot reach the database" (that limitation disappears entirely).
- `README.md` — touched by the hook anyway. **While in there, fix a pre-existing rule-11 violation at `README.md:3`: "Members buy entries into monthly tool giveaways."** Entries are never sold; the purchasable unit is the membership or pack and the entries are a free inclusion.

**Cobber (rule 5c) — highest-priority copy fix:**

`src/data/supportChatFaqs.ts:704` (entry id `86`) says the deadline **"always runs to 11:59pm Sydney time on that day."** False under a 72-hour window. The same entry says it is **"counted from the moment you were given the code"** — under the webhook model that becomes *more* accurate (the webhook fires immediately before the email), so keep it. Rewrite to state an exact-hours window anchored on issue.

Re-check id `87` (`:711`) against the re-arm cooldown: it promises an expired unused code "can be re-issued to you later with a fresh deadline if you become eligible again, and we will email you if that happens." With a 30-day cooldown that is still true, but only outside the cooldown — verify the wording does not overpromise. Then run `npm run build:chat-knowledge-pack` and `npm run test:chat-faqs`.

Cobber answers only from grounded knowledge, so leaving `86` stale makes it confidently state a wrong deadline on a legally constrained topic — and a customer told "11:59pm" who redeems at 6pm on the expiry day is refused with `campaignCodeExpiredMessage` (`src/services/redeemables/CampaignCodeValidationService.ts:46`) naming a time that contradicts what Cobber just told them.

**Customer-facing strings that read oddly at an arbitrary time of day** — all four render the same `formatExpiryLabelAEST` value, universally `11:59PM` today: `src/components/features/RedeemablesWallet.tsx:171`; `src/components/features/RewardsFloatingWidget.tsx:517-520`; the checkout refusal (`CampaignCodeValidationService.ts:47`, consumed at `:138` and `src/app/api/redeemables/redeem/route.ts:51`); the email's `expires_at_label` (`klaviyo-events.ts:985`). No code change required — an absolute timestamp is still correct — but review the surrounding copy. **Do not replace the server string with a client-side countdown**: `RedeemablesWalletService.ts:29-35` states the contract that components display this value and never derive one, precisely so the app and the email cannot disagree. A countdown may be added *alongside* it, never instead of it.

---

## 9. Must be fixed first, or the design is unsafe

**1. Widen the service return type before writing the endpoint. (BLOCKER — nothing else can be specified correctly until this lands.)**

`ensureCampaignIssuanceForUser` collapses six distinct causes into one `not_applicable`, including its own catch-all (`src/services/redeemables/CampaignService.ts:828` returns the identical value to `:805`'s legitimate "no campaign carries this code"). The endpoint therefore cannot distinguish "nothing to do, do not retry" from "the database was briefly down, please retry."

The failure this produces is the worst one in the design and it is silent from every direction: a Mongo blip during the webhook is answered `200`, Klaviyo does not retry a 2xx, the discount email in the same flow sends anyway, and the customer types the code at checkout and gets `"This code isn't available on your account."` (`CampaignCodeValidationService.ts:42`). The only trace is `console.error("ensureCampaignIssuanceForUser failed", …)` at `:822` in Vercel logs with no userId-searchable support tool — and `grep -rn "RedeemableIssuance" src/app/api/admin/ src/services/admin/` returns **zero hits**, so no admin screen can explain it either. The wallet cannot self-heal: the sweep's leak defence at `:444` refuses every personal-window campaign when no trigger is passed, so opening `/my-account` will never retroactively mint the missing row.

Fix: add `"error"` at the catch site only. See C1.

**2. Keep the `VERCEL_ENV === "production"` assertion on the route. Do not drop it.**

"Klaviyo only calls the production URL" constrains the **intended caller**, not the **reachable surface**. The route exists on every preview deployment and on every developer's localhost, and Vercel env vars are set for all environments by default — so a preview URL plus the secret mints into the shared production database. The existing gate's own comment states why it sits ahead of the **mint** rather than ahead of the email: gating only the email "would still let a preview deploy write the issuance row and thereby BURN a real customer's one-per-lifetime grant — they would later be told they had already used a code they never saw" (`src/services/redeemables/mintBonusCodeForTrigger.ts:137-145`).

Belt and braces, both cheap: scope `BONUS_CODE_WEBHOOK_SECRET` to Vercel's **Production** environment only, **and** keep the route-level assertion. **I could not verify** whether preview deployments carry the production secret or point at the production MongoDB — env values are gitignored and `.env.example:30` carries a blank `MONGODB_URI`. Unknown argues for keeping the gate, not dropping it.

**3. Ship the fail-closed daily issuance budget with the endpoint, not after it.**

Once the secret leaves Klaviyo — and the realistic route is ordinary operations, not a breach: a flow clone, an export, a screenshot, an agency contractor, an off-boarded marketer, a Klaviyo API key scoped to read flow actions — everything that made the mint safe is gone. Registration accepts an unverified email (`src/app/api/auth/register/route.ts:872`) and the trigger path waives the verified check anyway (`CampaignService.ts:462-466`). The documented cancel-click campaign redeems with `purchaseRequirement: "none"` (BUSINESS.md:766), so `hasQualifyingPurchase` returns true immediately (`RedemptionService.ts:205-213`), and redemption pushes straight into the live major draw with no eligibility, budget or cap check (`src/services/redeemables/DrawGrantService.ts:15-65`).

What genuinely bounds it: `redeemedEverAt` caps every account at three redeemed grants for life (`bonus-code-policy.ts:43-46`; enforced twice on the redeem side including a concurrency filter at `RedemptionService.ts:234-237,249-252`), and the `{campaignId, userId}` unique index plus the E11000 branch make concurrent minting resolve cleanly (`RedeemableIssuance.ts:109`; `CampaignService.ts:700-722`). What does **not** bound it: account creation, and total issuance. A4 closes the second.

**4. Fail closed on an unset secret. Do not copy the cron idiom.**

`src/app/api/cron/monthly-redeemables-issuance/route.ts:9-14` is `if (!cronSecret) return true;` — an unset env var makes the endpoint fully public — and it compares with `===` on a raw string. On a mint endpoint that is the entire product given away by a var nobody set. Use the `verifyNormRequest` shape: unset → `500 misconfigured` (`src/lib/internal-norm/auth.ts:87-89`). Leave a comment saying why, because the cron file is the nearest neighbour someone will copy. Middleware cannot save you — its matcher excludes `/api` outright (`src/middleware.ts:257`).

**5. Confirm Klaviyo's webhook behaviour before finalising the status map. (Unverified.)**

Three questions, all unanswerable from this repo (no inbound Klaviyo route exists to learn from; the Klaviyo MCP server is unauthenticated in this session):

- **Retry policy** — count, backoff, total window, and whether failed deliveries surface in the flow editor. The whole 200-vs-500 split rests on "non-2xx is retried, 2xx is not, retries are minutes not days." If Klaviyo does **not** retry, item 1's fix buys nothing and the recovery mechanism must become a reconciliation sweep, not a status code.
- **Does the action carry a stable per-delivery id?** If yes, persist it as the idempotency key and the replay hole closes exactly. If no, the re-arm cooldown (A2) is the answer — which is why it is specified as required rather than optional.
- **Does the webhook fire strictly immediately before the email step?** The 72-hour window anchors on **receipt**, because the body carries no timestamp. If Klaviyo queues or retries the action, receipt-anchoring shifts the customer's window relative to when the email actually sends.

**6. Get the launch order right — it is the inverse of the documented runbook.**

`docs/rewards-redeemables/gotchas.md:157-162` says build the Klaviyo flow first, on the `Bonus Code Issued` metric. Under the new model that ships a live flow emailing a hardcoded code into a void: with no active campaign carrying the code, `ensureCampaignIssuanceForUser` returns `not_applicable` (`CampaignService.ts:805`), the endpoint answers 200, and every customer in the cohort gets a code that returns `"Invalid campaign code"` (`CampaignCodeValidationService.ts:43`).

Correct order: **(a)** endpoint deployed to production with the secret scoped to Production, **(b)** the three campaigns created in the admin panel with `validForHours: 72`, **(c)** smoke-test the endpoint against a real production account with a disposable campaign, **(d)** then and only then the marketing team publishes the flows.

**7. Land the endpoint and the deletions in the same change.**

`ensureCampaignIssuanceForUser` has exactly one production caller — `mintBonusCodeForTrigger.ts:156`. The moment the three triggers go, that drops to zero, and nothing picks up the slack: the wallet sweep is refused at `CampaignService.ts:444` and the cron is filtered at `src/app/api/cron/monthly-redeemables-issuance/route.ts:32` and refused at `:332`. Between a "remove dead triggers" commit and a later "add endpoint" commit, a campaign can be live, the admin panel can show it, and not one code is ever minted, with no error anywhere. If the work must be split, **delete last**.

**8. Flagged, not fixed here (pre-existing, made more likely by this change):**

- **The guest checkout-start cohort can pay and get nothing.** `CampaignCodeValidationService.validate` skips the entire holder check when there is no session — `not_held` / `already_redeemed` / personal-expiry all sit inside `if (callerId) {` at `:101`, and `callerId` is undefined for a guest (`:99`) — so it returns `valid: true` on campaign-window grounds alone. Checkout shows APPLIED, the customer is charged, `checkAndRedeemCampaign` returns nothing, and `src/utils/payment/payment-processing.ts:1400-1450` logs **nothing at all** when `campaignResult` is falsy (the success log at `:1434` is inside the truthy branch). LOCKIN100 targets exactly the unauthenticated-at-checkout cohort, so any silently-failed mint for that trigger lands here. Minimum fix in this change: an explicit `console.error` when `paymentMetadata.campaignCode` was present but `campaignResult` came back falsy, so "paid with a code, got nothing" is at least greppable.
- **Coupon-sourced entries bypass draw eligibility.** `DrawGrantService.grantMonthlyCouponEntries` (`src/services/redeemables/DrawGrantService.ts:15-65`) pushes straight into `activeMajorDraw.entries` with no check; the SA/ACT and 18+ rules live in `src/utils/giveaway-eligibility.ts:6,35-52` and this path never consults them. Pre-existing, but the webhook makes it reachable at an attacker-chosen scale on a promotion whose legal standing depends on the entry rules being enforced (rule 11). Either gate the grant or record explicitly why coupon-sourced entries are exempt — do not let it pass unremarked.