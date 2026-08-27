import { test, expect } from "../../fixtures/test";
import { MEMBER_STATE } from "../../lib/paths";
import { CARDS, fillPaymentElement } from "../../helpers/payment";
import { connectE2eDb, findUserByEmail, benefitsGrantedCount, MEMBER } from "../../helpers/db";

/**
 * Free entries included with a merchandise purchase — the money path.
 *
 * `npm run test:shop-entries` already covers what a unit test can reach: the two
 * Mongoose round-trips, absent-vs-zero, and the arithmetic. It cannot reach any of
 * the things that actually decide whether a customer gets what they paid for, all
 * of which need a real payment and a real webhook:
 *
 *  1. THE DISPLAY/GRANT AGREEMENT. The number printed on the product page must equal
 *     the number credited. The two are computed in different processes, from
 *     different entry points, and agree only because both resolve through
 *     getResolvedMultiplierWithSource. Nothing else in the repo asserts that.
 *  2. BUCKET ISOLATION. addToMajorDraw maps packageType to a sourceType through a
 *     switch whose `default` is "membership". A missing `case "shop"` credits merch
 *     entries to the MEMBERSHIP bucket with no error anywhere — right total, wrong
 *     bucket, wrong analytics, wrong refund behaviour. Highest-value assertion here.
 *  3. EXACTLY ONCE. The grant is sequenced last in finalizeShopOrder precisely so a
 *     redelivered webhook cannot double-credit.
 *
 * Tagged @purchase: depends on the `stripe listen` forwarder the runner starts.
 */

