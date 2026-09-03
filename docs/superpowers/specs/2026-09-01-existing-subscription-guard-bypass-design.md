# Closing the EXISTING_SUBSCRIPTION guard bypass

> Status: **APPROVED — DJ, 2026-09-01.** Sections 1–2 signed off first (D5 approved with
> the D5a nudge added; D7 approved), then 3–9 written and approved, including **§4.5
> option A** (state the membership's own price + entries; do not author the
> pack-vs-membership comparison) and the phase order 1→4 as written.
> Spec = decisions + verified facts. Tasks live in the plan, not here.

---

## 1. Problem and done

An existing member who enters the membership modal from anywhere other than a package
card is walked into the **new-subscription** checkout, reaches the payment step, and gets
a server 409 (`EXISTING_SUBSCRIPTION`) with no card form and no message. The gate that
should stop them lives in the card-click handler, so the other three entry points — the
Klaviyo abandoned-checkout deep-link, the global `openMembershipModal` event, and the
package-picker open — skip it entirely. `verified` — 309 production `ErrorReport` rows
across 277 distinct users, all `POST /api/stripe/create-subscription-existing-user`, all
HTTP 409, all `isAuthenticated: true`; **74% (230/309) fired 30+ days after that user's
subscription started**, so these are established members, not people mid-signup.

**Done when:**

| Observable | Today | Target |
| --- | --- | --- |
| A member clicking a hero CTA / old Klaviyo email lands on plan management, not a dead checkout step | dead step | `/my-account/membership` with the right sheet open |
| `EXISTING_SUBSCRIPTION` ErrorReports per month | ~100 | < 5 |
| A **past-due** member reaches a screen that can take their money | no | yes (`?open=payment`) |

**This is a failure if** a guest, a cancelled member, or an expired member is wrongly
bounced and cannot subscribe. That regression costs more than the bug — new memberships
are already down 13.8% (28–31 Aug vs Jul). **When in doubt, let them through to checkout
and let the server 409 be the backstop.**

---

## 2. Decisions

