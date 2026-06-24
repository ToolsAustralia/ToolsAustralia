/**
 * support-chat/provider.ts
 *
 * Single source of truth for model construction and fallback logic.
 * Every model call in the support-chat feature goes through getChatModel()
 * or withModelFallback() — the model choice and fallback chain live here only,
 * so Phase 2 can add an Amazon Bedrock branch without touching callers.
 *
 * Phase 2 note — Amazon Bedrock (ap-southeast-2, Sydney):
 *   To keep authenticated per-user tool calls onshore under APP 8, add a
 *   `bedrock(...)` branch here using the `@ai-sdk/amazon-bedrock` provider.
 *   Model IDs (e.g. `anthropic.claude-haiku-4-5-...`) and credentials differ
 *   from the first-party API; everything else (streamText / generateText call
 *   sites, withModelFallback, costGuard) is unchanged. Wire the branch behind
 *   a `CHAT_PROVIDER=bedrock` env flag and the interface stays identical.
 */

import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { APICallError } from "@ai-sdk/provider";
import type { LanguageModel } from "ai";

// ─── Model ID defaults ────────────────────────────────────────────────────────

const DEFAULT_PRIMARY_MODEL = "claude-haiku-4-5";
const DEFAULT_ESCALATION_MODEL = "claude-sonnet-4-6";

// ─── Provider deps (injectable for tests) ────────────────────────────────────

/**
 * Injectable factory used by getChatModel and withModelFallback.
 * The default uses the global `anthropic` instance which reads
 * ANTHROPIC_API_KEY from env automatically.
 * Tests inject a stub that returns a fake LanguageModel with no real calls.
 */
export type GetModelFn = (tier: "primary" | "escalation") => LanguageModel;

// ─── getChatModel ────────────────────────────────────────────────────────────

/**
 * Returns an AI SDK LanguageModel for the given tier.
 *
 * Model IDs are read from env:
 *   CHAT_MODEL_PRIMARY      default: claude-haiku-4-5
 *   CHAT_MODEL_ESCALATION   default: claude-sonnet-4-6
 *
 * The `anthropic()` call reads ANTHROPIC_API_KEY from env automatically.
 * To use a custom API key or base URL, set ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL
 * in env — or call createAnthropic({ apiKey }) and swap out this module.
 */
export function getChatModel(tier: "primary" | "escalation"): LanguageModel {
  const modelId =
    tier === "primary"
      ? (process.env.CHAT_MODEL_PRIMARY ?? DEFAULT_PRIMARY_MODEL)
      : (process.env.CHAT_MODEL_ESCALATION ?? DEFAULT_ESCALATION_MODEL);

  // anthropic(modelId) is the simplest call site; reads ANTHROPIC_API_KEY from env.
  return anthropic(modelId);
}

// ─── isFallbackEligibleError ─────────────────────────────────────────────────

/**
 * Returns true for transient / overload / refusal errors where retrying on a
 * different model tier may succeed.
 *
 * Eligible:
 *   - APICallError with status 429 (rate limit) or 529 (Anthropic overloaded)
 *   - Any error whose message includes "overloaded" (Anthropic's prose message)
 *   - Any error whose message includes "refusal" (stop_reason: "refusal" surfaced as an error)
 *
 * NOT eligible (re-throw immediately, no retry):
 *   - 400 bad request — same input will fail again
 *   - 401 / 403 auth errors — wrong key, won't help to retry on another tier
 *   - Any other non-transient error
 *
 * Exported for unit testing without a live API call.
 */
export function isFallbackEligibleError(err: unknown): boolean {
  if (APICallError.isInstance(err)) {
    const status = err.statusCode;
    if (status === 429 || status === 529) return true;
    // Some providers surface overload as a 5xx with "overloaded" in the body
    const msg = (err.message ?? "").toLowerCase();
    if (msg.includes("overloaded")) return true;
    // Non-transient: 400 bad request, 401 auth, 403 forbidden, etc. → don't retry
    return false;
  }

  // Non-APICallError: check message for overloaded/refusal indicators
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("overloaded")) return true;
    if (msg.includes("refusal")) return true;
  }

  return false;
}

// ─── withModelFallback ────────────────────────────────────────────────────────

export interface ModelFallbackOpts {
  /**
   * Injectable model factory. Defaults to getChatModel.
   * Override in tests to return stubs without a real API key.
   */
  getModel?: GetModelFn;
}

/**
 * Calls fn(primary model) and, on a fallback-eligible error, retries once
 * with the escalation model.
 *
 * Non-eligible errors (400, auth, etc.) are re-thrown immediately — no
 * pointless retry that would also fail.
 *
 * @param fn        Async function that receives the LanguageModel and tier label.
 * @param opts      Optional: inject a getModel stub for unit tests.
 */
export async function withModelFallback<T>(
  fn: (model: LanguageModel, tier: "primary" | "escalation") => Promise<T>,
  opts: ModelFallbackOpts = {}
): Promise<T> {
  const getModel = opts.getModel ?? getChatModel;

  try {
    return await fn(getModel("primary"), "primary");
  } catch (primaryErr) {
    if (!isFallbackEligibleError(primaryErr)) {
      // Non-transient — rethrow without retrying (a retry won't help).
      throw primaryErr;
    }
    // Eligible error: try once on the escalation tier.
    return await fn(getModel("escalation"), "escalation");
  }
}
