import { test, expect } from "../../fixtures/test";
import { CARDS, fillPaymentElement, findBenefitsGrantedRef, purchaseIdentity, waitForActiveMembership } from "../../helpers/payment";
import { benefitsGrantedCount, disconnectE2eDb, entriesForUser } from "../../helpers/db";

test.describe.configure({ mode: "serial" }); // one money-path flow at a time per project/worker
test.afterAll(async () => {
  await disconnectE2eDb();
});

/**
 * The FLAGSHIP end-to-end flow — the longest single journey the platform supports, under a
 * production-style promo, round-tripping every layer TWICE: UI → Stripe → webhook → DB → UI.
 *
 * Runs ONLY in journey mode (`npm run e2e:journey` → run.ts --promo 10 → E2E_PROMO=10):
 * an active membership promo multiplies EVERY subscription grant
 * (src/utils/payment/subscription-entries-calculator.ts:66), which would break the sibling
 * purchase specs' exact-count assertions and the /membership visual baselines if it leaked
 * into a shared run — and purchase legs run spec files in parallel within a leg, so a
 * spec-scoped insert/delete is NOT safe. The dedicated mode seeds the promo at
 * wipe-and-seed (e2e/seed/promo.ts) and runs this spec alone on one browser.
 *
 * stranger on "/" (10× promo live) → showcase → ENTER NOW → register (guest bridge)
 * → real Stripe payment → webhook grants 15×10 = 150 entries exactly once
 * → payment-proofed auto-login + the app's own router.push to /my-account
 * → the post-purchase upsell offer opens (Apprentice Pack, $9.99, 60% off) showing the
 *   PROMO-CORRECT artwork (membership/apprentice-{promo×10}x.webp — the effective-multiplier
 *   variant, upsell-image-selector.ts) — asserted loaded, not broken (finding #10 guard)
 * → ACCEPT: one-click charge of the just-saved card → upsell webhook grants
 *   3 × 10(category) × 10(promo) = 300 more entries exactly once
 * → the dashboard EntryWallet displays the combined 450.
 */
