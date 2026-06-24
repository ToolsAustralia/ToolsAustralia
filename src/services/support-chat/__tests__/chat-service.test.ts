/**
 * chat-service.test.ts
 *
 * Tests for chatService.respond — the deflect → budget → LLM orchestration.
 *
 * Everything external is injected via `deps` so this test runs with ZERO Mongo
 * and ZERO Anthropic involvement:
 *   - tryDeflect        — stubbed per case (answered true/false)
 *   - assertWithinBudget — stubbed per case (ok true/false)
 *   - recordUsage       — spy
 *   - streamFn          — stub that mimics v6 streamText's return (invokes onFinish
 *                         with stubbed token usage, returns an object whose
 *                         toUIMessageStreamResponse() yields a Response)
 *   - persist           — captures the conversation + every ChatMessage write
 *   - escalateToHuman   — spy
 *   - getModel          — returns a fake model with a .modelId string
 *
 * The brief cases:
 *   1. Deflectable        → model NEVER called; user+assistant persisted (redacted);
 *                           recordUsage NOT called; audit.deflected===true; writeAudit(200).
 *   2. Non-deflectable    → model called exactly once; messages persisted;
 *                           recordUsage called with stub token counts;
 *                           writeAudit(200); audit.deflected===false.
 *   3. Over-budget        → canned "busy" fallback; model NEVER called.
 *   + redactPII applied to persisted user content (email masked).
 *
 * Plus the security-critical request_human tool (least-privilege boundary):
 *   4. no contact.email   → returns "share your email" string; escalate + setEscalated
 *                           NOT called; audit.escalated stays false (files NOTHING).
 *   5. with contact.email → escalate called once with the SERVER-SIDE actor + the
 *                           request contact (never a model-supplied value);
 *                           setEscalated(conversationId, submissionId) called;
 *                           audit.escalated === true.
 *
 * Run: npm run test:chat-service
 */

import { config } from "dotenv";
import path from "node:path";

// Load .env.local before importing app modules (mirrors sibling tests).
config({ path: path.resolve(process.cwd(), ".env.local") });

import { chatService, buildRequestHumanTool } from "../ChatService";
import type { ChatServiceDeps, PersistPort } from "../ChatService";
import type { ChatCtx } from "@/lib/support-chat/withChatbot";
import type { ChatActor } from "@/lib/support-chat/types";
import type { UIMessage, ToolCallOptions } from "ai";

// ─── Helpers ─────────────────────────────────────────────────────────────────

let failures = 0;

function fail(label: string, msg: string): void {
  failures++;
  console.error(`  FAIL  ${label}: ${msg}`);
}

function pass(label: string): void {
  console.log(`  PASS  ${label}`);
}

/** Build a minimal UIMessage user message with a single text part. */
function userMessage(text: string): UIMessage {
  return {
    id: "u1",
    role: "user",
    parts: [{ type: "text", text }],
  };
}

/** A fake ctx with a mutable audit accumulator + a writeAudit spy. */
function makeCtx(actor: ChatActor): {
  ctx: ChatCtx;
  writeAuditCalls: number[];
} {
  const writeAuditCalls: number[] = [];
  const ctx: ChatCtx = {
    actor,
    req: new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "user-agent": "test-agent/1.0" },
    }),
    requestId: "req_test_123",
    ipHash: "iphash_test",
    audit: { deflected: false, escalated: false },
    writeAudit: async (status: number) => {
      writeAuditCalls.push(status);
    },
  };
  return { ctx, writeAuditCalls };
}

