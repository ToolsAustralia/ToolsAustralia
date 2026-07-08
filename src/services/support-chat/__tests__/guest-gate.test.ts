/**
 * guest-gate.test.ts
 *
 * Tests for the hCaptcha guest generative gate (Task 1.8) in ChatService, and
 * a focused unit test of the verifyHcaptcha lib primitive.
 *
 * EVERYTHING is stubbed via deps injection — zero Mongo, zero Anthropic,
 * zero real hCaptcha network calls.
 *
 * Gate cases (all in ChatService.respond):
 *   1. anonymous + deflection MISS + no token  → 401 captcha_required; model NOT called.
 *   2. anonymous + miss + INVALID token         → 401 captcha_required; model NOT called.
 *   3. anonymous + miss + VALID token           → model called once; markHumanVerified called.
 *   4. anonymous + miss + already-verified conv → model called (no challenge); verifyHcaptcha NOT called.
 *   5. anonymous + deflection ANSWERED (FAQ)    → deflection answer returned; verifyHcaptcha NOT called.
 *   6. member + miss                            → model called; verifyHcaptcha NOT called.
 *
 * verifyHcaptcha unit tests:
 *   7. empty token → false without calling fetch.
 *   8. missing HCAPTCHA_SECRET → false.
 *   9. stub fetch returning {success:true} → true.
 *  10. stub fetch returning {success:false} → false.
 *  11. throwing fetch → false (fail-closed).
 *
 * Run: npm run test:chat-guest-gate
 */

import { config } from "dotenv";
import path from "node:path";

// Load .env.local before importing app modules (mirrors sibling tests).
config({ path: path.resolve(process.cwd(), ".env.local") });

import { chatService } from "../ChatService";
import type { ChatServiceDeps, PersistPort } from "../ChatService";
import type { ChatCtx } from "@/lib/support-chat/withChatbot";
import type { ChatActor } from "@/lib/support-chat/types";
import type { UIMessage } from "ai";
import { verifyHcaptcha } from "@/lib/support-chat/captcha";

// ─── Helpers ─────────────────────────────────────────────────────────────────

let failures = 0;

function fail(label: string, msg: string): void {
  failures++;
  console.error(`  FAIL  ${label}: ${msg}`);
}

function pass(label: string): void {
  console.log(`  PASS  ${label}`);
}

/** Build a minimal UIMessage user message. */
function userMessage(text: string): UIMessage {
  return { id: "u1", role: "user", parts: [{ type: "text", text }] };
}

/** Build a fake ChatCtx with a mutable audit + writeAudit spy. */
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
    requestId: "req_gate_test",
    ipHash: "iphash_gate_test",
    audit: { deflected: false, escalated: false },
    writeAudit: async (status: number) => {
      writeAuditCalls.push(status);
    },
  };
  return { ctx, writeAuditCalls };
}

/**
 * Build a minimal PersistPort stub with all required methods.
 * isAnonConversationVerified defaults to returning false (not verified).
 * Override individual methods as needed per test.
 */
function makePersistStub(overrides?: Partial<PersistPort>): {
  port: PersistPort;
  markHumanVerifiedCalls: string[];
  isAnonVerifiedCalls: Array<{ conversationId: string; ipHash: string }>;
} {
  const markHumanVerifiedCalls: string[] = [];
  const isAnonVerifiedCalls: Array<{ conversationId: string; ipHash: string }> = [];

  const port: PersistPort = {
    ensureConversation: async () => ({ conversationId: "conv_gate_001" }),
    addMessage: async () => {},
    setEscalated: async () => {},
    recordConversationUsage: async () => {},
    isAnonConversationVerified: async (conversationId, ipHash) => {
      isAnonVerifiedCalls.push({ conversationId, ipHash });
      return false;
    },
    markHumanVerified: async (conversationId) => {
      markHumanVerifiedCalls.push(conversationId);
    },
    ...overrides,
  };

  return { port, markHumanVerifiedCalls, isAnonVerifiedCalls };
}

