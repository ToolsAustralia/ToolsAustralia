#!/usr/bin/env npx tsx
/**
 * eval-chat-goldenset.ts
 *
 * Offline answer-quality eval for the Tools Australia AI support chatbot.
 *
 * What it does:
 *   1. Loads ~25–30 curated golden-set questions grounded in canonical facts
 *      (FAQ entries, BUSINESS.md: 27th draw/8:30pm, $20/$40/$80 tiers+entries,
 *      non-refundable, ACT/SA excluded, randomdraws.com.au, partner tiers,
 *      day-24 renewal, referral 100 entries). No prices or dates are invented.
 *   2. Runs tryDeflect() on each question — if deflection answers, uses the
 *      canned answer (no LLM, zero cost). Otherwise calls the primary model
 *      (claude-haiku-4-5) with generateText() using the real system prompt and
 *      knowledge pack (fully offline — no Mongo required).
 *   3. Sends ONE Anthropic Message Batch (via @anthropic-ai/sdk) to grade ALL
 *      answers in parallel at 50% discount. Each batch item judges: did the answer
 *      state the expected facts without hallucinating prices/dates/winners, and
 *      did it correctly deflect/escalate when expected? Grader prompt is strict JSON.
 *   4. Polls for batch completion (adaptive backoff 5s → 30s), then retrieves and
 *      parses results. Reports per-question PASS/FAIL and overall pass rate.
 *   5. Exits 0 if pass rate >= 80%, exits 1 otherwise. Exits 2 on setup/auth error.
 *
 * Usage:
 *   npm run eval:chat                 # full run (~25 questions)
 *   npm run eval:chat -- --limit 3    # cheap verification (3 questions)
 *   EVAL_LIMIT=3 npm run eval:chat    # same via env
 *
 * Requirements:
 *   .env.local must contain ANTHROPIC_API_KEY
 *   The generated chatKnowledgePack must exist (run: npm run build:chat-knowledge-pack)
 *
 * Architecture:
 *   - answer-gen deps (tryDeflect, getKnowledgePack, buildSystemPrompt, getChatModel,
 *     generateText) are injectable via EvalDeps for testing without a real API call.
 *   - Grading uses the @anthropic-ai/sdk Batch API directly (not the AI SDK), since
 *     the Vercel AI SDK does not expose the Batch API surface.
 *   - Grader model: claude-opus-4-8 (highest quality judge, 50% Batch discount).
 *
 * Exit codes:
 *   0 — pass rate >= 80%
 *   1 — pass rate < 80% (quality regression)
 *   2 — setup / API error (not a quality failure)
 *
 * @module scripts/eval-chat-goldenset
 */

import { config } from "dotenv";
import path from "path";
import { parseArgs } from "node:util";

// Load .env.local before any env-dependent imports.
config({ path: path.resolve(process.cwd(), ".env.local") });

import Anthropic from "@anthropic-ai/sdk";
import { generateText } from "ai";
import { getChatModel } from "../src/lib/support-chat/provider";
import { getKnowledgePack } from "../src/lib/support-chat/knowledge/pack";
import { buildSystemPrompt } from "../src/services/support-chat/systemPrompt";
import { tryDeflect } from "../src/services/support-chat/deflection";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface GoldenItem {
  id: string;
  question: string;
  /** Canonical facts the answer MUST mention (verified against FAQ + BUSINESS.md). */
  expectedFacts: string[];
  /** If true, a pure deflect (no LLM) is acceptable as the correct path. */
  shouldDeflect?: boolean;
  /** If true, the answer should offer/trigger escalation. */
  shouldEscalate?: boolean;
}

interface GradeResult {
  pass: boolean;
  missingFacts: string[];
  hallucinations: string[];
  notes: string;
}

interface EvalResult {
  id: string;
  question: string;
  answer: string;
  answeredByDeflection: boolean;
  grade: GradeResult;
}

/** Injectable deps — swap for stubs in tests. */
export interface EvalDeps {
  tryDeflectFn?: typeof tryDeflect;
  getKnowledgePackFn?: typeof getKnowledgePack;
  buildSystemPromptFn?: typeof buildSystemPrompt;
  getChatModelFn?: typeof getChatModel;
  generateTextFn?: typeof generateText;
  /** Inject a stub to skip real Batch API call. Returns pre-parsed grades. */
  gradeBatchFn?: (items: Array<{ id: string; question: string; answer: string; expectedFacts: string[]; shouldDeflect?: boolean; shouldEscalate?: boolean }>, knowledgePackText: string) => Promise<GradeResult[]>;
}

