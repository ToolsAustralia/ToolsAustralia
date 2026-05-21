# Modal Architecture Sweep — Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-05-09-modal-architecture-sweep-design.md`](../specs/2026-05-09-modal-architecture-sweep-design.md)

**Predecessors:** Plans 2, 3, 6 (each established a portion of the canonical pattern). This plan applies the pattern to all 12 remaining MUST-decompose modals identified in the spec's §Inventory.

**Goal:** Decompose 12 flat modals into the canonical orchestrator-folder pattern with byte-equivalent visual output, smoke tests, and updated domain docs. No commits — working tree stays uncommitted for user review.

**Hard rules** (from CLAUDE.md + spec):
1. **No commits.** Never `git commit`/`add`/`push` unless the user explicitly authorizes.
2. **No visual change.** Rendered output (DOM, classNames, animations, z-index, copy) byte-equivalent.
3. **Public prop interfaces preserved byte-identically.**
4. **Smoke test per refactored modal** — wired as `test:<scope>` npm script.
5. **Domain manifest `lastVerified` bumped** for each affected domain.
6. **Build clean** after each modal: `npm run lint`, `npm run type-check`, `npm run build` all exit 0.

---

## Pre-flight

- [ ] **Step 0:** Verify clean working tree on `worktree-architectural-fix`, build green.

```bash
git status --short
npm run type-check 2>&1 | tail -3
```

If `type-check` is dirty, identify and fix any pre-existing red before starting.

---

## Wave A — Warmups (3 modals)

These three are the smallest of the must-decompose set and have no Stripe coupling. They validate the per-modal recipe before bigger surfaces.

### Per-modal recipe (applied to each modal in this plan)

For each modal, the same 6-step recipe applies. The plan only spells out *modal-specific* details; the recipe runs unchanged.

1. **Read the source end-to-end.** Identify visual sections, hooks, callbacks, public props, z-index, providers needed for tests.
2. **Create the folder + sub-component files.** Sub-component names from the spec's §Per-modal section plans.
3. **Write the orchestrator (`index.tsx`).** Public props BYTE-IDENTICAL to original. Owns all hooks, effects, callbacks. Composes sub-components.
4. **Delete the original `<ModalName>.tsx`** monolith.
5. **Write the smoke test** at `__tests__/<ModalName>.test.ts`. Add `test:<scope>` to `package.json`. Run it — must exit 0.
6. **Update domain doc + manifest.** `docs/<domain>/frontend.md` notes the new folder. `CLAUDE.md` `lastVerified` bumped to `2026-05-09`.
7. **Verify build.** `npm run lint && npm run type-check && npm run build` all exit 0.

### A.1 — WinnerSelectionModal

- Path: `src/components/modals/WinnerSelectionModal.tsx` (452 LOC) → `src/components/modals/WinnerSelectionModal/`
- Sub-components per spec: `Header`, `UserPickerRow`, `SelectedUserPreview`, `PrizeFields`, `ImageUploadField`, `ReplaceWarning`, `SubmitRow`
- Public props: `{ isOpen, onClose, onWinnerSelected, drawId, drawName, drawType, totalEntries, currentWinner?, enableImageField? }`
- Stripe: No. Tier variants: No. Shell: `ModalContainer` (no custom shell needed).
- Smoke test combos (≥6): `drawType="mini"`, `drawType="major"`, with currentWinner, without currentWinner, enableImageField on/off, isOpen=false.
- Domain: `admin` (also touches `draws`). Update `docs/admin/frontend.md` + `docs/draws/frontend.md`.
- npm script: `test:winner-selection`

### A.2 — AdminMajorDrawModal

