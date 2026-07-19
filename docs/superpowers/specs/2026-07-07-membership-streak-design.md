# Membership Streak — Design Spec

**Date:** 2026-07-07 · **Owner:** DJ · **Status:** awaiting owner review
**Business case + full analysis:** claude.ai artifact "Membership Streak — Feature Proposal" · **UI concept:** artifact "The Forge — Streak Experience Mockup"

## 1. What this is

Reward consecutive months of membership with escalating **free entries** auto-granted into the Major Draw, plus a permanent Founding-member badge at 12 renewals. Targets the months-2–6 churn cliff; matches the AU category norm (LMCT+/Alluxe accumulating tenure entries). Near-zero marginal cash cost (prize spend is fixed); the cost is pool dilution, modelled and accepted by the owner (~44% of pool year 1 → ~18% mature).

## 2. Product decisions (locked)

1. **Streak = consecutive paid renewals, tier-agnostic.** Join = **month 0** (member is "on the track", no progress). Each paid `subscription_cycle` invoice increments by 1. Counts **paid cycles, not calendar months** (reanchors can legitimately produce two cycles in one calendar month — both count).
2. **Ladder (flat across tiers, REPEATS EVERY STREAK YEAR — owner decision 2026-07-07):** renewal 2 → +100, 4 → +200, 6 → +300, 8 → +400, 10 → +500, 12 → +600 + permanent **Founding member** badge (badge fires once, cycle 1 only). Every rung recurs at `threshold + 12k`: month 14 ≡ month 2 (+100 again), … month 24 ≡ month 12 (+600), and so on — a member is never more than 2 renewals from a reward, in any year. Engine: `MilestoneReward.recurrencePeriod = 12` + `computeCycles`. Cost note (accepted): retained members earn 2,100/streak-year ongoing, not 600/yr after year 1.
3. **Continuity (forgiving):** recovered past-due **keeps** the streak (recovery pays the same cycle invoice → increments late, naturally). Retention pause (`behavior: void`) **freezes** it (no invoice → no movement — emergent, zero pause code). Reactivate within the 30-day grace **continues** it. Upgrade/downgrade **never touches** it. Only full lapse → resubscribe (`create_new`) **resets to 0**; rungs re-earnable on the new streak generation.
4. **Delivery: auto-granted, no claim step.** On the qualifying renewal webhook, entries land in the target Major Draw (freeze/gap-aware via `getTargetMajorDraw` — grants during the blackout route to the **next** draw and copy must name the receiving draw). Distinct `streak` bucket in `entriesBySource` + EntryWallet.
5. **No payment, no reward — structurally.** The milestone check runs only after a paid renewal increments the counter. Paused/past-due/cancelled members can never receive streak entries into a cycle they didn't pay for.
6. **Copy rules (legal):** always "free entries"; never odds/chances language; per-rung amounts in-app (never the 2,100 year total); streak is protected by *keeping the membership*, never by buying; at-risk copy is truthful ("fix your card and it carries on — recovery keeps it"); "one-time packages" never "Additional packages"; celebration names the receiving draw.
7. **Second draw rule (pre-decided):** streak rewards target the **main 27th Major Draw only**, forever.
8. **Sunset rule:** if month-2/3 churn improvement is < ~1.5pp after two full post-launch cohorts, freeze unreached rungs above 6 months (never cut earned/reached ones).

## 3. Existing members at launch (backfill policy — decided)

**Recognise the past, pay from the next rung forward. No retroactive grants.**

