import { test, expect } from "../../fixtures/test";
import { byTestId, testid } from "../../utils/selectors";

// Authenticated as fresh-tier member. The "View Past Draws" button lives in
// MajorDrawOverview on /my-account and opens PastDrawsModal. We narrow the
// spec to "modal opens"; loading / empty / populated states all render
// inside the modal regardless of seed contents.
test("clicking 'View Past Draws' on /my-account opens PastDrawsModal", async ({ page }) => {
  await page.goto("/my-account");

  // The button is rendered inside the dashboard shell — wait for hydration.
  const button = page.getByRole("button", { name: /view past draws/i });
  await expect(button).toBeVisible({ timeout: 10_000 });
  await button.scrollIntoViewIfNeeded().catch(() => {});
  // FloatingCountdownBanner / sticky overlays sit above the button at the
  // page bottom, so positional clicks fall outside the viewport even after
  // scroll. Dispatch the click event directly on the underlying DOM node.
  await button.dispatchEvent("click");

  // PastDrawsModal renders ModalContainer with testId="past-draws-modal".
  const modal = page.locator(byTestId(testid.pastDrawsModal));
  await expect(modal).toBeVisible({ timeout: 5_000 });
});
