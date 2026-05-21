# Cancellation Flow Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Commit policy (CLAUDE.md hard rule #1):** This repo forbids auto-commit. Every "Commit" step below is **gated**: only run it if the user has explicitly authorized commits this session (keywords: `commit`, `push`, `merge`, `make a PR`, `ship it`). If not authorized, **pause and ask** — do not skip the work, just defer the commit.

**Goal:** Restyle and lightly restructure the in-app cancellation retention flow into an "Elevated Guided Conversational" experience (calmer, premium, reason-aware, fully responsive, theme-matched light/dark), add a Save Success screen, and ship a `/dev/cancellation-flow` preview harness — UI layer only, zero backend change.

**Architecture:** Introduce one shared presentational primitives module inside the modal folder; migrate all step components onto it; add a new terminal Save Success screen driven by a new orthogonal `saveSuccess` flag on `FlowState` (pure helper, unit-tested); delete the now-unused `StepIndicator`. A dev-only page mounts the real components in every state with mock handlers (no network).

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind, `lucide-react`, `cn()` util, TanStack Query (existing hooks, unchanged), `tsx` standalone tests.

**Spec:** `docs/superpowers/specs/2026-05-19-cancellation-flow-redesign-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/components/modals/CancellationFlowModal/primitives.tsx` | **new** — all shared presentational primitives (FlowFrame, IconChip, ValueCard, FeatureRow, PrimaryCta, TextDecline, UrgencyStrip). No logic. |
| `src/components/modals/CancellationFlowModal/types.ts` | **modify** — add `saveSuccess`/`acceptedOffer`/`acceptResult` to `FlowState`; add local `AcceptResult` type. |
| `src/components/modals/CancellationFlowModal/useCancellationFlow.ts` | **modify** — add pure `applySaveSuccess` + hook method; initial state fields. |
| `src/components/modals/CancellationFlowModal/__tests__/useCancellationFlow.test.ts` | **modify** — add `applySaveSuccess` cases. |
| `src/components/modals/CancellationFlowModal/StepSaveSuccess.tsx` | **new** — post-accept confirmation screen. |
| `src/components/modals/CancellationFlowModal/Step1Reason.tsx` | **modify** — restyle via primitives + best-effort greeting. |
| `src/components/modals/CancellationFlowModal/Step2Offer.tsx` | **modify** — restyle 5 cards via primitives, "Tailored for you" eyebrow, route accept→saveSuccess. |
| `src/components/modals/CancellationFlowModal/Step3BonusEntries.tsx` | **modify** — restyle via primitives, route accept→saveSuccess. |
| `src/components/modals/CancellationFlowModal/Step4Confirm.tsx` | **modify** — restyle via primitives, single UrgencyStrip. |
| `src/components/modals/CancellationFlowModal/index.tsx` | **modify** — drop StepIndicator, render StepSaveSuccess on `state.saveSuccess`. |
| `src/components/modals/CancellationFlowModal/StepIndicator.tsx` | **delete**. |
| `src/app/dev/cancellation-flow/page.tsx` | **new** — preview harness, all states, no network. |
| `docs/subscription/cancellation-flow.md` | **modify** — document new UI + Save Success + removed StepIndicator. |
| `docs/dev-tooling/` | **modify** — document the preview harness. |

---

## Task 1: Shared primitives module

**Files:**
- Create: `src/components/modals/CancellationFlowModal/primitives.tsx`

- [ ] **Step 1: Create the primitives file**

