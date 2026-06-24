/**
 * ChatService.ts
 *
 * The orchestration engine for the Tools Australia AI support chatbot.
 *
 * Flow (per request, after withChatbot's identify → rate-limit → budget gate):
 *   1. tryDeflect(latestUserText) — NO LLM. On a hit: persist the exchange,
 *      stream the canned answer, writeAudit(200). Zero model cost.
 *   2. On a miss → assertWithinBudget() re-check (defense-in-depth; withChatbot
 *      already gated budget, so this mainly guards a race — but the test exercises
 *      it directly). If over budget: stream a canned "busy" fallback, writeAudit(200).
 *   3. LLM path: build the hardened system prompt over the cached knowledge pack,
 *      stream from the primary model, expose the `request_human` tool, and at
 *      stream end (onFinish) persist the assistant message, recordUsage, update
 *      the conversation, and writeAudit(200).
 *
 * Streaming unification:
 *   Both the canned paths (deflection / busy) AND the LLM path return a Response
 *   that speaks the AI SDK v6 UI-message-stream protocol — so the Task 1.9 widget
 *   (useChat) consumes them identically:
 *     - canned: createUIMessageStream + createUIMessageStreamResponse
 *     - LLM:    streamText(...).toUIMessageStreamResponse()
 *   This is a justified deviation from the brief's "ReadableStream" wording: the
 *   v6 helpers produce a Response with the correct protocol; hand-rolling a raw
 *   stream would re-implement that protocol.
 *
 * Fallback (Phase 1 choice):
 *   We stream from the PRIMARY model only. `withModelFallback` cleanly wraps a
 *   non-streaming call but not a stream (you cannot un-consume a partially-sent
 *   stream to retry on another tier). Primary-only streaming is the Phase-1
 *   decision; withModelFallback remains available for non-streaming use.
 *   A hard model-setup error is caught and turned into a graceful canned message.
 *
 * Least privilege — request_human tool:
 *   The tool's input schema contains ONLY non-PII fields (`reason`). Identity is
 *   captured server-side from ctx.actor; contact details come from the request
 *   body (`input.contact`, widget-collected) — NEVER from the model.
 *
 * Mandatory audit:
 *   ctx.writeAudit(200) is called at the end of EVERY successful path. withChatbot
 *   only self-audits the early-exit 429/503 paths; without this, successful chats
 *   would write zero audit rows.
 *
 * Dependency injection:
 *   Everything external (deflection, budget, usage recording, the stream call,
 *   persistence, escalation, model construction) is injectable via `deps` so the
 *   test runs with zero Mongo and zero Anthropic involvement.
 *
 * Layering: services-layer. Imports lib/ + models/ (lazily for the default
 * persistence). Must NOT be imported by anything other than its route handler.
 */

import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  tool,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
  type UIMessage,
} from "ai";
import { z } from "zod";

import type { ChatCtx } from "@/lib/support-chat/withChatbot";
import type { ChatActor } from "@/lib/support-chat/types";
import { redactPII } from "@/lib/support-chat/redact";
import { tryDeflect as realTryDeflect } from "@/services/support-chat/deflection";
import {
  assertWithinBudget as realAssertWithinBudget,
  recordUsage as realRecordUsage,
} from "@/lib/support-chat/costGuard";
import { getChatModel } from "@/lib/support-chat/provider";
import { getKnowledgePack } from "@/lib/support-chat/knowledge/pack";
import { buildSystemPrompt } from "@/services/support-chat/systemPrompt";
import {
  escalateToHuman as realEscalateToHuman,
  type EscalationContact,
} from "@/services/support-chat/escalation";
import { verifyHcaptcha as realVerifyHcaptcha } from "@/lib/support-chat/captcha";
import { ErrorLoggingService } from "@/services/error-reporting/ErrorLoggingService";

// ─── Public input / dep types ─────────────────────────────────────────────────

/** Contact details collected by the widget (request body), used for escalation. */
export interface ChatContact {
  name?: string;
  email: string;
  phone?: string;
}

export interface ChatRespondInput {
  ctx: ChatCtx;
  messages: UIMessage[];
  conversationId?: string;
  /** Widget-collected contact details (request body) — never from the model. */
  contact?: ChatContact;
  /**
   * hCaptcha client token for the guest generative gate (Task 1.8).
   * Only required for anonymous actors hitting the LLM path for the first time
   * (or the first time on a new conversation). Members never need this.
   * Single-use + short-lived — do NOT cache or replay.
   */
  hcaptchaToken?: string;
}

