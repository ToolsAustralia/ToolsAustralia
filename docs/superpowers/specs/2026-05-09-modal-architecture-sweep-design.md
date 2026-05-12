# Modal Architecture Sweep — Design Spec

**Date:** 2026-05-09
**Author:** Claude (Opus 4.7) per user request to continue Plan 2/3/6 modal decomposition across all remaining flat modals.
**Companion plan:** [`2026-05-09-modal-architecture-sweep.md`](../plans/2026-05-09-modal-architecture-sweep.md)
**Predecessors:** Plan 2 (CancellationUpsellModal pilot), Plan 3 (modal sweep — RenewalFailed, DowngradeConfirm), Plan 6 (modal design uplift — UpgradeConfirm, ReferFriend, UserSetup, StripePayment, etc.).

## Goal

Bring **every flat-file modal in `src/components/modals/`** that meets the [decomposition criteria](../../shared-ui/component-decomposition-criteria.md) onto the canonical orchestrator-folder pattern established by Plan 2. Visual output unchanged — this is purely an architectural sweep for maintainability.

## Hard rules

1. **No visual change.** Rendered output (DOM, classNames, animations, z-index, colors, copy) is byte-equivalent before and after for every refactored modal. Spec violation = revert.
2. **No commits.** Per `CLAUDE.md` hard rule #1, all changes left uncommitted; user reviews on return.
3. **Public prop interface preserved byte-identically.** Callsites are not touched. Folder/`index.tsx` resolves at the same import path as the deleted `.tsx`.
4. **Smoke test per refactored modal.** Renders the modal via `react-dom/server.renderToString` across all meaningful prop combos — minimum 4, more when variant axes warrant. Wired as a `test:<scope>` npm script.
5. **Domain manifest updated.** Per `CLAUDE.md` hard rule #2, `docs/<domain>/` files for the affected domain are refreshed in the same task. The doc-sync hook will block otherwise.
6. **Build clean.** `npm run lint && npm run type-check && npm run build` exits 0 after each modal is finished.

## Out of scope (explicitly)