```tsx
"use client";

/**
 * Shared presentational primitives for the CancellationFlowModal.
 * No business logic, no API calls — pure theme-token-driven UI used by every
 * step so all screens stay visually consistent. Brand red #ee0000 +
 * premium-gold accent; light/dark via Tailwind `dark:` variants.
 */

import React from "react";
import { X, ShieldCheck, Award, Lock } from "lucide-react";
import { cn } from "@/utils/cn";

/** Branded header + body + optional flush trust footer. No progress indicator. */
export const FlowFrame: React.FC<{
  onClose: () => void;
  children: React.ReactNode;
  trust?: boolean;
}> = ({ onClose, children, trust = true }) => (
  <div className="flex flex-col">
    <div className="flex items-center justify-between px-5 pt-4 pb-1 max-xs:px-4">
      <div className="flex items-center gap-2 text-xs font-extrabold tracking-tight text-neutral-600 dark:text-neutral-300">
        <span className="flex h-[22px] w-[22px] items-center justify-center rounded-[7px] bg-gradient-to-br from-red-600 to-red-800 text-[11px] font-black text-white shadow-[0_4px_9px_rgba(238,0,0,.35)]">
          TA
        </span>
        Tools Australia
      </div>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-neutral-100 text-neutral-400 transition-colors hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-500 dark:hover:bg-neutral-700"
      >
        <X size={14} strokeWidth={2.5} />
      </button>
    </div>
    <div className="px-5 pb-5 pt-3 max-xs:px-4">{children}</div>
    {trust && <TrustFooter />}
  </div>
);

export const TrustFooter: React.FC = () => (
  <div className="flex items-center justify-between border-t border-neutral-200 px-5 py-3 text-[10px] font-semibold uppercase tracking-wide text-neutral-400 dark:border-neutral-700 dark:text-neutral-500 max-xs:px-4">
    <span className="inline-flex items-center gap-1.5">
      <ShieldCheck size={12} /> SSL secure
    </span>
    <span className="inline-flex items-center gap-1.5">
      <Award size={12} /> NTP/16264
    </span>
    <span className="inline-flex items-center gap-1.5">
      <Lock size={12} /> Cancel anytime
    </span>
  </div>
);

export const IconChip: React.FC<{ children: React.ReactNode; tone?: "red" | "gold" }> = ({
  children,
  tone = "red",
}) => (
  <div
    className={cn(
      "flex h-[46px] w-[46px] items-center justify-center rounded-[14px]",
      tone === "red"
        ? "bg-gradient-to-b from-red-50 to-red-100 text-red-600 dark:from-red-950/40 dark:to-red-900/30 dark:text-red-400"
        : "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400"
    )}
  >
    {children}
  </div>
);

export const ValueCard: React.FC<{
  children: React.ReactNode;
  glow?: boolean;
  className?: string;
}> = ({ children, glow = false, className }) => (
  <div
    className={cn(
      "relative mt-4 rounded-[20px] border border-neutral-200 bg-gradient-to-b from-white to-neutral-50 p-[18px] shadow-[0_12px_30px_-14px_rgba(0,0,0,.18)] dark:border-neutral-700 dark:from-neutral-900 dark:to-neutral-900/60",
      glow &&
        "before:pointer-events-none before:absolute before:inset-[-1px] before:rounded-[21px] before:bg-[linear-gradient(135deg,rgba(245,182,20,.7),transparent_45%)] before:[-webkit-mask:linear-gradient(#000_0_0)_content-box,linear-gradient(#000_0_0)] before:[-webkit-mask-composite:xor] before:[mask-composite:exclude] before:p-px",
      className
    )}
  >
    {children}
  </div>
);

export const FeatureRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mt-2.5 flex items-center gap-2.5 text-[12.5px] leading-tight text-neutral-700 dark:text-neutral-300">
    <span className="flex h-[21px] w-[21px] flex-shrink-0 items-center justify-center rounded-[7px] bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
    <span>{children}</span>
  </div>
);

export const PrimaryCta: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement>
> = ({ children, className, ...rest }) => (
  <button
    type="button"
    {...rest}
    className={cn(
      "relative w-full overflow-hidden rounded-[15px] bg-gradient-to-b from-red-600 to-red-800 px-4 py-4 text-[14.5px] font-extrabold tracking-tight text-white",
      "shadow-[0_12px_26px_-8px_rgba(238,0,0,.5),inset_0_1px_0_rgba(255,255,255,.25)]",
      "transition-all duration-150 hover:[&:not(:disabled)]:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60",
      "motion-safe:after:absolute motion-safe:after:inset-y-0 motion-safe:after:-left-3/5 motion-safe:after:w-2/5 motion-safe:after:-skew-x-12 motion-safe:after:bg-[linear-gradient(100deg,transparent,rgba(255,255,255,.35),transparent)]",
      className
    )}
  >
    {children}
  </button>
);

export const TextDecline: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement>
> = ({ children, className, ...rest }) => (
  <button
    type="button"
    {...rest}
    className={cn(
      "mt-3 block w-full text-center text-[12.5px] font-semibold text-neutral-500 underline underline-offset-[3px] transition-colors hover:text-neutral-700 disabled:opacity-60 dark:text-neutral-400 dark:hover:text-neutral-200",
      className
    )}
  >
    {children}
  </button>
);

/** The single tasteful gold persuasion strip (confirm + bonus-rung loss line). */
export const UrgencyStrip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mt-3.5 flex items-center gap-2.5 rounded-[11px] border border-amber-200 bg-gradient-to-b from-amber-50 to-amber-100/60 px-3.5 py-3 dark:border-amber-900/50 dark:from-amber-950/30 dark:to-amber-950/10">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#f5b614" stroke="#f5b614" className="flex-shrink-0">
      <path d="m12 2 2.4 7.4H22l-6 4.3 2.3 7.3-6.3-4.6L5.7 21 8 13.7 2 9.4h7.6z" />
    </svg>
    <span className="text-[11px] font-semibold leading-snug text-amber-800 dark:text-amber-300">
      {children}
    </span>
  </div>
);

export const Headline: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="mt-3.5 text-[23px] font-extrabold leading-[1.28] tracking-[-0.025em] text-neutral-900 dark:text-white">
    {children}
  </h2>
);

export const SubCopy: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mt-2 text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-400">
    {children}
  </p>
);

export const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mt-1 text-[10.5px] font-extrabold uppercase tracking-[0.13em] text-red-600 dark:text-red-400">
    {children}
  </div>
);
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: PASS (no errors). The file is unused so far but must compile.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: PASS for the new file.

- [ ] **Step 4: Commit** (gated — see commit policy header)

```bash
git add src/components/modals/CancellationFlowModal/primitives.tsx
git commit -m "feat(subscription): shared primitives for cancellation flow redesign"
```

---

## Task 2: FlowState + `applySaveSuccess` pure helper (TDD)

**Files:**
- Modify: `src/components/modals/CancellationFlowModal/types.ts`
- Modify: `src/components/modals/CancellationFlowModal/useCancellationFlow.ts`
- Test: `src/components/modals/CancellationFlowModal/__tests__/useCancellationFlow.test.ts`

- [ ] **Step 1: Add the failing test**

Append to `__tests__/useCancellationFlow.test.ts` BEFORE the `function run()` block:

```ts
import { applySaveSuccess } from "../useCancellationFlow";
import type { FlowState } from "../types";

function baseState(): FlowState {
  return {
    step: 2,
    reason: "too_expensive",
    reasonText: "",
    eventId: "evt_1",
    offersShown: ["discount_50_2mo", "bonus_entries_100"],
    offerCursor: 0,
    pastDue: false,
    saveSuccess: false,
    acceptedOffer: null,
    acceptResult: null,
  };
}

function testApplySaveSuccessDiscount() {
  const next = applySaveSuccess(baseState(), "discount_50_2mo", {
    ok: true,
    couponId: "retention-50off-2mo",
  });
  assert.equal(next.saveSuccess, true);
  assert.equal(next.acceptedOffer, "discount_50_2mo");
  assert.deepStrictEqual(next.acceptResult, { ok: true, couponId: "retention-50off-2mo" });
  // does not mutate the rest of the flow state
  assert.equal(next.step, 2);
  assert.equal(next.eventId, "evt_1");
}

function testApplySaveSuccessNoResult() {
  const next = applySaveSuccess(baseState(), "unsubscribe_marketing", null);
  assert.equal(next.saveSuccess, true);
  assert.equal(next.acceptedOffer, "unsubscribe_marketing");
  assert.equal(next.acceptResult, null);
}

function testApplySaveSuccessPure() {
  const s = baseState();
  applySaveSuccess(s, "pause_30d", { ok: true, resumesAt: "2026-06-17T00:00:00.000Z" });
  // original untouched (pure — returns a new object)
  assert.equal(s.saveSuccess, false);
  assert.equal(s.acceptedOffer, null);
}
```

Add these three calls inside `function run()` (before the `console.log`):

```ts
  testApplySaveSuccessDiscount();
  testApplySaveSuccessNoResult();
  testApplySaveSuccessPure();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:cancellation-flow-hook`
Expected: FAIL — `applySaveSuccess` is not exported / `FlowState` missing `saveSuccess` (TS/runtime error).

- [ ] **Step 3: Extend `FlowState` and add the `AcceptResult` type**

In `types.ts`, replace the `FlowState` interface body's closing and add the type. Add this import-free type and the three fields:

```ts
/** Mirror of the useAcceptOffer response (kept local — no hook import). */
export interface AcceptResult {
  ok: boolean;
  resumesAt?: string;
  couponId?: string;
}
```

Add to `FlowState` (after `pastDue: boolean;`):

```ts
  /** Terminal flag: an offer was accepted — renderer shows StepSaveSuccess. */
  saveSuccess: boolean;
  /** Which offer was accepted (drives the success-screen copy). */
  acceptedOffer: OfferType | null;
  /** The accept response payload (couponId / resumesAt) — may be null. */
  acceptResult: AcceptResult | null;
```

- [ ] **Step 4: Add fields to INITIAL_STATE and the pure helper + hook method**

In `useCancellationFlow.ts`:

Add to `INITIAL_STATE` (after `pastDue: false,`):

```ts
  saveSuccess: false,
  acceptedOffer: null,
  acceptResult: null,
```

Add this pure function after `nextOfferState` (and update the `import type` line to also import `AcceptResult`):

```ts
import type { FlowState, AcceptResult } from "./types";

