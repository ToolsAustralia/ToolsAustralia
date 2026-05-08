# Modal Design Intensity Uplift

**Date:** 2026-05-08
**Owner:** DJ
**Surface:** All major user-facing modals — flat confirmation dialogs uplifted to match the `CancellationUpsellModal` design language.
**Status:** Spec — pending review. Becomes Plan 6 after Plans 2-5 complete.

---

## Problem

The codebase has **two distinct levels of modal design intensity**:

**Tier A — Infographic-rich** (the gold standard):
- `CancellationUpsellModal` (Plan 2 pilot) — eyebrow + dramatic headline + composite gradient hero + 3-cell loss grid + tier-themed downgrade card + trust bar + tier-themed CVA
- `RenewalFailedModal`, `DowngradeConfirmModal` — same DNA (slated for Plan 3 refactor; already at this design intensity, just need the technical decomposition)

**Tier B — Flat confirmation dialogs** (the gap):
- `Upgrade to Foreman` modal — single-tone white card, generic checks list, no tier theming, no urgency, no infographic
- `Cancel Subscription` confirmation — bare "Are you sure?" with two buttons; doesn't reuse the `CancellationUpsellModal` flow it should
- `Complete Payment` modal — has a red header but the body is basic order summary + payment method
- `Your Membership` info modal — has a bar chart (closer to Tier A) but lacks hero + benefits + tier-aware theming
- `UserSetupModal` (and all step components) — onboarding flow without visual storytelling
- `Refer a Friend` modal — referral system without rewards visualization or social proof

The gap is jarring. A user upgrading from Foreman lands on a flat dialog moments after seeing the dramatic cancellation save modal. The brand consistency suffers.

## Goals

- Extract the **CancellationUpsellModal design language** as a reusable pattern (documented + componentized).
- Apply that pattern to the 6 listed modals + any others identified during the work.
- Each upgraded modal becomes a **value-reinforcing experience**, not just a confirmation step.
- All upgrades respect Plan 1-5 architectural standards: ModalContainer (where it fits), CVA variants, lucide icons, Tailwind tokens, decomposed into folders if scoring 3+ on the [decomposition criteria](../../shared-ui/component-decomposition-criteria.md).

## Non-goals

- **No A/B testing infrastructure changes.** This is design work, not experimentation tooling.
- **No new business logic.** Every upgrade preserves the existing flow's functionality; only the visual treatment changes.
- **No copywriting overhaul beyond what's needed for the design.** Copy stays close to current intent; minor tweaks for impact OK.
- **No animations beyond what the CancellationUpsellModal pattern uses** (entry transition, hover lifts). Don't add new animation systems.
- **Not building a Storybook setup.** That belongs in Plan 4 (UI primitives) — relevant context but separate.

---

## The CancellationUpsellModal design language

These are the elements that make the cancellation modal feel premium. Any uplifted modal should adopt as many as fit its purpose.

### 1. Hero section (top of modal)
- **Composite gradient background** — multi-layer (radial glow + black linear) creates depth
- **Eyebrow row** — gold horizontal lines + thematic icons + ALL-CAPS micro-text label (e.g. "Hold up, mate" / "You're upgrading" / "Welcome aboard")
- **Anton-font dramatic headline** — uppercase, 28px, leading-none. Optional small superhead in 11px white/55 above
- **Subcopy** — 12px white/70, max-width 440px, centered

### 2. Hero infographic
- Either a **prize banner image** (cancellation modal) OR a **chart** (membership info modal) OR a **stepper indicator** (multi-step flows like UserSetup) OR a **comparison visual** (upgrade modal: current tier → new tier)

### 3. Progress / status indicator
- 14-segment progress bar with green-glow fills (cancellation modal pattern), OR
- Step counter (1 of 4), OR
- Tier badge with name + level

### 4. Information grid
- 3-cell layout (or 2-cell, or 4-cell as needed) with:
  - Icon badge (red gradient for "loss" framing; green for "gain" framing; tier-color for "neutral")
  - Bold heading with brand-red emphasis on key word
  - Sub-description in neutral-600
- Vertical separators between cells via `before:` pseudo

### 5. Yellow/gold "social proof" banner
- Gradient yellow-50 → amber-100, gold star icon, urgent title + soft sub-copy
- Used to reinforce stakes ("Someone's name gets called next draw")
- Adapts to context: "Join 12,400+ members", "Last upgrade was 3 minutes ago", etc.

