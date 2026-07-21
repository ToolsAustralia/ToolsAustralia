import { test, expect } from "../../fixtures/test";

test.describe("registration bridge @smoke", () => {
  test("step-1 register creates account WITHOUT logging in (guestUserData bridge)", async ({ page }) => {
    const runId = process.env.E2E_RUN_ID || "dev";
    // NOTE: deviates from the brief's literal `e2e+reg-...@e2e.local` template.
    // Verified (server log + direct curl repro against /api/auth/register) that
    // src/models/User.ts:346's email validator — `/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/`
    // — rejects BOTH the "+" in the local part (\w excludes "+") AND the 5-char
    // ".local" TLD (\w{2,3} caps at 3). Every other e2e fixture using "@e2e.local"
    // creates users via a raw Mongo insertOne (helpers/db.ts, seed/users.ts),
    // bypassing this Mongoose validation entirely — this spec is the first to
    // exercise the real /api/auth/register → `new User().save()` path, so it's
    // the first to hit the regex. "-" separators + a 2-char TLD satisfy it
    // (confirmed 200 via manual POST) while staying unique per run+worker.
    const email = `e2e-reg-${runId}-${test.info().workerIndex}@e2e.io`;

    await page.goto("/membership");
    await page.getByRole("button", { name: /choose tradie/i }).or(page.getByRole("link", { name: /choose tradie/i })).first().click();

    // Step-1 registration form inside MembershipModal
    await page.locator('input[name="firstName"]').fill("E2E");
    await page.locator('input[name="lastName"]').fill("Bridge");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="phone"]').fill("0412345678");
    await page.getByRole("button", { name: /register/i }).click();

    // Bridge reached: registration succeeded and the modal advanced to the billing step.
    // DEVIATION from the brief's literal assertion (documented — evidence in task-7-report.md):
    // the brief expected the "Continue to Billing" label (RegistrationStep.tsx's
    // hasCompletedRegistration-true text) to become visible and stay visible. In the
    // real flow, handleRegistration() (MembershipModal/index.tsx:1529-1546) calls
    // setGuestUserData(...) AND setCurrentStep(2) synchronously in the same handler —
    // React batches both updates into one re-render, so RegistrationStep (and its
    // "Continue to Billing" label) never mounts; the modal jumps straight to the
    // billing/payment step. Verified via e2e:env + error-context DOM snapshot: the
    // "PURCHASE" button (billing step only) was present instead. Asserting on it is
    // the real, stable signal that the guestUserData bridge was crossed.
    await expect(page.getByRole("button", { name: /^purchase$/i })).toBeVisible({ timeout: 20_000 });

    // …but the session is still unauthenticated (CLAUDE.md rule 6's documented behavior).
    const session = await page.request.get("/api/auth/session");
    const body = await session.json().catch(() => null);
    expect(body?.user ?? null).toBeNull();
  });
});
