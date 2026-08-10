import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import ChatConversation from "@/models/ChatConversation";
import ChatMessage from "@/models/ChatMessage";
import ChatAuditLog from "@/models/ChatAuditLog";
import User from "@/models/User";

/**
 * chatTranscripts.ts
 *
 * Admin read-side for Cobber conversation transcripts. Separate from
 * chatbotCostAnalytics.ts on purpose: that file answers "what is Cobber
 * costing us" from ChatAuditLog aggregates only, this one answers "what are
 * people actually asking and how did Cobber reply" by reading the stored
 * ChatConversation / ChatMessage documents.
 *
 * PII posture — message content is ALREADY redacted at write time by
 * redactPII() in ChatService, so emails/phones/cards are stored as
 * [email]/[phone]/[card] and this layer never has raw PII to leak. The only
 * identity we attach is the Norm projection: firstName + the opaque userId.
 * Never widen this to email / full name / phone.
 *
 * Retention — both collections carry a 90-day TTL, so this surface can only
 * ever show the last 90 days. `days` is clamped to that ceiling.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TranscriptStatusFilter = "all" | "open" | "escalated" | "closed";
export type TranscriptActorFilter = "all" | "member" | "anonymous";
/**
 * "deflected" = the whole conversation was answered from the FAQ decision tree
 * with no LLM call (ChatConversation.modelTier stayed empty).
 * "generative" = at least one turn hit the model.
 */
export type TranscriptKindFilter = "all" | "deflected" | "generative";

export interface ChatTranscriptListParams {
  days: number;
  status: TranscriptStatusFilter;
  actor: TranscriptActorFilter;
  kind: TranscriptKindFilter;
  /** Free-text match against redacted message content. Empty string = no search. */
  q: string;
  page: number;
  limit: number;
}

export interface ChatTranscriptRow {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "open" | "escalated" | "closed";
  actorKind: "member" | "anonymous";
  /** Opaque user id — present only for member conversations. */
  userId: string | null;
  /** Norm-style minimal identity. Null for anonymous or if the user is gone. */
  firstName: string | null;
  messageCount: number;
  userMessageCount: number;
  /** First thing the user actually asked — the "why did they open Cobber" signal. */
  firstUserMessage: string | null;
  /** Distinct model tiers used across the conversation. Empty = fully deflected. */
  modelTier: string[];
  deflectedOnly: boolean;
  tokensIn: number;
  tokensOut: number;
}

export interface ChatTranscriptListResult {
  rows: ChatTranscriptRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  /** Echoed back so the UI can show what it filtered on. */
  appliedDays: number;
}

export interface ChatTranscriptMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  createdAt: string;
  citations: { docId: string; span?: string }[];
  toolCalls: { name: string; ok: boolean; durationMs?: number }[];
}

export interface ChatTranscriptTurn {
  requestId: string;
  modelTier: string | null;
  tokensIn: number;
  tokensOut: number;
  deflected: boolean;
  escalated: boolean;
  status: number;
  durationMs: number | null;
  createdAt: string;
}

export interface ChatTranscriptDetail {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "open" | "escalated" | "closed";
  actorKind: "member" | "anonymous";
  userId: string | null;
  firstName: string | null;
  modelTier: string[];
  tokensIn: number;
  tokensOut: number;
  escalatedSubmissionId: string | null;
  messages: ChatTranscriptMessage[];
  /** Per-request audit rows, ascending. Lets an admin see cost + latency per turn. */
  turns: ChatTranscriptTurn[];
  /**
   * True when the conversation is older than the message TTL horizon, so some
   * early messages may already have been purged. See MESSAGE_TTL_DAYS.
   */
  possiblyTruncated: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Matches the TTL on ChatMessage / ChatConversation. */
export const MESSAGE_TTL_DAYS = 90;
export const MAX_LIMIT = 100;
export const DEFAULT_LIMIT = 25;

/** Truncation length for the list-view message preview. */
const PREVIEW_CHARS = 160;

// ---------------------------------------------------------------------------
// Pure helpers (no Mongo — unit-testable)
// ---------------------------------------------------------------------------

/**
 * Escapes regex metacharacters so a user's search string is treated as a
 * literal. Without this, a stray "(" from a pasted question throws and a
 * search for "." would match every message.
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Collapses whitespace and truncates for the list preview. */
export function buildPreview(text: string, max: number = PREVIEW_CHARS): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max - 1) + "…" : flat;
}