/** A persist port that records everything it's asked to write. */
function makePersistSpy(): {
  port: PersistPort;
  conversation: { created: boolean; id: string };
  messages: Array<{ role: string; content: string; citations?: unknown }>;
  statusUpdates: Array<{ status: string; submissionId?: string }>;
  usageUpdates: Array<{ modelId: string; input: number; output: number }>;
} {
  const messages: Array<{ role: string; content: string; citations?: unknown }> = [];
  const statusUpdates: Array<{ status: string; submissionId?: string }> = [];
  const usageUpdates: Array<{ modelId: string; input: number; output: number }> = [];
  const conversation = { created: false, id: "conv_test_001" };

  const port: PersistPort = {
    ensureConversation: async () => {
      conversation.created = true;
      return { conversationId: conversation.id };
    },
    addMessage: async (msg) => {
      messages.push({ role: msg.role, content: msg.content, citations: msg.citations });
    },
    setEscalated: async (conversationId, submissionId) => {
      statusUpdates.push({ status: "escalated", submissionId });
      void conversationId;
    },
    recordConversationUsage: async (conversationId, modelId, input, output) => {
      usageUpdates.push({ modelId, input, output });
      void conversationId;
    },
    // hCaptcha gate support (Task 1.8): default stubs — tests that don't exercise
    // the gate need these to satisfy the interface.
    isAnonConversationVerified: async () => false,
    markHumanVerified: async () => {},
  };

  return { port, conversation, messages, statusUpdates, usageUpdates };
}

// ─── Test 1: deflectable ──────────────────────────────────────────────────────

async function testDeflectable() {
  console.log("\nchatService.respond — deflectable question");

  const { ctx, writeAuditCalls } = makeCtx({
    kind: "member",
    userId: "507f1f77bcf86cd799439011",
    firstName: "Jane",
  });
  const persist = makePersistSpy();

  let modelCalled = false;
  let recordUsageCalled = false;

  // email in the question → must be redacted in persisted user content.
  const question = "Hi, my email is jane@example.com — what tiers exist?";

  const deps: ChatServiceDeps = {
    tryDeflect: async () => ({
      answered: true,
      answer: "We offer Bronze, Silver, and Gold tiers.",
      sources: [{ id: "membership-tiers", title: "Membership Tiers" }],
    }),
    assertWithinBudget: async () => ({ ok: true }),
    recordUsage: async () => {
      recordUsageCalled = true;
    },
    streamFn: () => {
      modelCalled = true;
      return {
        toUIMessageStreamResponse: () => new Response("should-not-run", { status: 200 }),
      };
    },
    persist: persist.port,
    escalateToHuman: async () => ({ submissionId: "x" }),
    getModel: () => ({ modelId: "claude-haiku-4-5" }) as never,
  };

  const res = await chatService.respond(
    { ctx, messages: [userMessage(question)] },
    deps
  );

  // Consume the stream so any onFinish hook completes.
  await res.text();
  // Give microtasks a tick to flush.
  await new Promise((r) => setTimeout(r, 0));

  if (modelCalled) {
    fail("model NOT called for deflectable", "streamFn was invoked");
    return;
  }
  if (recordUsageCalled) {
    fail("recordUsage NOT called for deflectable", "recordUsage was invoked");
    return;
  }
  if (ctx.audit.deflected !== true) {
    fail("audit.deflected === true", `got ${ctx.audit.deflected}`);
    return;
  }
  if (!writeAuditCalls.includes(200)) {
    fail("writeAudit(200) called", `got ${JSON.stringify(writeAuditCalls)}`);
    return;
  }
  if (!persist.conversation.created) {
    fail("conversation ensured", "ensureConversation not called");
    return;
  }
  // user + assistant messages persisted
  const userMsg = persist.messages.find((m) => m.role === "user");
  const asstMsg = persist.messages.find((m) => m.role === "assistant");
  if (!userMsg || !asstMsg) {
    fail("user+assistant persisted", `got roles ${persist.messages.map((m) => m.role).join(",")}`);
    return;
  }
  // redaction: the email must NOT survive in persisted user content
  if (userMsg.content.includes("jane@example.com")) {
    fail("user content redacted", `email leaked: "${userMsg.content}"`);
    return;
  }
  if (!userMsg.content.includes("[email]")) {
    fail("redaction placeholder present", `got "${userMsg.content}"`);
    return;
  }
  // assistant content is the deflection answer; citations mapped from sources
  if (!asstMsg.content.includes("Bronze")) {
    fail("assistant content is deflection answer", `got "${asstMsg.content}"`);
    return;
  }
  if (
    !Array.isArray(asstMsg.citations) ||
    (asstMsg.citations as Array<{ docId: string }>)[0]?.docId !== "membership-tiers"
  ) {
    fail("citations mapped from sources", `got ${JSON.stringify(asstMsg.citations)}`);
    return;
  }
  if (ctx.audit.conversationId !== persist.conversation.id) {
    fail("audit.conversationId set", `got ${ctx.audit.conversationId}`);
    return;
  }

  pass("deflectable → no model, redacted user content, citations, writeAudit(200), deflected=true");
}

