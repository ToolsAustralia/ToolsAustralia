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
