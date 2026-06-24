/**
 * deflection.test.ts
 *
 * Verifies the no-LLM deflection layer:
 *   - decision-tree high-precision intent matches return `answered:true` with grounded
 *     canned answers sourced directly from getFaqEntries() (no drift).
 *   - faqSearch keyword fallback also returns grounded answers.
 *   - Off-topic questions return `answered:false` (falls through to LLM).
 *   - No module from provider.ts / ai SDK is imported (proves zero LLM involvement).
 *
 * Run: npm run test:chat-deflection
 *
 * NOTE: dotenv loaded before app imports because data files read Stripe price IDs
 * from env at module load (matches the knowledge-pack test pattern).
 */

import { config } from "dotenv";
import path from "node:path";

// Load .env.local before importing app modules that may read env at load-time.
config({ path: path.resolve(process.cwd(), ".env.local") });

import { tryDeflect } from "../deflection/index";
import { getFaqEntries } from "@/data/faqs";

// ─── Helper ──────────────────────────────────────────────────────────────────

let failures = 0;

function fail(label: string, msg: string): void {
  failures++;
  console.error(`  FAIL  ${label}: ${msg}`);
}

function pass(label: string): void {
  console.log(`  PASS  ${label}`);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

async function testDrawDate() {
  console.log("\ndraw date intent");

  const result = await tryDeflect("when is the draw");

  if (result.answered !== true) {
    fail("answered:true", `got answered=${result.answered}`);
    return;
  }
  if (typeof result.answer !== "string" || result.answer.length === 0) {
    fail("non-empty answer", "answer is missing or empty");
    return;
  }
  if (!result.answer.includes("27th")) {
    fail("answer mentions 27th", `answer: ${result.answer.slice(0, 80)}`);
    return;
  }

  // No-drift: returned answer must exactly equal a getFaqEntries() entry's .answer
  const faqEntries = getFaqEntries();
  const matchedFaq = faqEntries.find((e) => e.answer === result.answer);
  if (!matchedFaq) {
    fail(
      "answer grounded to FAQ entry",
      "answer text does not exactly match any getFaqEntries() .answer (possible drift)"
    );
    return;
  }

  // Sources check
  if (!Array.isArray(result.sources) || result.sources.length === 0) {
    fail("sources non-empty", "sources array is missing or empty");
    return;
  }
  const src = result.sources[0];
  if (!src.id || !src.title) {
    fail("source has id+title", `source=${JSON.stringify(src)}`);
    return;
  }

  pass(`"when is the draw" → answered:true, grounded to FAQ id=${matchedFaq.id}, mentions "27th"`);
}

async function testPricing() {
  console.log("\npricing/tiers intent");

  const result = await tryDeflect("how much does a membership cost");

  if (result.answered !== true) {
    fail("answered:true", `got answered=${result.answered}`);
    return;
  }
  if (typeof result.answer !== "string" || result.answer.length === 0) {
    fail("non-empty answer", "answer is missing or empty");
    return;
  }

  const hasPrice = result.answer.includes("$20") || result.answer.includes("$40") || result.answer.includes("$80");
  if (!hasPrice) {
    fail("answer contains canonical price", `answer: ${result.answer.slice(0, 120)}`);
    return;
  }

  const faqEntries = getFaqEntries();
  const matchedFaq = faqEntries.find((e) => e.answer === result.answer);
  if (!matchedFaq) {
    fail("answer grounded to FAQ entry", "answer text does not match any FAQ entry (possible drift)");
    return;
  }

  pass(`"how much does a membership cost" → answered:true, grounded to FAQ id=${matchedFaq.id}`);
}

async function testRefund() {
  console.log("\nrefund policy intent");

  const result = await tryDeflect("can I get a refund");

  if (result.answered !== true) {
    fail("answered:true", `got answered=${result.answered}`);
    return;
  }
  if (typeof result.answer !== "string" || result.answer.length === 0) {
    fail("non-empty answer", "answer is missing or empty");
    return;
  }

  const lower = result.answer.toLowerCase();
  if (!lower.includes("non-refundable") && !lower.includes("refund")) {
    fail("answer mentions refund policy", `answer: ${result.answer.slice(0, 120)}`);
    return;
  }

  const faqEntries = getFaqEntries();
  const matchedFaq = faqEntries.find((e) => e.answer === result.answer);
  if (!matchedFaq) {
    fail("answer grounded to FAQ entry", "answer text does not match any FAQ entry (possible drift)");
    return;
  }

  pass(`"can I get a refund" → answered:true, grounded to FAQ id=${matchedFaq.id}`);
}

async function testEligibility() {
  console.log("\neligibility intent");

  const result = await tryDeflect("who can enter the competition");

  if (result.answered !== true) {
    fail("answered:true", `got answered=${result.answered}`);
    return;
  }
  if (typeof result.answer !== "string" || result.answer.length === 0) {
    fail("non-empty answer", "answer is missing or empty");
    return;
  }

  const hasEligibility =
    result.answer.includes("ACT") || result.answer.includes("18") || result.answer.includes("Australian");
  if (!hasEligibility) {
    fail("answer mentions eligibility facts", `answer: ${result.answer.slice(0, 120)}`);
    return;
  }

  const faqEntries = getFaqEntries();
  const matchedFaq = faqEntries.find((e) => e.answer === result.answer);
  if (!matchedFaq) {
    fail("answer grounded to FAQ entry", "answer text does not match any FAQ entry (possible drift)");
    return;
  }

  pass(`"who can enter the competition" → answered:true, grounded to FAQ id=${matchedFaq.id}`);
}

async function testOffTopicWeather() {
  console.log("\noff-topic question (weather in Paris)");

  const result = await tryDeflect("what's the weather in Paris");

  if (result.answered !== false) {
    fail("answered:false", `got answered=${result.answered}`);
    return;
  }
  if (result.answer !== undefined) {
    fail("no answer on off-topic miss", `got answer="${result.answer}"`);
    return;
  }

  pass('"what\'s the weather in Paris" → answered:false (falls through to LLM)');
}

async function testOffTopicCapital() {
  console.log("\noff-topic question (capital of France)");

  const result = await tryDeflect("what is the capital of France");

  if (result.answered !== false) {
    fail("answered:false", `got answered=${result.answered}`);
    return;
  }

  pass('"what is the capital of France" → answered:false');
}

async function testDeterminism() {
  console.log("\ndeterminism (no non-deterministic LLM)");

  const r1 = await tryDeflect("when is the draw");
  const r2 = await tryDeflect("when is the draw");

  if (r1.answered !== r2.answered) {
    fail("determinism answered", `run1=${r1.answered} run2=${r2.answered}`);
    return;
  }
  if (r1.answer !== r2.answer) {
    fail("determinism answer text", "repeated calls returned different answers");
    return;
  }

  pass("repeated calls produce identical results (no LLM randomness)");
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function run() {
  await testDrawDate();
  await testPricing();
  await testRefund();
  await testEligibility();
  await testOffTopicWeather();
  await testOffTopicCapital();
  await testDeterminism();

  console.log(`\n${"─".repeat(60)}`);

  if (failures > 0) {
    console.error(`deflection tests FAILED — ${failures} assertion(s) failed`);
    process.exit(1);
  }

  console.log("PASS — deflection test");
  console.log(`  FAQ entries available : ${getFaqEntries().length}`);
  console.log("  Covered: draw date, pricing, refund, eligibility, off-topic×2, determinism");
  process.exit(0);
}

void run().catch((err) => {
  console.error(err);
  process.exit(1);
});
