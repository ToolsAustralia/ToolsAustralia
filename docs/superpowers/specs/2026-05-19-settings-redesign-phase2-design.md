# Settings Redesign — Phase 2 (Sub/Pay merge + polish) Design Spec

_Date: 2026-05-19 · Domain: `dashboard-account` (+ touches `subscription`, `payment`) · Scope: **frontend only, business logic 100% preserved, no other UI regressed**_

Builds on `2026-05-19-settings-redesign-design.md`. Resolves the flagged follow-ups #1, #2, #3, #7 plus four polish items the user requested after reviewing Phase 1.

## 1. Premise correction (drives the architecture)

The user believed `SubscriptionManagementModal` / `PaymentMethodsTab` are "only references for the plan/payment tab." Investigation proved otherwise:

- `SubscriptionManagementModal` renders as a **real modal** in `src/app/(site)/my-account/components/MembershipStatus.tsx:312` (the /my-account membership card) and the dev gallery.
- `renderAsPanel` is passed by **two** callers: settings `SubscriptionTab.tsx:32` **and** `src/components/modals/SettingsModal/index.tsx:241`.
- `PaymentMethodsTab` has **no** panel/modal prop (always one render) and is used by both settings `PaymentTab.tsx` and `SettingsModal/index.tsx:246`.

Therefore re-skinning in place — or keying off `renderAsPanel` — would change the SettingsModal embed and/or the MembershipStatus modal. **Not acceptable** ("keep functionality 100%, don't break things").

**Architecture decision:** introduce a new, opt-in **settings-only variant prop** consumed solely by the settings tab wrappers. Default behavior (modal, SettingsModal panel) stays byte-identical. The new design is a separate presentational tree fed by the **existing, unchanged** logic surface (hooks, handlers, derived values).

## 2. Scope (locked)

| # | Item | Decision |
|---|---|---|
| 1 | Remove "Member since …" index footer | Delete the footer line in `settings/page.tsx`. |
| 2 | Rename tab "Profile" → "Account details" | Display label only (tab id stays `profile`; `?tab=profile` URL + deep links unchanged — no behavior/backend change). Update `SETTINGS_TABS` label/shortLabel, the index preview card title, sidebar, and `DashboardHeader` title mapping. Bottom-nav "Profile" (=/my-account) is a different surface; the rename removes the duplication. |
| 3 | Spacing between sticky tab strip and tab content header | Add top spacing to the tab-content container so the first `SectionHeader` is not flush against the mobile sticky segmented strip / desktop layout. |
| 4 | Password **security score** (ScoreDial + checklist) | Implement **frontend-only, deterministic, non-fabricated**. Score = function of REAL signals + live new-password criteria (see §4). No server data invented. |
| 5 | SMS 2FA | Unchanged — stays "Coming soon" placeholder. |
| 6 | Index payment brand/last4 ("Visa •••• 4242") | Use the existing `useSavedPaymentMethods()` hook (returns `card.brand/last4`) in `settings/page.tsx`; no new endpoint. |
| 7 | Subscription tab — merge Claude design with real `SubscriptionManagementModal` functionality | New settings-variant presentational tree, real handlers/derived values reused verbatim. See §5. |
| 8 | Payment tab — merge Claude design with real `PaymentMethodsTab` functionality | New settings-variant presentational tree, real hooks/handlers reused verbatim. See §6. |

Non-goals: any change to `src/app/api/**`, `src/services/**`, `src/lib/**`, `src/models/**`, the existing hooks, the modal-mode render, the SettingsModal embed, or any business logic / endpoint / mutation / localStorage / `window.location.reload()` behavior.

## 3. Polish items (Phase A)

- **Member-since footer:** remove the `<p>… Member since …</p>` block from the index.
- **Rename:** `SETTINGS_TABS` entry `profile` → `label: "Account details"`, `shortLabel: "Account"` (id unchanged). `DashboardHeader` title and the index preview card heading derive from the label, so they update automatically; verify the index identity area and any hard-coded "Profile" string.
- **Spacing:** the tab-content wrapper in `page.tsx` gets `pt-6 sm:pt-8` (or equivalent) and the mobile sticky strip keeps its own block; ensure ≥ ~24px between the strip and the first `SectionHeader`. Desktop unaffected aesthetically but consistent.

## 4. Password security score (Phase A)

Render the design's `ScoreDial` + checklist in `PasswordTab`, computed **client-side only**:

- **Inputs (all already available, no fetch):** `userEmail` is present; extend `PasswordTabProps` additively with optional `isEmailVerified?: boolean` and `hasPassword?: boolean` (parent `page.tsx` has `user.isEmailVerified` (real) and `user.hasPassword` (real, optional in `UserData`) — pass them; no new prop threading risk, additive optional).
- **Checklist items (only truthful signals):**
  1. "Password set" — `hasPassword !== false` (true when set).
  2. "Email verified" — `isEmailVerified === true`.
  3. "Two-factor authentication" — always not-yet (SMS is "Coming soon"); shown as an unmet/"Recommended" item (accurate, not fabricated).
  4. "Strong new password" — only meaningful while changing: reflects the live `calculatePasswordStrength(newPassword)` criteria (length ≥ 6/10, upper+lower, number, special). When no new password is being typed this item is neutral/!met.
