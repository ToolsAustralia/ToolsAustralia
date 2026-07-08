#!/usr/bin/env npx tsx
/**
 * smoke-chat-service.ts
 *
 * End-to-end check of the REAL ChatService engine — no stubs for the orchestration
 * path. Proves:
 *   (a) a deflectable question returns instantly with NO model call (FAQ canned answer)
 *   (b) a non-deflectable question streams a real Anthropic answer, persists a
 *       ChatConversation + messages, and increments the daily budget.
 *
 * It writes a small amount of real data to the dev DB (one or two ChatConversations
 * + their messages, a ChatDailyBudget $inc). That's low-risk: TTL purges in 90 days
 * and the budget increment is a few hundred tokens.
 *
 * Usage:
 *   npm run smoke:chat-service
 *
 * Requirements (.env.local):
 *   ANTHROPIC_API_KEY  — for the live LLM call (case b)
 *   MONGODB_URI        — for persistence + budget read/write
 *
 * Exit:
 *   0 = SMOKE OK
 *   1 = SMOKE FAIL
 *
 * @module scripts/smoke-chat-service
 */

import { config } from "dotenv";
import path from "node:path";

// Load .env.local before importing anything that reads env vars.
config({ path: path.resolve(process.cwd(), ".env.local") });

import { chatService } from "../src/services/support-chat/ChatService";
import type { ChatCtx } from "../src/lib/support-chat/withChatbot";
import type { UIMessage } from "ai";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function userMessage(text: string): UIMessage {
  return { id: `u_${Date.now()}`, role: "user", parts: [{ type: "text", text }] };
}

/** A real-ish ChatCtx: anonymous actor, audit accumulator, writeAudit logs locally. */
function makeCtx(): { ctx: ChatCtx; writeAuditStatuses: number[] } {
  const writeAuditStatuses: number[] = [];
  const ctx: ChatCtx = {
    actor: { kind: "anonymous", ipKey: "smoke-test" },
    req: new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "user-agent": "smoke-chat-service/1.0" },
    }),
    requestId: `smoke_${Date.now()}`,
    ipHash: `smokehash_${Date.now()}`,
    audit: { deflected: false, escalated: false },
    writeAudit: async (status: number) => {
      writeAuditStatuses.push(status);
    },
  };
  return { ctx, writeAuditStatuses };
}

/** Drain a Response body stream to a string. */
async function drain(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

// ─── Run ──────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  // ── Case (a): deflectable — no model call, instant canned answer ────────────
  console.log("\n[a] deflectable question (expect NO model call, instant FAQ answer)");
  const { ctx: ctxA, writeAuditStatuses: auditA } = makeCtx();

  const resA = await chatService.respond({
    ctx: ctxA,
    // A common FAQ-shaped question the deflection layer should answer.
    messages: [userMessage("How do I cancel my membership?")],
  });
  const bodyA = await drain(resA);

  // Give the canned stream's onFinish a tick to flush writeAudit.
  await new Promise((r) => setTimeout(r, 50));

  if (!ctxA.audit.deflected) {
    console.error("SMOKE FAIL: [a] expected deflected=true (FAQ should have answered)");
    process.exit(1);
  }
  if (ctxA.audit.tokensIn !== undefined || ctxA.audit.tokensOut !== undefined) {
    console.error("SMOKE FAIL: [a] token counts set — a model was called for a deflectable question");
    process.exit(1);
  }
  if (!auditA.includes(200)) {
    console.error("SMOKE FAIL: [a] writeAudit(200) not called on deflection path");
    process.exit(1);
  }
  if (bodyA.trim().length === 0) {
    console.error("SMOKE FAIL: [a] canned answer body was empty");
    process.exit(1);
  }
  console.log(`  OK: deflected=true, no model call, writeAudit(200), body=${bodyA.length} bytes`);

  // ── Case (b): non-deflectable — real streamed answer + persistence + budget ──
  console.log("\n[b] non-deflectable question (expect real streamed answer + persistence + budget inc)");

  // Read the budget BEFORE so we can assert an increment after.
  const { default: connectDB } = await import("../src/lib/mongodb");
  const { default: ChatDailyBudget } = await import("../src/models/ChatDailyBudget");
  const { default: ChatConversation } = await import("../src/models/ChatConversation");
  const { utcDayKey } = await import("../src/lib/support-chat/costGuard");
  await connectDB();

  const dayKey = utcDayKey();
  const beforeDoc = await ChatDailyBudget.findOne({ dayKey }).lean();
  const beforeTokens =
    (beforeDoc as { tokensIn?: number } | null)?.tokensIn ?? 0;

  const { ctx: ctxB, writeAuditStatuses: auditB } = makeCtx();

  const resB = await chatService.respond({
    ctx: ctxB,
    // Deliberately specific/odd so it should NOT match the (broad keyword) FAQ
    // deflection layer and falls through to the LLM. Kept short to minimise spend.
    // (Verified offline that tryDeflect returns answered:false for this phrasing.)
    messages: [
      userMessage("Can you explain how the entry multiplier interacts with leap years?"),
    ],
  });
  const bodyB = await drain(resB);

  // Let onFinish complete (persistence + recordUsage + writeAudit run there).
  await new Promise((r) => setTimeout(r, 300));

  if (ctxB.audit.deflected !== false) {
    console.error("SMOKE FAIL: [b] expected deflected=false (should have hit the LLM)");
    process.exit(1);
  }
  if (!ctxB.audit.conversationId) {
    console.error("SMOKE FAIL: [b] no conversationId set — conversation not persisted");
    process.exit(1);
  }
  if (ctxB.audit.tokensIn === undefined || (ctxB.audit.tokensIn ?? 0) <= 0) {
    console.error(
      `SMOKE FAIL: [b] expected positive tokensIn from onFinish, got ${ctxB.audit.tokensIn}`
    );
    process.exit(1);
  }
  if (!auditB.includes(200)) {
    console.error("SMOKE FAIL: [b] writeAudit(200) not called on LLM path");
    process.exit(1);
  }

  // The streamed body should carry SSE/UI-message chunks (text-delta etc.).
  if (bodyB.trim().length === 0) {
    console.error("SMOKE FAIL: [b] streamed body was empty");
    process.exit(1);
  }

  // Persistence check: the conversation exists with at least the user message.
  const convo = await ChatConversation.findById(ctxB.audit.conversationId).lean();
  if (!convo) {
    console.error("SMOKE FAIL: [b] ChatConversation not found in DB");
    process.exit(1);
  }

  // Budget increment check.
  const afterDoc = await ChatDailyBudget.findOne({ dayKey }).lean();
  const afterTokens = (afterDoc as { tokensIn?: number } | null)?.tokensIn ?? 0;
  if (afterTokens <= beforeTokens) {
    console.error(
      `SMOKE FAIL: [b] daily budget tokensIn did not increase (before=${beforeTokens}, after=${afterTokens})`
    );
    process.exit(1);
  }

  console.log(
    `  OK: deflected=false, conversationId=${ctxB.audit.conversationId}, ` +
      `tokensIn=${ctxB.audit.tokensIn}, tokensOut=${ctxB.audit.tokensOut}, ` +
      `budget tokensIn ${beforeTokens}→${afterTokens}, body=${bodyB.length} bytes`
  );

  console.log("\nSMOKE OK");
  process.exit(0);
}

void run().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`SMOKE FAIL: ${msg}`);
  process.exit(1);
});
