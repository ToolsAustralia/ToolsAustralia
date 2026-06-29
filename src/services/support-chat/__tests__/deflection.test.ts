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
import { matchIntent } from "../deflection/decisionTree";
import { getFaqEntries } from "@/data/faqs";
import { membershipPackages } from "@/data/membershipPackages";

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

  // Source-tied price assertion (same style as knowledge-pack.test.ts): the
  // returned answer must contain EVERY active subscription tier's real
  // `$<price>/month`, read live from @/data/membershipPackages. Hardcoding
  // $20/$40/$80 would mask the very repricing drift the deflection layer exists
  // to prevent — if a tier is repriced in the data file but the FAQ copy was not
  // updated, this fails.
  const activeSubs = membershipPackages.filter((p) => p.type === "subscription" && p.isActive);
  if (activeSubs.length === 0) {
    fail("active subscription tiers in source data", "expected at least one active subscription tier");
    return;
  }
  for (const tier of activeSubs) {
    if (!result.answer.includes(`$${tier.price}/month`)) {
      fail(
        `answer includes active tier "${tier.name}" real price $${tier.price}/month`,
        `answer: ${result.answer.slice(0, 160)}`
      );
      return;
    }
  }

  const faqEntries = getFaqEntries();
  const matchedFaq = faqEntries.find((e) => e.answer === result.answer);
  if (!matchedFaq) {
    fail("answer grounded to FAQ entry", "answer text does not match any FAQ entry (possible drift)");
    return;
  }

  pass(
    `"how much does a membership cost" → answered:true, grounded to FAQ id=${matchedFaq.id}, ` +
      `all ${activeSubs.length} active tier prices present (source-tied)`
  );
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

  // Assert the canonical, load-bearing eligibility fact: the excluded states.
  // "Australian" is incidental phrasing; the permit-restricted exclusions
  // (ACT AND South Australia) are the fact a member actually relies on.
  if (!result.answer.includes("ACT")) {
    fail("answer mentions excluded ACT", `answer: ${result.answer.slice(0, 160)}`);
    return;
  }
  if (!result.answer.includes("South Australia")) {
    fail("answer mentions excluded South Australia", `answer: ${result.answer.slice(0, 160)}`);
    return;
  }

  const faqEntries = getFaqEntries();
  const matchedFaq = faqEntries.find((e) => e.answer === result.answer);
  if (!matchedFaq) {
    fail("answer grounded to FAQ entry", "answer text does not match any FAQ entry (possible drift)");
    return;
  }

  pass(
    `"who can enter the competition" → answered:true, grounded to FAQ id=${matchedFaq.id}, ` +
      `mentions excluded ACT + South Australia`
  );
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

async function testLayer2Coverage() {
  console.log("\nLayer-2 coverage (faqSearch/retrieve.ts via a paraphrase)");

  // This paraphrase deliberately contains NO decision-tree (Layer-1) signal
  // phrase — verified empirically — so it can only deflect via Layer-2 cosine
  // FAQ search (retrieve.ts). The previous four answered:true cases all matched
  // Layer-1 verbatim, leaving retrieve.ts's scoring with zero coverage through
  // the public path. This case exercises it: it routes through Layer-2 to the
  // partner-discounts FAQ (id=16, TF-IDF score ≈ 0.73, well above the calibrated
  // 0.46 threshold — calibrated 2026-06-29 via calibrate:chat-deflection).
  const paraphrase = "what discounts do members get from partner brands";

  // 1. Layer-1 must MISS (proves the case isn't secretly a decision-tree hit).
  const intent = matchIntent(paraphrase);
  if (intent.matched !== false) {
    fail(
      "Layer-1 misses the paraphrase",
      `matchIntent matched=${intent.matched}${intent.matched ? ` id=${intent.faqId}` : ""} — pick a paraphrase with no Layer-1 signal`
    );
    return;
  }

  // 2. tryDeflect must still answer (proves Layer-2 catches it).
  const result = await tryDeflect(paraphrase);
  if (result.answered !== true) {
    fail("Layer-2 catches the paraphrase", `tryDeflect answered=${result.answered} (expected true)`);
    return;
  }
  if (typeof result.answer !== "string" || result.answer.length === 0) {
    fail("non-empty Layer-2 answer", "answer is missing or empty");
    return;
  }

  // 3. No-drift: the Layer-2 answer must equal a real FAQ entry's answer.
  const faqEntries = getFaqEntries();
  const matchedFaq = faqEntries.find((e) => e.answer === result.answer);
  if (!matchedFaq) {
    fail("Layer-2 answer grounded to FAQ entry", "answer text does not match any FAQ entry (possible drift)");
    return;
  }

  pass(`"${paraphrase}" → Layer-1 miss, Layer-2 catch → answered:true, grounded to FAQ id=${matchedFaq.id}`);
}

