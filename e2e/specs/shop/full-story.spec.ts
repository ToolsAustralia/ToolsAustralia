import { test, expect } from "../../fixtures/test";
import type { Page, TestInfo } from "@playwright/test";
import { MEMBER_STATE, ADMIN_STATE } from "../../lib/paths";
import { CARDS, fillPaymentElement } from "../../helpers/payment";
import { connectE2eDb, findUserByEmail, MEMBER } from "../../helpers/db";

/**
 * The complete merchandise story, start to finish, as a customer and then as the
 * person who has to fulfil the order.
 *
 * This exists to be WATCHED, not only to pass. Run it with `--proof` and every step
 * records video and attaches a screenshot, so the whole flow can be reviewed without
 * anyone driving a browser by hand.
 *
 * It deliberately overlaps other specs. `entries.spec.ts` proves the grant is
 * correct in isolation with tight database assertions; this one proves the SEQUENCE
 * holds together — that a customer can get from the shop to a confirmed order with
 * entries, and that the order then appears where staff and the customer expect it.
 * A suite of green unit-level specs can still describe a journey nobody can actually
 * complete.
 *
 * Tagged @purchase: needs the `stripe listen` forwarder the runner starts.
 *
 * RUN THIS SPEC ON ITS OWN:
 *
 *     npx tsx e2e/run.ts --proof --grep "the complete story" --project chromium-desktop
 *
 * It shares the seeded member — and therefore that member's cart — with
 * entries.spec, which also drives a full purchase. Run back to back, the add-to-cart
 * here is intermittently rejected with a 400 while the previous purchase's webhook is
 * still settling. Alone it passes every time.
 *
 * That is a shared-fixture limitation, NOT a customer-facing bug, and it is stated
 * rather than retried around: a retry would have hidden it, and the honest fix is to
 * give this spec its own user, which is worth doing if it ever needs to run in the
 * full suite. One genuine product bug WAS found underneath it and is fixed —
 * finalizeShopOrder cleared every product line from the cart rather than the order's
 * own, so a late webhook wiped items a customer had added since.
 */

const PRICE = 110; // Over the $100 threshold, so shipping is free and the maths is legible.
const BASE_ENTRIES = 3;