| # | Decision | Choice | Why |
| --- | --- | --- | --- |
| D1 | Where the gate runs | At the **modal-open chokepoint** (`useMembershipModal.openModal` / `openModalWithPackageSelectionFirst`, `useMembershipModal.ts:36,52`), not in each caller | Four entry points exist, three skip today's guard. Fixing callers one-by-one leaves entry point #5 unguarded by construction. |
| D2 | Which predicate | `hasBlockingSubscription(userData)` — the **same helper** the server's `checkCanCreateSubscription` uses (`subscription-helpers.ts:110`, `subscription-creation-guard.ts:60`) | Client asks `subscription.isActive` + a price comparison; server asks `status ∈ {active, past_due, unpaid, trialing, paused}`. Every disagreement is a guaranteed 409. One predicate, one answer. |
| D3 | Reuse or invent | **Reuse.** `useMajorDrawEntryCta.ts:345,367` already calls `hasBlockingSubscription` and diverts to a one-time pack | The correct pattern is already in the repo. Coining a second "can they subscribe?" concept forks the vocabulary (global naming rule). |
| D4 | Where a blocked member goes | `/my-account/membership?open=subscription`; **past-due → `?open=payment`** | Exactly what the card-click path already does (`useMembershipCardCta.ts:150,156`). No new destination, no new copy. |
| D5 | One-time / Additional packs | **Still allowed** for a blocking-sub member | Established rule in two places (`useMembershipCardCta.ts:147-150`, `useMajorDrawEntryCta.ts:345`): a pack is a standalone purchase, not a second subscription. Blocking it would remove revenue we currently take. |
| D6 | `openModal()` / `openModalWithPackageSelectionFirst()` called with **no plan** | **Allowed through.** The step-2 backstop (D7) is the guard for that path — no redirect | **AMENDED 2026-09-01 during planning.** D6 originally said "pre-select a one-time pack". Redirecting or blocking a plan-less open would also stop a blocking-sub member reaching the **picker**, and the picker is how they buy a **pack** — which D5 explicitly permits and which is live revenue. That would trip the §1 failure line. `useMajorDrawEntryCta.ts:345,367` already pre-selects a one-time pack for its own callers, so the dominant real path never opens the picker on the membership tab; if a member picks a tier inside the picker anyway, the D7 backstop catches it before the 409. Implementing the pre-select inside the chokepoint would also force `useMembershipModal` to depend on the package catalogue (`useMemberships`), which rule 4 does not justify here. |
| D7 | `userData` still loading | Treat unknown as **allowed**, plus a second check immediately before the step-2 pre-warm (`MembershipModal/index.tsx:1237`) | Treating unknown as blocking would bounce guests — the majority — and violate the failure line in §1. The pre-warm is the last point before the 409 and userData is loaded by then in nearly all cases. |
| D8 | The suppressed toast | On a blocked pre-warm, **redirect + show the existing "Active Subscription Found" toast** instead of `console.warn` and silence (`MembershipModal/index.tsx:1281-1285`) | Today the member sits at a payment step with no card form and no explanation. The toast and its "Manage Subscription" action already exist at `index.tsx:5255`. |
| D9 | Rejected: fix the three callers individually | No | Leaves the shared `MembershipSection` state machine duplicated in two files that have already drifted (`useMembershipCardCta.ts:52-56` names the duplication). Does not stop the next entry point. |
| D10 | Rejected: relax the server guard | No | The server is correct. Duplicate subscriptions are a billing and refund problem far worse than a bad redirect. |
| D5a | A blocking-sub member buying a **pack** is told membership is the better deal | Yes — an inline note on the pack step, not a blocker, showing the **real reactivation price and the real entries figure** | Owner request (2026-09-01): "most of the time renewing the membership is much cheaper and also has lots of entries." A concrete number persuades; "not just this pack's" does not. See §4.5. |
| D5c | Where those two numbers come from | `getPastDueRenewalPreview(user)` → `{ entries, cost }` (`utils/subscription/past-due-renewal-preview.ts:27`) | `verified` — already the canonical source for the dashboard note, the resolve sheet, the renewal-failure email and the Klaviyo `past_due_renewal_entries` property. Recomputing the price or the entries here would create a fifth number that can disagree with the other four. |
| D5b | The verb for that nudge | **"Reactivate" / "Settle" / "Membership on hold"** — NOT "redeem" | `verified` — "redeem" is already the redeemables/rewards verb (`/api/rewards/redeem`, `RedeemablesWallet`, `src/services/redeemables/`). Reusing it here would fork the vocabulary and collide with an existing domain (global naming rule). The past-due vocabulary already exists: `RenewalFailedModal/index.tsx:152,158,165`. |

**Naming:** this is the *subscription creation guard* — the term the server already uses
(`subscription-creation-guard.ts`). No new noun is introduced.

**Rule 11 (legal):** the nudge copy sells the **membership**, never entries. Entries are a
free inclusion; no odds/chance framing. Draft wording reuses shipped strings —
"Your partner discounts, entries & member offers are paused until your renewal clears."
(`RenewalFailedModal/index.tsx:165`) and "adds more free entries every month"
(`my-account/page-client.tsx:433`).

---

## 3. Starting state (verified)

### 3.1 The four ways into the membership modal

| Entry point | Runs the guard? | `file:line` |
| --- | --- | --- |
| Package-card click → `handlePlanSelect` | ✅ bounces | `MembershipSection.tsx:327-360` |
| Package-card click → `onSelect` (the /membership rewrite) | ✅ bounces | `useMembershipCardCta.ts:145-160` |
| Klaviyo abandoned-checkout deep-link | ❌ **bypassed** | `MembershipSection.tsx:129-134`, `MembershipPageClient.tsx:44-48` |
| Global `openMembershipModal` event (hero / entry CTAs) | ❌ **bypassed** | `MembershipSection.tsx:156-167` |
| `openModalWithPackageSelectionFirst` (entry CTAs) | ❌ **bypassed** | `MembershipSection.tsx:161` |

