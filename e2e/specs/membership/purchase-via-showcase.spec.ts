import { test, expect } from "../../fixtures/test";
import { CARDS, fillPaymentElement, findBenefitsGrantedRef, purchaseIdentity, waitForActiveMembership } from "../../helpers/payment";
import { benefitsGrantedCount, disconnectE2eDb } from "../../helpers/db";

test.describe.configure({ mode: "serial" }); // one money-path flow at a time per project/worker
test.afterAll(async () => {
  await disconnectE2eDb();
});

test.describe("purchase via homepage prize showcase @purchase @demo", () => {
  // EXTERNAL mode: belt-and-suspenders — run.ts's --grep-invert "@purchase|@admin" already excludes this tag; this guards a direct `playwright test` invocation that bypasses run.ts.
  test.skip(process.env.E2E_EXTERNAL === "1", "needs the seeded isolated environment");

  test("guest enters through the Build-your-prize showcase: payment → webhook → 15 entries exactly once", async ({ page, demo }) => {
    // See purchase-subscription.spec.ts's identical note: generous budget for
    // full 3-project concurrent runs against one `next dev` server.
    test.setTimeout(300_000);
    // Client-facing opening card (demo.ts reads this annotation): the test title above is a
    // spec id — "webhook"/"exactly once" is engineer language, wrong audience for proof videos.
    test.info().annotations.push({
      type: "demo-title",
      description: "Becoming a Tools Australia member — 15 free entries included",
    });
    const { email, mobile } = purchaseIdentity("showcase", test.info());

    // FLOW VERIFIED LIVE (npm run e2e:env + a Playwright probe script, chromium-desktop, 2026-07):
    // the landing page's "Build your prize" configurator (PrizeShowcase → PrizeBuilderCard →
    // PrizeBuilderCta) renders its OWN "Enter now →" CTA inside `section.prize-builder` — a
    // distinct DOM node from the other 8 "Enter Now"-ish buttons on "/" (MembershipSection's 3
    // tier cards, a floating get-entries button, etc; `section.prize-builder` scoping is what
    // makes this unambiguous). Clicking it calls useMajorDrawEntryCta().openEntryFlow({
    // openLocalModal: false }), which — for a guest with no blocking subscription — dispatches a
    // global `openMembershipModal` window CustomEvent carrying the Tradie SUBSCRIPTION plan
    // (getHeavyDutyPack() → getTradieSubscriptionPlan(), since hasAdditionalPackageAccess is
    // false for a brand-new guest). `MembershipSection`'s `useOpenMembershipModalListener` picks
    // that event up and opens the SAME two-step MembershipModal ("Your Details" → "Billing Info")
    // that purchase-subscription.spec.ts drives from `/membership` directly, preselected on
    // Tradie ($20/giveaway, 15 free entries/month). So the OUTCOME shape here is identical to
    // that spec (subscription purchase, invoice-keyed BenefitsGranted) — only the ENTRY POINT
    // differs, which is the whole point of this spec: proving the homepage showcase's CTA reaches
    // the same, correct purchase flow.
    const prizeBuilderSection = page.locator("section.prize-builder");
    const enterNowButton = prizeBuilderSection.getByRole("button", { name: /enter now/i });
    const purchaseButton = page.getByRole("button", { name: /^purchase$/i });

    // Warm the route BEFORE the first demo.step, not inside it: `demo.step` paints its
    // caption overlay on whatever page is currently loaded the INSTANT it's called (see
    // demo.ts's showCaption) — with the goto living inside the step body, the opening
    // caption showed over the still-blank tab, before navigation had even started
    // (video-review.md Judge R: "opening beat never captions over a blank page"). Doing
    // the goto + waiting for real content here, silently, means the first caption always
    // lands on an already-rendered homepage. `section.hero-section` is the single Hero
    // wrapper (src/components/sections/Hero.tsx) — the largest, first-painted landmark on
    // "/", present regardless of viewport (mobile/desktop layouts share the one section).
    await page.goto("/");
    await expect(page.locator("section.hero-section")).toBeVisible({ timeout: 45_000 });

    await demo.step("A guest lands on the Tools Australia home page — every free-entry journey starts here", async () => {
      // Page already warmed above — this beat just holds the caption over the rendered
      // homepage (also re-asserts the hero didn't disappear, so this isn't a bare no-op).
      await expect(page.locator("section.hero-section")).toBeVisible();
    });

    await demo.step("This is where a customer starts — the pack's free entries are already locked in, before checkout", async () => {
      // smoothScrollTo the CTA itself, not just the section heading: `.prize-builder` is taller
      // than one 1440x900 viewport and the CTA sits in the lower half of its desktop layout, so
      // scrolling to the section's top would leave the CTA below the fold when the highlight and
      // caption show (verified live via the same probe).
      await demo.smoothScrollTo(enterNowButton);
      await demo.highlight(enterNowButton, "Tap here to start");
      await enterNowButton.click();
    });

    await demo.step("Creating the account first — no card, no charge, just what's needed to enter the draw", async () => {
      // The modal's inner content panel carries `role="document"` (ModalContainer.tsx), nested
      // inside the outer `role="dialog"` overlay — scoping through `dialog` avoids the browser's
      // own implicit top-level "document" role also matching `getByRole("document")` unscoped.
      //
      // Deliberately does NOT wait for the "Your Details" → "Billing Info" transition here (that
      // wait moved to the next beat's start) — verified live via rendered proof-mode frames: the
      // billing panel is TALLER than the registration one, and waiting for it inside this same
      // beat left the highlight ring pinned to the old, now-too-small box while this beat's own
      // "no card, no charge" caption was still on screen next to the (already-visible) card form —
      // both a stale ring (demo.ts's documented resize constraint) and a caption briefly
      // contradicted by what was on screen.
      await demo.highlight(page.getByRole("dialog").getByRole("document"), "Just the basics");
      await page.locator('input[name="firstName"]').fill("E2E");
      await page.locator('input[name="lastName"]').fill("Showcase");
      await page.locator('input[name="email"]').fill(email);
      await page.locator('input[name="phone"]').fill(mobile);
      await page.getByRole("button", { name: /register/i }).click();
    });

    await demo.step("Stripe handles the card on its own secure form — we never see or store the number", async () => {
      // The register → billing transition (registration API round-trip + wizard step change)
      // is awaited HERE, after the previous beat's highlight has already been cleared (demo.step
      // clears stale highlights at the start of every beat) — see the note above.
      //
      // Tried moving this wait (+ the Stripe-iframe-ready wait below) OUT to a silent warm
      // between beats, mirroring the opening beat's fix — reverted: unlike beat 1 (no caption
      // exists yet before the first demo.step), a silent wait BETWEEN two later beats leaves
      // the PRECEDING beat's caption/burned subtitle stuck on screen for the whole wait
      // (confirmed live via rendered proof-mode frames: "Creating the account first..." stayed
      // up for 14s, well past the actual registration action, describing nothing while Stripe
      // loaded) — a worse defect than the one it was meant to fix. The "Preparing secure
      // checkout…" placeholder this wait can surface is legitimate, on-topic content for THIS
      // beat's own caption ("Stripe handles the card…") and is explicitly sanctioned by
      // video-review.md Judge R ("loads are allowed to be seen loading") — left as-is.
      await expect(purchaseButton).toBeVisible({ timeout: 45_000 });
      // Same iframe `fillPaymentElement` types into (../../helpers/payment) — highlighting the
      // real iframe element (not a wrapper div) rings exactly the area the viewer should watch.
      // The billing panel shows a "Preparing secure checkout…" placeholder before this iframe
      // exists, so `demo.highlight`'s own wait-for-visible (not just boundingBox) matters here.
      const paymentFrame = page.locator('iframe[name^="__privateStripeFrame"], iframe[title*="payment" i]').first();
      // Verified live via rendered proof-mode frames: Stripe mounts this iframe at a SMALL
      // placeholder height and resizes it (postMessage-driven) once the card fields finish
      // laying out — highlighting right after the iframe merely attaches captured that early,
      // too-short box (a ring covering only the top sliver, not the whole card form). Waiting
      // for the actual "Card number" field inside it proves Stripe has finished sizing before
      // `demo.highlight` reads the outer iframe's boundingBox.
      await page
        .frameLocator('iframe[name^="__privateStripeFrame"], iframe[title*="payment" i]')
        .first()
        .getByRole("textbox", { name: /card number/i })
        .waitFor({ state: "visible", timeout: 20_000 });
      await demo.highlight(paymentFrame, "Stripe's secure form");
      await fillPaymentElement(page, CARDS.ok);
      await expect(purchaseButton).toBeEnabled({ timeout: 30_000 });
      // Re-spotlight onto the actual click target before clicking it: the highlight above
      // covers the Stripe iframe (what the viewer should watch while the card fills in),
      // but PURCHASE is the app's own button, outside that iframe's box — without moving
      // the ring here, this beat's click would land outside the highlighted region
      // (video-review.md Judge H: "clicks land visibly inside the highlighted region").
      // demo.highlight replaces the single fixed-id ring rather than stacking, so this
      // just moves the spotlight, it doesn't leave two rings on screen.
      await demo.highlight(purchaseButton, "Complete purchase");
      await purchaseButton.click();
    });

    let userId = "";
    await demo.step("The moment payment clears, the free entries land automatically — nothing else for the member to do", async () => {
      // Outcome asserted at the DATABASE, not the pixels (spec §9) — webhook grant processing is
      // in-process (`after()`), so this polls rather than expecting a synchronous UI transition.
      const result = await waitForActiveMembership(email, 180_000);
      userId = result.userId;
      expect(result.entries).toBe(15); // Tradie includes 15 free entries (membershipPackages.ts: entriesPerMonth 15)
      // Continuity fix (video-review.md Judge R: "ending lands on a meaningful final state
      // ... not mid-motion"): SuccessScreen.tsx (src/components/loading/SuccessScreen.tsx)
      // always renders a fixed "Transaction complete" status strip regardless of which exact
      // title fires for a brand-new guest ("Successful!" / "Account Created!" depending on
      // whether MembershipModal's auto-login round-trip wins the race) — waiting for it here
      // guarantees the recording ends on the app's own settled confirmation card, not mid-poll.
      await expect(page.getByText(/transaction complete/i)).toBeVisible({ timeout: 20_000 });
    });

    // Exactly-once: precisely one BenefitsGranted event exists for this user's invoice.
    // Doc shape verified live (src/services/stripe-webhook-handlers/index.ts:3358-3359):
    // subscriptions grant on invoice.payment_succeeded with
    // _id "BenefitsGranted-invoice_<stripe invoice id>".
    const ref = await findBenefitsGrantedRef(userId, "membership");
    expect(ref.kind).toBe("invoice");
    expect(await benefitsGrantedCount(ref.kind, ref.id)).toBe(1);
  });
});
