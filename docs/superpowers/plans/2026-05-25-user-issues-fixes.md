# User Issues Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Repo rule #1 (no-auto-commit):** Commit steps are written out, but do NOT run `git commit`/`push` until the user has authorized commits this session (keywords: commit/push/merge/ship it). If unauthorized, stop at the commit step and ask.

**Goal:** Fix three production bugs surfaced from user reports — (1) dashboard entries show 0/blank after login until reload, (2) Stripe Payment Element "Stripe not loaded" / "could not retrieve data from the specified Element" on `/promotions/*`, (3) secondary login-handler cache/identity defects.

**Architecture:** Bug 1's real cause is HTTP-layer caching: `/api/major-draw` (and `/api/mini-draws`) return per-user data but send `Cache-Control: public …` with no `Vary: Cookie`, so a shared/browser cache serves a guest copy (`userStats: null` → 0 entries) to a just-logged-in user; dev uses `no-store` so it only manifests on staging/prod. We make per-user responses non-cacheable when authenticated and `Vary: Cookie` for guests. Bug 2 is a readiness race: the Purchase button enables on client-secret presence with no PaymentElement `ready` gate; we add an `onReady` callback chain + a pure readiness guard. Bug 3 standardizes post-login cache invalidation.

**Tech Stack:** Next.js 15 App Router route handlers, NextAuth v4, TanStack Query, `@stripe/react-stripe-js`, standalone `tsx` tests.

---

## File Structure

**Fix A — per-user response caching (Bug 1 primary)**
- Create `src/utils/security/cache-control.ts` — pure `userScopedCacheControl()` helper.
- Create `src/utils/security/__tests__/cache-control.test.ts` — unit test.
- Modify `src/app/api/major-draw/route.ts` — apply helper (lines ~137-162).
- Modify `src/app/api/mini-draws/route.ts` — apply helper (lines ~131-174).
- Modify `CLAUDE.md` (worktree + root) — add `src/app/api/mini-draws/**` to `draws` manifest.

**Fix B — Stripe PaymentElement readiness gate (Bug 2)**
- Create `src/components/modals/PaymentMethodSelector/paymentReadiness.ts` — pure readiness guard.
- Create `src/components/modals/PaymentMethodSelector/__tests__/paymentReadiness.test.ts` — unit test.
- Modify `src/components/modals/PaymentMethodSelector/CardFormSection.tsx` — `onReady` + `isElementReady` + guard in `confirmStripeIntent`.
- Modify `src/components/modals/PaymentMethodSelector/index.tsx` — thread `onElementReady` to both `<CardFormSection>` mounts.
- Modify `src/components/modals/MembershipModal/PaymentStep.tsx` — thread `onElementReady` prop.
- Modify `src/components/modals/MembershipModal/index.tsx` — `isPaymentElementReady` state + gate in `isFormValid()`.

**Fix C — login-handler cleanup (Bug 3, secondary/defensive)**
- Modify `src/components/modals/LoginModal/index.tsx` — fix dead-code guard; use `usePurchaseInvalidation`; `router.refresh()`.
- Modify `src/app/login/page.tsx` — use `usePurchaseInvalidation`; `router.refresh()`.

**Docs to update (doc-sync Stop hook will enforce):**
- `docs/draws/` (major-draw + mini-draws cache rule) — `backend.md` + `gotchas.md`.
- `docs/security-csp/` (new helper + "never public-cache per-user data" rule) — `rules.md` + `patterns.md`.
- `docs/shared-ui/` (Stripe readiness gate + LoginModal) — `gotchas.md` + `patterns.md`.
- `docs/auth/` (login page invalidation) — `gotchas.md`.

---

## Fix A — Per-user response caching

### Task A1: Cache-control helper (pure, TDD)

**Files:**
- Create: `src/utils/security/cache-control.ts`
- Test: `src/utils/security/__tests__/cache-control.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/utils/security/__tests__/cache-control.test.ts
import assert from "node:assert/strict";
import { userScopedCacheControl } from "../cache-control";

let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}`); console.error(e instanceof Error ? e.message : String(e)); }
}

const PUBLIC = "public, s-maxage=60, stale-while-revalidate=300";

test("authenticated → private, no-store (never shared/stored)", () => {
  const r = userScopedCacheControl(true, PUBLIC);
  assert.equal(r.cacheControl, "private, no-store");
  assert.equal(r.vary, "Cookie");
});

