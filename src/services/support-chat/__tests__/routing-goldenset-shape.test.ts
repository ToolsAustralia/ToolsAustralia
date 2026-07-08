import assert from "node:assert/strict";
import { config } from "dotenv";
import path from "node:path";
config({ path: path.resolve(process.cwd(), ".env.local") });

import { ROUTING_GOLDEN_SET } from "./routingGoldenSet";
import { getSupportChatFaqEntries } from "@/data/supportChatFaqs";

function main() {
  const ids = new Set(getSupportChatFaqEntries().map((e) => e.id));
  assert.ok(ROUTING_GOLDEN_SET.length >= 80, `expected >= 80 routing cases, got ${ROUTING_GOLDEN_SET.length}`);

  const seenQuestions = new Set<string>();
  for (const c of ROUTING_GOLDEN_SET) {
    assert.ok(c.question.trim().length > 0, "case has a non-empty question");
    assert.ok(!seenQuestions.has(c.question), `duplicate question: "${c.question}"`);
    seenQuestions.add(c.question);
    assert.ok(c.note.trim().length > 0, `case "${c.question}" must have a note`);
    if (c.expect.kind === "deflect") {
      assert.ok(ids.has(c.expect.faqId), `case "${c.question}" deflects to missing FAQ id ${c.expect.faqId}`);
    }
  }

  // Boundary coverage: enough abstain/escalate cases to actually test precision.
  const mustNotDeflect = ROUTING_GOLDEN_SET.filter((c) => c.expect.kind !== "deflect").length;
  assert.ok(mustNotDeflect >= 20, `expected >= 20 abstain/escalate cases for precision, got ${mustNotDeflect}`);

  console.log(`PASS — routing golden set: ${ROUTING_GOLDEN_SET.length} cases, all faqIds valid, ${mustNotDeflect} must-not-deflect`);
}
main();
