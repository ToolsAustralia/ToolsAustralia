import { test, expect } from "../../fixtures/test";

test.describe("membership tiers @smoke @demo", () => {
  test("membership page shows the three subscription tiers", async ({ page }) => {
    await page.goto("/membership");
    for (const tier of ["Tradie", "Foreman", "Boss"]) {
      await expect(page.getByRole("button", { name: new RegExp(`choose ${tier}`, "i") }).or(page.getByRole("link", { name: new RegExp(`choose ${tier}`, "i") })).first()).toBeVisible({ timeout: 20_000 });
    }
    await expect(page.locator("body")).toContainText(/free entr(y|ies)/i);
  });
});