test("guest → passes through public value but Vary: Cookie isolates it", () => {
  const r = userScopedCacheControl(false, PUBLIC);
  assert.equal(r.cacheControl, PUBLIC);
  assert.equal(r.vary, "Cookie");
});

test("guest no-store value passes through unchanged", () => {
  const r = userScopedCacheControl(false, "no-store, must-revalidate");
  assert.equal(r.cacheControl, "no-store, must-revalidate");
});

console.log(failed === 0 ? "\nAll cache-control tests passed" : `\n${failed} test(s) failed`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Add `test:cache-control` to `package.json` scripts and run it (expect FAIL — module missing)**

Add to `package.json` `scripts`:
```json
"test:cache-control": "tsx src/utils/security/__tests__/cache-control.test.ts",
```
Run: `npm run test:cache-control`
Expected: FAIL — cannot find `../cache-control`.

- [ ] **Step 3: Implement the helper**

```ts
// src/utils/security/cache-control.ts
/**
 * Per-user API responses must never be stored by a shared (CDN) or browser cache
 * keyed only by URL — otherwise one user's body (or a guest's userStats: null) is
 * served to another. For authenticated requests force `private, no-store`. For
 * anonymous requests keep the caller's public caching, but always emit `Vary: Cookie`
 * so a shared cache keeps the guest entry separate from any cookie-bearing
 * (authenticated) request and never hands a cached guest copy to a logged-in user.
 *
 * See docs/security-csp/rules.md — "Never public-cache per-user responses".
 */
export function userScopedCacheControl(
  isAuthenticated: boolean,
  publicCacheControl: string
): { cacheControl: string; vary: "Cookie" } {
  return isAuthenticated
    ? { cacheControl: "private, no-store", vary: "Cookie" }
    : { cacheControl: publicCacheControl, vary: "Cookie" };
}
```

- [ ] **Step 4: Run test (expect PASS)**

Run: `npm run test:cache-control`
Expected: PASS — all 3.

- [ ] **Step 5: Commit** (only if authorized)

```bash
git add src/utils/security/cache-control.ts src/utils/security/__tests__/cache-control.test.ts package.json
git commit -m "feat(security): add userScopedCacheControl helper to prevent public-caching per-user API responses"
```

### Task A2: Apply helper to `/api/major-draw`

**Files:**
- Modify: `src/app/api/major-draw/route.ts:137-162`

- [ ] **Step 1: Import the helper** (top of file with other imports)

```ts
import { userScopedCacheControl } from "@/utils/security/cache-control";
```

- [ ] **Step 2: Replace the header block** (current lines ~137-162)

Replace the `if (process.env.NODE_ENV === "development") … else …` Cache-Control assignment and the final `return NextResponse.json(response, { headers })` with:

```ts
    // Compute the value we'd use for an anonymous (cacheable) response …
    let publicCacheControl: string;
    if (process.env.NODE_ENV === "development") {
      publicCacheControl = "no-store, must-revalidate";
    } else if (nearestMs <= 60 * 60 * 1000) {
      publicCacheControl = "no-store, must-revalidate"; // critical window
    } else if (nearestMs <= 6 * 60 * 60 * 1000) {
      publicCacheControl = "public, s-maxage=10, max-age=10"; // near window
    } else {
      publicCacheControl = "public, s-maxage=60, stale-while-revalidate=300"; // normal
    }

    // … but this response embeds per-user `userStats`, so an authenticated request
    // must never be cached publicly. See docs/security-csp/rules.md.
    const { cacheControl, vary } = userScopedCacheControl(!!session?.user?.id, publicCacheControl);
    headers.set("Cache-Control", cacheControl);
    headers.set("Vary", vary);

    return NextResponse.json(response, { headers });
```

- [ ] **Step 3: Type-check & lint**

Run: `npm run type-check` then `npm run lint`
Expected: no new errors in `route.ts`.

- [ ] **Step 4: Manual header check (user-run; dev is no-store, so use a prod build)**

Run a production build locally or rely on staging. Verify with DevTools/curl:
- Logged-in `GET /api/major-draw` → `Cache-Control: private, no-store`.
- Guest `GET /api/major-draw` → `public …` + `Vary: Cookie`.

- [ ] **Step 5: Commit** (only if authorized)

```bash
git add src/app/api/major-draw/route.ts
git commit -m "fix(draws): never public-cache /api/major-draw for authenticated users (entries showed 0 after login)"
```

### Task A3: Apply helper to `/api/mini-draws` + manifest

**Files:**
- Modify: `src/app/api/mini-draws/route.ts:131-174`
- Modify: `CLAUDE.md` (worktree root `c:\Codes\ToolsAustralia\.worktrees\user-issues\CLAUDE.md`) and `c:\Codes\ToolsAustralia\CLAUDE.md`

- [ ] **Step 1: Add the manifest glob** (both CLAUDE.md files, `draws` domain `paths`)

After the line `"src/app/api/mini-draw/**",` add:
```json
        "src/app/api/mini-draws/**",
```

- [ ] **Step 2: Import the helper** in `mini-draws/route.ts`

```ts
import { userScopedCacheControl } from "@/utils/security/cache-control";
```

- [ ] **Step 3: Replace the success-response header** (current line ~169-173)

The success `NextResponse.json(...)` currently sets `"Cache-Control": "public, s-maxage=60, stale-while-revalidate=300"`. The body embeds per-user `hasActiveMembership`. Replace with:

```ts
    const { cacheControl, vary } = userScopedCacheControl(
      !!session?.user?.id,
      "public, s-maxage=60, stale-while-revalidate=300"
    );

    return NextResponse.json(
      {
        miniDraws: miniDrawsWithMembership,
        pagination: { currentPage: page, totalPages, totalCount, hasNextPage, hasPrevPage, limit },
      },
      { headers: { "Cache-Control": cacheControl, Vary: vary } }
    );
```

- [ ] **Step 4: Type-check & lint**

Run: `npm run type-check` then `npm run lint`
Expected: clean.

- [ ] **Step 5: Commit** (only if authorized)

```bash
git add src/app/api/mini-draws/route.ts CLAUDE.md
git commit -m "fix(draws): never public-cache /api/mini-draws per-user membership flag; cover route in manifest"
```

---

## Fix B — Stripe PaymentElement readiness gate

### Task B1: Readiness guard (pure, TDD)

**Files:**
- Create: `src/components/modals/PaymentMethodSelector/paymentReadiness.ts`
- Test: `src/components/modals/PaymentMethodSelector/__tests__/paymentReadiness.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/modals/PaymentMethodSelector/__tests__/paymentReadiness.test.ts
import assert from "node:assert/strict";
import { canSubmitPayment, paymentNotReadyReason } from "../paymentReadiness";

let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}`); console.error(e instanceof Error ? e.message : String(e)); }
}