- **Score:** deterministic 0–100 from the met items (e.g. weight: password set 35, email verified 35, 2FA 30; while a new password is typed, blend in its strength as a bonus capped at 100). The dial color/label thresholds follow the design (`>=80 Strong`, `>=60 Decent`, else `At risk`). No randomness, no server number.
- This replaces the omitted dial from Phase 1; the "login alerts enabled"/"changed N days ago" design items remain **omitted** (no backing data).

## 5. Subscription tab merge (Phase C)

### Gating
Add optional prop to `SubscriptionManagementModalProps`: `settingsRedesign?: boolean` (default `undefined`/false). Settings `SubscriptionTab.tsx` passes `renderAsPanel settingsRedesign`. `SettingsModal` and `MembershipStatus` pass neither → **byte-identical** behavior for them. Inside `index.tsx`:
- The 5 portal child modals (Upgrade/Downgrade/Stripe/CancellationFlow/RenewalFailed) are currently part of the `subscriptionContent` fragment. Refactor so they render **once, unconditionally, regardless of branch** (e.g. hoist them next to the structural fork) — they must NOT be duplicated and must be present in both legacy and settings branches with identical props/state wiring.
- The **main content block only** (the `<ModalContent>` body / state selector ~836-865) branches: when `renderAsPanel && settingsRedesign` → `<SettingsRedesignSubscription …/>`; otherwise the legacy body verbatim. The `{!renderAsPanel && <ModalHeader/>}` and structural panel/modal fork stay as-is for non-settings callers.

### New file
`src/components/modals/SubscriptionManagementModal/SettingsRedesignSubscription.tsx` — presentational, receives ALL data/handlers as props from `index.tsx` (no own hooks/fetch/business logic; the orchestrator already computed everything). It composes the Claude `subscription-tab.jsx` design using the Phase-1 settings primitives + tier theming via the existing `getMembershipSectionColorScheme`.

