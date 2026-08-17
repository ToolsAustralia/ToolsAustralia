import { test, expect } from "../../fixtures/test";
import { ADMIN_STATE, MEMBER_STATE } from "../../lib/paths";

/**
 * Phase 1 of the shop catalogue: an admin can create a product with variants,
 * and a member sees it on /shop with a working variant picker.
 *
 * These assertions exist because the pieces they cover are silent when broken —
 * a dropped Mongoose key, a variant that never reaches the cart, or a
 * print-to-order item reading as out of stock all fail without an error.
 */

const SKU_L = "E2E-HOODIE-BLK-L";
const SKU_M = "E2E-HOODIE-BLK-M";

/** Unique per run so a re-run never collides with a leftover product. */
function productName(): string {
  return `E2E Torquay Hoodie ${process.env.E2E_RUN_ID ?? "local"}`;
}

test.describe("shop catalogue — admin @admin", () => {
  test.skip(process.env.E2E_EXTERNAL === "1", "needs the seeded isolated environment");

  test.use({ storageState: ADMIN_STATE });

  // Deliberately API-only: no page.goto("/admin"). Loading the admin dashboard
  // fires GET /api/admin/analytics/spend-by-url, which 500s in the seeded e2e
  // environment, and the QA watchdog fixture fails any test that observes it.
  // That 500 is pre-existing and unrelated to the catalogue, so this spec must
  // not depend on the dashboard rendering to prove the catalogue contract.
  test("admin creates a product with variants, and it round-trips", async ({ request }) => {
    const name = productName();

    // Create through the API the admin UI calls, so this covers the real
    // contract rather than a form-shaped approximation of it.
    const created = await request.post("/api/admin/products", {
      data: {
        name,
        description: "E2E fixture — branded hoodie with size variants.",
        price: 79.95,
        images: ["https://res.cloudinary.com/demo/image/upload/sample.jpg"],
        category: "Apparel",
        brand: "Tools Australia",
        includedEntries: 10,
        trackInventory: false,
        variants: [
          { sku: SKU_L, size: "L", colour: "Black", isActive: true },
          { sku: SKU_M, size: "M", colour: "Black", isActive: true },
        ],
      },
    });
    expect(created.ok(), `create failed: ${created.status()} ${await created.text()}`).toBeTruthy();

    const body = await created.json();
    expect(body.success).toBe(true);

    // The fields most likely to be lost silently: Mongoose strict mode drops
    // unknown schema keys without erroring, so assert they came BACK, not just
    // that the request succeeded.
    expect(body.data.includedEntries).toBe(10);
    expect(body.data.trackInventory).toBe(false);
    expect(body.data.variants).toHaveLength(2);
    expect(body.data.variants.map((v: { sku: string }) => v.sku).sort()).toEqual(
      [SKU_M, SKU_L].sort()
    );

    // And that it survives a read, not just the create response.
    const list = await request.get("/api/admin/products");
    expect(list.ok()).toBeTruthy();
    const listBody = await list.json();
    const found = listBody.data.find((p: { name: string }) => p.name === name);
    expect(found, "created product missing from the admin list").toBeTruthy();
    expect(found.variants).toHaveLength(2);
  });

  // No UI test for the Products tab itself. Reaching it requires rendering the
  // admin dashboard, which trips the watchdog on the pre-existing spend-by-url
  // 500 described above — the test would fail for a reason that has nothing to
  // do with the catalogue. Restore it once that route is fixed; `admin-gate`
  // already covers that /admin renders at all.
});

test.describe("shop catalogue — permissions @admin", () => {
  test.skip(process.env.E2E_EXTERNAL === "1", "needs the seeded isolated environment");

  test.use({ storageState: MEMBER_STATE });

  test("a member cannot read or write the admin catalogue", async ({ request }) => {
    // 401/403 both acceptable — the point is that it is not 200.
    const read = await request.get("/api/admin/products");
    expect(read.status()).toBeGreaterThanOrEqual(401);
    expect(read.status()).toBeLessThan(500);

    const write = await request.post("/api/admin/products", { data: {} });
    expect(write.status()).toBeGreaterThanOrEqual(401);
    expect(write.status()).toBeLessThan(500);
  });

  test("the destructive product routes reject a signed-in member", async ({ request }) => {
    // This family shipped completely unauthenticated. Never let that regress.
    const wipe = await request.delete("/api/products/delete-all");
    expect(wipe.status(), "delete-all must never be reachable").toBeGreaterThanOrEqual(401);
    expect(wipe.status()).toBeLessThan(500);
  });
});

test.describe("shop catalogue — storefront @admin", () => {
  test.skip(process.env.E2E_EXTERNAL === "1", "needs the seeded isolated environment");

  // Interactive click-through is scoped to chromium-desktop, matching the a11y
  // spec's documented approach (docs/e2e/a11y-baseline.md:44). Mobile WebKit
  // clicks against the shared `next dev` server are a known flake in this
  // harness — prize-build-url-params.spec.ts:141 records one timing out at 90s.
  // The API-level assertions above still run on every project, so the catalogue
  // contract stays covered cross-browser; only the click-through is narrowed.
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "interactive add-to-cart is chromium-desktop only — see comment"
  );

  test.use({ storageState: MEMBER_STATE });

  test("a print-to-order product is addable and the variant reaches the cart", async ({
    page,
    request,
  }) => {
    // Find the product the admin block created.
    const listed = await request.get("/api/products");
    expect(listed.ok()).toBeTruthy();
    const payload = await listed.json();
    const products: Array<{ _id?: string; id?: string; name: string }> =
      payload.products ?? payload.data ?? payload;
    const hoodie = products.find((p) => p.name === productName());
    test.skip(!hoodie, "admin creation test did not run in this shard");

    const id = hoodie!._id ?? hoodie!.id;
    await page.goto(`/shop/${id}`);

    // trackInventory:false with stock 0 must NOT read as out of stock.
    // Assert on THIS product's controls, not page-wide text — related-product
    // rails elsewhere on the page legitimately carry their own stock labels.
    await expect(page.getByText("Made to order")).toBeVisible({ timeout: 20_000 });

    // The button names its own blocker rather than sitting silently disabled,
    // and must not read "Out of Stock" for a made-to-order item.
    const cta = page.getByRole("button", { name: /choose an option|add to cart|out of stock/i });
    await expect(cta).toBeVisible({ timeout: 20_000 });
    await expect(cta).toHaveText(/choose an option/i);

    // Pick the Large, then add.
    await page.getByRole("button", { name: "Black · L" }).click();
    await page.getByRole("button", { name: /add to cart/i }).click();

    // Deliberately NOT asserting the "Added to Cart!" label: it is a transient
    // 2-second state (ProductInteractions resets it on a setTimeout), so a
    // slower browser can finish the add and revert before the assertion polls.
    // Assert the durable outcome instead — the variant persisted server-side.
    // Without the sku the printer cannot be told which size to make.
    await expect
      .poll(
        async () => {
          const cart = await request.get("/api/cart");
          if (!cart.ok()) return null;
          const c = await cart.json();
          const items: Array<{ productId?: string; sku?: string }> = c.items ?? c.cart ?? [];
          return items.find((i) => i.productId === id)?.sku ?? null;
        },
        { timeout: 20_000, message: "variant sku never reached the server-side cart" }
      )
      .toBe(SKU_L);
  });
});
