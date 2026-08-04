import mongoose from "mongoose";
import type { Page } from "@playwright/test";
import { test, expect } from "../../fixtures/test";
import { CARDS, fillPaymentElement, uniqueMobile } from "../../helpers/payment";
import { connectE2eDb, disconnectE2eDb, entriesForUser } from "../../helpers/db";

/**
 * F-01 REGRESSION GUARD — "Dashboard entry hold is never released when the purchase
 * completes on a page that doesn't mount the dashboard, permanently freezing the member's
 * entry count at its pre-purchase value." (optimistic-UI audit, 2026-08-03 — FIXED same day)
 *
 * This spec originally asserted the DEFECT was present, and was the proof it existed. It now
 * asserts the CORRECT behaviour, so it fails if the leak ever returns. If it goes red, the
 * dashboard has stopped showing entries bought elsewhere — re-read the release path below
 * before touching this file.
 *
 * WHAT THE BUG IS
 * `usePurchaseMembership.onMutate` arms a module-level "entry hold"
 * (src/utils/dashboard-entry-hold.ts) that freezes the dashboard's entry buckets at their
 * pre-purchase values, so EntryWallet's AnimatedNumber runs exactly once after the global
 * success overlay closes instead of ticking mid-celebration.
 *
 * WHAT WAS WRONG: the hold's only success-side release was an effect inside
 * `useDashboardEntryDisplay` (src/hooks/useDashboardEntryDisplay.ts) that fires when
 * `isSuccessScreenVisible` goes true -> false. That effect exists only while a component using
 * `useDashboardState` is MOUNTED — i.e. only on /my-account. Buying anywhere else (the
 * globally-mounted MembershipModal / SpecialPackagesModal) left nobody to observe the
 * transition, so the hold stayed armed for the rest of the SPA session.
 *
 * THE FIX: `LoadingContext.hideSuccess()` now calls `clearDashboardEntryHold()`. That provider
 * is mounted globally, so it observes the success overlay closing on EVERY page — the hold is
 * released by the thing that actually owns the event. The `HOLD_MAX_MS` timer in
 * dashboard-entry-hold.ts is only a backstop; if it is ever what releases a hold in practice,
 * that is a bug in the flow that armed it, not normal operation.
 *
 * WHY THE SHAPE IS WHAT IT IS — every item below is a fix for an observed failure of an
 * earlier draft (2026-08-03, runs 1-8). Do not "simplify" them.
 *
 *  1. ONE real Stripe payment, on a pre-seeded account. An earlier draft registered a guest
 *     and bought TWICE to build up a starting entry balance. That path drags in the whole
 *     post-registration modal stack — the post-purchase UpsellModal AND the 3-step
 *     UserSetupModal ("SET PASSWORD"), because /api/auth/register creates PASSWORDLESS users —
 *     and those overlays cover the header, so no navigation is reachable. `createLoginableUser`
 *     (the `freshUser` fixture) makes a user with a password and `profileSetupCompleted: true`,
 *     so neither modal raises. Starting state is written straight to the DB instead.
 *
 *  2. The account must be an ACTIVE MEMBER, not merely a holder of entries. /my-account gates
 *     the EntryWallet on MEMBER STATUS: a user with a seeded entry position but no subscription
 *     renders the guest dashboard ("Become a member", "Streak · Members only") with no wallet
 *     at all, so the wallet locator finds nothing (frame-verified, run 7).
 *
 *  3. The payment must be REAL, not a stubbed response. The hold is armed in `onMutate` and
 *     cleared in `onError`, so a stubbed failure clears it and hides the bug. Only a genuinely
 *     successful purchase leaves it armed.
 *
 *  4. The RETURN trip to /my-account must be a client-side <Link> click, never `page.goto`.
 *     The hold lives in a module-level `let`, so a full document load resets it and the bug
 *     silently disappears — the easiest way to write a green test that proves nothing.
 *     (Reaching /membership beforehand CAN be a goto; nothing is armed yet at that point.)
 *
 *  5. The direction is NOT symmetric, which is why the flow buys on /membership and clicks
 *     back. /my-account is a closed shell: it renders its own sidebar, and every outbound
 *     anchor in its DOM (/, /membership, /shop, footer links) is present but INVISIBLE, so
 *     there is no clickable dashboard -> public route at all (live DOM probe, run 8). The
 *     public /membership page does expose a visible "My Account" link.
 *
 *  6. Nav locators are `:visible`-filtered. The header renders BOTH a desktop and a mobile copy
 *     of each link and hides one by breakpoint, so a bare `.first()` can resolve to the hidden
 *     copy and burn the click's whole timeout ("element is not visible" x59, run 4).
 *
 *  7. Every click carries an explicit timeout. `playwright.config.ts` sets no `actionTimeout`,
 *     so an intercepted click waits FOREVER — one pointer-blocked click consumed an entire
 *     20-minute test budget and reported only "Test timeout exceeded", pointing at nothing.
 *
 *  8. The hold must capture the real pre-purchase figure (3), so
 *     `queryKeys.majorDraw.userStats` has to be warm when onMutate runs. /membership warms it
 *     itself (MembershipSection.tsx:111 mounts `useUserMajorDrawStats`; GET /api/major-draw was
 *     observed firing there), and this spec waits for that response before paying. A cold cache
 *     instead arms the hold at ZEROS — a different, separately-filmed defect (F-02).
 *
 * WHAT THE LAST TWO BEATS GUARD: returning to the dashboard shows the LIVE entry total with no
 * reload, and a subsequent reload agrees with it. Before the fix the first of those rendered
 * the frozen pre-purchase figure indefinitely and only the reload revealed the truth — so if
 * this spec ever fails on the no-reload beat, the hold is leaking again.
 */

