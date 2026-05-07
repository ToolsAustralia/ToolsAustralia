import { test, expect } from "../../fixtures/test";
import { getDb } from "../../fixtures/seed-helpers";

// Mini-draw "sold out" state is reached when totalEntries >= minimumEntries
// (entriesRemaining <= 0). The detail page renders the closed-state copy
// "Entries are now closed" instead of the package picker. We mutate one
// active draw to push it over capacity, assert the closed copy renders,
// then restore. Mutation is wrapped in finally to avoid leaking state.
test.describe.configure({ mode: "serial" });

test("mini-draw detail page shows sold-out copy when entriesRemaining <= 0", async ({ page }) => {
  const { MiniDraw } = await getDb();
  const target = await MiniDraw.findOne({ status: "active" })
    .select("_id name totalEntries minimumEntries")
    .lean();

  if (!target) {
    test.info().annotations.push({
      type: "blocked",
      description: "No mini-draws in DB to manipulate for sold-out state.",
    });
    test.skip();
    return;
  }

  const targetTyped = target as {
    _id: { toString(): string };
    totalEntries?: number;
    minimumEntries?: number;
  };
  const id = String(targetTyped._id);
  const originalTotal = targetTyped.totalEntries ?? 0;
  const originalMin = targetTyped.minimumEntries ?? 0;

  // Drive entriesRemaining = 0 by setting totalEntries == minimumEntries.
  // Use a forced minimum of 100 so the math holds even if the doc currently has 0.
  const forcedMin = Math.max(originalMin, 100);
  await MiniDraw.updateOne(
    { _id: targetTyped._id },
    { $set: { totalEntries: forcedMin, minimumEntries: forcedMin } },
  );

  try {
    await page.goto(`/mini-draws/${id}`);
    await expect(page.getByText(/Entries are now closed/i)).toBeVisible({ timeout: 10_000 });
  } finally {
    await MiniDraw.updateOne(
      { _id: targetTyped._id },
      { $set: { totalEntries: originalTotal, minimumEntries: originalMin } },
    );
  }
});
