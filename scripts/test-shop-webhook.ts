// scripts/test-shop-webhook.ts
//
// Replays a fake payment_intent.succeeded event for a shop PI against the local
// webhook handler. Use with the dev server running.
//
// Usage:
//   npm run dev   (in another terminal)
//   npm run test:shop-webhook -- <productId>
import "dotenv/config";

const productId = process.argv[2];
if (!productId) {
  console.error("Usage: npm run test:shop-webhook -- <productId>");
  process.exit(1);
}

const fakePI = {
  id: `pi_test_shop_${Date.now()}`,
  object: "payment_intent",
  status: "succeeded",
  amount: 6000,
  currency: "aud",
  metadata: {
    type: "shop",
    items: JSON.stringify([
      {
        productId,
        productName: "Test product",
        priceCents: 2500,
        quantity: 2,
        imageUrl: null,
        brand: null,
      },
    ]),
    shippingAddress: JSON.stringify({
      firstName: "Webhook",
      lastName: "Replay",
      email: "replay@example.com",
      phone: "0400000000",
      addressLine1: "1 Replay St",
      city: "Melbourne",
      state: "VIC",
      postalCode: "3000",
      country: "Australia",
    }),
    guestEmail: "replay@example.com",
    guestFirstName: "Webhook",
    guestLastName: "Replay",
    subtotalCents: "5000",
    shippingCents: "1000",
    gstCents: "545",
    totalCents: "6000",
  },
};

const event = {
  id: `evt_test_shop_${Date.now()}`,
  type: "payment_intent.succeeded",
  data: { object: fakePI },
};

(async () => {
  const url = "http://localhost:3000/api/stripe/webhook";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": "test_bypass", // ⚠ webhook handler must accept dev bypass
    },
    body: JSON.stringify(event),
  });
  console.error("status:", res.status);
  console.error("body:", await res.text());
})();
