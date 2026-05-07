---
name: writing-playwright-spec
description: Use when authoring or modifying a Playwright E2E spec under e2e/, adding a new data-testid to a component for spec consumption, or updating the e2e/utils/selectors.ts registry. Triggers on phrases like "write an e2e test", "add a playwright spec", "test this UI flow end to end", "add a testid".
---

# writing-playwright-spec

## When to use

Authoring any spec under `e2e/<domain>/*.spec.ts` against the conventions established in Phase 1+2 of the E2E test plan. NOT for unit tests — those use the `writing-tsx-test` skill instead.

If you're authoring multiple specs for one domain (auth, account, membership, etc.), prefer dispatching the `playwright-spec-author` subagent — it batches the per-domain work coherently. Use this skill yourself only when adding ONE spec inline.

## Hard rules

- **NEVER use `bronze`/`silver`/`gold`** — the tier names are `tradie`, `foreman`, `boss`. Stripe env vars use `STRIPE_PRICE_ID_TRADIE/FOREMAN/BOSS`.
- **NEVER import** `test`/`expect` from `@playwright/test` directly. Always:
  ```ts
  import { test, expect } from "../fixtures/test";
  ```
  The custom fixture in `e2e/fixtures/test.ts` selects per-worker storageState. Importing from `@playwright/test` defeats the per-worker auth.
- **NEVER inline** literal `[data-testid="..."]` strings. Always `byTestId(testid.X)`:
  ```ts
  import { byTestId, testid } from "../utils/selectors";
  await page.locator(byTestId(testid.loginSubmit)).click();
  ```
- **For DB access in specs, use `getDb()` from `e2e/fixtures/seed-helpers.ts`.** Dynamic-importing models directly (`(await import("@/models/X")).default`) returns a double-default-wrapped object due to tsx CJS/ESM interop and breaks `Model.create/updateOne` calls. `getDb()` returns top-level imported models with `connectDB()` already called:
  ```ts
  const { User } = await getDb();
  await User.create({ ... });
  ```
  Add new models to `getDb()`'s return type as needed.
- **Top-level `import Model from "@/models/X"` is also fine** in spec files (specs aren't bundled by Next.js so `serverExternalPackages` doesn't apply). The convention is `getDb()` for consistency.
- **NEVER refactor production code** beyond adding `data-testid` attributes (and passing `testId={...}` to existing `<ModalContainer>` call sites).
- **NEVER assume features the codebase doesn't have.** The plan was originally drafted against a spec doc; the deep-validation pass de-scoped: affiliate signup form, OTP login UI, newsletter unsubscribe, narrowed oauth-redirect, rewrote bonus-code. Look in `docs/superpowers/plans/2026-05-04-e2e-test-suite.md` for the amendments at line ~1672.
- **NEVER commit / stage / push.** Hard rule from CLAUDE.md.

## Steps

### 1. Survey before writing

Read these files to internalize current state:
- `e2e/utils/selectors.ts` — testid registry. Don't duplicate; add new entries if needed.
- `e2e/fixtures/test.ts` — custom test fixture (per-worker storageState).
- `e2e/fixtures/seed-helpers.ts` — `resetUser(role)`, `withFreshMember()`.
- `e2e/utils/intercept.ts` — `waitForApi`, `assertJsonShape`.
- `e2e/utils/fill-payment-element.ts` — only handles basic Card, fills `input[name="number"|"expiry"|"cvc"|"postalCode"]`. For 3DS, hand-roll like `e2e/shop/three-ds.spec.ts:35-38`.
- `e2e/utils/stripe-test-cards.ts` — exports `SUCCESS`, `REQUIRES_3DS`, `DECLINED`, `INSUFFICIENT_FUNDS`. Don't invent new card names.
- At least one existing spec from `e2e/shop/*.spec.ts` — match the project style.
- The component(s) you'll touch — confirm path, confirm `"use client"` if interactive, confirm the element you want isn't behind an unsatisfied conditional.

### 2. Add testid to component (if needed)

