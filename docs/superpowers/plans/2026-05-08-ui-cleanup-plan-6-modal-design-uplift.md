# UI Cleanup — Plan 6: Modal Design Intensity Uplift

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking. **This plan involves design judgment** — pause between modals for stakeholder mock review.

**Spec:** [docs/superpowers/specs/2026-05-08-modal-design-intensity-uplift.md](../specs/2026-05-08-modal-design-intensity-uplift.md)

**Predecessors:** Plans 1-5 committed.

**Goal:** Apply the CancellationUpsellModal design language ("Tier A" infographic intensity) to 6 user-specified flat modals + extract reusable design-language primitives. Each modal gets visual storytelling: composite-gradient hero, tier-themed accents, info grids, social-proof banners, trust bars.

**Architecture:**
- **Phase 0** — extract shared upsell-shell primitives in `src/components/modals/upsell-shell/`. These are organism-tier (between atom-Card and full-modal Cancellation): `<UpsellHero>`, `<InfoGrid>`, `<UrgencyBanner>`, `<TierAccentCard>`, `<TrustBar>`. The CancellationUpsellModal sub-components from Plan 2 become the FIRST consumer (refactored to use the shared primitives).
- **Phases 1-6** — apply primitives + custom infographic to each target modal, in priority order.

**Tech:** All Plan 1-5 foundations (cn(), CVA, lucide, brand tokens, decomposition pattern, atomic primitives Button/Badge/Card/Modal).

**Hard requirements (per modal):**
- Functional behavior preserved byte-identically (props/effects/callbacks unchanged)
- Smoke test for the redesigned modal
- Visual mock OR in-browser draft reviewed before merge (human-in-loop checkpoint per modal)
- `npm run lint && npm run type-check && npm run build` clean

**This plan deviates from earlier plans in one important way:** the technical refactors (Plans 1-5) preserved visual output exactly. **Plan 6 changes visual output by design.** Each modal's PR gets a stakeholder design review checkpoint, not a parity test.

---

## File Structure

