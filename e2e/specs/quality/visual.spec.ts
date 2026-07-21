import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../../fixtures/test";
import { MEMBER_STATE } from "../../lib/paths";

// DEVIATION FROM THE BRIEF: no file-level `test.use({ reducedMotion: "reduce" })`.
// The brief wanted it site-wide (to freeze BrandScroller's marquee); reproduced
// instead a 100%-repro hydration mismatch on "/" and "/membership" across all 3
// projects (QA watchdog: "A tree hydrated but some attributes of the server
// rendered HTML didn't match the client properties"). Root cause traced into
// framer-motion, not this repo: `useReducedMotion()` (node_modules/framer-motion/
// dist/es/utils/reduced-motion/use-reduced-motion.mjs) lazily reads
// `window.matchMedia("(prefers-reduced-motion)")` SYNCHRONOUSLY on the first
// CLIENT render (module-level singleton, no effect gate — see state.mjs: "Returns
// `null` server-side"), so with the emulated media feature active from context
// creation, the client's first hydration pass sees `true` while SSR always saw
// `null` — a genuine (if narrow, pre-existing) SSR/CSR mismatch for any real user
// with OS-level reduced-motion on, surfaced here only because this is the first
// e2e spec to set the emulation. Out of scope to fix (framer-motion + every
// `useDeviceProfile`/`useReducedMotion` consumer, not this spec's files) — worked
// around instead by masking the one motion source it was protecting against
// (`brandScroller` below) and leaving page-load media emulation at Playwright's
// default ("no preference", matching SSR). The my-account describe block below
// still sets `reducedMotion: "reduce"` per this task's explicit instruction — that
// page's tree doesn't hit this hook on first render (verified: it passed clean
// across all 3 projects with it set), so no equivalent mismatch there.

/**
 * Known dynamic regions, masked (not asserted) on every capture that contains them.
 * Masking too much is safe (just shrinks the diffable area); masking too little is
 * what causes the documented flake sources below. Do NOT raise maxDiffPixelRatio
 * above 0.02 to work around a page that isn't stabilizing — mask the offending
 * region more precisely instead.
 */

// BrandScroller's `data-carousel="true"` root (src/components/ui/BrandScroller.tsx)
// — an Embla `AutoScroll`-driven infinite marquee of brand logos in the landing
// hero's "WIN AUSTRALIA'S TOP TOOL BRANDS" strip. It's a continuous rAF/JS scroll,
// not a CSS animation, so `animations: "disabled"` doesn't touch it; masked instead
// of relying on reducedMotion (see the file-level comment above for why). Several
// OTHER carousels on the site share this same attribute (PrizeShowcase,
// RecentWinnersCarousel, etc.) but none are within the "landing hero" test's
// viewport-only (`fullPage: false`) capture — only BrandScroller is above the fold.
const brandScroller = (page: Page): Locator => page.locator('[data-carousel="true"]');

// Header.tsx's `data-top-bar` container — the rotating promo/setup-reminder strip.
// TopBarPromoLeaf alternates its text+link every 3s (Header.tsx:68-113: "Join Tools
// Australia..." <-> "{multiplier}x bonus entries...monthly tool giveaway."), and is
// ALSO the documented color-contrast a11y exception on "/" and "/membership" (see
// e2e/specs/quality/a11y.spec.ts KNOWN_VIOLATIONS) confirming it cycles content on
// live captures. Present (when auth-resolved and not on /login or an affiliate page)
// on all three pages under test.
const topBar = (page: Page): Locator => page.locator("[data-top-bar]");

// Wait for the top bar's mount/dismiss race to settle before capturing. It only
// renders once `authStateResolved` flips client-side (Header.tsx:515), which is NOT
// covered by `waitForLoadState("networkidle")` (that tracks network activity only,
// not the follow-on React state update + re-render). Confirmed empirically: an
// early landing-hero baseline was captured mid-race with no top bar at all, and its
// ABSENCE shifts every element below it up by the bar's height (it's a normal-flow
// sibling of <nav>, not position:fixed) — a real, reproducible ~74% pixel diff
// against a later run that captured it present (see task-10-report.md). Waiting for
// EITHER outcome to settle (present, or confirmed absent after the same window)
// makes the two states consistent instead of racing between them.
async function waitForTopBarSettled(page: Page): Promise<void> {
  await topBar(page)
    .first()
    .waitFor({ state: "visible", timeout: 5_000 })
    .catch(() => {}); // guest/login/affiliate pages or a dismissed bar never mount it
}

