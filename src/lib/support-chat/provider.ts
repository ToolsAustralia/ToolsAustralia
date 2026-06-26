/**
 * support-chat/provider.ts
 *
 * Single source of truth for model construction and fallback logic.
 * Every model call in the support-chat feature goes through getChatModel()
 * or withModelFallback() — the model choice and fallback chain live here only,
 * so callers are unaffected by provider changes.
 *
 * This bot is FAQ-only (Phase 1). Member account tools and Amazon Bedrock
 * integration have been removed per owner decision. All inference runs via
 * the first-party Anthropic API or Google Gemini API, controlled by the
 * activeProvider setting in the ChatSettings collection.
 */

import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { APICallError } from "@ai-sdk/provider";
import type { LanguageModel } from "ai";

// ─── Model ID defaults ────────────────────────────────────────────────────────

const DEFAULT_PRIMARY_MODEL = "claude-haiku-4-5";
const DEFAULT_ESCALATION_MODEL = "claude-sonnet-4-6";

const DEFAULT_GOOGLE_PRIMARY = "gemini-2.5-flash-lite";
const DEFAULT_GOOGLE_ESCALATION = "gemini-2.5-flash";

// ─── Provider deps (injectable for tests) ────────────────────────────────────

/**
 * Injectable factories for getChatModel.
 * Tests inject stubs that return fake LanguageModels with no real API calls.
 * Production uses the module-level `anthropic` / `google` instances which
 * read credentials from env automatically.
 */
export interface ChatModelDeps {
  /** Factory for the first-party Anthropic provider. Defaults to `anthropic`. */
  anthropic?: (modelId: string) => LanguageModel;
  /** Factory for the Google Gemini provider. Defaults to `google`. */
  google?: (modelId: string) => LanguageModel;
}

/**
 * Injectable factory used by withModelFallback.
 * The default delegates to getChatModel; tests inject a stub.
 */
export type GetModelFn = (tier: "primary" | "escalation") => LanguageModel;

// ─── getChatModel ────────────────────────────────────────────────────────────

/**
 * Returns an AI SDK LanguageModel for the given tier and provider.
 *
 * Anthropic model IDs from CHAT_MODEL_PRIMARY (default: claude-haiku-4-5)
 * and CHAT_MODEL_ESCALATION (default: claude-sonnet-4-6).
 *
 * Google model IDs from CHAT_GOOGLE_MODEL_PRIMARY (default: gemini-2.5-flash-lite)
 * and CHAT_GOOGLE_MODEL_ESCALATION (default: gemini-2.5-flash).
 *
 * @param tier      'primary' for the cheap triage model; 'escalation' for hard cases.
 * @param provider  'anthropic' (default) or 'google'.
 * @param deps      Optional factory overrides for unit tests (no real API calls).
 */
export function getChatModel(
  tier: "primary" | "escalation",
  provider: "anthropic" | "google" = "anthropic",
  deps?: ChatModelDeps
): LanguageModel {
  if (provider === "google") {
    const modelId =
      tier === "primary"
        ? (process.env.CHAT_GOOGLE_MODEL_PRIMARY ?? DEFAULT_GOOGLE_PRIMARY)
        : (process.env.CHAT_GOOGLE_MODEL_ESCALATION ?? DEFAULT_GOOGLE_ESCALATION);
    const googleFn = deps?.google ?? google;
    return googleFn(modelId);
  }

  // anthropic (default)
  const modelId =
    tier === "primary"
      ? (process.env.CHAT_MODEL_PRIMARY ?? DEFAULT_PRIMARY_MODEL)
      : (process.env.CHAT_MODEL_ESCALATION ?? DEFAULT_ESCALATION_MODEL);

  const anthropicFn = deps?.anthropic ?? anthropic;
  return anthropicFn(modelId);
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
  const getModel = opts.getModel ?? ((tier: "primary" | "escalation") => getChatModel(tier));

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