- Use the literal string in the JSX (`data-testid="login-email"`), NOT `testid.X` — components don't import from `e2e/`.
- For modals, prefer passing the modal-specific id via the `testId` prop on `<ModalContainer>`:
  ```tsx
  <ModalContainer testId="user-setup-modal" ...>
  ```
  rather than adding a separate testid to a child of `ModalContainer`.
- The modal's `data-testid` lands on `ModalContainer`'s outermost panel `motion.div` (default fallback `"modal-container"` if `testId` is omitted — DO NOT rely on the fallback in specs because it's shared across all modals).

### 3. Append to selectors registry

In `e2e/utils/selectors.ts`, add the new testid to the section that matches the component's domain (the file is grouped by area). Don't reorganize existing entries. If the entry already exists, skip.

### 4. Write the spec

File path: `e2e/<domain>/<descriptive-name>.spec.ts`. Skeleton:

```ts
import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";
import { resetUser } from "../fixtures/seed-helpers";

test.describe.configure({ mode: "serial" }); // only if mutating

test.describe("<flow name>", () => {
  test.beforeEach(async () => {
    await resetUser("tradie"); // only for mutating tests on a member fixture
  });

  test("<scenario>", async ({ page }) => {
    await page.goto("/<route>");
    // role-based locators by default; testid as fallback
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.locator(byTestId(testid.dashboardRoot))).toBeVisible();
  });
});
```

### 5. Project assignment

Verify the spec lands under exactly one project's `testMatch` in `playwright.config.ts`:
```
npx playwright test --list 2>&1 | grep <spec-filename>
```
If it doesn't appear, the spec's path doesn't match any project regex. Either move the spec to a path that matches, or extend the regex in `playwright.config.ts` (carefully — the regex is brittle).

### 6. Run the spec

```
npx playwright test e2e/<domain>/<spec-name>.spec.ts --project=<project-name>
```
The `webServer` (`npm run dev`) starts automatically (or reuses an existing one). First run also triggers `globalSetup` (~10-15s for the seed). To skip teardown when iterating, set `E2E_KEEP_FIXTURES=true`.

If the spec fails:
- Wrong selector → fix.
- Hydration race → add `timeout: 5_000` to the assertion.
- Modal didn't open → check the priority queue; reset `sessionStorage` in `beforeEach`.
- Webhook side-effect didn't land → wrap in `.catch(() => false)` (see `e2e/shop/member-checkout.spec.ts:55`) OR use `postWebhook(...)` to drive it deterministically.
- Real product issue → STOP. Don't "fix" production code. Mark the spec BLOCKED and surface to the caller.

### 7. Update domain doc

Touch `docs/<domain>/frontend.md` (or `README.md` if frontend.md doesn't exist) — append an "E2E test IDs" section listing the components and the testids you added. The doc-sync hook only requires that *some* file under `docs/<domain>/` was touched in the same Stop session; the section makes the addition useful.

## Conventions checklist

| Thing | Convention | Source |
|---|---|---|
| Locator preference | Role/label first (`getByRole`, `getByLabel`, `getByText`); testids as fallback | matches existing 7 shop specs |
| Mutating test | `test.describe.configure({ mode: "serial" })` | `e2e/shop/guest-checkout.spec.ts:6` |
| Hydration timeout | `5_000` ms on post-mount assertions | `e2e/shop/cart-icon-badge.spec.ts:24` |
| Login rate limit | <=5 attempts/min/spec/IP | `src/app/api/auth/[...nextauth]/route.ts:13-16` |
| Login flow | `signIn("credentials", ...)` from next-auth/react; POSTs to `/api/auth/callback/credentials` | `src/app/login/page.tsx:247` |
| Logout button | inside collapsed user menu — open menu first | `src/components/layout/Header.tsx:401` |
| Cart localStorage | key `shop_cart_v1`, shape `{ v: 1, items: [], savedAt }` | `e2e/shop/cart-persistence.spec.ts` |
| Shop checkout success | URL `/\/shop\/checkout\/success/`, regex `/Order confirmed\|Payment confirmed\|Processing/i`, 35s timeout | `e2e/shop/guest-checkout.spec.ts:78` |
| Stripe Element fill | `fillPaymentElementCard(page, STRIPE_TEST_CARDS.SUCCESS)` | `e2e/utils/fill-payment-element.ts` |
| 3DS challenge frame | hand-roll `frameLocator("iframe[name*='__privateStripeFrame']").last()` | `e2e/shop/three-ds.spec.ts:35-38` |
| DB access in spec | dynamic import inside test body | `e2e/shop/out-of-stock.spec.ts:20-43` |
| Webhook drive | `postWebhook("event.type", { ... })` from `e2e/fixtures/stripe-webhook-helper.ts` | requires NODE_ENV=development (Playwright webServer satisfies) |
| `resetUser(role)` | only for the role the spec is authenticated as (the spec's project's role) | `e2e/fixtures/seed-helpers.ts` |
| `withFreshMember()` | for ephemeral users; spec is responsible for creating the User doc itself | `e2e/fixtures/seed-helpers.ts` |
| `chromium-tradie/foreman/boss` | tier projects bound to `e2e/.auth/<role>-w<N>.json` via the custom fixture | `playwright.config.ts` + `e2e/fixtures/test.ts` |
| Affiliate auth | username (NOT email), lowercase | `e2e/fixtures/affiliate-auth.setup.ts`, `src/lib/affiliate-auth.ts` |
| OAuth login | not testable headlessly past form submission; cap scope to "form constructed + submitted" | per plan amendment |

## Verification

```bash
npx playwright test e2e/<domain>/<spec-name>.spec.ts --project=<project>   # must pass
npx playwright test --list 2>&1 | grep <spec-filename>                     # must appear under exactly one project
npm run type-check                                                          # no new errors in touched files
```

The Stop hook will block if you touched a component and didn't update the matching `docs/<domain>/`. Do not commit; hand off to the user.

## Per-worker storage state

The custom fixture in `e2e/fixtures/test.ts` selects `e2e/.auth/<role>-w<parallelIndex>.json` based on the project name (`chromium-tradie` → `tradie`). Note it uses **`testInfo.parallelIndex`** (always 0..N-1) not `workerIndex` (which can exceed N when workers respawn). Storage state files are seeded by `auth.setup.ts` for indices 0..workerCount()-1.

## Login rate limit (dev mode)

The credentials route at `src/app/api/auth/[...nextauth]/route.ts` skips rate limiting in development (`NODE_ENV !== "development"` guards the limiter). Specs can hammer login as fast as needed under `npm run dev`.

## Iteration mode

Set `E2E_KEEP_FIXTURES=true` to skip BOTH globalSetup (seed) AND globalTeardown (cleanup):
```
$env:E2E_KEEP_FIXTURES="true"; npx playwright test e2e/<domain>/ --reporter=list
```
On Bash: `E2E_KEEP_FIXTURES=true npx playwright test ...`. Setup-shared still runs (24 setup tests) unless skipped via spec project filter.

## Common gotchas

- **Modal queue silently swallowing your `requestModal()`** — another higher-priority modal is already active. Either close it first or use the `force: true` flag.
- **`special-packages` modal silently substituted by `gate-closed`** when no major draw is active (`UnifiedModalManager.tsx:92-109`). Spec must seed `currentMajorDraw.status === "active"` to actually see special-packages.
- **`profileSetupCompleted: false` triggers `UserSetupModal` automatically** on `/my-account` — if your spec doesn't want this modal, set the flag true (the seed defaults to true for `fresh`+member roles, but if you mutate it during the spec, expect the modal).
- **`fillPaymentElementCard` doesn't wait for Element readiness** — call `page.waitForLoadState("networkidle")` first if the form is part of a larger async-loaded page.
- **Stripe Subscription period end** moved off the top-level subscription in SDK 18 (`scripts/e2e-stripe-helpers.ts` uses `getSubscriptionPeriodEnd` which handles both). Don't query `subscription.current_period_end` directly in spec code.
