# Subscription — Package-selection-first & the auto-open latch

How the `MembershipModal` decides to auto-open the **"Select your package"** picker
([`PackageSelectionModal`](../../src/components/modals/PackageSelectionModal/index.tsx)) on
step 2, and the invariant that must never be broken again after the 2026-07-07 incident.

## The invariant (read this before touching the auto-open effect)

> **The picker auto-opens AT MOST ONCE per modal-open session, and only while no real plan is
> selected (`isPlaceholderPlan === true`). It re-arms ONLY when the modal fully closes
> (`!isOpen`) — never on any in-session condition. To change plan after selecting, the user
> taps the explicit "Change" button (`handlePackageChange`), never an automatic reopen.**

Both facts are load-bearing:

- **Once per session** — enforced by the `packageSelectionAutoOpenedRef` latch, which is set
  `true` the moment the picker auto-opens and reset `false` **only** in the `if (!isOpen)` branch.
- **Only on placeholder** — both auto-open branches (config-driven and the implicit `/promotions`
  timer) are gated on `isPlaceholderPlan`. Never auto-open the picker over a plan the user already
  chose (a picked tier, a pre-selected package card, or an abandoned-checkout deep-link plan).

The relevant code is the auto-open effect in
[`MembershipModal/index.tsx`](../../src/components/modals/MembershipModal/index.tsx) (~L738–786).

## Two auto-open paths

`shouldAutoOpen` decides whether the picker is allowed to auto-open at all:

```
const isPromotionsPage = pathname matches /^\/promotions\/([^/?#]+)/
const shouldAutoOpen = finalMembershipModalConfig == null
  ? isPromotionsPage                                   // implicit: promotions landing pages
  : (finalMembershipModalConfig.showPackageSelectionFirst !== false)  // explicit: A/B / dashboard config
```

1. **Config-driven** (`finalMembershipModalConfig != null`) — synchronous open. Used by the
   dashboard "Become a member" (legacy `{}` config) and A/B variants. Gated on `isPlaceholderPlan`.
2. **Implicit `/promotions/*`** (`config == null`) — 300 ms delayed open (hero paints first). Also
   gated on `isPlaceholderPlan`. **This is the path the homepage does NOT take** — `isPromotionsPage`
   is false there, so `shouldAutoOpen` is false and the picker never auto-opens on the homepage.

`configSelectionFirst` (a separate predicate, `config != null && flag !== false`) controls the
picker's **dismiss** behaviour: when true, dismissing the picker on a placeholder closes the whole
modal (nothing sensible to show behind it); when false (the `/promotions` `config==null` case),
dismiss just closes the picker and leaves the modal on step 2.

## The 2026-07-07 incident — a conversion-killing reopen loop

**Symptom:** on `/promotions/[slug]` **only** (never the homepage), the picker reopened every time
the user selected a plan **or** exited the picker — trapping them so they could never reach/complete
payment. New-member conversions dropped from ~9/12h to ~1/9h; the only payments still landing were
auto-renewals (they bypass the UI), so the outage was **silent** — no server error, `console.log`
stripped in prod. Stripe filled with `incomplete` subscriptions clustered per customer, multiple
tiers seconds apart (each tier tap mints a subscription via the sub-creation effect ~L910).

