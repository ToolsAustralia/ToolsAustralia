# Bonus-Code Webhook Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Move bonus-code issuance from three internal triggers to an inbound Klaviyo webhook, so a code's 72-hour clock starts when the discount email is about to send rather than when the customer qualified — and remove the machinery that existed only for the old model.

**Spec:** `docs/superpowers/specs/2026-08-26-bonus-code-webhook-rework.md` — read §1 (plain English), §2 (endpoint contract), §3 (expiry), §4 (ordered change list), §5 (deletion evidence), §9 (must-fix-first). The spec's change IDs (A1–A13, C1–C16, D1–D7) are referenced throughout; the spec is authoritative on detail, this plan only sequences it.

**Prior spec still in force:** `docs/superpowers/specs/2026-08-25-per-user-code-expiry-design.md` — the issuance rail, re-arm rule, atomic claim, redemption gating, visibility rule and refund gate are unchanged by this rework. See spec §6 for the do-not-re-litigate list.

## Global Constraints

- **NO COMMITS.** Not authorized this session (CLAUDE.md rule 1). Every task ends in verification, never `git commit`. Ask before committing.
- **Never target `main`.** Work stays on `feature/coupon-klaviyo`.
- No `any`; TypeScript strict. No business logic in `src/app/api/**` — the route delegates.
- Production strips `console.log`/`info`/`debug`/`warn`. **Only `console.error` survives.**
- Tests are standalone `tsx` scripts, each needing its own `package.json` `test:*` entry.
- `src/**` edits require the matching `docs/<domain>/` update. The Domain Manifest in CLAUDE.md is the source of truth — **check it yourself**, several mappings have been wrong on this branch.
- **Rule 11 (LEGAL):** entries are a **free inclusion** with a membership or pack; never sold, never priced per unit. Banned: odds, chance(s) of winning, lottery, raffle, sweepstake, gamble, bet.
- **Rule 10 (Norm lockstep):** schema + route + `docs/internal-norm/norm-context.md` change together, then `npm run build:norm-manifest` and `npm run norm:smoke`.
- **Rule 9 (env):** register every new var in `.env.example` in the same change; set values in this worktree's `.env.local`, the main folder's `.env.local`, and Vercel.
- **`.select()` and Mongo query keys are string literals `tsc` cannot check.** When renaming a field, grep the **string**, not the identifier. A missed projection reads `undefined` silently; a missed query leg matches zero documents forever.

---

## Task 1: Policy module — exact-hours expiry and the re-arm cooldown

Pure functions, no DB. Everything downstream depends on them, and the cooldown closes a hole the webhook model opens.

**Files:** modify `src/utils/redeemables/bonus-code-policy.ts`; create `src/utils/redeemables/__tests__/expiry-hours.test.ts`; modify `package.json`, `docs/rewards-redeemables/`.

**Spec refs:** A1, A2, §3.

**Produces:**
```ts
export const REARM_COOLDOWN_DAYS: number;
export function expiryAfterHours(from: Date, hours: number): Date;
export function decideRearm(row, now, hasTrigger, firstIssuedAt?: Date | null): RearmOutcome;
```

- [ ] **Step 1: Write the failing tests.** Cover `expiryAfterHours`: exactly +72h in epoch ms; that it crosses a Sydney DST boundary without gaining or losing an hour *in elapsed time* (the wall-clock hour legitimately shifts — assert the millisecond delta, not the rendered hour); a fractional/zero/negative hours guard. Cover the cooldown: a lapsed row inside `REARM_COOLDOWN_DAYS` of `firstIssuedAt` returns `expired_no_rearm` **even with a trigger**; outside it returns `rearmed`; `redeemedEverAt` still wins over everything; a missing `firstIssuedAt` falls back to `issuedAt`; no-trigger behaviour is unchanged. Use literal expected values.
- [ ] **Step 2: Add `test:bonus-code-expiry` repointed at the new file** (spec §7) and run it — expect failure.
- [ ] **Step 3: Implement** `expiryAfterHours` per spec §3 — epoch-millisecond arithmetic only. **No `date-fns-tz`, no calendar triple, no `.setUTCSeconds(59,999)`.** Add `REARM_COOLDOWN_DAYS` and the 4th `decideRearm` parameter.
- [ ] **Step 4: Run to green.** Then `npm run type-check` and `npm run lint`.
- [ ] **Step 5: Docs** — `docs/rewards-redeemables/` : the exact-offset model, why it is DST-safe by construction, and the cooldown's purpose (a webhook always carries a trigger, so rule 3 alone never refuses).