test.describe("full customer journey @purchase @demo", () => {
  // EXTERNAL mode: belt-and-suspenders — run.ts's --grep-invert "@purchase|@admin" already excludes this tag; this guards a direct `playwright test` invocation that bypasses run.ts.
  test.skip(process.env.E2E_EXTERNAL === "1", "needs the seeded isolated environment");
  // Journey mode only — see the header comment. Without the promo, the upsell modal's
  // image fallback chain also dead-ends at the missing _fallback.webp (product finding
  // #10), tripping the watchdog on a 400 before the flow even finishes.
  test.skip(!process.env.E2E_PROMO, "journey runs under an active promo — npm run e2e:journey");

  test("stranger to member under a 10x promo: showcase entry, payment, upsell accepted, dashboard shows all 450 entries", async ({ page, demo }) => {
    // Two real Stripe payments + two webhook grants + the dashboard leg.
    test.setTimeout(300_000);
    const promo = Number(process.env.E2E_PROMO); // 5 | 10 (validated by run.ts + seed)
    const membershipEntries = 15 * promo; //  Tradie entriesPerMonth × promo (webhook: base × promo)
    const upsellEntries = 3 * 10 * promo; //  apprentice base 3 × category multiplier 10 (UpsellMultiplierConfig default) × promo
    const totalEntries = membershipEntries + upsellEntries;
    // Hero artwork is themed for the EFFECTIVE multiplier (promo × category), and the
    // upsell offers the APPRENTICE pack (membership-upsell-tradie → apprentice-pack):
    // upsell-image-selector.ts resolves membership/apprentice-{eff}x.webp.
    const expectedUpsellImage = `apprentice-${promo * 10}x.webp`;

    // Client-facing opening card (demo.ts reads this annotation lazily at the first step).
    test.info().annotations.push({
      type: "demo-title",
      description: `The full journey — first visit to member dashboard, during a ${promo}× promo`,
    });
    const { email, mobile } = purchaseIdentity("journey", test.info());

    const prizeBuilderSection = page.locator("section.prize-builder");
    const enterNowButton = prizeBuilderSection.getByRole("button", { name: /enter now/i });
    const purchaseButton = page.getByRole("button", { name: /^purchase$/i });

    // Warm the route BEFORE the first beat (proof-mode round-3 rule).
    await page.goto("/");
    await expect(page.locator("section.hero-section")).toBeVisible({ timeout: 45_000 });

    await demo.step(`A first-time visitor lands — during a live ${promo}× free-entries promo`, async () => {
      await expect(page.locator("section.hero-section")).toBeVisible();
      // Panel fix (Judge H): the caption's subject is the LIVE PROMO — spotlight the
      // site's own "10x bonus entries are live now" top-bar announcement as its evidence.
      // Ring only, NO note label: the label sat exactly on top of the one-line banner and
      // covered the copy it was pointing at (panel r2, f-5.8).
      const promoBar = page.getByText(new RegExp(`${promo}x bonus entries`, "i")).first();
      await demo.highlight(promoBar);
    });

    // Short caption on purpose: caption dwell scales with length (holdFor), and this
    // beat's subject only enters frame after the scroll glide — a long caption left ~4s
    // of static hero under it (panel r2, all three judges flagged f-9.6).
    await demo.step("The journey starts at ENTER NOW", async () => {
      await demo.smoothScrollTo(enterNowButton);
      await demo.highlight(enterNowButton, "The journey starts here");
      await enterNowButton.click();
    });

    await demo.step("A quick account first — name, email, mobile. No card, no charge yet", async () => {
      const modalPanel = page.getByRole("dialog").getByRole("document");
      await demo.highlight(modalPanel);
      // Panel fix (Judge R, interaction legibility): humanly-paced typing so the viewer
      // can watch the form fill — .fill() pastes instantly, which reads as a jump cut.
      // 30ms/keystroke ≈ +3s total, well inside the beat's window. No-op cost outside
      // proof mode is acceptable: this spec only runs in journey mode.
      await page.locator('input[name="firstName"]').pressSequentially("E2E", { delay: 30 });
      await page.locator('input[name="lastName"]').pressSequentially("Journey", { delay: 30 });
      await page.locator('input[name="email"]').pressSequentially(email, { delay: 30 });
      await page.locator('input[name="phone"]').pressSequentially(mobile, { delay: 30 });
      await page.getByRole("button", { name: /register/i }).click();
    });

    await demo.step("Stripe takes the card on its own secure form — we never see the number", async () => {
      await expect(purchaseButton).toBeVisible({ timeout: 45_000 });
      const stripeIframe = 'iframe[name^="__privateStripeFrame"], iframe[title*="payment" i]';
      const paymentFrame = page.locator(stripeIframe).first();
      await page
        .frameLocator(stripeIframe)
        .first()
        .getByRole("textbox", { name: /card number/i })
        .waitFor({ state: "visible", timeout: 20_000 });
      await demo.highlight(paymentFrame, "Stripe's secure form");
      // Watchable card entry (panel r2, Judge R): typed digits, not an instant paste.
      await fillPaymentElement(page, CARDS.ok, { delay: 25 });
      await expect(purchaseButton).toBeEnabled({ timeout: 30_000 });
      // Re-spotlight onto the click target (video-review Judge H: clicks land inside the ring).
      await demo.highlight(purchaseButton, "Complete purchase");
      await purchaseButton.click();
    });

    let userId = "";
    // Caption reworded per panel (Judge N): the earlier "turns 15 into 150" phrasing
    // claimed an on-screen transformation no frame evidences — the multiplied figure is
    // what's actually visible (the package card reads "150 free entries every month").
    await demo.step(`Payment clears — with the live ${promo}× promo, the membership lands ${membershipEntries} free entries automatically`, async () => {
      // Outcome asserted at the DATABASE, not the pixels (spec §9).
      const result = await waitForActiveMembership(email, 180_000);
      userId = result.userId;
      expect(result.entries).toBe(membershipEntries);
      await expect(page.getByText(/transaction complete/i)).toBeVisible({ timeout: 20_000 });
    });

    // Exactly-once: precisely one BenefitsGranted event for the membership invoice.
    const membershipRef = await findBenefitsGrantedRef(userId, "membership");
    expect(membershipRef.kind).toBe("invoice");
    expect(await benefitsGrantedCount(membershipRef.kind, membershipRef.id)).toBe(1);

    // The app itself signs the new member in (payment-proofed auto-login) and navigates
    // to /my-account on its own ~3s timer — deliberately NOT a manual page.goto:
    // arriving authenticated IS behavior under test. The deferred upsell offer
    // (sessionStorage pendingUpsell, MembershipModal's unauthenticated-closure path)
    // opens here once session + account data load.
    await page.waitForURL(/\/my-account/, { timeout: 30_000 });

    await demo.step("A member-only bonus offer appears — with the promo's own artwork", async () => {
      // Accept button carries the price + saved-card chip: "Purchase - $9.99 •••• 4242"
      // (AcceptDeclineRow.tsx) — disabled until the payment method resolves.
      const acceptButton = page.getByRole("button", { name: /purchase - \$9\.99/i });
      await expect(acceptButton).toBeEnabled({ timeout: 45_000 });

      // DJ requirement: the CORRECT promo-variant hero must render — and actually load.
      // (The no-promo fallback chain dead-ends at a missing _fallback.webp → broken img,
      // finding #10 — this guards the promo path against the same class of defect.)
      const heroImage = page.locator(`img[src*="${expectedUpsellImage}"]`).first();
      await expect(heroImage).toBeVisible({ timeout: 15_000 });
      const naturalWidth = await heroImage.evaluate((el) => (el as HTMLImageElement).naturalWidth);
      expect(naturalWidth, `upsell hero ${expectedUpsellImage} must actually load (broken-image guard)`).toBeGreaterThan(0);
      await demo.highlight(heroImage, `The ${promo * 10}× offer artwork — correct for this promo`);
    });

    await demo.step(`One tap — the saved card covers it, and ${upsellEntries} more free entries are on the way`, async () => {
      const acceptButton = page.getByRole("button", { name: /purchase - \$9\.99/i });
      await demo.highlight(acceptButton, "Accept with the saved card");
      await acceptButton.click();
      // One-click charge → PaymentProcessingScreen polls /api/payment-status until the
      // upsell webhook lands (~5-15s), then the success screen confirms.
      await expect(page.getByText(/upsell successful/i)).toBeVisible({ timeout: 90_000 });
      // Panel fix (Judge H, the min-score defect): the accept-button ring is now stale —
      // and its box sat exactly over the success card's entries line in the first render.
      // demo.highlight REPLACES the single fixed-id ring, moving the spotlight onto the
      // very line the narration is describing.
      // Highlight the benefit ROW (parent container), not the bare text node: ringing the
      // text's own boundingBox clipped the string inside its own spotlight (panel r2,
      // f-60.5 read as "00 free entries added to your accoun").
      await demo.highlight(
        page.getByText(new RegExp(`${upsellEntries} free entries added`, "i")).first().locator(".."),
        "Granted the moment it clears"
      );
    });

    // Exactly-once for the SECOND payment too: one BenefitsGranted-<pi> upsell event.
    const upsellRef = await findBenefitsGrantedRef(userId, "upsell");
    expect(upsellRef.kind).toBe("pi");
    expect(await benefitsGrantedCount(upsellRef.kind, upsellRef.id)).toBe(1);
    // And the draw position holds BOTH grants — no more, no less.
    await expect.poll(() => entriesForUser(userId), { timeout: 30_000 }).toBe(totalEntries);

    // Settle overlays BEFORE the final beat (same rule as warm-before-first-beat): the
    // success screen auto-closes (~3s), then the brand-new member's profile-setup wizard
    // force-opens (~500ms later — SET PASSWORD step, they're passwordless). demo.step
    // paints its caption the instant it's called, so doing this inside the beat captioned
    // "their wallet shows 450" over the wizard for ~5s (frame-verified at t=61.4s in the
    // first flagship render). Close everything first; the beat then opens on its subject.
    await page.waitForTimeout(4_500);
    for (let i = 0; i < 3; i++) {
      if ((await page.getByRole("dialog").count()) === 0) break;
      await page.keyboard.press("Escape");
      await page.waitForTimeout(700);
    }
    const wallet = page.locator("section").filter({ hasText: "Entries ·" }).first();
    await expect(wallet).toBeVisible({ timeout: 30_000 });

    // Shorter caption → shorter dwell → the wallet ring lands within the cue window
    // instead of its final second (panel r2, Judge H on f-68.5).
    await demo.step(`All ${totalEntries} free entries — membership and bonus together`, async () => {
      const walletTotal = wallet.locator("span.num.font-poppins.tabular-nums");
      await expect(walletTotal).toHaveText(String(totalEntries), { timeout: 30_000 });
      await demo.smoothScrollTo(wallet);
      await demo.highlight(wallet, `${totalEntries} free entries — already in the draw`);
    });
  });
});