/**
 * Make `userId` an ACTIVE MEMBER holding `count` free entries in the current draw (see
 * rationale 2 for why the membership half is required).
 *
 * Subscription block mirrors e2e/seed/users.ts's seeded member with ONE deliberate omission:
 * no `stripeCustomerId`. The seeded member carries a FAKE one (`cus_e2e_seeded_readonly`) that
 * makes every real payment 400 with "No such customer" — a caveat recorded in seed/users.ts.
 * Leaving the field ABSENT lets the purchase create a genuine Stripe customer.
 */
async function makeActiveMemberWithEntries(userId: string, count: number): Promise<void> {
  const db = await connectE2eDb();
  const now = new Date();
  const in30d = new Date(now.getTime() + 30 * 24 * 3600 * 1000);

  await db.connection.collection("users").updateOne(
    { _id: new mongoose.Types.ObjectId(userId) },
    {
      $set: {
        // A MOBILE IS REQUIRED TO PAY. MembershipModal creates the Stripe payment Element with
        // fields.billing_details = "never", so stripe.confirmPayment() must be handed
        // payment_method_data.billing_details.phone explicitly. With no mobile on the account the
        // app passes nothing and Stripe.js throws IntegrationError, the charge never happens, and
        // the run dies with "Entries stalled at 3, expected 6" (run 12). createLoginableUser does
        // not set one; real registrations always do (register route enforces the AU mobile regex).
        // NOTE: worth checking whether any real signup path can reach checkout WITHOUT a mobile
        // (e.g. Google OAuth) — that account would be unable to pay with a new card at all.
        mobile: uniqueMobile(userId),
        subscription: {
          packageId: "tradie-subscription",
          status: "active",
          isActive: true,
          startDate: now,
          endDate: in30d,
          autoRenew: true,
        },
      },
    }
  );

  // `totalEntries` MUST equal the entriesBySource sum — EntryWallet renders the bucket sum
  // while helpers/db.ts entriesForUser() reads totalEntries (seed/draw.ts records this).
  // Typed so `$push: { entries }` checks against a real array field — the untyped
  // `collection()` overload infers PushOperator<AnyObject> and rejects the subdoc.
  const draws = db.connection.collection<{ status: string; entries: unknown[]; totalEntries: number }>("majordraws");
  const res = await draws.updateOne(
    { status: "active" },
    {
      $push: {
        entries: {
          userId: new mongoose.Types.ObjectId(userId),
          totalEntries: count,
          entriesBySource: { membership: count },
          firstAddedDate: now,
          lastUpdatedDate: now,
        },
      },
      $inc: { totalEntries: count },
    }
  );
  if (res.matchedCount !== 1) throw new Error("makeActiveMemberWithEntries: no active major draw to seed into");
}