`verified`. The three bypassing paths call `membershipModal.setSelectedPlan(plan)` +
`openModal()` directly, wrapped only in `whenGatesOpenElseGateModal` — that is the
**major-draw** gate (`useMajorDrawPurchaseGate`), an unrelated concern.

Dispatchers of the global event: `useMajorDrawEntryCta.ts:357,385`,
`RewardsFloatingWidget.tsx:108`, `my-account/rewards/page-client.tsx:86,97`,
`MembershipModal/index.tsx:1075`, `lib/support-chat/widget-events.ts:9`. `verified`.

### 3.2 Two guards, already drifted

`useMembershipCardCta.ts:52-56` states the duplication outright: *"this intentionally
mirrors logic in MembershipSection.tsx… kept separate here to honour 'recompose only'."*
They have already diverged — `MembershipSection` bounces to `/my-account`
(`:337,343,349,355`), `useMembershipCardCta` to `/my-account/membership?open=…`
(`:150,156`), the latter fixing an owner-reported complaint dated 2026-07-31
(`useMembershipCardCta.ts:146-149`). `verified`.

### 3.3 The guard fails open

`getPlanHierarchy` returns `isCurrent/isUpgrade/isDowngrade` **all-false** whenever it
cannot determine the relationship (`MembershipSection.tsx:304-311`), and every bounce is
`hasActiveSubscription && hierarchy.isX`. So these fall through to `openModal`:

| Case | Why it falls through |
| --- | --- |
| `subscriptionPackageData` null | guard short-circuits at `:304` |
| Equal-price tier switch | `isUpgrade`/`isDowngrade` both false, `isCurrent` false (name differs) |
| Click before `UserContext` resolves | `hasActiveSubscription` false; **no `userLoading` check in either handler** (`verified` — `userLoading` appears at `MembershipSection.tsx:380,457` for tracking/render only, never in `handlePlanSelect`) |
| status `unpaid` / `paused` / `trialing` | `isActive` may be false and `isPastDue` false, so **no branch matches** |

`getPlanHierarchy` also computes a correct `canPurchase` at `:323` —
`!isCurrent && !hasActiveSubscription && !cannotPurchaseDueToBlocking` — **which
`handlePlanSelect` never reads.** `verified`.

### 3.4 The predicate mismatch (root cause)

| Side | Asks | `file:line` |
| --- | --- | --- |
| Client | `subscription.isActive` + price comparison | `MembershipSection.tsx:171,313-317` |
| Server | `status ∈ {active, past_due, unpaid, trialing, paused}` | `subscription-helpers.ts:90-96,110` via `subscription-creation-guard.ts:60` |

`verified`. Any state where these disagree is a guaranteed 409 at step 2.

### 3.5 Production evidence

`verified` — production `Production` DB, read via `.env.production`, 2026-09-01:

| Fact | Value |
| --- | --- |
| `EXISTING_SUBSCRIPTION` ErrorReports | 309 across 277 distinct users |
| Endpoint / status / auth | `POST /api/stripe/create-subscription-existing-user` · 409 · `isAuthenticated: true` — **100% of rows** |
| Status at block time | 222 `active`, 31 `past_due`, 23 `canceled`, 1 `trialing` |
| Ghost state (`stripeSubscriptionId` && !`subscription`) | **0** — the guard's second branch never fires |
| Gap from subscription start → block | 30–89d: **102**; 90d+: **128**; ≤6d: 35 → **74% are 30+ days after** |
| `packageId` resolving in the static catalog | **277/277** — the "deleted package" theory is disproved |

### 3.6 Latent problems this will surface

- **The diagnostic for a null `subscriptionPackageData` is `console.warn`**
  (`app/api/users/[id]/route.ts:90`) — **stripped in production**. This failure mode is
  currently invisible in prod. `verified`.
- `useMajorDrawEntryCta.ts:366-378` already uses `hasBlockingSubscription` correctly, but
  its fallback still reaches `openModalWithPackageSelectionFirst(getRecommendedSubscriptionPlan())`
  — a **subscription** plan — when `getOneTimePlan()` resolves nothing. A blocking-sub
  member with an unresolved pack catalogue lands on the membership tab. `verified`.