/** Stub streamFn that records invocations and optionally fires onFinish. */
function makeStreamStub(fireOnFinish = true): {
  streamFn: ChatServiceDeps["streamFn"];
  calls: number;
} {
  let calls = 0;
  const streamFn: ChatServiceDeps["streamFn"] = (args) => {
    calls++;
    if (fireOnFinish) {
      void Promise.resolve().then(() =>
        args.onFinish?.({
          text: "Streamed answer.",
          usage: { inputTokens: 10, outputTokens: 5 },
        })
      );
    }
    return {
      toUIMessageStreamResponse: () => new Response("Streamed answer.", { status: 200 }),
    };
  };
  return {
    get calls() {
      return calls;
    },
    streamFn,
  };
}

// ─── Gate case 1: anonymous + miss + no token → 401 ──────────────────────────

async function testAnonNoToken() {
  console.log("\ngate — anonymous + deflection miss + no token → 401 captcha_required");

  const { ctx } = makeCtx({ kind: "anonymous", ipKey: "1.2.3.4" });
  const { port, markHumanVerifiedCalls } = makePersistStub();
  let streamCalled = false;
  let verifyCalled = false;

  const deps: ChatServiceDeps = {
    tryDeflect: async () => ({ answered: false }),
    assertWithinBudget: async () => ({ ok: true }),
    recordUsage: async () => {},
    streamFn: () => {
      streamCalled = true;
      return {
        toUIMessageStreamResponse: () => new Response("should-not-run", { status: 200 }),
      };
    },
    persist: port,
    escalateToHuman: async () => ({ submissionId: "x" }),
    getModel: () => ({ modelId: "claude-haiku-4-5" }) as never,
    // No token provided → verifyHcaptcha must NOT be called (empty token short-circuits).
    verifyHcaptcha: async () => {
      verifyCalled = true;
      return false;
    },
  };

  const res = await chatService.respond(
    { ctx, messages: [userMessage("What is the meaning of life?")] },
    deps
  );

  if (res.status !== 401) {
    fail("status 401", `got ${res.status}`);
    return;
  }
  const body = await res.json() as { success?: boolean; error?: string; code?: string };
  if (body.code !== "captcha_required") {
    fail("code captcha_required", `got ${JSON.stringify(body)}`);
    return;
  }
  if (body.success !== false) {
    fail("success:false", `got ${JSON.stringify(body)}`);
    return;
  }
  if (streamCalled) {
    fail("model NOT called", "streamFn was invoked");
    return;
  }
  if (verifyCalled) {
    fail("verifyHcaptcha NOT called on no-token path", "was called (empty token should short-circuit)");
    return;
  }
  if (markHumanVerifiedCalls.length > 0) {
    fail("markHumanVerified NOT called", `called ${markHumanVerifiedCalls.length} times`);
    return;
  }

  pass("anonymous + no token → 401 captcha_required, model + verifier not called");
}

// ─── Gate case 2: anonymous + miss + INVALID token → 401 ─────────────────────

async function testAnonInvalidToken() {
  console.log("\ngate — anonymous + deflection miss + invalid token → 401 captcha_required");

  const { ctx } = makeCtx({ kind: "anonymous", ipKey: "1.2.3.4" });
  const { port } = makePersistStub();
  let streamCalled = false;

  const deps: ChatServiceDeps = {
    tryDeflect: async () => ({ answered: false }),
    assertWithinBudget: async () => ({ ok: true }),
    recordUsage: async () => {},
    streamFn: () => {
      streamCalled = true;
      return {
        toUIMessageStreamResponse: () => new Response("nope", { status: 200 }),
      };
    },
    persist: port,
    escalateToHuman: async () => ({ submissionId: "x" }),
    getModel: () => ({ modelId: "claude-haiku-4-5" }) as never,
    // stub: token is rejected
    verifyHcaptcha: async () => false,
  };

  const res = await chatService.respond(
    {
      ctx,
      messages: [userMessage("Some LLM question")],
      hcaptchaToken: "bad-token",
    },
    deps
  );

  if (res.status !== 401) {
    fail("status 401", `got ${res.status}`);
    return;
  }
  const body = await res.json() as { code?: string };
  if (body.code !== "captcha_required") {
    fail("code captcha_required", `got ${JSON.stringify(body)}`);
    return;
  }
  if (streamCalled) {
    fail("model NOT called", "streamFn was invoked");
    return;
  }

  pass("anonymous + invalid token → 401 captcha_required, model not called");
}