**To achieve full design fidelity while keeping numbers verbatim:** the new component does NOT reuse the legacy visual sub-components (`CurrentBenefitsCard`/`UpgradeList`/`DowngradeList`) and does NOT modify them (they stay for modal/SettingsModal mode). Instead it **imports and calls the exact same pure calculation utilities** those components use — `calculateRenewalEntries`, `calculateUpgradeEntries`, `getPartnerAccessDurationLabel`, `lastMonthAccumulatedEntries`, the discount price math `price * (1 - percentOff/100)` — with the same inputs (passed in as props from the orchestrator's already-derived `membershipPackage`/`subscriptionBenefits`/`activeSubscription`). Same functions, same inputs ⇒ identical numbers, new look. The plan must enumerate each util's import path and call signature so the implementer cannot re-derive logic by hand. If any of these is not an importable pure util but inline in a component, that specific number is sourced by passing the already-computed value down from `index.tsx` (never recomputed in the new file).

### State → design mapping (real handlers/values, reused verbatim)
- **Active / past-due-with-autorenew** → design "PlanHero" (plan name, price w/ live Stripe `discount` strikethrough, start, next-billing/cancel-end, auto-renew) sourced from the existing `membershipPackage`/`activeSubscription`/`subscriptionBenefits`; reuse `CurrentBenefitsCard` for the benefits+entries math block within the hero section.
  - Failed renewal → design "PastDueRecovery" panel wired to the existing `PastDueAlert` callbacks (`onResolve`→`setIsRenewalFailedModalOpen(true)`, `onCancel`→`handleCancelSubscription`). When `hasFailed`, management actions hidden (same as today).
  - Pending change → existing `PendingChangeBanner`/`BenefitCountdown`.
  - Management (only if `!hasFailed`): design "Manage plan" `ManageRow`s reusing the existing `UpgradeList`/`DowngradeList` (their selection callbacks open the real confirm modals) and `CancelResumeRow` (cancel→`handleCancelSubscription`, resume→`handleReactivateSubscription`); auto-renew row is display-only mirroring today (no toggle endpoint exists — do not invent one).
  - "TierLadder" — derived from the real available packages (current vs upgrades/downgrades) — purely presentational positioning, no fabricated metrics.
  - "Plan benefits" — from real `subscriptionBenefits.currentBenefits`/package features.
- **One-time only** → re-skinned `OneTimeOnlyState` (presentational; `onSubscribeClick` unchanged).
- **Inactive / no subscription** → re-skinned `InactiveSubscriptionState` / `NoSubscriptionState` (presentational; `onSubscribeClick` unchanged).
- **Guest (no plan)** → design guest view: plan cards + feature-matrix using the real available membership packages from `useMemberships()` (already in the orchestrator). "Choose <tier>" → the existing subscribe path (`membershipModal.openModalWithPackageSelectionFirst()` / `onSubscribeClick`).

### Omitted + flagged (no backing data — codebase deliberately never fabricates entry history)
- **AccumulationChart** (6-month entry bars) — omitted; the orchestrator deliberately substitutes `lastMonthAccumulatedEntries` and `cancellationEntrySnapshot` returns `null` rather than invent counts. Flagged.
- **BillingCalendar**: render using the **real next-billing date** only, as a single "Next bill" card (deterministic), NOT the synthetic 4-cycle projection. The 3 future synthetic cycles are omitted/flagged.

## 6. Payment tab merge (Phase D)

### Gating
Add optional prop to `PaymentMethodsTab` props: `settingsRedesign?: boolean` (default false). Settings `PaymentTab.tsx` passes it; `SettingsModal` does not → byte-identical there. Inside `PaymentMethodsTab/index.tsx`, when `settingsRedesign`, render `<SettingsRedesignPayment …/>` (new file) instead of the legacy `<div>` tree; **all hooks, handlers, Stripe `Elements`/`stripePromise` singleton, `ConfirmationModal` delete flow stay in `index.tsx` and are passed down as props** — the new file is presentational only.

### New file
`src/components/modals/PaymentMethodsTab/SettingsRedesignPayment.tsx` — composes the Claude `payment-tab.jsx` design (wallet grid, realistic credit-card visuals with **real `card.brand/last4/expMonth/expYear`** from `SavedPaymentMethod`, default ring, failed/past-due banner, dashed Add-card slot) using Phase-1 primitives. Reuses the existing `AddPaymentForm` (Stripe `PaymentElement` + `confirmSetup`) with chrome re-skin only — **no change to Stripe calls / billing-address logic**. Card-brand → styled mark mapping is frontend presentational (replaces the placeholder 💳). Delete/set-default/add flows call the existing handlers passed from `index.tsx`; the `ConfirmationModal` delete-flow (`getPaymentMethodDeleteFlowKind`, `billing-last` checkbox) stays in `index.tsx` and is unchanged.

### States (same logic, re-skinned): active-subscription banner, error, loading, empty (Add CTA), add-form (Stripe Elements — chrome only), has-cards (wallet grid), delete-confirm (unchanged `ConfirmationModal`).

## 7. Index payment brand/last4 (Phase B)

In `settings/page.tsx`, call the existing `useSavedPaymentMethods()` (no new endpoint; it resolves userId internally). For the payment preview card: if methods exist, show the default method's `\`\${brand} •••• \${last4}\`` (Title-cased brand) + "Default" when applicable; else fall back to the Phase-1 count/`"No cards saved"` logic. Guard all `card?` optionals; never crash if Stripe data is still loading (show the Phase-1 count text until loaded). No fabrication.

## 8. Risks & mitigations

- **Regressing SettingsModal / MembershipStatus / dev gallery** → mitigated by the opt-in `settingsRedesign` prop; default paths untouched; reviewers diff modal-mode render for byte-identity.
- **Logic/JSX entanglement in CurrentBenefitsCard/UpgradeList/DowngradeList** → mitigated by **reusing them as-is** inside the new sections (no internal re-skin), so entry/discount math is preserved verbatim.
- **Extra Stripe fetch on settings index** (Phase B) → acceptable: it is the sanctioned existing hook; UI degrades gracefully to the count text while loading.
- **`window.location.reload()` / localStorage** post-upgrade/downgrade → preserved (logic untouched; only presentation branches).
- **Doc-sync Stop hook** → `docs/dashboard-account/`, `docs/subscription/`, `docs/payment/` updated in the final phase (the manifest maps the touched modal/hook paths to `subscription`/`payment` domains too).
- **Bundle**: new presentational files are static-imported by already-`dynamic()`-loaded components → no new route-chunk regression.

## 9. Phases (each = one commit, no push)

- **A — Polish:** member-since removal, Profile→Account details rename, tab/header spacing, password security score (frontend). (`settings/page.tsx`, `SettingsSidebar.tsx`, `PasswordTab.tsx`.)
- **B — Index payment brand:** `useSavedPaymentMethods` wired into the index preview. (`settings/page.tsx`.)
- **C — Subscription merge:** `settingsRedesign` prop + `SettingsRedesignSubscription.tsx`; `SubscriptionTab.tsx` passes the prop. Modal/SettingsModal byte-identical.
- **D — Payment merge:** `settingsRedesign` prop + `SettingsRedesignPayment.tsx`; `PaymentTab.tsx` passes the prop. SettingsModal byte-identical.
- **E — Docs + flags + final review:** update `docs/dashboard-account|subscription|payment`; refresh the flag list (only AccumulationChart + 3 synthetic billing cycles + SMS 2FA remain deferred); comprehensive review.

## 10. Definition of done

- `npx tsc --noEmit` + `npm run lint` clean for touched files.
- Modal-mode `SubscriptionManagementModal` (MembershipStatus, dev gallery) and `SettingsModal` embeds render byte-identically (reviewer-verified diff of the non-settings paths).
- Settings Subscription/Payment tabs match the Claude design (minus the data-unbacked AccumulationChart + synthetic future billing cycles, which are flagged), with 100% of existing actions/flows working through the original handlers.
- Polish items done; password score deterministic & non-fabricated.
- Docs + updated flag list delivered.