/** A persisted ChatMessage write (content is already redacted by the caller). */
export interface PersistMessage {
  conversationId: string;
  role: "user" | "assistant" | "tool";
  content: string;
  citations?: { docId: string; span?: string }[];
  toolCalls?: { name: string; ok: boolean; durationMs?: number }[];
}

/**
 * Persistence port. The default implementation talks to Mongo; the test injects
 * a spy. Keeps all DB access out of the orchestration logic so it stays testable.
 */
export interface PersistPort {
  /** Find-or-create the conversation for this actor; returns its id. */
  ensureConversation: (args: {
    actor: ChatActor;
    conversationId?: string;
    ipHash: string;
    userAgent?: string;
  }) => Promise<{ conversationId: string }>;
  /** Append a message to the conversation. */
  addMessage: (msg: PersistMessage) => Promise<void>;
  /** Mark the conversation escalated and link the ContactSubmission. */
  setEscalated: (conversationId: string, submissionId: string) => Promise<void>;
  /** Record model tier + token usage on the conversation (additive). */
  recordConversationUsage: (
    conversationId: string,
    modelId: string,
    inputTokens: number,
    outputTokens: number
  ) => Promise<void>;
  /**
   * Check whether an existing anonymous conversation has already passed the
   * hCaptcha gate (humanVerifiedAt is set). Returns:
   *   - `true`  — verified (skip the challenge for this turn).
   *   - `false` — not verified.
   *   - `null`  — conversationId was not found or not owned by this ipHash.
   *               Treat as "not verified" — require a fresh token.
   */
  isAnonConversationVerified: (
    conversationId: string,
    ipHash: string
  ) => Promise<boolean | null>;
  /**
   * Stamp `humanVerifiedAt = now()` on an anonymous conversation after a
   * successful hCaptcha verification. Idempotent (a second call is harmless).
   */
  markHumanVerified: (conversationId: string) => Promise<void>;
}

/**
 * The subset of streamText's surface ChatService relies on. Injectable so the
 * test can supply a stub that fires onFinish with deterministic token counts and
 * returns a Response — without any real Anthropic call.
 */
export interface StreamArgs {
  model: LanguageModel;
  system: string;
  messages: ModelMessage[];
  maxOutputTokens: number;
  stopWhen: ReturnType<typeof stepCountIs>;
  tools: ToolSet;
  onFinish?: (event: {
    text: string;
    usage: { inputTokens?: number; outputTokens?: number };
  }) => void | Promise<void>;
}

export interface StreamResultLike {
  toUIMessageStreamResponse: (options?: { headers?: Record<string, string> }) => Response;
}

export interface ChatServiceDeps {
  tryDeflect?: typeof realTryDeflect;
  assertWithinBudget?: typeof realAssertWithinBudget;
  recordUsage?: typeof realRecordUsage;
  /** Defaults to a thin adapter over the real v6 streamText. */
  streamFn?: (args: StreamArgs) => StreamResultLike;
  persist?: PersistPort;
  escalateToHuman?: typeof realEscalateToHuman;
  /** Defaults to getChatModel('primary'). */
  getModel?: () => LanguageModel;
  /**
   * Defaults to the real verifyHcaptcha (src/lib/support-chat/captcha.ts).
   * Inject a stub in tests to avoid real network calls.
   */
  verifyHcaptcha?: typeof realVerifyHcaptcha;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_OUTPUT_TOKENS = 300;
/** Step limit for standard turns (request_human only). */
const MAX_STEPS = 3;
const MAX_TRANSCRIPT_SUMMARY_CHARS = 2000;

const BUSY_FALLBACK_TEXT =
  "Our team is a bit busy right now — meanwhile our FAQ may help, or leave a message and we'll get back to you.";

const MODEL_ERROR_FALLBACK_TEXT =
  "Sorry, I'm having trouble responding right now. Please try again in a moment, or leave a message and our team will get back to you.";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Pull the text of the last user message from a UIMessage array. */
function latestUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const text = (m.parts ?? [])
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("")
      .trim();
    if (text.length > 0) return text;
  }
  return "";
}

/** modelId for a v6 LanguageModel (which may be a string or a model object). */
function modelIdOf(model: LanguageModel): string {
  return typeof model === "string" ? model : model.modelId;
}

