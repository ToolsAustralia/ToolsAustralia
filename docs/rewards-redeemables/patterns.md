# Rewards-Redeemables — Patterns

## P1. Service-per-action

Distinct services for distinct actions: `RedemptionService` (redeem), `CampaignService` (issue), `DrawGrantService` (draw-tied issue), `TargetingService` (filter). Don't merge — keeps each file focused and testable.

## P2. Pure-targeting / impure-action split

`TargetingService` and `campaignAudienceFilter.ts` are pure (input → user list). `CampaignService.run()` is impure (writes issuances). The split mirrors the [subscription P1 pure-policy pattern](../subscription/patterns.md#p1-pure-policy-split-for-testability).

## P3. Stable issuance keys

Like Stripe idempotency: every `RedeemableIssuance` has a deterministic key derived from `(campaignId | drawId, userId)` so re-runs and webhook retries don't double-issue.

## P4. Reverser modules for refund symmetry

Refund symmetry is implemented as named reversal steps (`campaignUnredeem`, `milestoneRevoke`, `promoLink.unredeem`, …) registered in `buildLedgerReversalSteps` ([src/utils/payment/refund-ledger-reversal.ts](../../src/utils/payment/refund-ledger-reversal.ts)) and run by the generic orchestrator under [src/utils/payment/reversers/](../../src/utils/payment/reversers/). Steps claw back redeemed grants too (un-redeem, then revoke). Follows the [payment P1 reverser pattern](../payment/patterns.md#p1-reverser-modules-per-grant-type).

## P5. Wallet read uses TanStack Query, not Zustand

Per CLAUDE.md client-state conventions, server-derived state (the wallet) is owned by TanStack Query. Don't mirror it into Zustand.

## P6. Spotlight via localStorage

Per-user UX state (which spotlights / first-seen tutorials this user has dismissed) lives in localStorage via `rewards-widget-spotlight-storage.ts`. Don't store in Mongo — too fine-grained and not security-relevant.

## P7. Bonus-code trigger contract — one shape, one wiring point

A per-customer bonus code is minted at an **eligibility moment**, never on a schedule. There are
three such moments — cancel-click, checkout-start, one-time-purchase — but since 2026-08-26 the
server does not mint at any of them. **Every mint now enters through one door**: Klaviyo calls
[`POST /api/bonus-codes/v1/issue`](./api.md#post-apibonus-codesv1issue--the-klaviyo-bonus-code-webhook)
from *inside* the nurture flow for that moment, one step above the discount email, and names the
trigger in the body.

Why the move: the flows send 2.5–17 days after the qualifying act, and the personal window is a
fixed 72 hours. Minting at the act meant two of the three flows emailed a code that had already
expired. Anchoring the window on the webhook call means the clock starts when the email is about
to send.

The orchestration behind that door is unchanged and still lives in a service, not the handler:

```ts
// src/services/redeemables/mintBonusCodeForTrigger.ts — the route's only delegate
const result = await CampaignService.ensureCampaignIssuanceForUser({
  userId: String(user._id),
  campaignCode: BONUS_CODE_BY_TRIGGER[trigger],
  trigger,
});
if ((result.outcome === "minted" || result.outcome === "rearmed") && result.issuance) {
  await BonusCodeNotifier.notify({ user, issuance: result.issuance, trigger });
}
return result; // the route maps the outcome to a status
```

**PRECONDITION — the campaign's targeting must admit the trigger's population.** Read this first;
its absence is what let a Critical defect ship invisibly. `isUserEligibleForCampaign` normally
decides eligibility from a *stored audience*, and every stored-audience branch keys off
`hasActiveSubscription`. Two of the three triggers fire for people who by definition have none
(one-time-purchase gates on `!subscription.isActive`; checkout-start fires for a guest seconds
after registering), and the third fires *after* an immediate cancellation has set
`subscription.isActive = false`. So the rule is:

> When a trigger is passed **and** `personalWindowGoverns(campaign)`, **the trigger IS the
> targeting** — the customer already proved eligibility by doing the qualifying thing.
> `triggerIsTargeting` waives exactly two things: the implicit active-subscription requirement,
> and the `requiresEmailVerified` requirement (which would otherwise exclude every guest, since
> checkout-start fires before a verification email could possibly be actioned). The email waiver is
> **unconditional** — not a fallback on an unset value. Written as a fallback it was dead code,
> because the schema persists `requiresEmailVerified: true`; see [gotchas.md](./gotchas.md).

Everything an admin set **on purpose** still gates: manual/CSV pins, explicit `excludeUserIds`, an
`states`, `membershipTiers`, `topEntriesPercent`, and the
inactivity window. With no trigger, `triggerIsTargeting` is `false` and every pre-existing path —
including the wallet sweep — is byte-identical. Pinned by `npm run test:trigger-eligibility`.

**Do not hand-roll the block — call the helper.**
[`mintBonusCodeForTrigger(user, trigger)`](../../src/services/redeemables/mintBonusCodeForTrigger.ts)
is the single entry point. It owns the outcome check, the notify and the production gate, never
throws, and returns the outcome so its caller can pick a status. Its only caller is the webhook
route. If a future feature needs to mint, it calls this helper — it does not reimplement the shape,
and it does not put the orchestration in a route handler.

Five rules are load-bearing:

1. **Codes are named in exactly one place.** [`BONUS_CODE_BY_TRIGGER`](../../src/config/bonusCodes.ts)
   maps `BonusCodeTrigger` → campaign code (`cancel-click` → `BACKIN200`, `checkout-start` →
   `LOCKIN100`, `one-time-purchase` → `EXTRA100`). No call site spells a code literal.
2. **Notify ONLY on `minted` / `rearmed`.** The other outcomes (`already_active`, `spent`,
   `expired_no_rearm`, `not_applicable`) must not email. This is also what keeps the
   `LEGACY_MISSING_EXPIRY` sentinel (epoch 0, normalised in for a legacy row with no `expiresAt`)
   away from a customer-facing date — it can only surface on `spent` / `expired_no_rearm`, and
   neither notifies.
3. **Nothing throws out of the mint path.** `ensureCampaignIssuanceForUser` catches internally and
   returns `{ outcome: "error" }`; `mintBonusCodeForTrigger` catches everything too and returns the
   outcome rather than raising. The route reads that outcome to choose a status — it never relies on
   an exception, because a thrown error inside a webhook handler is a 500 with no audit row.
3b. **ONE production gate, ahead of the MINT.** `mintBonusCodeForTrigger` returns early unless
   `VERCEL_ENV === "production"`. Gating only the email is not enough: Vercel previews are
   production builds against the shared database, so a preview deploy would still write the
   issuance row and thereby BURN a real customer's one-per-lifetime grant — they would later be
   told they had used a code they never saw. `BonusCodeNotifier` keeps a copy of the gate as an
   inner backstop for any future direct caller; the helper's is the authoritative one.
3c. **The notify is awaited in full — no wait budget** (the 5s ceiling was removed 2026-08-26).
   Its entire justification was that the mint used to be awaited on the customer's own
   *registration request*, where a 30s Klaviyo stall read to them exactly like a failed signup.
   Issuance now runs from the inbound Klaviyo webhook
   ([api.md](./api.md#post-apibonus-codesv1issue--the-klaviyo-bonus-code-webhook)), which blocks no
   customer request, so the ceiling bought nothing and cost an "outcome unknown" marker on the row.
   Do not reintroduce it. A `notify()` that throws is logged and does **not** change the outcome the
   route reports — the grant already exists at that point.
3d. **The service RETURNS its outcome** (`Promise<StampedIssuanceResult>`). The route needs it to
   pick a status: `error` → `500` (a retry recovers the grant), everything else → `200`. Do not
   inline this orchestration into the handler — the layering rule that caused it to be extracted
   applies identically to the route.
4. **`console.error`, never `console.log`/`warn`.** Production builds strip the others
   (`next.config.ts` `compiler.removeConsole`), so a stripped log is a trigger you cannot debug.
5. **Inert by default.** A code here is only a lookup key. With no matching active
   `MonthlyEntryCampaign` row, `ensureCampaignIssuanceForUser` returns `not_applicable` and every
   wired path behaves exactly as it did before the wiring.

The three wiring points:

| # | Where | Trigger | Gate |
|---|-------|---------|------|
| 1 | [`POST /api/bonus-codes/v1/issue`](../../src/app/api/bonus-codes/v1/issue/route.ts) → [`mintBonusCodeForTrigger`](../../src/services/redeemables/mintBonusCodeForTrigger.ts) | whichever of `cancel-click` / `checkout-start` / `one-time-purchase` the Klaviyo flow names in the body | shared secret (`BONUS_CODE_WEBHOOK_SECRET`) → `VERCEL_ENV === "production"` → fail-closed daily mint budget → customer resolution → the campaign's own eligibility rules. **The only mint path there is.** |
| 2 | [monthly issuance cron](../../src/app/api/cron/monthly-redeemables-issuance/route.ts) | *(negative)* | filters out any campaign with `validForHours` — a trigger campaign is never mass-minted (**lock 1 of 3**; lock 2 is the no-trigger check in `isUserEligibleForCampaign`, lock 3 is the `issuedBy === "cron"` refusal in `issueCampaignToUsers`) |
| 3 | [`stripe-webhook-handlers/index.ts`](../../src/services/stripe-webhook-handlers/index.ts) | *(negative)* | `campaignCode` from subscription metadata is gated on `isInitialSubscriptionInvoice` so a renewal cannot auto-redeem a re-armed grant |

**No server call site mints any more.** `CancelSubscriptionService`, `payment-processing.ts`'s
`grantBenefits` and `register/route.ts`'s
`fireKlaviyoStartedCheckoutForGuestRegistration` each used to call `mintBonusCodeForTrigger`
directly; all three were removed on 2026-08-26. What each of those places still owes the feature is
the **Klaviyo event that starts the flow** — the flow is what calls the webhook. Deleting one of
those emits silently kills the whole nurture sequence downstream of it, and nothing in this
codebase will fail.

**Cancel-click no longer means the cancellation COMMIT.** It means the moment the win-back flow
reaches its discount email. The commit is still what *enters* the flow (that is what the cancel-time
Klaviyo event is for) and is still the right population — a member saved by a retention offer never
churns — but `subscription.cancelledAt` and the personal window are now **different instants**, days
apart. Do not reintroduce code that assumes they are the same.

**The old "authed checkout-start is unwired" gap has dissolved.** It existed because the
authenticated `Started Checkout` events are emitted client-side (`useMembershipCardCta.ts`,
`MembershipSection.tsx`) and components cannot reach Mongo. A Klaviyo flow does not care whether the
event that entered it was emitted from a browser or a server, so the authed cohort is reachable by
building a flow on the authed event. No server-side move is needed.

## Cursor agent

`.cursor/agents/growth-integrations.md` covers this domain along with promo and tracking. Read its boundary before non-trivial changes.