---

## Task 2: Unblock the endpoint — distinguish "don't retry" from "retry"

**This is spec §9's blocker. Nothing else can be built correctly until it lands.**

**Files:** `src/services/redeemables/CampaignService.ts` (`:37`, `:828`, `:805`, `:590`, `:57`, `:51/:107/:151`); `docs/rewards-redeemables/`.

**Spec refs:** C1, C5, C6, and the typed half of C7.

- [ ] **Step 1:** Widen `StampedIssuanceResult.outcome` to include `"error"`. Change **only** the catch at `:828` to return `{ outcome: "error" }`. Leave the six deliberate no-op returns as `not_applicable` — they are correct.
- [ ] **Step 2:** Add `console.error("[bonus-code] no active campaign for code", …)` on the `:805` path. Under the new model that is a launch-configuration error, not a benign no-op, and it is the cheapest early warning available.
- [ ] **Step 3:** Wire the cooldown — pass `existing?.firstIssuedAt ?? existing?.issuedAt` as `decideRearm`'s 4th argument (C6).
- [ ] **Step 4:** Swap the expiry call to `expiryAfterHours(issuedAt, campaign.validForHours)` and rename the typed `validForDays` sites `tsc` will catch (C5, C7).
- [ ] **Step 5:** `npm run type-check` — expect errors at every remaining `validForDays` site. That error list is Task 3's worklist; record it in the report.
- [ ] **Step 6:** Docs + `npm run test:bonus-code-policy`, `test:issuance-expiry`.

---

## Task 3: Complete the `validForDays` → `validForHours` rename

Mechanical but unforgiving — the untyped sites are where this goes wrong.

**Files:** spec C7, C8, C9, C10, C11 — model, services, zod, admin routes, admin UI, Norm schema + route, cron, docs.

- [ ] **Step 1: The typed sites.** Work the `tsc` error list from Task 2 to zero.
- [ ] **Step 2: The untyped sites — grep the STRING literal.** `.select()` strings in `RedeemablesWalletService`, `MonthlyCouponQueryService`, `CampaignCodeValidationService`; and the **query legs** `{ validForDays: { $gte: 1 } }` in `RedemptionService` and `CampaignCodeValidationService`. A missed projection is silent; a missed query leg matches nothing forever.
- [ ] **Step 3: The six guard copies** (C10) — model `pre('save')`, the authoritative merged-state guard in `CampaignService`, both admin zod schemas, the cron filter, and the three leak defences. Renaming some and not others reclassifies a trigger campaign as legacy and re-opens mass-minting.
- [ ] **Step 4: Norm lockstep** (C9) — schema + route + `norm-context.md` together, then `npm run build:norm-manifest` && `npm run norm:smoke`.
- [ ] **Step 5: Admin UI** (C11) — relabel to **hours**, and **rewrite the helper copy**: it currently says the window starts when the customer qualifies. Under the webhook model the anchor is when the flow fires, days later. Both the unit and the anchor are wrong.
- [ ] **Step 6: Verify.** `type-check`, `lint`, `build:norm-manifest`, `norm:smoke`, and every existing suite. Then grep the whole repo for `validForDays` and report any survivor with its reason.

---

## Task 4: Webhook infrastructure — auth, budget, audit

**Files:** create `src/lib/bonus-code-webhook/{auth,budget,audit}.ts` and `src/models/BonusCodeWebhookCall.ts`; modify `.env.example`, `CLAUDE.md` manifest, `.claude/hooks/doc-sync.mjs`.

**Spec refs:** A3, A4, A5, A6, A10, A11, A12.