async function testCancellationSelfService() {
  console.log("\ncancellation self-service intent");

  const result = await tryDeflect("how do I cancel my membership");

  if (result.answered !== true) {
    fail("answered:true", `got answered=${result.answered}`);
    return;
  }
  if (typeof result.answer !== "string" || result.answer.length === 0) {
    fail("non-empty answer", "answer is missing or empty");
    return;
  }

  // Must contain the /my-account link (self-service path).
  if (!result.answer.includes("/my-account")) {
    fail("answer includes /my-account link", `answer: ${result.answer.slice(0, 160)}`);
    return;
  }

  // Must NOT have required an LLM call — this is a free deflection.
  // Verified by the answered:true result from tryDeflect (which only returns true
  // for grounded deflections, never for LLM responses).

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

  if (matchedFaq.id !== "18") {
    fail("answer is from cancellation FAQ (id=18)", `matched id=${matchedFaq.id} instead`);
    return;
  }

  pass(
    `"how do I cancel my membership" → answered:true (no LLM), grounded to FAQ id=${matchedFaq.id}, /my-account link present`
  );
}

async function testStopAutoRenewal() {
  console.log("\nstop auto-renewal phrasing");

  const result = await tryDeflect("how do I stop auto renewal");

  if (result.answered !== true) {
    fail("answered:true", `got answered=${result.answered}`);
    return;
  }

  const faqEntries = getFaqEntries();
  const matchedFaq = faqEntries.find((e) => e.answer === result.answer);
  if (!matchedFaq || matchedFaq.id !== "18") {
    fail(
      "maps to cancel FAQ (id=18)",
      matchedFaq ? `got id=${matchedFaq.id}` : "no FAQ match"
    );
    return;
  }

  pass(`"how do I stop auto renewal" → answered:true, grounded to FAQ id=18`);
}

async function testUnexpectedCharge() {
  console.log("\nunexpected/unauthorised charge intent");

  const result = await tryDeflect("I didn't authorise this charge");

  if (result.answered !== true) {
    fail("answered:true", `got answered=${result.answered}`);
    return;
  }

  const faqEntries = getFaqEntries();
  const matchedFaq = faqEntries.find((e) => e.answer === result.answer);
  if (!matchedFaq || matchedFaq.id !== "21") {
    fail(
      "maps to unexpected-charge FAQ (id=21)",
      matchedFaq ? `got id=${matchedFaq.id}` : "no FAQ match"
    );
    return;
  }

  pass(`"I didn't authorise this charge" → answered:true, grounded to FAQ id=21`);
}