- The backfill computes each member's true `streakMonths` from the `MembershipRenewalCycle` ledger (succeeded/recovered rows by `dueAt`; gap > 65 days **with cancel evidence** — a `canceled` OR `scheduled_cancel` history row within a 40-day lookback of the previous paid cycle — = generation break; long gaps without evidence are recovery/pause lag and continue), cross-checked against `MembershipStatusHistory` (complete from ~2026-04-29). Repair runs never regress a live-written reset (live `streakGeneration` wins).
- Rungs **at or below** the computed streak are marked **achieved (pre-launch)**: `MilestoneIssuance` rows with new status `backfilled` — visible as completed in the UI, **zero entries granted**. Retro-granting a mature base would dump a huge entry mass into one draw (unfair, visible, and a one-off odds crush on the live Facebook draw).
- The member's **next** rung fires normally: a 3rd-renewal member gets +200 at renewal 4; a 7th-renewal member gets +400 at renewal 8; a 4th-renewal member gets +300 at renewal 6.
- **12+ members get the Founding badge immediately at launch** (status costs nothing and is the identity reward); their next entry grant is their next 12th-renewal anniversary.
- **Ambiguity rounds UP** for pre-2026-04-29 history (never under-credit veterans); the card shows "streak tracked since {date}"; support gets a manual streak-adjustment tool; launch copy frames it: *"your streak is already at renewal 7 — +400 free entries land at your 8th."*
- Optional, separate, owner's call: a one-off "streak launch" bonus campaign for tenured members via the **existing** `MonthlyEntryCampaign`/`BonusEntryPromo` machinery — deliberately decoupled from the streak system.

## 4. Data model

| Change | Detail |
|---|---|
| `User.subscription.streakMonths` | `number`, default 0 — durable counter |
| `User.subscription.streakGeneration` | `number`, default 1 — increments on each `create_new` reset; enables re-earn without colliding with the recurring-anniversary `achievementCycle` |
| `User.subscription.lastStreakStartInvoiceId` | `string?` — idempotency marker for the join/resubscribe writer (mirrors `lastReanchoredInvoiceId` pattern) |
| `MilestoneReward.milestoneType` | add `"streak-months"` (new type — do **not** reuse gap-blind `loyalty-days`; deactivate any live loyalty-days rows at P2) |
| `MilestoneReward.autoGrant` | `boolean`, default false — bypasses manual claim |
| `MilestoneIssuance` | add status `"backfilled"`; stamp `streakGeneration`; unique index becomes `(milestoneRewardId, userId, streakGeneration, achievementCycle)` |
| `MajorDraw.entriesBySource` | add `"streak"` key **to the schema** (strict-mode drop footgun documented at MajorDraw.ts:241) — and fix the pre-existing `promo-link` schema gap while there |

Seed: 2/4/6/8/10 non-recurring rows + one `isRecurring` 12-row (+600) — anniversaries reuse the existing `maxCycles = floor(metric/threshold)` logic untouched.

## 5. Write paths (all in the Stripe webhook — single source of benefit truth)

1. **Increment:** beside `upsertRenewalCycleFromPaidInvoice` (stripe-webhook-handlers/index.ts:~3407; already strictly gated to `billing_reason === "subscription_cycle"`). Change the upsert to return `{ firstTimeSucceeded }` from the pre-image (`new:false`; true when absent/`expected`/`failed`) and increment **only on that signal** — replay-proof, and past-due recovery increments naturally (recovery pays the same cycle invoice). Never a bare `$inc`.
2. **Set/reset:** one writer in the `subscription_create` grant block (beside the existing isResubscribe detection, index.ts:~3638). Fresh join → `streakMonths = 0`, `streakGeneration = 1`. Resubscribe: within 30 days of `endDate` → **continue** (preserve counter); past grace → **reset** (`streakMonths = 0`, `streakGeneration + 1`). Guarded by `lastStreakStartInvoiceId $ne invoiceId`. `handleSubscriptionDeleted` must **preserve** `streakMonths`/`streakGeneration` (like `lastMonthAccumulatedEntries`), and the upgrade-activation subdoc rewrite (index.ts:~1645, resets `startDate`) must carry both fields — regression test required.
3. **No writes** on `subscription_update` (upgrades), the $0-trial guard invoice, retention pause apply/resume.
4. **Refund/chargeback:** full refund of an incrementing cycle invoice decrements `streakMonths` by 1 (floor 0) inside `reverseMembershipLedger`; the streak issuance id is recorded in the cycle's `BenefitsGranted` `grants.milestoneIssuanceIds` + `drawGrants` ledgers at grant time, so the existing `milestoneRevoke` step reverses entries with zero new refund code. Partial refunds: no action (existing policy).

## 6. Milestone fire path