- **No test coverage.** `hasBlockingSubscription` 0 hits, `checkCanCreateSubscription` 1
  incidental hit (`campaign-code-metadata.test.ts`), `handlePlanSelect`/`getPlanHierarchy`
  0 hits — across **319** test files. Control searches: `assert` 277 files, `subscription`
  84 files. `verified`.

---

## 4. Design

### 4.1 One resolver, one answer

New pure function in the existing subscription utils — **not** a new domain concept:

```ts
// src/utils/subscription/subscription-creation-gate.ts
export type SubscriptionGateResult =
  | { allowed: true }
  | { allowed: false; reason: "past_due"; redirectTo: "/my-account/membership?open=payment" }
  | { allowed: false; reason: "blocking"; redirectTo: "/my-account/membership?open=subscription" };

export function resolveSubscriptionCreationGate(
  user: { subscription?: { status?: string } } | null | undefined,
  opts: { isSubscriptionPlan: boolean; userLoading: boolean }
): SubscriptionGateResult;
```

Rules, in order:
1. `!opts.isSubscriptionPlan` → **allowed** (D5 — packs are standalone purchases).
2. `opts.userLoading` → **allowed** (D7 — unknown must not bounce guests).
3. `!hasBlockingSubscription(user)` → **allowed**.
4. `status === "past_due"` → blocked, `reason: "past_due"`.
5. otherwise → blocked, `reason: "blocking"`.

It **wraps** `hasBlockingSubscription` (D2/D3) rather than restating the status list, so
adding a status to `BLOCKING_SUBSCRIPTION_STATUSES` cannot desync client from server.

### 4.2 Where it runs

| Point | Purpose | `file:line` |
| --- | --- | --- |
| `useMembershipModal.openModal` / `openModalWithPackageSelectionFirst` | Primary gate — every entry point funnels here | `useMembershipModal.ts:36,52` |
| Immediately before the step-2 pre-warm | Backstop for the D7 load race | `MembershipModal/index.tsx:1232-1237` |

The two existing card-click guards (`handlePlanSelect`, `onSelect`) are **replaced** by
calls to the resolver, collapsing the drifted duplicate into one predicate. Their
redirect targets converge on the `useMembershipCardCta` variants (D4), which are the
newer, owner-corrected ones.

### 4.3 Flow

- **Guest / cancelled / expired** → unchanged. Modal opens, checkout proceeds.
- **Active member, hero CTA** → no modal; `/my-account/membership?open=subscription`.
- **Past-due member, hero CTA** → no modal; `/my-account/membership?open=payment`.
- **Blocking member, pack** → modal opens (D5) **with the D5a note**.
- **Race (data lands after open)** → backstop fires at step 2: redirect + the existing
  "Active Subscription Found" toast (`MembershipModal/index.tsx:5255`), replacing today's
  silent `console.warn` (D8).

### 4.4 Edge cases and failure states

| Case | Behaviour |
| --- | --- |
| `userData` never loads (API down) | Allowed through; server 409 remains the backstop. No worse than today. |
| Status changes mid-session (webhook lands while modal open) | Backstop re-reads at step 2, so the stale open is caught before the pre-warm. |
| `openModal()` with no plan | Treated as a subscription open (D6) — the conservative reading, since the modal defaults to a membership tier. |
| Deep-link with a **pack** `packageId` | Allowed (D5) + D5a note. |
| Deep-link with a stale/unknown `packageId` | Unchanged — hook already latches and does not open (`useMembershipModalDeepLink.ts:50-52`). |
| Member on `/my-account` clicking an upgrade | Already routed to the manage sheet; gate is a no-op there. |
| **Concurrent double-submit at step 2** | Unchanged — server `checkCanCreateSubscription` is the authority; this spec does not touch it. |

**No money moves in this change.** The gate only decides which screen renders; every
payment path and the server guard are untouched.