**Root cause (two changes in PR #663/#665 that only bite together):**

1. A **re-arm block** was added that cleared the once-per-session latch on every render where a real
   plan was selected:
   ```js
   if (isOpen && !isPlaceholderPlan) { packageSelectionAutoOpenedRef.current = false; } // ❌ removed
   ```
2. The implicit `/promotions` timer branch was **not gated on `isPlaceholderPlan`** (the sibling
   config branch was). So once a real plan existed, the re-arm disarmed the latch and the ungated
   timer immediately re-opened the picker on the next closed-picker render — which a **pick**
   (`handlePackageSelect` → `setIsPackageSelectionOpen(false)`) or a **dismiss**
   (`dismissPackageSelection`, which does NOT close the modal when `configSelectionFirst` is false)
   both produce. Reopen → pick/exit → re-arm → reopen → ∞.

The homepage was immune because `shouldAutoOpen` is false there — the picker never auto-opens, so
there is nothing for the re-arm to reopen.

**Fix (both, belt-and-suspenders — restores the invariant structurally):**

- **Removed the re-arm block.** The latch now resets only via `if (!isOpen)` → genuinely once per
  modal-open session, matching the last known-good commit `285cbdb0`.
- **Gated the `/promotions` timer branch on `isPlaceholderPlan`**, mirroring the config branch. As a
  bonus this fixes a latent bug: a package-card / deep-link entry that pre-selects a real plan no
  longer flashes the picker open over the user's choice — it lands straight on payment with a
  "Change" button (the intended behaviour, cf. dashboard "Tradie preselected").

Verified: `tsc --noEmit` clean; the primary ad path (hero "Enter Now" → plan-less open → picker
auto-opens once → pick → payment, no reopen) works; config-driven selection-first and the
abandoned-checkout deep-link are unaffected.

**Rule going forward:** never re-arm `packageSelectionAutoOpenedRef` on an in-session condition, and
keep every auto-open branch gated on `isPlaceholderPlan`. If you need the picker again after a
selection, that is a user action (`handlePackageChange`), not an effect.

## Promotions-page CTAs are explicitly selection-first (2026-08-04)

The promotions landing CTAs — the hero "ENTER NOW"
([`PromoHero`](../../src/components/sections/promo/PromoHero.tsx)) and the "Build your prize"
"Enter now" ([`PrizeShowcase`](../../src/components/sections/promo/PrizeShowcase.tsx)) — no longer
hand the modal a pre-selected tier. They call
`openEntryFlow({ openLocalModal: false, packageSelectionFirst: true })`, which dispatches
`openMembershipModal` with `detail: { packageSelectionFirst: true }` and **no plan**.

The chain:

| Step | Where | What happens |
| --- | --- | --- |
| 1 | [`useMajorDrawEntryCta`](../../src/hooks/useMajorDrawEntryCta.ts) | `packageSelectionFirst` is honoured **only** on the default membership path — a blocking subscription (can't buy a second sub) and `?packages=one-time` (visitor is on the one-time tab) keep their existing pre-selected pack. |
| 2 | [`useOpenMembershipModalListener`](../../src/hooks/useOpenMembershipModalListener.ts) | forwards the flag as the second callback arg. |
| 3 | [`MembershipSection`](../../src/components/sections/MembershipSection.tsx) | calls `membershipModal.openModalWithPackageSelectionFirst()` and passes `membershipModalConfig={{ showPackageSelectionFirst: true }}`. |
| 4 | `MembershipModal` | config != null → `activePlan` is the **membership** placeholder (period `mo`), so the picker opens on the Membership tab, synchronously, once. |

This uses the **config-driven** branch, not the implicit `/promotions` timer — so the invariant above
is untouched: still placeholder-gated, still once per modal-open session. Because
`configSelectionFirst` is now true on these opens, dismissing the picker with nothing chosen closes
the whole modal instead of stranding the visitor on a placeholder payment step.

### Foreman is the recommended tier

One tier carries the steer across every surface, via
[`isForemanSubscriptionPlanId`](../../src/utils/membership/additional-package-mapping.ts):

- **Picker** — Foreman's corner ribbon reads `RECOMMENDED` (not the generic `MOST POPULAR`) and the
  card renders pre-selected while the incoming plan is still a placeholder (`isSelectedPlan`).
- **Selected-package card** — [`PlanSummaryCard`](../../src/components/modals/MembershipModal/PlanSummaryCard.tsx)
  shows a `Recommended` pill next to the name (and `Best Value` for Boss / the top one-time packs).
- **Pre-select** — `getRecommendedSubscriptionPlan()` (was `getTradieSubscriptionPlan`) returns
  **Foreman**, so every "we picked one for you" CTA (dashboard "Become a member", rewards
  membership-only coupon unlock, non-member `getHeavyDutyPack`) lands on Foreman, not Tradie.

### The placeholder payment step must never be a dead end (2026-08-04)

Step 2 with no plan chosen (`isPlaceholderPlan`) used to render a grey skeleton for the purchase
button **and** a grey skeleton for the summary card — and `PlanSummaryCard`'s placeholder branch has
no "Change" link, so the state contained **nothing clickable but ✕**. Every path that reaches step 2
without a plan landed there: the picker dismissed on a `config == null` open (where dismissal only
closes the picker), an auto-open that didn't fire, a step-indicator jump.

Both skeletons are now actions — `SELECT YOUR PACKAGE` in
[`PaymentStep`](../../src/components/modals/MembershipModal/PaymentStep.tsx) and `Choose package` in
[`PlanSummaryCard`](../../src/components/modals/MembershipModal/PlanSummaryCard.tsx) — each opening
the picker via `handlePackageChange`. **Rule: the placeholder state always carries the action that
resolves it.** That property is what makes the auto-open a convenience rather than a single point of
failure; keep it if you touch either component.

Two supporting fixes landed with it:

- **Latch re-arms on the open edge too.** `packageSelectionAutoOpenedRef` still resets on any render
  with `isOpen === false`; it now *also* resets when `isOpen` goes false → true, so a close that
  never produced an observable closed render cannot leave the latch armed. This is not the in-session
  re-arm that caused the 2026-07-07 loop — within an open session `isOpen` stays true, so it fires
  once, before the user has chosen anything.
- **A registered guest is no longer pushed back to step 1.** Registering does not authenticate (see
  [auth/gotchas.md](../auth/gotchas.md)), so on reopen `!isAuthenticated` used to force
  `currentStep = 1` even though `guestUserData` was set. That both asked them to re-register (which
  fails as "existing account") and, because the picker only auto-opens on step 2, silently disabled
  selection-first. The step now resolves to 2 whenever `guestUserData !== null`.
- **`MembershipSection` memoizes the config object** it passes as `membershipModalConfig`. A fresh
  literal every render re-runs the auto-open effect every render — the identity churn that once
  starved its timer branch.

⚠️ **Plan-id caveat:** `useMemberships` slugifies the package **name** into `plan.id` ("Foreman" →
`foreman`), so UI code never sees the catalog `_id` (`foreman-subscription`). Literal comparisons
against the `_id` silently never match — that is why the Boss `Best Value` sash was missing from the
membership tab. Use the `isForemanSubscriptionPlanId` / `isBossSubscriptionPlanId` predicates, which
accept both forms.