// ─── Golden Set ────────────────────────────────────────────────────────────────
// ALL facts below are sourced from getFaqEntries() and BUSINESS.md.
// No prices, dates, or facts are invented.

const GOLDEN_SET: GoldenItem[] = [
  // ── Draw mechanics ──────────────────────────────────────────────────────────
  {
    id: "draw-date",
    question: "When is the monthly draw?",
    expectedFacts: ["27th", "8:30", "PM"],
    shouldDeflect: true,
  },
  {
    id: "draw-freeze",
    question: "What time is the entry cutoff on draw night?",
    expectedFacts: ["8:00 PM", "27th"],
  },
  {
    id: "draw-organiser",
    question: "Who picks the winner? Is it random?",
    expectedFacts: ["randomdraws.com.au", "independent"],
  },
  {
    id: "draw-verification",
    question: "How can I verify the draw is fair?",
    expectedFacts: ["randomdraws.com.au", "independent"],
  },
  // ── Membership tiers ────────────────────────────────────────────────────────
  {
    id: "tier-tradie",
    question: "How much is the Tradie membership and how many entries do I get?",
    expectedFacts: ["$20", "15 entries"],
    shouldDeflect: true,
  },
  {
    id: "tier-foreman",
    question: "What does the Foreman plan cost and how many entries does it include?",
    expectedFacts: ["$40", "40 entries"],
    shouldDeflect: true,
  },
  {
    id: "tier-boss",
    question: "What's included with the Boss membership?",
    expectedFacts: ["$80", "100 entries"],
    shouldDeflect: true,
  },
  {
    id: "tier-compare",
    question: "What are the three membership tiers and their prices?",
    expectedFacts: ["Tradie", "$20", "Foreman", "$40", "Boss", "$80"],
    shouldDeflect: true,
  },
  // ── Payments & renewal ──────────────────────────────────────────────────────
  {
    id: "renewal-date",
    question: "When does my subscription renew each month?",
    expectedFacts: ["24th"],
    shouldDeflect: true,
  },
  {
    id: "refund-policy",
    question: "Can I get a refund on my membership?",
    expectedFacts: ["non-refundable"],
    shouldDeflect: true,
  },
  {
    id: "payment-fail",
    question: "What happens if my payment fails at renewal?",
    expectedFacts: ["past-due", "retry", "email"],
  },
  {
    id: "payment-methods",
    question: "What payment methods do you accept?",
    expectedFacts: ["Visa", "Mastercard", "Stripe"],
  },
  // ── Eligibility ─────────────────────────────────────────────────────────────
  {
    id: "eligibility-state",
    question: "Can residents of ACT or South Australia enter?",
    expectedFacts: ["ACT", "South Australia", "excluded"],
    shouldDeflect: true,
  },
  {
    id: "eligibility-age",
    question: "How old do I need to be to enter?",
    expectedFacts: ["18"],
  },
  // ── Partner discounts ────────────────────────────────────────────────────────
  {
    id: "partner-tradie",
    question: "What partner discounts do Tradie members get?",
    expectedFacts: ["50%"],
  },
  {
    id: "partner-boss",
    question: "Do Boss members get full access to partner discounts?",
    expectedFacts: ["100%"],
  },
  {
    id: "partner-foreman",
    question: "How much of the partner catalog can Foreman members see?",
    expectedFacts: ["75%"],
  },
  // ── Entries & referrals ─────────────────────────────────────────────────────
  {
    id: "referral-bonus",
    question: "How many bonus entries do I get for referring a friend?",
    expectedFacts: ["100"],
  },
  {
    id: "entries-carry-forward",
    question: "Do my subscription entries carry forward if I cancel?",
    expectedFacts: ["carry forward", "current"],
  },
  {
    id: "mini-draws",
    question: "What are Mini Draws and how do they work?",
    expectedFacts: ["threshold", "separate", "product-specific"],
  },
  {
    id: "one-time-packs",
    question: "Can I enter without a subscription?",
    expectedFacts: ["one-time", "packs"],
  },
  // ── Prizes ──────────────────────────────────────────────────────────────────
  {
    id: "prize-cash-option",
    question: "Can the winner take cash instead of tools?",
    expectedFacts: ["$10,000", "cash"],
  },
  {
    id: "prize-tools",
    question: "What tool brands can the winner choose from?",
    expectedFacts: ["Milwaukee", "DeWalt", "Makita", "Ryobi"],
  },
  // ── Out-of-scope / escalation ───────────────────────────────────────────────
  {
    id: "cancel-request",
    question: "Please cancel my subscription right now.",
    expectedFacts: [],
    shouldEscalate: true,
  },
  {
    id: "refund-request",
    question: "I want a refund for last month.",
    expectedFacts: [],
    shouldEscalate: true,
  },
  {
    id: "off-topic",
    question: "What's the weather like in Sydney today?",
    expectedFacts: [],
    shouldEscalate: true,
  },
  {
    id: "tools-australia-what",
    question: "What is Tools Australia?",
    expectedFacts: ["membership", "draw", "giveaway", "Australian"],
    shouldDeflect: true,
  },
];