### 4.5 The D5a nudge

**Data source (D5c).** `getPastDueRenewalPreview(user)` returns `{ entries, cost }` —
`cost` is the tier's monthly price, `entries` the total granted on the next successful
renewal (monthly base + carry-over). Pure and client-safe (`past-due-renewal-preview.ts:1-9,27`).

**Scoping is free.** The util returns `{ entries: null, cost: null }` for anyone not in
payment recovery (`:26`), so `cost == null` is the render condition. An **active** member
buying a pack sees nothing — they already hold the membership and need no nudge. The
nudge is therefore only ever shown to an **on-hold** member (past-due / unpaid / paused),
which is the group the owner asked about and the group actually losing money.

**Copy (recommended — "state our own numbers"):**

> **Membership on hold.** Settle **${cost}** to reactivate your {tier} membership —
> **{entries} free entries** land as soon as it clears, and your partner discounts come back.
> `[ Reactivate membership ]` → `/my-account/membership?open=payment`

"your free entries land as soon as it clears" is verbatim from the shipped
`RenewalPreviewNote.tsx:22`. Both numbers render only when non-null; if either is null the
note falls back to the existing benefits-only sentence
(`RenewalFailedModal/index.tsx:165`).

**⚠️ Legal — a human must decide this, it is not settled here (rule 11).**
The owner's rationale is a *comparison*: membership is cheaper and carries more entries
than a pack. Two ways to express it:

| Option | Copy shape | Rule-11 risk |
| --- | --- | --- |
| **A — recommended** | State the membership's own price + entries. The pack's price and entries are already on the same screen, so the reader makes the comparison themselves. | **Low.** Each sentence matches a form rule 11 lists as correct ("Tradie ($20/mo) **includes** 15 free entries"). |
| B | Print both side by side — "$20 → 15 free entries vs this $25 pack → 3 free entries" | **Elevated.** An explicit price-vs-entries juxtaposition reads as a per-entry value claim, which is the exact shape rule 11 bans ("never price entries per unit… a tier shown as 'N entries · $X'"). |

Option A delivers the owner's ask — real price, real entries — **without** constructing
the value-per-entry comparison.

> **DECIDED 2026-09-01 (DJ): option A.** The nudge states the membership's own price and
> entries only. **Do not** author a pack-vs-membership comparison sentence, and do not
> render the pack's price or entry count inside this note — the reader already has both on
> screen. Reversing this to B requires a fresh owner decision and a promotions-lawyer read.

---

## 5. Threading checklist

| # | Location | Miss it and… | Failure mode |
| --- | --- | --- | --- |
| T1 | `useMembershipModal.openModal` (`:36`) | every bypass entry point stays broken — the whole fix no-ops | **silent** |
| T2 | `useMembershipModal.openModalWithPackageSelectionFirst` (`:52`) | the picker path (entry CTAs) stays broken | **silent** |
| T3 | Step-2 pre-warm (`MembershipModal/index.tsx:1232`) | the D7 load race still 409s, silently | **silent** |
| T4 | `MembershipSection.handlePlanSelect` (`:327`) | two predicates coexist; drift returns | **silent** |
| T5 | `useMembershipCardCta.onSelect` (`:145`) | same, on the /membership page | **silent** |
| T6 | `useMajorDrawEntryCta` fallback (`:366-378`) | blocking member still lands on the membership tab when the pack catalogue is empty | **silent** |
| T7 | `SubscriptionGateResult` union — add a `reason` without a `redirectTo` | `switch` falls to `default`, member routed to the wrong sheet | **loud** (tsc, if the union is exhaustive-checked) |
| T8 | `BLOCKING_SUBSCRIPTION_STATUSES` (`subscription-helpers.ts:90`) | **nothing** — the resolver wraps the helper. Listed to record that this is deliberately *not* a threading point | n/a |

Six of eight are **silent** — nothing in the build catches them. Hence section 6.

---

## 6. Tests

New: `src/utils/subscription/__tests__/subscription-creation-gate.test.ts`, wired as
`test:subscription-gate` in `package.json` (required — an unwired test file is
undiscoverable).

