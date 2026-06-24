/**
 * support-chat/withChatbot.ts
 *
 * Fixed security pipeline every chat request passes through. Analogue of
 * src/lib/internal-norm/withNorm.ts but for an UNTRUSTED PUBLIC CALLER.
 *
 * Pipeline order:
 *   identify → rate-limit → kill-switch/budget → handler → audit
 *
 * Key differences from withNorm():
 *   - No HMAC/bearer auth. Members identified by NextAuth session cookie; anonymous
 *     by server-derived IP. Never trust a client-supplied userId.
 *   - Two independent rate limiters: stricter for anonymous (15 req/min), looser for
 *     members (40 req/min). Both are Mongo-backed (createDistributedRateLimiter) and
 *     FAIL OPEN — store hiccup allows the request. The fail-CLOSED cost guard
 *     (assertWithinBudget) is the real backstop against abuse.
 *   - The response is a streaming ReadableStream so withChatbot CANNOT clone().text()
 *     it to hash the body. Audit-timing decision:
 *       • Early exits (429, 503) write their own audit row immediately (status known).
 *       • Success path: ctx.writeAudit(status) + mutable ctx.audit are provided to the
 *         handler (ChatService, Task 1.7) so it calls writeAudit at stream end when
 *         token counts are known. withChatbot does NOT auto-write the success audit.
 *       • Handler throws synchronously: withChatbot catches it, writes a 500 audit row
 *         (or 400 for ZodError), and returns the error response.
 *
 * Rate-limit defaults (hardcoded — no env flags needed per CLAUDE.md §4):
 *   anonymous: 15 req/min  — tight; anonymous guests are FAQ-only (Task 1.8 gating)
 *   member:    40 req/min  — more room; authenticated users are trusted but still capped
 *
 * Usage:
 *   export const POST = withChatbot(handler);
 *   // or with injected deps for tests:
 *   export const POST = withChatbot(handler, { getSession, anonLimiter, memberLimiter, assertBudget, writeAudit });
 */

import { ZodError } from "zod";
import { randomUUID } from "node:crypto";
import type { ChatActor } from "@/lib/support-chat/types";
import { hashIp, writeChatAudit } from "@/lib/support-chat/audit";
import type { ChatAuditMeta } from "@/lib/support-chat/audit";
import {
  createDistributedRateLimiter,
  getClientIdentifier,
} from "@/utils/security/rateLimiter";

// Static import is safe: rateLimiter.ts has no top-level Mongoose import — its
// Mongo access is lazy (await import inside check()), and getClientIdentifier is
// a pure function. So importing this module here does NOT load Mongoose at init.

// ─── Rate-limit defaults (singleton per process — created once) ───────────────

type RlResult = { success: boolean; remaining: number; retryAfterSeconds: number };
type RateLimiter = { check: (id: string) => Promise<RlResult> };

// Lazy singletons so the limiters are constructed once per process (the test
// injects stubs via deps and never triggers these getters).
let _anonLimiter: RateLimiter | null = null;
let _memberLimiter: RateLimiter | null = null;

function getAnonLimiter(): RateLimiter {
  if (!_anonLimiter) {
    _anonLimiter = createDistributedRateLimiter("chat:anon", {
      maxRequests: 15,
      windowMs: 60_000,
    });
  }
  return _anonLimiter!;
}

function getMemberLimiter(): RateLimiter {
  if (!_memberLimiter) {
    _memberLimiter = createDistributedRateLimiter("chat:member", {
      maxRequests: 40,
      windowMs: 60_000,
    });
  }
  return _memberLimiter!;
}

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Mutable audit accumulator. The handler (ChatService) fills in the fields it
 * knows at stream-end before calling ctx.writeAudit(status).
 */
export interface ChatAuditAccumulator
  extends Omit<ChatAuditMeta, "requestId" | "actorKind" | "status"> {
  deflected: boolean;
  escalated: boolean;
}

/**
 * Context passed to every handler registered with withChatbot().
 */
