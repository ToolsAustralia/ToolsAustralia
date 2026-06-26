/**
 * support-chat/costGuard.ts
 *
 * App-level cost ceiling for the AI support chatbot.
 *
 * Three responsibilities:
 *  1. estimateCostUsd  — pure price-table computation (unit-testable)
 *  2. evaluateBudget   — pure decision (unit-testable, no I/O)
 *  3. assertWithinBudget — DB-backed gate (fail-closed; injectable deps for tests)
 *  4. recordUsage      — best-effort atomic $inc on ChatDailyBudget (never throws)
 *
 * Fail-closed policy: any error in the gate returns { ok: false, reason: 'error' }
 * so a DB outage can never uncap spend.
 */

// ─── 1. Price table ──────────────────────────────────────────────────────────

/** USD per 1 million tokens */
interface ModelPrice {
  inputPer1M: number;
  outputPer1M: number;
}

const MODEL_PRICES: Record<string, ModelPrice> = {
  "claude-haiku-4-5": { inputPer1M: 1.0, outputPer1M: 5.0 },
  "claude-sonnet-4-6": { inputPer1M: 3.0, outputPer1M: 15.0 },
  "claude-opus-4-8": { inputPer1M: 5.0, outputPer1M: 25.0 },
  "gemini-2.5-flash-lite": { inputPer1M: 0.10, outputPer1M: 0.40 },
  "gemini-2.5-flash": { inputPer1M: 0.30, outputPer1M: 2.50 },
};

/** Fallback to the most expensive model so estimates never under-count. */
const FALLBACK_PRICE: ModelPrice = { inputPer1M: 5.0, outputPer1M: 25.0 };

/**
 * Estimate cost in USD for a given model + token counts.
 * Unknown model → falls back to opus rates (fail-expensive).
 */
export function estimateCostUsd(
  model: string,
  tokensIn: number,
  tokensOut: number
): number {
  const price = MODEL_PRICES[model] ?? FALLBACK_PRICE;
  return (
    (tokensIn / 1_000_000) * price.inputPer1M +
    (tokensOut / 1_000_000) * price.outputPer1M
  );
}

// ─── 2. Pure decision function ───────────────────────────────────────────────

export interface BudgetDecision {
  ok: boolean;
  reason?: "kill_switch" | "daily_budget";
}

/**
 * Pure, synchronous decision — no I/O, fully unit-testable.
 *
 * Priority: kill-switch wins over budget check.
 */
export function evaluateBudget(input: {
  killSwitch: boolean;
  spentUsd: number;
  budgetUsd: number;
}): BudgetDecision {
  if (input.killSwitch) {
    return { ok: false, reason: "kill_switch" };
  }
  if (input.spentUsd >= input.budgetUsd) {
    return { ok: false, reason: "daily_budget" };
  }
  return { ok: true };
}

// ─── Helper ──────────────────────────────────────────────────────────────────

/**
 * Returns the UTC day key for a given date in 'YYYY-MM-DD' format.
 * Exported for use in recordUsage and for unit testing.
 */
export function utcDayKey(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─── 3. DB-backed gate ───────────────────────────────────────────────────────

export interface BudgetGateResult {
  ok: boolean;
  reason?: "kill_switch" | "daily_budget" | "error";
}

export interface AssertBudgetDeps {
  /** Override to inject a stub in tests; defaults to real ChatDailyBudget read. */
  readSpendUsd?: () => Promise<number>;
  /** Override to inject a fixed "now" for tests. */
  now?: () => Date;
}

/**
 * DB-backed cost gate. Must be called before every model invocation.
 *
 * Fail-closed: any error (env misconfiguration, DB outage, etc.) returns
 * { ok: false, reason: 'error' } — a DB outage must NOT uncap spend.
 */
export async function assertWithinBudget(
  deps: AssertBudgetDeps = {}
): Promise<BudgetGateResult> {
  try {
    const killSwitch =
      (process.env.CHAT_KILL_SWITCH ?? "").toLowerCase() === "true";
    const parsed = parseFloat(process.env.CHAT_DAILY_TOKEN_BUDGET_USD ?? "5");
    const budgetUsd = Number.isFinite(parsed) ? parsed : 5;

    const now = deps.now ? deps.now() : new Date();
    const dayKey = utcDayKey(now);

    const readSpendUsd =
      deps.readSpendUsd ?? (async () => _readSpendUsdFromDb(dayKey));

    const spentUsd = await readSpendUsd();

    return evaluateBudget({ killSwitch, spentUsd, budgetUsd });
  } catch {
    // Fail closed — any error blocks the call rather than uncapping spend.
    return { ok: false, reason: "error" };
  }
}

/** Real DB read — separated so it can be replaced by a stub in tests. */
async function _readSpendUsdFromDb(dayKey: string): Promise<number> {
  const { default: connectDB } = await import("@/lib/mongodb");
  const { default: ChatDailyBudget } = await import(
    "@/models/ChatDailyBudget"
  );
  await connectDB();
  const doc = await ChatDailyBudget.findOne({ dayKey }).lean();
  return (doc as { spentUsd?: number } | null)?.spentUsd ?? 0;
}

// ─── 4. Usage recorder ───────────────────────────────────────────────────────

export interface RecordUsageDeps {
  /** Override to inject a stub in tests instead of writing to DB. */
  incrementSpend?: (
    dayKey: string,
    spentUsd: number,
    tokensIn: number,
    tokensOut: number
  ) => Promise<void>;
  now?: () => Date;
}

/**
 * Atomically records token usage + estimated cost for today's budget document.
 *
 * Best-effort: catches all errors and logs via console.error (never throws).
 * Note: console.log is stripped in production builds; console.error is not.
 */
export async function recordUsage(
  model: string,
  tokensIn: number,
  tokensOut: number,
  deps: RecordUsageDeps = {}
): Promise<void> {
  try {
    const costUsd = estimateCostUsd(model, tokensIn, tokensOut);
    const now = deps.now ? deps.now() : new Date();
    const dayKey = utcDayKey(now);

    const incrementSpend =
      deps.incrementSpend ?? _incrementSpendInDb;

    await incrementSpend(dayKey, costUsd, tokensIn, tokensOut);
  } catch (err) {
    // Best-effort — recording must never break a served response.
    console.error("[costGuard] recordUsage failed:", err);
  }
}

/** Real DB upsert — separated so it can be replaced by a stub in tests. */
async function _incrementSpendInDb(
  dayKey: string,
  spentUsd: number,
  tokensIn: number,
  tokensOut: number
): Promise<void> {
  const { default: connectDB } = await import("@/lib/mongodb");
  const { default: ChatDailyBudget } = await import(
    "@/models/ChatDailyBudget"
  );
  await connectDB();
  await ChatDailyBudget.findOneAndUpdate(
    { dayKey },
    {
      $inc: { spentUsd, tokensIn, tokensOut },
      $setOnInsert: { dayKey },
    },
    { upsert: true, new: true }
  );
}