| Covers | Assertion |
| --- | --- |
| T1–T5 (predicate) | Every status in `BLOCKING_SUBSCRIPTION_STATUSES` → `allowed: false`. **Iterate the exported constant**, so a new status fails the test until handled. |
| Failure line §1 | `null` user, `undefined` subscription, `canceled`, `incomplete_expired`, `expired` → `allowed: true`. **These matter most** — a false block is the expensive regression. |
| D5 | `isSubscriptionPlan: false` → `allowed: true` for every blocking status. |
| D7 | `userLoading: true` → `allowed: true` even when status is blocking. |
| D4 | `past_due` → `?open=payment`; other blocking → `?open=subscription`. |
| T7 | Exhaustive `switch` over `SubscriptionGateResult` compiles with no `default`. |

**Phase 4 (the nudge) needs no new number test.** It renders `getPastDueRenewalPreview`,
whose entries figure is already covered by `npm run test:klaviyo-renewal-preview`
(`verified` — `package.json:313`). The only new assertion is the render condition: with
`cost == null` **or** `entries == null` the note must fall back to the benefits-only
sentence and never print `$null` / `null free entries`.

Not covered by unit tests: T6 and the wiring itself (React hooks, no test runner for
components in this repo — `verified`, no jest/vitest). Those are verified by hand against
the four entry points, listed in the plan.

**Database-level assertions are not needed here** — no grant, charge, or entitlement path
changes. The existing server guard remains the money-safety boundary.

---

## 7. Phases

| # | Ships | User-visible win |
| --- | --- | --- |
| 1 | `resolveSubscriptionCreationGate` + test + wire into `useMembershipModal` (T1, T2) | A member clicking a hero CTA or an old Klaviyo email lands on their membership page instead of a dead checkout step. **Closes all three bypasses.** |
| 2 | Step-2 backstop + toast (T3, D8) | The load-race survivor gets a real message and a "Manage Subscription" button instead of a blank payment step. |
| 3 | Collapse the two card-click guards onto the resolver (T4, T5, T6) | No user-visible change — removes the drifted duplicate so this cannot regress. |
| 4 | D5a nudge copy on the pack step | A past-due member is told reactivating beats buying a pack. **Needs copy sign-off (§9).** |

Phase 1 alone delivers the headline metric. Phases 2–4 each stand alone.

---

## 8. Rollback

**There is no runtime kill switch, deliberately.** CLAUDE.md rule 4: commits are the
rollback unit; flags are added only for named production-rollout risk. Rollback is
`git revert` of the phase commit.

That is acceptable **because no money path changes**. The worst failure is a wrong
redirect: a member sent to their membership page when they wanted checkout, or a guest let
through to a 409 they already get today. The server guard
(`checkCanCreateSubscription`) is untouched and remains the authority, so no rollback
scenario can create a duplicate subscription or a double charge.

**What would change this judgement:** if phase 4's nudge ever became a blocking interstitial
rather than an inline note, it would sit in a purchase path and would need a flag.

In-flight work: none. The gate is a synchronous routing decision with no persisted state.

---

## 9. Open dependencies

| Item | Owner | Asked | Expected | Blocks |
| --- | --- | --- | --- | --- |
| ~~§4.5 option A vs B~~ | DJ | 2026-09-01 | — | **CLOSED — option A chosen 2026-09-01.** |
| ~~Sign-off on the §4.5 option-A wording~~ | DJ | 2026-09-01 | — | **CLOSED — approved 2026-09-01.** |
| Confirm in a browser what a blocked member currently sees at step 2 after the pre-warm 409 | Claude | 2026-09-01 | before phase 2 | Phase 2 only |
| Which bypass path dominates — Klaviyo deep-link vs hero CTA | — | — | — | **Nothing.** `assumed`, and deliberately left open: neither path records how the modal was opened, and the fix closes both regardless. Would need an `openedVia` breadcrumb to answer. |

Phases 1–3 have no external dependency and can start on sign-off.