- `MilestoneEvaluator` gains `streakMonths` metric (read off the user doc — free). `checkAndIssueMilestones` maps `"streak-months"` → that metric.
- **Auto-grant:** create issuance `active` → `RedemptionService.autoRedeemMilestoneIssuance` (reuses the proven atomic claim block) → `DrawGrantService.grantMonthlyCouponEntries(userId, entries, "streak")` (new `sourceKey` param, default `"bonus-entry-promo"` for existing callers). Skip the recursive milestone re-check when invoked from auto-grant.
- **Hardening (required):** catch E11000 as already-issued inside the rung loop (race is real: payment webhook + queue retry + DrawGrantService all call it); nightly cron sweep auto-redeems any `active`-but-ungranted streak issuance (crash-safety); issuedCount circuit-breaker on the cron (abort if > N× trailing average — mass-fire guard).
- **Streak entries are excluded from the `entries-gained` milestone metric** (no free-entries-compounding loop).
- `streak` key threaded through **every** `bonus-entry-promo` consumer: DrawGrantService, both unredeem paths, `removeMajorDrawEntries` unions, refund `drawGrants` ledger, both summations in major-draw-queries.ts, `freshEntriesBySource` in payment-processing.ts, EntryWallet. Grep `bonus-entry-promo` before shipping.
- **Norm lockstep (P2 blocker):** `MILESTONE_TYPES` enum in `src/lib/internal-norm/schemas/milestone-rewards.ts` + `npm run build:norm-manifest` + `docs/internal-norm/norm-context.md` + `npm run norm:smoke` — a missed enum is a runtime 500 on the Norm milestone route.

## 7. UI ("The Forge" — per approved mockup)

- Replace `LoyaltyStreak.tsx` internals behind the existing `loyaltyStreak` flag: evolving flame (spark → flame → forge → blaze → Founding hex badge), renewals count inside the flame, rung rail with amounts, **day-granular fuse** to the next renewal, draw-day state on the 27th, guest/one-time teaser (currently renders null — becomes an acquisition surface).
- States: joined / mid-streak / one-to-go / milestone-hit / at-risk / frozen / fresh-start (+ PREV. BEST engraving) / Founding. The current at-risk line ("it resets if payment isn't updated") is **retired** — copy-rule violation.
- Celebration: one spring + one `useConfetti` burst, silent, skippable, fires once via a server-consumed seen-flag; all motion `motion-safe` with information-parity static fallback.
- `useDashboardState`: drop the `monthsBetween(startDate)` derivation; read real `streakMonths` + `nextStreakMilestone {threshold, entriesAmount, monthsToGo}` from the my-account payload. EntryWallet gains the gold **Streak** bucket (renders at 0 with "first drop at your Nth renewal"). `RewardsMilestones` stepper reads config (hardcoded 3mo/+50, 6mo/+250 replaced); flip `milestoneProgress` + `loyaltyStreak` at P3.

## 7b. The three member-facing moments (owner-requested, 2026-07-07)

**M1 — Sign-in / landing awareness.** The member learns about milestone grants on their **first dashboard visit after the grant lands** (which for most members IS the post-sign-in moment): the celebration plays exactly once, driven by a server-consumed seen-flag on the issuance. Non-milestone renewals get a **quiet tick** only (counter glow + updated next-rung line — no ceremony). Members who don't sign in still learn via the P4 Klaviyo celebration email. No separate "streak announcement" surface is built.

**M2 — Milestone popup decision: NO new modal (decided).** The dashboard already competes for attention at load (`UserSetupModal`, `PromoWelcomeModal`, `RenewalFailedModal`, gate/mini-draw triggers — arbitrated by the modal-priority store). Adding a blocking streak modal would worsen popup fatigue and cheapen the moment. The celebration is therefore **in-card + one toast** (existing `useEntryRewardToast` pattern): flame flare → rung forges → "+N FREE ENTRIES" stamp → single confetti burst → persistent banner naming the receiving draw, with the EntryWallet Streak bucket counting up in sync. Silent, skippable, fires once, reduced-motion fallback with full information parity. The 12-renewal Founding moment uses the same chassis with the badge-forging finale — still not a modal.