// ─── Test 2: non-deflectable ──────────────────────────────────────────────────

async function testNonDeflectable() {
  console.log("\nchatService.respond — non-deflectable question (LLM path)");

  const { ctx, writeAuditCalls } = makeCtx({
    kind: "anonymous",
    ipKey: "1.2.3.4",
  });
  const persist = makePersistSpy();

  let streamCalls = 0;
  const recordUsageArgs: Array<{ model: string; in: number; out: number }> = [];

  const deps: ChatServiceDeps = {
    tryDeflect: async () => ({ answered: false }),
    assertWithinBudget: async () => ({ ok: true }),
    recordUsage: async (model, tokensIn, tokensOut) => {
      recordUsageArgs.push({ model, in: tokensIn, out: tokensOut });
    },
    streamFn: (args) => {
      streamCalls++;
      // Emulate stream completion with stub token usage.
      void Promise.resolve().then(() =>
        args.onFinish?.({
          text: "Here is a streamed answer about draws.",
          usage: { inputTokens: 123, outputTokens: 45 },
        })
      );
      return {
        toUIMessageStreamResponse: () =>
          new Response("Here is a streamed answer about draws.", { status: 200 }),
      };
    },
    persist: persist.port,
    escalateToHuman: async () => ({ submissionId: "x" }),
    getModel: () => ({ modelId: "claude-haiku-4-5" }) as never,
    // Task 1.8: anonymous actors need the hCaptcha gate to pass for the LLM path.
    // Inject a stub that always succeeds so this test verifies existing behavior
    // (the gate itself is exercised in guest-gate.test.ts).
    verifyHcaptcha: async () => true,
  };

  const res = await chatService.respond(
    {
      ctx,
      messages: [userMessage("When is the next major draw and how do entries work?")],
      hcaptchaToken: "stub-valid-token",
    },
    deps
  );

  await res.text();
  await new Promise((r) => setTimeout(r, 0));

  if (streamCalls !== 1) {
    fail("model called exactly once", `streamFn called ${streamCalls} times`);
    return;
  }
  if (recordUsageArgs.length !== 1) {
    fail("recordUsage called once", `called ${recordUsageArgs.length} times`);
    return;
  }
  if (recordUsageArgs[0].in !== 123 || recordUsageArgs[0].out !== 45) {
    fail("recordUsage got stub token counts", `got ${JSON.stringify(recordUsageArgs[0])}`);
    return;
  }
  if (recordUsageArgs[0].model !== "claude-haiku-4-5") {
    fail("recordUsage got model.modelId", `got ${recordUsageArgs[0].model}`);
    return;
  }
  if (ctx.audit.deflected !== false) {
    fail("audit.deflected === false", `got ${ctx.audit.deflected}`);
    return;
  }
  if (ctx.audit.tokensIn !== 123 || ctx.audit.tokensOut !== 45) {
    fail("audit token counts set", `in=${ctx.audit.tokensIn} out=${ctx.audit.tokensOut}`);
    return;
  }
  if (ctx.audit.modelTier !== "claude-haiku-4-5") {
    fail("audit.modelTier set", `got ${ctx.audit.modelTier}`);
    return;
  }
  if (!writeAuditCalls.includes(200)) {
    fail("writeAudit(200) called", `got ${JSON.stringify(writeAuditCalls)}`);
    return;
  }
  // user message persisted before streaming + assistant persisted at onFinish
  const userMsg = persist.messages.find((m) => m.role === "user");
  const asstMsg = persist.messages.find((m) => m.role === "assistant");
  if (!userMsg) {
    fail("user message persisted", "no user message found");
    return;
  }
  if (!asstMsg) {
    fail("assistant message persisted at onFinish", "no assistant message found");
    return;
  }

  pass("non-deflectable → model once, recordUsage(123/45), audit set, writeAudit(200), messages persisted");
}