/**
 * Build a compact transcript summary (≤2000 chars) from recent messages for
 * the escalation ContactSubmission. Redacts PII defensively.
 */
function buildTranscriptSummary(messages: UIMessage[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const text = (m.parts ?? [])
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("")
      .trim();
    if (!text) continue;
    lines.push(`${m.role === "user" ? "User" : "Assistant"}: ${redactPII(text)}`);
  }
  return lines.join("\n").slice(0, MAX_TRANSCRIPT_SUMMARY_CHARS);
}

/**
 * Build a Response that streams a single block of canned text using the v6
 * UI-message-stream protocol (so the widget renders it like any model reply).
 * Calls `onComplete` once the stream finishes (used for writeAudit).
 */
function cannedTextResponse(
  text: string,
  onComplete: () => Promise<void>,
  headers?: Record<string, string>
): Response {
  const id = "canned";
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: text });
      writer.write({ type: "text-end", id });
    },
    onFinish: async () => {
      await onComplete();
    },
  });
  return createUIMessageStreamResponse({ stream, ...(headers ? { headers } : {}) });
}

// ─── Default (real) streamFn adapter ──────────────────────────────────────────

/**
 * Adapts the real v6 streamText to the StreamArgs/StreamResultLike shape. The
 * onFinish event from streamText carries `text` and `usage` (v6 field names:
 * usage.inputTokens / usage.outputTokens, both number | undefined).
 */
function defaultStreamFn(args: StreamArgs): StreamResultLike {
  const result = streamText({
    model: args.model,
    system: args.system,
    messages: args.messages,
    maxOutputTokens: args.maxOutputTokens,
    stopWhen: args.stopWhen,
    tools: args.tools,
    onFinish: async (event) => {
      await args.onFinish?.({
        text: event.text,
        usage: {
          inputTokens: event.usage.inputTokens,
          outputTokens: event.usage.outputTokens,
        },
      });
    },
  });
  return {
    toUIMessageStreamResponse: (options?: { headers?: Record<string, string> }) =>
      result.toUIMessageStreamResponse(options),
  };
}

// ─── Default (real) persistence ───────────────────────────────────────────────

const defaultPersist: PersistPort = {
  ensureConversation: async ({ actor, conversationId, ipHash, userAgent }) => {
    const { default: connectDB } = await import("@/lib/mongodb");
    const { isValidObjectId } = await import("mongoose");
    const { default: ChatConversation } = await import(
      "@/models/ChatConversation"
    );
    await connectDB();

    // Scope find by actor so a member can't resume an anonymous conversation
    // (or another user's) by guessing an id. Guard isValidObjectId so a malformed
    // client-supplied id falls through to a fresh conversation, not a CastError 500.
    if (conversationId && isValidObjectId(conversationId)) {
      const scope =
        actor.kind === "member"
          ? { _id: conversationId, userId: actor.userId }
          : { _id: conversationId, anonId: ipHash };
      const existing = await ChatConversation.findOne(scope).select("_id").lean();
      if (existing) {
        return { conversationId: String((existing as { _id: unknown })._id) };
      }
      // id supplied but not found / not owned → fall through and create a new one.
    }

    const doc = new ChatConversation({
      ...(actor.kind === "member" ? { userId: actor.userId } : { anonId: ipHash }),
      status: "open",
      ipHash,
      ...(userAgent ? { userAgent } : {}),
    });
    await doc.save();
    return { conversationId: String(doc._id) };
  },

  addMessage: async (msg) => {
    const { default: connectDB } = await import("@/lib/mongodb");
    const { default: ChatMessage } = await import("@/models/ChatMessage");
    await connectDB();
    await ChatMessage.create({
      conversationId: msg.conversationId,
      role: msg.role,
      content: msg.content,
      ...(msg.citations && msg.citations.length > 0 ? { citations: msg.citations } : {}),
      ...(msg.toolCalls && msg.toolCalls.length > 0 ? { toolCalls: msg.toolCalls } : {}),
    });
  },

  setEscalated: async (conversationId, submissionId) => {
    const { default: connectDB } = await import("@/lib/mongodb");
    const { default: ChatConversation } = await import(
      "@/models/ChatConversation"
    );
    await connectDB();
    await ChatConversation.updateOne(
      { _id: conversationId },
      { $set: { status: "escalated", escalatedSubmissionId: submissionId } }
    );
  },

  recordConversationUsage: async (conversationId, modelId, inputTokens, outputTokens) => {
    const { default: connectDB } = await import("@/lib/mongodb");
    const { default: ChatConversation } = await import(
      "@/models/ChatConversation"
    );
    await connectDB();
    await ChatConversation.updateOne(
      { _id: conversationId },
      {
        $inc: {
          "tokenUsage.input": inputTokens,
          "tokenUsage.output": outputTokens,
        },
        $addToSet: { modelTier: modelId },
      }
    );
  },

  isAnonConversationVerified: async (conversationId, ipHash) => {
    const { default: connectDB } = await import("@/lib/mongodb");
    const { isValidObjectId } = await import("mongoose");
    const { default: ChatConversation } = await import(
      "@/models/ChatConversation"
    );
    await connectDB();
    if (!isValidObjectId(conversationId)) return null;
    const doc = await ChatConversation.findOne({ _id: conversationId, anonId: ipHash })
      .select("humanVerifiedAt")
      .lean();
    if (!doc) return null;
    return !!(doc as { humanVerifiedAt?: Date }).humanVerifiedAt;
  },

  markHumanVerified: async (conversationId) => {
    const { default: connectDB } = await import("@/lib/mongodb");
    const { default: ChatConversation } = await import(
      "@/models/ChatConversation"
    );
    await connectDB();
    await ChatConversation.updateOne(
      { _id: conversationId },
      { $set: { humanVerifiedAt: new Date() } }
    );
  },
};