// Polls a locator's bounding box until two consecutive reads match (or times out).
// FloatingCountdownBanner mounts via framer-motion's `AnimatePresence` + `m.div`
// (`initial={{opacity:0,y:100}} animate={{opacity:1,y:0}}`, spring transition) — a
// JS/WAAPI-driven transform, NOT a CSS animation/transition, so `animations:
// "disabled"` (which only zeroes CSS animation/transition durations) never touches
// it. Playwright's `mask` draws over the element's CURRENT bounding box, so a mask
// captured mid-slide covers a different region than one captured after it settles —
// confirmed empirically as a real, reproducible diff (~18% of the page) between two
// otherwise-identical runs, see task-10-report.md. `state: "visible"` alone doesn't
// guarantee the slide has finished, only that the element exists and isn't
// display:none/hidden.
async function waitForBoundingBoxStable(locator: Locator, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last: string | null = null;
  while (Date.now() < deadline) {
    const box = await locator.boundingBox().catch(() => null);
    const key = box ? `${box.x},${box.y},${box.width},${box.height}` : null;
    if (key !== null && key === last) return;
    last = key;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

// FloatingCountdownBanner's `data-floating-widget` root — a position:fixed, bottom-
// anchored major-draw countdown that ticks every second via useLeafTimer(1000)
// (src/components/banners/FloatingCountdownBanner.tsx). `animations: "disabled"`
// only freezes CSS animations/transitions, not this JS-driven tick, so an unmasked
// capture would never pass toHaveScreenshot's internal stabilization polling. Only
// mounted on "/" (grepped: the only importers are the component file itself and
// src/app/(site)/page.tsx — not /membership, not /my-account).
const floatingCountdown = (page: Page): Locator => page.locator("[data-floating-widget]");

// EntryWallet's "Draw closes in" / "Closes in" countdown (src/components/sections/
// dashboard/EntryWallet.tsx: `useLeafTimer(1000)` ticks `cd.d/h/m/s`, rendered as
// plain <span> CDBox cells — NOT a <time> element and NOT "hh:mm" text, so neither
// the brief's `page.locator("time")` nor a `/\d{1,2}:\d{2}/` regex would catch it).
// The seeded major draw's drawDate is RUN_TIME + 20 days (e2e/seed/draw.ts), so the
// rendered d/h/m values differ both within a run (ticking) and across runs/days.
// getByText resolves the innermost element containing the label text (the flex
// row's leading <span>); `.locator("..")` walks up to that row's parent, which also
// contains the sibling CDBox group — covering both the label and the ticking cells
// in one mask.
const drawCountdown = (page: Page): Locator => page.getByText(/closes in/i).locator("..");

// EntryWallet's "Land on your renewal" / "Waiting on your renewal" note — shown for
// an active member sitting at 0 membership entries (true for a freshly seeded
// subscription with no granted entries yet) or a past-due member. Its date comes
// from `user.subscription.endDate`, seeded as RUN_TIME + 30 days (e2e/seed/users.ts)
// and formatted with `toLocaleDateString` — a calendar date, not a ticking value, so
// it stays stable WITHIN a run but drifts a day at a time ACROSS runs/days (same
// class of bug as the draw countdown above, just slower). getByText matches the
// heading <span>; `.locator("..")` walks up to its parent <div>, which also holds
// the sibling date text/`<b>` in the same JSX block.
const renewalNote = (page: Page): Locator =>
  page.getByText(/land on your renewal|waiting on your renewal/i).locator("..");

// LoyaltyStreak's `CycleFuse` bar (src/components/sections/dashboard/LoyaltyStreak.tsx
// CycleFuse, fed by src/utils/dashboard/streak-display.ts deriveStreakCycleFuse(),
// called with `now = new Date()`): "Day {n} of {total}" + "Renews {date}" (e.g. "Day 2
// of 31" / "Renews 21 Aug") plus the fuse-bar fill width, all derived from `now` versus
// the same run-relative `renewalDateIso` as the renewal note above — same drift-across-
// runs/days problem, just a second, separately-rendered instance of it (found by
// eyeballing the baseline PNG, not by static analysis — this one doesn't use
// toLocaleDateString with the same call signature the renewal note does, so an earlier
// grep for that pattern alone missed it). getByText matches the "Day n of total" <span>;
// two `.locator("..")` hops reach CycleFuse's own wrapping <div> (span -> flex row ->
// CycleFuse root), covering the fill bar and both text cells in one mask.
const cycleFuse = (page: Page): Locator =>
  page.getByText(/^Day \d+ of \d+$/).locator("..").locator("..");

/**
 * my-account-only setup: two e2e-seed-data incompatibilities (confirmed by direct
 * reproduction, not assumed — see task-10-report.md) that make the dashboard's own
 * background fetches 500, which the QA watchdog then (correctly) treats as a real
 * failure. Both are pre-existing gaps in the e2e seed/read-only-member story, not
 * bugs introduced by this spec — stubbed here (test-side network interception only,
 * no src/ or e2e/seed/ changes) so the VISUAL capture isn't blocked by an unrelated,
 * already-flagged infra limitation.
 */
async function stubMyAccountFlakyReads(page: Page): Promise<void> {
  // /api/referrals/code: src/lib/referral.ts's getOrCreateReferralProfile() does a
  // FULL-DOCUMENT `user.save()` to lazily create the referral code, which re-runs
  // Mongoose schema validation on every field — including the email regex validator,
  // which rejects the seeded "e2e.member@e2e.local" address (`.local` TLD). Confirmed
  // directly: calling getOrCreateReferralProfile(seededUserId) outside the HTTP layer
  // throws `ValidationError: email: Please enter a valid email address`. The raw
  // `insertOne` seed (e2e/seed/users.ts) never goes through Mongoose validation, so
  // this only surfaces the moment something calls `.save()` on the fetched document.
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
  // /api/stripe/payment-methods: the dashboard fetches this unconditionally on every
  // /my-account load (not only when a payment-management flow is opened), and calls
  // `stripe.paymentMethods.list({ customer: user.stripeCustomerId, ... })` with the
  // seeded fake `stripeCustomerId: "cus_e2e_seeded_readonly"` (e2e/seed/users.ts),
  // which doesn't exist in Stripe test mode. This is the seed file's own documented
  // caveat ("read-only specs must NOT open flows that retrieve these ids from
  // Stripe") — turns out the dashboard itself is such a flow, not just the
  // subscription-management modal the comment named.
  await page.route("**/api/stripe/payment-methods", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, paymentMethods: [], subscriptionDefaultPaymentMethodId: null }),
    })
  );
}

