# Cancellation Flow Redesign — Design

**Date:** 2026-05-19
**Status:** Approved (pending spec review)
**Scope:** UI layer only — `src/components/modals/CancellationFlowModal/**`. **Zero backend change.** Same step machine, mutation hooks, APIs, offers, eligibility and outcome-recording invariants as documented in `docs/subscription/cancellation-flow.md`.

## Goal

Restyle and lightly restructure the in-app cancellation retention flow to a best-in-class "Elevated Guided Conversational" experience: calmer, more premium, reason-aware, responsive across all devices, and matching the Tools Australia theme (brand red `#ee0000`, premium-gold accent) in both light and dark mode.

Tone is **hybrid**: calm/respectful throughout, with **one** tasteful gold persuasion strip retained on the final confirm screen (the strategic conversion moment).

## What does NOT change

- `useCancellationFlow.ts` step machine and pure transition helpers (`offerPhaseFor`, `nextOfferState`, `applyStart`, `decline`, `requestExit`) and their tests.
- `src/hooks/queries/useCancellationFlow.ts` mutation hooks (`useStartCancellationFlow`, `useOutcomeCancellationFlow`, `useAcceptOffer`).
- All API routes, services (`RetentionPause/Discount/UnsubscribeService`), eligibility/routing utils, crons, analytics.
- The outcome-recording invariant (exactly one terminal outcome per event) and the 409/404 graceful-decline behaviour.
- `tier_downgrade` continues to exit the modal to the parent's `DowngradeConfirmModal` via `onRequestTierDowngrade` (no success screen for that path).
- Parent integration contract (`SubscriptionManagementModal`): `onSaved` / `onCancelled` / `onResolvePayment` / `onClose` / `onRequestTierDowngrade` props are unchanged in signature.

## Approved visual direction

"Elevated Guided Conversational": reason-aware conversational headlines, generous type scale, a concrete value card (real numbers, never a vague "%"), one warm primary CTA + an underlined text decline, quiet trust footer. Material craft: gold edge-glow on the value card, soft inner gradients, shimmer CTA, layered shadows. Branded header lockup. **No visible progress indicator** (the `StepIndicator` is removed — the flow is short enough that step chrome is noise).

## Shared primitives (new, internal to the modal folder)

To keep all screens consistent and avoid file bloat, introduce a small primitives module used by every step. These replace ad-hoc per-card markup and the current `upsell-shell` usage *within this modal* (the shared `upsell-shell` package itself is untouched for its other consumers).

`src/components/modals/CancellationFlowModal/primitives.tsx` exporting:

- `FlowFrame` — branded header (TA lockup + ✕), body padding, optional `trust` footer. No progress indicator.
- `IconChip` — the rounded tinted icon container (light/dark aware).
- `ValueCard` — the bordered value block; `glow?: boolean` adds the gold edge-glow; `framing` retained for loss vs gain contexts.
- `FeatureRow` — check-led benefit line.
- `PrimaryCta` (shimmer, brand-red gradient, reduced-motion aware) and `TextDecline` (underlined ghost).
- `UrgencyStrip` — the single tasteful gold persuasion strip (used only on confirm + as the bonus-rung loss line).

All primitives are theme-token driven (Tailwind `dark:` variants) and have no business logic.

## Per-screen design

All screens use `FlowFrame`. Headlines are reason-aware where noted.

1. **Step 1 — Reason** (`Step1Reason.tsx`, restyled): greeting headline. First name is read from the existing client `UserContext` if a value is already present there (no new prop threading, no extra fetch); if absent, use the neutral headline "Before you go — what's making you leave?". Personalisation is best-effort, never a blocker. Conversational sub, the existing 7 radio options as elevated cards (selected = brand-red, soft depth), "Other" reveals the existing **mandatory** free-text box (unchanged validation). Single primary CTA.
2. **Step 2 — Offer phase** (`Step2Offer.tsx`, restyled; cursor-driven, unchanged logic): an eyebrow `Tailored for you · Offer {n} of {total}` derived from `offerCursor` / `offersShown.length` (presentation only — no logic change). Each of the 5 offer cards (`discount_50_2mo`, `tier_downgrade`, `pause_30d`, `unsubscribe_marketing`, `bonus_entries_100`) gets reason-aware copy and a `ValueCard`. Accept/decline wiring, 409/404 graceful decline, and `tierDowngradeAvailable` fallback to the bonus rung are all unchanged.
3. **Save Success** (`StepSaveSuccess.tsx`, **new** screen): shown after a retention offer is accepted (`discount_50_2mo`, `pause_30d`, `unsubscribe_marketing`, `bonus_entries_100`) *instead of* the modal closing silently. Check-burst + confetti (reduced-motion: static check), confirmation headline (same best-effort first-name source/fallback as Step 1), and a plain-English summary built **only from data already available** (the `useAcceptOffer` result — `couponId` / `resumesAt` — plus known subscription benefits and the accepted offer type). It must not fabricate values it doesn't have (e.g. omit a next-charge date if not reliably derivable). Single CTA → calls the existing `onSaved()`. `tier_downgrade` does NOT use this screen (it exits to the parent downgrade modal as today).
4. **Step 4 — Confirm** (`Step4Confirm.tsx`, restyled): calm "what happens" cards (entries lost / draw spot lost) + the single `UrgencyStrip`. Equal-weight buttons, "Keep my membership" primary. Past-due variant: branded warning chip, "Resolve payment" primary, "Cancel anyway" secondary, no offers (§3a unchanged).