// ─── The request_human tool ───────────────────────────────────────────────────

/**
 * Builds the `request_human` tool for one request. Least privilege: the model
 * may only supply a non-PII `reason`. Identity (ctx.actor) and contact details
 * (input.contact, from the request body) are captured server-side in this closure.
 *
 * Exported so the test can exercise the tool's `.execute()` directly (the two
 * branches: no-email files nothing; with-email escalates with the server-side
 * actor + request contact, never a model-supplied value).
 */
export function buildRequestHumanTool(opts: {
  actor: ChatActor;
  contact: ChatContact | undefined;
  conversationId: string;
  messages: UIMessage[];
  persist: PersistPort;
  escalate: typeof realEscalateToHuman;
  onEscalated: () => void;
}) {
  return tool({
    description:
      "Escalate to a human support agent when you cannot help or the user asks for a person.",
    inputSchema: z.object({
      reason: z.string().max(500).optional(),
    }),
    execute: async ({ reason }) => {
      const email = opts.contact?.email;
      if (!email) {
        // No contact email yet — ask the user to share it. Create NO submission.
        return "To pass this to our team, please share the best email address to reach you on.";
      }

      const contact: EscalationContact = {
        ...(opts.contact?.name ? { name: opts.contact.name } : {}),
        email,
        ...(opts.contact?.phone ? { phone: opts.contact.phone } : {}),
      };

      const transcriptSummary = buildTranscriptSummary(opts.messages);
      const summaryWithReason = reason
        ? `Reason: ${redactPII(reason)}\n${transcriptSummary}`.slice(
            0,
            MAX_TRANSCRIPT_SUMMARY_CHARS
          )
        : transcriptSummary;

      const { submissionId } = await opts.escalate({
        actor: opts.actor,
        contact,
        transcriptSummary: summaryWithReason,
      });

      await opts.persist.setEscalated(opts.conversationId, submissionId);
      opts.onEscalated();

      return "I've passed this to our team — they usually reply within one business day.";
    },
  });
}

// ─── The service ──────────────────────────────────────────────────────────────