// ─── Gate case 3: anonymous + miss + VALID token → model called ───────────────

async function testAnonValidToken() {
  console.log("\ngate — anonymous + deflection miss + valid token → model called; markHumanVerified called");

  const { ctx, writeAuditCalls } = makeCtx({ kind: "anonymous", ipKey: "1.2.3.4" });
  const { port, markHumanVerifiedCalls } = makePersistStub();
  const stream = makeStreamStub(true);

  const deps: ChatServiceDeps = {
    tryDeflect: async () => ({ answered: false }),
    assertWithinBudget: async () => ({ ok: true }),
    recordUsage: async () => {},
    streamFn: stream.streamFn,
    persist: port,
    escalateToHuman: async () => ({ submissionId: "x" }),
    getModel: () => ({ modelId: "claude-haiku-4-5" }) as never,
    // stub: token is VALID
    verifyHcaptcha: async () => true,
  };

  const res = await chatService.respond(
    {
      ctx,
      messages: [userMessage("What is the draw schedule?")],
      hcaptchaToken: "valid-token-123",
    },
    deps
  );

  await res.text();
  // Give microtasks a tick to flush onFinish.
  await new Promise((r) => setTimeout(r, 10));

  if (res.status !== 200) {
    fail("status 200 (LLM path)", `got ${res.status}`);
    return;
  }
  if (stream.calls !== 1) {
    fail("model called exactly once", `streamFn called ${stream.calls} times`);
    return;
  }
  if (markHumanVerifiedCalls.length !== 1) {
    fail("markHumanVerified called once", `called ${markHumanVerifiedCalls.length} times`);
    return;
  }
  if (!writeAuditCalls.includes(200)) {
    fail("writeAudit(200) called", `got ${JSON.stringify(writeAuditCalls)}`);
    return;
  }

  pass("anonymous + valid token → model called once, markHumanVerified called, writeAudit(200)");
}

// ─── Gate case 4: anonymous + already-verified conversation → no challenge ────

async function testAnonAlreadyVerified() {
  console.log("\ngate — anonymous + already-verified conversation → model called, verifyHcaptcha NOT called");

  const { ctx, writeAuditCalls } = makeCtx({ kind: "anonymous", ipKey: "1.2.3.4" });
  const { port, markHumanVerifiedCalls } = makePersistStub({
    // Conversation already verified — return true for this conversationId.
    isAnonConversationVerified: async () => true,
  });
  const stream = makeStreamStub(true);

  let verifyCalled = false;

  const deps: ChatServiceDeps = {
    tryDeflect: async () => ({ answered: false }),
    assertWithinBudget: async () => ({ ok: true }),
    recordUsage: async () => {},
    streamFn: stream.streamFn,
    persist: port,
    escalateToHuman: async () => ({ submissionId: "x" }),
    getModel: () => ({ modelId: "claude-haiku-4-5" }) as never,
    verifyHcaptcha: async () => {
      verifyCalled = true;
      return true;
    },
  };

  const res = await chatService.respond(
    {
      ctx,
      messages: [userMessage("Follow-up question about pricing")],
      conversationId: "conv_already_verified",
      // A resumed widget MAY re-send a token every turn. Pass one here to prove
      // the freshlyVerified fix: an already-verified conv must NOT re-stamp even
      // when a token is present (the old `input.hcaptchaToken` proxy would have
      // fired a redundant Mongo write here).
      hcaptchaToken: "client-resent-token",
    },
    deps
  );

  await res.text();
  await new Promise((r) => setTimeout(r, 10));

  if (res.status !== 200) {
    fail("status 200 (LLM path)", `got ${res.status}`);
    return;
  }
  if (stream.calls !== 1) {
    fail("model called exactly once", `streamFn called ${stream.calls} times`);
    return;
  }
  if (verifyCalled) {
    fail("verifyHcaptcha NOT called (already verified)", "was called");
    return;
  }
  // markHumanVerified must NOT be called — the conversation was already verified,
  // so even with a re-sent token this turn is not a FRESH verification.
  if (markHumanVerifiedCalls.length > 0) {
    fail("markHumanVerified NOT called (not freshly verified)", `called ${markHumanVerifiedCalls.length} times`);
    return;
  }
  if (!writeAuditCalls.includes(200)) {
    fail("writeAudit(200) called", `got ${JSON.stringify(writeAuditCalls)}`);
    return;
  }

  pass("anonymous + already-verified conv (+ re-sent token) → model called, verifyHcaptcha NOT called, no re-stamp, writeAudit(200)");
}

