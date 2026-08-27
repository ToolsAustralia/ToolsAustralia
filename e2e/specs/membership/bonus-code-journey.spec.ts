import { test, expect } from "../../fixtures/test";
import {
  CARDS,
  fillPaymentElement,
  findBenefitsGrantedRef,
  paymentIntentMetadata,
  purchaseIdentity,
  trackPaymentIntentCreations,
} from "../../helpers/payment";
import { benefitsGrantedCount, disconnectE2eDb, findUserByEmail } from "../../helpers/db";
import {
  drawEntryBucketsFor,
  ensureBonusCodeCampaign,
  issuanceCountForUser,
  issuanceFor,
  mintBonusCodeViaWebhook,
  waitForCampaignGrant,
  waitForGrantLedger,
} from "../../helpers/bonus-code";

/**
 * The bonus-entry code journey, end to end in a real browser.
 *
 * Marketing's Klaviyo flows call `POST /api/bonus-codes/v1/issue` one step ahead
 * of the discount email; the endpoint mints that customer a 72-hour window; the
 * customer applies the code at checkout, pays, and the free entries land in the
 * draw. `npm run test:bonus-code-webhook` already drives the endpoint handler
 * directly, so this spec deliberately does NOT re-prove the endpoint. It proves
 * the half nothing else covers: the browser journey, and the join between the
 * mint and the entries actually arriving.
 *
 * WHAT THE POSITIVE LEGS PIN (they were RED until 2026-08-27). `MembershipModal`
 * pre-warms the checkout object the instant step 2 mounts, and the coupon box is
 * ON step 2 — so at pre-warm time the customer has had no opportunity to type,
 * and the object that gets charged carried no `campaignCode`. The customer saw
 * APPLIED, was charged, and received nothing. The fix writes the code onto the
 * still-unpaid object at the PURCHASE click, before `confirmPayment`
 * (`src/utils/payment/campaign-code-checkout.ts`). Both purchase shapes are
 * covered because they failed for DIFFERENT reasons and only one of them was
 * deterministic:
 *   - MEMBERSHIP: the reuse branch sent no code at all. Always broken.
 *   - ONE-TIME PACK: `create-one-time-purchase` did send the code, but patched
 *     the PaymentIntent AFTER the browser confirmed it, racing the webhook's own
 *     fresh retrieve. Usually broken — which is worse, because a race can look
 *     green on a fast machine.
 *
 * THE PACK LEG NO LONGER INFERS ITS HEALTH FROM THE ENTRIES COUNT. Reverting the
 * duplicate-PaymentIntent fix left that count green about two runs in three, because a
 * duplicate only loses the code when the second object resolves last. The leg now asserts
 * the PaymentIntent COUNT, the identity stamped on it, and that the object the webhook
 * charged is the object the browser minted — none of which depend on who wins a race.
 * See docs/e2e/gotchas.md.
 *
 * THE NEGATIVE CASE IS THE POINT. `/api/codes/validate` answers a GUEST from the
 * campaign window alone — it has no session to key a per-user lookup on — so a
 * customer who was never minted a code still sees APPLIED. The real gate is
 * `CampaignCodeValidationService.resolveCodeForCheckout`, server-side. Without
 * the negative test this spec could not tell "the code worked" from "everyone
 * gets entries regardless", which is the entire visibility rule.
 */

/** The `checkout-start` trigger's code (src/config/bonusCodes.ts). */
const CAMPAIGN_CODE = "LOCKIN100";
/** The `one-time-purchase` trigger's code — the campaign whose audience is pack buyers. */
const ONE_TIME_CAMPAIGN_CODE = "EXTRA100";
/** The fixtures' own entry amount. Chosen here, never read back from the rows they seeded. */
const CAMPAIGN_ENTRIES = 100;
/** Tradie includes 15 free entries (membershipPackages.ts: entriesPerMonth 15). */
const TRADIE_ENTRIES = 15;
/** Apprentice Pack includes 3 free entries (membershipPackages.ts: totalEntries 3). */
const APPRENTICE_ENTRIES = 3;
/** Exactly 72 hours in ms — written out, not computed from the code under test. */
const SEVENTY_TWO_HOURS_MS = 259_200_000;
/**
 * Settle window for the NEGATIVE leg only, and it is a tail on an OBSERVED edge
 * (the BenefitsGranted doc landing), never a substitute for one.
 */