/**
 * Pure: produce the terminal save-success slice. The renderer checks
 * `saveSuccess` FIRST (orthogonal to `step` — the step union is NOT widened).
 */
export function applySaveSuccess(
  state: FlowState,
  offer: OfferType,
  result: AcceptResult | null
): FlowState {
  return { ...state, saveSuccess: true, acceptedOffer: offer, acceptResult: result };
}
```

Add a hook action inside `useCancellationFlow` (after `requestExit`):

```ts
  const markSaved = (offer: OfferType, result: AcceptResult | null) => {
    setState((s) => applySaveSuccess(s, offer, result));
  };
```

And add `markSaved` to the returned object.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:cancellation-flow-hook`
Expected: PASS — ends with the existing `PASS useCancellationFlow step-machine …` line and no assertion errors.

- [ ] **Step 6: Type-check**

Run: `npm run type-check`
Expected: PASS.

- [ ] **Step 7: Commit** (gated)

```bash
git add src/components/modals/CancellationFlowModal/types.ts src/components/modals/CancellationFlowModal/useCancellationFlow.ts src/components/modals/CancellationFlowModal/__tests__/useCancellationFlow.test.ts
git commit -m "feat(subscription): saveSuccess flow-state + applySaveSuccess pure helper"
```

---

## Task 3: StepSaveSuccess screen

**Files:**
- Create: `src/components/modals/CancellationFlowModal/StepSaveSuccess.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

/**
 * StepSaveSuccess — post-accept confirmation. Shown (instead of the modal
 * silently closing) after discount_50_2mo / pause_30d / unsubscribe_marketing /
 * bonus_entries_100 is accepted. tier_downgrade does NOT use this (it exits to
 * the parent downgrade modal). Pure presentation; CTA calls onDone() which is
 * the existing parent onSaved().
 */

import React from "react";
import { Check } from "lucide-react";
import { FlowFrame, ValueCard, FeatureRow, PrimaryCta, Headline } from "./primitives";
import type { OfferType } from "@/models/CancellationFlowEvent";
import type { AcceptResult } from "./types";

interface Props {
  offer: OfferType;
  result: AcceptResult | null;
  firstName?: string;
  onClose: () => void;
  onDone: () => void;
}

function lines(offer: OfferType, result: AcceptResult | null): string[] {
  switch (offer) {
    case "discount_50_2mo":
      return [
        "50% off applied for your next 2 months",
        "Every accumulated entry stays locked in",
        "Same shot at the major draw — nothing changed",
      ];
    case "pause_30d": {
      const when = result?.resumesAt
        ? new Date(result.resumesAt).toLocaleDateString()
        : null;
      return [
        when ? `Paused — billing resumes ${when}` : "Paused for 30 days — no charges",
        "Entries frozen, not lost",
        "Auto-resumes after the pause",
      ];
    }
    case "unsubscribe_marketing":
      return [
        "Marketing email + SMS switched off",
        "Receipts, renewals & draw results still arrive",
        "Every entry keeps building",
      ];
    case "bonus_entries_100":
      return [
        "+100 bonus entries added to the major draw",
        "All your existing entries stay locked in",
        "You're still in for the $10,000 cash draw",
      ];
    default:
      return ["Your membership is staying active."];
  }
}

const StepSaveSuccess: React.FC<Props> = ({ offer, result, firstName, onClose, onDone }) => (
  <FlowFrame onClose={onClose} trust={false}>
    <div className="flex flex-col items-center pt-6 text-center">
      <span className="flex h-[84px] w-[84px] items-center justify-center rounded-full bg-emerald-50 shadow-[0_0_0_10px_rgba(16,163,74,.07),0_0_0_22px_rgba(16,163,74,.04)] dark:bg-emerald-950/40">
        <span className="flex h-[50px] w-[50px] items-center justify-center rounded-full bg-emerald-600 text-white motion-safe:animate-[scaleIn_.35s_ease-out]">
          <Check size={26} strokeWidth={3} />
        </span>
      </span>
      <Headline>{firstName ? `You're all set, ${firstName}.` : "You're all set."}</Headline>
    </div>
    <ValueCard className="text-left">
      {lines(offer, result).map((l) => (
        <FeatureRow key={l}>{l}</FeatureRow>
      ))}
    </ValueCard>
    <PrimaryCta className="mt-[18px]" onClick={onDone}>
      Back to my account
    </PrimaryCta>
  </FlowFrame>
);

export default StepSaveSuccess;
```

- [ ] **Step 2: Add the `scaleIn` keyframe (if absent)**

Check `src/app/globals.css` for an existing `@keyframes scaleIn`. Run: `npm run lint` is not enough — grep first:

Run: `grep -n "scaleIn" src/app/globals.css`
Expected: if no output, append to `globals.css`:

```css
@keyframes scaleIn { from { transform: scale(.6); opacity: 0 } to { transform: scale(1); opacity: 1 } }
```

(If `scaleIn` already exists, do nothing — do not duplicate.)

- [ ] **Step 3: Type-check + lint**

Run: `npm run type-check`
Expected: PASS.
Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit** (gated)

```bash
git add src/components/modals/CancellationFlowModal/StepSaveSuccess.tsx src/app/globals.css
git commit -m "feat(subscription): Save Success screen for cancellation flow"
```

---

## Task 4: Wire StepSaveSuccess into index.tsx + delete StepIndicator

**Files:**
- Modify: `src/components/modals/CancellationFlowModal/index.tsx`
- Delete: `src/components/modals/CancellationFlowModal/StepIndicator.tsx`

- [ ] **Step 1: Replace index.tsx render wiring**

In `index.tsx`: remove the `StepIndicator` import and its `<StepIndicator state={state} />` usage and the `<ModalHeader>` (the new `FlowFrame` inside each step now owns the header). Replace the body so `StepSaveSuccess` wins when `state.saveSuccess` is true. Concretely:

- Remove imports: `ModalHeader`, `StepIndicator`, and the `getStepTitle` function.
- Add import: `import StepSaveSuccess from "./StepSaveSuccess";`
- Destructure `markSaved` from `flowHook`.
- Replace the `return (...)` body with:

```tsx
  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={handleHeaderClose}
      size="md"
      presentation={isNarrowViewport ? "sheet" : "dialog"}
      mobileFullBleed
      closeOnBackdrop={false}
      zIndex={80}
    >
      <ModalContent padding="none">
        {state.saveSuccess && state.acceptedOffer ? (
          <StepSaveSuccess
            offer={state.acceptedOffer}
            result={state.acceptResult}
            onClose={onClose}
            onDone={onSaved}
          />
        ) : (
          renderStep()
        )}
      </ModalContent>
    </ModalContainer>
  );