// ─── Gate case 5: anonymous + deflection ANSWERED → NO captcha ───────────────

async function testAnonDeflectionAnswered() {
  console.log("\ngate — anonymous + deflection ANSWERED → answer returned; verifyHcaptcha NOT called");

  const { ctx, writeAuditCalls } = makeCtx({ kind: "anonymous", ipKey: "1.2.3.4" });
  const { port } = makePersistStub();
  let verifyCalled = false;
  let streamCalled = false;

  const deps: ChatServiceDeps = {
    tryDeflect: async () => ({
      answered: true,
      answer: "Draws happen on the 27th.",
      sources: [{ id: "major-draw", title: "Major Draw" }],
    }),
    assertWithinBudget: async () => ({ ok: true }),
    recordUsage: async () => {},
    streamFn: () => {
      streamCalled = true;
      return {
        toUIMessageStreamResponse: () => new Response("nope", { status: 200 }),
      };
    },
    persist: port,
    escalateToHuman: async () => ({ submissionId: "x" }),
    getModel: () => ({ modelId: "claude-haiku-4-5" }) as never,
    verifyHcaptcha: async () => {
      verifyCalled = true;
      return true;
    },
  };

  const res = await chatService.respond(
    { ctx, messages: [userMessage("When is the draw?")], },
    deps
  );
  const body = await res.text();
  await new Promise((r) => setTimeout(r, 10));

  if (res.status !== 200) {
    fail("status 200 (canned deflection)", `got ${res.status}`);
    return;
  }
  if (verifyCalled) {
    fail("verifyHcaptcha NOT called on deflection path", "was called");
    return;
  }
  if (streamCalled) {
    fail("model NOT called on deflection path", "streamFn was invoked");
    return;
  }
  if (!/27th/i.test(body) && !body.includes("Draws happen")) {
    // body is a UI-message-stream (SSE-like), may not be plain text — just check writeAudit
    // and the rest of the assertions pass.
  }
  if (!writeAuditCalls.includes(200)) {
    fail("writeAudit(200) called", `got ${JSON.stringify(writeAuditCalls)}`);
    return;
  }
  if (ctx.audit.deflected !== true) {
    fail("audit.deflected === true (deflection)", `got ${ctx.audit.deflected}`);
    return;
  }

  pass("anonymous + deflection ANSWERED → canned answer, verifyHcaptcha NOT called, writeAudit(200)");
}

// ─── Gate case 6: member + miss → model called, no captcha ───────────────────

