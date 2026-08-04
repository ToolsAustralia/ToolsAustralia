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

## Entry CTAs: picker first, recommended tier behind it (2026-08-04)

`openEntryFlow()` — the shared entry point behind every "Enter Now" CTA (promo hero, "Build your
prize", "Enter to unlock discount", major-draw, promo-welcome, dashboard) — now defaults to
`packageSelectionFirst: true`. Two things happen together, and both matter:

1. **The picker is the first view.** The visitor chooses their package rather than inheriting one.
2. **The RECOMMENDED tier (Foreman) is already selected behind it.** `openEntryFlow` resolves
   `getRecommendedSubscriptionPlan()` and passes it along, so dismissing the picker lands on a real,
   payable package.

> **A customer must never see an empty "Billing Info" step.** That is the point of (2). The picker is
> how they choose; the default is what guarantees there is always something to pay for if they don't.
> Never wire an entry CTA to open selection-first *without* a plan.

The chain:

| Step | Where | What happens |
| --- | --- | --- |
| 1 | [`useMajorDrawEntryCta`](../../src/hooks/useMajorDrawEntryCta.ts) | Dispatches `openMembershipModal` with `detail: { plan: <Foreman>, packageSelectionFirst: true }`. Skipped on the two paths where a membership tier is the wrong pre-select anyway: a blocking subscription (can't buy a second sub) and `?packages=one-time` (visitor is on the one-time tab). |
| 2 | [`useOpenMembershipModalListener`](../../src/hooks/useOpenMembershipModalListener.ts) | Forwards the plan and the flag to the host section. |
| 3 | [`MembershipSection`](../../src/components/sections/MembershipSection.tsx) | `membershipModal.openModalWithPackageSelectionFirst(plan)` + `membershipModalConfig={{ showPackageSelectionFirst: true }}` + `planIsDefaultSelection`. The config object is **memoized** — a fresh literal each render re-runs the auto-open effect every render. |
| 4 | `MembershipModal` | Config != null → the picker opens synchronously, once, over the default plan. |

### `planIsDefaultSelection` — the plan we chose vs the plan they chose

The auto-open used to be gated purely on `isPlaceholderPlan`, which exists so the picker can never
pop over a tier the user actually clicked. A CTA default is not that, so the gate is now:

```js
const canAutoOpenOverSelection =
  (isPlaceholderPlan || planIsDefaultSelection) && !userPickedPlanRef.current;
```

- `planIsDefaultSelection` (prop, driven by the hook's `openWithPackageSelectionFirst`) — this open
  supplied the plan FOR the user. **Do not** source it from the variant config: a variant with
  `showPackageSelectionFirst: true` would then pop the picker over a tier-card click.
- `userPickedPlanRef` — set in `handlePackageSelect` the moment the user picks, cleared when a new
  open session starts. Belt-and-braces with the once-per-session latch: even if that latch were
  re-armed, the picker can never reopen over a choice the user made.

Dismissing the picker with a default plan behind it just closes the picker (the plan is not a
placeholder, so `dismissPackageSelection` doesn't close the modal) — the visitor lands on Foreman.

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

### Which CTAs show the picker — and the one exception

**Every CTA that opens the MembershipModal from a surface with no package cards on screen shows the
picker, with a default plan behind it.** The exception is a **package card the user tapped**: that
tap *is* the choice, so it goes straight to payment for that tier.

| Opener | Picker? | Default behind it |
| --- | --- | --- |
| Promo hero "ENTER NOW", "Build your prize", "Enter to unlock discount" | ✅ | Foreman |
| Major-draw section CTAs, promo-welcome modal | ✅ | Foreman |
| Dashboard / rewards "Become a member", rewards floating widget coupon unlock | ✅ | Foreman |
| Draw-results "become a member" | ✅ | Foreman |
| "Buy package" / one-time CTAs (`openWithOneTimePlan`) | ✅ (one-time tab) | resolved one-time pack |
| **Tier card tap** — `MembershipSection`, `/membership`, account membership tier list | ❌ | the tapped tier |
| Abandoned-checkout deep link (`?openMembership=1&packageId=`) | ❌ | the emailed package |

The last two are deliberate: the visitor already named a package, so re-asking would be a step
backwards. Everything else routes through `openEntryFlow` (which defaults to
`packageSelectionFirst: true`) or calls `openModalWithPackageSelectionFirst(defaultPlan)` directly.

**Re-clicking a CTA after already choosing re-opens the picker.** Both the once-per-session latch
and `userPickedPlanRef` reset when `isOpen` goes false → true, and the CTA supplies a fresh default,
so every new open starts a new selection.

### Supporting fixes (2026-08-04)

- **Latch re-arms on the open edge too.** `packageSelectionAutoOpenedRef` still resets on any render
  with `isOpen === false`; it now *also* resets when `isOpen` goes false → true, so a close that
  never produced an observable closed render cannot leave the latch armed. This is not the in-session
  re-arm that caused the 2026-07-07 loop — within an open session `isOpen` stays true, so it fires
  once, before the user has chosen anything.
- **Guests always reopen on step 1**, with their details already filled in (see
  [auth/frontend.md](../auth/frontend.md#guest-your-details-carry-over-2026-08-04)). They advance
  themselves via REGISTER or the step chip; the picker then auto-opens as step 2 is reached. Do not
  "helpfully" skip a registered guest to step 2 — the owner's call is that the customer sees their
  own details first.
- **`MembershipSection` memoizes the config object** it passes as `membershipModalConfig`. A fresh
  literal every render re-runs the auto-open effect every render — the identity churn that once
  starved its timer branch.

⚠️ **Plan-id caveat:** `useMemberships` slugifies the package **name** into `plan.id` ("Foreman" →
`foreman`), so UI code never sees the catalog `_id` (`foreman-subscription`). Literal comparisons
against the `_id` silently never match — that is why the Boss `Best Value` sash was missing from the
membership tab. Use the `isForemanSubscriptionPlanId` / `isBossSubscriptionPlanId` predicates, which
accept both forms.