```

- In `renderStep()`, each step component now renders its own `FlowFrame` (header). Pass `onClose={handleHeaderClose}` down to each step (added in Tasks 5–8). Keep the existing `handleHeaderClose` logic but add a first guard: `if (state.saveSuccess) { onClose(); return; }`.

- [ ] **Step 2: Delete StepIndicator**

```bash
git rm src/components/modals/CancellationFlowModal/StepIndicator.tsx
```

(If commits are not authorized, use `rm` and stage later.)

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: FAIL until Tasks 5–8 add `onClose` prop + `FlowFrame` to each step. This is expected mid-refactor — proceed; the final type-check gate is Task 11. Note the errors are confined to the step components' props.

- [ ] **Step 4: Commit** (gated)

```bash
git add src/components/modals/CancellationFlowModal/index.tsx
git commit -m "refactor(subscription): route saveSuccess, drop StepIndicator + ModalHeader"
```

---

## Task 5: Restyle Step1Reason (primitives + greeting)

**Files:**
- Modify: `src/components/modals/CancellationFlowModal/Step1Reason.tsx`

- [ ] **Step 1: Find the first-name source**

Run: `grep -rn "useUser\|UserContext" src/contexts/UserContext.tsx | head -20`
Expected: identify the hook (e.g. `useUser`) and the user object's name field (e.g. `user?.firstName` or `user?.name`). Use whichever first-name-ish field exists; if only a full `name` exists, take the first token. **Best-effort only** — never block on it.

- [ ] **Step 2: Rewrite Step1Reason using primitives**

Replace the component's returned JSX. Keep ALL existing logic (`selectReason`, `setReasonText`, `applyStart`, `handleContinue`, `otherTextMissing`, `canContinue`, `isPending`, `REASON_OPTIONS`). Add a `onClose: () => void` prop to `Step1ReasonProps`. New return:

```tsx
  return (
    <FlowFrame onClose={onClose}>
      <IconChip>
        <MessageCircle size={22} strokeWidth={2} />
      </IconChip>
      <Headline>
        {firstName ? `Before you go, ${firstName} —` : "Before you go —"}
        <br />
        what's making you leave?
      </Headline>
      <SubCopy>No hard sell. Tell us honestly and we&apos;ll see if there&apos;s a better fit than cancelling.</SubCopy>

      <fieldset className="mt-4 flex flex-col gap-2" aria-label="Cancellation reason">
        <legend className="sr-only">Why are you cancelling?</legend>
        {REASON_OPTIONS.map((option) => {
          const isSelected = state.reason === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-[14px] border-[1.5px] px-4 py-3 text-[13px] font-semibold transition-all duration-150",
                isSelected
                  ? "border-red-500 bg-gradient-to-b from-red-50 to-red-100/60 text-red-700 shadow-[0_6px_16px_-10px_rgba(238,0,0,.45)] dark:border-red-700 dark:from-red-950/40 dark:to-red-950/10 dark:text-red-300"
                  : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-neutral-600"
              )}
            >
              <input
                type="radio"
                name="cancellation-reason"
                value={option.value}
                checked={isSelected}
                onChange={() => handleReasonChange(option.value)}
                className="h-4 w-4 shrink-0 accent-red-600"
              />
              {option.label}
            </label>
          );
        })}
      </fieldset>

      {isOther && (
        <div className="mt-3 flex flex-col gap-1.5">
          <label htmlFor="cancellation-reason-text" className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
            Tell us more <span className="font-semibold text-red-600 dark:text-red-400">(required)</span>
          </label>
          <textarea
            id="cancellation-reason-text"
            value={localText}
            onChange={handleTextChange}
            maxLength={2000}
            rows={3}
            required
            aria-required="true"
            aria-invalid={otherTextMissing}
            placeholder="Please tell us why so we can improve…"
            className={cn(
              "w-full resize-none rounded-[14px] border bg-white px-3 py-2.5 text-sm text-neutral-800 transition-colors placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-red-500/40 dark:bg-neutral-900 dark:text-neutral-200",
              otherTextMissing ? "border-red-300 dark:border-red-800" : "border-neutral-200 dark:border-neutral-700"
            )}
          />
          <div className="flex items-center justify-between">
            <p className="text-2xs text-red-600 dark:text-red-400">{otherTextMissing ? "This is required to continue." : " "}</p>
            <p className="text-right text-2xs text-neutral-400 dark:text-neutral-500">{localText.length}/2000</p>
          </div>
        </div>
      )}

      {startMutation.isError && (
        <p className="mt-3 text-xs text-red-600 dark:text-red-400" role="alert">
          {startMutation.error instanceof Error ? startMutation.error.message : "Something went wrong. Please try again."}
        </p>
      )}

      <PrimaryCta className="mt-[18px]" onClick={() => void handleContinue()} disabled={!canContinue || isPending}>
        {isPending ? "Loading…" : "Continue"}
      </PrimaryCta>
    </FlowFrame>
  );
```

Update imports at top: add `import { FlowFrame, IconChip, Headline, SubCopy, PrimaryCta } from "./primitives";` and `import { MessageCircle } from "lucide-react";`. Read `firstName` best-effort from the user context found in Step 1 (wrap in a try/optional-chain; default `undefined`). Thread `onClose` from `index.tsx` `renderStep()` (pass `onClose={handleHeaderClose}`).

- [ ] **Step 3: Type-check + lint**

Run: `npm run type-check`
Expected: PASS for Step1Reason (other steps may still error until Tasks 6–8).
Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit** (gated)

```bash
git add src/components/modals/CancellationFlowModal/Step1Reason.tsx src/components/modals/CancellationFlowModal/index.tsx
git commit -m "feat(subscription): restyle Step1Reason via primitives + greeting"
```

---

## Task 6: Restyle Step2Offer (5 cards, eyebrow, accept→saveSuccess)

**Files:**
- Modify: `src/components/modals/CancellationFlowModal/Step2Offer.tsx`

- [ ] **Step 1: Update props + thread `markSaved` and `onClose`**

`Step2OfferProps`: add `onClose: () => void;` and `onAcceptedOffer: (offer: OfferType, result: AcceptResult | null) => void;`. In `index.tsx` `renderStep()` pass `onClose={handleHeaderClose}` and `onAcceptedOffer={(o, r) => flowHook.markSaved(o, r)}`. Remove the `onSaved` call from the pause/discount/unsubscribe cards' success path — replace `onSaved()` with `onAcceptedOffer("pause_30d", result)` etc. (the success screen's CTA will call the real `onSaved`). Keep the 409/404 graceful `onDecline()` path exactly as is. Keep `onSaved` prop for bonus card delegation to Step3BonusEntries.

For each of `PauseOfferCard` / `DiscountOfferCard` / `UnsubscribeOfferCard`, change the accept handler success branch from:

```ts
await acceptOfferMutation.mutateAsync({ eventId: state.eventId, offer: "pause_30d" });
onSaved();
```

to:

```ts
const result = await acceptOfferMutation.mutateAsync({ eventId: state.eventId, offer: "pause_30d" });
onAcceptedOffer("pause_30d", result);
```

(substitute the correct offer literal per card; `result` is the `AcceptOfferResponse`).

- [ ] **Step 2: Restyle each card with primitives**

Replace each card's JSX wrapper with the primitive grammar. Concrete reference — the **DiscountOfferCard** body (apply the same structure to the others with their own copy/icon, listed after):

```tsx
  return (
    <FlowFrame onClose={onClose}>
      <Eyebrow>Tailored for you · {offerLabel}</Eyebrow>
      <Headline>Keep everything —<br />at half the price.</Headline>
      <SubCopy>
        You said price is the issue, so here&apos;s the strongest thing we can do:{" "}
        <strong className="text-neutral-900 dark:text-white">50% off your next 2 months</strong>. Nothing else changes.
      </SubCopy>
      <ValueCard glow>
        <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-neutral-400">Your new price · 2 months</div>
        <div className="mt-1.5 flex items-center">
          <div className="text-[30px] font-black tracking-[-0.03em] text-neutral-900 dark:text-white">
            50% off<span className="ml-2 text-[15px] font-bold text-neutral-400 line-through">full price</span>
          </div>
          <span className="ml-auto rounded-full bg-gradient-to-br from-amber-300 to-amber-400 px-2.5 py-1 text-[10.5px] font-black text-amber-900 shadow-[0_4px_10px_rgba(245,158,11,.35)]">
            SAVE 50%
          </span>
        </div>
        <div className="mt-3.5 border-t border-dashed border-neutral-200 pt-3 dark:border-neutral-700">
          <FeatureRow>Every accumulated entry stays locked in</FeatureRow>
          <FeatureRow>Same shot at the major draw &amp; $10k cash</FeatureRow>
          <FeatureRow>Cancel anytime — zero lock-in</FeatureRow>
        </div>
      </ValueCard>
      <PrimaryCta className="mt-[17px]" onClick={() => void handleAccept()} disabled={isProcessing}>
        {isProcessing ? "Applying…" : "Keep me at 50% off"}
      </PrimaryCta>
      <TextDecline onClick={onDecline} disabled={isProcessing}>
        That&apos;s okay, show me other options
      </TextDecline>
    </FlowFrame>
  );