export const chatService = {
  /**
   * Orchestrate a single chat turn. Returns a Response speaking the v6
   * UI-message-stream protocol on every path.
   */
  async respond(
    input: ChatRespondInput,
    deps: ChatServiceDeps = {}
  ): Promise<Response> {
    const { ctx, messages } = input;

    const tryDeflect = deps.tryDeflect ?? realTryDeflect;
    const assertWithinBudget = deps.assertWithinBudget ?? realAssertWithinBudget;
    const recordUsage = deps.recordUsage ?? realRecordUsage;
    const streamFn = deps.streamFn ?? defaultStreamFn;
    const persist = deps.persist ?? defaultPersist;
    const escalate = deps.escalateToHuman ?? realEscalateToHuman;
    const getModel = deps.getModel ?? (() => getChatModel("primary"));
    const verifyHcaptchaFn = deps.verifyHcaptcha ?? realVerifyHcaptcha;

    const userText = latestUserText(messages);
    const userAgent = ctx.req.headers.get("user-agent") ?? undefined;

    // ── 1. Deflect first (no LLM) ─────────────────────────────────────────────
    const deflection = await tryDeflect(userText);
    if (deflection.answered && deflection.answer) {
      const { conversationId } = await persist.ensureConversation({
        actor: ctx.actor,
        conversationId: input.conversationId,
        ipHash: ctx.ipHash,
        userAgent,
      });

      await persist.addMessage({
        conversationId,
        role: "user",
        content: redactPII(userText),
      });
      await persist.addMessage({
        conversationId,
        role: "assistant",
        content: deflection.answer,
        ...(deflection.sources && deflection.sources.length > 0
          ? { citations: deflection.sources.map((s) => ({ docId: s.id })) }
          : {}),
      });

      ctx.audit.deflected = true;
      ctx.audit.conversationId = conversationId;

      return cannedTextResponse(
        deflection.answer,
        async () => {
          await ctx.writeAudit(200);
        },
        { "x-conversation-id": conversationId }
      );
    }

    // ── 2. Budget re-check (defense-in-depth) ─────────────────────────────────
    const budget = await assertWithinBudget();
    if (!budget.ok) {
      ctx.audit.deflected = false;
      return cannedTextResponse(BUSY_FALLBACK_TEXT, async () => {
        await ctx.writeAudit(200);
      });
    }

    // ── 2b. Guest hCaptcha gate ────────────────────────────────────────────────
    // Gate applies ONLY to anonymous actors on the LLM path (deflection already
    // returned above on a hit, so we know deflection MISSED here). Members are
    // never challenged. Fail-closed: no token or a bad token → 401 JSON (NOT a
    // stream). The Task 1.9 widget detects captcha_required and shows the widget.
    //
    // `freshlyVerified` is hoisted so the step-3 stamp site can distinguish
    // "this turn passed a brand-new challenge" (stamp humanVerifiedAt) from
    // "the conversation was already verified" (do NOT re-stamp) — even though
    // the resumed client may also send a token on every turn.
    let freshlyVerified = false;
    if (ctx.actor.kind === "anonymous") {
      // Check whether the resumed conversation is already human-verified.
      let alreadyVerified = false;
      if (input.conversationId) {
        const verified = await persist.isAnonConversationVerified(
          input.conversationId,
          ctx.ipHash
        );
        // A `null` return (conversation not found / not owned by this ipHash) is
        // treated identically to `false` → a fresh challenge is required.
        alreadyVerified = verified === true;
      }

      if (!alreadyVerified) {
        // Fresh challenge required.
        const token = input.hcaptchaToken ?? "";
        const ok = token ? await verifyHcaptchaFn(token) : false;
        if (!ok) {
          // Do NOT create a conversation, do NOT call the model, do NOT audit 200.
          // Return a plain JSON 401 (not a stream — the widget intercepts this).
          return new Response(
            JSON.stringify({
              success: false,
              error: "captcha_required",
              code: "captcha_required",
            }),
            {
              status: 401,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
        // Token valid AND this was a fresh verification (not an already-verified
        // resume) → stamp humanVerifiedAt after conversationId is known (step 3).
        freshlyVerified = true;
      }
    }

    // ── 3. LLM path ───────────────────────────────────────────────────────────
    let model: LanguageModel;
    let system: string;
    try {
      model = getModel();
      system = buildSystemPrompt(getKnowledgePack());
    } catch (err) {
      // Hard setup error (e.g. missing knowledge pack / model env) → graceful canned reply.
      console.error("[ChatService] model setup failed", err);
      // Best-effort ErrorReport — never allowed to surface or block the response.
      try {
        await ErrorLoggingService.logSystemError(err, {
          component: "ChatService",
          action: "model-setup",
          endpoint: "/api/chat",
        }, { isServerSide: true, request: ctx.req });
      } catch {
        // Intentionally swallowed — error reporting must not break the user response.
      }
      ctx.audit.deflected = false;
      return cannedTextResponse(MODEL_ERROR_FALLBACK_TEXT, async () => {
        await ctx.writeAudit(200);
      });
    }

    const { conversationId } = await persist.ensureConversation({
      actor: ctx.actor,
      conversationId: input.conversationId,
      ipHash: ctx.ipHash,
      userAgent,
    });

    // Stamp humanVerifiedAt ONLY when this turn passed a fresh challenge — not
    // when the conversation was already verified (even if the client re-sent a
    // token). This avoids a redundant Mongo write on every resumed turn.
    if (ctx.actor.kind === "anonymous" && freshlyVerified) {
      // Best-effort — failure must not block the response.
      try {
        await persist.markHumanVerified(conversationId);
      } catch (err) {
        console.error("[ChatService] markHumanVerified failed", err);
      }
    }

    // Persist the user message before streaming (so it survives a mid-stream drop).
    await persist.addMessage({
      conversationId,
      role: "user",
      content: redactPII(userText),
    });

    ctx.audit.deflected = false;
    ctx.audit.conversationId = conversationId;

    let escalated = false;
    const requestHuman = buildRequestHumanTool({
      actor: ctx.actor,
      contact: input.contact,
      conversationId,
      messages,
      persist,
      escalate,
      onEscalated: () => {
        escalated = true;
        ctx.audit.escalated = true;
      },
    });

    try {
      const modelMessages = await convertToModelMessages(messages);
      const tools: ToolSet = {
        request_human: requestHuman,
      };
      const result = streamFn({
        model,
        system,
        messages: modelMessages,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        stopWhen: stepCountIs(MAX_STEPS),
        tools,
        onFinish: async ({ text, usage }) => {
          // Fault-tolerant ordering: onFinish fires async AFTER respond() returns,
          // so the outer try/catch does NOT cover it. The answer has already
          // streamed and consumed real tokens by now — so cost-recording and the
          // mandatory audit row must NOT be starvable by a transient persistence
          // error. Therefore:
          //   1. compute counts up front,
          //   2. recordUsage FIRST (best-effort/never-throws — so the daily budget
          //      is incremented regardless of whether persistence later fails),
          //   3. wrap each persist call in its own try/catch,
          //   4. set ctx.audit + writeAudit(200) in finally so the audit row is
          //      always written.
          const tokensIn = usage.inputTokens ?? 0;
          const tokensOut = usage.outputTokens ?? 0;
          const modelId = modelIdOf(model);

          // 2. Record cost first — this guarantees the budget reflects the spend
          // even if every persist call below throws.
          await recordUsage(modelId, tokensIn, tokensOut);

          try {
            // 3a. Persist the assistant message (redacted) — only if non-empty (a
            // tool-only turn may produce no assistant text).
            const assistantText = (text ?? "").trim();
            if (assistantText.length > 0) {
              try {
                await persist.addMessage({
                  conversationId,
                  role: "assistant",
                  content: redactPII(assistantText),
                  ...(escalated
                    ? { toolCalls: [{ name: "request_human", ok: true }] }
                    : {}),
                });
              } catch (e) {
                console.error("[ChatService] onFinish persist failed", e);
              }
            }

            // 3b. Update the conversation's token/modelTier rollup.
            try {
              await persist.recordConversationUsage(
                conversationId,
                modelId,
                tokensIn,
                tokensOut
              );
            } catch (e) {
              console.error("[ChatService] onFinish persist failed", e);
            }
          } finally {
            // 4. Audit ALWAYS — even if both persist calls threw.
            ctx.audit.modelTier = modelId;
            ctx.audit.tokensIn = tokensIn;
            ctx.audit.tokensOut = tokensOut;
            ctx.audit.deflected = false;

            await ctx.writeAudit(200);
          }
        },
      });

      return result.toUIMessageStreamResponse({
        headers: { "x-conversation-id": conversationId },
      });
    } catch (err) {
      // Streaming failed to start (e.g. immediate auth error) → graceful canned reply.
      console.error("[ChatService] stream failed", err);
      // Best-effort ErrorReport — never allowed to surface or block the response.
      try {
        await ErrorLoggingService.logSystemError(err, {
          component: "ChatService",
          action: "stream-start",
          endpoint: "/api/chat",
        }, { isServerSide: true, request: ctx.req });
      } catch {
        // Intentionally swallowed — error reporting must not break the user response.
      }
      return cannedTextResponse(MODEL_ERROR_FALLBACK_TEXT, async () => {
        await ctx.writeAudit(200);
      });
    }
  },
};
