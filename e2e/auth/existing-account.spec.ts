// e2e/auth/existing-account.spec.ts
//
// API-level coverage for the existing-account conflict path. The plan contract
// described a UI flow (`/login` → register → existing-account-modal), but in
// reality the register form lives inside MembershipModal (no `/register` route
// exists in the codebase) and `setShowExistingAccountModal(true)` is triggered
// by the API response shape `{ isExistingAccount: true, field, message }` —
// see src/components/modals/MembershipModal.tsx:1726-1734 and the response
// branches in src/app/api/auth/register/route.ts:194-225.
//
// Asserting on the API response is sufficient regression coverage: the UI
// renders ExistingAccountModal verbatim from `isExistingAccount: true`, so the
// API contract IS the modal trigger contract. UI-level coverage is deferred
// until a direct register entry-point exists or until MembershipModal opens
// for guests (currently it requires session priming).

import { test, expect } from "../fixtures/test";
import { emailFor } from "../fixtures/test-users";
import { getDb } from "../fixtures/seed-helpers";

// `isPlainAccount` (src/app/api/auth/register/route.ts:82) treats any user with
// accumulatedEntries===0 AND no savedPaymentMethods as "plain" — meaning the
// existing-account modal does NOT fire for them. The seed leaves tradie-w0 in
// that "plain" state. Bump accumulatedEntries to 1 before the test so the
// conflict branch fires; restore afterwards so other specs see the baseline.
test.describe("register API — existing-account conflict", () => {
  test.beforeAll(async () => {
    const { User } = await getDb();
    await User.updateOne(
      { email: emailFor("tradie", 0) },
      { $set: { accumulatedEntries: 1 } },
    );
  });

  test.afterAll(async () => {
    const { User } = await getDb();
    await User.updateOne(
      { email: emailFor("tradie", 0) },
      { $unset: { accumulatedEntries: "" } },
    );
  });

  test("POST /api/auth/register with a tradie email returns isExistingAccount=true", async ({
    request,
  }) => {
    // tradie-w0 was bumped to accumulatedEntries=1 in beforeAll → !isPlainAccount.
    // The route should hit the email branch (404, line 194-205) before any
    // mobile/duplicate-key fallback.
    const existingEmail = emailFor("tradie", 0);

    // Use a unique mobile so we hit the EMAIL conflict branch, not the
    // MOBILE conflict branch (mobile is checked first in the route).
    const uniqueMobile = `+6140${Date.now().toString().slice(-7)}`;
    const res = await request.post("/api/auth/register", {
      data: {
        email: existingEmail,
        password: "Anything-Strong-Enough-1!",
        firstName: "Conflict",
        lastName: "Tester",
        mobile: uniqueMobile,
        birthdate: "1990-01-01",
        state: "VIC",
        profession: "Carpenter",
        terms: true,
      },
    });

    expect(res.status(), "register should reject existing tradie email").toBe(400);
    const body = (await res.json()) as {
      success?: boolean;
      isExistingAccount?: boolean;
      field?: string;
      message?: string;
      existingAccountEmail?: string;
    };
    expect(body.success).toBe(false);
    expect(body.isExistingAccount).toBe(true);
    expect(body.field).toBe("email");
    expect(body.existingAccountEmail).toBe(existingEmail);
    // Message text is product-owned; just confirm it mentions "purchases" or
    // "saved payment methods" (the two non-plain branches).
    expect(body.message).toMatch(/purchases|saved payment methods/i);
  });

  test("POST /api/auth/register with a brand-new email succeeds (smoke)", async ({
    request,
  }) => {
    // Sanity: the conflict path isn't catching every email. Use a fresh,
    // never-seeded address. Cleanup not required — the seed:e2e:clear regex
    // (`^test-e2e-`) will catch this on next teardown.
    const newEmail = `test-e2e-existing-account-${Date.now()}@example.com`;

    const res = await request.post("/api/auth/register", {
      data: {
        email: newEmail,
        password: "Anything-Strong-Enough-1!",
        firstName: "Brand",
        lastName: "New",
        mobile: `+6140${Date.now().toString().slice(-7)}`,
        birthdate: "1990-01-01",
        state: "VIC",
        profession: "Carpenter",
        terms: true,
      },
    });

    // 200 (created) or 201 — accept both. The route returns 201 historically
    // but we don't want to assert on that exactly.
    expect(res.status()).toBeLessThan(300);
    const body = (await res.json()) as { success?: boolean };
    expect(body.success).toBe(true);
  });
});