```

`offerLabel` is computed from cursor position: `` `Offer ${state.offerCursor + 1} of ${state.offersShown.length}` ``.

**Desktop two-column layout (required for `discount_50_2mo`, `pause_30d`, `unsubscribe_marketing`, `tier_downgrade`):** wrap the offer content inside `FlowFrame` so that on `lg` and up the message+CTA sit in column 1 and the `ValueCard` in column 2; single column below `lg`. Concretely, structure each of those four cards' `FlowFrame` body as:

```tsx
<div className="lg:grid lg:grid-cols-2 lg:items-center lg:gap-6">
  <div>
    <Eyebrow>…</Eyebrow>
    <Headline>…</Headline>
    <SubCopy>…</SubCopy>
    <div className="hidden lg:block">
      <PrimaryCta …>…</PrimaryCta>
      <TextDecline …>…</TextDecline>
    </div>
  </div>
  <div>
    <ValueCard …>…</ValueCard>
    <div className="lg:hidden">
      <PrimaryCta …>…</PrimaryCta>
      <TextDecline …>…</TextDecline>
    </div>
  </div>
</div>
```

The CTA/decline appears once per breakpoint (`hidden lg:block` vs `lg:hidden`) so it reads naturally in both layouts. `bonus_entries_100` (delegated to Step3BonusEntries) stays single-column.

Apply the SAME `FlowFrame`/`Eyebrow`/`Headline`/`SubCopy`/`ValueCard`/`PrimaryCta`/`TextDecline` structure to the other cards with this copy/icon (do not abbreviate — write each card out fully in the file):

- **PauseOfferCard** — Headline: `Need a break,<br />not a breakup?` · SubCopy: pause 30 days, no payments, entries stay. ValueCard FeatureRows: `30 days off — no charge`, `Entries frozen, not lost`, `Auto-resumes after the pause`. CTA: `Pause my membership` / processing `Pausing…`.
- **UnsubscribeOfferCard** — Headline: `Too much<br />noise?` · SubCopy: switch off marketing email + SMS only; account messages unaffected. ValueCard FeatureRows: `Marketing email + SMS switched off`, `Receipts, renewals & draw results still arrive`, `Every entry keeps building`. CTA: `Send me fewer messages` / `Updating…`.
- **TierDowngradeCard** — Headline: `Want something<br />lighter?` · SubCopy: switch to a cheaper plan, keep every entry. ValueCard FeatureRows: `Every entry carries over`, `Pay less each month`, `Cancel anytime`. CTA: `Switch to a cheaper plan` → `onRequestTierDowngrade?.(state.eventId)` (UNCHANGED — no `onAcceptedOffer`, this exits to the parent downgrade modal). TextDecline: `No thanks, show me other options`.
- **bonus_entries_100 case** — unchanged delegation: render `<Step3BonusEntries .../>` (restyled in Task 7). Keep the `tierDowngradeAvailable === false` fallback to `<Step3BonusEntries/>`.

Keep the exhaustive `switch` + `never` default exactly as-is. Update imports: `import { FlowFrame, Eyebrow, Headline, SubCopy, ValueCard, FeatureRow, PrimaryCta, TextDecline } from "./primitives";` Remove now-unused `InfoGrid, UrgencyBanner, TrustBar` imports and any unused `lucide-react` icons (per `docs/UNUSED-VARS-CONVENTIONS.md` — delete, don't `_`-prefix).

- [ ] **Step 3: Type-check + lint**

Run: `npm run type-check`
Expected: PASS for Step2Offer.
Run: `npm run lint`
Expected: PASS (no unused imports).

- [ ] **Step 4: Commit** (gated)

```bash
git add src/components/modals/CancellationFlowModal/Step2Offer.tsx src/components/modals/CancellationFlowModal/index.tsx
git commit -m "feat(subscription): restyle Step2Offer cards + tailored eyebrow + accept→saveSuccess"
```

---

## Task 7: Restyle Step3BonusEntries (primitives + accept→saveSuccess)

**Files:**
- Modify: `src/components/modals/CancellationFlowModal/Step3BonusEntries.tsx`

- [ ] **Step 1: Update props**

Add `onClose: () => void;` and `onAcceptedOffer: (offer: OfferType, result: null) => void;` to `Step3BonusEntriesProps`. In `Step2Offer.tsx`, every `<Step3BonusEntries .../>` usage passes `onClose` and `onAcceptedOffer`. Keep the existing `outcomeMutation.mutate({ outcome:"saved", offerAccepted:"bonus_entries_100" })` fire-and-forget call (server-side dedupe handles it). After the redeem POST succeeds and the reward toast fires, replace the final `onSaved()` with `onAcceptedOffer("bonus_entries_100", null)`.

- [ ] **Step 2: Restyle JSX with primitives**

Replace returned JSX (keep ALL accept logic — redeem POST, `useEntryRewardToast`, loading, error toast):

```tsx
  return (
    <FlowFrame onClose={onClose}>
      <IconChip>
        <Gift size={22} strokeWidth={2} />
      </IconChip>
      <Headline>One more reason<br />to stay.</Headline>
      <SubCopy>
        Stay active today and we&apos;ll drop{" "}
        <strong className="text-neutral-900 dark:text-white">+{BONUS_ENTRIES} bonus entries</strong>{" "}
        into your major draw count. No extra cost.
      </SubCopy>
      <ValueCard className="flex items-center gap-3">
        <div className="text-[34px] font-black tracking-[-0.03em] text-red-600 dark:text-red-400">+{BONUS_ENTRIES}</div>
        <div className="text-xs leading-snug text-neutral-600 dark:text-neutral-400">
          bonus entries added instantly to the next major draw
        </div>
      </ValueCard>
      <UrgencyStrip>Someone&apos;s name gets called next draw — it could just as easily be yours.</UrgencyStrip>
      <PrimaryCta className="mt-[17px]" onClick={() => void handleAccept()} disabled={isProcessing}>
        {isProcessing ? "Adding bonus entries…" : "Keep me in the draw"}
      </PrimaryCta>
      <TextDecline onClick={onDecline} disabled={isProcessing}>
        No thanks, cancel anyway
      </TextDecline>
      {outcomeMutation.isError && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
          {outcomeMutation.error instanceof Error ? outcomeMutation.error.message : "Failed to record outcome. Please try again."}
        </p>
      )}
    </FlowFrame>
  );