export interface ChatCtx {
  /** Derived server-side from the NextAuth session or the request IP. */
  actor: ChatActor;
  req: Request;
  /** UUID string identifying this request (for audit correlation). */
  requestId: string;
  /** sha256(IP) — safe to log; the raw IP is never exposed on ctx. */
  ipHash: string;
  /**
   * Mutable audit accumulator. The handler fills in deflected / escalated /
   * modelTier / tokensIn / tokensOut / conversationId / durationMs, then calls
   * ctx.writeAudit(status) once the stream is complete.
   */
  audit: ChatAuditAccumulator;
  /**
   * Write the ChatAuditLog row with the given HTTP status code. Safe to call
   * from within a streaming response finaliser. Best-effort — never throws.
   */
  writeAudit: (status: number) => Promise<void>;
}

export type ChatbotHandler = (ctx: ChatCtx) => Promise<Response>;

// ─── Dependency injection interface ──────────────────────────────────────────

interface Session {
  user?: { id?: string; firstName?: string } | null;
}

export interface WithChatbotDeps {
  /** Injected session getter (default: getServerSession from next-auth). */
  getSession?: (req: Request) => Promise<Session | null>;
  /**
   * Anonymous rate-limiter. Defaults to the Mongo-backed limiter at 15 req/min.
   * Rate-limiter FAILS OPEN (store hiccup → allows the request).
   */
  anonLimiter?: RateLimiter;
  /**
   * Member rate-limiter. Defaults to the Mongo-backed limiter at 40 req/min.
   * Rate-limiter FAILS OPEN (store hiccup → allows the request).
   */
  memberLimiter?: RateLimiter;
  /**
   * Cost/kill-switch gate. Defaults to assertWithinBudget from costGuard.ts.
   * Fails CLOSED: any error → { ok: false, reason: 'error' }.
   */
  assertBudget?: () => Promise<{ ok: boolean; reason?: string }>;
  /**
   * Audit writer. Defaults to writeChatAudit from audit.ts.
   * Best-effort — never throws.
   */
  writeAudit?: (meta: ChatAuditMeta) => Promise<void>;
}

// ─── JSON helper ─────────────────────────────────────────────────────────────