### 6. Action row
- 1fr / 1.25fr grid: secondary action (left, neutral) + primary action (right, brand-red gradient)
- Primary CTA gets a `+BONUS` `::after` badge when relevant (CVA variant)
- Buttons have hover-lift + shadow growth animation

### 7. Tier-themed accent card (optional)
- Black-bg card with tier-colored radial glow `::before`
- Corner badge with tier icon (rotated -4deg)
- 3-check row at bottom

### 8. Trust bar (footer)
- 3-cell row: SSL secure / Govt-certified / Cancel anytime (or context-appropriate equivalents)
- Vertical separators, micro-text, subtle red accent on icons

### 9. Color & typography rules (already enforced by Plan 1)
- Brand red via `red.600` token
- Tier colors via `brand-tier.{tradie,foreman,boss}`
- `text-2xs` / `text-3xs` for micro-text
- Anton font for dramatic headlines (`font-acumin` family in tailwind config)
- Inter for body
- `cn()` for composition; CVA for variants

### 10. Modal shell
- `z-[80]` micro-stack (or higher tier as parent stack requires)
- Bespoke wrapper (the cancellation modal pattern) OR `ModalContainer` (where the chrome fits)
- Full-bleed dark hero + white content sections

---

## Target modals (priority order)

Each modal gets its own sub-plan within Plan 6. Estimated effort per modal: **3-6 hours** (decompose + design + build + parity + smoke test).

### User-specified

| # | Modal | Current state | Uplift focus |
|---|---|---|---|
| 1 | **UserSetupModal + all step components** | Multi-step onboarding without visual storytelling | Hero per step, step counter, tier-aware visuals, completion celebration |
| 2 | **ReferAFriendModal** | Unknown current state — likely flat | Hero with reward emphasis, "Share → Join → Win" infographic, share buttons with brand colors, social-proof banner |
| 3 | **Upgrade popup** ("Upgrade to Foreman" image) | Flat white card with generic checks list | Tier-themed hero (Foreman = yellow), entries-growth visual (15 + 40 = 55), benefits as 3-cell grid, urgency line, trust bar |
| 4 | **Cancel Subscription popup** ("Are you sure?" image) | Bare confirmation with no value reinforcement | Either delegate to CancellationUpsellModal flow OR adopt simplified version of it (loss grid + downgrade prompt + trust bar) |
| 5 | **Complete Payment popup** | Has red header — partially there | Tier-themed hero, order summary as visual hierarchy, "what happens next" 3-step preview, trust bar enriched |
| 6 | **Membership info popup** ("Your membership" with chart) | Has chart — closest to Tier A | Hero with tier badge prominently, benefits as check list, projection chart (already there — enhance theming), refer-a-friend CTA at bottom |

### Additional modals I'd add (if you agree)

| # | Modal | Why uplift |
|---|---|---|
| 7 | **SubscriptionExplainerModal** | Education modal — perfect candidate for infographic explainers |
| 8 | **MiniDrawPackageModal** | Purchase modal — value emphasis matters, currently likely flat |
| 9 | **MembershipPackageSelector / pricing modal** | Where users pick tier — should be the *most* visual/persuasive moment |
| 10 | **PromoWelcomeModal** | First-touch promo experience — should set the brand tone |
| 11 | **PaymentSuccessModal / receipt modals** | Celebration moment — currently understated |
| 12 | **PixelConsentModal** | KEEP SIMPLE — legal compliance, infographic would be wrong here. Listed as a *do not change*. |
| 13 | **SettingsModal / account preferences** | KEEP UTILITARIAN — settings benefit from clarity, not drama. Listed as *do not change*. |

### Survey audit task (first thing in Plan 6)

Walk every modal in `src/components/modals/` and `src/features/**/components/*Modal*.tsx`. For each, score:
- Current design intensity (Tier A / B / C — utility-only)
- Whether uplift is appropriate (some legitimately should stay simple)
- Estimated effort

Output: `docs/shared-ui/modal-design-uplift-backlog.md` — ranked work queue.

---

## Architecture

### Phase 1: extract the design language (1 PR, ~6 hours)

Build a set of **shared layout primitives** in `src/components/modals/upsell-shell/`:
- `<UpsellHero>` — hero section with eyebrow + headline + subcopy + slot for infographic
- `<InfoGrid>` — 3-cell info row with icon + heading + description (configurable cell count)
- `<UrgencyBanner>` — yellow gold-star banner with title + sub
- `<ActionRow>` — extracted from CancellationUpsellModal's ActionRow, generalized for any 2-button row
- `<TierAccentCard>` — extracted from DowngradeCard, generalized for any tier-themed accent
- `<TrustBar>` — 3-cell trust footer

