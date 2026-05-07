import { test, expect } from "../fixtures/test";
import { withFreshMember, getDb } from "../fixtures/seed-helpers";
import bcrypt from "bcryptjs";

// API-only spec (per Phase 3 amendment narrowing): we POST a 6-char verification
// code to /api/auth/verify-email and assert the DB flips isEmailVerified=true.
// /api/auth/me requires a Bearer JWT (not the next-auth session cookie), so we
// assert the DB directly via dynamic mongoose import — same pattern as other
// API specs in this suite.
test.describe.configure({ mode: "serial" });

test("POST /api/auth/verify-email with a valid code flips isEmailVerified", async ({
  request,
}) => {
  const fresh = await withFreshMember();
  const { User } = await getDb();
  const passwordHash = await bcrypt.hash("Test_Password_123!", 12);

  // Create an unverified user with a known 6-char code (uppercased, per the
  // route's validation: it does newPwd.toUpperCase() before comparing).
  const verificationCode = "ABC123";
  await User.create({
    firstName: "Verify",
    lastName: "Tester",
    email: fresh.email,
    password: passwordHash,
    isEmailVerified: false,
    profileSetupCompleted: true,
    isActive: true,
    emailVerificationCode: verificationCode,
    emailVerificationExpires: new Date(Date.now() + 60 * 60 * 1000),
    emailVerificationAttempts: 0,
  });

  try {
    const response = await request.post("/api/auth/verify-email", {
      data: { email: fresh.email, verificationCode },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.user?.isEmailVerified).toBe(true);

    // Confirm the DB is in the same state.
    const updated = await User.findOne({ email: fresh.email }).select(
      "isEmailVerified emailVerificationCode emailVerificationExpires",
    );
    expect(updated?.isEmailVerified).toBe(true);
    expect(updated?.emailVerificationCode).toBeFalsy();
    expect(updated?.emailVerificationExpires).toBeFalsy();
  } finally {
    await fresh.cleanup();
  }
});