// ─── Test 3: over-budget ──────────────────────────────────────────────────────

async function testOverBudget() {
  console.log("\nchatService.respond — over-budget (canned busy fallback)");

  const { ctx, writeAuditCalls } = makeCtx({ kind: "anonymous", ipKey: "9.9.9.9" });
  const persist = makePersistSpy();

  let modelCalled = false;

  const deps: ChatServiceDeps = {
    tryDeflect: async () => ({ answered: false }),
    assertWithinBudget: async () => ({ ok: false, reason: "daily_budget" }),
    recordUsage: async () => {},
    streamFn: () => {
      modelCalled = true;
      return {
        toUIMessageStreamResponse: () => new Response("nope", { status: 200 }),
      };
    },
    persist: persist.port,
    escalateToHuman: async () => ({ submissionId: "x" }),
    getModel: () => ({ modelId: "claude-haiku-4-5" }) as never,
  };

  const res = await chatService.respond(
    { ctx, messages: [userMessage("Some obscure question the FAQ can't answer.")] },
    deps
  );

  const body = await res.text();
  await new Promise((r) => setTimeout(r, 0));

  if (modelCalled) {
    fail("model NOT called when over budget", "streamFn was invoked");
    return;
  }
  // canned "busy" fallback content should be present in the streamed body
  if (!/busy|FAQ|leave a message/i.test(body)) {
    fail("canned busy fallback emitted", `body did not contain busy text: ${body.slice(0, 120)}`);
    return;
  }
  if (ctx.audit.deflected !== false) {
    fail("audit.deflected === false", `got ${ctx.audit.deflected}`);
    return;
  }
  if (!writeAuditCalls.includes(200)) {
    fail("writeAudit(200) called", `got ${JSON.stringify(writeAuditCalls)}`);
    return;
  }

  pass("over-budget → canned busy fallback, no model call, writeAudit(200)");
}

// ─── request_human tool (least-privilege boundary) ────────────────────────────

/** A minimal fake ToolCallOptions — the tool's execute ignores it. */
const fakeToolCtx = {
  toolCallId: "tc_test",
  messages: [],
} as unknown as ToolCallOptions;

async function testRequestHumanNoEmail() {
  console.log("\nrequest_human tool — no contact.email (files NOTHING)");

  let escalateCalls = 0;
  const setEscalatedCalls: Array<{ conversationId: string; submissionId: string }> = [];
  let escalatedFlag: boolean = false;

  const persist = makePersistSpy();
  // Override setEscalated to record calls.
  persist.port.setEscalated = async (conversationId, submissionId) => {
    setEscalatedCalls.push({ conversationId, submissionId });
  };

  const tool = buildRequestHumanTool({
    actor: { kind: "anonymous", ipKey: "1.1.1.1" },
    contact: undefined, // no email collected yet
    conversationId: "conv_no_email",
    messages: [userMessage("I need a human.")],
    persist: persist.port,
    escalate: async () => {
      escalateCalls++;
      return { submissionId: "should_not_be_created" };
    },
    onEscalated: () => {
      escalatedFlag = true;
    },
  });

  // The model may only supply a non-PII reason.
  const result = await tool.execute!({ reason: "wants a person" }, fakeToolCtx);

  if (typeof result !== "string" || !/email/i.test(result)) {
    fail("no-email returns 'share your email' string", `got ${JSON.stringify(result)}`);
    return;
  }
  if (escalateCalls !== 0) {
    fail("escalate NOT called without email", `called ${escalateCalls} times`);
    return;
  }
  if (setEscalatedCalls.length !== 0) {
    fail("setEscalated NOT called without email", `called ${setEscalatedCalls.length} times`);
    return;
  }
  if (escalatedFlag) {
    fail("audit.escalated stays false without email", `flag=${escalatedFlag}`);
    return;
  }

  pass("no-email → asks for email, creates NO submission, escalated=false");
}