test.describe("visual baselines @visual", () => {
  test("landing hero", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await waitForTopBarSettled(page);
    // networkidle (500ms of no network activity) comfortably outlasts the widget's
    // post-data-ready 100ms mount delay, but wait explicitly anyway so a slow CI run
    // never baselines the pre-mount gap (a blank bottom strip) instead of the masked
    // widget.
    const floatingCountdownAppeared = await floatingCountdown(page)
      .first()
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false); // gates-closed / no-draw states never mount it
    if (floatingCountdownAppeared) {
      await waitForBoundingBoxStable(floatingCountdown(page).first());
    }
    await expect(page).toHaveScreenshot("landing.png", {
      fullPage: false,
      animations: "disabled",
      maxDiffPixelRatio: 0.02,
      mask: [topBar(page), floatingCountdown(page), brandScroller(page), page.locator("time")],
    });
  });

  test("membership tiers", async ({ page }) => {
    await page.goto("/membership");
    await page.waitForLoadState("networkidle");
    await waitForTopBarSettled(page);
    await expect(page).toHaveScreenshot("membership.png", {
      animations: "disabled",
      maxDiffPixelRatio: 0.02,
      mask: [topBar(page), page.locator("time")],
    });
  });

  test.describe("my-account", () => {
    // Describe-level override (not a manual browser.newContext()) so this test keeps
    // full fixture coverage from e2e/fixtures/test.ts (QA watchdog, per-worker
    // x-forwarded-for, third-party blocklist) — same pattern as
    // e2e/specs/account/my-account.spec.ts.
    test.use({ storageState: MEMBER_STATE, contextOptions: { reducedMotion: "reduce" } });

    test("my-account dashboard", async ({ page }) => {
      await stubMyAccountFlakyReads(page);
      await page.goto("/my-account");
      await page.waitForLoadState("networkidle");
      // The dashboard renders <main> immediately behind a loading skeleton
      // (DashboardLoader) while session/account data resolves — wait for real
      // content (seeded member's firstName "E2E", same signal my-account.spec.ts
      // uses) so the baseline never captures the skeleton instead of the dashboard.
      await expect(page.locator("body")).toContainText(/e2e/i, { timeout: 20_000 });

      // A first-time active member gets a one-time "subscription explainer" tooltip
      // dialog ~2.5s after landing (src/app/(site)/my-account/page-client.tsx:207-219,
      // gated on hasSeenExplainer(userId) in localStorage — never set for a fresh e2e
      // context, so it fires on every run). It renders as a full-viewport overlay;
      // WHEN it opens relative to toHaveScreenshot's stabilization polling is a race
      // that produced a ~74% pixel diff between two otherwise-identical runs
      // (confirmed empirically — see task-10-report.md). Wait for it, close it, so
      // every capture is deterministically past it rather than racing it.
      const explainerDialog = page.getByRole("dialog");
      const explainerAppeared = await explainerDialog
        .first()
        .waitFor({ state: "visible", timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (explainerAppeared) {
        await page.getByRole("button", { name: "Got it" }).click();
        await expect(explainerDialog.first()).toBeHidden();
      }

      await expect(page).toHaveScreenshot("my-account.png", {
        animations: "disabled",
        maxDiffPixelRatio: 0.02,
        mask: [topBar(page), page.locator("time"), drawCountdown(page), renewalNote(page), cycleFuse(page)],
      });
    });
  });
});