- [ ] **Step 1: Auth (A3).** Constant-time compare over a **comma-separated** `BONUS_CODE_WEBHOOK_SECRET` (rotation overlap). **Fail closed** when unset. Copy the length-guarded idiom at `src/lib/internal-norm/auth.ts:91-95`. **Do NOT copy `src/app/api/cron/monthly-redeemables-issuance/route.ts:9-14` — it fails OPEN on an unset secret and compares with `===`.** Never log the secret, not even truncated.
- [ ] **Step 2: Budget (A4).** Daily mint cap + kill switch, **fail-closed on error** — pattern `src/lib/support-chat/costGuard.ts:110-143`. A DB outage must block minting, not uncap it. Env: `BONUS_CODE_DAILY_MINT_CAP` (default 500), `BONUS_CODE_KILL_SWITCH`.
- [ ] **Step 3: Audit (A5, A6).** A durable row for **every** call — accepted, refused, errored. Hashed IP, never raw. Never throws. Dynamic imports keep Mongoose off the module top level. TTL 90 days. Pattern: `src/lib/support-chat/audit.ts`. **Not** `NormCallLog` — it would register a marketing endpoint inside Norm's admin gateway.
- [ ] **Step 4: Registration.** `.env.example` (A10), Domain Manifest (A11 — `src/app/api/bonus-codes/**`, `src/lib/bonus-code-webhook/**`, `src/models/BonusCodeWebhookCall.ts` under **rewards-redeemables**), and doc-sync globs (A12 — add to **both** BUSINESS and CUSTOMER lists).
- [ ] **Step 5: Verify** — `type-check`, `lint`, `npm run check:env`.

---

## Task 5: The endpoint

**Files:** create `src/app/api/bonus-codes/v1/issue/route.ts`; modify `src/services/redeemables/mintBonusCodeForTrigger.ts`; create `src/services/redeemables/__tests__/bonus-code-webhook.test.ts`; `package.json`; docs.

**Spec refs:** A7, A13, C2, C3, C4, §2 status map.