const stripe = {}; const elements = {};

test("not submittable when stripe missing → 'Stripe not loaded'", () => {
  assert.equal(canSubmitPayment({ stripe: null, elements, isElementReady: true }), false);
  assert.equal(paymentNotReadyReason({ stripe: null, elements, isElementReady: true }), "Stripe not loaded");
});

test("not submittable when element not ready → loading message (NOT the Stripe submit error)", () => {
  assert.equal(canSubmitPayment({ stripe, elements, isElementReady: false }), false);
  assert.equal(
    paymentNotReadyReason({ stripe, elements, isElementReady: false }),
    "Payment form is still loading. Please wait a moment and try again."
  );
});

test("submittable only when stripe + elements + ready", () => {
  assert.equal(canSubmitPayment({ stripe, elements, isElementReady: true }), true);
  assert.equal(paymentNotReadyReason({ stripe, elements, isElementReady: true }), null);
});

console.log(failed === 0 ? "\nAll paymentReadiness tests passed" : `\n${failed} test(s) failed`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Add `test:payment-readiness` to `package.json` and run (expect FAIL)**

```json
"test:payment-readiness": "tsx src/components/modals/PaymentMethodSelector/__tests__/paymentReadiness.test.ts",
```
Run: `npm run test:payment-readiness` → FAIL (module missing).

- [ ] **Step 3: Implement the guard**

```ts
// src/components/modals/PaymentMethodSelector/paymentReadiness.ts
/**
 * Stripe REQUIRES the PaymentElement's `ready` event before elements.submit() /
 * confirmPayment(). Submitting earlier makes Stripe throw "We could not retrieve
 * data from the specified Element…". This guard gates both the Purchase button
 * (isFormValid) and the imperative confirmStripeIntent(). See docs/shared-ui/gotchas.md.
 */
export interface PaymentReadinessInput {
  stripe: unknown | null;
  elements: unknown | null;
  isElementReady: boolean;
}

export function canSubmitPayment({ stripe, elements, isElementReady }: PaymentReadinessInput): boolean {
  return Boolean(stripe) && Boolean(elements) && isElementReady;
}

export function paymentNotReadyReason({ stripe, elements, isElementReady }: PaymentReadinessInput): string | null {
  if (!stripe || !elements) return "Stripe not loaded";
  if (!isElementReady) return "Payment form is still loading. Please wait a moment and try again.";
  return null;
}
```

- [ ] **Step 4: Run test (expect PASS)**

Run: `npm run test:payment-readiness` → PASS.

- [ ] **Step 5: Commit** (only if authorized)

```bash
git add src/components/modals/PaymentMethodSelector/paymentReadiness.ts src/components/modals/PaymentMethodSelector/__tests__/paymentReadiness.test.ts package.json
git commit -m "feat(payment): add pure PaymentElement readiness guard"
```

### Task B2: Wire `onReady` + guard into CardFormSection

**Files:**
- Modify: `src/components/modals/PaymentMethodSelector/CardFormSection.tsx`

- [ ] **Step 1: Add the prop to `CardFormSectionProps`** (interface at ~line 47)

```ts
  /** Fired with the PaymentElement's `ready` state so parents can gate submit. */
  onElementReady?: (ready: boolean) => void;
```

- [ ] **Step 2: Destructure the new prop** (alongside `onPaymentMethodTypeChange` at ~line 77)

```ts
      onElementReady,
```

- [ ] **Step 3: Add readiness state + ref** (near `const stripe = useStripe();` ~line 81)

```ts
    const [isElementReady, setIsElementReady] = React.useState(false);
    // Ref mirror so the imperative confirmStripeIntent() reads the live value.
    const isElementReadyRef = React.useRef(false);
```

- [ ] **Step 4: Import the guard** (with other imports)

```ts
import { paymentNotReadyReason } from "./paymentReadiness";
```

- [ ] **Step 5: Guard `confirmStripeIntent`** — replace the existing `if (!stripe || !elements) { return { error: "Stripe not loaded" }; }` (line ~295) with:

```ts
        const notReady = paymentNotReadyReason({ stripe, elements, isElementReady: isElementReadyRef.current });
        if (notReady) {
          return { error: notReady };
        }
```

- [ ] **Step 6: Add `onReady` to `<PaymentElement>`** (element at ~line 603, add prop next to `onChange`)

```tsx
            onReady={() => {
              isElementReadyRef.current = true;
              setIsElementReady(true);
              onElementReady?.(true);
            }}
```

- [ ] **Step 7: Reset readiness on unmount** (so a remount via the `<Elements>`/`PaymentElement` key starts un-ready). Add an effect:

```ts
    React.useEffect(() => {
      return () => {
        isElementReadyRef.current = false;
        onElementReady?.(false);
      };
    }, [onElementReady]);
```

- [ ] **Step 8: Type-check**

Run: `npm run type-check` → clean.

- [ ] **Step 9: Commit** (only if authorized)

```bash
git add src/components/modals/PaymentMethodSelector/CardFormSection.tsx
git commit -m "fix(payment): gate confirmStripeIntent on PaymentElement ready; emit onElementReady"
```

### Task B3: Thread `onElementReady` through PaymentMethodSelector + PaymentStep

**Files:**
- Modify: `src/components/modals/PaymentMethodSelector/index.tsx`
- Modify: `src/components/modals/MembershipModal/PaymentStep.tsx`

- [ ] **Step 1: PaymentMethodSelector — add prop to its props type** (the component's Props interface)

```ts
  onElementReady?: (ready: boolean) => void;
```

- [ ] **Step 2: PaymentMethodSelector — destructure it** and pass to BOTH `<CardFormSection>` mounts (guest mount ~line 249 and authenticated hidden mount ~line 342). Add to each:

```tsx
                onElementReady={onElementReady}
```

- [ ] **Step 3: PaymentStep — add to props interface** (~line 91, next to `onPaymentMethodTypeChange`)

```ts
  onElementReady?: (ready: boolean) => void;
```

- [ ] **Step 4: PaymentStep — destructure** (~line 129) and forward to `<PaymentMethodSelector>` (both render sites, ~line 162 and ~line 191):

```tsx
          onElementReady={onElementReady}
```

- [ ] **Step 5: Type-check**

Run: `npm run type-check` → clean.

- [ ] **Step 6: Commit** (only if authorized)

```bash
git add src/components/modals/PaymentMethodSelector/index.tsx src/components/modals/MembershipModal/PaymentStep.tsx
git commit -m "fix(payment): thread onElementReady from CardFormSection up to MembershipModal"
```

### Task B4: Gate the Purchase button in MembershipModal

**Files:**
- Modify: `src/components/modals/MembershipModal/index.tsx` (state, prop wiring, `isFormValid` ~line 4308)

- [ ] **Step 1: Add readiness state** (near other payment state)

```ts
  const [isPaymentElementReady, setIsPaymentElementReady] = useState(false);
```

- [ ] **Step 2: Reset readiness when the element will remount** — add an effect keyed on the same inputs that drive the `<Elements>`/`PaymentElement` key (client secret, showCardForm, active intent type):

```ts
  useEffect(() => {
    setIsPaymentElementReady(false);
  }, [paymentIntentClientSecret, setupIntentClientSecret, showCardForm]);
```

- [ ] **Step 3: Pass `onElementReady` to `<PaymentStep>`** (find the `<PaymentStep …/>` render and add):

```tsx
          onElementReady={setIsPaymentElementReady}
```

- [ ] **Step 4: Gate `isFormValid()` for the new-card paths only** (lines ~4322-4332). Update the authenticated add-new-card branch and the guest branch to require readiness; leave the saved-method branch unchanged (it relies on the confirmStripeIntent guard + existing retries to avoid a stuck button):

```ts
    if (isAuthenticated) {
      return useSavedPaymentMethod
        ? selectedPaymentMethod !== null
        : showCardForm
        ? !cardFormError && hasIntentClientSecret && isPaymentElementReady
        : false;
    } else {
      const registrationComplete = currentStep === 2 && guestUserData !== null;
      const cardFormReady = !cardFormError && hasIntentClientSecret && isPaymentElementReady;
      return Boolean(registrationComplete && cardFormReady);
    }
```

- [ ] **Step 5: Type-check & lint**

Run: `npm run type-check` then `npm run lint` → clean.

- [ ] **Step 6: Manual check (user-run)** on `/promotions/dewalt` (guest): the Purchase button stays disabled ("Setting up payment…"/loading) until the card field is interactive, then enables; submitting no longer throws the two reported errors.

- [ ] **Step 7: Commit** (only if authorized)

```bash
git add src/components/modals/MembershipModal/index.tsx
git commit -m "fix(payment): disable Purchase until PaymentElement is ready (fixes Stripe not loaded / element-not-ready on promo pages)"
```

---

## Fix C — Login-handler cleanup (secondary/defensive)

### Task C1: LoginModal — fix dead-code guard + centralize invalidation

**Files:**
- Modify: `src/components/modals/LoginModal/index.tsx`

- [ ] **Step 1: Import the canonical invalidator + getSession** (top of file)

```ts
import { getSession } from "next-auth/react";
import { usePurchaseInvalidation } from "@/hooks/usePurchaseInvalidation";
```

- [ ] **Step 2: Instantiate it** (in the component body, near `const queryClient = useQueryClient();`)

```ts
  const invalidateForUser = usePurchaseInvalidation();
```

- [ ] **Step 3: Fix `handlePasswordLogin`** — the `if (session?.user?.id)` block (line ~136) reads the stale render-time session (null at login), so invalidation + Klaviyo identify never run. Replace it with a fresh-session read:

```ts
        // signIn() has already refreshed the client session; read it fresh
        // (the closure `session` is still the pre-login value).
        const fresh = await getSession();
        if (fresh?.user?.id) {
          invalidateForUser(fresh.user.id);
          if (fresh.user.email) {
            identify({
              email: fresh.user.email,
              firstName: fresh.user.firstName,
              lastName: fresh.user.lastName,
            });
          }
        }
        router.push("/my-account");
        router.refresh();
```

- [ ] **Step 4: Update the other three flows** — in `handleGoogleSignIn` (~line 195), `handleVerifyCode` (~line 321), `handleVerifyLoginCode` (~line 541): replace the three `queryClient.invalidateQueries({ … users.account/userStats/rewards … })` lines with a single call, and add `router.refresh()` after each `router.push("/my-account")`:

```ts
              invalidateForUser(session.user.id); // (or newSession.user.id in the auto-login flows)
```
…then after the existing `router.push("/my-account");` in each, add:
```ts
              router.refresh();
```

- [ ] **Step 5: Type-check & lint**

Run: `npm run type-check` then `npm run lint` → clean.

- [ ] **Step 6: Commit** (only if authorized)

```bash
git add src/components/modals/LoginModal/index.tsx
git commit -m "fix(auth): run invalidation + Klaviyo identify on password login (was dead code); use canonical invalidation set across all login flows"
```

### Task C2: /login page — centralize invalidation

**Files:**
- Modify: `src/app/login/page.tsx`

- [ ] **Step 1: Import + instantiate** (mirror Task C1 Steps 1-2)

```ts
import { usePurchaseInvalidation } from "@/hooks/usePurchaseInvalidation";
// …
  const invalidateForUser = usePurchaseInvalidation();
```

- [ ] **Step 2: Replace the redirect-effect invalidation** (lines ~411-415) with:

```ts
        invalidateForUser(session.user.id);
        router.refresh();
```

- [ ] **Step 3: Replace the setTimeout invalidation** (lines ~531-535) with:

```ts
          if (updatedSession?.user?.id) {
            invalidateForUser(updatedSession.user.id);
            router.refresh();
          }
```

- [ ] **Step 4: Type-check & lint**

Run: `npm run type-check` then `npm run lint` → clean.

- [ ] **Step 5: Commit** (only if authorized)

```bash
git add src/app/login/page.tsx
git commit -m "fix(auth): use canonical invalidation set + router.refresh after /login"
```

---

## Task D: Docs + definition of done

- [ ] **Step 1: Update docs** for every touched domain (doc-sync Stop hook enforces):
  - `docs/draws/backend.md` + `docs/draws/gotchas.md` — `/api/major-draw` & `/api/mini-draws` must not be public-cached when authenticated; entries-show-0 root cause.
  - `docs/security-csp/rules.md` + `docs/security-csp/patterns.md` — `userScopedCacheControl`; "Never `public`-cache a response whose body varies by session."
  - `docs/shared-ui/gotchas.md` + `docs/shared-ui/patterns.md` — Stripe `ready`-before-`submit` invariant; `onElementReady` chain; LoginModal stale-session pitfall.
  - `docs/auth/gotchas.md` — login flows must invalidate via `usePurchaseInvalidation` + `router.refresh()`.

- [ ] **Step 2: Run the full verification gate**

```bash
npm run test:cache-control
npm run test:payment-readiness
npm run type-check
npm run lint
```
Expected: all green.

- [ ] **Step 3: `/ship`** (definition-of-done + manifest + doc-sync). Commit only if authorized.

---

## Manifest check

- `src/utils/security/cache-control.ts` + its `__tests__` → matches `src/utils/security/**` (**security-csp**). ✓ covered.
- `src/components/modals/PaymentMethodSelector/**` + `MembershipModal/**` (incl. new `paymentReadiness.ts` + `__tests__`) → matches `src/components/modals/**` (**shared-ui**). ✓ covered.
- `src/app/login/**` → **auth**. ✓ covered.
- `src/app/api/major-draw/**` → **draws**. ✓ covered.
- `src/app/api/mini-draws/**` → **ORPHAN** under current manifest (`mini-draw/**` singular only). Task A3 Step 1 adds `src/app/api/mini-draws/**` to the `draws` domain. No new domain needed (`registering-new-domain` not required).

---

## Risks

1. **Stripe button stuck disabled if `ready` never fires.** Mitigated by: gating only the *new-card* paths (the reported failures are guests on promo pages), leaving the saved-method path button ungated, and the existing Stripe-load timeout/auto-log at `CardFormSection.tsx:95`. Verify on a throttled connection on `/promotions/dewalt`. If `ready` proves flaky for the off-screen hidden mount, add a timed fallback that enables after ~8s with a logged warning.
2. **`Vary: Cookie` lowers guest CDN hit-rate** if guests carry other cookies (analytics). `Vary: Cookie` on the guest branch is *required* (a shared cache must not hand a cached guest copy to a cookie-bearing authenticated request) — accept the reduced guest cache efficiency; correctness/privacy win. If hit-rate matters, a later optimization can split public draw data into a separate cookie-free endpoint.
3. **Authenticated dashboard now hits origin** for `/api/major-draw` (no CDN offload). Acceptable; the route is already `force-dynamic`.
4. **Dev cannot reproduce Bug 1** (route uses `no-store` in development). Verify the caching fix via a local production build or on staging.
5. **`router.refresh()` after login** triggers an RSC refetch on navigation — low risk (pages in the my-account tree are client components), but watch for a double-fetch flash; remove if it regresses UX (the caching fix is the actual entries fix, C is defensive).
6. **Two CLAUDE.md copies** (root + worktree) — update the worktree one (active for the doc-sync hook); keep the root copy in sync to avoid drift.