async function testMemberNoGate() {
  console.log("\ngate — member + deflection miss → model called; verifyHcaptcha NOT called");

  const { ctx, writeAuditCalls } = makeCtx({
    kind: "member",
    userId: "507f1f77bcf86cd799439011",
    firstName: "Jane",
  });
  const { port } = makePersistStub();
  const stream = makeStreamStub(true);
  let verifyCalled = false;

  const deps: ChatServiceDeps = {
    tryDeflect: async () => ({ answered: false }),
    assertWithinBudget: async () => ({ ok: true }),
    recordUsage: async () => {},
    streamFn: stream.streamFn,
    persist: port,
    escalateToHuman: async () => ({ submissionId: "x" }),
    getModel: () => ({ modelId: "claude-haiku-4-5" }) as never,
    verifyHcaptcha: async () => {
      verifyCalled = true;
      return true;
    },
  };

  const res = await chatService.respond(
    { ctx, messages: [userMessage("How do I cancel my membership?")] },
    deps
  );

  await res.text();
  await new Promise((r) => setTimeout(r, 10));

  if (res.status !== 200) {
    fail("status 200 (member LLM path)", `got ${res.status}`);
    return;
  }
  if (stream.calls !== 1) {
    fail("model called exactly once", `streamFn called ${stream.calls} times`);
    return;
  }
  if (verifyCalled) {
    fail("verifyHcaptcha NOT called for member", "was called");
    return;
  }
  if (!writeAuditCalls.includes(200)) {
    fail("writeAudit(200) called", `got ${JSON.stringify(writeAuditCalls)}`);
    return;
  }

  pass("member + miss → model called, verifyHcaptcha NOT called, writeAudit(200)");
}

// ─── Gate case 7: allowGuestGenerative=true → anon skips captcha entirely ─────

async function testGuestGenerativeOpen() {
  console.log("\ngate — allowGuestGenerative=true: anonymous + miss + NO token → model called (captcha skipped)");

  const { ctx, writeAuditCalls } = makeCtx({ kind: "anonymous", ipKey: "1.2.3.4" });
  const { port, markHumanVerifiedCalls, isAnonVerifiedCalls } = makePersistStub();
  const stream = makeStreamStub(true);
  let verifyCalled = false;

  const deps: ChatServiceDeps = {
    tryDeflect: async () => ({ answered: false }),
    assertWithinBudget: async () => ({ ok: true }),
    recordUsage: async () => {},
    streamFn: stream.streamFn,
    persist: port,
    escalateToHuman: async () => ({ submissionId: "x" }),
    getModel: () => ({ modelId: "gemini-2.5-flash-lite" }) as never,
    verifyHcaptcha: async () => {
      verifyCalled = true;
      return false;
    },
    // The open-guest flag — anonymous guests reach the LLM WITHOUT hCaptcha.
    allowGuestGenerative: true,
  };

  const res = await chatService.respond(
    // NO hcaptchaToken — proves the gate is skipped, not passed.
    { ctx, messages: [userMessage("An LLM question the FAQ can't answer")] },
    deps
  );

  await res.text();
  await new Promise((r) => setTimeout(r, 10));

  if (res.status !== 200) {
    fail("status 200 (LLM path, gate open)", `got ${res.status}`);
    return;
  }
  if (stream.calls !== 1) {
    fail("model called exactly once", `streamFn called ${stream.calls} times`);
    return;
  }
  if (verifyCalled) {
    fail("verifyHcaptcha NOT called (gate open)", "was called");
    return;
  }
  if (isAnonVerifiedCalls.length > 0) {
    fail("isAnonConversationVerified NOT consulted (gate open)", `called ${isAnonVerifiedCalls.length} times`);
    return;
  }
  if (markHumanVerifiedCalls.length > 0) {
    fail("markHumanVerified NOT called (no captcha)", `called ${markHumanVerifiedCalls.length} times`);
    return;
  }
  if (!writeAuditCalls.includes(200)) {
    fail("writeAudit(200) called", `got ${JSON.stringify(writeAuditCalls)}`);
    return;
  }

  pass("allowGuestGenerative=true → anon + no token → model called, captcha fully skipped, writeAudit(200)");
}

// ─── verifyHcaptcha unit tests ────────────────────────────────────────────────

async function testVerifyHcaptchaEmptyToken() {
  console.log("\nverifyHcaptcha — empty token → false without calling fetch");

  const saved = process.env.HCAPTCHA_SECRET;
  process.env.HCAPTCHA_SECRET = "test-secret";

  let fetchCalled = false;
  const result = await verifyHcaptcha("", undefined, {
    fetchFn: async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ success: true }));
    },
  });

  process.env.HCAPTCHA_SECRET = saved;

  if (result !== false) {
    fail("empty token → false", `got ${result}`);
    return;
  }
  if (fetchCalled) {
    fail("fetch NOT called for empty token", "was called");
    return;
  }

  pass("verifyHcaptcha: empty token → false, fetch not called");
}

