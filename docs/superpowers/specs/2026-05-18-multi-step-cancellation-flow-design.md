# Multi-Step Cancellation Flow — Design

**Date:** 2026-05-18
**Domain:** `subscription` (per Domain Manifest)
**Status:** Approved design — ready for implementation planning

## 1. Problem

The current cancellation experience is a single-screen retention popup
(`CancellationUpsellModal`) that offers one fixed sweetener (+100 entries) or a
single downgrade card, gated to show **once per customer lifetime**. It does not
capture *why* a member is leaving, and there is no admin visibility into
cancellation reasons or save performance.

We are replacing it with a **reason-routed, multi-step cancellation flow** that:

- Captures the cancellation reason (prerequisite to proceed).
- Routes the member to the single retention offer best matched to that reason
  (reason-routed offers convert at 15–30% vs 5–10% for generic offers — research
  in §8).
- Falls through to a universal "+100 bonus entries" last rung before the real
  cancel.
- Records the full funnel for an admin analytics view.

## 2. Goals / Non-goals

**Goals**
- Multi-step modal: reason → tailored offer → universal +100 rung → cancel
  confirm.
- Each step is a prerequisite for the next; a persistent ✕ on every step routes
  to the final "are you sure" confirm (never a silent dismiss).
- Desktop = centered popup; mobile = slide-up-from-bottom sheet (parity with
  `PackageSelectionModal`).
- Admin analytics: cancels triggered, reason breakdown, step funnel drop-off,
  overall save rate.
- **90-day post-save retention:** for every member saved by an offer, track
  whether they are still an active subscriber 90 days later, so the admin view
  can show *real* saves vs. delayed churn (see §6a).
- Anti-gaming: each money offer is one-time per customer ever.

**Non-goals**
- No A/B testing of offer copy/sizing in v1 (can layer on later).
- No change to the underlying Stripe cancel semantics
  (`cancelAtPeriodEnd: true` is reused unchanged).
- No SendGrid transactional suppression work — by design (see §7); transactional
  mail must keep flowing to cancelling members.

## 3. Flow / State Machine

```
Entry: user clicks "Cancel" in SubscriptionManagementModal
  → CancellationFlowModal opens   [log: flow_started]

Step 1 — Why are you cancelling?  (prerequisite: must select one)
  7 options; "Other" reveals a free-text box.
  → reason persisted immediately   [log: reason]

Step 2 — Reason-routed lead offer (single screen, copy acknowledges the reason)
  "Too expensive right now"            → 50% off × 2 months
  "I'd prefer a cheaper membership"    → Tier downgrade (existing flow)
  "I don't use the benefits enough"    → Pause 30 days
  "I receive too many messages"        → Unsubscribe email marketing + stay
  "I only joined for a giveaway"       → +100 bonus entries  (terminal lead)
  "I haven't won"                      → +100 bonus entries  (terminal lead)
  "Other"                              → Pause 30d, then waterfall ↓

Step 3 — Universal last rung
  Any decline lands on "+100 bonus entries" UNLESS +100 was already the lead
  offer for this reason (giveaway / haven't won), in which case skip to Step 4.
  ("Other" waterfall order: Pause → 50% off → +100 entries.)

Step 4 — Terminal
  +100 declined → "Are you sure? here's what you lose" confirm
                → Real cancel: POST /api/stripe/cancel-subscription
                  { cancelAtPeriodEnd: true }     [log: outcome=cancelled]
  Accept ANY offer → apply → success → close → refetch
                          [log: outcome=saved, offerAccepted=<type>, savedAt=now]
```

(Log tokens above map to §6 model fields: `flow_started` writes the doc with
`outcome=in_progress`; the offer type is stored in `offerAccepted`, never
encoded into the `outcome` enum.)

**One-time gating:** Pause, 50%-off and +100-entries are each one-time per
customer ever. An already-consumed rung is **skipped** (fall through to the next
rung). If *every* applicable rung is consumed, the flow goes straight to the
Step-4 cancel confirm. Reason capture happens on every run regardless of gating.