## Flow-state change for Save Success

Today an accepted offer calls `onSaved()` immediately, which closes the modal. New behaviour: on accept success, transition to an internal Save Success view, then its CTA calls `onSaved()`.

- Add a `saveSuccess` view to the modal's local render state. Preferred approach: extend `FlowState` with a terminal `saveSuccess` boolean + `acceptedOffer: OfferType | null` + `acceptResult` (the `useAcceptOffer` payload), set by a new pure helper in `useCancellationFlow.ts` (`applySaveSuccess(state, offer, result)`), unit-tested like the existing helpers. The `step` union is **not** widened with a new numeric step; `saveSuccess` is an orthogonal terminal flag the renderer checks first.
- `index.tsx` renders `StepSaveSuccess` when `state.saveSuccess` is true; its CTA calls `onSaved()`. The `bonus_entries_100` path keeps firing its existing `outcomeMutation` fire-and-forget before showing success; the server-side `acceptOffer` offers keep recording server-side. No double outcomes.
- Cancellation (`Step4Confirm` "cancel anyway") is unchanged — no success screen, it calls `onCancelled()` as today.

## Dev preview harness (`/dev/cancellation-flow`)

A single dev page that renders **every** screen/state of the flow on one scrollable page so design, colour, motion and copy can be tuned in isolation before touching the live modal. It mounts the **real** components (and shared `primitives.tsx`), not re-implementations — so editing a component is immediately reflected here and in production.

- Location: `src/app/dev/cancellation-flow/page.tsx` — follows the existing `src/app/dev/**` convention and uses the **same access guard as sibling dev pages** (no new gating mechanism invented; if siblings are dev-only/non-prod, this matches them).
- **No network**: the page injects mock mutation objects and stub `onSaved`/`onDecline`/`onCancelled`/`onRequestTierDowngrade`/`onResolvePayment`/`acceptOfferMutation` handlers so accept/decline just transition visually. It never calls real APIs, Stripe, or records outcomes.
- **States shown**, each in its own labelled panel:
  - Step 1 — Reason: default, a reason selected, "Other" selected (empty → CTA disabled) and filled, start-error state, with/without first name.
  - Step 2 — each of the 5 offer cards (`discount_50_2mo`, `tier_downgrade` with `tierDowngradeAvailable` true *and* false, `pause_30d`, `unsubscribe_marketing`, `bonus_entries_100`), plus the "Tailored for you · Offer n of total" eyebrow at different cursor positions, and the processing/in-flight button state.
  - Save Success — one panel per accepted offer that uses it (`discount_50_2mo`, `pause_30d`, `unsubscribe_marketing`, `bonus_entries_100`).
  - Step 4 — Confirm: normal variant and past-due variant.
- **Global controls** (simple top toolbar, local state only): light/dark toggle, `prefers-reduced-motion` simulation toggle, and a viewport-width switch (mobile sheet / tablet / desktop dialog) so all three responsive layouts are visible without resizing the browser.
- It is a **preview/QA aid only** — not a test, not shipped UI. Pure presentation; no business logic lives here.
- **Build order:** the harness + `primitives.tsx` come **first** in the implementation plan (alongside the first restyled screen) so design/colour/motion can be tuned on the dev page before the remaining screens are migrated onto the primitives.

## Responsive

