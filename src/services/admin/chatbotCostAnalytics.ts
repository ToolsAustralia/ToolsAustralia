import connectDB from "@/lib/mongodb";
import ChatDailyBudget from "@/models/ChatDailyBudget";
import ChatAuditLog from "@/models/ChatAuditLog";
import { utcDayKey } from "@/lib/support-chat/costGuard";
import { getActiveChatProvider } from "@/lib/support-chat/chatSettings";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatbotCostSummary {
  todayUsd: number;
  last7Usd: number;
  last30Usd: number;
  totalTokensIn: number;
  totalTokensOut: number;
}

export interface ChatbotDailyRow {
  dayKey: string;
  spentUsd: number;
  tokensIn: number;
  tokensOut: number;
}

export interface ChatbotUsageSummary {
  totalRequests: number;
  deflectedCount: number;
  llmCount: number;
  deflectionRatePct: number;
  escalatedCount: number;
  memberCount: number;
  anonymousCount: number;
  avgDurationMs: number;
  conversationsCount: number;
}

export interface ChatbotConfig {
  model: string;
  activeProvider: "anthropic" | "google";
  dailyBudgetUsd: number;
  killSwitch: boolean;
  generativeLimitMax: number;
  generativeLimitWindowSeconds: number;
}

export interface ChatbotCostData {
  rangeDays: number;
  cost: ChatbotCostSummary;
  daily: ChatbotDailyRow[];
  usage: ChatbotUsageSummary;
  config: ChatbotConfig;
}

// ---------------------------------------------------------------------------
// Pure computation helper (no Mongo — testable in isolation)
// ---------------------------------------------------------------------------

export interface AuditRow {
  actorKind: "member" | "anonymous";
  deflected: boolean;
  escalated: boolean;
  durationMs?: number | null;
  conversationId?: string | null;
}

/**
 * Summarises raw ChatAuditLog rows into a ChatbotUsageSummary.
 * Deflection rate = (deflectedCount / totalRequests) * 100, rounded to 1 dp.
 * Guard: 0 rows → 0% (no divide-by-zero).
 * conversationsCount = distinct non-null conversationId values.
 */
export function summarizeAuditRows(rows: AuditRow[]): ChatbotUsageSummary {
  const totalRequests = rows.length;
  let deflectedCount = 0;
  let escalatedCount = 0;
  let memberCount = 0;
  let anonymousCount = 0;
  let durationTotal = 0;
  let durationCount = 0;
  const conversationIdSet = new Set<string>();

  for (const row of rows) {
    if (row.deflected) deflectedCount += 1;
    if (row.escalated) escalatedCount += 1;
    if (row.actorKind === "member") memberCount += 1;
    else anonymousCount += 1;
    if (row.durationMs != null && row.durationMs > 0) {
      durationTotal += row.durationMs;
      durationCount += 1;
    }
    if (row.conversationId != null) {
      conversationIdSet.add(row.conversationId);
    }
  }

  const llmCount = totalRequests - deflectedCount;
  const deflectionRatePct =
    totalRequests > 0
      ? Math.round((deflectedCount / totalRequests) * 1000) / 10 // 1 dp
      : 0;
  const avgDurationMs =
    durationCount > 0 ? Math.round(durationTotal / durationCount) : 0;

  return {
    totalRequests,
    deflectedCount,
    llmCount,
    deflectionRatePct,
    escalatedCount,
    memberCount,
    anonymousCount,
    avgDurationMs,
    conversationsCount: conversationIdSet.size,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns an array of UTC day-key strings [oldest … today], length = days. */
function buildDayRange(days: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    result.push(utcDayKey(d));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Config reader (server-side env vars)
// ---------------------------------------------------------------------------

async function readChatbotConfig(): Promise<ChatbotConfig> {
  const rawBudget = parseFloat(process.env.CHAT_DAILY_TOKEN_BUDGET_USD ?? "5");
  const dailyBudgetUsd = Number.isFinite(rawBudget) ? rawBudget : 5;
  const activeProvider = await getActiveChatProvider();
  const model =
    activeProvider === "google"
      ? (process.env.CHAT_GOOGLE_MODEL_PRIMARY ?? "gemini-2.5-flash-lite")
      : (process.env.CHAT_MODEL_PRIMARY ?? "claude-haiku-4-5");
  return {
    model,
    activeProvider,
    dailyBudgetUsd,
    killSwitch: process.env.CHAT_KILL_SWITCH === "true",
    generativeLimitMax: Number(process.env.CHAT_GENERATIVE_LIMIT_MAX) || 5,
    generativeLimitWindowSeconds:
      Number(process.env.CHAT_GENERATIVE_LIMIT_WINDOW_SECONDS) || 300,
  };
}

// ---------------------------------------------------------------------------
// DB-touching entry point
// ---------------------------------------------------------------------------

/**
 * Fetches chatbot cost & usage analytics for the requested window.
 * Delegates pure computation to {@link summarizeAuditRows}.
 * Calls connectDB() so it is safe on a cold serverless instance (the cached
 * connection makes this a no-op when one already exists).
 */
export async function getChatbotCostAnalytics({
  days,
}: {
  days: number;
}): Promise<ChatbotCostData> {
  await connectDB();

  const today = utcDayKey();
  const dayRange = buildDayRange(days);
  const oldestDayKey = dayRange[0];

  // ── Budget rows ──────────────────────────────────────────────────────────
  const budgetRows = await ChatDailyBudget.find({
    dayKey: { $gte: oldestDayKey, $lte: today },
  })
    .sort({ dayKey: 1 })
    .lean()
    .exec();

  // Index by dayKey for quick lookups
  const budgetByDay = new Map(budgetRows.map((r) => [r.dayKey, r]));

  // Build the ascending daily array (fill missing days with zeros)
  const daily: ChatbotDailyRow[] = dayRange.map((dk) => {
    const r = budgetByDay.get(dk);
    return {
      dayKey: dk,
      spentUsd: r?.spentUsd ?? 0,
      tokensIn: r?.tokensIn ?? 0,
      tokensOut: r?.tokensOut ?? 0,
    };
  });

  // Cost summary
  const last7Start = buildDayRange(7)[0];
  const last30Start = buildDayRange(30)[0];

  let todayUsd = 0;
  let last7Usd = 0;
  let last30Usd = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;

  for (const row of daily) {
    totalTokensIn += row.tokensIn;
    totalTokensOut += row.tokensOut;
    if (row.dayKey === today) todayUsd = row.spentUsd;
    if (row.dayKey >= last7Start) last7Usd += row.spentUsd;
    if (row.dayKey >= last30Start) last30Usd += row.spentUsd;
  }

  const cost: ChatbotCostSummary = {
    todayUsd,
    last7Usd,
    last30Usd,
    totalTokensIn,
    totalTokensOut,
  };

  // ── Audit rows ───────────────────────────────────────────────────────────
  const since = new Date(`${oldestDayKey}T00:00:00.000Z`);
  const auditRows = await ChatAuditLog.find({ createdAt: { $gte: since } })
    .select({
      actorKind: 1,
      deflected: 1,
      escalated: 1,
      durationMs: 1,
      conversationId: 1,
    })
    .lean()
    .exec();

  const usage = summarizeAuditRows(
    auditRows.map((r) => ({
      actorKind: r.actorKind as "member" | "anonymous",
      deflected: r.deflected,
      escalated: r.escalated,
      durationMs: r.durationMs,
      conversationId: r.conversationId ? String(r.conversationId) : null,
    }))
  );

  const config = await readChatbotConfig();

  return { rangeDays: days, cost, daily, usage, config };
}