```

Update imports: `import { FlowFrame, IconChip, Headline, SubCopy, ValueCard, FeatureRow, UrgencyStrip, PrimaryCta, TextDecline } from "./primitives";` add `import { Gift } from "lucide-react";`, remove unused `InfoGrid, UrgencyBanner, TrustBar` and now-unused icons.

- [ ] **Step 3: Type-check + lint**

Run: `npm run type-check`
Expected: PASS.
Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit** (gated)

```bash
git add src/components/modals/CancellationFlowModal/Step3BonusEntries.tsx src/components/modals/CancellationFlowModal/Step2Offer.tsx
git commit -m "feat(subscription): restyle Step3BonusEntries via primitives"
```

---

## Task 8: Restyle Step4Confirm (primitives, single UrgencyStrip)

**Files:**
- Modify: `src/components/modals/CancellationFlowModal/Step4Confirm.tsx`

- [ ] **Step 1: Update props + keep logic**

Add `onClose: () => void;` to `Step4ConfirmProps`; pass it from `index.tsx`. Keep ALL logic (`handleCancelAnyway` incl. the cancel-subscription POST + toast variants + `outcomeMutation.mutate({outcome:"cancelled"})`, `handleResolvePayment`, `state.pastDue` branch).

- [ ] **Step 2: Restyle the normal variant**

Replace the non-past-due return:

```tsx
  return (
    <FlowFrame onClose={onClose} trust={false}>
      <Headline>Sure you want<br />to cancel?</Headline>
      <SubCopy>No more offers — just so you know what cancelling means:</SubCopy>
      <div className="mt-4 flex flex-col gap-2.5">
        <div className="flex items-center gap-3 rounded-[13px] border border-neutral-200 bg-neutral-50 px-3.5 py-3 dark:border-neutral-700 dark:bg-neutral-900">
          <span className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"><Ticket size={13} /></span>
          <div><div className="text-[12.5px] font-bold text-neutral-900 dark:text-white">Accumulated entries</div><div className="text-[11px] text-neutral-400">Permanently lost on cancel</div></div>
        </div>
        <div className="flex items-center gap-3 rounded-[13px] border border-neutral-200 bg-neutral-50 px-3.5 py-3 dark:border-neutral-700 dark:bg-neutral-900">
          <span className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"><Trophy size={13} /></span>
          <div><div className="text-[12.5px] font-bold text-neutral-900 dark:text-white">Your major draw spot</div><div className="text-[11px] text-neutral-400">Or $10,000 cash — gone</div></div>
        </div>
      </div>
      <UrgencyStrip>Someone&apos;s name gets called next draw. It could just as easily be yours.</UrgencyStrip>
      <PrimaryCta className="mt-3.5" onClick={modalProps.onClose} disabled={isCancelling}>Keep my membership</PrimaryCta>
      <TextDecline onClick={() => void handleCancelAnyway()} disabled={isCancelling}>
        {isCancelling ? "Cancelling…" : "No thanks, cancel anyway"}
      </TextDecline>
      {outcomeMutation.isError && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
          {outcomeMutation.error instanceof Error ? outcomeMutation.error.message : "Failed to record outcome. Please try again."}
        </p>
      )}
    </FlowFrame>
  );
```

- [ ] **Step 3: Restyle the past-due variant**

Replace the `if (state.pastDue) { return (...) }` JSX:

```tsx
    return (
      <FlowFrame onClose={onClose}>
        <IconChip tone="gold"><CreditCard size={22} strokeWidth={2} /></IconChip>
        <Headline>Payment needs<br />attention</Headline>
        <SubCopy>Your subscription has a payment issue. Resolve it to keep your membership active and your entries safe.</SubCopy>
        <ValueCard className="border-amber-200 from-amber-50 to-amber-100/40 dark:border-amber-900/50 dark:from-amber-950/30">
          <FeatureRow>Entries are on hold — settle up to keep them</FeatureRow>
          <FeatureRow>Cancelling now permanently forfeits accumulated entries</FeatureRow>
        </ValueCard>
        <PrimaryCta className="mt-[17px]" onClick={handleResolvePayment} disabled={isCancelling}>Resolve payment</PrimaryCta>
        <TextDecline onClick={() => void handleCancelAnyway()} disabled={isCancelling}>
          {isCancelling ? "Cancelling…" : "No thanks, cancel anyway"}
        </TextDecline>
      </FlowFrame>
    );
```

Update imports: `import { FlowFrame, IconChip, Headline, SubCopy, ValueCard, FeatureRow, UrgencyStrip, PrimaryCta, TextDecline } from "./primitives";` keep `Ticket, Trophy, CreditCard` from lucide; remove unused `InfoGrid/UrgencyBanner/TrustBar/Calendar/ShieldCheck/Award/Lock/LogOut`.

- [ ] **Step 4: Type-check + lint**

Run: `npm run type-check`
Expected: PASS (all step components now compile).
Run: `npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit** (gated)

```bash
git add src/components/modals/CancellationFlowModal/Step4Confirm.tsx src/components/modals/CancellationFlowModal/index.tsx
git commit -m "feat(subscription): restyle Step4Confirm via primitives + single urgency strip"
```

---

## Task 9: Dev preview harness

**Files:**
- Create: `src/app/dev/cancellation-flow/page.tsx`

- [ ] **Step 1: Inspect a sibling dev page for the access guard**

Run: `ls src/app/dev` then open one sibling `page.tsx`.
Run: `grep -rn "NODE_ENV\|notFound\|isDev" src/app/dev/*/page.tsx | head`
Expected: identify the guard pattern siblings use (e.g. `if (process.env.NODE_ENV === "production") notFound();`). Use the **identical** guard. If siblings have NO guard, add none (match convention — do not invent one).

