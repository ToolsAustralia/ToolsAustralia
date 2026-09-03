# EXISTING_SUBSCRIPTION Guard Bypass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop existing members being walked into the new-subscription checkout — where the server 409s them at the payment step — by moving the "can this user start a new subscription?" decision into the modal-open chokepoint and driving it off the same predicate the server uses.

**Architecture:** One pure resolver (`resolveSubscriptionCreationGate`) wraps the server's own `hasBlockingSubscription` helper and returns allow / redirect. It is called at the modal-open chokepoint (`useMembershipModal`), which every entry point already funnels through, and again as a backstop immediately before the step-2 pre-warm to catch the user-data load race. The two drifted card-click state machines are then collapsed onto the same resolver.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript. Tests are standalone `tsx` scripts (no jest/vitest) wired to `test:*` npm scripts.

**Spec:** [docs/superpowers/specs/2026-09-01-existing-subscription-guard-bypass-design.md](../specs/2026-09-01-existing-subscription-guard-bypass-design.md) — approved 2026-09-01. Read it before starting; this plan argues from it.

**Worktree/branch:** `.worktrees/vercel-error-triage` on `feature/vercel-error-triage`.

## Global Constraints

- **No commits without explicit user authorization** (CLAUDE.md rule 1). Every task ends with a commit step — **do not run it** unless the user has said `commit` / `push` / `ship it` this session. Otherwise stop and ask.
- **Never work on `main`** (rule 1b). This plan targets `feature/vercel-error-triage`.
- **Layering:** `utils/` must not import from `services/`. The resolver is a pure util. No business logic in `app/api/**` route handlers. No `any`.
- **No new vocabulary** (global naming rule). This is the *subscription creation guard* — the server's existing term. The nudge verb is **"reactivate" / "settle"**, never **"redeem"** (taken by `src/services/redeemables/`).
- **Rule 11 (LEGAL), non-negotiable.** Entries are a **free inclusion**, never sold. No "odds"/"chance"/"lottery"/"raffle". Never price entries per unit. **Spec §4.5 option A is DECIDED:** the nudge states the membership's own price + entries only — **do not** author a pack-vs-membership comparison, and do not render the pack's price or entry count inside the note.
- **Production strips `console.log`/`info`/`debug`/`warn`** (`next.config.ts` `compiler.removeConsole`). Only `console.error` survives.
- **Every `src/**` change needs its matching `docs/<domain>/` update in the same task** (rule 2, hook-enforced). Domains touched here: `subscription`, `shared-ui`, `draws`, `infrastructure`.
- **Every new test file needs a matching `test:*` entry in `package.json`** or it is undiscoverable.
- **Verify before claiming** (rule 6). Run the command, paste the output.

---

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `src/utils/subscription/subscription-creation-gate.ts` | **Create.** The single allow/redirect decision + the `isSubscriptionPlan` predicate. Pure, client-safe, no React. | 1 |
| `src/utils/subscription/__tests__/subscription-creation-gate.test.ts` | **Create.** Fences the resolver, especially the must-not-block cases. | 1 |
| `package.json` | **Modify.** Add `test:subscription-gate`. | 1 |
| `src/hooks/useMembershipModal.ts` | **Modify.** The chokepoint — consults the resolver and redirects instead of opening. | 2 |
| `src/components/modals/MembershipModal/index.tsx` | **Modify.** Step-2 backstop + toast (Task 3); the on-hold nudge (Task 5). | 3, 5 |
| `src/components/sections/MembershipSection.tsx` | **Modify.** Replace `getPlanHierarchy`-driven bounces with the resolver. | 4 |
| `src/hooks/useMembershipCardCta.ts` | **Modify.** Same, for the /membership page. | 4 |
| `src/hooks/useMajorDrawEntryCta.ts` | **Modify.** Close the one-time-fallback hole (spec §3.6 / T6). | 4 |

---

## Task 1: The gate resolver

**Files:**
- Create: `src/utils/subscription/subscription-creation-gate.ts`
- Create: `src/utils/subscription/__tests__/subscription-creation-gate.test.ts`
- Modify: `package.json` (scripts block)
- Modify: `docs/subscription/patterns.md`, `docs/infrastructure/` (test script registry)

**Interfaces:**
- Consumes: `hasBlockingSubscription` and `BLOCKING_SUBSCRIPTION_STATUSES` from `@/utils/subscription/subscription-helpers`.
- Produces:
  - `resolveSubscriptionCreationGate(user, { isSubscriptionPlan, userLoading }) => SubscriptionCreationGateResult`
  - `isSubscriptionPlan(plan) => boolean`
  - `MANAGE_PAYMENT_PATH`, `MANAGE_SUBSCRIPTION_PATH` string constants
  - type `SubscriptionCreationGateResult`