**Phase 0 creates:**
- `src/components/modals/upsell-shell/UpsellHero.tsx` — generic hero (eyebrow + headline + sub + slot for infographic)
- `src/components/modals/upsell-shell/InfoGrid.tsx` — N-cell info grid (configurable cell count + icon + title + desc)
- `src/components/modals/upsell-shell/UrgencyBanner.tsx` — yellow/gold banner with star icon + title + sub
- `src/components/modals/upsell-shell/TierAccentCard.tsx` — tier-themed dark card (extract from Plan 2's DowngradeCard)
- `src/components/modals/upsell-shell/TrustBar.tsx` — generic 3-cell trust footer (configurable cells)
- `src/components/modals/upsell-shell/styles.module.css` — shared composite gradients
- `src/components/modals/upsell-shell/__tests__/upsell-shell.test.ts` — smoke tests for the primitives
- `docs/shared-ui/upsell-shell.md` — convention doc

**Phases 1-6 modify** the 6 target modals (one phase each):
1. `UpgradePopup` (or wherever the "Upgrade to Foreman" modal lives — locate in audit)
2. `CancelSubscription` confirmation popup (small modal, may delegate to CancellationUpsellModal flow)
3. `CompletePayment` popup
4. `MembershipInfo` popup ("Your membership" — already partially Tier A)
5. `UserSetupModal` (multi-step onboarding)
6. `ReferAFriendModal`

Each phase's modal is decomposed into a folder per the Plan 2 pattern, rebuilt to consume `upsell-shell/` primitives + Plan 4 atoms.

---

## Pre-flight check

- [ ] **Step 0: Confirm clean working tree on `ui-improvements` branch with Plans 1-5 committed**

---

## Phase 0 — Extract upsell-shell primitives

### Task 0.1: Audit Plan 2's CancellationUpsellModal sub-components for shared patterns

- [ ] **Step 1: Read existing sub-components to identify generalization candidates**

```bash
ls src/components/modals/CancellationUpsellModal/
cat src/components/modals/CancellationUpsellModal/Hero.tsx
cat src/components/modals/CancellationUpsellModal/LoseGrid.tsx
cat src/components/modals/CancellationUpsellModal/Banner.tsx
cat src/components/modals/CancellationUpsellModal/DowngradeCard.tsx
cat src/components/modals/CancellationUpsellModal/TrustBar.tsx
```

For each, identify:
- What's GENERIC (eyebrow + headline + composite gradient pattern)
- What's CANCELLATION-SPECIFIC (the "Hold up, mate" copy, the 3-cell loss framing, the +100 BONUS badge)

Generic parts → Phase 0 primitive. Specific parts → stay in the modal's own sub-components.

### Task 0.2-0.6: Build the 5 upsell-shell primitives

Each primitive follows the CVA pattern. Reference Plan 4's Button/Badge/Card primitives + Plan 2's CancellationUpsellModal sub-components as the inspiration source.

- [ ] **0.2: `UpsellHero.tsx`** — props `{ tone?: "danger" | "success" | "neutral" | "tier-{tradie|foreman|boss}", eyebrow: string, eyebrowIconStart?: ReactNode, eyebrowIconEnd?: ReactNode, title: ReactNode, sub: ReactNode, infographic?: ReactNode, padding?: "sm" | "md" | "lg" }`. CVA on `tone` for the gradient + accent colors.

- [ ] **0.3: `InfoGrid.tsx`** — props `{ cells: Array<{ icon: ReactNode, title: ReactNode, desc?: ReactNode }>, columns?: 2 | 3 | 4, framing?: "loss" | "gain" | "neutral" }`. CVA on `framing` for the icon-bg color (red for loss, green for gain).

- [ ] **0.4: `UrgencyBanner.tsx`** — props `{ icon?: ReactNode, title: ReactNode, sub?: ReactNode, tone?: "gold" | "info" | "warning" }`. CVA on `tone`.

- [ ] **0.5: `TierAccentCard.tsx`** — props `{ tier: "tradie" | "foreman" | "boss", icon?: ImageProps, title: ReactNode, sub?: ReactNode, cta?: { label: string; onClick: () => void; ariaLabel?: string }, checks?: Array<{ icon?: ReactNode; text: ReactNode }> }`. CVA on `tier` (extracted from Plan 2's DowngradeCard).

- [ ] **0.6: `TrustBar.tsx`** — props `{ cells: Array<{ icon: ReactNode, title: string, sub: string }> }`. No variants — generic 3-cell layout.

### Task 0.7: Convert CancellationUpsellModal sub-components to consume the new primitives

Refactor in-place. The CancellationUpsellModal's `Hero`, `LoseGrid`, `Banner`, `DowngradeCard`, `TrustBar` components become THIN wrappers that pass cancellation-specific props to the upsell-shell primitives. The visual rendering remains byte-identical.

This is the validation that the primitives are actually general enough — if cancellation can use them, the other 6 modals will too.

- [ ] **Step 1: For each cancellation sub-component, refactor to use the matching upsell-shell primitive**

E.g. `CancellationUpsellModal/Hero.tsx` previously rendered the eyebrow + headline + prize image directly. After refactor: it composes `<UpsellHero tone="neutral" eyebrow="HOLD UP, MATE" eyebrowIconStart={<Trophy/>} title={...} sub={...} infographic={<Image src="all-prizes.webp" .../>}>`.

- [ ] **Step 2: Run cancellation modal smoke test to verify byte-equivalent rendering**

```bash
npm run test:cancellation-upsell
```

12/12 must still pass. Visual check in `/dev/modals` for byte parity.

### Task 0.8: Smoke test + doc + manifest

- [ ] **0.8: Smoke tests for upsell-shell primitives** (combo render tests)
- [ ] **0.9: `docs/shared-ui/upsell-shell.md`** convention doc
- [ ] **0.10: Manifest bump** for `subscription` (where the new primitives live, per existing pattern)

---

## Phases 1-6 — Per-modal uplift

Each phase follows the same pattern. Pseudocode for Phase N:

### Task N.1: Locate the modal + audit current state

- [ ] Locate the modal file. (For modals not previously decomposed, may be a single .tsx in `src/components/modals/` or `src/components/`. For multi-step modals like UserSetup, may be a folder.)
- [ ] Audit current state per the same 12-section structure as Plan 3 audits.

### Task N.2: Design the new layout

- [ ] Sketch the redesigned layout using upsell-shell primitives. Document in `/tmp/<modal>-redesign.md`:
  - Hero infographic content (image / chart / step counter / etc.)
  - Info grid framing (loss / gain / neutral)
  - Urgency-banner copy (or omit if not applicable)
  - Tier-accent card content (if tier-applicable)
  - Trust-bar cells

- [ ] **CHECKPOINT** — surface the design doc to the user for approval before building.

### Task N.3: Build the redesigned modal

- [ ] Decompose the modal into a folder per the Plan 2/3 pattern (if not already)
- [ ] Build sub-components consuming upsell-shell primitives + Plan 4 atoms
- [ ] Smoke test (renders without throwing for all meaningful prop combos)
- [ ] Visual review in `/dev/modals`

### Task N.4: Manifest + commit

- [ ] Bump `lastVerified` for the affected domain
- [ ] User-authorized commit

---

## Per-modal task breakdowns

### Phase 1 — Upgrade popup

**Locate:** Search for "Upgrade to Foreman" or upgrade-related modals. Likely in `src/components/modals/` or `SubscriptionManagementModal`'s upgrade flow.

**Design intent:**
- Tier-themed hero (Foreman = yellow, Boss = red, etc.) using `UpsellHero` with `tone="tier-{toTier}"`
- Infographic: entries-growth visual (e.g. "15 + 40 = 55" with arrow visualization OR a small bar chart showing accumulated entries before/after)
- Info grid with 3 "you get" cells (gain framing — green icons) using `InfoGrid framing="gain"`
- Urgency banner: "<X> users upgraded this week" or "Lock in your bonus entries today"
- Trust bar: SSL secure / Cancel anytime / Charged once today

### Phase 2 — Cancel Subscription confirmation popup

**Decision point:** Either delegate to CancellationUpsellModal flow OR keep as a simplified confirmation. The current "Are you sure?" dialog is too thin — but CancellationUpsellModal is heavy. Probably best: a STEP between (small Cancellation-style modal with loss-grid + trust bar but no full upsell).

**Design intent:**
- `UpsellHero tone="danger"` with eyebrow "ARE YOU SURE?"
- `InfoGrid framing="loss"` showing 3 things they lose (entries, draw eligibility, partner discounts)
- Urgency banner: "Your subscription stays active until <date>"
- Action: Keep + Cancel buttons (use Plan 4 Button)
- Trust bar: lighter tone

### Phase 3 — Complete Payment popup

**Design intent:**
- `UpsellHero tone="tier-{toTier}"` with eyebrow "FINAL STEP"
- Infographic: order summary card (using Plan 4 Card)
- Payment method picker (extract pattern from RenewalFailedModal Plan 3)
- "What happens next" 3-step preview (using `InfoGrid framing="neutral"`)
- Trust bar: Stripe-secured / 30-day guarantee / etc.

### Phase 4 — Membership Info popup

Already closer to Tier A (has chart). Enhancements:
- Replace top with `UpsellHero tone="tier-{userTier}"` and tier badge prominently
- Keep the chart (it's good)
- Add `InfoGrid framing="gain"` showing benefits actively used this month
- Add upcoming-projection visual
- Add `UrgencyBanner tone="gold"` referral CTA at bottom ("Refer a friend → both get 50 bonus entries")

### Phase 5 — UserSetup multi-step modal

**Design intent (per step):**
- Welcome step: `UpsellHero tone="tier-tradie"` (default tier) with eyebrow "WELCOME"
- Each subsequent step: step counter ("Step 2 of 4") + per-step hero
- Final step: celebration `UrgencyBanner tone="gold"` + "Get your first bonus entries"

This is a multi-component modal — likely needs its own sub-folder structure within `src/features/onboarding/` or `src/components/modals/UserSetup/`.

### Phase 6 — Refer a Friend modal

**Design intent:**
- `UpsellHero tone="tier-{userTier}"` with eyebrow "GIVE 50, GET 50"
- Infographic: "Share → They join → You both win" 3-step `InfoGrid framing="gain"`
- Share buttons (copy link / SMS / email — use Plan 4 Button)
- `TierAccentCard` showing the user's referral code with copy CTA
- `UrgencyBanner tone="gold"` with social proof: "<X> friends joined this month"
- Trust bar: GDPR-safe / Anti-spam / Cancel anytime

---

## Plan 6 final verification gate

- [ ] All 6 modals + upsell-shell primitives smoke-tested
- [ ] Lint + type-check + build clean
- [ ] Visual review for each modal completed (manual A/B in `/dev/modals` or stakeholder demo)
- [ ] Conversion-rate hypothesis recorded per modal (for post-launch validation)

---

## Realistic execution note

Plan 6 is the largest of the cleanup plans (~30-60h). Each modal's design phase needs human input (mock review, copy approval). 

**Recommended execution split:**
- Session A (this plan): Execute Phase 0 (extract primitives + refactor cancellation to use them) + Phase 1 (Upgrade popup — highest conversion impact). Pause for stakeholder review.
- Session B: Phases 2 (Cancel sub) + 3 (Complete payment) — both high-conversion paths.
- Session C: Phases 4 + 5 + 6 (Membership info + UserSetup + Refer friend) — lower-urgency but still impactful.

If conversion improvements are observed in Session A's Phase 1 release, the rationale for Sessions B+C strengthens. If not, decide whether to continue or pivot.