**Step 1 prerequisite detail:** selecting one of the 7 options is the only
prerequisite to advance. When `Other` is selected the free-text box appears but
the text is **optional** — an empty `Other` still advances (it is logged as
`reason=other` with empty `reasonText`).

**Exit affordance:** the header ✕ is present on every step and routes to the
Step-4 confirm — it does not silently close the modal.

**Entry conditions:** the flow is only entered for a member with an active
recurring Stripe subscription. The Pause and 50%-off rungs require an active,
non-past-due subscription (see §3a). One-time / non-recurring members keep the
existing direct-cancel behaviour — they are out of scope for the retention
rungs (mirrors today's `canOfferCancellationUpsellRedeem` eligibility split).

### 3a. Past-due / failed-renewal members (edge case — must handle)

The current `CancellationUpsellModal` has an `isPastDue` branch that swaps the
CTA to "Resolve payment" (opens `RenewalFailedModal`).

**Primary reason (fairness):** a past-due member has not paid for their current
cycle. Granting them +100 draw entries to "stay" would put unpurchased entries
into the draw against members who *did* pay — directly unfair, and a real
integrity risk for a prize draw. A past-due member who wants to stay must
*resolve payment*, not be rewarded with free entries.

**Secondary reason (technical):** a past-due subscription *already* has
`pause_collection` engaged by the failed-renewal recovery system, so offering a
retention Pause or 50%-off to a past-due member is both nonsensical and would
directly collide with the recovery pause/clear-logic (§5).

Rule: if the member is past-due/failed-renewal, the flow **skips Steps 2–3
entirely**. Step 1 (reason) is still captured, then it goes straight to a
"Resolve payment vs cancel" terminal (reusing the existing `RenewalFailedModal`
handoff). No Pause, no 50%-off, no +100 for past-due members.

## 4. UI / Responsive Shell

- New component tree under
  `src/components/modals/CancellationFlowModal/**` (replaces
  `CancellationUpsellModal/**`).
- Built on the shared `ModalContainer` primitive. Note: it is exported both as
  `@/components/ui/Modal` (atomic alias) and from `@/components/modals/ui`;
  `PackageSelectionModal` imports the latter. Use whichever the surrounding
  modal code uses — they resolve to the same component.
  Responsive behaviour:
  `presentation={isNarrowViewport ? "sheet" : "dialog"}` where
  `isNarrowViewport = useMediaQuery("(max-width: 639px)")` — same mechanism as
  `PackageSelectionModal` ([index.tsx:33,495](src/components/modals/PackageSelectionModal/index.tsx#L33)).
  This yields desktop centered popup / mobile bottom sheet with the existing
  framer-motion slide animation, scroll-lock, backdrop and back-button handling
  for free.
- Step machine: plain `useState` step counter mirroring `MembershipModal`'s
  pattern. A presentational `StepIndicator` strip sits under `ModalHeader`,
  above the scrolling `ModalContent`; forward navigation is disabled until the
  current step's prerequisite is satisfied.
- Visual grammar reuses the existing `upsell-shell` primitives (`UpsellHero`,
  `InfoGrid`, `UrgencyBanner`, `TrustBar`) so the cancellation infographic look
  (hero, "what you lose" grid, urgency banner, trust bar) is preserved.
- Trigger/visibility stays where it is today: `SubscriptionManagementModal`
  owns a local `showCancellationFlow` state and renders the new modal in place
  of the old one (no `useModalPriorityStore` change).

## 5. Backend

Thin route, logic in a service (per the strict-layering rules — no business
logic in `app/api/**`).

- **New route:** `POST /api/subscription/cancellation-flow` — session-auth,
  Zod-validated at the boundary, delegates to a new
  `CancellationFlowService` in `src/services/subscription/`. A single grouped
  endpoint with an `action` discriminator (`start`, `accept_pause`,
  `accept_discount`, `accept_unsubscribe`, `decline` /
  outcome transitions) rather than one route per offer — keeps the funnel log
  authoritative in one place. Tier-downgrade and the actual Stripe cancel
  continue to use their **existing** endpoints (note: downgrade lives at
  `/api/stripe/downgrade-subscription`, not under `/api/subscription/`). Those
  endpoints do **not** know about the funnel log, so the client reports the
  terminal transition to `/api/subscription/cancellation-flow` (a `decline` /
  `outcome` action) for logging *in addition to* invoking the existing action
  endpoint — the log update is a separate call, not a side effect of the
  downgrade/cancel endpoints.

Offer mechanics:

| Offer | Implementation | Reuse / New |
|---|---|---|
| Cancel | `POST /api/stripe/cancel-subscription { cancelAtPeriodEnd:true }` | reuse as-is |
| +100 entries | existing `/api/cancellation-upsell/redeem` grant logic | reuse; lifetime gate folded into shared one-time helper |
| Tier downgrade | existing `DowngradeConfirmModal` + downgrade handler | reuse |
| Pause 30d | `pause_collection` with `resumes_at = now + 30d`; skips one charge; auto-resumes at full price; member keeps banked entries; **no** new entries accrue during the unpaid pause; one-time per customer | **new** — touches shared recovery code; see Pause-collision section + Phase 3 protocol below (NOT light reuse) |
| 50% off × 2mo | apply a 2-month 50%-off repeating Stripe coupon/discount to the live subscription; reverts to full price automatically; one-time per customer | **new** |
| Unsub email mktg | `syncKlaviyoEmailMarketingFromAdminPreference(user, false)` + persist `user.acceptsPromotionalEmail = false` | reuse service — see side-effect note below |

**One-time eligibility:** a single server-authoritative helper in
`src/utils/subscription/` (or `src/utils/redeemables/`, alongside the existing
`cancellation-upsell-eligibility.ts`) decides which money offers a customer is
still eligible for. The client mirrors it for display only — same dual
client/server pattern the codebase already uses; the comment requiring the two
copies stay in sync is carried over.

**Klaviyo unsubscribe — side effects (verified):**
`syncKlaviyoEmailMarketingFromAdminPreference(user, wantsPromotionalEmail)` —
passing `false` triggers the unsubscribe branch (intent is correct), and it has
no internal admin-role assertion so it is callable from a user-session
endpoint. Two verified caveats the plan must account for:

1. The function is named/JSDoc'd for the *admin preference* path. It also
   unconditionally unsubscribes **SMS marketing** alongside email — so the
   "too many messages" branch will silently opt the member out of SMS
   marketing too, not just email. Acceptable for "I receive too many
   messages" intent, but the modal copy should say "marketing messages" (not
   "emails") so it is not misleading.
2. The DB write (`acceptsPromotionalEmail = false`) is **not** done by the
   service — the new endpoint must persist it itself (mirroring how the admin
   route does it). The retry/idempotency guarantees (5× retry, idempotent
   bulk-delete job) live in `klaviyo.ts` internals, which were verified in the
   earlier investigation; the Klaviyo call failing is non-fatal (logged, DB
   write stands) — the endpoint should treat a Klaviyo warning as success for
   the retention decision but surface it for monitoring.

**Pause-collision guard — the REAL load-bearing path (verified against
source).** The collision is *not* primarily in
`shouldClearPauseCollectionAfterPaidInvoice` (a pure helper taking only
`billingReason` + `previousSubscriptionDbStatus` —
[pauseCollectionPolicy.ts:7](src/services/subscription/pauseCollectionPolicy.ts#L7))
nor inside `resumeAfterSuccessfulRenewalPayment` (a blind 4-line
`stripe.subscriptions.update(id, { pause_collection: "" })` with no subscription
read — [SubscriptionCollectionPauseService.ts:36](src/services/subscription/SubscriptionCollectionPauseService.ts#L36)).
The actual decision is at
[stripe-webhook-handlers/index.ts:3430-3436](src/services/stripe-webhook-handlers/index.ts#L3430):

```
shouldClearPauseForCollection =
  shouldClearPauseCollectionAfterPaidInvoice({...}) ||
  recordMembershipRecurringAffiliate ||
  subscription.pause_collection != null;   // ← clears ANY pause, unconditionally
```

The third clause means: on any paid invoice, if the subscription has *any*
`pause_collection`, recovery resumes it. A retention pause would be cleared by
this clause. The `subscription` object (with `subscription.metadata`) is
already in scope at that call site, so the correct guard reads metadata
**there** — no extra Stripe `retrieve` is needed (correcting an earlier
assumption that the guard belonged inside the resume function).

Two corrected facts that change the protocol:

- The existing suite `npm run test:stripe-collection-pause`
  ([package.json:114](package.json#L114)) imports **only** the pure
  `pauseCollectionPolicy` helper — it has **zero coverage** of the webhook
  clear path or `resumeAfterSuccessfulRenewalPayment`. "Baseline the existing
  suite green" is necessary but proves *nothing* about recovery↔retention
  isolation. New characterization tests are required, not just a green
  baseline.
- The only safe minimal change is to **extend the existing pure policy
  function**, not bolt another `||` onto the webhook expression. The codebase
  already factored the decision into `shouldClearPauseCollectionAfterPaidInvoice`
  precisely so it is unit-testable; the retention exclusion belongs *in that
  function's inputs*.

**Phase 3 risk-elimination protocol (mandatory — the implementer is an AI
agent; this is not optional discipline):**

1. **Lock current behavior with NEW tests first.** The existing suite is
   insufficient. Before touching anything, extend
   `shouldClearPauseCollectionAfterPaidInvoice`'s signature to also accept the
   subscription's `pauseReason` (read from `subscription.metadata.pauseReason`
   at the call site) and **move the `|| subscription.pause_collection != null`
   clause into the pure function** so the entire clear decision is one
   testable unit. Add characterization tests that pin *current* behavior
   exactly (recovery pause + paid invoice ⇒ clear) **before** adding the
   retention branch. Red→green on the lock, then add the new case.
2. **Discriminator is additive, never destructive.** The new retention-pause
   write sets `pause_collection: { behavior, resumes_at }` **and**
   `metadata.pauseReason = "retention"`. `pauseAfterRenewalFailure` is left
   byte-for-byte unchanged (no metadata ⇒ legacy/recovery pause). No existing
   recovery write is modified.
3. **One guarded clause, in the pure function.** Inside the now-extended
   policy function: a `pauseReason === "retention"` pause is NOT cleared by the
   paid-invoice path. `resumeAfterSuccessfulRenewalPayment` is **not** modified
   (no new Stripe I/O inside it). The webhook call site change is only: pass
   `subscription.metadata?.pauseReason` into the policy function.
4. **Required new test cases** (added to `test:stripe-collection-pause`):
   (a) recovery pause + `subscription_cycle` paid invoice ⇒ still clears
   (regression lock); (b) recovery pause with non-null `pause_collection` +
   unrelated paid invoice ⇒ still clears (locks the moved `!= null` clause);
   (c) retention pause + any paid invoice ⇒ NOT cleared; (d) retention pause
   resumes only via its own time-boxed cron. All red→green.
5. **Auto-resume cron — follow the real cron pattern, not a lock.** There is
   **no shared cron job-lock infra** (`ChargeJobLock` is an admin-charge
   single-purpose lock, not cron infra; existing crons such as
   `membership-daily-snapshot` use Bearer `CRON_SECRET` auth + `connectDB` +
   *idempotent writes*, no locking —
   [cron/membership-daily-snapshot/route.ts](src/app/api/cron/membership-daily-snapshot/route.ts)).
   The 30-day auto-resume cron mirrors that template and is idempotent (only
   touches retention pauses whose `resumes_at` has passed; re-running is a
   no-op). It also requires a new entry in `vercel.json` `crons[]`
   ([vercel.json](vercel.json)) — that config edit is expected, not "no infra".
6. **Definition of done for Phase 3:** the extended policy function is fully
   unit-covered; every NEW case in step 4 green; the pre-existing
   `pauseCollectionPolicy` cases unchanged in behavior; and a written
   reasoning trace in the commit walking (i) a recovery pause and (ii) a
   retention pause through the webhook clear decision *and* the auto-resume
   cron, showing they never cross. Phase 3 does not merge if any pre-existing
   policy assertion changed.

If, at step 1, `npm run test:stripe-collection-pause` is not already green on
`main`, stop and surface it — do not build on a broken baseline.

## 6. Data Model & Analytics

New model `src/models/CancellationFlowEvent.ts` (one collection, one document
per flow run):

- `userId`
- `reason` (enum of the 7 options)
- `reasonText` (free-text, only when reason = `other`)
- `offersShown[]` (ordered list of offer types presented)
- `offerAccepted` (offer type | `null`)
- `outcome` (`in_progress` | `saved` | `cancelled`; `abandoned` is derived in
  the admin view, not stored)
- `pastDue` (boolean — was the member past-due, so Steps 2–3 were skipped per
  §3a; lets the admin view exclude them from offer-conversion denominators)
- `startedAt`, `endedAt`
- `savedAt` (set when `outcome=saved` — the clock-start for §6a)
- `retention90` (`null` until evaluated, then `retained` | `churned`) — filled
  by the §6a job

Written on `flow_started` with `outcome` initialized to `in_progress`; updated
on each terminal transition to `saved`/`cancelled`. `abandoned` is **not**
written by a client beacon (tab-close beacons are unreliable); instead the
admin view derives it: any doc still `in_progress` past a cutoff (e.g. older
than 1h) counts as abandoned. This keeps save-rate denominators honest without
depending on the browser firing a final request.

New admin view (under the existing admin area, `docs/admin` domain for the UI;
the model itself is `subscription` domain): cancels triggered, reason
breakdown + share %, step-by-step funnel drop-off, overall save rate, **and the
§6a 90-day retention split for saved members**. Read-only; reuses existing
admin query/table patterns.

### 6a. 90-day post-save retention tracking

For each doc with `outcome=saved`, we want to know if the save was real. A
**daily cron route** following the existing cron template — Bearer
`CRON_SECRET` auth + `connectDB` + idempotent writes, exactly like
[cron/membership-daily-snapshot/route.ts](src/app/api/cron/membership-daily-snapshot/route.ts);
**there is no shared cron job-lock to reuse** (the codebase's crons rely on
idempotency, not locking — earlier "reuse job-lock infra" wording was wrong) —
runs and, for every `saved` doc where `savedAt <= now - 90d` and
`retention90 == null`:

- Look up the member's *current* subscription state.
- Write `retention90 = "retained"` if they still have an active recurring
  subscription, else `"churned"`.

This is read-only against the user/subscription state — it never mutates a
subscription. It is idempotent (only touches docs with `retention90 == null`)
and bounded (date-windowed query, not a full-collection scan). The admin view
then shows, per offer type and overall: saved count, and of the matured ones
(≥90d) the retained vs churned split. Docs not yet 90 days old are reported as
"pending" so the percentage is computed only over matured saves (no vanity
inflation). Adds one cron route + a new `vercel.json` `crons[]` entry (config,
expected) + one field-update path. **Manifest note:** a new route under
`src/app/api/cron/**` is owned by the **`infrastructure`** domain, not
`subscription` — the doc-sync Stop hook will require `docs/infrastructure/`
updated for the cron route even though the rest of this feature is
`subscription`/`admin` (see §7).

## 7. Migration & Risks

- **Replaces** `CancellationUpsellModal` entirely (the old single-screen modal
  is removed, not kept alongside).
- **Manifest edits required (verified path-by-path — doc-sync Stop hook will
  block otherwise):**
  - `src/models/CancellationFlowEvent.ts` — **NOT covered.** The
    `subscription` domain lists models by explicit filename, with no
    `src/models/**` wildcard ([CLAUDE.md:171](CLAUDE.md#L171)). This new model
    **must** be added to `subscription.paths` explicitly.
  - `src/components/modals/CancellationFlowModal/**` — the manifest currently
    lists `CancellationUpsellModal/**` under `subscription`
    ([CLAUDE.md:163](CLAUDE.md#L163)); rename that entry. Note this path also
    matches `src/components/modals/**` under the `shared-ui` domain, so
    doc-sync may require **both** `docs/subscription/` and `docs/shared-ui/`
    touched — keep the modal documented in `subscription` and expect the
    dual-domain prompt.
  - `src/services/subscription/**`, `src/app/api/subscription/cancellation-flow/**`
    — already covered by `subscription` `**` globs. OK.
  - The new §6a cron route under `src/app/api/cron/**` — owned by the
    **`infrastructure`** domain ([CLAUDE.md:621](CLAUDE.md#L621)); requires
    `docs/infrastructure/` updated, not `docs/subscription/`.
  - Admin analytics UI (`src/components/admin/**` / `src/app/admin/**`) — owned
    by the **`admin`** domain; requires `docs/admin/`.
  - There are **two** CLAUDE.md copies (repo root and this worktree) carrying
    the manifest block; both must be edited identically — the doc-sync hook
    reads the manifest.
- **No data migration required.** The legacy `user.cancellationUpsellRedeemed`
  boolean becomes the one-time gate for the +100-entries rung — existing
  redeemers are simply already-consumed for that rung.
- **Email/SMS scope (intended behavior, not a risk):** the "too many messages"
  branch suppresses **marketing email + marketing SMS** (Klaviyo). It
  intentionally does **not** touch **transactional** mail, which goes through
  SendGrid (receipts, renewal notices, payment-failed warnings). A member who
  is cancelling/staying must still receive transactional messages — so the
  Klaviyo-marketing-only scope is correct *by design*, not a gap. No SendGrid
  suppression work is wanted or in scope.
- **Offer-sizing note:** 50% for 2 months is above the ~35% threshold at which
  customers learn to game cancel flows (research §8). The one-time-per-customer
  gate is the mitigation; if abuse appears, reduce the discount before removing
  the gate.

## 8. Research Basis (summary)

Reason-routed offers convert at 15–30% vs 5–10% generic; well-built flows save
20–45% of attempts. Pause is strongest for low-usage/situational reasons
(35–45% save); discount/tier-down is strongest for price reasons (25–35%);
preference complaints ("too many messages") should be *fixed*, not bribed.
Sources: ProsperStack, Recurly, FunnelFox, ChurnStop, Churnkey, Chargebee,
Cleverbridge (cited in the brainstorming transcript). Confidence: high on
reason-routing and the pause/discount mapping (corroborated across 5+
independent sources); medium on exact save-rate percentages (vendor blogs —
treat as ranges).

## 9. Implementation Phases (for the plan)

1. **Reason capture + modal shell + analytics model.** New responsive
   `CancellationFlowModal` (Step 1 only), `CancellationFlowEvent` model,
   `flow_started`/`reason` logging, wired into `SubscriptionManagementModal`
   replacing the old modal. Includes the §3a past-due short-circuit (skip
   Steps 2–3, reuse `RenewalFailedModal` handoff) from the start. Reuses
   existing cancel/+100 endpoints for the terminal path. *User-visible win:*
   reasons are captured; flow works end-to-end with the existing offers.
2. **Reason-routed offer step + universal +100 rung + one-time gating.** Step 2
   routing, Step 3 fallback, all-rungs-consumed → confirm, shared eligibility
   helper, ✕→confirm behaviour.
3. **Pause 30d offer (highest-risk phase).** Execute the **§5 Phase 3
   risk-elimination protocol verbatim** — baseline the existing pause/recovery
   suite green first, additive `metadata.pauseReason` discriminator, minimal
   read-only guard branch in `resumeAfterSuccessfulRenewalPayment` +
   `shouldClearPauseCollectionAfterPaidInvoice`, test-first on the shared
   edits, cron-based time-boxed auto-resume (no new scheduler), entries
   handling. Phase does not merge unless every pre-existing pause test is still
   green plus the new retention-vs-recovery cases.
4. **50% off × 2 months offer.** New Stripe coupon application to the live
   subscription.
5. **"Too many messages" unsubscribe branch + admin analytics view.** Reuse
   Klaviyo service from a user-session endpoint (marketing email + SMS only,
   transactional untouched); build the read-only admin funnel/reason/save-rate
   view; finalize docs.
6. **90-day post-save retention (§6a).** Daily cron (reusing existing
   `src/app/api/cron/**` + job-lock infra) that matures `saved` docs ≥90d old,
   sets `retention90`, and the admin view's retained-vs-churned split. Lowest
   risk (read-only, idempotent, bounded); ships last so earlier phases aren't
   blocked on it.

Each phase ships a usable increment; the leanest path that satisfies the
approved design (per the no-overengineering rule).