These primitives mirror the CancellationUpsellModal sub-components but are domain-neutral (no specific text, configurable cells). The cancellation modal's specific copy/cells become the FIRST consumer of these primitives in Plan 6 (refactored to use the shared primitives, not its private sub-components).

### Phase 2: per-modal uplifts (~6 PRs, sequential)

For each modal in the priority order:
1. Decompose if scoring 3+ on the [decomposition criteria](../../shared-ui/component-decomposition-criteria.md).
2. Design the layout using the extracted primitives + custom infographic.
3. Build with Tailwind tokens, lucide icons, CVA variants — same standards as Plan 2.
4. Add a smoke test (per-prop-combo render test).
5. Add a gallery item to `ModalsGalleryClient.tsx` for visual review.
6. Visual parity NOT required (this is a redesign — visual change is intentional). Instead, design review with stakeholder before merge.

### Phase 3: design review checkpoints

Unlike the technical refactors (Plans 1-5) where parity is the bar, Plan 6 changes ARE visual changes. Need:
- **Design mock review** before each modal's PR — 30-min stakeholder walkthrough of mockup or in-browser draft
- **Copy review** for any text changes
- **Conversion-rate hypothesis** captured per modal (we EXPECT upgrade modal uplift to increase upgrade clickthrough by X%; track post-launch)

---

## Risks

- **Scope creep.** "Make every modal infographic" is unbounded. Mitigation: the survey audit task explicitly classifies modals into upgrade-candidate vs. keep-simple (Pixel consent, settings, etc.).
- **Visual inconsistency mid-rollout.** While Plan 6 is in-progress, some modals will be Tier A and some Tier B. Mitigation: prioritize the most-visited modals first (upgrade, cancel) so the worst inconsistency is fixed soonest.
- **Bundle size from new graphics.** Tier-themed gradients are CSS; no asset cost. New SVG icons/illustrations need to be lazy-loaded if introduced. Mitigation: prefer composed CSS over new SVG/PNG assets where possible.
- **A11y regressions.** New designs need keyboard/screen-reader audits. Mitigation: include a11y check as a per-modal acceptance criterion.
- **Conversion impact unknown.** A redesign could *decrease* conversion if it adds friction. Mitigation: launch behind a per-modal feature flag where possible; revert if conversion drops >5%.

## Dependencies

- **Plan 2** (CancellationUpsellModal pilot) — done. Provides the template.
- **Plan 3** (modal sweep — RenewalFailed, DowngradeConfirm, etc.) — these modals already share the design language; they get the technical refactor in Plan 3, no design uplift needed.
- **Plan 4** (UI primitives) — provides Button, Card, Modal as CVA primitives. Plan 6 uses these.
- **Plan 5** (debt cleanup) — surfaces decomposition backlog. Some Plan 6 modals will appear there.

Plan 6 starts AFTER Plan 5 completes (so the foundation is solid before stacking design work on top). Estimated calendar: ~3-6 weeks of intermittent work depending on how many modals get uplifted.

## Open decisions for the user

1. **Do you want all 6 user-specified modals uplifted, or pick a smaller subset to start?** (Upgrade + CancelSubscription are the highest-impact — touched most in conversion flows.)
2. **Are the additional 5 modals I proposed (SubscriptionExplainer, MiniDrawPackage, pricing, PromoWelcome, PaymentSuccess) in scope?** Pick all/some/none.
3. **Do you want feature-flag rollout** so we can revert per-modal if conversion drops, or are you confident enough in the design to ship directly?
4. **What's the design review process?** Self-review against the design language doc, OR external designer review, OR stakeholder demo before merge?
5. **Copy ownership.** Are you the source of truth for modal copy, or do you want me to draft and you approve?

---

## Skills/agents this initiative will use

- `superpowers:brainstorming` — re-design each modal (each is a creative task)
- `superpowers:writing-plans` — convert the per-modal designs into bite-sized implementation plans
- `superpowers:subagent-driven-development` — execution
- `Plan` agent — when a modal's redesign needs more design judgment
- `codebase-investigator` — survey existing modal usage and audit per-modal current state
- `domain-doc-updater` — refresh modal-specific docs after each PR

This is fundamentally **design work + execution**, more than pure refactoring. Each modal needs its own brainstorm pass before implementation.