const CAMPAIGN_SETTLE_TAIL_MS = 5_000;

// Deliberately NOT `mode: "serial"`. The tests share only the read-only fixture
// campaigns (different customers, different payments), and serial mode would SKIP
// later legs whenever an earlier one is red.
//
// `beforeAll`/`afterAll` run ONCE PER WORKER and `playwright.config.ts` is
// `fullyParallel`, so these hooks interleave with a sibling leg that is mid-run.
// That is why setup is an idempotent upsert and there is NO fixture teardown: the
// previous `afterAll` deleted the campaign and every issuance against it roughly
// 100s in — right inside another leg's 180s wait for the grant it was about to
// assert. `run.ts` -> `wipeAndSeed` -> `dropDatabase()` already guarantees a clean
// database per run, so the delete bought nothing and cost a flake generator.
test.beforeAll(async () => {
  for (const code of [CAMPAIGN_CODE, ONE_TIME_CAMPAIGN_CODE]) {
    await ensureBonusCodeCampaign({
      code,
      entriesAmount: CAMPAIGN_ENTRIES,
      // 72 is not decorative: `personalWindowGoverns` needs validForHours >= 1 for
      // the trigger to act as targeting at all, and the customer-facing copy
      // (Cobber FAQ id 86) states a fixed 72 hours.
      validForHours: 72,
    });
  }
});

test.afterAll(async () => {
  await disconnectE2eDb();
});