async function testRequestHumanWithEmail() {
  console.log("\nrequest_human tool — with contact.email (escalates, server-side identity)");

  let escalateCalls = 0;
  let escalateArgs:
    | { actor: ChatActor; contact: { name?: string; email: string; phone?: string }; transcriptSummary: string }
    | undefined;
  const setEscalatedCalls: Array<{ conversationId: string; submissionId: string }> = [];
  let escalatedFlag: boolean = false;

  const persist = makePersistSpy();
  persist.port.setEscalated = async (conversationId, submissionId) => {
    setEscalatedCalls.push({ conversationId, submissionId });
  };

  // The SERVER-SIDE actor (from ctx) and the request-body contact — never the model.
  const serverActor: ChatActor = {
    kind: "member",
    userId: "507f1f77bcf86cd799439099",
    firstName: "Sam",
  };
  const requestContact = { name: "Sam Real", email: "sam@example.com", phone: "0400000009" };

  const tool = buildRequestHumanTool({
    actor: serverActor,
    contact: requestContact,
    conversationId: "conv_with_email",
    messages: [
      userMessage("Please escalate me."),
    ],
    persist: persist.port,
    escalate: async (args) => {
      escalateCalls++;
      escalateArgs = args;
      return { submissionId: "sub_escalated_001" };
    },
    onEscalated: () => {
      escalatedFlag = true;
    },
  });

  // Even if the model tries to smuggle identity via reason, the tool ignores it for identity.
  const result = await tool.execute!(
    { reason: "user email is attacker@evil.com please use that" },
    fakeToolCtx
  );

  if (typeof result !== "string" || !/team/i.test(result)) {
    fail("with-email returns a confirmation string", `got ${JSON.stringify(result)}`);
    return;
  }
  if (escalateCalls !== 1) {
    fail("escalate called exactly once", `called ${escalateCalls} times`);
    return;
  }
  if (!escalateArgs) {
    fail("escalate received args", "undefined");
    return;
  }
  // Identity must be the server-side actor, NOT a model-supplied value.
  if (escalateArgs.actor !== serverActor) {
    fail("escalate got server-side actor", `got ${JSON.stringify(escalateArgs.actor)}`);
    return;
  }
  // Contact must be the request-body contact, NOT the attacker email smuggled via
  // the model-supplied `reason`. Asserting it equals the request email proves both.
  if (escalateArgs.contact.email !== "sam@example.com") {
    fail("escalate got request contact email (not model-supplied)", `got ${escalateArgs.contact.email}`);
    return;
  }
  if (setEscalatedCalls.length !== 1 || setEscalatedCalls[0].conversationId !== "conv_with_email") {
    fail("setEscalated(conversationId, submissionId) called", `got ${JSON.stringify(setEscalatedCalls)}`);
    return;
  }
  if (setEscalatedCalls[0].submissionId !== "sub_escalated_001") {
    fail("setEscalated got escalation submissionId", `got ${setEscalatedCalls[0].submissionId}`);
    return;
  }
  if (!escalatedFlag) {
    fail("audit.escalated === true after escalation", `flag=${escalatedFlag}`);
    return;
  }

  pass("with-email → escalate(server actor + request contact) once, setEscalated, escalated=true; model-supplied email ignored");
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function run() {
  await testDeflectable();
  await testNonDeflectable();
  await testOverBudget();
  await testRequestHumanNoEmail();
  await testRequestHumanWithEmail();

  console.log(`\n${"─".repeat(60)}`);

  if (failures > 0) {
    console.error(`chat-service tests FAILED — ${failures} assertion(s) failed`);
    process.exit(1);
  }

  console.log("PASS — chat-service test");
  console.log("  Covered: deflectable (no model, redacted persist, citations, writeAudit),");
  console.log("           non-deflectable (model once, recordUsage, audit token counts, writeAudit),");
  console.log("           over-budget (canned busy fallback, no model call),");
  console.log("           request_human no-email (files nothing, escalated=false),");
  console.log("           request_human with-email (server-side actor + request contact, setEscalated, escalated=true)");
  process.exit(0);
}

void run().catch((err) => {
  console.error(err);
  process.exit(1);
});
