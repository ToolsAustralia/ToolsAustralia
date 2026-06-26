import assert from "node:assert/strict";
import { getFaqEntries } from "@/data/faqs";

function main() {
  const entries = getFaqEntries();

  // 1. Returns a non-empty array of well-formed entries.
  assert.ok(Array.isArray(entries) && entries.length > 0, "getFaqEntries() must return a non-empty array");
  for (const entry of entries) {
    assert.ok(typeof entry.id === "string" && entry.id.length > 0, `entry must have an id: ${JSON.stringify(entry)}`);
    assert.ok(typeof entry.question === "string" && entry.question.length > 0, `entry ${entry.id} must have a question`);
    assert.ok(typeof entry.answer === "string" && entry.answer.length > 0, `entry ${entry.id} must have an answer`);
    assert.ok(
      ["ALL QUESTIONS", "SHOPPING", "PAYMENTS", "REWARDS", "PARTNERSHIPS"].includes(entry.category),
      `entry ${entry.id} has invalid category: ${entry.category}`
    );
  }

  const combinedText = entries.map((e) => `${e.question} ${e.answer}`).join(" ");
  const lowerText = combinedText.toLowerCase();

  // 2. Canonical facts must be present.
  assert.ok(combinedText.includes("27th"), "FAQs must mention the draw date (27th)");
  assert.ok(lowerText.includes("non-refundable"), "FAQs must mention that memberships are non-refundable");
  assert.ok(lowerText.includes("$20"), "FAQs must mention the Tradie tier price ($20)");
  assert.ok(lowerText.includes("randomdraws.com.au"), "FAQs must mention randomdraws.com.au as the certified draw service");

  // 3. Stale / incorrect claims must NOT appear (case-insensitive).
  const bannedPhrases = ["paypal", "international shipping", "3-5 business day", "3-5 business days"];
  for (const banned of bannedPhrases) {
    assert.ok(
      !lowerText.includes(banned),
      `FAQs must not contain stale phrase: "${banned}"`
    );
  }

  // 4. Cancellation self-service entry (id 18) must exist with correct content.
  const cancelEntry = entries.find((e) => e.id === "18");
  assert.ok(cancelEntry !== undefined, "FAQ entry id=18 (cancel/stop auto-renewal) must exist");
  const cancelLower = cancelEntry!.answer.toLowerCase();
  assert.ok(
    cancelLower.includes("/my-account"),
    "Cancel FAQ (id 18) must include the /my-account link"
  );
  assert.ok(
    cancelLower.includes("subscription") && (cancelLower.includes("tab") || cancelLower.includes("settings")),
    "Cancel FAQ (id 18) must reference the Subscription tab/settings path"
  );
  assert.ok(
    cancelLower.includes("non-refundable"),
    "Cancel FAQ (id 18) must mention non-refundable policy"
  );
  assert.ok(
    cancelLower.includes("australian consumer law"),
    "Cancel FAQ (id 18) must mention Australian Consumer Law rights"
  );

  // 5. Refund entry (id 19) must exist.
  const refundEntry = entries.find((e) => e.id === "19");
  assert.ok(refundEntry !== undefined, "FAQ entry id=19 (refund policy + escalation) must exist");
  const refundLower = refundEntry!.answer.toLowerCase();
  assert.ok(refundLower.includes("non-refundable"), "Refund FAQ (id 19) must mention non-refundable");
  assert.ok(
    refundLower.includes("australian consumer law"),
    "Refund FAQ (id 19) must mention Australian Consumer Law"
  );
  assert.ok(
    refundEntry!.answer.includes("/contact"),
    "Refund FAQ (id 19) must include the /contact link"
  );

  // 6. Delete-account entry (id 20) must exist.
  const deleteEntry = entries.find((e) => e.id === "20");
  assert.ok(deleteEntry !== undefined, "FAQ entry id=20 (delete account) must exist");
  assert.ok(
    deleteEntry!.answer.includes("/contact"),
    "Delete-account FAQ (id 20) must include the /contact link"
  );
  assert.ok(
    deleteEntry!.answer.includes("/my-account"),
    "Delete-account FAQ (id 20) must include the /my-account link"
  );

  // 7. Unexpected-charge entry (id 21) must exist.
  const chargeEntry = entries.find((e) => e.id === "21");
  assert.ok(chargeEntry !== undefined, "FAQ entry id=21 (unexpected charge) must exist");
  assert.ok(
    chargeEntry!.answer.includes("/my-account"),
    "Unexpected-charge FAQ (id 21) must include /my-account link"
  );
  assert.ok(
    chargeEntry!.answer.toLowerCase().includes("billing date"),
    "Unexpected-charge FAQ (id 21) must explain renewal happens on the member's own billing date (NOT a blanket 'the 24th of each month' — only 25th–27th joiners are anchored to the 24th)"
  );

  // 8. Total entry count must be 27 after the June 2026 additions.
  assert.strictEqual(entries.length, 27, `Expected 27 FAQ entries, got ${entries.length}`);

  // 9. Upgrade entry (id 22) must exist and link to /my-account.
  const upgradeEntry = entries.find((e) => e.id === "22");
  assert.ok(upgradeEntry !== undefined, "FAQ entry id=22 (upgrade membership) must exist");
  assert.ok(
    upgradeEntry!.answer.includes("[My Account](/my-account)"),
    "Upgrade FAQ (id 22) must include [My Account](/my-account) link"
  );

  // 10. Downgrade entry (id 23) must exist and link to /my-account.
  const downgradeEntry = entries.find((e) => e.id === "23");
  assert.ok(downgradeEntry !== undefined, "FAQ entry id=23 (downgrade membership) must exist");
  assert.ok(
    downgradeEntry!.answer.includes("[My Account](/my-account)"),
    "Downgrade FAQ (id 23) must include [My Account](/my-account) link"
  );

  console.log("PASS — faqs.test.ts passed —", entries.length, "entries, all checks green");
}

main();