function jsonResponse(status: number, body: Record<string, unknown>, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

// ─── withChatbot ─────────────────────────────────────────────────────────────

export function withChatbot(
  handler: ChatbotHandler,
  deps: WithChatbotDeps = {}
): (req: Request) => Promise<Response> {
  return async function chatbotRouteHandler(req: Request): Promise<Response> {
    const started = Date.now();
    const requestId = randomUUID().replace(/-/g, "");

    // ── 1. Identify ─────────────────────────────────────────────────────────
    // Always derived server-side. Never trust client-supplied identity.

    let actor: ChatActor;
    const getSession = deps.getSession ?? defaultGetSession;
    const session = await getSession(req);

    // Derive the client IP server-side via the canonical helper (same one the
    // rate limiter uses elsewhere) so there's a single source of truth.
    const rawIp = getClientIdentifier(
      req.headers.get("x-real-ip"),
      req.headers.get("x-forwarded-for")
    );

    if (session?.user?.id) {
      actor = {
        kind: "member",
        userId: session.user.id,
        firstName: session.user.firstName ?? "",
      };
      // For members the ipHash is still computed so the audit row always has it.
    } else {
      actor = { kind: "anonymous", ipKey: rawIp };
    }

    const ipHash = hashIp(rawIp);

    // ── 2. Rate-limit ────────────────────────────────────────────────────────
    // Choose the appropriate limiter based on actor kind.
    // Anonymous → stricter (15 req/min); Member → looser (40 req/min).
    // Both FAIL OPEN — store hiccup allows the request.
    const rateLimiter =
      actor.kind === "member"
        ? (deps.memberLimiter ?? getMemberLimiter())
        : (deps.anonLimiter ?? getAnonLimiter());

    const rateLimitKey =
      actor.kind === "member" ? actor.userId : actor.ipKey;

    const rl = await rateLimiter.check(rateLimitKey);
    if (!rl.success) {
      const auditWriter = deps.writeAudit ?? writeChatAudit;
      await auditWriter({
        requestId,
        actorKind: actor.kind,
        status: 429,
        deflected: false,
        escalated: false,
        ipHash,
        durationMs: Date.now() - started,
      });
      return jsonResponse(
        429,
        {
          success: false,
          error: "Too many requests",
          code: "rate_limited",
          retryAfterSeconds: rl.retryAfterSeconds,
        },
        { "Retry-After": String(rl.retryAfterSeconds) }
      );
    }

    // ── 3. Kill-switch + daily budget ────────────────────────────────────────
    // assertWithinBudget covers both the env kill-switch AND the Mongo daily
    // budget. Fails CLOSED: any error → { ok: false }.
    const assertBudget = deps.assertBudget ?? defaultAssertBudget;
    const budget = await assertBudget();
    if (!budget.ok) {
      const auditWriter = deps.writeAudit ?? writeChatAudit;
      await auditWriter({
        requestId,
        actorKind: actor.kind,
        status: 503,
        deflected: false,
        escalated: false,
        ipHash,
        durationMs: Date.now() - started,
      });
      return jsonResponse(503, {
        success: false,
        error: "chat_unavailable",
        code: budget.reason ?? "unavailable",
      });
    }

    // ── 4. Handler ───────────────────────────────────────────────────────────
    // Provide ctx.audit (mutable accumulator) and ctx.writeAudit so ChatService
    // can record the final status + token counts at stream end.

    const auditAccumulator: ChatAuditAccumulator = {
      deflected: false,
      escalated: false,
    };

    const auditWriter = deps.writeAudit ?? writeChatAudit;

    const ctx: ChatCtx = {
      actor,
      req,
      requestId,
      ipHash,
      audit: auditAccumulator,
      writeAudit: async (status: number) => {
        await auditWriter({
          requestId,
          actorKind: actor.kind,
          status,
          deflected: auditAccumulator.deflected,
          escalated: auditAccumulator.escalated,
          ipHash,
          ...(auditAccumulator.conversationId !== undefined && {
            conversationId: auditAccumulator.conversationId,
          }),
          ...(auditAccumulator.modelTier !== undefined && {
            modelTier: auditAccumulator.modelTier,
          }),
          ...(auditAccumulator.tokensIn !== undefined && {
            tokensIn: auditAccumulator.tokensIn,
          }),
          ...(auditAccumulator.tokensOut !== undefined && {
            tokensOut: auditAccumulator.tokensOut,
          }),
          durationMs: Date.now() - started,
        });
      },
    };

    try {
      return await handler(ctx);
    } catch (err) {
      // ZodError from Zod .parse() in the handler → 400 (house pattern).
      const status = err instanceof ZodError ? 400 : 500;
      const code = err instanceof ZodError ? "validation_error" : "internal_error";

      if (!(err instanceof ZodError)) {
        console.error("[chatbot] handler threw", err);
      }

      await auditWriter({
        requestId,
        actorKind: actor.kind,
        status,
        deflected: false,
        escalated: false,
        ipHash,
        durationMs: Date.now() - started,
      });

      return jsonResponse(status, {
        success: false,
        error: err instanceof ZodError ? "validation_error" : "internal",
        code,
        requestId,
      });
    }
  };
}

// ─── Private helpers ──────────────────────────────────────────────────────────

async function defaultGetSession(_req: Request): Promise<Session | null> {
  // Dynamic import keeps next-auth out of the module top-level.
  // This lets the test file import withChatbot without triggering next-auth's
  // module initialisation.
  const { getServerSession } = await import("next-auth");
  const { authOptions } = await import("@/lib/auth");
  // getServerSession reads cookies() / headers() from the Next.js async
  // context — it does NOT need the Request object passed.
  return getServerSession(authOptions) as Promise<Session | null>;
}

async function defaultAssertBudget(): Promise<{ ok: boolean; reason?: string }> {
  const { assertWithinBudget } = await import("@/lib/support-chat/costGuard");
  return assertWithinBudget();
}
