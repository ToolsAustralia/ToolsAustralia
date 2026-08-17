import { test, expect } from "../../fixtures/test";
import { MEMBER_STATE } from "../../lib/paths";
import { CARDS, fillPaymentElement } from "../../helpers/payment";
import { connectE2eDb, findUserByEmail, MEMBER } from "../../helpers/db";

/**
 * Shop checkout, end to end with a real Stripe test card.
 *
 * Tagged @purchase because it depends on the `stripe listen` forwarder the
 * runner starts — without the webhook the order never leaves `pending`, which is
 * precisely what this proves.
 *
 * What it exists to catch, none of which a type-check can see:
 *  - the order silently never leaving `pending` (a missing webhook branch)
 *  - the chosen variant not surviving onto the order line
 *  - GST being ADDED to a GST-inclusive price instead of reported inside it
 *  - the cart not clearing, so a customer re-buys what they already own
 */

/**
 * Fixture identity is scoped per project AND retry. Playwright runs projects in
 * parallel against ONE database, and seedProduct deletes by name first — two
 * projects sharing a name delete each other's fixture mid-test. That is exactly
 * what happened on the first run here: the two projects failed at different
 * points because each had had its product removed by the other.
 */
function fixtureTag(testInfo: { project: { name: string }; retry: number }): string {
  return `${testInfo.project.name}-r${testInfo.retry}`.toUpperCase().replace(/[^A-Z0-9-]/g, "");
}
const PRICE = 110; // $110 inclusive => exactly $10 GST. Chosen so the maths is unambiguous.

