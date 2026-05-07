// e2e/affiliate/commission-track.spec.ts
//
// The affiliate seed (scripts/seed-e2e-fixtures.ts seedAffiliate) does not
// create any AffiliateCommission docs, so this spec narrows to "the
// commissions section renders, even when empty" — verifying the heading
// and the empty-state copy ("No unpaid commissions yet"). Re-tighten once
// the seed grows fixture commissions.

import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";

test("recent commissions section renders (empty state when no commissions seeded)", async ({
  page,
}) => {
  await page.goto("/affiliate");

  const commissionsSection = page.locator(byTestId(testid.affiliateDashboardCommissions));
  await expect(commissionsSection).toBeVisible({ timeout: 15_000 });

  await expect(
    commissionsSection.getByRole("heading", { name: /recent unpaid commissions/i }),
  ).toBeVisible();

  // Either the empty-state copy or a populated table — assert one of them.
  const empty = commissionsSection.getByText(/no unpaid commissions yet/i);
  const table = commissionsSection.locator("table");
  await expect(empty.or(table).first()).toBeVisible({ timeout: 5_000 });
});
