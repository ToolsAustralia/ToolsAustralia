/**
 * support-chat/audit.ts
 *
 * Audit helpers for the withChatbot() security pipeline.
 *
 * Two exports:
 *   hashIp(ip)      — sha256 hex string (mirrors withNorm's sha256 helper).
 *   writeChatAudit  — best-effort ChatAuditLog row creation (never throws).
 *
 * Convention (mirrors NormCallLog discipline):
 *   - ipHash is stored; the raw IP is never persisted.
 *   - writeChatAudit is best-effort: wrap in try/catch, console.error on failure,
 *     never throw — an audit failure must not break a chat response.
 */

import { createHash } from "node:crypto";

/** sha256 hex of a string — mirrors src/lib/internal-norm/audit.ts */
export function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

export interface ChatAuditMeta {
  requestId: string;
  actorKind: "member" | "anonymous";
  status: number;
  deflected: boolean;
  escalated?: boolean;
  /** Pre-hashed IP (use hashIp() before passing). */
  ipHash?: string;
  conversationId?: string;
  modelTier?: string;
  tokensIn?: number;
  tokensOut?: number;
  durationMs?: number;
}

/**
 * Writes a ChatAuditLog document. Best-effort: catches all errors and logs via
 * console.error (never throws). Dynamic imports keep Mongoose out of the module
 * top-level so the test file can stub this function entirely.
 */
export async function writeChatAudit(meta: ChatAuditMeta): Promise<void> {
  try {
    const [{ default: connectDB }, { default: ChatAuditLog }] =
      await Promise.all([
        import("@/lib/mongodb"),
        import("@/models/ChatAuditLog"),
      ]);
    await connectDB();
    await ChatAuditLog.create({
      requestId: meta.requestId,
      actorKind: meta.actorKind,
      status: meta.status,
      deflected: meta.deflected,
      escalated: meta.escalated ?? false,
      ...(meta.ipHash !== undefined && { ipHash: meta.ipHash }),
      ...(meta.conversationId !== undefined && {
        conversationId: meta.conversationId,
      }),
      ...(meta.modelTier !== undefined && { modelTier: meta.modelTier }),
      ...(meta.tokensIn !== undefined && { tokensIn: meta.tokensIn }),
      ...(meta.tokensOut !== undefined && { tokensOut: meta.tokensOut }),
      ...(meta.durationMs !== undefined && { durationMs: meta.durationMs }),
    });
  } catch (err) {
    console.error("[chatbot] writeChatAudit failed:", err);
  }
}