- [ ] **Step 2: Create the harness page**

```tsx
"use client";

/**
 * /dev/cancellation-flow — preview harness. Mounts the REAL cancellation-flow
 * components in every state with mock handlers. No network, no Stripe, no
 * outcome recording. Design/colour/motion tuning happens here.
 */

import React, { useState } from "react";
import type { OfferType, CancellationReason } from "@/models/CancellationFlowEvent";
import type { FlowState } from "@/components/modals/CancellationFlowModal/types";
import Step1Reason from "@/components/modals/CancellationFlowModal/Step1Reason";
import Step2Offer from "@/components/modals/CancellationFlowModal/Step2Offer";
import Step4Confirm from "@/components/modals/CancellationFlowModal/Step4Confirm";
import StepSaveSuccess from "@/components/modals/CancellationFlowModal/StepSaveSuccess";
import { useCancellationFlow } from "@/components/modals/CancellationFlowModal/useCancellationFlow";

// Mock mutation shaped like TanStack useMutation result (only the fields the
// components read). mutateAsync resolves instantly; no network.
const mockMutation = (resolved: unknown = { ok: true }) =>
  ({
    mutate: () => {},
    mutateAsync: async () => resolved,
    isPending: false,
    isError: false,
    error: null,
    reset: () => {},
  }) as never;

function baseState(over: Partial<FlowState>): FlowState {
  return {
    step: 2, reason: "too_expensive", reasonText: "", eventId: "evt_demo",
    offersShown: ["discount_50_2mo", "bonus_entries_100"], offerCursor: 0,
    pastDue: false, saveSuccess: false, acceptedOffer: null, acceptResult: null,
    ...over,
  };
}

const Panel: React.FC<{ label: string; w: number; dark: boolean; children: React.ReactNode }> = ({ label, w, dark, children }) => (
  <div style={{ margin: "0 0 32px" }}>
    <div style={{ font: "700 12px sans-serif", textTransform: "uppercase", letterSpacing: ".08em", color: "#888", marginBottom: 8 }}>{label}</div>
    <div className={dark ? "dark" : ""} style={{ width: w, maxWidth: "100%", borderRadius: 20, overflow: "hidden", boxShadow: "0 10px 40px rgba(0,0,0,.18)", background: dark ? "#0f0f10" : "#fff" }}>
      {children}
    </div>
  </div>
);

export default function CancellationFlowHarness() {
  const [dark, setDark] = useState(false);
  const [w, setW] = useState(360);
  const flow = useCancellationFlow();
  const noop = () => {};

  const offers: OfferType[] = ["discount_50_2mo", "tier_downgrade", "pause_30d", "unsubscribe_marketing", "bonus_entries_100"];
  const reasons: CancellationReason[] = ["too_expensive", "prefer_cheaper", "dont_use_benefits", "too_many_messages", "joined_for_giveaway", "havent_won", "other"];

  return (
    <div style={{ padding: 24, background: dark ? "#18181b" : "#f4f4f5", minHeight: "100vh" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", gap: 12, padding: "10px 0", background: dark ? "#18181b" : "#f4f4f5" }}>
        <button onClick={() => setDark((d) => !d)}>{dark ? "☾ Dark" : "☀ Light"}</button>
        {[320, 360, 600].map((px) => (
          <button key={px} onClick={() => setW(px)} style={{ fontWeight: w === px ? 700 : 400 }}>{px === 600 ? "Desktop 600" : `Mobile ${px}`}</button>
        ))}
        <span style={{ font: "12px sans-serif", color: "#888", alignSelf: "center" }}>Reduced-motion: toggle OS setting / DevTools rendering tab</span>
      </div>

      <Panel label="Step 1 · Reason (default)" w={w} dark={dark}>
        <Step1Reason flowHook={flow} startMutation={mockMutation() } onClose={noop} />
      </Panel>

      {offers.map((o) => (
        <Panel key={o} label={`Step 2 · ${o}`} w={w} dark={dark}>
          <Step2Offer
            state={baseState({ offersShown: [o, "bonus_entries_100"], offerCursor: 0 })}
            outcomeMutation={mockMutation()}
            acceptOfferMutation={mockMutation({ ok: true, couponId: "retention-50off-2mo", resumesAt: "2026-06-17T00:00:00.000Z" })}
            onSaved={noop} onDecline={noop} onClose={noop}
            onAcceptedOffer={noop}
            onRequestTierDowngrade={noop}
            tierDowngradeAvailable
          />
        </Panel>
      ))}

      <Panel label="Step 2 · tier_downgrade (unavailable → bonus fallback)" w={w} dark={dark}>
        <Step2Offer
          state={baseState({ offersShown: ["tier_downgrade", "bonus_entries_100"], offerCursor: 0 })}
          outcomeMutation={mockMutation()} acceptOfferMutation={mockMutation()}
          onSaved={noop} onDecline={noop} onClose={noop} onAcceptedOffer={noop}
          onRequestTierDowngrade={noop} tierDowngradeAvailable={false}
        />
      </Panel>

      {(["discount_50_2mo", "pause_30d", "unsubscribe_marketing", "bonus_entries_100"] as OfferType[]).map((o) => (
        <Panel key={`s-${o}`} label={`Save Success · ${o}`} w={w} dark={dark}>
          <StepSaveSuccess offer={o} result={{ ok: true, couponId: "retention-50off-2mo", resumesAt: "2026-06-17T00:00:00.000Z" }} firstName="Sarah" onClose={noop} onDone={noop} />
        </Panel>
      ))}

      <Panel label="Step 4 · Confirm (normal)" w={w} dark={dark}>
        <Step4Confirm state={baseState({ step: 4 })} modalProps={{ onClose: noop, onCancelled: noop, onResolvePayment: noop }} outcomeMutation={mockMutation()} onClose={noop} />
      </Panel>
      <Panel label="Step 4 · Confirm (past-due)" w={w} dark={dark}>
        <Step4Confirm state={baseState({ step: 4, pastDue: true })} modalProps={{ onClose: noop, onCancelled: noop, onResolvePayment: noop }} outcomeMutation={mockMutation()} onClose={noop} />
      </Panel>

      <div style={{ font: "12px sans-serif", color: "#999" }}>Reasons available: {reasons.join(", ")} — change the Step 1 selection live; Step 2 panels above force each offer directly.</div>
    </div>
  );
}
```

> Note: `mockMutation` is cast to `never` to satisfy the components' `ReturnType<typeof useXxx>` prop types without importing TanStack internals — acceptable in a dev-only harness. If `npm run type-check` rejects the cast, change the prop usage sites to accept the minimal shape via a local `as` cast at the call site instead; do not weaken the production component prop types.

- [ ] **Step 3: Type-check + lint + build**

Run: `npm run type-check`
Expected: PASS.
Run: `npm run lint`
Expected: PASS.
Run: `npm run build`
Expected: PASS (route `/dev/cancellation-flow` compiles).