- Path: `src/components/modals/AdminMajorDrawModal.tsx` (731 LOC) → `src/components/modals/AdminMajorDrawModal/`
- Sub-components per spec: `BasicInfoSection`, `PrizeDetailsSection`, `DateConfigSection`, `TermsSection`, `SubmitFooter`
- Public props: `{ isOpen, onClose, onSuccess? }`
- Direct `fetch` calls stay in orchestrator (consider extracting to `src/services/admin/major-draw/createMajorDraw.ts` ONLY if doing so doesn't cascade — defer if it triggers other refactors). Default: keep fetches in orchestrator.
- Stripe: No. Tier: No. Shell: `ModalContainer`.
- Smoke test combos (≥4): isOpen=true (initial state), isOpen=true with form populated (mock state), isOpen=false. Form-state combos optional.
- Domain: `admin` + `draws`.
- npm script: `test:admin-major-draw`

### A.3 — CampaignTargetingModal

- Path: `src/components/modals/CampaignTargetingModal.tsx` (603 LOC) → `src/components/modals/CampaignTargetingModal/`
- Sub-components per spec: `SubscriptionStatusFilter`, `TierMultiSelect`, `StatesMultiSelect`, `TopPercentEmailVerifiedControls`, `UserSearchInput`, `PreviewList`, `Footer`
- Public props: `{ isOpen, onClose, onConfirm, parentSegmentDefaults?, initialIncludeUserIds?, initialPersistedSegment? }`
- Tier-themed: **Yes** — `tradie/foreman/boss` discriminator. Encode tier-chip variants via CVA in `TierMultiSelect.tsx`.
- Stripe: No. Shell: `ModalContainer`.
- Smoke test combos (≥6): all-tiers selected, single tier, no tiers, with parentSegmentDefaults, with initialIncludeUserIds, isOpen=false.
- Domain: `admin` (also `rewards-redeemables` since used by AdminMonthlyRedeemablesModal).
- npm script: `test:campaign-targeting`

---

## Wave B — Settings/list (3 modals)

### B.1 — SettingsModal

- Path: `src/components/modals/SettingsModal.tsx` (526 LOC) → `src/components/modals/SettingsModal/`
- Sub-components per spec: `TabSwitcher`, `ProfileTab`, `PasswordTab` (Subscription + Payment tabs delegate to existing `SubscriptionManagementModal renderAsPanel` and `PaymentMethodsTab/`)
- Public props: `{ isOpen, onClose, initialTab?, user, membershipModal }`
- Direct `fetch` calls (profile update, password change) stay in orchestrator.
- Stripe: Indirect via PaymentMethodsTab. Tier: No. Shell: `ModalContainer size="xl"`.
- Smoke test combos (≥5): initialTab per tab id, isOpen=false, with past-due user.
- Domain: `auth`.
- npm script: `test:settings-modal`

### B.2 — PackageSelectionModal

- Path: `src/components/modals/PackageSelectionModal.tsx` (780 LOC) → `src/components/modals/PackageSelectionModal/`
- Sub-components per spec: `TabSwitcher`, `PlanGrid`, `PlanCard`, `FeaturesPreview`
- Public props: `{ isOpen, onClose, currentPlan, onPlanSelect }`
- Stripe: No. Tier: theme-only via package color scheme. Shell: `ModalContainer` + `ModalHeader` + `ModalContent`.
- Smoke test combos (≥5): authenticated, anonymous, currentPlan tradie/foreman/boss, isOpen=false.
- Domain: `subscription`.
- npm script: `test:package-selection`

### B.3 — RevenueDetailModal

- Path: `src/components/modals/RevenueDetailModal.tsx` (731 LOC) → `src/components/modals/RevenueDetailModal/`
- Sub-components per spec: `FilterToolbar`, `TableHeader`, `UserList`, `UserRow`, `Pagination`
- Extract export helpers to `src/components/modals/RevenueDetailModal/utils/exporters.ts` (csv + xlsx). Keep colocated; no service-layer move.
- Public props: as-is.
- Stripe: No. Tier: No. Shell: `ModalContainer`.
- Smoke test combos (≥4): default, with filter applied, with sort applied, isOpen=false.
- Domain: `admin`.
- npm script: `test:revenue-detail`

---

## Wave C — Purchase modals with Stripe (2 modals)

These have inline Stripe `<Elements>` providers wrapping inline card forms. The orchestrator must keep `getStripePromise()` initialized at the same render-tree position to avoid Element re-mount churn.

### C.1 — UpsellModal

- Path: `src/components/modals/UpsellModal.tsx` (1,139 LOC) → `src/components/modals/UpsellModal/`
- Sub-components per spec: `OfferHero`, `BenefitsList`, `PaymentSection`, `AcceptDeclineRow`, `TrustIndicators`
- Public props: `UpsellModalProps` from `@/types/upsell` — preserve exactly.
- Stripe: Yes — `<Elements>` wraps `PaymentSection`'s child form. Stripe promise resolves at module scope (NOT per-render). Decomposition keeps that lift-out unchanged.
- Domain: `upsell`.
- npm script: `test:upsell-modal`

### C.2 — SpecialPackagesModal

- Path: `src/components/modals/SpecialPackagesModal.tsx` (1,218 LOC) → `src/components/modals/SpecialPackagesModal/`
- Sub-components per spec: `PromoBanner`, `PackagesGrid`, `BenefitsPanel`, `PaymentSection`, `PurchaseFooter`
- Public props: `{ isOpen, onClose, packages, initialCouponCode?, onPackageSelect }`
- Stripe: Yes. Tier: theme-only. Shell: `ModalContainer`.
- Domain: `subscription`.
- npm script: `test:special-packages`

---

## Wave D — Subscription complex (1 modal)

### D.1 — SubscriptionManagementModal

- Path: `src/components/modals/SubscriptionManagementModal.tsx` (1,487 LOC) → `src/components/modals/SubscriptionManagementModal/`
- Sub-components per spec: `CurrentBenefitsCard`, `PendingChangeBanner`, `PastDueAlert`, `UpgradeList`, `DowngradeList`, `CancelResumeRow`
- Public props: `{ isOpen, onClose, user, onSubscriptionUpdate?, membershipModal?, renderAsPanel? }` — preserve `renderAsPanel` semantics.
- Embedded child modals (StripePaymentModal, CancellationUpsellModal, RenewalFailedModal) stay portal-rendered from the orchestrator with current z-index micro-stack.
- Stripe: indirect (opens StripePaymentModal). Tier: theme-only.
- Domain: `subscription`.
- npm script: `test:subscription-management`

---

## Wave E — Payment infrastructure (2 modals/panels)

These are NOT modals but are physically located under `src/components/modals/`. Decomposing them BEFORE MembershipModal so MembershipModal's Wave F decomposition can rely on their stable folder shape.

### E.1 — PaymentMethodsTab

- Path: `src/components/modals/PaymentMethodsTab.tsx` (666 LOC) → `src/components/modals/PaymentMethodsTab/`
- Sub-components per spec: `SavedMethodRow`, `AddPaymentCTA`, `AddPaymentForm`
- Embedded `ConfirmationModal` portal stays in orchestrator.
- Public props: `{ user }`
- Stripe: Yes — SetupIntent flow.
- Domain: `payment`.
- npm script: `test:payment-methods-tab`

### E.2 — PaymentMethodSelector

- Path: `src/components/modals/PaymentMethodSelector.tsx` (1,052 LOC) → `src/components/modals/PaymentMethodSelector/`
- Sub-components per spec: `SavedCardPreview`, `ChangeMethodRow`, `AddNewCardRow`, `CardFormSection`
- **Critical:** the ref API (`cardFormRef.confirmStripeIntent`) is preserved via `forwardRef` on `index.tsx`. The orchestrator owns the imperative handle; sub-components don't see it.
- Public props: ~20 props — preserve all.
- Stripe: Yes — Elements + PaymentElement + intent confirmation.
- Domain: `payment`.
- npm script: `test:payment-method-selector`

---

## Wave F — MembershipModal (the monster)

### F.1 — MembershipModal (5,891 LOC)

- Path: `src/components/modals/MembershipModal.tsx` → `src/components/modals/MembershipModal/`
- Sub-components per spec: `RegistrationStep`, `PaymentStep`, `PlanSummaryCard`, `CouponRow`, `WinnerStrip`, `StepIndicator`
- Co-located hook: `hooks/useMembershipCheckout.ts` to consolidate the 8+ checkout-related hooks.
- Public props per spec.
- Risk note: extensive Stripe + A/B + tracking + sub-modal embedding.
- Domain: `subscription`.
- npm script: `test:membership-modal`

**Realistic execution caveat:** if this overflows the session budget, leave a partial state with:
- The folder created
- Sub-component skeletons in place
- `index.tsx` orchestrator written but possibly incomplete
- Smoke test stub
- The original `MembershipModal.tsx` **NOT YET DELETED** (so the build still works)
- A note in `MembershipModal/README.md` (or directly in the modal-sweep plan checklist) describing what remains.

The user explicitly said: "ensure that it was listed in your tasks that all unupdated modals will be updated when i check and comeback" — partial state IS acceptable so long as it's clearly documented and the build is green.

---

## Final verification gate

After all waves complete (or session ends with documented partial state):

- [ ] **G.1** — Verify each refactored modal's smoke test passes:
  ```bash
  npm run test:winner-selection
  npm run test:admin-major-draw
  npm run test:campaign-targeting
  npm run test:settings-modal
  npm run test:package-selection
  npm run test:revenue-detail
  npm run test:upsell-modal
  npm run test:special-packages
  npm run test:subscription-management
  npm run test:payment-methods-tab
  npm run test:payment-method-selector
  npm run test:membership-modal
  ```

- [ ] **G.2** — Repo-wide:
  ```bash
  npm run lint 2>&1 | tail -10
  npm run type-check 2>&1 | tail -5
  npm run build 2>&1 | tail -10
  ```
  All exit 0.

- [ ] **G.3** — `CLAUDE.md` `lastVerified` bumped for: `subscription`, `payment`, `admin`, `auth`, `upsell`, `draws`, `rewards-redeemables`. Validate JSON parses.

- [ ] **G.4** — Working tree review (uncommitted changes summary):
  ```bash
  git status --short
  git diff --stat
  ```
  User reviews and decides on commit/PR.

---

## Doc-sync hook compliance

The Stop hook (`.claude/hooks/doc-sync.mjs`) blocks if `src/` files change without matching `docs/<domain>/` updates. Per the spec, each wave's modal triggers the hook; the recipe step 6 handles this. If the hook still blocks at the end of a modal, the recipe was incomplete — re-run step 6 before continuing.

## Failure modes

- **Smoke test fails after extraction** — usually a missing provider in the test wrapper. Add the provider; re-run.
- **Build fails on import** — the folder/`index.tsx` resolution should be automatic but verify TypeScript path resolution (`tsconfig.json` `baseUrl` + `paths`) hasn't been customized away from `@/components/modals/<Name>`.
- **Visual change reported** — diff the orchestrator's wrapping JSX against the original modal's body. Common cause: an extra `<div>` introduced by accidentally wrapping sub-components in a fragment slot. Revert to fragment shape.
- **Stripe element re-mount** — ensure `getStripePromise()` is module-scope (resolved at module load, not inside the component). Decomposition shouldn't touch this.
