import { test, expect } from "../../fixtures/test";

// /mini-draws is publicly accessible. The list is rendered by MiniDrawsContent
// (a client component fed by useMiniDraws). The seed DB does not seed mini
// draws as fixtures, but the connected DB may already contain documents from
// prior dev work. This spec asserts the page renders either way:
//   - With at least one mini draw → "Showing N-M of T" string visible.
//   - Empty state → "No mini draws found" visible.
// Either branch passes; only a hard failure to render the body is caught.
test("/mini-draws renders list page (or graceful empty state)", async ({ page }) => {
  await page.goto("/mini-draws");
  await expect(page.locator("body")).toBeVisible();

  // Hero text is server-rendered and always present.
  await expect(page.getByRole("heading", { name: /mini draws/i }).first()).toBeVisible({ timeout: 10_000 });

  // Wait for the client-rendered results header to settle. Either branch is
  // acceptable: results count OR the empty-state message.
  await expect(
    page.getByText(/Showing\s+\d+-\d+\s+of\s+\d+\s+Mini Draws|No mini draws found/i),
  ).toBeVisible({ timeout: 15_000 });
});