function fixtureTag(testInfo: { project: { name: string }; retry: number }): string {
  return `${testInfo.project.name}-r${testInfo.retry}`.toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

/** Numbered so the attachments read in order in the report. */
async function shot(page: Page, testInfo: TestInfo, step: number, name: string) {
  await testInfo.attach(`${String(step).padStart(2, "0")}-${name}`, {
    body: await page.screenshot({ fullPage: false }),
    contentType: "image/png",
  });
}

async function seedStoryProduct(tag: string) {
  const db = await connectE2eDb();
  const products = db.connection.collection("products");
  const name = `Tools Australia Staple Tee ${process.env.E2E_RUN_ID ?? "local"} ${tag}`;
  await products.deleteMany({ name });
  const res = await products.insertOne({
    name,
    description: "Heavyweight cotton, built for the site. Printed to order in Australia.",
    price: PRICE,
    images: ["https://res.cloudinary.com/demo/image/upload/sample.jpg"],
    category: "Apparel",
    brand: "Tools Australia",
    stock: 0,
    trackInventory: false, // print to order — stock 0 must never read as sold out
    includedEntries: BASE_ENTRIES,
    rating: 4.8,
    reviews: [],
    features: ["Heavyweight 320gsm cotton", "Printed to order in Australia"],
    isActive: true,
    isFeatured: true,
    tags: [],
    variants: ["S", "M", "L", "XL"].map((size) => ({
      sku: `STORY-${tag}-${size}`,
      size,
      colour: "Black",
      gtin: `931234567890${size.length}`,
      isActive: true,
    })),
    printArtwork: [
      { url: "https://res.cloudinary.com/demo/image/upload/sample.jpg", placement: "3", type: "printing" },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { productId: String(res.insertedId), sku: `STORY-${tag}-L`, name };
}

test.describe("merchandise — the complete story @purchase", () => {
  test.skip(process.env.E2E_EXTERNAL === "1", "needs the seeded isolated environment");
  // The customer half runs as the seeded member; the admin half opens its own context.
  test.use({ storageState: MEMBER_STATE });

  test("a member browses, buys, gets entries, and staff can fulfil it", async ({
    page,
    request,
    browser,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium-desktop",
      "card entry runs once, on chromium-desktop"
    );
    test.setTimeout(300_000);

    const member = await findUserByEmail(MEMBER.email);
    expect(member, "seeded member not found").toBeTruthy();

    {
      const db = await connectE2eDb();
      await db.connection
        .collection("users")
        .updateOne({ _id: member!._id }, { $pull: { cart: { type: "product" } } } as never);
    }

    const { productId, sku } = await seedStoryProduct(fixtureTag(testInfo));

    // ── 1. The shop ────────────────────────────────────────────────────────
    await page.goto("/shop");
    await expect(page.getByRole("heading", { name: /browse products/i })).toBeVisible({
      timeout: 30_000,
    });
    // Print-to-order must read as buyable, not "Sold Out" — the bug that made the
    // entire catalogue unreachable.
    await expect(page.getByText("Made to order").first()).toBeVisible({ timeout: 20_000 });
    await shot(page, testInfo, 1, "shop-listing");

    // ── 2. The product ─────────────────────────────────────────────────────
    await page.goto(`/shop/${productId}`);
    const badge = page.getByText(/Includes \d+ free (entry|entries)/i).first();
    await expect(badge, "the free-entry promise must be on the page").toBeVisible({
      timeout: 20_000,
    });
    const promised = Number((((await badge.textContent()) ?? "").match(/\d+/) ?? ["0"])[0]);
    expect(promised).toBeGreaterThanOrEqual(BASE_ENTRIES);
    await shot(page, testInfo, 2, "product-page");

    // ── 3. Pick a size ─────────────────────────────────────────────────────
    await page.getByRole("button", { name: "Black · L" }).first().click();
    const addButton = page.getByRole("button", { name: /add to cart/i }).first();
    await expect(addButton).toBeEnabled({ timeout: 20_000 });
    await shot(page, testInfo, 3, "variant-selected");

    await addButton.click();
    await expect
      .poll(
        async () => {
          const cart = await request.get("/api/cart");
          if (!cart.ok()) return null;
          const c = await cart.json();
          const items: Array<{ sku?: string }> = c.items ?? c.cart ?? [];
          return items.find((i) => i.sku === sku)?.sku ?? null;
        },
        { timeout: 20_000, message: "variant never reached the server cart" }
      )
      .toBe(sku);

    // ── 4. Checkout ────────────────────────────────────────────────────────
    await page.goto("/checkout");
    await page.getByLabel("First name").fill("E2E");
    await page.getByLabel("Last name").fill("Buyer");
    await page.getByLabel("Address", { exact: true }).fill("6A Aylesbury Crescent");
    await page.getByLabel("Suburb").fill("Gladstone Park");
    await page.getByLabel("State").selectOption("VIC");
    await page.getByLabel("Postcode").fill("3043");
    await shot(page, testInfo, 4, "checkout-address");

    await page.getByRole("button", { name: /continue to payment/i }).click();
    const payButton = page.getByRole("button", { name: /^Pay \$[\d,]+\.\d{2}$/ }).first();
    await expect(payButton).toBeVisible({ timeout: 30_000 });

    // Over the free-shipping threshold, so delivery must read Free — and GST is a
    // component of the total, never added on top.
    await expect(page.getByText(/includes \$[\d,]+\.\d{2} GST/i).first()).toBeVisible();
    await shot(page, testInfo, 5, "order-summary");

    // ── 5. Pay ─────────────────────────────────────────────────────────────
    await fillPaymentElement(page, CARDS.ok);
    await payButton.click();

    // ── 6. The webhook finishes the job ────────────────────────────────────
    await expect
      .poll(
        async () => {
          const db = await connectE2eDb();
          const doc = await db.connection
            .collection("orders")
            .findOne({ user: member!._id, "products.sku": sku });
          return doc && doc.status !== "pending" && doc.entriesGranted !== undefined ? doc : null;
        },
        {
          timeout: 180_000,
          intervals: [2_000],
          message: "order never completed — webhook or grant did not run",
        }
      )
      .not.toBeNull();

    const db = await connectE2eDb();
    const order = await db.connection
      .collection("orders")
      .findOne({ user: member!._id, "products.sku": sku });

    // The promise on the page is the promise kept.
    expect(order!.entriesGranted, "granted entries must equal what the page promised").toBe(
      promised
    );
    expect(order!.shippingCost, "over the threshold, delivery is free").toBe(0);
    await shot(page, testInfo, 6, "payment-confirmed");

    // ── 7. The customer can find it again ──────────────────────────────────
    await page.goto("/my-account/orders");
    await expect(page.getByRole("heading", { name: /your orders/i })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(order!.orderNumber)).toBeVisible({ timeout: 20_000 });
    // "Being made", not "Processing" — a print-to-order garment is being made.
    await expect(page.getByText(/being made/i).first()).toBeVisible();
    await shot(page, testInfo, 7, "customer-order-history");

    // ── 8. Staff can fulfil it ─────────────────────────────────────────────
    // A second context, because admin is a different signed-in identity.
    const adminCtx = await browser.newContext({ storageState: ADMIN_STATE });
    const adminPage = await adminCtx.newPage();
    try {
      await adminPage.goto("/admin/products");
      await expect(adminPage.getByRole("heading", { name: /send to printer/i })).toBeVisible({
        timeout: 40_000,
      });
      // The order just placed is waiting, and its garment is countable.
      await expect(adminPage.getByText(order!.orderNumber).first()).toBeVisible({
        timeout: 20_000,
      });
      await shot(adminPage, testInfo, 8, "admin-fulfilment-queue");

      await expect(adminPage.getByRole("heading", { name: /^orders$/i })).toBeVisible();
      await shot(adminPage, testInfo, 9, "admin-order-list");

      // The CSV is the actual hand-off, so prove it downloads and carries this order.
      const csv = await adminPage.request.get("/api/admin/shop/fulfilment?format=csv");
      expect(csv.ok(), "fulfilment CSV must download").toBeTruthy();
      const body = await csv.text();
      expect(body, "CSV must contain the order just placed").toContain(order!.orderNumber);
      expect(body, "CSV must carry the artwork the printer needs").toContain("left_chest_image");
      expect(body.split("\r\n")[0], "columns must match the provider template").toContain(
        '"order_id","order_date"'
      );
    } finally {
      await adminCtx.close();
    }
  });
});