/** Poll until the account's major-draw entry total REACHES `expected` (not merely > 0). */
async function waitForEntryTotal(userId: string, expected: number, timeoutMs: number): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let seen = -1;
  while (Date.now() < deadline) {
    seen = await entriesForUser(userId);
    if (seen >= expected) return seen;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Entries stalled at ${seen}, expected ${expected} within ${timeoutMs / 1000}s (webhook not processed?)`);
}

/**
 * The post-purchase UpsellModal is globally mounted, is raised by an async
 * `/api/upsell/trigger` round-trip (not synchronously with the payment), re-raises on
 * navigation, and its overlay intercepts pointer events on everything behind it. Clearing it
 * ONCE after the purchase was not enough — clear it immediately before each subsequent click.
 * Exact label read off run 2's failure screenshot.
 */
async function dismissUpsellIfRaised(page: Page, appearMs: number): Promise<void> {
  const decline = page.getByRole("button", { name: /no thanks, maybe later/i }).first();
  if (!(await decline.isVisible({ timeout: appearMs }).catch(() => false))) return;
  await decline.click({ timeout: 20_000 });
  await expect(decline).toBeHidden({ timeout: 20_000 });
}

test.describe.configure({ mode: "serial" }); // one money-path flow at a time per project/worker

test.afterAll(async () => {
  await disconnectE2eDb();
});

test.describe("optimistic-ui F-01 entry hold @purchase @demo", () => {
  // EXTERNAL mode: belt-and-suspenders — run.ts's --grep-invert "@purchase|@admin" already
  // excludes this tag; this guards a direct `playwright test` invocation bypassing run.ts.
  test.skip(process.env.E2E_EXTERNAL === "1", "needs the seeded isolated environment");

  test("F-01: entries bought away from the dashboard never appear on it", async ({ page, demo, freshUser }) => {
    test.setTimeout(600_000);

    // SEPARATE, PRE-EXISTING PRODUCT BUG — not what this spec is about, but it would fail every
    // run here via the QA watchdog's console-error guard.
    //
    // `src/utils/upsell/upsell-image-selector.ts:5` resolves its global placeholder to
    // `/images/upsells/_fallback.webp`, but that file DOES NOT EXIST in the repo —
    // `public/images/upsells/` ships only a 0-byte `_fallback.gitkeep`. The request 404s, Next's
    // image optimizer then answers 400 ("isn't a valid image ... received null"), the browser
    // logs a console error, and the UpsellModal renders visibly broken alt text instead of
    // artwork (frame-verified in run 2's failure screenshot).
    //
    // Fulfilled with a valid 1x1 PNG rather than shadowing the watchdog fixture: the guard stays
    // fully armed for every OTHER console error and 5xx here, and the scope is exactly one asset
    // path. Reported separately as an audit finding — this stub is not the fix.
    const ONE_BY_ONE_PNG = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );
    await page.route(/_fallback\.webp/, (route) =>
      route.fulfill({ status: 200, contentType: "image/png", body: ONE_BY_ONE_PNG })
    );

    test.info().annotations.push({
      type: "demo-title",
      description: "Bug F-01 — free entries bought away from the dashboard never show up on it",
    });

    // EntryWallet's hero figure. Provable-unique: within the wallet only the hero total span
    // carries BOTH font-poppins AND tabular-nums (EntryWallet.tsx:117) — countdown digits lack
    // font-poppins, legend values lack both. Selector lifted verbatim from the already-verified
    // account/my-account.spec.ts. `hasText` is case-insensitive, which is why "Entries ·"
    // matches the uppercased "ENTRIES ·" the wallet renders.
    const wallet = page.locator("section").filter({ hasText: "Entries ·" }).first();
    const walletTotal = wallet.locator("span.num.font-poppins.tabular-nums");

    // ------------------------------------------------------------------ setup (not narrated)
    const user = await freshUser();
    await makeActiveMemberWithEntries(user.id, 3);

    await page.goto("/login");
    await page.locator('input[name="email"]').fill(user.email);
    await page.locator('input[name="password"]').fill(user.password);
    await page.getByRole("button", { name: /^sign in$/i }).click({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/my-account/, { timeout: 45_000 });

    // ------------------------------------------------------------------ the story
    await demo.step("The member's dashboard: 3 free entries, confirmed by the server", async () => {
      await expect(walletTotal).toHaveText("3", { timeout: 60_000 });
      await demo.highlight(wallet, "3 free entries");
    });

    await demo.step("They head to the membership page and pick up a pack", async () => {
      // goto is deliberate and safe here — nothing is armed yet (rationale 4). Arm the response
      // wait BEFORE navigating so a fast reply cannot be missed; this is what guarantees
      // majorDraw.userStats is warm before the purchase (rationale 8).
      const statsLoaded = page.waitForResponse(
        (r) => r.url().includes("/api/major-draw") && r.request().method() === "GET" && r.status() === 200,
        { timeout: 60_000 }
      );
      await page.goto("/membership");
      await statsLoaded;

      // Signed-in members get the one-time ladder already expanded — the "show one-time pack
      // catalogue" toggle is guest-only (verified live against the running app).
      const pack = page.getByRole("button", { name: /apprentice pack/i }).first();
      await expect(pack).toBeVisible({ timeout: 30_000 });
      await pack.scrollIntoViewIfNeeded();

      // dispatchEvent, not click(): the pack card is visible, enabled and stable, but a sibling
      // `div.mt-12` / the tier-card grid intercepts pointer events at the card's CENTRE, so a
      // real click never lands (run 9 retried for 30s, alternating between two interceptors —
      // the grid animates via `hover:-translate-y-1.5`). dispatchEvent fires directly on the
      // element and is what the live MCP probe did when this flow was first verified by hand.
      //
      // This is NOT papered over: the very next beat waits for the payment modal's submit
      // button, so if the dispatch failed to open MembershipModal this test fails there. The
      // interception itself is worth a separate look — a decorative overlay sitting on top of
      // purchasable cards is a real hit-target smell — but it is out of scope for F-01.
      await pack.dispatchEvent("click");
    });

    await demo.step("Paying — this is where the dashboard's entry counter gets frozen", async () => {
      // Signed-in billing submit label differs from the guest one
      // (PaymentStep.tsx: isAuthenticated ? "PURCHASE & ENTER THE DRAW" : "PURCHASE").
      const memberPurchase = page.getByRole("button", { name: /purchase & enter the draw/i });
      await expect(memberPurchase).toBeVisible({ timeout: 90_000 });

      // MUST select "Add New Payment Method" first, even though the card form is already
      // rendered. MembershipModal/index.tsx:737 does `setUseSavedPaymentMethod(isAuthenticated)`,
      // so a signed-in buyer starts in "use a saved card" mode — and in that mode
      // `isFormValid` (index.tsx:4650-4655) reduces to `selectedPaymentMethod !== null`. This
      // account has no saved cards, so the submit button stays disabled no matter how
      // completely the card fields are filled (run 10: card visibly entered, button dead).
      // Clicking this row flips the flag (index.tsx:1903/1922/1934) into the card-form branch.
      // Guest purchase specs never hit this because `isAuthenticated` is false for them.
      const addNewCard = page.getByRole("button", { name: /add new payment method/i }).first();
      if (await addNewCard.isVisible({ timeout: 10_000 }).catch(() => false)) {
        await addNewCard.click({ timeout: 20_000 });
      }

      await fillPaymentElement(page, CARDS.ok);
      await expect(memberPurchase).toBeEnabled({ timeout: 30_000 });
      await memberPurchase.click({ timeout: 30_000 });
    });

    await demo.step("Payment confirmed — the server has granted the new entries", async () => {
      // Asserted at the DATABASE, not the pixels — webhook grant processing is in-process
      // (`after()`), so poll rather than expect a synchronous UI transition.
      const total = await waitForEntryTotal(user.id, 6, 180_000);
      // A FLOOR, not an exact figure. The pack adds 3 (3 -> 6), but the seeded Tradie
      // subscription grants its own 15/mo shortly afterwards, so the true total keeps climbing
      // (run 13 observed 21 by the time the page reloaded). Asserting toBe(6) pinned a number
      // that is only briefly correct.
      expect(total, "the purchase must grant at least the pack's 3 free entries on top of the starting 3").toBeGreaterThanOrEqual(6);
    });

    await demo.step("Back on the dashboard — the new entries are already there", async () => {
      // Let the success overlay finish its ~4.5s auto-close, so the ONLY reason the number could
      // still be stale is the unreleased hold rather than an overlay still up.
      await page.waitForTimeout(8_000);
      await dismissUpsellIfRaised(page, 20_000);

      // CLIENT-SIDE nav (rationale 4/5) — a goto here would reset the hold and hide the bug.
      const linkToAccount = page.locator('a[href="/my-account"]:visible').first();
      await linkToAccount.click({ timeout: 30_000 });
      await expect(page).toHaveURL(/\/my-account/, { timeout: 30_000 });

      // THE REGRESSION GUARD. Before the fix this rendered the frozen pre-purchase "3"
      // indefinitely (only a hard refresh cleared it), because the hold's sole success-side
      // release lived in a hook that exists only while /my-account is mounted — and this
      // purchase happened on /membership. `LoadingContext.hideSuccess()` now releases it
      // globally, so the live figure is on screen without a reload.
      //
      // Asserted against LIVE server truth rather than a literal: the pack takes the account
      // 3 -> 6, but the seeded Tradie subscription's own monthly entries land shortly after,
      // so any hard-coded number here is a race (an earlier draft pinned "6" and saw 21).
      // The two things that must hold are: it agrees with the server, and it is no longer 3.
      await expect
        .poll(
          async () => {
            const shown = (await walletTotal.innerText()).trim();
            const db = String(await entriesForUser(user.id));
            return shown === db ? "match" : shown + " != " + db;
          },
          {
            timeout: 30_000,
            message: "F-01 regression: the dashboard must show the live entry total without a reload",
          }
        )
        .toBe("match");

      const shownWithoutReload = Number((await walletTotal.innerText()).trim());
      expect(
        shownWithoutReload,
        "F-01 regression: the wallet is stuck on the pre-purchase figure again"
      ).toBeGreaterThan(3);
      await demo.highlight(wallet, shownWithoutReload + " — the new entries, no refresh needed");
    });

    await demo.step("And a refresh confirms it — the number was already right", async () => {
      // Pre-fix this beat was the REVEAL: a document load reset the module-level hold and the
      // real figure finally appeared, proving the wrong number had been client-side predicted
      // state rather than a data problem. Post-fix it is the control in the other direction —
      // the reload must agree with what was already on screen, showing the pre-reload value
      // was genuinely correct and not a coincidence.
      await page.reload();
      // Poll the rendered figure against LIVE server truth instead of a hard-coded number: more
      // entries can still be landing (see beat 4), so any fixed expectation is a race.
      await expect
        .poll(
          async () => {
            const shown = (await walletTotal.innerText()).trim();
            const db = String(await entriesForUser(user.id));
            return shown === db ? "match" : shown + " != " + db;
          },
          { timeout: 90_000, message: "after a reload the wallet must agree with the server" }
        )
        .toBe("match");

      const shown = Number((await walletTotal.innerText()).trim());
      expect(shown, "the real figure must be higher than the frozen 3").toBeGreaterThan(3);
      await demo.highlight(wallet, shown + " — correct only after a manual refresh");
    });
  });
});