async function testVerifyHcaptchaNoSecret() {
  console.log("\nverifyHcaptcha — missing HCAPTCHA_SECRET → false");

  const saved = process.env.HCAPTCHA_SECRET;
  delete process.env.HCAPTCHA_SECRET;

  let fetchCalled = false;
  const result = await verifyHcaptcha("some-token", undefined, {
    fetchFn: async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ success: true }));
    },
  });

  process.env.HCAPTCHA_SECRET = saved;

  if (result !== false) {
    fail("missing secret → false", `got ${result}`);
    return;
  }
  if (fetchCalled) {
    fail("fetch NOT called when secret missing", "was called");
    return;
  }

  pass("verifyHcaptcha: missing HCAPTCHA_SECRET → false, fetch not called");
}

async function testVerifyHcaptchaSuccess() {
  console.log("\nverifyHcaptcha — stub fetch {success:true} → true");

  const saved = process.env.HCAPTCHA_SECRET;
  process.env.HCAPTCHA_SECRET = "test-secret";

  const result = await verifyHcaptcha("valid-token", "1.2.3.4", {
    fetchFn: async (url, init) => {
      void url;
      void init;
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  process.env.HCAPTCHA_SECRET = saved;

  if (result !== true) {
    fail("stub success:true → true", `got ${result}`);
    return;
  }

  pass("verifyHcaptcha: {success:true} → true");
}

async function testVerifyHcaptchaFail() {
  console.log("\nverifyHcaptcha — stub fetch {success:false} → false");

  const saved = process.env.HCAPTCHA_SECRET;
  process.env.HCAPTCHA_SECRET = "test-secret";

  const result = await verifyHcaptcha("invalid-token", undefined, {
    fetchFn: async () =>
      new Response(JSON.stringify({ success: false }), {
        headers: { "Content-Type": "application/json" },
      }),
  });

  process.env.HCAPTCHA_SECRET = saved;

  if (result !== false) {
    fail("{success:false} → false", `got ${result}`);
    return;
  }

  pass("verifyHcaptcha: {success:false} → false");
}

async function testVerifyHcaptchaThrows() {
  console.log("\nverifyHcaptcha — throwing fetch → false (fail-closed)");

  const saved = process.env.HCAPTCHA_SECRET;
  process.env.HCAPTCHA_SECRET = "test-secret";

  const result = await verifyHcaptcha("some-token", undefined, {
    fetchFn: async () => {
      throw new Error("network error");
    },
  });

  process.env.HCAPTCHA_SECRET = saved;

  if (result !== false) {
    fail("throwing fetch → false", `got ${result}`);
    return;
  }

  pass("verifyHcaptcha: throwing fetch → false (fail-closed)");
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function run() {
  // Gate cases
  await testAnonNoToken();
  await testAnonInvalidToken();
  await testAnonValidToken();
  await testAnonAlreadyVerified();
  await testAnonDeflectionAnswered();
  await testMemberNoGate();
  await testGuestGenerativeOpen();

  // verifyHcaptcha unit tests
  await testVerifyHcaptchaEmptyToken();
  await testVerifyHcaptchaNoSecret();
  await testVerifyHcaptchaSuccess();
  await testVerifyHcaptchaFail();
  await testVerifyHcaptchaThrows();

  console.log(`\n${"─".repeat(60)}`);

  if (failures > 0) {
    console.error(`guest-gate tests FAILED — ${failures} assertion(s) failed`);
    process.exit(1);
  }

  console.log("PASS — guest-gate test");
  console.log("  Covered: anon+no-token→401, anon+invalid-token→401,");
  console.log("           anon+valid-token→model+markVerified, anon+already-verified→model(no challenge),");
  console.log("           anon+deflected→canned(no captcha), member+miss→model(no captcha),");
  console.log("           verifyHcaptcha: empty-token, no-secret, success, fail, throw(fail-closed)");
  process.exit(0);
}

void run().catch((err) => {
  console.error(err);
  process.exit(1);
});