- **Visual redesign** (that was Plan 6 territory; this sweep is structural only).
- **Modal primitive consolidation** — moving `src/components/modals/ui/*` into `src/components/ui/` was Plan 4's job and is not re-attempted here.
- **Logic-only files masquerading as modals** — `UpsellManager.tsx` (orchestrator) and `UnifiedModalManager.tsx` (modal coordinator) stay flat because they have no visual sections to decompose.
- **Coherent forms** that score 1-2 in the audit — per the decomposition criteria's anti-signals, splitting a 350-LOC coherent admin form into a folder is noise. Listed under **§Skip list** below with rationale.
- **Renaming or relocation** — `PaymentMethodSelector.tsx` and `PaymentMethodsTab.tsx` live under `src/components/modals/` despite not being modals (they're inline panels). Relocation to `src/components/payment/` is a separate concern; this sweep decomposes them in place.

## The canonical pattern (codified)

Established by Plan 2's [CancellationUpsellModal pilot](../plans/2026-05-08-ui-cleanup-plan-2-cancellation-modal-pilot.md) and refined by Plan 3 (RenewalFailedModal, DowngradeConfirmModal). For each refactored modal:

```
src/components/modals/<ModalName>/
  index.tsx                 ← orchestrator (state, effects, callbacks, prop assembly).
                              Public props interface is BYTE-IDENTICAL to the deleted monolith.
                              Target ~150-300 LOC for modals up to ~1500 LOC pre-refactor;
                              up to ~500 LOC for genuine wizards (e.g. MembershipModal).
  <Section1>.tsx            ← one visual section (Header, Hero, Body, Footer, …).
  <Section2>.tsx              Each takes flat props; ≤120 LOC; no hooks beyond local UI state.
  …
  styles.module.css         ← optional. Only for Tailwind-hostile rules
                              (composite multi-stop gradients, ::-webkit-scrollbar,
                              container queries, complex pseudo-element math).
  __tests__/
    <ModalName>.test.ts     ← smoke test: react-dom/server renderToString on
                              ≥4 meaningful prop combos. Wraps in required providers.
    asset-stubs.cjs         ← (if needed) require.extensions stubs for .webp/.css.
```

### Three rules the orchestrator obeys

1. **All hooks in the orchestrator.** Sub-components do not call `useSession`, `useQueryClient`, `useMutation`, custom domain hooks, or any context. The single exception: trivial UI state local to a sub-component (e.g. hover, dropdown open/close).
2. **All effects in the orchestrator.** Body scroll lock, Escape key handlers, query invalidations, focus traps — orchestrator territory. Sub-components are pure presentation.
3. **All callbacks in the orchestrator.** Click handlers, mutation callers, navigation. The sub-component receives `onConfirm: () => void` — never `(...) => fetch(...).then(...)` wired inline.

### When to extract a `Shell.tsx`

Some already-decomposed modals (DowngradeConfirmModal, UpgradeConfirmModal, PackageDetailModal, RenewalFailedModal) extract a separate `Shell.tsx` that owns the bespoke modal frame (backdrop, dialog stage, scroll lock, close button). Others (CancellationUpsellModal) keep the frame inline in `index.tsx`.

**Decision rule for THIS sweep:**

- If the original modal **uses `ModalContainer`** from `./ui` → keep using it. The orchestrator wraps `<ModalContainer>{...}</ModalContainer>` and sub-components live as children. **No `Shell.tsx` needed.** This is the case for all 11 must-decompose modals in §Inventory.
- If the original modal **rolls its own bespoke `<div className="fixed inset-0">` shell** with custom z-index / radial-gradient frame / animation gates (e.g. SubscriptionExplainerModal) → extract `Shell.tsx` per the DowngradeConfirmModal pattern. Visual parity rule applies — the Shell wraps the same inline JSX from the original.

### When to use a CSS module

Per [tailwind-conventions.md §5](../../shared-ui/tailwind-conventions.md), only for Tailwind-hostile rules. For most modals in this sweep, **no module is needed** — they're already pure Tailwind utilities.

## Inventory — every flat modal classified

Source data: [`docs/shared-ui/decomposition-backlog.md`](../../shared-ui/decomposition-backlog.md) audit (2026-05-08), augmented by re-reads of each candidate's source file (2026-05-09).

### MUST decompose (12 modals)

Each meets at least one strong signal OR scores 3+ on combined criteria.

| # | Modal | LOC | Score | Why decompose | Has Stripe? | Tier-themed? |
|---|---|---|---|---|---|---|
| 1 | `MembershipModal.tsx` | 5,891 | 4 | Strong: 6+ visual sections, mixed concerns, variant explosion. Target wizard (Reg → Plan → Payment) | Yes (SetupIntent + PaymentIntent) | Theme-by-package only |
| 2 | `SubscriptionManagementModal.tsx` | 1,487 | 4 | Strong: 6 sections, embeds 3 child modals, multi-state | Indirect (opens StripePaymentModal) | Theme-only |
| 3 | `SpecialPackagesModal.tsx` | 1,218 | 4 | Strong: 6 sections, packages grid + Stripe form + benefits panel | Yes (inline Elements) | Theme-only |
| 4 | `UpsellModal.tsx` | 1,139 | 4 | Strong: 6 sections, offer hero + benefits + payment + trust | Yes (inline Elements) | Theme-only |
| 5 | `PaymentMethodSelector.tsx` | 1,052 | 3 | Mixed concerns + many-section. Note: NOT a modal — inline panel embedded in MembershipModal/StripePaymentModal | Yes (Elements) | No |
| 6 | `PackageSelectionModal.tsx` | 780 | 3 | 5 sections + tab toggle + plan grid + features preview | No | Theme-only |
| 7 | `AdminMajorDrawModal.tsx` | 731 | 3 | 5 `FormSection`s with mixed concerns (direct fetch, helpers, RichTextEditor + ImageUpload + DateTimePicker) | No | No |
| 8 | `RevenueDetailModal.tsx` | 731 | 2.5 | 5 sections (search/filter toolbar, sort header, expandable list, pagination), embedded export helpers, mobile/desktop dual layouts | No | No |
| 9 | `PaymentMethodsTab.tsx` | 666 | 3.5 | 4 sections + ConfirmationModal portal. NOT a modal — embedded tab in SettingsModal | Yes (SetupIntent) | No |
| 10 | `CampaignTargetingModal.tsx` | 603 | 3.5 | 7 sections (header → filters × multi-axis → search → preview list → pagination → footer) | No | **Yes** (`tradie/foreman/boss` discriminator) |
| 11 | `SettingsModal.tsx` | 526 | 3 | 6 sections (5 tab views, all distinct concerns: profile / subscription / password / payment) | Indirect | No |
| 12 | `WinnerSelectionModal.tsx` | 452 | 3 | 7 sections (header, user picker, preview, prize/testimony fields, image upload, replace warning, submit) | No | No |

### Skip list — anti-signals win (per `component-decomposition-criteria.md` §Anti-signals)

These score 0-2 and either:
- Are coherent admin forms (the criteria's "long-but-coherent form" counter-example),
- Are coherent state machines (no genuine sectioning to split),
- Are search/list patterns where decomposition would just be file-shuffling, or
- Are below ~350 LOC.

Listed for completeness so a future audit doesn't waste time re-evaluating them.

| Modal | LOC | Why skip |
|---|---|---|
| `AdminPromoLinkModal.tsx` | 648 | Long but coherent form — 7 `FormSection`s, single submit, no variant explosion |
| `AdminMonthlyRedeemablesModal.tsx` | 546 | 5 conditional `FormSection`s — branches are tightly coupled state, not independent concerns |
| `AdminProductModal.tsx` | 550 | Coherent form — 6 `FormSection`s, no decomposition signals |
| `AdminBonusEntryPromoModal.tsx` | 482 | Coherent form |
| `AdminPromoBannerTextModal.tsx` | 478 | 8 sections but all driven by single `scheduleType` discriminator — CVA territory, not folder split |
| `MiniDrawEditModal.tsx` | 468 | Coherent form (3 sections) |
| `UserSearchModal.tsx` | 448 | Coherent search-list pattern. **Normalization fix:** adopt `ModalFooter` instead of hand-rolled footer strip ([UserSearchModal.tsx:419](../../../src/components/modals/UserSearchModal.tsx#L419)). |
| `ParticipantsModal.tsx` | 433 | Coherent search-list (twin of UserSearchModal) |
| `MajorDrawEditModal.tsx` | 524 | Coherent edit form — 3 sections with date-relationship validation logic |
| `UpsellManager.tsx` | 402 | **Logic-only** — no visual sections; renders `<UpsellModal>` + `<FloatingGiftIcon>` as fragment. Anti-signal "coherent state machine" |
| `AdminScheduledPromoCalendarModal.tsx` | 360 | Heaviest piece (`ScheduledPromoMonthGrid`) already extracted; rest is the coherent painter state machine |
| `PartnerModal.tsx` | 358 | Coherent application form (4 sections) with one alt success state |
| `AdminScheduledPromoModal.tsx` | 354 | Coherent form |
| `AdminMiniDrawModal.tsx` | 352 | Coherent form (3 sections) |
| `AdminAlternatingMultiplierModal.tsx` | 350 | Coherent form |
| `SubscriptionExplainerModal.tsx` | 334 | Borderline — 5 sections + custom shell + tier-themed. Defer: too small to justify the churn against criteria (anti-signal "splitting <120 LOC sub-components per section"). |
| `ConfirmationModal.tsx` | 367 | Reusable confirmation primitive — used by many modals; its variants are CVA territory, not folder territory |
| `AdminPrizeDrawModal.tsx` | 314 | Coherent form |
| `WinnerEditModal.tsx` | 305 | Coherent form |
| `MembershipByPackageDetailModal.tsx` | 291 | Below threshold |
| `PromoWelcomeModal.tsx` | 291 | Below threshold |
| `PrizeSpecificationsModal.tsx` | 280 | Below threshold |
| `AdminMilestoneRewardModal.tsx` | 278 | Below threshold |
| `UnifiedModalManager.tsx` | 275 | **Coordinator** — no visual sections; logic-only |
| `SavedPaymentMethodsModal.tsx` | 254 | Coherent list |
| `ChannelDetailModal.tsx` | 233 | Below threshold |
| `ExportModal.tsx` | 222 | Below threshold |
| `PixelConsentModal.tsx` | 217 | Below threshold |
| `ReportProblemModal.tsx` | 214 | Below threshold |
| `GateClosedModal.tsx` | 185 | Below threshold |
| `AdminPromoToggle.tsx` | 165 | Not a modal — toggle |
| `PackageInclusionsSlideUp.tsx` | 150 | Below threshold |
| `PromoPageDetailModal.tsx` | 133 | Below threshold |
| `MiniDrawPackageModal.tsx` | 104 | Below threshold |
| `PrizePerformanceAdsModal.tsx` | 91 | Below threshold |

If any of these grow past their thresholds, they re-enter the backlog at the next audit.

## Per-modal section plans

Detailed section breakdown for each MUST-decompose modal. Sub-components named per the visual concern, not technical layer.

### 1. MembershipModal (5,891 LOC) — wizard

The largest and most coupled modal in the codebase. A two-step wizard (registration → payment) with Stripe Setup/PaymentIntent recovery, A/B variant context, promo/referral/affiliate codes, an embedded `PaymentMethodSelector` with ref API (`cardFormRef.confirmStripeIntent`), and a major-draw winner carousel.

```
MembershipModal/
  index.tsx                ← orchestrator: ~400-500 LOC. Owns step state, mutations, all hooks
  hooks/
    useMembershipCheckout.ts  ← wraps the 8+ checkout hooks into a single concern (purchase, intents, codes)
  RegistrationStep.tsx     ← step 1 — name/email/phone form
  PaymentStep.tsx          ← step 2 — wraps PaymentMethodSelector + plan summary + payment CTA
  PlanSummaryCard.tsx      ← summary card with promo multiplier badge
  CouponRow.tsx            ← coupon/referral/affiliate input
  WinnerStrip.tsx          ← major-draw winner carousel strip
  StepIndicator.tsx        ← header step indicator
  __tests__/MembershipModal.test.ts
```

**Risk:** the `cardFormRef.confirmStripeIntent` ref API to `PaymentMethodSelector` must continue to work after both this modal and `PaymentMethodSelector` are decomposed. The ref is forwarded; the orchestrator owns the ref instance. No change to public ref shape.

**MembershipModal is the highest-risk decomposition** — extensive Stripe integration, A/B testing wired into render conditions, embedded sub-modals (UpsellModal, PackageSelectionModal). Plan execution puts it last after smaller modals validate the pattern.

### 2. SubscriptionManagementModal (1,487 LOC)

Member's subscription control center. Already supports `renderAsPanel` — that's the natural extraction seam.

```
SubscriptionManagementModal/
  index.tsx                ← orchestrator: panel/modal switch, all mutations, child-modal portals
  CurrentBenefitsCard.tsx  ← benefits summary + countdown
  PendingChangeBanner.tsx  ← pending downgrade/upgrade banner
  PastDueAlert.tsx         ← failed-renewal banner
  UpgradeList.tsx          ← available upgrades section
  DowngradeList.tsx        ← available downgrades section
  CancelResumeRow.tsx      ← cancel/resume action row
  __tests__/SubscriptionManagementModal.test.ts
```

Embedded sub-modals (StripePaymentModal, CancellationUpsellModal, RenewalFailedModal) stay portal-rendered from the orchestrator — the orchestrator owns whichever opens.

### 3. SpecialPackagesModal (1,218 LOC)

Inline Stripe Elements + package grid + benefits panel.

```
SpecialPackagesModal/
  index.tsx                ← orchestrator: purchase mutation, Elements provider, package selection state
  PromoBanner.tsx          ← gradient promo banner ("50% Off") at top
  PackagesGrid.tsx         ← grid of package cards
  BenefitsPanel.tsx        ← selected-package benefits side panel
  PaymentSection.tsx       ← Elements-wrapped inline card form (when no saved methods)
  PurchaseFooter.tsx       ← purchase CTA + trust indicators
  __tests__/SpecialPackagesModal.test.ts
```

### 4. UpsellModal (1,139 LOC)

Single-offer post-purchase upsell.

```
UpsellModal/
  index.tsx                ← orchestrator: purchase mutation, offer state, Elements provider
  OfferHero.tsx            ← header image + offer title + value/savings
  BenefitsList.tsx         ← filtered inclusion checklist
  PaymentSection.tsx       ← saved-method row + Stripe inline form fallback
  AcceptDeclineRow.tsx     ← accept CTA + decline link
  TrustIndicators.tsx      ← bottom trust strip
  __tests__/UpsellModal.test.ts
```

### 5. PaymentMethodSelector (1,052 LOC) — note: not a modal

Inline payment method picker embedded in checkout flows. Folder lives under `src/components/modals/PaymentMethodSelector/` for consistency with sibling components, despite not being a modal. Relocation to `src/components/payment/` is deferred.

```
PaymentMethodSelector/
  index.tsx                ← orchestrator: ref forwarding, intent state, payment method selection
  SavedCardPreview.tsx     ← default-card preview row
  ChangeMethodRow.tsx      ← "Change payment method" CTA → opens SavedPaymentMethodsModal
  AddNewCardRow.tsx        ← "Add new card" CTA
  CardFormSection.tsx      ← Elements-wrapped Stripe card form block
  __tests__/PaymentMethodSelector.test.ts
```

**Critical:** the ref API (`cardFormRef.confirmStripeIntent`) is preserved via `forwardRef` on `index.tsx`. The orchestrator owns the ref state machine; sub-components don't see it.

### 6. PackageSelectionModal (780 LOC)

Plan-tier picker with one-time/membership tab toggle.

```
PackageSelectionModal/
  index.tsx                ← orchestrator: tab state, plan selection, useMemberships
  TabSwitcher.tsx          ← one-time / membership tab toggle (auth-gated)
  PlanGrid.tsx             ← plan card grid
  PlanCard.tsx             ← single plan card with badges (BestValue, CornerRibbon, Multiplier)
  FeaturesPreview.tsx      ← per-card features preview block
  __tests__/PackageSelectionModal.test.ts
```

### 7. AdminMajorDrawModal (731 LOC)

Admin draw-creation form.

```
AdminMajorDrawModal/
  index.tsx                ← orchestrator: form state, fetch helpers, AEST date conversion
  BasicInfoSection.tsx     ← name + description + brand
  PrizeDetailsSection.tsx  ← prize fields + RichTextEditor
  DateConfigSection.tsx    ← draw/activation/freeze datetimes
  TermsSection.tsx         ← T&C RichTextEditor
  SubmitFooter.tsx         ← error banner + Cancel/Submit
  __tests__/AdminMajorDrawModal.test.ts
```

### 8. RevenueDetailModal (731 LOC)

Admin revenue category drilldown.

```
RevenueDetailModal/
  index.tsx                ← orchestrator: filter state, sort state, expansion state
  utils/exporters.ts       ← extracted CSV+Excel export helpers (move out of component file)
  FilterToolbar.tsx        ← search input + filter dropdown + export CTAs
  TableHeader.tsx          ← sortable column headers
  UserList.tsx             ← user list with expandable per-row purchase details (mobile + desktop variants)
  UserRow.tsx              ← single user row (used by UserList; lifts the dual-layout pair)
  Pagination.tsx           ← pagination strip
  __tests__/RevenueDetailModal.test.ts
```

### 9. PaymentMethodsTab (666 LOC) — note: tab content, not a modal

Embedded tab panel inside SettingsModal. Folder lives at `src/components/modals/PaymentMethodsTab/`.

```
PaymentMethodsTab/
  index.tsx                ← orchestrator: list state, delete confirm state, set-default mutation
  SavedMethodRow.tsx       ← single row (brand + last4 + default badge + actions)
  AddPaymentCTA.tsx        ← "Add new payment method" CTA
  AddPaymentForm.tsx       ← Elements-wrapped inline SetupIntent form
  __tests__/PaymentMethodsTab.test.ts
```

The embedded `ConfirmationModal` portal stays an `index.tsx` concern (delete-confirm flow).

### 10. CampaignTargetingModal (603 LOC)

Admin segment-builder with the **only** explicit `tradie/foreman/boss` tier discriminator in this batch. CVA encodes the tier-chip variant.

```
CampaignTargetingModal/
  index.tsx                ← orchestrator: segment state, fetch, pin/include logic
  SubscriptionStatusFilter.tsx
  TierMultiSelect.tsx      ← tier chips with CVA tier variants
  StatesMultiSelect.tsx
  TopPercentEmailVerifiedControls.tsx
  UserSearchInput.tsx
  PreviewList.tsx          ← paginated preview with selectable rows
  Footer.tsx               ← pagination + Cancel/Save audience
  __tests__/CampaignTargetingModal.test.ts
```

### 11. SettingsModal (526 LOC)

Tabbed settings hub.

```
SettingsModal/
  index.tsx                ← orchestrator: tab state, profile/password mutations
  TabSwitcher.tsx          ← tab nav with past-due badge
  ProfileTab.tsx           ← mobile/state/profession form (own mutations)
  PasswordTab.tsx          ← current/new/confirm form
  __tests__/SettingsModal.test.ts
```

`SubscriptionManagementModal` (rendered as panel) and `PaymentMethodsTab` already exist as siblings; orchestrator delegates to them via `<SubscriptionManagementModal renderAsPanel ... />` and `<PaymentMethodsTab ... />`. No nested re-decomposition needed.

### 12. WinnerSelectionModal (452 LOC)

Admin winner-recording form.

```
WinnerSelectionModal/
  index.tsx                ← orchestrator: form state, UserSearchModal toggle, image state
  Header.tsx               ← Trophy icon + draw name
  UserPickerRow.tsx        ← "Select user" row → opens UserSearchModal
  SelectedUserPreview.tsx  ← chosen-user card
  PrizeFields.tsx          ← prize selection + testimony + result URL
  ImageUploadField.tsx     ← optional winner photo
  ReplaceWarning.tsx       ← current-winner replace warning banner
  SubmitRow.tsx            ← Record Winner button
  __tests__/WinnerSelectionModal.test.ts
```

## Domain manifest mapping

Each refactored modal's parent domain (per `CLAUDE.md` Domain Manifest):

| Modal | Domain |
|---|---|
| MembershipModal | `subscription` |
| SubscriptionManagementModal | `subscription` |
| SpecialPackagesModal | `subscription` (special packages are subscription/upsell adjacent) |
| UpsellModal | `upsell` |
| PaymentMethodSelector | `payment` |
| PackageSelectionModal | `subscription` |
| AdminMajorDrawModal | `admin` (also touches `draws`) |
| RevenueDetailModal | `admin` |
| PaymentMethodsTab | `payment` |
| CampaignTargetingModal | `admin` (also `rewards-redeemables`) |
| SettingsModal | `auth` (settings live in user account scope) |
| WinnerSelectionModal | `admin` (also `draws`) |

`docs/<domain>/` files (`frontend.md` primarily, occasionally `architecture.md`) get the new folder noted; `lastVerified` bumped to `2026-05-09`.

## Smoke test pattern

All smoke tests follow the [Plan 2 / Plan 3 template](../../shared-ui/testing.md):

```ts
// __tests__/<ModalName>.test.ts
import { renderToString } from "react-dom/server";
import React from "react";
// providers per modal's hook needs

const cases: Array<{ name: string; props: ModalProps }> = [
  { name: "open default", props: { isOpen: true, /* ... */ } },
  { name: "closed renders nothing", props: { isOpen: false } },
  // ... per variant axis
];

for (const c of cases) {
  const html = renderToString(
    <Providers>
      <Modal {...c.props} />
    </Providers>
  );
  if (c.props.isOpen && !html) throw new Error(`${c.name} produced empty output`);
}
console.log("ok");
```

Asset stubs (`asset-stubs.cjs`) handle `.webp`/`.css` requires — Plan 2's pattern is reused.

`package.json` gets a `test:<scope>` entry per modal:

```jsonc
"test:winner-selection": "tsx --require ./scripts/codemods/__tests__/asset-stubs.cjs src/components/modals/WinnerSelectionModal/__tests__/WinnerSelectionModal.test.ts"
```

## Risks & rollback

- **Stripe ref API regressions** — MembershipModal ↔ PaymentMethodSelector. Mitigated by decomposing PaymentMethodSelector first (Wave E, ahead of MembershipModal in Wave F).
- **Embedded sub-modals losing portal context** — SubscriptionManagementModal embeds 3 child modals. Orchestrator must keep them portal-rendered from the same render tree, with the same z-index micro-stack. Smoke test covers each "embedded modal open" combo.
- **A/B variant rendering branches** — MembershipModal has variant-specific rendering. Orchestrator owns the variant context; sub-components stay variant-agnostic.
- **Rollback** — each modal is one independent change. `git revert <sha>` per modal if a regression is discovered post-merge. (Note: this sweep is uncommitted; user reviews working tree before any commit.)

## Execution order

The companion plan (`2026-05-09-modal-architecture-sweep.md`) groups the 12 modals into 6 waves:

1. **Wave A — Warmups (3 modals):** WinnerSelectionModal, AdminMajorDrawModal, CampaignTargetingModal. Smallest, no Stripe, validate the pattern execution.
2. **Wave B — Settings/list (3 modals):** SettingsModal, PackageSelectionModal, RevenueDetailModal.
3. **Wave C — Purchase modals (2 modals):** UpsellModal, SpecialPackagesModal. Both have inline Stripe Elements.
4. **Wave D — Subscription complex (1 modal):** SubscriptionManagementModal. Embeds 3 child modals.
5. **Wave E — Payment infrastructure (2 modals):** PaymentMethodsTab, then PaymentMethodSelector. Order matters: MembershipModal depends on PaymentMethodSelector's ref API — decompose PaymentMethodSelector first so MembershipModal's decomposition can rely on its public surface.
6. **Wave F — MembershipModal:** the 5,891-LOC monster. May overflow this session and be left partially decomposed; the plan documents the sub-task breakdown so a follow-up session can finish it without re-auditing.

## Definition of done

For the spec to be considered "executed":

- All 12 modals in §MUST decompose are folder-decomposed OR documented in the plan as "deferred to next session" with the breakdown intact.
- `npm run lint`, `npm run type-check`, `npm run build` exit 0 on the branch.
- Every refactored modal has a smoke test passing.
- `docs/<domain>/` files for each affected domain are refreshed; `lastVerified` bumped.
- No commits — working tree is staged for the user's review on return.
