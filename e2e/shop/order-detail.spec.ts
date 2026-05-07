import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";
import { getDb } from "../fixtures/seed-helpers";
import { ensureE2EProducts, teardownE2EProducts } from "../fixtures/test-products";
import { emailFor } from "../fixtures/test-users";

// /my-account/orders/[orderNumber] page rendering — driven by a seeded Order
// document so we can assert status timeline + tracking link conditional
// without running a full checkout.
//
// Investigation:
//   - GET /api/orders/[id] (src/app/api/orders/[id]/route.ts) authorises by
//     `Order.find({ user: session.user.id, ... })`. The fresh project's
//     storageState is the fresh fixture user, so the order's `user` field
//     must point at that User._id.
//   - The page reads `order.status` and `order.trackingNumber`. We seed
//     `status: "shipped"` (so the timeline highlights the first three steps)
//     and `trackingNumber: "AP-E2E-12345"` (so the tracking link renders).

let productId: string;
let orderId: string;

test.beforeAll(async ({}, testInfo) => {
  // Reuse the existing test-products fixture for a valid Product._id.
  productId = (await ensureE2EProducts()).widgetId;

  const { User, Order } = await getDb();
  const email = emailFor("fresh", testInfo.parallelIndex);
  const user = await User.findOne({ email });
  if (!user) {
    throw new Error(`Fresh user ${email} not found — was the seed run?`);
  }

  const order = await Order.create({
    orderNumber: `SHOP-E2E-DETAIL-${Date.now()}`,
    user: user._id,
    products: [{ product: productId, quantity: 2, price: 25 }],
    tickets: [],
    totalAmount: 60, // 2*25 + $10 shipping (under the $100 free-shipping cutoff)
    appliedDiscounts: [],
    gstAmount: Math.round((60 / 11) * 100) / 100,
    shippingCost: 10,
    status: "shipped",
    shippingAddress: {
      firstName: "Fresh",
      lastName: "Tester",
      email,
      phone: "0411111111",
      addressLine1: "1 Detail Rd",
      city: "Melbourne",
      state: "VIC",
      postalCode: "3000",
      country: "Australia",
    },
    trackingNumber: "AP-E2E-12345",
  });
  orderId = order.orderNumber;
});

test.afterAll(async () => {
  const { Order } = await getDb();
  if (orderId) {
    await Order.deleteOne({ orderNumber: orderId });
  }
  await teardownE2EProducts();
});

test("order detail page renders status timeline and tracking link", async ({ page }) => {
  await page.goto(`/my-account/orders/${orderId}`);

  // Heading shows the order number.
  await expect(page.getByRole("heading", { name: new RegExp(`Order #${orderId}`, "i") })).toBeVisible({
    timeout: 10_000,
  });

  // Status timeline shows the four canonical steps.
  const timeline = page.locator(byTestId(testid.orderStatusTimeline));
  await expect(timeline).toBeVisible();
  await expect(timeline).toContainText(/pending/i);
  await expect(timeline).toContainText(/processing/i);
  await expect(timeline).toContainText(/shipped/i);
  await expect(timeline).toContainText(/delivered/i);

  // Tracking link renders only when trackingNumber is set — we seeded one.
  const tracking = page.locator(byTestId(testid.orderTrackingLink));
  await expect(tracking).toBeVisible();
  await expect(tracking).toHaveAttribute(
    "href",
    /auspost\.com\.au\/mypost\/track\/details\/AP-E2E-12345/,
  );
});