function fixtureTag(testInfo: { project: { name: string }; retry: number }): string {
  return `${testInfo.project.name}-r${testInfo.retry}`.toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

/** $110 inclusive keeps the maths unambiguous and clears the $100 free-shipping threshold. */
const PRICE = 110;
/** Deliberately not 1 — a multiplier bug that multiplies by 1 is invisible at 1 entry. */
const BASE_ENTRIES = 3;

async function seedEntryProduct(tag: string) {
  const db = await connectE2eDb();
  const products = db.connection.collection("products");
  const name = `E2E Entry Tee ${process.env.E2E_RUN_ID ?? "local"} ${tag}`;
  const sku = `E2E-EN-${tag}`;
  await products.deleteMany({ name });
  const res = await products.insertOne({
    name,
    description: "E2E entry-grant fixture.",
    price: PRICE,
    images: ["https://res.cloudinary.com/demo/image/upload/sample.jpg"],
    category: "Apparel",
    brand: "Tools Australia",
    stock: 0,
    trackInventory: false,
    includedEntries: BASE_ENTRIES,
    rating: 0,
    reviews: [],
    features: [],
    isActive: true,
    isFeatured: false,
    tags: [],
    variants: [{ sku, size: "L", colour: "Black", isActive: true }],
    printArtwork: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { productId: String(res.insertedId), sku };
}

/** The member's row in the active draw, or undefined before they hold one. */
async function drawRowFor(userId: unknown) {
  const db = await connectE2eDb();
  const draw = await db.connection
    .collection("majordraws")
    .findOne({ status: "active" }, { projection: { entries: 1, totalEntries: 1 } });
  const row = (draw?.entries ?? []).find(
    (e: { userId?: unknown }) => String(e.userId) === String(userId)
  );
  return row as { totalEntries?: number; entriesBySource?: Record<string, number> } | undefined;
}

test.describe("merchandise free entries @purchase", () => {
  test.skip(process.env.E2E_EXTERNAL === "1", "needs the seeded isolated environment");
  test.use({ storageState: MEMBER_STATE });

  /**
   * Runs on EVERY project — desktop, Pixel 7 and iPhone 14.
   *
   * The badge is new UI and the money-path test below is desktop-only (card entry is
   * serialised), so without this nothing would ever render the entry promise at a
   * phone viewport. A badge that reflows badly, truncates the count, or collapses
   * behind another element on a 390px screen is invisible to a desktop-only suite —
   * and phones are where most of this traffic actually is.
   */
  test("the free-entry promise renders at every viewport", async ({ page }, testInfo) => {
    const { productId } = await seedEntryProduct(fixtureTag(testInfo));

    await page.goto(`/shop/${productId}`);
    await expect(page.getByText("Made to order").first()).toBeVisible({ timeout: 20_000 });

    const badge = page.getByText(/Includes \d+ free (entry|entries)/i).first();
    await expect(badge, "the entry promise must render on this viewport").toBeVisible({
      timeout: 20_000,
    });

    // Visible is not the same as readable. A badge pushed off-canvas or clipped to
    // zero width still passes toBeVisible in some layouts.
    const box = await badge.boundingBox();
    expect(box, "badge must have a real box").toBeTruthy();
    expect(box!.width, "badge must not be clipped to nothing").toBeGreaterThan(80);
    const viewport = page.viewportSize();
    if (viewport) {
      expect(box!.x, "badge must not overflow the left edge").toBeGreaterThanOrEqual(-1);
      expect(
        box!.x + box!.width,
        "badge must not overflow the right edge — the count is the point of it"
      ).toBeLessThanOrEqual(viewport.width + 1);
    }

    // The count itself must be legible, not just the container present.
    const promised = Number((((await badge.textContent()) ?? "").match(/\d+/) ?? ["0"])[0]);
    expect(promised, "the rendered promise must be a real number").toBeGreaterThanOrEqual(
      BASE_ENTRIES
    );

    // Rule 11: a per-entry price must never appear next to it.
    const body = (await page.locator("body").innerText()).toLowerCase();
    expect(body, "entries are a free inclusion, never priced per unit").not.toMatch(
      /per entry|\$\s*\d+(\.\d+)?\s*(\/|per)\s*entr/
    );

    await testInfo.attach(`product-page-${testInfo.project.name}`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: "image/png",
    });
  });

  test("the entries the product page promises are the entries the buyer receives", async ({
    page,
    request,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-desktop",
      "card entry runs once, on chromium-desktop"
    );

    const member = await findUserByEmail(MEMBER.email);
    expect(member, "seeded member not found").toBeTruthy();

    // Start from a known cart. A retry re-runs the whole test, and a surviving cart
    // line would price two shirts and grant six entries against assertions written
    // for one.
    {
      const db = await connectE2eDb();
      await db.connection
        .collection("users")
        .updateOne({ _id: member!._id }, { $pull: { cart: { type: "product" } } } as never);
    }

    const before = await drawRowFor(member!._id);
    const shopBefore = before?.entriesBySource?.shop ?? 0;
    const membershipBefore = before?.entriesBySource?.membership ?? 0;
    const totalBefore = before?.totalEntries ?? 0;

    const { productId, sku: SKU } = await seedEntryProduct(fixtureTag(testInfo));

    // --- what the page PROMISES -------------------------------------------
    await page.goto(`/shop/${productId}`);
    await expect(page.getByText("Made to order").first()).toBeVisible({ timeout: 20_000 });

    // Read the promise off the page rather than assuming BASE_ENTRIES: a promo may be
    // running in this environment, and the badge is supposed to show the MULTIPLIED
    // total. Whatever it says is what the buyer is entitled to.
    const badge = page.getByText(/Includes \d+ free (entry|entries)/i).first();
    await expect(badge, "product page must state the free entries it includes").toBeVisible({
      timeout: 20_000,
    });
    const promised = Number((((await badge.textContent()) ?? "").match(/\d+/) ?? ["0"])[0]);
    expect(promised, "the promise must be a real number of entries").toBeGreaterThan(0);
    // It is base x multiplier, so it can never be LESS than the base count.
    expect(
      promised,
      "displayed entries must not undercut the product's base count"
    ).toBeGreaterThanOrEqual(BASE_ENTRIES);

    await page.getByRole("button", { name: "Black · L" }).first().click();
    const addButton = page.getByRole("button", { name: /add to cart/i }).first();
    await expect(addButton).toBeEnabled({ timeout: 20_000 });
    await addButton.click();

    await expect
      .poll(
        async () => {
          const cart = await request.get("/api/cart");
          if (!cart.ok()) return null;
          const c = await cart.json();
          const items: Array<{ sku?: string }> = c.items ?? c.cart ?? [];
          return items.find((i) => i.sku === SKU)?.sku ?? null;
        },
        { timeout: 20_000, message: "variant never reached the server cart" }
      )
      .toBe(SKU);

    // --- pay ---------------------------------------------------------------
    await page.goto("/checkout");
    await page.getByLabel("First name").fill("E2E");
    await page.getByLabel("Last name").fill("Buyer");
    await page.getByLabel("Address", { exact: true }).fill("6A Aylesbury Crescent");
    await page.getByLabel("Suburb").fill("Gladstone Park");
    await page.getByLabel("State").selectOption("VIC");
    await page.getByLabel("Postcode").fill("3043");
    await page.getByRole("button", { name: /continue to payment/i }).click();

    const payButton = page.getByRole("button", { name: /^Pay \$[\d,]+\.\d{2}$/ }).first();
    await expect(payButton).toBeVisible({ timeout: 30_000 });
    await fillPaymentElement(page, CARDS.ok);
    await payButton.click();

    // --- the webhook must grant -------------------------------------------
    await expect
      .poll(
        async () => {
          const db = await connectE2eDb();
          const doc = await db.connection
            .collection("orders")
            .findOne({ user: member!._id, "products.sku": SKU });
          // entriesGranted is written by the grant, which runs LAST in
          // finalizeShopOrder — so its presence means the whole chain completed.
          // `undefined` means the grant has not run; 0 would be a real value.
          return doc && doc.status !== "pending" && doc.entriesGranted !== undefined ? doc : null;
        },
        {
          timeout: 180_000,
          intervals: [2_000],
          message: "order never recorded entriesGranted — the grant did not run",
        }
      )
      .not.toBeNull();

    const db = await connectE2eDb();
    const order = await db.connection
      .collection("orders")
      .findOne({ user: member!._id, "products.sku": SKU });
    expect(order, "order missing").toBeTruthy();

    // 1. THE ASSERTION THIS SPEC EXISTS FOR.
    // The page said `promised`; the buyer must receive exactly that. Page and grant
    // are computed in different processes and agree only because both resolve through
    // getResolvedMultiplierWithSource. If either side is switched to
    // resolveMultiplierForDisplay, or the page stops applying the multiplier, this
    // fails — and nothing else in the repo would notice.
    expect(order!.entriesGranted, "granted entries must equal what the page promised").toBe(
      promised
    );

    // The base count is snapshotted onto the line at checkout, so a later catalog edit
    // cannot rewrite what this buyer was owed.
    expect(
      order!.products[0].includedEntries,
      "base count must be snapshotted on the order line"
    ).toBe(BASE_ENTRIES);

    // 2. BUCKET ISOLATION — the silent one.
    await expect
      .poll(async () => (await drawRowFor(member!._id))?.entriesBySource?.shop ?? 0, {
        timeout: 60_000,
        intervals: [2_000],
        message: "shop entries never landed in the draw's shop bucket",
      })
      .toBe(shopBefore + promised);

    const after = await drawRowFor(member!._id);
    expect(
      after?.entriesBySource?.membership ?? 0,
      "merch entries must NOT be credited to the membership bucket (addToMajorDraw switch fallthrough)"
    ).toBe(membershipBefore);
    expect(
      after?.totalEntries ?? 0,
      "the row total must move by exactly the granted amount"
    ).toBe(totalBefore + promised);

    // Merchandise grants into the Major Draw only — never a Mini Draw.
    const freshUser = await db.connection.collection("users").findOne({ _id: member!._id });
    const miniTouched = (freshUser?.miniDrawParticipation ?? []).some(
      (p: { entriesBySource?: Record<string, number> }) => Boolean(p.entriesBySource?.shop)
    );
    expect(miniTouched, "merchandise must never grant Mini Draw entries").toBeFalsy();

    // 3. EXACTLY ONCE. One BenefitsGranted row for this PaymentIntent — the gate that
    // makes a redelivered webhook a no-op.
    expect(order!.paymentIntentId, "PaymentIntent must be linked to the order").toBeTruthy();
    expect(
      await benefitsGrantedCount("pi", String(order!.paymentIntentId)),
      "exactly one BenefitsGranted event — a replay must not double-credit"
    ).toBe(1);
  });
});
