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

  test("closed ManageSheet and ReferFriendModal never download their chunk until opened", async ({ page, demo }) => {
    // Regression guard for the perf bug fixed by LazyManageSheet / LazyReferFriendModal: both
    // were previously mounted unconditionally (one by the /my-account layout, the other by
    // page-client.tsx) with a useQuery hook that fired on MOUNT regardless of the sheet/modal's
    // own open state.
    //
    // This does NOT assert "zero network requests to payment-methods/referrals before open" —
    // src/hooks/usePaymentMethodPrefetch (wired through src/hooks/usePrefetching.ts on several
    // legitimate route-intent/idle paths) is allowed to prefetch payment methods independent of
    // whether ManageSheet has ever been opened, so racing that prefetcher made a network-timing
    // assertion here intermittent. The STRUCTURAL guarantee that can't race with a data
    // prefetcher: a component that hasn't mounted cannot have its own JS chunk requested — a
    // prefetched query and a downloaded chunk are different things, and only the chunk proves
    // (or disproves) LazyManageSheet/LazyReferFriendModal's "don't mount the real component
    // until first open" contract. Assert neither lazy component's chunk is ever requested while
    // closed, then confirm opening each ONE does download its chunk AND fire its real request —
    // catching an over-eager fix that disables the query permanently instead of gating it on
    // first open. The QA watchdog's 5xx guard (active for every test via e2e/fixtures/test.ts)
    // is what proves the payment-methods dangling-customer fix holds end-to-end — see
    // docs/billing-stripe/gotchas.md.
    const requestUrls: string[] = [];
    page.on("request", (req) => requestUrls.push(req.url()));
    const chunkLoaded = (name: "ManageSheet" | "ReferFriendModal") =>
      requestUrls.some((u) => u.includes("/_next/static/chunks/") && u.includes(name));

    // The seeded active member has never "seen" the subscription explainer (a fresh browser
    // context has no localStorage), so page-client.tsx's own 2.5s-delayed auto-open timer for
    // it (unrelated to anything under test here) reliably fires and covers the Quick Actions
    // grid with its backdrop — reproduced live while writing this fix, including with a
    // single Escape keypress that raced the timer and missed. Deterministically wait out its
    // trigger window and dismiss it (Escape is a documented close path; see
    // SubscriptionExplainerModal's own onEsc handler) BEFORE interacting with Quick Actions,
    // instead of hoping a click lands in the gap before it opens.
    const dismissSubscriptionExplainerIfItOpens = async () => {
      const headline = page.locator("#sem-headline");
      const opened = await headline
        .waitFor({ state: "visible", timeout: 4_000 })
        .then(() => true)
        .catch(() => false);
      if (opened) {
        await page.keyboard.press("Escape");
        await headline.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
      }
    };

    await demo.step("Dashboard loads with neither sheet/modal opened — neither lazy chunk downloads", async () => {
      await page.goto("/my-account");
      await expect(page.locator("body")).toContainText(/e2e/i, { timeout: 20_000 });
      await page.waitForLoadState("networkidle").catch(() => {});
      expect(chunkLoaded("ManageSheet"), "ManageSheet's chunk must not download before it's opened").toBe(false);
      expect(chunkLoaded("ReferFriendModal"), "ReferFriendModal's chunk must not download before it's opened").toBe(
        false
      );
      await dismissSubscriptionExplainerIfItOpens();
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
    await demo.step("Opening ReferFriendModal (Quick actions → Refer) downloads its chunk and fires the referral request", async () => {
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
      const referralResponse = page.waitForResponse((res) => res.url().includes("/api/referrals/code"), { timeout: 45_000 }); // 45s: dev-server contention under full smoke load (same accommodation as login.spec)
      const referButton = page.getByRole("button", { name: /refer/i });
      await expect(referButton).toBeVisible({ timeout: 20_000 });
      await referButton.click();
      await referralResponse;
      expect(chunkLoaded("ReferFriendModal"), "ReferFriendModal's chunk should download once it's opened").toBe(
        true
      );
    });

    await demo.step("Opening ManageSheet (?open=subscription deep-link) downloads its chunk and fires the payment-methods request", async () => {
      // NOT the /my-account/membership "Manage" button: that page's own MembershipCurrentPlan
      // card calls useSavedPaymentMethods() directly (a legitimate, always-visible "Payment
      // method: Visa •••• 1234" row — not a bug), so by the time ManageSheet mounts, React
      // Query already has a fresh cache entry for the SAME query key and skips a second network
      // call entirely — `waitForResponse` then times out for the wrong reason (cache hit, not a
      // gating bug). The `?open=subscription` deep-link (page-client.tsx, also documented in
      // dashboard-account/gotchas.md) opens ManageSheet from the ROOT /my-account page instead,
      // which never calls useSavedPaymentMethods on its own — so ManageSheet's fetch is the
      // FIRST and only one, giving an unambiguous signal. Unstubbed on purpose: this exercises
      // the real, now-hardened route end-to-end against the seeded member's dangling
      // stripeCustomerId — a 500 here would trip the QA watchdog and fail the test.
      const paymentMethodsResponse = page.waitForResponse((res) => res.url().includes("/api/stripe/payment-methods"), { timeout: 45_000 }); // 45s: dev-server contention under full smoke load (same accommodation as login.spec)
      await page.goto("/my-account?open=subscription");
      // Fresh navigation remounts page-client.tsx, so the explainer's 2.5s timer restarts —
      // same guard as above.
      await dismissSubscriptionExplainerIfItOpens();
      await expect(page.getByText("Manage membership")).toBeVisible({ timeout: 20_000 });
      const res = await paymentMethodsResponse;
      expect(res.status(), "the real payment-methods route must succeed (200) for a dangling stripeCustomerId").toBe(
        200
      );
      expect(chunkLoaded("ManageSheet"), "ManageSheet's chunk should download once it's opened").toBe(true);
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