**M3 — Cancellation streak-save (the "offer against cancelling").** A **stakes step EMBEDDED in the existing `CancellationFlowModal`** — no new modal, no separate flow; one additional screen in the current sequence (reason → **stakes** → pause → discount → confirm):
- **Always shown** to every cancelling member (owner decision 2026-07-07 — no `streakMonths >= 2` gate). The content adapts, never fabricates:
  - `streakMonths >= 2` — **loss framing**: *"Before you go — you're **{n} renewals in**. Cancelling ends your streak, and **+{amount} free entries** land at your {ordinal} renewal ({date})."* with the streak track rendered inline.
  - `streakMonths 0–1` — **forward framing** (what they'd be walking away from): *"Your streak's just getting started — **+100 free entries** land at your 2nd renewal, climbing every couple of renewals to **+600 a year**, automatically."* with the ladder preview rendered inline.
- The existing 30-day pause offer is **reframed** on the next step: *"Pause instead — your streak is **frozen, not lost**"* (true per continuity rule 3; this makes the pause offer materially stronger at zero cost).
- The cancel path stays plainly visible on every step (*"Continue cancelling"*) — anti-dark-pattern rule; the screen states only true facts.
- Instrumented via new `CancellationFlowEvent` step values (stakes-shown / stakes-kept / stakes-paused / stakes-continued, with the streak count on the event) and run through the existing A/B framework so the save-rate lift is measured, not asserted.

Interactive simulations of M1/M2/M3 live in the "Forge" design artifact (Moments section) — reviewed and approved by the owner before P3/P4 build.

## 8. Phases (each shippable)

| Phase | Scope | Effort | Key tests |
|---|---|---|---|
| **P1 — dark counter + backfill** | User fields, increment/reset writers, `scripts/backfill-membership-streaks.ts` (writing-ops-script conventions: dry-run default, CSV audit, progress lines) | M | new `test:streak-counter` (cycle +1, replay no-op, upgrade no-op, $0-trial no-op, recovery +1, grace continue, reset), `test:streak-backfill`; keep `test:zero-trial-guard`, `npm test` green |
| **P2 — config + auto-grant (flag off)** | MilestoneReward/Issuance changes, evaluator metric, autoGrant path, `streak` sourceKey threading, seed script (**order: seed `isActive:false` → insert backfilled markers → activate**), Norm lockstep | M | new `test:streak-milestones` (fire-once, recurring 12/24, sweep self-heal, sourceKey lands); keep `test:redeemables`, `norm:smoke` |
| **P3 — UI + flag flip** | Forge card, wallet bucket, stepper, celebration, my-account payload | M | dashboard-state tests extended |
| **P4 — lifecycle hooks** | Klaviyo `streak_months` profile property + events (at-risk, milestone) — **pending**; streak-stakes step **SHIPPED 2026-07-15** (`StepStakes.tsx`, `startPhaseFor` routing — always shown for non-past-due while the streak feature is live; loss/forward framing by streak depth; pause-freeze reframe; `streakMonthsAtStart` + `stakesAction` instrumentation on `CancellationFlowEvent`. A separate A/B holdout was deliberately dropped: the owner mandated ALWAYS-shown, so there is no variant to randomise — measurement comes from the event fields) | S | keep cancellation-flow + klaviyo suites green |

Doc-sync per phase: subscription / billing-stripe / rewards-redeemables / draws / dashboard-account / internal-norm domains + BUSINESS.md & README.md & CUSTOMER.md (streak is a business- and customer-material change).

## 9. Guardrails & measurement

Extract the **pre-launch cohort baseline** (month-2/3 renewal rates from `MembershipRenewalCycle`) **before** launch. Primary: month-2/3 renewal-rate delta (+2–5pp hypothesis). Guardrails: pack sales per active member (>5% sustained decline = review), streak share of `entriesBySource` per draw (vs modelled 44→28→18%), streak-tagged support tickets, at-risk email health. Ladder is a **one-way ratchet**: rungs are never reduced post-launch (Woolworths lesson); tuning = adding, or the §2.8 sunset freeze of unreached rungs.

## 10. Out of scope (anti-roadmap)

No paid streak repair; no streak-gated exclusive draws; no per-user entry multipliers; no dependency on the paused points system; no year-total ("2,100") anywhere in-app; no sound in celebrations; max one at-risk nudge per incident. Deferred to roadmap: streak shields (earned lapse forgiveness), lifetime tenure ledger, shop-discount rung (**pull forward before ~Jan 2027 if the IGA "shadow lottery" Bill passes** — it targets entries-only subscription ladders).
