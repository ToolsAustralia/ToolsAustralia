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

  console.log("✅ faqs.test.ts passed —", entries.length, "entries, all checks green");
}

main();