- Mobile + tablet (`< lg`/1024px): full-bleed slide-up sheet (`mobileFullBleed`, `presentation="sheet"`), single column, large tap targets — unchanged container behaviour, restyled contents.
- Desktop (`≥ lg`): centered dialog. The offer step uses a **two-column** layout (message + CTA left, `ValueCard` right) instead of a stretched single column. Other steps remain single-column centered. Implemented with Tailwind responsive classes only.
- `ModalContent` keeps `padding="none"`; each screen owns padding via `FlowFrame` (removes the historic double-padding; trust footer stays flush).

## Theming & motion

- Strict use of existing theme tokens / Tailwind `dark:` variants — verified in both modes. Brand red `#ee0000`, premium-gold accent already in `globals.css`.
- Motion: spring step transitions, price count-up on the discount `ValueCard`, check-burst + confetti on Save Success, CTA shimmer. **All gated behind `prefers-reduced-motion`** (static fallbacks). No new animation library — use existing CSS/Tailwind and whatever confetti utility the codebase already has (`useConfetti`); do not add a dependency.

## Files

| File | Action |
|---|---|
| `CancellationFlowModal/primitives.tsx` | **new** — shared FlowFrame/IconChip/ValueCard/FeatureRow/PrimaryCta/TextDecline/UrgencyStrip |
| `CancellationFlowModal/StepSaveSuccess.tsx` | **new** — Save Success screen |
| `CancellationFlowModal/index.tsx` | edit — drop `StepIndicator`, render `StepSaveSuccess` on `state.saveSuccess` |
| `CancellationFlowModal/useCancellationFlow.ts` | edit — add `saveSuccess`/`acceptedOffer`/`acceptResult` to `FlowState` + `applySaveSuccess` pure helper |
| `CancellationFlowModal/Step1Reason.tsx` | edit — restyle via primitives, greeting |
| `CancellationFlowModal/Step2Offer.tsx` | edit — restyle all 5 cards via primitives, "Tailored for you" eyebrow, route accept→saveSuccess |
| `CancellationFlowModal/Step3BonusEntries.tsx` | edit — restyle via primitives, route accept→saveSuccess |
| `CancellationFlowModal/Step4Confirm.tsx` | edit — restyle via primitives, single UrgencyStrip |
| `CancellationFlowModal/StepIndicator.tsx` | **delete** — no visible progress indicator |
| `src/app/dev/cancellation-flow/page.tsx` | **new** — dev preview harness (all states, no network) |
| `CancellationFlowModal/__tests__/useCancellationFlow.test.ts` | edit — add `applySaveSuccess` cases |
| `docs/subscription/cancellation-flow.md` | edit — document the new UI, Save Success screen, removed StepIndicator |
| `docs/dev-tooling/` | edit — document the `/dev/cancellation-flow` preview harness |

Net: +3 files, −1 file. Justified: `primitives.tsx` removes duplicated card markup across 5 cards (net reduction in total surface); `StepSaveSuccess.tsx` is the one genuinely new screen; `dev/cancellation-flow/page.tsx` is the user-requested design/QA harness (one file, no network, dev-only).

## Domain / docs obligations

- `src/components/modals/CancellationFlowModal/**` → `subscription` domain → update `docs/subscription/cancellation-flow.md`.
- `src/app/dev/**` → `dev-tooling` domain → update `docs/dev-tooling/`.

Both are covered by existing Domain Manifest globs — **no `CLAUDE.md` manifest edit required.**

## Testing

- `npm run test:cancellation-flow-hook` (the existing `useCancellationFlow` pure helper test) extended with `applySaveSuccess`.
- Pure routing/eligibility/service tests unaffected (no logic change) — run to confirm green.
- `npm run lint`, `npm run type-check`, `npm run build` must pass.
- Manual matrix driven primarily from `/dev/cancellation-flow` (all states on one page) plus a live smoke test of one real reason→accept and one real reason→cancel path: each reason → its offer waterfall, accept & decline each rung, Save Success per offer, past-due variant, light/dark, mobile sheet / tablet / desktop dialog, reduced-motion on.

## Risks & mitigations

- **Save Success changes terminal timing.** Mitigation: outcome recording is unchanged (already fires before/independently of the screen); the success screen is purely presentational and its CTA calls the same `onSaved()`. `tier_downgrade` path explicitly excluded.
- **Summary over-promising.** Mitigation: render only values present in the `useAcceptOffer` result / known benefits; omit anything not reliably derivable.
- **Theme regressions.** Mitigation: primitives are token-driven; manual light/dark pass in the test matrix.

## Out of scope

Backend, copywriting beyond the screens shown, A/B testing the new flow, analytics changes, the shared `upsell-shell` package's other consumers.
