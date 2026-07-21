import { test, expect } from "../../fixtures/test";

test.describe("mini-draws @smoke", () => {
  test("mini-draws page renders", async ({ page }) => {
    const res = await page.goto("/mini-draws");
    expect(res?.ok()).toBeTruthy();
    // Deviation from brief (documented in task-6-report.md): src/app/(site)/mini-draws/page.tsx
    // wraps its content in a plain <div>, not a <main> element — verified live, page.locator("main")
    // resolves to 0 elements on this route. The page's own <h1> ("Mini Draws", rendered by
    // MiniDrawsHero.tsx) is a unique, stable "did the page actually render" marker instead.
    await expect(page.getByRole("heading", { level: 1, name: /mini draws/i })).toBeVisible();
  });
});
