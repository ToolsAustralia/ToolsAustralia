/**
 * with-chatbot.test.ts
 *
 * Unit tests for src/lib/support-chat/withChatbot.ts and redact.ts.
 * No live DB / NextAuth — all async paths use injected stubs.
 *
 * Run: npm run test:chat-withchatbot
 */

import "dotenv/config";
import assert from "node:assert/strict";

// Defensive .env.local load (mirrors cost-guard pattern)
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("dotenv").config({ path: ".env.local" });
} catch {
  // Fine — not every CI environment has dotenv available here
}

import { withChatbot } from "../withChatbot";
import { redactPII } from "../redact";
import type { ChatCtx } from "../withChatbot";
import type { ChatAuditMeta } from "../audit";

// ─── helpers ─────────────────────────────────────────────────────────────────

let failures = 0;

function pass(label: string) {
  console.log(`  PASS  ${label}`);
}

function fail(label: string, msg: string) {
  failures++;
  console.error(`  FAIL  ${label}: ${msg}`);
}

function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    pass(label);
  } else {
    fail(label, detail ?? "condition was false");
  }
}

function checkDeep(label: string, actual: unknown, expected: unknown) {
  try {
    assert.deepStrictEqual(actual, expected);
    pass(label);
  } catch {
    fail(label, `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

// ─── Stub factories ───────────────────────────────────────────────────────────

type RlResult = { success: boolean; remaining: number; retryAfterSeconds: number };

function makeLimiter(result: RlResult): { check: (id: string) => Promise<RlResult> } {
  return { check: async () => result };
}

function makeAuditCapture() {
  const calls: ChatAuditMeta[] = [];
  const writer = async (meta: ChatAuditMeta) => { calls.push(meta); };
  return { calls, writer };
}

function makeRequest(ip?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (ip) headers["x-real-ip"] = ip;
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers,
    body: JSON.stringify({ message: "hello" }),
  });
}

function memberSession(userId = "user123", firstName = "Alice") {
  return async () => ({ user: { id: userId, firstName } });
}

function noSession() {
  return async () => null;
}

// ─── Test: rate-limit 429 ─────────────────────────────────────────────────────

async function testRateLimit429() {
  console.log("\nrate-limit: over limit → 429");

  const { calls, writer } = makeAuditCapture();

  const blocked = makeLimiter({ success: false, remaining: 0, retryAfterSeconds: 42 });
  const allowed = makeLimiter({ success: true, remaining: 10, retryAfterSeconds: 0 });

  // Anonymous over limit
  const handler = withChatbot(async () => new Response("ok", { status: 200 }), {
    getSession: noSession(),
    anonLimiter: blocked,
    memberLimiter: allowed,
    writeAudit: writer,
  });

  const res = await handler(makeRequest("1.2.3.4"));
  checkDeep("status is 429", res.status, 429);

  const body = await res.json() as Record<string, unknown>;
  checkDeep("body.code is rate_limited", body.code, "rate_limited");
  check("body.retryAfterSeconds is 42", body.retryAfterSeconds === 42);
  check("Retry-After header is set", res.headers.get("Retry-After") === "42");

  check("audit row written", calls.length === 1);
  checkDeep("audit.status is 429", calls[0]?.status, 429);
  checkDeep("audit.deflected is false", calls[0]?.deflected, false);
  checkDeep("audit.escalated is false", calls[0]?.escalated, false);
  checkDeep("audit.actorKind is anonymous", calls[0]?.actorKind, "anonymous");
}

// ─── Test: no budget/kill-switch gate in withChatbot (moved to ChatService) ───
// The kill-switch + daily-budget gate was intentionally REMOVED from withChatbot
// so it can't block free FAQ deflection. Once past rate-limiting, withChatbot ALWAYS
// reaches the handler; ChatService owns the budget/kill-switch gate AFTER it has
// tried FAQ deflection (see ChatService.respond + chat-service.test.ts "deflect wins
// over budget"). This test locks that withChatbot itself never short-circuits on budget.
async function testNoBudgetGateReachesHandler() {
  console.log("\nno budget gate: withChatbot reaches the handler (ChatService owns budget)");

  const { calls, writer } = makeAuditCapture();
  const allowed = makeLimiter({ success: true, remaining: 10, retryAfterSeconds: 0 });

  let handlerReached = false;
  const handler = withChatbot(
    async () => {
      handlerReached = true;
      return new Response("ok", { status: 200 });
    },
    {
      getSession: memberSession(),
      anonLimiter: allowed,
      memberLimiter: allowed,
      writeAudit: writer,
    }
  );

  const res = await handler(makeRequest("1.2.3.4"));
  check("handler is reached (no budget short-circuit)", handlerReached);
  checkDeep("status is 200 (not 503)", res.status, 200);
  check("withChatbot writes no 503 audit row", !calls.some((c) => c.status === 503));
}

// ─── Test: anonymous actor flagged + uses anonLimiter ────────────────────────

async function testAnonymousActor() {
  console.log("\nanonymous actor: flagged + anonLimiter consulted");

  const anonCalls: string[] = [];
  const memberCalls: string[] = [];

  const anonLimiter = { check: async (id: string) => { anonCalls.push(id); return { success: true, remaining: 10, retryAfterSeconds: 0 }; } };
  const memberLimiter = { check: async (id: string) => { memberCalls.push(id); return { success: true, remaining: 10, retryAfterSeconds: 0 }; } };

  let capturedActor: ChatCtx["actor"] | undefined;

  const handler = withChatbot(async (ctx) => {
    capturedActor = ctx.actor;
    return new Response("ok", { status: 200 });
  }, {
    getSession: noSession(),
    anonLimiter,
    memberLimiter,
    writeAudit: async () => {},
  });

  await handler(makeRequest("5.6.7.8"));

  check("actor.kind is anonymous", capturedActor?.kind === "anonymous");
  // The anon rate-limiter was called, the member one was not
  check("anonLimiter was consulted", anonCalls.length === 1);
  check("memberLimiter was NOT consulted", memberCalls.length === 0);
  // The rate-limit key is the ipKey
  if (capturedActor?.kind === "anonymous") {
    check("anonLimiter key = ipKey", anonCalls[0] === capturedActor.ipKey);
  }
}

// ─── Test: member actor + memberLimiter consulted ────────────────────────────

async function testMemberActor() {
  console.log("\nmember actor: userId + firstName from session, memberLimiter consulted");

  const anonCalls: string[] = [];
  const memberCalls: string[] = [];

  const anonLimiter = { check: async (id: string) => { anonCalls.push(id); return { success: true, remaining: 10, retryAfterSeconds: 0 }; } };
  const memberLimiter = { check: async (id: string) => { memberCalls.push(id); return { success: true, remaining: 10, retryAfterSeconds: 0 }; } };

  let capturedCtx: ChatCtx | undefined;

  const handler = withChatbot(async (ctx) => {
    capturedCtx = ctx;
    return new Response("ok", { status: 200 });
  }, {
    getSession: memberSession("abc-user-id", "Bob"),
    anonLimiter,
    memberLimiter,
    writeAudit: async () => {},
  });

  await handler(makeRequest("1.2.3.4"));

  check("actor.kind is member", capturedCtx?.actor.kind === "member");
  if (capturedCtx?.actor.kind === "member") {
    checkDeep("actor.userId from session", capturedCtx.actor.userId, "abc-user-id");
    checkDeep("actor.firstName from session", capturedCtx.actor.firstName, "Bob");
  }
  check("memberLimiter was consulted", memberCalls.length === 1);
  check("anonLimiter was NOT consulted", anonCalls.length === 0);
  // Rate-limit key for members is userId
  check("memberLimiter key = userId", memberCalls[0] === "abc-user-id");
}

// ─── Test: ipHash is hashed (64-char hex, not raw IP) ────────────────────────

async function testIpHashing() {
  console.log("\naudit: ipHash is sha256 hex (not raw IP)");

  const { calls, writer } = makeAuditCapture();
  const allowed = makeLimiter({ success: false, remaining: 0, retryAfterSeconds: 1 });

  const handler = withChatbot(async () => new Response("ok", { status: 200 }), {
    getSession: noSession(),
    anonLimiter: allowed,
    memberLimiter: allowed,
    writeAudit: writer,
  });

  await handler(makeRequest("192.168.1.1"));

  const ipHash = calls[0]?.ipHash;
  check("ipHash is defined", ipHash !== undefined && ipHash !== null);
  check("ipHash is 64-char hex (sha256)", typeof ipHash === "string" && ipHash.length === 64 && /^[0-9a-f]{64}$/.test(ipHash));
  check("ipHash is NOT the raw IP", ipHash !== "192.168.1.1");
}

// ─── Test: ZodError → 400 ────────────────────────────────────────────────────

async function testZodError400() {
  console.log("\nhandler throws ZodError → 400");

  const { calls, writer } = makeAuditCapture();
  const allowed = makeLimiter({ success: true, remaining: 10, retryAfterSeconds: 0 });

  const { z } = await import("zod");

  const handler = withChatbot(async () => {
    z.object({ foo: z.string() }).parse({ foo: 123 }); // throws ZodError
    return new Response("unreachable", { status: 200 });
  }, {
    getSession: noSession(),
    anonLimiter: allowed,
    memberLimiter: allowed,
    writeAudit: writer,
  });

  const res = await handler(makeRequest("9.9.9.9"));
  checkDeep("ZodError → status 400", res.status, 400);
  checkDeep("audit.status 400", calls[0]?.status, 400);
}

// ─── Test: non-Zod handler throw → 500 ───────────────────────────────────────

async function testHandlerThrow500() {
  console.log("\nhandler throws non-ZodError → 500");

  const { calls, writer } = makeAuditCapture();
  const allowed = makeLimiter({ success: true, remaining: 10, retryAfterSeconds: 0 });

  const handler = withChatbot(async () => {
    throw new Error("something broke");
  }, {
    getSession: noSession(),
    anonLimiter: allowed,
    memberLimiter: allowed,
    writeAudit: writer,
  });

  const res = await handler(makeRequest("9.9.9.9"));
  checkDeep("Error → status 500", res.status, 500);
  checkDeep("audit.status 500", calls[0]?.status, 500);
}

// ─── Test: success path provides ctx.writeAudit + mutable ctx.audit ──────────

async function testSuccessPathAuditTool() {
  console.log("\nsuccess path: ctx.writeAudit + ctx.audit accumulator");

  const { calls, writer } = makeAuditCapture();
  const allowed = makeLimiter({ success: true, remaining: 10, retryAfterSeconds: 0 });

  const handler = withChatbot(async (ctx) => {
    // ChatService fills in the accumulator then calls writeAudit at stream end
    ctx.audit.deflected = true;
    ctx.audit.modelTier = "haiku";
    ctx.audit.tokensIn = 100;
    ctx.audit.tokensOut = 50;
    await ctx.writeAudit(200);
    return new Response("streamed", { status: 200 });
  }, {
    getSession: memberSession(),
    anonLimiter: allowed,
    memberLimiter: allowed,
    writeAudit: writer,
  });

  const res = await handler(makeRequest("1.1.1.1"));
  checkDeep("handler response is 200", res.status, 200);
  check("writeAudit was called once", calls.length === 1);
  checkDeep("audit.status 200", calls[0]?.status, 200);
  checkDeep("audit.deflected true", calls[0]?.deflected, true);
  checkDeep("audit.modelTier haiku", calls[0]?.modelTier, "haiku");
  checkDeep("audit.tokensIn 100", calls[0]?.tokensIn, 100);
  checkDeep("audit.tokensOut 50", calls[0]?.tokensOut, 50);
  checkDeep("audit.actorKind member", calls[0]?.actorKind, "member");
}

// ─── Test: redactPII ─────────────────────────────────────────────────────────

function testRedactPII() {
  console.log("\nredactPII");

  // Email
  const r1 = redactPII("Please email me at alice@example.com thanks");
  check("email redacted", r1.includes("[email]"), `got: ${r1}`);
  check("email raw not present", !r1.includes("alice@example.com"), `got: ${r1}`);

  // Phone — AU mobile formatted
  const r2 = redactPII("Call me on 0412 345 678 please");
  check("phone redacted", r2.includes("[phone]"), `got: ${r2}`);
  check("phone raw not present", !r2.includes("0412"), `got: ${r2}`);

  // Phone — international
  const r3 = redactPII("My number is +61 412 345 678");
  check("intl phone redacted", r3.includes("[phone]"), `got: ${r3}`);

  // Credit card — spaced groups
  const r4 = redactPII("My card is 4111 1111 1111 1111 please");
  check("card (grouped) redacted", r4.includes("[card]") || r4.includes("[phone]"), `got: ${r4}`);
  check("card raw not present", !r4.includes("4111 1111"), `got: ${r4}`);

  // Credit card — run of digits
  const r5 = redactPII("Card number: 4111111111111111");
  check("card (plain run) redacted", r5.includes("[card]"), `got: ${r5}`);

  // Benign text untouched
  const r6 = redactPII("Hi, I'd like to know about membership");
  check("benign text unchanged", r6 === "Hi, I'd like to know about membership", `got: ${r6}`);

  // Multiple items in one string
  const r7 = redactPII("Email alice@example.com or call 0412 345 678");
  check("multiple items redacted", r7.includes("[email]") && r7.includes("[phone]"), `got: ${r7}`);
}

// ─── Runner ───────────────────────────────────────────────────────────────────

async function run() {
  console.log("withChatbot + redactPII tests");

  await testRateLimit429();
  await testNoBudgetGateReachesHandler();
  await testAnonymousActor();
  await testMemberActor();
  await testIpHashing();
  await testZodError400();
  await testHandlerThrow500();
  await testSuccessPathAuditTool();
  testRedactPII();

  console.log(`\n${"─".repeat(60)}`);
  if (failures > 0) {
    console.error(`withChatbot tests FAILED — ${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("PASS — withChatbot test");
  process.exit(0);
}

void run().catch((err) => {
  console.error(err);
  process.exit(1);
});