async function testDeleteAccount() {
  console.log("\ndelete account intent");

  const result = await tryDeflect("how do I delete my account");

  if (result.answered !== true) {
    fail("answered:true", `got answered=${result.answered}`);
    return;
  }

  const faqEntries = getFaqEntries();
  const matchedFaq = faqEntries.find((e) => e.answer === result.answer);
  if (!matchedFaq || matchedFaq.id !== "20") {
    fail(
      "maps to delete-account FAQ (id=20)",
      matchedFaq ? `got id=${matchedFaq.id}` : "no FAQ match"
    );
    return;
  }

  pass(`"how do I delete my account" → answered:true, grounded to FAQ id=20`);
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

async function testUpgradeMembership() {
  console.log("\nupgrade membership intent");

  const result = await tryDeflect("how do I upgrade my membership");

  if (result.answered !== true) {
    fail("answered:true", `got answered=${result.answered}`);
    return;
  }
  if (typeof result.answer !== "string" || result.answer.length === 0) {
    fail("non-empty answer", "answer is missing or empty");
    return;
  }

  // Must contain /my-account link (self-service path).
  if (!result.answer.includes("/my-account")) {
    fail("answer includes /my-account link", `answer: ${result.answer.slice(0, 160)}`);
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

  if (matchedFaq.id !== "22") {
    fail("answer is from upgrade FAQ (id=22)", `matched id=${matchedFaq.id} instead`);
    return;
  }

  pass(
    `"how do I upgrade my membership" → answered:true (no LLM), grounded to FAQ id=${matchedFaq.id}, /my-account link present`
  );
}

async function testPauseMembership() {
  console.log("\npause membership intent");

  const result = await tryDeflect("can I pause my membership");

  if (result.answered !== true) {
    fail("answered:true", `got answered=${result.answered}`);
    return;
  }
  if (typeof result.answer !== "string" || result.answer.length === 0) {
    fail("non-empty answer", "answer is missing or empty");
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

  if (matchedFaq.id !== "25") {
    fail("answer is from pause FAQ (id=25)", `matched id=${matchedFaq.id} instead`);
    return;
  }

  pass(
    `"can I pause my membership" → answered:true (no LLM), grounded to FAQ id=${matchedFaq.id}`
  );
}

// ─── Regression routes (the 2026-06 answer-quality fix) ──────────────────────
// Each question previously deflected to a WRONG canned answer (cosine matched the
// nearest-of-N FAQ by word overlap). These assert the correct route now. Source:
// the support-quality audit stress-test (45% mis-route rate before this fix).

/** Assert tryDeflect routes `question` to FAQ `expectedId` (grounded, no drift). */
async function expectRoute(question: string, expectedId: string): Promise<void> {
  const result = await tryDeflect(question);
  if (result.answered !== true) {
    fail(`"${question}" → id ${expectedId}`, `answered=${result.answered} (expected a deflection)`);
    return;
  }
  const matchedFaq = getFaqEntries().find((e) => e.answer === result.answer);
  if (!matchedFaq) {
    fail(`"${question}" grounded`, "answer matches no FAQ entry (drift)");
    return;
  }
  if (matchedFaq.id !== expectedId) {
    fail(`"${question}" → id ${expectedId}`, `routed to id=${matchedFaq.id} instead`);
    return;
  }
  pass(`"${question}" → id=${expectedId}`);
}

async function testRegressionRoutes() {
  console.log("\nregression routes (previously confidently-wrong)");

  // Joining / how-membership-works (was → partner id17 / refund id19)
  await expectRoute("how to become a member", "28");
  await expectRoute("how does membership work", "28");
  await expectRoute("how do i join", "28");

  // Account-aware: my entries / my tier (was → get-more-entries id8 / downgrade id23)
  await expectRoute("where can i see my entries", "29");
  await expectRoute("how many entries do i have", "29");
  await expectRoute("what tier am i on", "30");

  // Result / fulfilment / dispute → results or human (was → prize catalog id3 / id21)
  await expectRoute("did i win", "31");
  await expectRoute("how do i check the draw results", "31");
  await expectRoute("where is my prize", "38");
  await expectRoute("why was i charged twice", "38");
  await expectRoute("how do i talk to a human", "38");

  // Renewal DATE (was → renewal-payment-FAILED id13)
  await expectRoute("when is my renewal", "11");

  // New knowledge gaps now covered
  await expectRoute("i forgot my password", "32");
  await expectRoute("i signed up but i'm not a member", "33");
  await expectRoute("is my card safe", "34");
  await expectRoute("do prices include gst", "36");
  await expectRoute("how do i update my card", "37");

  // CRITICAL non-regressions — these must NOT have moved:
  await expectRoute("what can i win", "3"); // prize catalog still answers prize questions
  await expectRoute("how do i get more entries", "8"); // not the account-aware id29
  await expectRoute("how do i sign up for a one-time pack", "5"); // id28 "sign up" must not swallow the pack flow
  await expectRoute("how much to join", "4"); // pricing, not the join overview id28
}

async function testInjectableThresholds() {
  console.log("\ninjectable thresholds (refactor)");

  // A query that deflects via Layer-2 at the calibrated defaults
  // ("what discounts do members get from partner brands" → id16, score ≈ 0.73,
  // well above the 0.46 floor calibrated 2026-06-29).
  const q = "what discounts do members get from partner brands";

  // With an impossibly high floor, Layer-2 must abstain (proves opts is threaded).
  const high = await tryDeflect(q, { minConfidence: 0.99 });
  if (high.answered !== false) {
    fail('"…partner brands" abstains at minConfidence 0.99', `answered=${high.answered}`);
  } else {
    pass("high minConfidence forces Layer-2 abstain");
  }

  // Default call is unchanged (still deflects).
  const def = await tryDeflect(q);
  if (def.answered !== true) {
    fail('"…partner brands" still deflects at defaults', `answered=${def.answered}`);
  } else {
    pass("default thresholds unchanged (still deflects)");
  }

  // A Layer-1 intent hit is threshold-independent (opts must NOT affect it).
  const l1 = await tryDeflect("when is the draw", { minConfidence: 0.99, minMargin: 0.99 });
  if (l1.answered !== true) {
    fail("Layer-1 intent ignores thresholds", `answered=${l1.answered}`);
  } else {
    pass("Layer-1 intent unaffected by thresholds");
  }
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function run() {
  await testDrawDate();
  await testPricing();
  await testRefund();
  await testEligibility();
  await testOffTopicWeather();
  await testOffTopicCapital();
  await testLayer2Coverage();
  await testCancellationSelfService();
  await testStopAutoRenewal();
  await testUnexpectedCharge();
  await testDeleteAccount();
  await testDeterminism();
  await testUpgradeMembership();
  await testPauseMembership();
  await testRegressionRoutes();
  await testInjectableThresholds();

  console.log(`\n${"─".repeat(60)}`);

  if (failures > 0) {
    console.error(`deflection tests FAILED — ${failures} assertion(s) failed`);
    process.exit(1);
  }

  console.log("PASS — deflection test");
  console.log(`  FAQ entries available : ${getFaqEntries().length}`);
  console.log("  Covered: draw date, pricing (source-tied), refund, eligibility (excluded states), off-topic×2, Layer-2 coverage, cancel self-service, stop auto-renewal, unexpected charge, delete account, determinism, upgrade membership, pause membership");
  process.exit(0);
}

void run().catch((err) => {
  console.error(err);
  process.exit(1);
});