// ─── Answer generation ─────────────────────────────────────────────────────────

async function generateAnswer(
  item: GoldenItem,
  deps: Required<Omit<EvalDeps, "gradeBatchFn">>
): Promise<{ answer: string; answeredByDeflection: boolean }> {
  const deflection = await deps.tryDeflectFn(item.question);
  if (deflection.answered && deflection.answer) {
    return { answer: deflection.answer, answeredByDeflection: true };
  }

  const pack = deps.getKnowledgePackFn();
  const system = deps.buildSystemPromptFn(pack);
  const model = deps.getChatModelFn("primary");

  const result = await deps.generateTextFn({
    model,
    system,
    prompt: item.question,
    maxOutputTokens: 300,
  });

  return { answer: result.text.trim() || "(no response)", answeredByDeflection: false };
}

// ─── Grading via Anthropic Batch API ──────────────────────────────────────────

const GRADER_MODEL = "claude-opus-4-8";
const POLL_INITIAL_MS = 5_000;
const POLL_MAX_MS = 30_000;

function buildGraderPrompt(
  question: string,
  answer: string,
  expectedFacts: string[],
  shouldDeflect: boolean | undefined,
  shouldEscalate: boolean | undefined,
  knowledgePackText: string
): string {
  const factsSection =
    expectedFacts.length > 0
      ? `Expected facts the answer MUST include:\n${expectedFacts.map((f) => `- ${f}`).join("\n")}`
      : "No specific facts required (this is an escalation/out-of-scope test).";

  const escalateNote = shouldEscalate
    ? "\nThis question REQUIRES escalation or a refusal to act — the answer should NOT attempt to process a cancellation/refund or answer off-topic questions. It should offer to connect the user with support."
    : "";

  // Ground truth for hallucination detection is the SAME knowledge pack the bot
  // answers from (getKnowledgePack().text). Both derive from the single canonical
  // source (build:chat-knowledge-pack), so a reprice/date change propagates to the
  // grader automatically — no hand-maintained fact list to drift out of sync.
  const canonicalFacts = `
CANONICAL TOOLS AUSTRALIA FACTS (the complete allowed fact set — do NOT flag anything stated here as a hallucination):
${knowledgePackText}
`;

  return `You are grading an AI support chatbot answer for Tools Australia.

QUESTION:
${question}

ANSWER:
${answer}

${factsSection}${escalateNote}

${canonicalFacts}

Grading rules:
1. PASS if: all expected facts are present (or none required and escalation is appropriate), AND the answer does not invent specific numbers/prices/brands/dates that contradict the CANONICAL FACTS above.
2. FAIL if: any expected fact is missing from the answer, OR the answer states specific numbers/dates/brands/prices that CONTRADICT the canonical facts, OR for escalation questions: the bot tries to process the cancellation/refund/out-of-scope request instead of declining and offering to escalate.
3. IMPORTANT: Do NOT fail for minor descriptive qualifiers (e.g. calling randomdraws.com.au "Australian") or reasonable inferences consistent with the canonical facts. Only fail for specific factual contradictions (wrong price, wrong date, wrong entry count, wrong brand, fabricated winner, etc.).
4. "missingFacts": list only facts from the EXPECTED FACTS list that are absent from the answer. Empty array if none missing.
5. "hallucinations": list only specific numerical/factual claims in the answer that directly CONTRADICT canonical facts (e.g. wrong price, wrong count). Do NOT list claims that are consistent with or naturally follow from the canonical facts. Empty array if no contradictions.
6. "notes": one short sentence on why it passed or the key failure reason.

Respond ONLY with valid JSON matching this exact schema (no markdown, no extra text):
{"pass":true,"missingFacts":[],"hallucinations":[],"notes":"<one sentence>"}`;
}

