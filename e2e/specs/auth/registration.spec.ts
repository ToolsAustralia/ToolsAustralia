import { test, expect } from "../../fixtures/test";
import { connectE2eDb } from "../../helpers/db";
import { ObjectId } from "mongodb";

test.describe("registration bridge @smoke", () => {
  // EXTERNAL mode: registering real accounts against a shared/deployed environment is mutating — see runExternal in e2e/run.ts.
  test.skip(process.env.E2E_EXTERNAL === "1", "needs the seeded isolated environment");

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

  test("step-1 register accepts plus-addressed email (regex fix regression)", async ({ page }) => {
    const runId = process.env.E2E_RUN_ID || "dev";
    // Regression coverage for the fix to src/models/User.ts:346's email validator.
    // The old `/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/` pattern rejected "+"
    // plus-addressing (\w excludes "+") — the sibling test above had to route
    // around this by using "-" separators instead. The validator is now the
    // permissive `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/`, so a "+"-tagged address must
    // now succeed through the real /api/auth/register → `new User().save()` path.
    const email = `e2e.plus+tag-${runId}-${test.info().workerIndex}@e2e.io`;

    await page.goto("/membership");
    await page.getByRole("button", { name: /choose tradie/i }).or(page.getByRole("link", { name: /choose tradie/i })).first().click();

    // Step-1 registration form inside MembershipModal
    await page.locator('input[name="firstName"]').fill("E2E");
    await page.locator('input[name="lastName"]').fill("Bridge");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="phone"]').fill("0412345678");
    await page.getByRole("button", { name: /register/i }).click();

    // Bridge reached: registration succeeded and the modal advanced to the billing step
    // (see the sibling test above for why "PURCHASE" — not "Continue to Billing" — is
    // the stable signal).
    await expect(page.getByRole("button", { name: /^purchase$/i })).toBeVisible({ timeout: 20_000 });

    // …but the session is still unauthenticated (CLAUDE.md rule 6's documented behavior).
    const session = await page.request.get("/api/auth/session");
    const body = await session.json().catch(() => null);
    expect(body?.user ?? null).toBeNull();
  });
});

// Regression net for the 2026-07-23 privileged-account-overwrite fix
// (src/utils/auth/privileged-account.ts + register/route.ts). The public register
// path must never create or overwrite a STAFF/ADMIN account, must not rebind a staff
// account's login email, and must not disclose it — while the intended plain-guest
// re-entry (typo correction) still works. Unit test `test:privileged-account` covers
// the predicate in isolation; these cover the ROUTE wiring end-to-end.
test.describe("registration privileged-account guard @smoke", () => {
  // Mutating (creates/looks up real accounts) — needs the seeded isolated env.
  test.skip(process.env.E2E_EXTERNAL === "1", "needs the seeded isolated environment");

  // A Customer-Support-shaped staff account: `role` stays "user" — the exact shape a
  // naive `role !== "user"` guard would MISS (the real markers are roleId / userType).
  // Deliberately "plain" (0 entries, no saved cards) to prove the guard catches it even
  // though it looks like a safe-to-overwrite guest. Scoped per worker (email is unique-indexed).
  let staff: { email: string; mobileStored: string; mobileTyped: string; firstName: string; lastName: string };
  let staffId: ObjectId;
  let guestMobileStored: string;
  let guestMobileTyped: string;

  test.beforeAll(async ({}, testInfo) => {
    const w = testInfo.parallelIndex;
    const staffSub = `4700${String(10000 + w).slice(-5)}`; // 9-digit AU subscriber, unique per worker
    const guestSub = `4700${String(20000 + w).slice(-5)}`;
    staff = {
      email: `e2e-staff-guard-${w}@e2e.io`,
      mobileStored: `+61${staffSub}`,
      mobileTyped: `0${staffSub}`, // normalizes to mobileStored
      firstName: "E2E",
      lastName: "StaffGuard",
    };
    guestMobileStored = `+61${guestSub}`;
    guestMobileTyped = `0${guestSub}`;

    const db = await connectE2eDb();
    const users = db.connection.collection("users");
    await users.deleteMany({ email: staff.email });
    const res = await users.insertOne({
      email: staff.email,
      firstName: staff.firstName,
      lastName: staff.lastName,
      mobile: staff.mobileStored,
      role: "user",
      userType: "staff",
      roleId: new ObjectId(),
      accumulatedEntries: 0,
      savedPaymentMethods: [],
      isActive: true,
      isEmailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    staffId = res.insertedId;
  });

  test.afterAll(async () => {
    const db = await connectE2eDb();
    await db.connection.collection("users").deleteMany({
      $or: [{ _id: staffId }, { mobile: guestMobileStored }],
    });
  });

  test("registering with a STAFF member's email is rejected and does not mutate the account", async ({ page }) => {
    const res = await page.request.post("/api/auth/register", {
      data: { firstName: "Attacker", lastName: "One", email: staff.email, mobile: "0499000001" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.field).toBe("email");

    const db = await connectE2eDb();
    const after = await db.connection.collection("users").findOne({ _id: staffId });
    expect(after?.firstName).toBe(staff.firstName); // name NOT overwritten
    expect(after?.userType).toBe("staff"); // still staff
    expect(after?.mobile).toBe(staff.mobileStored); // mobile NOT overwritten
  });

  test("registering with a STAFF member's mobile is rejected, does NOT rebind the email, and does not leak it", async ({ page }) => {
    const attackerEmail = `attacker-${Date.now()}@e2e.io`;
    const res = await page.request.post("/api/auth/register", {
      data: { firstName: "Attacker", lastName: "Two", email: attackerEmail, mobile: staff.mobileTyped },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.field).toBe("mobile");
    expect(body.existingAccountEmail).toBeUndefined(); // F-005: no email disclosure on a mobile match

    const db = await connectE2eDb();
    const after = await db.connection.collection("users").findOne({ _id: staffId });
    expect(after?.email).toBe(staff.email); // the takeover primitive: email NOT rebound
    expect(after?.userType).toBe("staff");
  });

  test("a plain guest can still re-register and correct their email (intended overwrite preserved)", async ({ page }) => {
    const emailA = `guest-a-${Date.now()}@e2e.io`;
    const emailB = `guest-b-${Date.now()}@e2e.io`;

    const r1 = await page.request.post("/api/auth/register", {
      data: { firstName: "Guest", lastName: "One", email: emailA, mobile: guestMobileTyped },
    });
    expect(r1.status()).toBe(200);

    // Re-register with a CORRECTED email, SAME mobile → the plain account is updated in
    // place (the intended guest re-entry / typo-correction flow — must NOT be broken by
    // the staff guard).
    const r2 = await page.request.post("/api/auth/register", {
      data: { firstName: "Guest", lastName: "Fixed", email: emailB, mobile: guestMobileTyped },
    });
    expect(r2.status()).toBe(200);

    const db = await connectE2eDb();
    const acct = await db.connection.collection("users").findOne({ mobile: guestMobileStored });
    expect(acct?.email).toBe(emailB.toLowerCase()); // email was corrected
    expect(acct?.firstName).toBe("Guest");
  });
});