- [ ] **Step 1: Repurpose the service (C2).** `mintBonusCodeForTrigger(user, trigger)` returns `StampedIssuanceResult` instead of `void`. Keep the name and the never-throws contract; update the JSDoc to name the webhook route as its caller. **Do not delete it and inline into the handler** — the layering rule is exactly why it was extracted.
- [ ] **Step 2: Simplify (C3, C4).** Keep the `VERCEL_ENV` gate, update its comment. Replace `notifyWithinBudget` with a direct awaited `BonusCodeNotifier.notify` — the budget existed because the mint blocked a customer's registration, and a webhook blocks nobody.
- [ ] **Step 3: The route (A7).** Thin: `connectDB()` → read the raw body once → env assertion → secret → budget → Zod → resolve customer → delegate → map outcome to status → audit. House conventions from `src/app/api/stripe/webhook/route.ts:18-64`. **Middleware never runs for `/api`** — this route owns 100% of its authorization.
- [ ] **Step 4: The status map (§2).** Implement it exactly, including `409` on a `userId`/`email` mismatch and `403` outside production. (Amended 2026-08-26 — the mismatch case now answers `200`, indistinguishably from a mint; see the spec's AMENDMENT note.) The governing rule: non-2xx exists to make Klaviyo retry, so return 2xx wherever a retry cannot change the outcome.
- [ ] **Step 5: Tests.** Bad/missing/rotated secret; unknown trigger; malformed body; unresolvable customer; identity mismatch; no campaign configured; happy path mints exactly 72h; a second call inside the window returns `already_active` **without** extending it; a spent grant stays spent; budget exhaustion returns 429. DB-backed tests create their own fixtures and delete them in a `finally`, including on failure — see `bonus-code-mint.test.ts` for the shape.
- [ ] **Step 6: Verify + docs** — `docs/rewards-redeemables/api.md` gets the full contract and status map.

---

## Task 6: Remove the three internal triggers

Only after Task 5 proves the replacement works.

**Files:** spec D1, D2, D3, D4, D5, D6, D7; plus C15, C16.

- [ ] **Step 1: Delete the three call sites** (D1, D2, D3). **`IUser` in `payment-processing.ts:34` is a separate import still used at `:1908, :1989, :2058, :2140` — do not remove it.**
- [ ] **Step 2: Revert the register helper (C15).** Back to a sync `void` function; drop all four `await`s. **Lint will not catch a leftover `await`-on-void** — the ESLint config is not type-aware. Remove them deliberately and confirm by reading each site.
- [ ] **Step 3: Delete the notify budget (D4)** and `endOfDayAESTAfterDays` (D5) — **nothing else in `timezone.ts`**.
- [ ] **Step 4: Prune the trigger tests (D6, D7)** per spec §7, minding the load-order trap it documents.
- [ ] **Step 5: Prove nothing else referenced them.** Grep each deleted symbol repo-wide, including `scripts/`, and report zero survivors with evidence.
- [ ] **Step 6: Full suite + docs.**

---

## Task 7: The two Klaviyo events

**Files:** `src/utils/integrations/klaviyo/klaviyo-events.ts`; `canonical-events-shape.test.ts`; `src/services/subscription/CancelSubscriptionService.ts`; `src/app/api/stripe/cancel-subscription/route.ts`; `docs/tracking/`, `docs/subscription/`.

**Spec refs:** A8, A9, C12, C13, C14.

- [ ] **Step 1: `Subscription Cancellation Requested` (A8).** Use `formatCanonicalPackageData` with a **real** package lookup — never the legacy formatter, which is why the existing cancellation event prints the literal "Subscription" and ships a raw package id as the tier. Carry `cancelled_at` and `access_ends_at` from persisted values. Every property is canonical or `*_at`, so no `CANONICAL_KEYS` addition is needed.
- [ ] **Step 2: Emit it (C12, C13, C14).** Rename `mintBonusCode` → `isMemberChurn` (**do not delete** — it is the only thing distinguishing member churn from the two non-churn cancellations). Emit **after** `await user.save()` so the persisted fields are correct. Fire-and-forget. Add the named carve-out to the duplicate-suppression comment, or the next reader deletes this as a rule violation.
- [ ] **Step 3: `had_active_subscription` (A9).** Add to `createOneTimePackagePurchasedEvent`, passed the **pre-grant** value. Add the key to `CANONICAL_KEYS` **and** the property table in `docs/tracking/KLAVIYO_INTEGRATION.md` in the same edit. This discriminator dies with the deleted call site and cannot be reconstructed days later.
- [ ] **Step 4: Verify** — `test:klaviyo-canonical` plus the full suite.

---

## Task 8: Customer-facing copy, docs, and the launch runbook

**Files:** spec §8 — every doc that describes the old model; `BUSINESS.md`, `CUSTOMER.md`, Cobber FAQ corpus; `docs/rewards-redeemables/gotchas.md`.

- [ ] **Step 1: The expiry semantics changed for customers.** Codes no longer die at 11:59pm Sydney — they die exactly 72 hours after issue, at whatever time that lands. Update the wallet copy, the checkout refusal messages, the Cobber FAQs and both top-level docs. Note the DST consequence explicitly: a Friday 2pm issue expires Monday 3pm, which is correct and will look like a bug.
- [ ] **Step 2: The launch order REVERSED.** The campaigns must now exist **before** the flows are switched on — the opposite of the previous runbook. If a flow fires with no campaign, the email sends and the code does not work. Rewrite the `BUSINESS.md` §16 runbook and its `gotchas.md` mirror.
- [ ] **Step 3: Cobber** — update the FAQ entries, rebuild the knowledge pack, bump the count assertion deliberately. Rule 11 applies to every string.
- [ ] **Step 4: Sweep every stale sentence** the spec §8 quotes.
- [ ] **Step 5: Full verification sweep** — `type-check`, `lint`, every `test:*` in the feature set, `build:chat-knowledge-pack`, `build:norm-manifest`, `norm:smoke`, `check:env`. Report the lint baseline and confirm it is unchanged.

---

## Out of scope

Per spec §1: no admin screen for bonus codes; no per-campaign variation beyond the existing configurable field; no way to cancel the discount email when a mint fails (Klaviyo sends regardless — mitigated by loud logging, retryable statuses, and the corrected launch order). The Klaviyo **retry semantics are unverified** — confirm before launch; the re-arm cooldown is designed to be safe under either answer.