async function gradeBatch(
  items: Array<{
    id: string;
    question: string;
    answer: string;
    expectedFacts: string[];
    shouldDeflect?: boolean;
    shouldEscalate?: boolean;
  }>,
  knowledgePackText: string
): Promise<GradeResult[]> {
  const client = new Anthropic();

  const requests: Anthropic.MessageCreateParamsNonStreaming[] = items.map((item) => ({
    model: GRADER_MODEL,
    max_tokens: 256,
    messages: [
      {
        role: "user",
        content: buildGraderPrompt(
          item.question,
          item.answer,
          item.expectedFacts,
          item.shouldDeflect,
          item.shouldEscalate,
          knowledgePackText
        ),
      },
    ],
  }));

  // Submit the batch.
  const batch = await client.messages.batches.create({
    requests: items.map((item, i) => ({
      custom_id: item.id,
      params: requests[i],
    })),
  });

  console.log(`\nBatch submitted: ${batch.id} (${items.length} requests)`);

  // Poll until terminal state.
  let pollMs = POLL_INITIAL_MS;
  let batchStatus = batch;
  while (batchStatus.processing_status === "in_progress") {
    await new Promise((r) => setTimeout(r, pollMs));
    pollMs = Math.min(pollMs * 1.5, POLL_MAX_MS);
    batchStatus = await client.messages.batches.retrieve(batch.id);
    const counts = batchStatus.request_counts;
    console.log(
      `  Batch ${batchStatus.processing_status} — ` +
        `processing:${counts.processing} succeeded:${counts.succeeded} errored:${counts.errored}`
    );
  }

  // Retrieve results.
  const gradeMap = new Map<string, GradeResult>();
  for await (const result of await client.messages.batches.results(batch.id)) {
    if (result.result.type === "succeeded") {
      const content = result.result.message.content[0];
      const rawText = content.type === "text" ? content.text.trim() : "";
      try {
        // Strip any accidental markdown fences.
        const jsonText = rawText.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
        const parsed = JSON.parse(jsonText) as Partial<GradeResult>;
        gradeMap.set(result.custom_id, {
          pass: parsed.pass ?? false,
          missingFacts: parsed.missingFacts ?? [],
          hallucinations: parsed.hallucinations ?? [],
          notes: parsed.notes ?? "",
        });
      } catch {
        gradeMap.set(result.custom_id, {
          pass: false,
          missingFacts: [],
          hallucinations: [],
          notes: `Grader returned unparseable JSON: ${rawText.slice(0, 100)}`,
        });
      }
    } else {
      const errMsg =
        result.result.type === "errored" ? result.result.error.type : result.result.type;
      gradeMap.set(result.custom_id, {
        pass: false,
        missingFacts: [],
        hallucinations: [],
        notes: `Grader API error: ${errMsg}`,
      });
    }
  }

  // Return in input order.
  return items.map((item) =>
    gradeMap.get(item.id) ?? {
      pass: false,
      missingFacts: item.expectedFacts,
      hallucinations: [],
      notes: "No grader result returned for this item.",
    }
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function run(deps: EvalDeps = {}): Promise<void> {
  // Parse the limit from --limit N or EVAL_LIMIT (the CLI arg wins).
  let rawLimit: string | undefined;
  try {
    const { values } = parseArgs({
      args: process.argv.slice(2),
      options: { limit: { type: "string", short: "l" } },
      strict: false,
    });
    if (values.limit) rawLimit = String(values.limit);
  } catch {
    // parseArgs not available or failed — fall back to env below.
  }
  if (rawLimit === undefined && process.env.EVAL_LIMIT) {
    rawLimit = process.env.EVAL_LIMIT;
  }

  // Guard a non-numeric / invalid limit. A bare parseInt would yield NaN →
  // slice(0, NaN) → [] → "100% of 0 passed" → a dangerous silent CI pass.
  let limit: number | undefined;
  if (rawLimit !== undefined) {
    const parsed = Number(rawLimit);
    if (!Number.isInteger(parsed) || parsed < 1) {
      console.error(
        `eval:chat ERROR: invalid limit "${rawLimit}" — must be an integer >= 1.`
      );
      process.exit(2);
    }
    limit = parsed;
  }

  const items = limit !== undefined ? GOLDEN_SET.slice(0, limit) : GOLDEN_SET;

  const resolvedDeps: Required<Omit<EvalDeps, "gradeBatchFn">> = {
    tryDeflectFn: deps.tryDeflectFn ?? tryDeflect,
    getKnowledgePackFn: deps.getKnowledgePackFn ?? getKnowledgePack,
    buildSystemPromptFn: deps.buildSystemPromptFn ?? buildSystemPrompt,
    getChatModelFn: deps.getChatModelFn ?? getChatModel,
    generateTextFn: deps.generateTextFn ?? generateText,
  };

  const resolvedGradeBatch = deps.gradeBatchFn ?? gradeBatch;

  console.log(`\nTools Australia chat eval — ${items.length} question(s)`);
  if (limit !== undefined) {
    console.log(`(limited to first ${limit} of ${GOLDEN_SET.length} total)`);
  }
  console.log("─".repeat(60));

  // ── Step 1: Generate answers ──────────────────────────────────────────────
  console.log("\n[1/3] Generating answers...");
  const answers: Array<{ id: string; question: string; answer: string; answeredByDeflection: boolean }> = [];
  let deflectCount = 0;
  let llmCount = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    process.stdout.write(`  ${i + 1}/${items.length} "${item.question.slice(0, 50)}..." `);
    const { answer, answeredByDeflection } = await generateAnswer(item, resolvedDeps);
    answers.push({ id: item.id, question: item.question, answer, answeredByDeflection });
    if (answeredByDeflection) deflectCount++;
    else llmCount++;
    console.log(answeredByDeflection ? "[deflect]" : "[llm]");
  }

  console.log(`\n  Deflection: ${deflectCount}  LLM: ${llmCount}`);

  // ── Step 2: Grade via Batch API ───────────────────────────────────────────
  console.log("\n[2/3] Submitting grader batch to Anthropic (claude-opus-4-8)...");

  const gradeInputs = items.map((item, i) => ({
    id: item.id,
    question: item.question,
    answer: answers[i].answer,
    expectedFacts: item.expectedFacts,
    shouldDeflect: item.shouldDeflect,
    shouldEscalate: item.shouldEscalate,
  }));

  // Ground truth for hallucination detection = the SAME knowledge pack the bot
  // answers from (single canonical source → no drift on a reprice/date change).
  const knowledgePackText = resolvedDeps.getKnowledgePackFn().text;
  const grades = await resolvedGradeBatch(gradeInputs, knowledgePackText);

  // ── Step 3: Report ────────────────────────────────────────────────────────
  console.log("\n[3/3] Results\n");
  console.log("─".repeat(60));

  const results: EvalResult[] = items.map((item, i) => ({
    id: item.id,
    question: item.question,
    answer: answers[i].answer,
    answeredByDeflection: answers[i].answeredByDeflection,
    grade: grades[i],
  }));

  let passed = 0;
  const failures: EvalResult[] = [];

  for (const r of results) {
    const status = r.grade.pass ? "PASS" : "FAIL";
    const src = r.answeredByDeflection ? "deflect" : "llm";
    console.log(`${status}  [${src}]  ${r.id}`);
    if (!r.grade.pass) {
      failures.push(r);
      const missingFacts = r.grade.missingFacts ?? [];
      const hallucinations = r.grade.hallucinations ?? [];
      if (missingFacts.length > 0) {
        console.log(`     missing: ${missingFacts.join(", ")}`);
      }
      if (hallucinations.length > 0) {
        console.log(`     hallucinations: ${hallucinations.join(", ")}`);
      }
      console.log(`     notes: ${r.grade.notes}`);
    } else {
      passed++;
    }
  }

  const total = results.length;
  const passRate = total > 0 ? passed / total : 0;

  console.log("\n" + "─".repeat(60));
  console.log(`\nSummary: ${passed}/${total} passed (${Math.round(passRate * 100)}%)`);
  console.log(`Threshold: 80%  Status: ${passRate >= 0.8 ? "PASS" : "FAIL"}\n`);

  if (failures.length > 0) {
    console.log(`Failures (${failures.length}):`);
    for (const f of failures) {
      console.log(`  - ${f.id}: ${f.grade.notes}`);
    }
    console.log();
  }

  if (passRate < 0.8) {
    console.error("eval:chat FAILED — pass rate below 80% threshold");
    process.exit(1);
  }

  console.log("eval:chat PASSED");
  process.exit(0);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

run().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`eval:chat ERROR: ${msg}`);
  process.exit(2);
});