/**
 * A conversation is "deflected only" when no model tier was ever recorded —
 * every answer came from the FAQ decision tree and cost nothing.
 */
export function isDeflectedOnly(modelTier: string[] | undefined | null): boolean {
  return !modelTier || modelTier.length === 0;
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * Lists conversations newest-first for the admin transcript browser.
 *
 * Filter order matters for cost: the date + status + actor filters run as an
 * indexed-ish Mongo query, and the optional text search narrows by
 * conversationId first (message volume is ~10/day, so a redacted-content regex
 * is cheap — revisit if Cobber traffic grows by orders of magnitude).
 */
export async function listChatTranscripts(
  params: ChatTranscriptListParams
): Promise<ChatTranscriptListResult> {
  await connectDB();

  const days = Math.min(Math.max(params.days, 1), MESSAGE_TTL_DAYS);
  const limit = Math.min(Math.max(params.limit, 1), MAX_LIMIT);
  const page = Math.max(params.page, 1);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const filter: mongoose.FilterQuery<Record<string, unknown>> = {
    updatedAt: { $gte: since },
  };

  if (params.status !== "all") filter.status = params.status;

  // actorKind is derived, not stored: a conversation with a userId is a member.
  if (params.actor === "member") filter.userId = { $ne: null };
  else if (params.actor === "anonymous") filter.userId = null;

  if (params.kind === "deflected") filter.modelTier = { $size: 0 };
  else if (params.kind === "generative") filter["modelTier.0"] = { $exists: true };

  // ── Optional free-text search over redacted message content ───────────────
  const q = params.q.trim();
  if (q.length > 0) {
    const matching = await ChatMessage.find({
      content: { $regex: escapeRegex(q), $options: "i" },
      createdAt: { $gte: since },
    })
      .select({ conversationId: 1 })
      .lean()
      .exec();

    const ids = [...new Set(matching.map((m) => String(m.conversationId)))];
    // No message matched → no conversations. Short-circuit rather than
    // running a $in against an empty array (which Mongo happily matches none
    // of, but the extra round trip is pointless).
    if (ids.length === 0) {
      return {
        rows: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
        appliedDays: days,
      };
    }
    filter._id = { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) };
  }

  const total = await ChatConversation.countDocuments(filter);

  const conversations = await ChatConversation.find(filter)
    .select({
      status: 1,
      userId: 1,
      modelTier: 1,
      tokenUsage: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .sort({ updatedAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean()
    .exec();

  if (conversations.length === 0) {
    return { rows: [], total, page, limit, totalPages: Math.ceil(total / limit), appliedDays: days };
  }

  const conversationIds = conversations.map((c) => c._id);

  // ── Message counts + first user message, in one aggregate per page ────────
  const messageStats = await ChatMessage.aggregate<{
    _id: mongoose.Types.ObjectId;
    messageCount: number;
    userMessageCount: number;
    firstUserMessage: string | null;
  }>([
    { $match: { conversationId: { $in: conversationIds } } },
    { $sort: { createdAt: 1 } },
    {
      $group: {
        _id: "$conversationId",
        messageCount: { $sum: 1 },
        userMessageCount: {
          $sum: { $cond: [{ $eq: ["$role", "user"] }, 1, 0] },
        },
        firstUserMessage: {
          $first: {
            $cond: [{ $eq: ["$role", "user"] }, "$content", "$$REMOVE"],
          },
        },
      },
    },
  ]);

  const statsById = new Map(messageStats.map((s) => [String(s._id), s]));

  // ── Minimal identity (Norm projection: firstName only) ────────────────────
  const userIds = conversations
    .map((c) => c.userId)
    .filter((id): id is mongoose.Types.ObjectId => Boolean(id));

  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } })
        .select({ firstName: 1 })
        .lean()
        .exec()
    : [];

  const firstNameById = new Map(
    users.map((u) => [String(u._id), (u as { firstName?: string }).firstName ?? null])
  );

  const rows: ChatTranscriptRow[] = conversations.map((c) => {
    const id = String(c._id);
    const stats = statsById.get(id);
    const modelTier = (c.modelTier ?? []) as string[];
    const userId = c.userId ? String(c.userId) : null;

    return {
      id,
      createdAt: (c.createdAt as Date).toISOString(),
      updatedAt: (c.updatedAt as Date).toISOString(),
      status: c.status as "open" | "escalated" | "closed",
      actorKind: userId ? "member" : "anonymous",
      userId,
      firstName: userId ? (firstNameById.get(userId) ?? null) : null,
      messageCount: stats?.messageCount ?? 0,
      userMessageCount: stats?.userMessageCount ?? 0,
      firstUserMessage: stats?.firstUserMessage
        ? buildPreview(stats.firstUserMessage)
        : null,
      modelTier,
      deflectedOnly: isDeflectedOnly(modelTier),
      tokensIn: c.tokenUsage?.input ?? 0,
      tokensOut: c.tokenUsage?.output ?? 0,
    };
  });

  return {
    rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    appliedDays: days,
  };
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

/**
 * Returns the full transcript for one conversation, plus its per-request audit
 * rows so an admin can see model tier, latency and token cost turn by turn.
 * Returns null when the id is unknown or already TTL-purged.
 */
export async function getChatTranscript(
  conversationId: string
): Promise<ChatTranscriptDetail | null> {
  await connectDB();

  if (!mongoose.Types.ObjectId.isValid(conversationId)) return null;

  const conversation = await ChatConversation.findById(conversationId)
    .select({
      status: 1,
      userId: 1,
      modelTier: 1,
      tokenUsage: 1,
      escalatedSubmissionId: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .lean()
    .exec();

  if (!conversation) return null;

  const [messages, auditRows] = await Promise.all([
    ChatMessage.find({ conversationId })
      .select({ role: 1, content: 1, citations: 1, toolCalls: 1, createdAt: 1 })
      .sort({ createdAt: 1 })
      .lean()
      .exec(),
    ChatAuditLog.find({ conversationId })
      .select({
        requestId: 1,
        modelTier: 1,
        tokensIn: 1,
        tokensOut: 1,
        deflected: 1,
        escalated: 1,
        status: 1,
        durationMs: 1,
        createdAt: 1,
      })
      .sort({ createdAt: 1 })
      .lean()
      .exec(),
  ]);

  const userId = conversation.userId ? String(conversation.userId) : null;
  const firstName = userId
    ? ((
        await User.findById(userId).select({ firstName: 1 }).lean().exec()
      )?.firstName ?? null)
    : null;

  // ChatConversation's TTL rides on updatedAt (sliding) while ChatMessage's
  // rides on createdAt (fixed). A conversation that stayed active for longer
  // than the TTL can therefore outlive its own earliest messages. Flag it so
  // the UI doesn't present a partial transcript as complete.
  const ageDays =
    (Date.now() - new Date(conversation.createdAt as Date).getTime()) /
    (24 * 60 * 60 * 1000);
  const possiblyTruncated = ageDays > MESSAGE_TTL_DAYS;

  return {
    id: String(conversation._id),
    createdAt: (conversation.createdAt as Date).toISOString(),
    updatedAt: (conversation.updatedAt as Date).toISOString(),
    status: conversation.status as "open" | "escalated" | "closed",
    actorKind: userId ? "member" : "anonymous",
    userId,
    firstName,
    modelTier: (conversation.modelTier ?? []) as string[],
    tokensIn: conversation.tokenUsage?.input ?? 0,
    tokensOut: conversation.tokenUsage?.output ?? 0,
    escalatedSubmissionId: conversation.escalatedSubmissionId
      ? String(conversation.escalatedSubmissionId)
      : null,
    messages: messages.map((m) => ({
      id: String(m._id),
      role: m.role as "user" | "assistant" | "tool",
      content: m.content,
      createdAt: (m.createdAt as Date).toISOString(),
      citations: (m.citations ?? []).map((c) => ({
        docId: c.docId,
        span: c.span,
      })),
      toolCalls: (m.toolCalls ?? []).map((t) => ({
        name: t.name,
        ok: t.ok,
        durationMs: t.durationMs,
      })),
    })),
    turns: auditRows.map((a) => ({
      requestId: a.requestId,
      modelTier: a.modelTier ?? null,
      tokensIn: a.tokensIn ?? 0,
      tokensOut: a.tokensOut ?? 0,
      deflected: a.deflected,
      escalated: a.escalated,
      status: a.status,
      durationMs: a.durationMs ?? null,
      createdAt: (a.createdAt as Date).toISOString(),
    })),
    possiblyTruncated,
  };
}