- [ ] **Step 4: Manual smoke**

Run: `npm run dev`, open `http://localhost:3000/dev/cancellation-flow`.
Expected: every panel renders; light/dark toggle works; width buttons switch layout (600 shows the desktop two-column offer); no console network calls on accept/decline.

- [ ] **Step 5: Commit** (gated)

```bash
git add src/app/dev/cancellation-flow/page.tsx
git commit -m "feat(dev-tooling): cancellation-flow preview harness"
```

---

## Task 10: Documentation

**Files:**
- Modify: `docs/subscription/cancellation-flow.md`
- Modify: `docs/dev-tooling/` (the relevant existing doc file in that folder)

- [ ] **Step 1: Update subscription doc**

In `docs/subscription/cancellation-flow.md`, under the `## CancellationFlowModal (UI)` section: (a) state the redesign — "Elevated Guided Conversational", shared `primitives.tsx`, brand red + gold, light/dark, responsive (desktop two-column offer / mobile sheet); (b) document the new **Save Success** screen (`StepSaveSuccess.tsx`) shown after `discount_50_2mo`/`pause_30d`/`unsubscribe_marketing`/`bonus_entries_100` accept, driven by the `saveSuccess`/`acceptedOffer`/`acceptResult` `FlowState` fields + `applySaveSuccess` pure helper; CTA calls the existing `onSaved`; `tier_downgrade` excluded; (c) record that `StepIndicator` and the in-modal `ModalHeader`/`upsell-shell` usage were removed (no visible progress indicator); (d) note outcome-recording invariant is unchanged (Save Success is presentational; outcomes still recorded server-side / fire-and-forget exactly as before).

- [ ] **Step 2: Update dev-tooling doc**

Run: `ls docs/dev-tooling`
Add a section documenting `/dev/cancellation-flow`: purpose (design/QA harness), that it mounts real components with mock no-network handlers, the states covered, and the toolbar controls (light/dark, viewport widths, reduced-motion via OS/DevTools).

- [ ] **Step 3: Commit** (gated)

```bash
git add docs/subscription/cancellation-flow.md docs/dev-tooling/
git commit -m "docs(subscription,dev-tooling): cancellation flow redesign + preview harness"
```

---

## Task 11: Final verification gate

- [ ] **Step 1: Full pure test**

Run: `npm run test:cancellation-flow-hook`
Expected: PASS (step-machine + new `applySaveSuccess` cases).

- [ ] **Step 2: Unaffected pure suites stay green**

Run: `npm run test:cancellation-routing` then `npm run test:cancellation-eligibility` then `npm run test:cancellation-flow-service`
Expected: all PASS (no logic changed — regression guard).

- [ ] **Step 3: Lint, type-check, build**

Run: `npm run lint`
Expected: PASS.
Run: `npm run type-check`
Expected: PASS.
Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Manual matrix via harness**

Open `/dev/cancellation-flow`. Verify, in light AND dark, at widths 320/360/600:
- Step 1: default, "Other" empty (CTA disabled), "Other" filled.
- Step 2: all 5 offers + tier-downgrade-unavailable fallback; eyebrow shows "Offer 1 of 2".
- Save Success: all 4 offers; pause shows the resume date; copy correct.
- Step 4: normal (Keep primary, single gold strip) + past-due (Resolve primary, gold chip).
- Reduced-motion (OS/DevTools): CTA shimmer + check-burst become static.

- [ ] **Step 5: Live smoke (one save, one cancel)**

With `npm run dev` and a test account: trigger the real cancellation flow from `SubscriptionManagementModal`; accept one offer → Save Success → "Back to my account" closes; reopen, cancel anyway → cancels. Confirms `onSaved`/`onCancelled` wiring intact.

- [ ] **Step 6: doc-sync**

Run: `npm run doc-sync` if such a script exists, else rely on the Stop hook.
Expected: no `BLOCKED: Stale docs` (subscription + dev-tooling docs updated in Task 10).

- [ ] **Step 7: Final commit** (gated)

```bash
git add -A
git commit -m "chore(subscription): cancellation flow redesign — final verification"
```

---

## Self-Review

**Spec coverage:**
- Elevated Guided Conversational restyle → Tasks 1, 5–8 ✓
- Shared primitives, no file bloat → Task 1 ✓
- No visible progress indicator (delete StepIndicator) → Task 4 ✓
- Save Success screen + flow-state change (orthogonal `saveSuccess` flag, pure helper, unit-tested) → Tasks 2, 3, 4 ✓
- `tier_downgrade` excluded from Save Success → Task 6 Step 2 ✓
- Reason-aware copy + "Tailored for you" eyebrow → Tasks 5, 6 ✓
- Best-effort first-name greeting (UserContext, graceful fallback) → Task 5 Steps 1–2 ✓
- Responsive: desktop dialog / mobile sheet, offer two-column on desktop → primitives + width verified Tasks 9, 11 ✓ (NOTE: the desktop two-column offer layout is realised through Tailwind `lg:` classes inside the offer cards — Task 6 cards use the primitive grammar; explicit `lg:` two-column wrapper added in Task 6 Step 2 when writing each card's `FlowFrame` body — reviewer must ensure a `lg:grid lg:grid-cols-2` wrapper is applied to the offer body. **Action: enforced in Task 6.**)
- Light/dark parity, reduced-motion gating → primitives `dark:` + `motion-safe:` Tasks 1, 3 ✓
- No new dependency (confetti via existing `useConfetti` if used; check-burst is CSS) → Task 3 uses CSS keyframe only ✓
- Dev harness `/dev/cancellation-flow`, all states, no network → Task 9 ✓
- Domain docs (subscription + dev-tooling), no manifest edit → Task 10 ✓
- Zero backend change → no API/service/route/model files touched in any task ✓

**Placeholder scan:** No TBD/TODO; every code step has full code; commands have expected output. The only conditional is the access-guard mirroring (Task 9 Step 1) and `scaleIn` keyframe existence (Task 3 Step 2) — both are explicit "grep then act" instructions, not placeholders.

**Type consistency:** `applySaveSuccess(state, offer, result)` / `markSaved(offer, result)` / `onAcceptedOffer(offer, result)` consistent across Tasks 2, 4, 6, 7. `AcceptResult` defined in Task 2 (types.ts), consumed in Tasks 3, 9. `FlowState` new fields consistent. `StepSaveSuccess` props (`offer,result,firstName?,onClose,onDone`) consistent Tasks 3, 4, 9.

**Gap fixed inline:** The desktop two-column offer layout was implied by the spec but not explicit in Task 6 — flagged above; Task 6 Step 2 must wrap the offer `FlowFrame` body in a `lg:grid lg:grid-cols-2 lg:gap-6` container (message+CTA in column 1, `ValueCard` in column 2) for the `discount_50_2mo`/`pause_30d`/`unsubscribe_marketing`/`tier_downgrade` cards. Single-column on `< lg`.
