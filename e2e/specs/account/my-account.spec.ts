import { test, expect } from "../../fixtures/test";
import { MEMBER_STATE } from "../../lib/paths";

test.describe("my-account @smoke @demo", () => {
  test.use({ storageState: MEMBER_STATE });

  test("dashboard loads for the seeded active member", async ({ page, demo }) => {
    await demo.step("Opening the member dashboard", async () => {
      await page.goto("/my-account");
      await expect(page).toHaveURL(/\/my-account/); // not bounced to /login
    });
    await demo.step("The member's account and free entries are visible", async () => {
      await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
      // Seeded member firstName is displayed somewhere on the dashboard
      await expect(page.locator("body")).toContainText(/e2e/i, { timeout: 20_000 });
    });
  });

  test("closed ManageSheet and ReferFriendModal fire zero requests until opened", async ({ page, demo }) => {
    // Regression guard for the perf bug fixed by LazyManageSheet / LazyReferFriendModal:
    // both were previously mounted unconditionally (one by the /my-account layout, the
    // other by page-client.tsx) with a useQuery hook that fired on MOUNT regardless of
    // the sheet/modal's own open state. Collect every request across the whole test and
    // assert each fetch stays silent until its owning sheet/modal is actually opened —
    // then confirm it fires once opened, so this also catches an over-eager fix that
    // disables the query permanently instead of gating it on first-open.
    const requestUrls: string[] = [];
    page.on("request", (req) => requestUrls.push(req.url()));
    const hitsPaymentMethods = () => requestUrls.some((u) => u.includes("/api/stripe/payment-methods"));
    const hitsReferralCode = () => requestUrls.some((u) => u.includes("/api/referrals/code"));

    await demo.step("Dashboard loads with neither sheet/modal opened", async () => {
      await page.goto("/my-account");
      await expect(page.locator("body")).toContainText(/e2e/i, { timeout: 20_000 });
      // Give any wrongly-unconditional fetch a beat to fire before asserting it didn't.
      await page.waitForTimeout(1_500);
      expect(hitsPaymentMethods(), "/api/stripe/payment-methods must not fire before ManageSheet opens").toBe(false);
      expect(hitsReferralCode(), "/api/referrals/code must not fire before ReferFriendModal opens").toBe(false);
    });

    // /api/referrals/code genuinely 500s against this seeded member when actually invoked —
    // NOT related to the perf fix under test, and pre-existing/documented: src/lib/referral.ts's
    // getOrCreateReferralProfile() full-document `user.save()` re-runs Mongoose's email validator
    // against the seeded ".local" address (the same gap visual.spec.ts used to paper over with a
    // page-wide stub before this fix made the request conditional). Stub ONLY the response here,
    // scoped to this test, so opening ReferFriendModal doesn't trip the QA watchdog's 500 guard —
    // `page.on("request")` above still observes the real request the app code issued, so this
    // doesn't mask anything about the behavior under test. (/api/stripe/payment-methods needs no
    // such stub: it now classifies a dangling stripeCustomerId as "no saved methods" and returns
    // 200 — see docs/billing-stripe/gotchas.md.)
    await demo.step("Opening ReferFriendModal (Quick actions → Refer) fires the referral request", async () => {
      await page.route("**/api/referrals/code", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: { code: "E2EMEMBER", successfulConversions: 0, totalEntriesAwarded: 0 },
          }),
        })
      );
      const referralResponse = page.waitForResponse((res) => res.url().includes("/api/referrals/code"), { timeout: 20_000 });
      const referButton = page.getByRole("button", { name: /refer/i });
      await expect(referButton).toBeVisible({ timeout: 20_000 });
      await referButton.click();
      await referralResponse;
      expect(hitsReferralCode(), "/api/referrals/code should fire once ReferFriendModal opens").toBe(true);
    });

    await demo.step("Opening ManageSheet (?open=subscription deep-link) fires the payment-methods request", async () => {
      // NOT the /my-account/membership "Manage" button: that page's own MembershipCurrentPlan
      // card calls useSavedPaymentMethods() directly (a legitimate, always-visible "Payment
      // method: Visa •••• 1234" row — not a bug), so by the time ManageSheet mounts, React
      // Query already has a fresh cache entry for the SAME query key and skips a second network
      // call entirely — `waitForResponse` then times out for the wrong reason (cache hit, not a
      // gating bug). The `?open=subscription` deep-link (page-client.tsx, also documented in
      // dashboard-account/gotchas.md) opens ManageSheet from the ROOT /my-account page instead,
      // which never calls useSavedPaymentMethods on its own — so ManageSheet's fetch is the
      // FIRST and only one, giving an unambiguous signal.
      const paymentMethodsResponse = page.waitForResponse((res) => res.url().includes("/api/stripe/payment-methods"), { timeout: 20_000 });
      await page.goto("/my-account?open=subscription");
      await expect(page.getByText("Manage membership")).toBeVisible({ timeout: 20_000 });
      await paymentMethodsResponse;
      expect(hitsPaymentMethods(), "/api/stripe/payment-methods should fire once ManageSheet opens").toBe(true);
    });
  });
});

// Separate describe block (not a manual browser.newContext()) so this test still gets
// full fixture coverage — QA watchdog, per-worker x-forwarded-for, third-party
// blocklist — from e2e/fixtures/test.ts. An empty storageState object is the
// Playwright-supported way to opt a describe block out of the file's auth state.
test.describe("my-account guest gate @smoke @demo", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("guest hitting /my-account is redirected to /login", async ({ page }) => {
    await page.goto("/my-account");
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
  });
});