- [ ] **Step 1: Write the failing test**

Create `src/utils/subscription/__tests__/subscription-creation-gate.test.ts`:

```ts
import assert from "node:assert/strict";

/**
 * Fences resolveSubscriptionCreationGate — the single "can this user start a NEW
 * subscription?" decision, shared by the modal-open chokepoint and both card-click
 * handlers. It wraps the SAME hasBlockingSubscription the server's
 * checkCanCreateSubscription uses, so client and server can never disagree.
 *
 * The must-NOT-block cases matter most: a false block stops a guest subscribing,
 * which is a worse regression than the bug this closes (spec §1).
 *
 * Run: npm run test:subscription-gate
 */

let failures = 0;
const test = (name: string, fn: () => void | Promise<void>) => {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`✓ ${name}`))
    .catch((e: Error) => {
      failures++;
      console.error(`✗ ${name}\n  ${e.message}`);
    });
};

async function main() {
  const {
    resolveSubscriptionCreationGate,
    isSubscriptionPlan,
    MANAGE_PAYMENT_PATH,
    MANAGE_SUBSCRIPTION_PATH,
  } = await import("@/utils/subscription/subscription-creation-gate");
  const { BLOCKING_SUBSCRIPTION_STATUSES } = await import(
    "@/utils/subscription/subscription-helpers"
  );

  const sub = { isSubscriptionPlan: true, userLoading: false };

  // --- must NOT block (the expensive regression) ---
  await test("guest / no user → allowed", () => {
    assert.equal(resolveSubscriptionCreationGate(null, sub).allowed, true);
    assert.equal(resolveSubscriptionCreationGate(undefined, sub).allowed, true);
    assert.equal(resolveSubscriptionCreationGate({}, sub).allowed, true);
  });

  await test("terminal statuses → allowed (they must be able to resubscribe)", () => {
    for (const status of ["canceled", "cancelled", "incomplete", "incomplete_expired", "expired"]) {
      assert.equal(
        resolveSubscriptionCreationGate({ subscription: { status } }, sub).allowed,
        true,
        `${status} must not be blocked`
      );
    }
  });

  await test("pack (non-subscription) → allowed for EVERY blocking status", () => {
    for (const status of BLOCKING_SUBSCRIPTION_STATUSES) {
      assert.equal(
        resolveSubscriptionCreationGate(
          { subscription: { status } },
          { isSubscriptionPlan: false, userLoading: false }
        ).allowed,
        true,
        `${status} must still be able to buy a pack`
      );
    }
  });

  await test("user data still loading → allowed even when blocking", () => {
    assert.equal(
      resolveSubscriptionCreationGate(
        { subscription: { status: "active" } },
        { isSubscriptionPlan: true, userLoading: true }
      ).allowed,
      true
    );
  });

  // --- must block ---
  await test("every BLOCKING_SUBSCRIPTION_STATUSES value blocks a subscription open", () => {
    for (const status of BLOCKING_SUBSCRIPTION_STATUSES) {
      const r = resolveSubscriptionCreationGate({ subscription: { status } }, sub);
      assert.equal(r.allowed, false, `${status} must block`);
    }
  });

  await test("past_due routes to the payment sheet, other blocking to the plan sheet", () => {
    const pastDue = resolveSubscriptionCreationGate({ subscription: { status: "past_due" } }, sub);
    assert.equal(pastDue.allowed, false);
    if (pastDue.allowed === false) {
      assert.equal(pastDue.reason, "past_due");
      assert.equal(pastDue.redirectTo, MANAGE_PAYMENT_PATH);
    }
    const active = resolveSubscriptionCreationGate({ subscription: { status: "active" } }, sub);
    assert.equal(active.allowed, false);
    if (active.allowed === false) {
      assert.equal(active.reason, "blocking");
      assert.equal(active.redirectTo, MANAGE_SUBSCRIPTION_PATH);
    }
  });

  // --- isSubscriptionPlan ---
  await test("isSubscriptionPlan matches the two inlined copies it replaces", () => {
    assert.equal(isSubscriptionPlan({ period: "mo", name: "Tradie" }), true);
    assert.equal(isSubscriptionPlan({ period: "one-time", name: "Apprentice" }), false);
    assert.equal(isSubscriptionPlan({ period: "mo", name: "One-Time Boost" }), false);
    assert.equal(isSubscriptionPlan({ period: "mo", name: "ONE-TIME PACK" }), false);
  });

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed`);
    process.exit(1);
  }
  console.log("\nAll subscription-creation-gate tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Wire the npm script**

In `package.json`, beside the other `test:*` entries, add:

```json
"test:subscription-gate": "tsx src/utils/subscription/__tests__/subscription-creation-gate.test.ts",
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:subscription-gate`
Expected: FAIL — cannot resolve `@/utils/subscription/subscription-creation-gate`.

- [ ] **Step 4: Write the implementation**

Create `src/utils/subscription/subscription-creation-gate.ts`:

```ts
/**
 * Can this user start a NEW subscription?
 *
 * ONE answer, shared by the modal-open chokepoint (`useMembershipModal`), the step-2
 * pre-warm backstop, and both card-click handlers. It wraps `hasBlockingSubscription` —
 * the SAME helper the server's `checkCanCreateSubscription` uses — so the client can
 * never disagree with the server and walk a member into a guaranteed 409.
 *
 * Before this existed the client asked `subscription.isActive` plus a price comparison
 * while the server asked about five statuses; every disagreement produced an
 * EXISTING_SUBSCRIPTION rejection at the payment step (309 in production).
 *
 * Bias: when in doubt, ALLOW. A false block stops a guest subscribing, which is worse
 * than the bug this closes. The server guard remains the real backstop.
 *
 * @module utils/subscription/subscription-creation-gate
 */

import { hasBlockingSubscription } from "@/utils/subscription/subscription-helpers";

/** Plan-management sheet — an active member changing tier. */
export const MANAGE_SUBSCRIPTION_PATH = "/my-account/membership?open=subscription";
/** Payment sheet — a past-due member who needs to settle. */
export const MANAGE_PAYMENT_PATH = "/my-account/membership?open=payment";

export type SubscriptionCreationGateResult =
  | { allowed: true }
  | { allowed: false; reason: "past_due" | "blocking"; redirectTo: string };

/**
 * True when a plan is a recurring membership tier rather than a one-time / Additional pack.
 * Replaces the two identical inline copies in `MembershipSection` and `useMembershipCardCta`.
 */
export function isSubscriptionPlan(
  plan: { period?: string; name?: string } | null | undefined
): boolean {
  if (!plan) return false;
  if (plan.period === "one-time") return false;
  return !(plan.name ?? "").toLowerCase().includes("one-time");
}

export function resolveSubscriptionCreationGate(
  user: { subscription?: { status?: string } } | null | undefined,
  opts: { isSubscriptionPlan: boolean; userLoading: boolean }
): SubscriptionCreationGateResult {
  // A pack is a standalone purchase, not a second subscription — always allowed (spec D5).
  if (!opts.isSubscriptionPlan) return { allowed: true };
  // Unknown status must not bounce guests, who are the majority (spec D7).
  if (opts.userLoading) return { allowed: true };
  if (!hasBlockingSubscription(user)) return { allowed: true };
  if (user?.subscription?.status === "past_due") {
    return { allowed: false, reason: "past_due", redirectTo: MANAGE_PAYMENT_PATH };
  }
  return { allowed: false, reason: "blocking", redirectTo: MANAGE_SUBSCRIPTION_PATH };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:subscription-gate`
Expected: PASS — `All subscription-creation-gate tests passed`, exit 0.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 7: Update docs**

In `docs/subscription/patterns.md`, add a pattern section:

```markdown
## P-GATE. One subscription-creation gate, shared with the server

`resolveSubscriptionCreationGate` (`src/utils/subscription/subscription-creation-gate.ts`)
is the single answer to "can this user start a new subscription?". It wraps
`hasBlockingSubscription` — the same helper the server's `checkCanCreateSubscription`
uses — so the client cannot disagree with the server.

**Never re-derive this from `subscription.isActive` or a price comparison.** That is what
the code did before 2026-09-01, and because `isActive` and the five blocking statuses are
different questions, members were routed into a new-subscription checkout that the server
then rejected with a 409 at the payment step (309 production occurrences, 277 members).

Bias is deliberately toward **allow**: a false block stops a guest subscribing, which is a
worse regression than the bug. The server guard is the real backstop.

Covered by `npm run test:subscription-gate`, which iterates
`BLOCKING_SUBSCRIPTION_STATUSES` — adding a status to that constant fails the test until
it is handled here.
```

In `docs/infrastructure/`, add `test:subscription-gate` to the test-script list.

- [ ] **Step 8: Commit** *(only if commits are authorized — see Global Constraints)*

```bash
git add src/utils/subscription/subscription-creation-gate.ts \
        src/utils/subscription/__tests__/subscription-creation-gate.test.ts \
        package.json docs/subscription/patterns.md docs/infrastructure/
git commit -m "feat(subscription): one gate for 'can this user start a new subscription?'"
```

---

## Task 2: Wire the gate into the modal-open chokepoint

Closes threading rows **T1** and **T2**. This is the task that delivers the headline metric.

**Files:**
- Modify: `src/hooks/useMembershipModal.ts`
- Modify: `docs/subscription/architecture.md`, `CUSTOMER.md`

**Interfaces:**
- Consumes: `resolveSubscriptionCreationGate`, `isSubscriptionPlan` (Task 1); `useUserContext()` → `{ userData, loading }` (`src/contexts/UserContext.tsx`, provided app-wide at `src/app/providers.tsx:116`); `useRouter` from `next/navigation`.
- Produces: unchanged public API — `openModal`, `openModalWithPackageSelectionFirst`, `closeModal`, `selectPlan`, `setSelectedPlan`, `isModalOpen`, `selectedPlan`, `openWithPackageSelectionFirst`. Callers need no changes.

- [ ] **Step 1: Add the imports**

At the top of `src/hooks/useMembershipModal.ts`, alongside the existing two imports:

```ts
import { useRouter } from "next/navigation";
import { useUserContext } from "@/contexts/UserContext";
import {
  resolveSubscriptionCreationGate,
  isSubscriptionPlan,
} from "@/utils/subscription/subscription-creation-gate";
```

- [ ] **Step 2: Read context inside the hook**

Immediately after the three `useState` lines in `useMembershipModal`:

```ts
  const router = useRouter();
  const { userData, loading: userLoading } = useUserContext();
```

- [ ] **Step 3: Gate `openModal`**

Replace the whole `openModal` callback with:

```ts
  const openModal = useCallback(
    (plan?: LocalMembershipPlan) => {
      // THE gate. Every entry point — package cards, the Klaviyo abandoned-checkout
      // deep-link, the global `openMembershipModal` event — funnels through here, which
      // is why the check lives at this chokepoint and not in the callers. Three of the
      // four entry points used to skip the card-click guard entirely.
      //
      // A plan-less open is NOT treated as a subscription (spec D6): it opens the picker,
      // and the picker is how a blocking-sub member buys a PACK, which is allowed and is
      // live revenue. The step-2 pre-warm backstop guards that path instead.
      const gate = resolveSubscriptionCreationGate(userData, {
        isSubscriptionPlan: plan ? isSubscriptionPlan(plan) : false,
        userLoading,
      });
      if (!gate.allowed) {
        router.push(gate.redirectTo);
        return;
      }

      setOpenWithPackageSelectionFirst(false);
      if (plan) {
        setSelectedPlan(plan);
      }
      setIsModalOpen(true);
    },
    [router, userData, userLoading]
  );
```

- [ ] **Step 4: Gate `openModalWithPackageSelectionFirst`**

Replace that callback with:

```ts
  const openModalWithPackageSelectionFirst = useCallback(
    (defaultPlan?: LocalMembershipPlan) => {
      // Same gate. `defaultPlan` sits BEHIND the picker, so it only blocks when the
      // caller explicitly pre-selects a membership tier for a blocking-sub member.
      const gate = resolveSubscriptionCreationGate(userData, {
        isSubscriptionPlan: defaultPlan ? isSubscriptionPlan(defaultPlan) : false,
        userLoading,
      });
      if (!gate.allowed) {
        router.push(gate.redirectTo);
        return;
      }

      setSelectedPlan(defaultPlan ?? null);
      setOpenWithPackageSelectionFirst(true);
      setIsModalOpen(true);
    },
    [router, userData, userLoading]
  );
```

- [ ] **Step 5: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint src/hooks/useMembershipModal.ts`
Expected: both exit 0. The `useCallback` dependency arrays now include `router, userData, userLoading` — if eslint's exhaustive-deps disagrees, follow it rather than suppressing.

- [ ] **Step 6: Verify the dev gallery still mounts**

`src/components/dev/ModalsGalleryClient.tsx:611` calls `useMembershipModal(SAMPLE_PLAN)`. It renders under the app providers, so `useUserContext` resolves.

Run: `npm run dev`, open `/dev/modals`, confirm the gallery renders and the membership modal opens.
Expected: no "useUserContext must be used within a UserProvider" error.

- [ ] **Step 7: Verify the fix by hand, all four entry points**

With a **test account that has an active membership**, signed in:

| Entry point | How to trigger | Expected |
| --- | --- | --- |
| Package card | `/membership`, click a tier | redirected to `/my-account/membership?open=subscription` |
| Deep-link | visit `/?openMembership=1&packageId=<a membership tier id>` | redirected, modal does NOT open |
| Global event | click a hero "Enter Now" CTA on a promo page | redirected, modal does NOT open |
| **Pack (must still work)** | pick a one-time / Additional pack | **modal opens normally** |

Then repeat the pack row **signed out** and confirm a guest can still open and subscribe.

- [ ] **Step 8: Update docs**

In `docs/subscription/architecture.md`, under the membership-modal section, add:

```markdown
### The modal-open chokepoint owns the subscription gate (2026-09-01)

`useMembershipModal.openModal` / `openModalWithPackageSelectionFirst` call
`resolveSubscriptionCreationGate` before opening, and `router.push` the member to their
membership page instead when the answer is no.

The gate lives **here, not in the callers**, because there are four ways into this modal
and three of them (the Klaviyo abandoned-checkout deep-link, the global
`openMembershipModal` event, and the package-picker open) never ran the card-click guard.
Adding a fifth entry point now inherits the gate for free — that is the point of the
placement.

A plan-less open is deliberately allowed through: the picker is how a member with a
blocking subscription buys a **pack**, which is permitted. The step-2 pre-warm backstop
guards that path.
```

In `CUSTOMER.md`, in the membership-journey section, add:

```markdown
_2026-09-01 — membership journey:_ a member who already holds a live membership
(active / past-due / paused / unpaid / trialing) is no longer taken into the
new-subscription checkout from a hero CTA or an old abandoned-checkout email. They are
sent to **/my-account/membership** — the plan sheet, or the **payment** sheet if they are
past due. Buying a one-time or Additional **pack** is unchanged and still allowed while a
membership is live. Guests and cancelled/expired members are unaffected and can subscribe
exactly as before.
```

- [ ] **Step 9: Commit** *(only if authorized)*

```bash
git add src/hooks/useMembershipModal.ts docs/subscription/architecture.md CUSTOMER.md
git commit -m "fix(membership): gate every modal entry point, not just package cards"
```

---

## Task 3: Step-2 backstop and the silent dead end

Closes threading row **T3** and spec decision **D8**.

**Files:**
- Modify: `src/components/modals/MembershipModal/index.tsx` (pre-warm block ~`:1232`; pre-warm `onError` ~`:1281`)
- Modify: `docs/shared-ui/gotchas.md`

**Interfaces:**
- Consumes: `resolveSubscriptionCreationGate` (Task 1); the existing `showToast` and `router` already in scope in this component.
- Produces: nothing new.

- [ ] **Step 1: Guard the pre-warm before it fires**

In the step-2 effect, inside `if (isSubscription && !isCreatingSubscriptionRef.current) {`, immediately before the existing `if (!paymentIntentClientSecret) {` block that sets `isCreatingSubscriptionRef.current = true`, insert:

```tsx
        // Backstop for the user-data load race (spec D7). The chokepoint gate in
        // useMembershipModal runs at OPEN time; if UserContext had not resolved then, a
        // member could still reach this step. Firing the pre-warm here would produce a
        // guaranteed 409 and leave them staring at a payment step with no card form.
        const stepTwoGate = resolveSubscriptionCreationGate(userData, {
          isSubscriptionPlan: true,
          userLoading: false,
        });
        if (!stepTwoGate.allowed) {
          showToast({
            type: "error",
            title: "Active Subscription Found",
            message:
              "You already have a membership. Manage or update it from your account.",
            duration: 10000,
            action: {
              label: "Manage Subscription",
              onClick: () => router.push(stepTwoGate.redirectTo),
            },
          });
          onClose();
          router.push(stepTwoGate.redirectTo);
          return;
        }
```

Add the import at the top of the file:

```tsx
import { resolveSubscriptionCreationGate } from "@/utils/subscription/subscription-creation-gate";
```

- [ ] **Step 2: Stop the pre-warm failing silently**

In the pre-warm `onError` handler, replace the `EXISTING_SUBSCRIPTION` branch:

```tsx
          if (errCode === "EXISTING_SUBSCRIPTION") {
            // Background pre-warm: do NOT toast here. The purchase-click handler
            // ("Active Subscription Found") is the single source of this message,
            // so the user sees exactly one actionable toast.
            console.warn("[MembershipModal] pre-warm blocked by EXISTING_SUBSCRIPTION (toast deferred to purchase click)");
          } else {
```

with:

```tsx
          if (errCode === "EXISTING_SUBSCRIPTION") {
            // Reaching here means both the open-time gate and the step-2 backstop were
            // beaten (a status change mid-session, or user data that never resolved).
            // This used to log and show NOTHING, leaving the member at a payment step
            // with no card form and no explanation — the deferred-toast reasoning only
            // held while the purchase click could still surface it, and with no client
            // secret there is often nothing to click.
            showToast({
              type: "error",
              title: "Active Subscription Found",
              message:
                "You already have a membership. Manage or update it from your account.",
              duration: 10000,
              action: {
                label: "Manage Subscription",
                onClick: () => router.push("/my-account/membership?open=subscription"),
              },
            });
          } else {
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint src/components/modals/MembershipModal/index.tsx`
Expected: both exit 0.

- [ ] **Step 4: Verify the race path by hand**

Hard to trigger naturally. Force it: in DevTools, throttle to "Slow 3G", sign in as a member, and click a hero CTA immediately on page load so `UserContext` is still loading at open time.

Expected: the modal may open briefly, then the backstop fires — toast appears, modal closes, you land on `/my-account/membership`. **No 409 in the network tab** for `create-subscription-existing-user`.

- [ ] **Step 5: Update docs**

Append to `docs/shared-ui/gotchas.md`:

```markdown
## MembershipModal step-2 pre-warm is gated, and never fails silently (2026-09-01)

The step-2 effect pre-creates the subscription to obtain a card-form client secret. It now
calls `resolveSubscriptionCreationGate` first: a member with a live membership is toasted
and redirected instead of pre-warming into a guaranteed 409.

The pre-warm's `EXISTING_SUBSCRIPTION` branch previously logged `console.warn` and showed
nothing, on the reasoning that the purchase-click handler was "the single source" of the
message. That reasoning failed in practice — with no client secret the card form never
renders, so there is frequently no purchase click to make, and the member simply sat at a
blank payment step. It now shows the same "Active Subscription Found" toast.

**Do not restore the silent branch.** If you are worried about double-toasting, the
redirect closes the modal, so the purchase-click handler cannot also fire.
```

- [ ] **Step 6: Commit** *(only if authorized)*

```bash
git add src/components/modals/MembershipModal/index.tsx docs/shared-ui/gotchas.md
git commit -m "fix(membership): back-stop the step-2 pre-warm and stop it failing silently"
```

---

## Task 4: Collapse the two drifted card-click guards

Closes threading rows **T4**, **T5**, **T6**. No user-visible change — this removes the duplication so the bug cannot regress.

**Files:**
- Modify: `src/components/sections/MembershipSection.tsx` (`getPlanHierarchy` ~`:299`, `handlePlanSelect` ~`:327`)
- Modify: `src/hooks/useMembershipCardCta.ts` (`isSubscriptionPlan` ~`:42`, `onSelect` ~`:144`)
- Modify: `src/hooks/useMajorDrawEntryCta.ts` (fallback ~`:366-378`)
- Modify: `docs/shared-ui/patterns.md`, `docs/draws/gotchas.md`

**Interfaces:**
- Consumes: `resolveSubscriptionCreationGate`, `isSubscriptionPlan` (Task 1).
- Produces: nothing new. `getPlanHierarchy` keeps returning `isCurrent/isUpgrade/isDowngrade` — those still drive **CTA labels** (`MembershipSection.tsx:590-594`, `useMembershipCardCta.ts:128-138`) and must not be deleted. Only the **routing** stops using them.

- [ ] **Step 1: Replace the four bounces in `MembershipSection.handlePlanSelect`**

Replace the four sequential `if` bounces (past-due, downgrade, upgrade, current) with:

```tsx
      // Routing decision comes from the shared gate, NOT from getPlanHierarchy. The
      // hierarchy flags return all-false whenever the relationship cannot be determined
      // (missing subscriptionPackageData, an equal-price tier switch, user data still
      // loading) — and because every bounce was `hasActiveSubscription && hierarchy.isX`,
      // those cases fell through into the new-subscription flow and 409'd at step 2.
      // getPlanHierarchy still drives the CTA LABEL below; it just no longer routes.
      const gate = resolveSubscriptionCreationGate(userData, {
        isSubscriptionPlan: isSubscriptionPlan(plan),
        userLoading,
      });
      if (!gate.allowed) {
        router.push(gate.redirectTo);
        return;
      }
```

Delete the now-unused local `const isSubscriptionPlan = plan.period !== "one-time" && ...` line inside `handlePlanSelect` (the imported helper replaces it). Add the import:

```tsx
import {
  resolveSubscriptionCreationGate,
  isSubscriptionPlan,
} from "@/utils/subscription/subscription-creation-gate";
```

- [ ] **Step 2: Do the same in `useMembershipCardCta.onSelect`**

Replace its two bounces (past-due, then `hasActiveSubscription && (isDowngrade || isUpgrade || isCurrent)`) with the identical block from Step 1. Delete the module-level `const isSubscriptionPlan = (p: LocalMembershipPlan) => ...` at `:42` and import the shared one instead — the `hierarchy()` helper stays, because `ctaLabelFor` uses it.

- [ ] **Step 3: Close the one-time fallback hole in `useMajorDrawEntryCta`**

At the end of that handler, the fallback reaches
`membershipModal.openModalWithPackageSelectionFirst(getRecommendedSubscriptionPlan())` —
a **subscription** plan — when `getOneTimePlan()` resolves nothing. Replace:

```tsx
          } else {
            // No concrete one-time plan resolved yet → let the user pick, with the recommended
            // subscription behind the picker so there is never an empty payment step.
            membershipModal.openModalWithPackageSelectionFirst(getRecommendedSubscriptionPlan());
          }
```

with:

```tsx
          } else if (hasBlockingSubscription(userData)) {
            // A member with a live subscription must never land behind a RECOMMENDED
            // SUBSCRIPTION plan — that is the 409 path. With no one-time plan resolved
            // yet, open the picker with nothing pre-selected so they can choose a pack.
            membershipModal.openModalWithPackageSelectionFirst();
          } else {
            // No concrete one-time plan resolved yet → let the user pick, with the recommended
            // subscription behind the picker so there is never an empty payment step.
            membershipModal.openModalWithPackageSelectionFirst(getRecommendedSubscriptionPlan());
          }
```

- [ ] **Step 4: Type-check, lint, and re-run the gate test**

Run: `npx tsc --noEmit && npx eslint src/components/sections/MembershipSection.tsx src/hooks/useMembershipCardCta.ts src/hooks/useMajorDrawEntryCta.ts && npm run test:subscription-gate`
Expected: all exit 0.

- [ ] **Step 5: Verify CTA labels did not regress**

The labels are the thing most at risk, because `getPlanHierarchy` is still their source.

Signed in as an **active member**, on `/membership` and on a promo page, confirm:
- current tier still reads **"Current Plan"**
- a cheaper tier still reads **"Downgrade to …"**
- a dearer tier still reads **"Upgrade to …"**
- as a **past-due** member, subscription tiers still read **"Update payment"**

- [ ] **Step 6: Update docs**

Append to `docs/shared-ui/patterns.md`:

```markdown
## Membership CTA: hierarchy labels the button, the gate routes the click (2026-09-01)

`getPlanHierarchy` / `hierarchy()` answer "is this tier the member's current / an upgrade /
a downgrade?" and drive the **button label only**. Routing is decided by
`resolveSubscriptionCreationGate`.

They were previously the same decision, and that was the bug: the hierarchy flags return
all-false whenever the relationship cannot be determined, so an equal-price tier switch,
missing `subscriptionPackageData`, or a click before `UserContext` resolved all fell
through into the new-subscription checkout and 409'd at the payment step.

A label may be wrong-ish and cost nothing; a wrong route costs a purchase. Keep them
separate.
```

Append to `docs/draws/gotchas.md`:

```markdown
## The entry CTA never pre-selects a subscription for a member who has one (2026-09-01)

`useMajorDrawEntryCta` diverts a member with a blocking subscription to a one-time pack.
Its fallback — when no one-time plan has resolved yet — used to open the picker behind
`getRecommendedSubscriptionPlan()`, putting exactly the member it had just diverted back
in front of a membership tier. It now opens the picker with nothing pre-selected for that
member. Guests are unaffected.
```

- [ ] **Step 7: Commit** *(only if authorized)*

```bash
git add src/components/sections/MembershipSection.tsx src/hooks/useMembershipCardCta.ts \
        src/hooks/useMajorDrawEntryCta.ts docs/shared-ui/patterns.md docs/draws/gotchas.md
git commit -m "refactor(membership): one gate routes every CTA; hierarchy only labels"
```

---

## Task 5: The on-hold nudge

Spec **D5a / D5c / §4.5 option A**.

**Files:**
- Modify: `src/components/modals/MembershipModal/index.tsx` (the pack/one-time step)
- Modify: `docs/subscription/frontend.md`, `BUSINESS.md`

**Interfaces:**
- Consumes: `getPastDueRenewalPreview(user) => { entries: number | null; cost: number | null }` from `@/utils/subscription/past-due-renewal-preview`; `userData` already in scope.
- Produces: nothing new.

- [ ] **Step 1: Read the preview**

Add the import, and derive the value **below** the `useUserContext()` destructure at
`index.tsx:643` (`userData` is not in scope before that line). Everything else it needs —
`useMemo` (`:33`), `useRouter`/`router` (`:114`, `:239`), `showToast` (`:241`), `onClose`
(`:233`) — is already imported and in scope. `verified`.

```tsx
import type { IUser } from "@/models/User";
import { getPastDueRenewalPreview } from "@/utils/subscription/past-due-renewal-preview";
```

```tsx
  // { entries: null, cost: null } for anyone NOT in payment recovery, so this both
  // supplies the numbers and scopes the note: an ACTIVE member buying a pack sees
  // nothing (they already hold the membership and need no nudge).
  //
  // The cast matches the established client-side idiom at
  // `RenewalFailedModal/usePastDueResolve.ts:82` — the util is typed against IUser but
  // reads only `subscription.status` / `subscription.packageId`, both present on the
  // client UserData. Do not widen the util's signature for this one caller.
  const onHoldPreview = useMemo(
    () => getPastDueRenewalPreview((userData ?? {}) as unknown as IUser),
    [userData]
  );
```

- [ ] **Step 2: Render the note on the pack step**

Above the pack purchase button, add:

```tsx
        {onHoldPreview.cost != null && (
          <div className="mt-3 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
            <p className="font-semibold text-amber-900 dark:text-amber-200">
              Membership on hold
            </p>
            <p className="mt-1 text-amber-900/90 dark:text-amber-100/90">
              {onHoldPreview.entries != null ? (
                <>
                  Settle <b>${onHoldPreview.cost}</b> to reactivate your membership —{" "}
                  <b>{onHoldPreview.entries} free entries</b> land as soon as it clears, and
                  your partner discounts come back.
                </>
              ) : (
                <>
                  Settle <b>${onHoldPreview.cost}</b> to reactivate your membership — your
                  partner discounts, entries &amp; member offers are paused until your
                  renewal clears.
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => router.push("/my-account/membership?open=payment")}
              className="mt-2 font-semibold text-amber-900 underline underline-offset-2 dark:text-amber-200"
            >
              Reactivate membership
            </button>
          </div>
        )}
```

**Rule 11 / spec §4.5 option A — do not change this copy without re-reading both.** It
states the membership's own price and entries. It must **not** print the pack's price or
entry count, and must not author a "cheaper than this pack" comparison — that shape reads
as per-entry pricing, which is a legal line, not a style preference. The reader already
has the pack's numbers on the same screen.

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint src/components/modals/MembershipModal/index.tsx`
Expected: both exit 0.

- [ ] **Step 4: Verify the null fallback**

The one thing that can look broken to a customer is `$null` / `null free entries`.

Signed in as each of the following, open a pack in the modal:

| Account state | Expected |
| --- | --- |
| Past-due, tier resolvable | full note, real `$cost` and real entries count |
| Past-due, entries preview unavailable | fallback sentence, **no** "null free entries" |
| Active member | **no note at all** |
| Guest | **no note at all** |

- [ ] **Step 5: Update docs**

Append to `docs/subscription/frontend.md`:

```markdown
### On-hold nudge on the pack step (2026-09-01)

A member in payment recovery who opens a one-time / Additional pack sees an inline note
offering reactivation, with the real settle amount and the real entries figure from
`getPastDueRenewalPreview` — the same source as the dashboard note, the resolve sheet, the
renewal-failure email and the Klaviyo `past_due_renewal_entries` property. Do not
recompute either number here; a fifth source can disagree with the other four.

It is a **note, not a blocker** — buying the pack stays allowed. The util returns nulls
outside payment recovery, which is also what scopes the note, so no extra status check is
needed.

**Copy is legally constrained** — see spec §4.5 option A and CLAUDE.md rule 11. State the
membership's own price and entries; never print the pack's alongside them as a comparison.
```

In `BUSINESS.md`, in the past-due recovery section, add:

```markdown
_2026-09-01: a member in payment recovery who opens a one-time / Additional pack now sees
an inline reactivation prompt showing the settle amount and the free entries that land
when it clears. It is a prompt, not a block — the pack purchase is still allowed. No
price, tier, entry allocation or recovery rule changed._
```

- [ ] **Step 6: Commit** *(only if authorized)*

```bash
git add src/components/modals/MembershipModal/index.tsx docs/subscription/frontend.md BUSINESS.md
git commit -m "feat(membership): offer reactivation, with real numbers, to on-hold members buying a pack"
```

---

## Final verification

- [ ] `npx tsc --noEmit` — exit 0
- [ ] `npm run lint` — 0 errors
- [ ] `npm run test:subscription-gate` — pass
- [ ] `npm run test:klaviyo-renewal-preview` — pass (Task 5 renders its output)
- [ ] `npm run test:payment-decline-severity` — pass (already on this branch)
- [ ] Guest can still subscribe end-to-end — **the §1 failure condition**
- [ ] Cancelled member can still resubscribe — **the §1 failure condition**
- [ ] Active member is redirected from all three previously-bypassing entry points
- [ ] Past-due member reaches `?open=payment`
- [ ] Blocking-sub member can still buy a pack

**After merge:** the success metric is `EXISTING_SUBSCRIPTION` rows in the `errorreports`
collection dropping from ~100/month to under 5. Check a week after deploy — the count is
the honest verdict on whether this worked.