async function seedProduct(tag: string) {
  const db = await connectE2eDb();
  const products = db.connection.collection("products");
  const name = `E2E Checkout Hoodie ${process.env.E2E_RUN_ID ?? "local"} ${tag}`;
  const sku = `E2E-CO-${tag}`;
  await products.deleteMany({ name });
  const res = await products.insertOne({
    name,
    description: "E2E checkout fixture.",
    price: PRICE,
    images: ["https://res.cloudinary.com/demo/image/upload/sample.jpg"],
    category: "Apparel",
    brand: "Tools Australia",
    stock: 0,
    // Print-to-order: stock 0 must NOT block the sale.
    trackInventory: false,
    includedEntries: 0,
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

test.describe("shop checkout @purchase", () => {
  test.skip(process.env.E2E_EXTERNAL === "1", "needs the seeded isolated environment");
  test.use({ storageState: MEMBER_STATE });

  test("a member buys a print-to-order item and the order is fulfilled", async ({ page, request }, testInfo) => {
    // Skip by PROJECT, not browserName: mobile-chrome also reports "chromium",
    // so a browserName check runs the card flow three times against one database.
    // The describe-level skip callback only receives fixtures, not testInfo,
    // which is why this lives in the body.
    test.skip(
      testInfo.project.name !== "chromium-desktop",
      "card entry runs once, on chromium-desktop"
    );

    // Start from an empty cart. A retry re-runs the whole test, and the previous
    // attempt's line survives in user.cart — the first run of this spec ended up
    // pricing TWO hoodies ($220, 5% member discount, $19 GST) and failing an
    // assertion written for one. The totals were correct; the fixture was not.
    const seeded = await findUserByEmail(MEMBER.email);
    expect(seeded, "seeded member not found").toBeTruthy();
    {
      const db = await connectE2eDb();
      await db.connection
        .collection("users")
        .updateOne({ _id: seeded!._id }, { $pull: { cart: { type: "product" } } } as never);
    }

    const { productId, sku: SKU } = await seedProduct(fixtureTag(testInfo));

    // --- add the variant to the cart -------------------------------------
    await page.goto(`/shop/${productId}`);
    // The product page renders ProductInteractions TWICE (responsive layouts),
    // so every control here resolves to two elements. Scope to the first rather
    // than asserting a count that is a layout detail, not behaviour.
    await expect(page.getByText("Made to order").first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Black · L" }).first().click();

    // Wait for the CTA to leave its loading state. useSession returns null data
    // while status is "loading", and clicking in that window used to hit the
    // "Please log in" branch as an already-signed-in member — the bug this run
    // surfaced. The button now says "Loading…" until the session resolves.
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

    // --- checkout ---------------------------------------------------------
    await page.goto("/checkout");

    await page.getByLabel("First name").fill("E2E");
    await page.getByLabel("Last name").fill("Buyer");
    await page.getByLabel("Address", { exact: true }).fill("6A Aylesbury Crescent");
    await page.getByLabel("Suburb").fill("Gladstone Park");
    await page.getByLabel("State").selectOption("VIC");
    await page.getByLabel("Postcode").fill("3043");

    await page.getByRole("button", { name: /continue to payment/i }).click();

    // Do NOT hardcode the total: the seeded member holds a tier, so a shop
    // discount applies (Tradie 5% => $104.50, not $110). Read what the page
    // actually quotes and assert the RELATIONSHIPS — those hold whatever the
    // tier is, and they are the things that could silently break.
    const payButton = page.getByRole("button", { name: /^Pay \$[\d,]+\.\d{2}$/ }).first();
    await expect(payButton).toBeVisible({ timeout: 30_000 });
    const quotedTotal = Number(((await payButton.textContent()) ?? "").replace(/[^0-9.]/g, ""));
    expect(quotedTotal, "pay button should quote a total").toBeGreaterThan(0);

    // GST is a COMPONENT of the total (total / 11), never added on top. Were it
    // added, the quoted total would exceed the GST-inclusive line price.
    const gstText = await page.getByText(/includes \$[\d,]+\.\d{2} GST/i).first().textContent();
    const quotedGst = Number((gstText ?? "").replace(/[^0-9.]/g, ""));
    expect(quotedGst).toBeCloseTo(Math.round((quotedTotal / 11) * 100) / 100, 2);
    expect(quotedTotal, "GST must not have been ADDED to the price").toBeLessThanOrEqual(PRICE);

    await fillPaymentElement(page, CARDS.ok);
    await payButton.click();

    // --- the webhook must finalise it ------------------------------------
    const member = await findUserByEmail(MEMBER.email);
    expect(member, "seeded member not found").toBeTruthy();
    const userId = String(member!._id);

    await expect
      .poll(
        async () => {
          const db = await connectE2eDb();
          const doc = await db.connection.collection("orders").findOne({
            user: member!._id,
            "products.sku": SKU,
          });
          // `pending` means the webhook has not run yet — keep waiting.
          return doc && doc.status !== "pending" ? doc : null;
        },
        {
          timeout: 180_000,
          intervals: [2_000],
          message: "order never left `pending` — webhook branch missing or not delivered?",
        }
      )
      .not.toBeNull();

    // Re-read for assertions (expect.poll returns the matcher, not the value).
    const db = await connectE2eDb();
    const doc = await db.connection
      .collection("orders")
      .findOne({ user: member!._id, "products.sku": SKU });

    expect(doc, "order missing").toBeTruthy();
    expect(doc!.status, "order should be processing after payment").toBe("processing");
    expect(doc!.paymentIntentId, "PaymentIntent must be linked to the order").toBeTruthy();

    // The variant is what the printer is told to make — it must be on the line.
    expect(doc!.products[0].sku).toBe(SKU);

    // Money, asserted as relationships so a tier or threshold change does not
    // silently rewrite what "correct" means.
    expect(doc!.subtotal, "subtotal is the GST-inclusive line price").toBe(PRICE);
    expect(doc!.totalAmount, "the order must charge what the page quoted").toBeCloseTo(quotedTotal, 2);
    expect(doc!.gstAmount, "GST is total / 11, a component and not an addition").toBeCloseTo(
      Math.round((doc!.totalAmount / 11) * 100) / 100,
      2
    );
    expect(doc!.totalAmount, "GST must never be added on top").toBeLessThanOrEqual(PRICE);
    // Over the $100 free-shipping threshold, tested against the discounted value.
    expect(doc!.shippingCost).toBe(0);

    // The cart must be empty, or the customer re-buys what they already own.
    await expect
      .poll(
        async () => {
          const u = await db.connection.collection("users").findOne({ _id: member!._id });
          return (u?.cart ?? []).filter((l: { type: string }) => l.type === "product").length;
        },
        { timeout: 30_000, message: "product lines were not cleared from the cart" }
      )
      .toBe(0);

    expect(userId).toBeTruthy();
  });
});

test.describe("shop checkout — guards @purchase", () => {
  test.skip(process.env.E2E_EXTERNAL === "1", "needs the seeded isolated environment");

  test("checkout refuses an unauthenticated caller", async ({ request }) => {
    const res = await request.post("/api/shop/checkout", { data: { shippingAddress: {} } });
    expect(res.status()).toBeGreaterThanOrEqual(401);
    expect(res.status()).toBeLessThan(500);
  });
});