test.describe("bonus code journey @purchase", () => {
  // EXTERNAL mode: belt-and-suspenders — run.ts's --grep-invert "@purchase|@admin" already excludes this tag; this guards a direct `playwright test` invocation that bypasses run.ts.
  test.skip(process.env.E2E_EXTERNAL === "1", "needs the seeded isolated environment");

  test("minted code: apply at checkout → real payment → 100 free entries land, grant spent", async ({ page }) => {
    // Larger than the sibling purchase specs' 300s: this one additionally spawns
    // a cold `tsx` child process that loads the route's whole module graph.
    test.setTimeout(420_000);
    const { email, mobile } = purchaseIdentity("bonuscode", test.info());

    // Guest checkout submit button is exactly "PURCHASE" (PaymentStep.tsx — the
    // authenticated label is "PURCHASE & ENTER THE DRAW"/"PURCHASE & ENTER").
    const purchaseButton = page.getByRole("button", { name: /^purchase$/i });
    const chooseTradie = page
      .getByRole("button", { name: /choose tradie/i })
      .or(page.getByRole("link", { name: /choose tradie/i }))
      .first();

    await page.goto("/membership");
    await expect(chooseTradie).toBeVisible({ timeout: 45_000 });
    await chooseTradie.click();

    // Step 1 registration. This does NOT authenticate (CLAUDE.md rule 6) — the
    // modal bridges to step 2 via guestUserData, which is exactly the cohort the
    // `checkout-start` trigger targets.
    await page.locator('input[name="firstName"]').fill("E2E");
    await page.locator('input[name="lastName"]').fill("Bonus");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="phone"]').fill(mobile);
    await page.getByRole("button", { name: /register/i }).click();
    await expect(purchaseButton).toBeVisible({ timeout: 45_000 });

    // (a) THE MINT — through the real endpoint code, in a throwaway process that
    // identifies as production. See e2e/lib/mint-bonus-code.ts for why the gate
    // is never weakened to make this reachable.
    const user = await findUserByEmail(email);
    expect(user, `registration should have created ${email}`).toBeTruthy();
    const userId = String(user!._id);

    const mint = await mintBonusCodeViaWebhook({ email, trigger: "checkout-start" });
    expect(mint.status).toBe(200);
    expect(mint.outcome).toBe("minted");
    // The notify step ran and reached the STUB, never the network.
    expect(mint.klaviyoEmits).toBe(1);

    const issued = await issuanceFor(CAMPAIGN_CODE, userId);
    expect(issued, "the mint should have written this customer an issuance").toBeTruthy();
    expect(issued!.status).toBe("active");
    expect(issued!.entriesAmount).toBe(CAMPAIGN_ENTRIES);
    expect(issued!.expiresAt.getTime() - issued!.issuedAt.getTime()).toBe(SEVENTY_TWO_HOURS_MS);

    // (b)+(c) APPLY IT, and assert what the customer actually sees.
    // Selectors verified against the live DOM (2026-08-27 harness session), NOT
    // inferred from props:
    //  - the input has no name/id/label/aria-label; placeholder is the only handle
    //    (MembershipModal/CouponRow.tsx).
    //  - on success the Apply <button> is REPLACED by a <div> carrying a
    //    <span>APPLIED</span> — the button locator disappears rather than
    //    changing state.
    // Asserting the INPUT first is load-bearing: CouponRow has a second shape for
    // an active promo link that renders APPLIED with no input at all, and an
    // APPLIED-only assertion would pass on it.
    const couponInput = page.getByPlaceholder("Enter coupon code");
    await expect(couponInput).toBeVisible({ timeout: 30_000 });
    await couponInput.fill(CAMPAIGN_CODE);
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.getByRole("dialog").getByText("APPLIED", { exact: true })).toHaveCount(1, {
      timeout: 30_000,
    });

    // (d) A real Stripe TEST-mode payment.
    await fillPaymentElement(page, CARDS.ok);
    await expect(purchaseButton).toBeEnabled({ timeout: 30_000 });
    await purchaseButton.click();

    // (e) THE ENTRIES. Wait on the LEDGER, not on `entries > 0`: the membership's
    // own entries land before the campaign redemption runs, so the combined total
    // is only safe to read once campaignEntries has moved (see waitForCampaignGrant).
    //
    // There is deliberately no `waitForActiveMembership` here. It requires
    // `subscription.status === "active"`, and under anchor-24 (AEST 25/26/27)
    // these subscriptions REST at `trialing` — so it burns its whole budget and
    // then fails a spec that is otherwise green. `waitForCampaignGrant` is a
    // strictly later edge anyway, and `userId` already came from the DB above.
    const ledger = await waitForCampaignGrant(userId, "membership", CAMPAIGN_ENTRIES, 180_000);
    expect(ledger.campaign?.code).toBe(CAMPAIGN_CODE);
    expect(ledger.campaign?.redemptionKind).toBe("monthly-coupon");
    expect(ledger.campaign?.monthlyIssuanceId).toBeTruthy();

    const buckets = await drawEntryBucketsFor(userId);
    expect(buckets.bySource["membership"]).toBe(TRADIE_ENTRIES); // 15
    expect(buckets.bySource["bonus-entry-promo"]).toBe(CAMPAIGN_ENTRIES); // 100
    expect(buckets.totalEntries).toBe(115); // 15 free with Tradie + 100 free with the code

    // (f) SPENT — the grant cannot be redeemed a second time. `redeemedEverAt` is
    // the permanent marker a refund does not clear.
    const redeemed = await issuanceFor(CAMPAIGN_CODE, userId);
    expect(redeemed!.status).toBe("redeemed");
    expect(redeemed!.redeemedAt).toBeTruthy();
    expect(redeemed!.redeemedEverAt).toBeTruthy();

    // Exactly-once on the payment itself, same two-part proof as the sibling specs.
    const ref = await findBenefitsGrantedRef(userId, "membership");
    expect(ref.kind).toBe("invoice");
    expect(await benefitsGrantedCount(ref.kind, ref.id)).toBe(1);
  });

  test("minted code on a ONE-TIME pack: apply at checkout → real payment → 100 free entries land", async ({ page }) => {
    test.setTimeout(420_000);
    const { email, mobile } = purchaseIdentity("bonuspack", test.info());

    // THE DUPLICATE-PAYMENTINTENT WATCHDOG. Installed before the first navigation
    // because the call it has to see is the pre-warm, which fires the instant step 2
    // mounts. Everything this leg used to prove about duplicates was inferred from the
    // entries count, and a duplicate only loses the code when the SECOND object resolves
    // last — measured at roughly one run in three. The assertions at the bottom of this
    // test replace that coin flip with the count itself.
    const paymentIntents = trackPaymentIntentCreations(page);

    // The public one-time pack ladder lives in the "Not subscribing?" drawer
    // (MembershipOneTimePacks.tsx), collapsed by default — same handles as
    // purchase-one-time.spec.ts. Apprentice Pack ($25 → 3 free entries) is the
    // cheapest public pack and therefore the fastest real Stripe charge.
    await page.goto("/membership");
    await page.getByRole("button", { name: /show one-time pack catalogue/i }).click();
    await page.getByRole("button", { name: /apprentice pack/i }).click();

    await page.locator('input[name="firstName"]').fill("E2E");
    await page.locator('input[name="lastName"]').fill("BonusPack");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="phone"]').fill(mobile);
    await page.getByRole("button", { name: /register/i }).click();

    const purchaseButton = page.getByRole("button", { name: /^purchase$/i });
    await expect(purchaseButton).toBeVisible({ timeout: 45_000 });

    const user = await findUserByEmail(email);
    expect(user, `registration should have created ${email}`).toBeTruthy();
    const userId = String(user!._id);

    const mint = await mintBonusCodeViaWebhook({ email, trigger: "one-time-purchase" });
    expect(mint.status).toBe(200);
    expect(mint.outcome).toBe("minted");
    expect(mint.klaviyoEmits).toBe(1);

    const issued = await issuanceFor(ONE_TIME_CAMPAIGN_CODE, userId);
    expect(issued, "the mint should have written this customer an issuance").toBeTruthy();
    expect(issued!.entriesAmount).toBe(CAMPAIGN_ENTRIES);

    const couponInput = page.getByPlaceholder("Enter coupon code");
    await expect(couponInput).toBeVisible({ timeout: 30_000 });
    await couponInput.fill(ONE_TIME_CAMPAIGN_CODE);
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.getByRole("dialog").getByText("APPLIED", { exact: true })).toHaveCount(1, {
      timeout: 30_000,
    });

    await fillPaymentElement(page, CARDS.ok);
    await expect(purchaseButton).toBeEnabled({ timeout: 30_000 });
    await purchaseButton.click();

    const ledger = await waitForCampaignGrant(userId, "one-time", CAMPAIGN_ENTRIES, 180_000);
    expect(ledger.campaign?.code).toBe(ONE_TIME_CAMPAIGN_CODE);

    // Source keys are the MajorDraw schema's own (`remove-draw-entries.ts`): a
    // pack grants under "one-time-package", a campaign under "bonus-entry-promo".
    const buckets = await drawEntryBucketsFor(userId);
    expect(buckets.bySource["one-time-package"]).toBe(APPRENTICE_ENTRIES); // 3
    expect(buckets.bySource["bonus-entry-promo"]).toBe(CAMPAIGN_ENTRIES); // 100
    expect(buckets.totalEntries).toBe(103);

    const redeemed = await issuanceFor(ONE_TIME_CAMPAIGN_CODE, userId);
    expect(redeemed!.status).toBe("redeemed");
    expect(redeemed!.redeemedEverAt).toBeTruthy();

    // EXACTLY ONE PAYMENTINTENT, AND IT IS THE ONE THAT WAS CHARGED.
    //
    // Asserted directly rather than inferred from a green tick. The modal creates the
    // checkout object twice if any path that nulls `paymentIntentClientSecret` fails to
    // hold `isCreatingPaymentIntentRef` across its round trip: the step-2 pre-warm effect
    // re-fires during the await and mints a second object. The code is stamped on one, the
    // card is charged against whichever `setPaymentIntentClientSecret` landed last, and
    // the customer pays and receives nothing. Counting the creations fails on EVERY run
    // when that mutex is dropped, in either direction, instead of only when the duplicate
    // happens to win the race.
    const creations = await paymentIntents.settle();
    const createdIds = [
      ...new Set(creations.map((c) => c.paymentIntentId).filter((id): id is string => id !== null)),
    ];
    expect(
      createdIds,
      `a pack checkout must mint exactly ONE PaymentIntent; observed ${JSON.stringify(creations)}`
    ).toHaveLength(1);
    const chargedPaymentIntentId = createdIds[0];

    const ref = await findBenefitsGrantedRef(userId, "one-time");
    expect(ref.kind).toBe("pi");
    // The object the webhook granted against IS the object the browser minted. A second,
    // untracked PaymentIntent (or a server-side one created after confirm) fails here.
    expect(ref.id).toBe(chargedPaymentIntentId);
    expect(await benefitsGrantedCount(ref.kind, ref.id)).toBe(1);

    // A REAL ACCOUNT, NEVER THE PLACEHOLDER — read off the Stripe object itself. The DB
    // cannot answer this: the webhook resolves the customer from the Stripe customer and
    // the email, so an object stamped `userId: "guest"` still produces a correct-looking
    // grant row. `create-payment-intent` writes the literal strings "guest"/"guest" the
    // moment a call arrives without `userEmail` — and that object then resolves to NO
    // account at attach time, so the attach CLEARS the code instead of writing it.
    const metadata = await paymentIntentMetadata(chargedPaymentIntentId);
    expect(metadata.userId).toBe(userId);
    expect(metadata.userEmail?.toLowerCase()).toBe(email);
    // Every observed call carried the identity too — the pre-warm included.
    for (const call of creations) {
      expect(call.userEmail?.toLowerCase(), `a PaymentIntent was minted with no userEmail: ${JSON.stringify(call)}`).toBe(email);
    }
    // …and the attach's answer is on that same object, not on a sibling.
    expect(metadata.campaignCode).toBe(ONE_TIME_CAMPAIGN_CODE);
  });

  test("no minted code: the same code at checkout grants nothing", async ({ page }) => {
    test.setTimeout(420_000);
    const { email, mobile } = purchaseIdentity("bonusnone", test.info());

    const purchaseButton = page.getByRole("button", { name: /^purchase$/i });
    const chooseTradie = page
      .getByRole("button", { name: /choose tradie/i })
      .or(page.getByRole("link", { name: /choose tradie/i }))
      .first();

    await page.goto("/membership");
    await expect(chooseTradie).toBeVisible({ timeout: 45_000 });
    await chooseTradie.click();

    await page.locator('input[name="firstName"]').fill("E2E");
    await page.locator('input[name="lastName"]').fill("NoCode");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="phone"]').fill(mobile);
    await page.getByRole("button", { name: /register/i }).click();
    await expect(purchaseButton).toBeVisible({ timeout: 45_000 });

    const user = await findUserByEmail(email);
    expect(user, `registration should have created ${email}`).toBeTruthy();
    const userId = String(user!._id);
    // No mint for this customer — that is the whole experiment.
    expect(await issuanceCountForUser(userId, CAMPAIGN_CODE)).toBe(0);

    // The UI DOES accept it, and that is not a bug being asserted as correct: a
    // guest has no session, so /api/codes/validate can only answer from the
    // campaign window. Pinning today's behaviour here is what makes the DB
    // assertions below meaningful — the customer got as far as a real charge with
    // APPLIED on screen.
    const couponInput = page.getByPlaceholder("Enter coupon code");
    await expect(couponInput).toBeVisible({ timeout: 30_000 });
    await couponInput.fill(CAMPAIGN_CODE);
    await page.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(page.getByRole("dialog").getByText("APPLIED", { exact: true })).toHaveCount(1, {
      timeout: 30_000,
    });

    await fillPaymentElement(page, CARDS.ok);
    await expect(purchaseButton).toBeEnabled({ timeout: 30_000 });
    await purchaseButton.click();

    // Absence needs an OBSERVED edge to be measured against, not a guess. Wait for
    // the BenefitsGranted doc itself — that proves the webhook ran and the base
    // grant landed — then allow a short tail for the campaign block, which is
    // written LAST, and assert it never moved. A flat sleep tuned on one machine
    // turns a BROKEN visibility rule green on a slower one, which is the
    // dangerous direction.
    await waitForGrantLedger(userId, "membership", 180_000);
    await page.waitForTimeout(CAMPAIGN_SETTLE_TAIL_MS);

    const buckets = await drawEntryBucketsFor(userId);
    expect(buckets.bySource["membership"]).toBe(TRADIE_ENTRIES); // 15
    expect(buckets.bySource["bonus-entry-promo"] ?? 0).toBe(0);
    expect(buckets.totalEntries).toBe(15); // Tradie's own free entries and nothing else

    const settled = await waitForGrantLedger(userId, "membership", 30_000);
    expect(settled.campaignEntries).toBe(0);
    expect(settled.campaign).toBeUndefined();

    // Structural, timing-free: redemption requires an issuance, and no mint ever
    // created one for this customer.
    expect(await issuanceCountForUser(userId, CAMPAIGN_CODE)).toBe(0);
  });
});
