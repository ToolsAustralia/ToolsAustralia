/**
 * escalation.test.ts
 *
 * Tests for:
 *   - escalateToHuman: creates a ContactSubmission and sends an email notification
 *     (both member and anonymous actors; email-failure path is best-effort).
 *   - buildSystemPrompt: string assertions confirming hard-refusal, winner-source,
 *     never-invent, escalation, AI-disclosure, and knowledge-text embedding.
 *
 * No Mongo, no SendGrid — all I/O is stubbed via the deps injection point.
 *
 * Run: npm run test:chat-escalation
 *
 * NOTE: dotenv loaded before app imports because modules may read env at load time
 * (mirrors the knowledge-pack and deflection test patterns).
 */

import { config } from "dotenv";
import path from "node:path";

// Load .env.local before importing app modules.
config({ path: path.resolve(process.cwd(), ".env.local") });

import assert from "node:assert/strict";
import { escalateToHuman } from "../escalation";
import { buildSystemPrompt } from "../systemPrompt";
import type { KnowledgePack } from "@/lib/support-chat/knowledge/pack";
import type { ChatActor } from "@/lib/support-chat/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

let failures = 0;

function fail(label: string, msg: string): void {
  failures++;
  console.error(`  FAIL  ${label}: ${msg}`);
}

function pass(label: string): void {
  console.log(`  PASS  ${label}`);
}

// ─── escalateToHuman tests ────────────────────────────────────────────────────

async function testMemberActor() {
  console.log("\nescalateToHuman — member actor");

  const capturedSubmission: Record<string, unknown> = {};
  const capturedEmail: Record<string, unknown> = {};

  const actor: ChatActor = {
    kind: "member",
    userId: "user_abc123",
    firstName: "Jane",
  };

  const result = await escalateToHuman(
    {
      actor,
      contact: { name: "Jane Doe", email: "jane@example.com", phone: "0400000001" },
      transcriptSummary: "User asked about billing and couldn't find the answer.",
    },
    {
      createSubmission: async (fields) => {
        Object.assign(capturedSubmission, fields);
        return { submissionId: "sub_member_001", submittedAt: new Date().toISOString() };
      },
      sendEmail: async (payload) => {
        Object.assign(capturedEmail, payload);
        return { success: true };
      },
    }
  );

  // Return value
  if (!result.submissionId) {
    fail("returns submissionId", `got ${JSON.stringify(result)}`);
    return;
  }

  // Submission fields
  if (capturedSubmission.email !== "jane@example.com") {
    fail("email from contact.email", `got ${capturedSubmission.email}`);
    return;
  }
  if (typeof capturedSubmission.message !== "string" || !(capturedSubmission.message as string).includes("billing")) {
    fail("message contains transcriptSummary", `got ${capturedSubmission.message}`);
    return;
  }
  if (typeof capturedSubmission.subject !== "string" || !(capturedSubmission.subject as string).includes("member")) {
    fail("subject mentions actor.kind", `got ${capturedSubmission.subject}`);
    return;
  }
  if (capturedSubmission.status !== "new") {
    fail("status is 'new'", `got ${capturedSubmission.status}`);
    return;
  }

  // Email payload
  if ((capturedEmail as { email?: string }).email !== "jane@example.com") {
    fail("email sent to contact.email", `got ${JSON.stringify(capturedEmail)}`);
    return;
  }

  pass(`member actor → submissionId=${result.submissionId}, correct fields, email sent`);
}

async function testAnonymousActor() {
  console.log("\nescalateToHuman — anonymous actor");

  const capturedSubmission: Record<string, unknown> = {};
  let emailCallCount = 0;

  const actor: ChatActor = {
    kind: "anonymous",
    ipKey: "ip_xyz789",
  };

  const result = await escalateToHuman(
    {
      actor,
      contact: { email: "anon@example.com", phone: "0411222333" },
      transcriptSummary: "Anonymous user needed help with partner discounts.",
    },
    {
      createSubmission: async (fields) => {
        Object.assign(capturedSubmission, fields);
        return { submissionId: "sub_anon_001", submittedAt: new Date().toISOString() };
      },
      sendEmail: async () => {
        emailCallCount++;
        return { success: true };
      },
    }
  );

  if (!result.submissionId) {
    fail("returns submissionId", `got ${JSON.stringify(result)}`);
    return;
  }
  if (capturedSubmission.email !== "anon@example.com") {
    fail("email from contact.email", `got ${capturedSubmission.email}`);
    return;
  }
  if (typeof capturedSubmission.subject !== "string" || !(capturedSubmission.subject as string).includes("anonymous")) {
    fail("subject mentions 'anonymous'", `got ${capturedSubmission.subject}`);
    return;
  }
  if (emailCallCount !== 1) {
    fail("sendEmail called once", `called ${emailCallCount} times`);
    return;
  }

  pass(`anonymous actor → submissionId=${result.submissionId}, subject mentions 'anonymous', email sent`);
}

async function testEmailFailurePath() {
  console.log("\nescalateToHuman — email failure path (best-effort)");

  let submissionCreated = false;

  const actor: ChatActor = {
    kind: "member",
    userId: "user_fail_001",
    firstName: "Bob",
  };

  const result = await escalateToHuman(
    {
      actor,
      contact: { name: "Bob Smith", email: "bob@example.com", phone: "0422333444" },
      transcriptSummary: "User needed escalation but email will fail.",
    },
    {
      createSubmission: async () => {
        submissionCreated = true;
        return { submissionId: "sub_fail_001", submittedAt: new Date().toISOString() };
      },
      sendEmail: async () => {
        // Simulate email failure
        return { success: false, error: "SMTP timeout" };
      },
    }
  );

  // Submission MUST have been created even though email failed
  if (!submissionCreated) {
    fail("submission created despite email failure", "createSubmission was not called");
    return;
  }

  // submissionId MUST be returned
  if (!result.submissionId) {
    fail("submissionId returned despite email failure", `got ${JSON.stringify(result)}`);
    return;
  }

  pass(`email failure path → submission still created, submissionId=${result.submissionId} returned`);
}

