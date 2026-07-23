import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Login page selectors verified: src/app/login/page-client.tsx:735-816. */
export async function loginViaUi(
  page: Page,
  email: string,
  password: string,
  opts?: { redirectTimeoutMs?: number }
): Promise<void> {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/(my-account|admin)/, { timeout: opts?.redirectTimeoutMs ?? 20_000 });
}