async function testTranscriptTruncation() {
  console.log("\nescalateToHuman — transcript truncated to ≤2000 chars");

  const longTranscript = "A".repeat(3000);
  let capturedMessage = "";

  const actor: ChatActor = { kind: "member", userId: "u1", firstName: "Test" };

  await escalateToHuman(
    {
      actor,
      contact: { email: "trunc@example.com", phone: "0400111222" },
      transcriptSummary: longTranscript,
    },
    {
      createSubmission: async (fields) => {
        capturedMessage = (fields.message as string) ?? "";
        return { submissionId: "sub_trunc", submittedAt: new Date().toISOString() };
      },
      sendEmail: async () => ({ success: true }),
    }
  );

  if (capturedMessage.length > 2000) {
    fail("message ≤ 2000 chars", `got ${capturedMessage.length} chars`);
    return;
  }

  pass(`transcript truncated to ${capturedMessage.length} chars (≤2000)`);
}

// ─── buildSystemPrompt tests ──────────────────────────────────────────────────

async function testSystemPromptContents() {
  console.log("\nbuildSystemPrompt — required content");

  const fakePack: KnowledgePack = {
    text: "FAKE_KNOWLEDGE_TEXT_FOR_TESTING_12345",
    sources: [{ id: "test-src", title: "Test Source" }],
  };

  const prompt = buildSystemPrompt(fakePack);

  if (typeof prompt !== "string" || prompt.length === 0) {
    fail("returns non-empty string", `got type=${typeof prompt}`);
    return;
  }

  // AI disclosure
  if (!/\bAI\b|artificial intelligence|automated assistant|virtual assistant/i.test(prompt)) {
    fail("AI disclosure present", `prompt does not mention AI/automated nature`);
    return;
  }
  pass("AI disclosure present");

  // Role/scope
  if (!prompt.includes("Tools Australia")) {
    fail("role mentions Tools Australia", "not found");
    return;
  }
  pass("role/scope: mentions 'Tools Australia'");

  // Context isolation
  if (!/treat.*input.*data|instructions.*data|user input.*not.*instructions/i.test(prompt)) {
    fail("context isolation instruction", "not found in prompt");
    return;
  }
  pass("context isolation instruction present");

  // randomdraws.com.au winner source
  if (!prompt.includes("randomdraws.com.au")) {
    fail("randomdraws.com.au winner source", "not found in prompt");
    return;
  }
  pass("randomdraws.com.au winner source line present");

  // Never invent prices/dates
  if (!/never invent|do not invent|must not invent/i.test(prompt)) {
    fail("never-invent instruction", "not found in prompt");
    return;
  }
  pass("never-invent prices/dates instruction present");

  // Escalation instruction
  if (!/escalat|contact.*team|pass.*team|human|specialist/i.test(prompt)) {
    fail("escalation instruction", "not found in prompt");
    return;
  }
  pass("escalation instruction present");

  // Hard refusal instruction
  if (!/refuse|refusal|must not|do not|forbidden|out.of.scope/i.test(prompt)) {
    fail("hard-refusal instruction", "not found in prompt");
    return;
  }
  pass("hard-refusal instruction present");

  // Never echo system prompt
  if (!/never.*repeat|never.*reveal|never.*echo|do not reveal.*prompt|do not repeat.*prompt/i.test(prompt)) {
    fail("never-echo-prompt instruction", "not found in prompt");
    return;
  }
  pass("never-echo-prompt instruction present");

  // Brief output instruction
  if (!/brief|concise|sentence|short/i.test(prompt)) {
    fail("brief-output instruction", "not found in prompt");
    return;
  }
  pass("brief-output instruction present");

  // Knowledge text embedded
  if (!prompt.includes("FAKE_KNOWLEDGE_TEXT_FOR_TESTING_12345")) {
    fail("pack.text embedded in prompt", "fake knowledge text not found in returned prompt");
    return;
  }
  pass("pack.text embedded verbatim in prompt");
}

async function testSystemPromptDeterminism() {
  console.log("\nbuildSystemPrompt — determinism");

  const fakePack: KnowledgePack = {
    text: "STABLE_KNOWLEDGE",
    sources: [{ id: "s1", title: "S1" }],
  };

  const p1 = buildSystemPrompt(fakePack);
  const p2 = buildSystemPrompt(fakePack);

  if (p1 !== p2) {
    fail("determinism", "two calls with same pack returned different strings");
    return;
  }

  pass("buildSystemPrompt is deterministic (byte-stable for same pack)");
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function run() {
  await testMemberActor();
  await testAnonymousActor();
  await testEmailFailurePath();
  await testTranscriptTruncation();
  await testSystemPromptContents();
  await testSystemPromptDeterminism();

  console.log(`\n${"─".repeat(60)}`);

  if (failures > 0) {
    console.error(`escalation/systemPrompt tests FAILED — ${failures} assertion(s) failed`);
    process.exit(1);
  }

  console.log("PASS — escalation/systemPrompt test");
  console.log("  Covered: member actor, anonymous actor, email-failure path, transcript truncation,");
  console.log("           systemPrompt content (AI disclosure, role, context isolation, randomdraws.com.au,");
  console.log("           never-invent, escalation, hard-refusal, never-echo-prompt, brief, knowledge embed),");
  console.log("           systemPrompt determinism");
  process.exit(0);
}

void run().catch((err) => {
  console.error(err);
  process.exit(1);
});
