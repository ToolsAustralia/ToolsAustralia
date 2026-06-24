/**
 * support-chat/provider.ts
 *
 * Single source of truth for model construction and fallback logic.
 * Every model call in the support-chat feature goes through getChatModel()
 * or withModelFallback() — the model choice and fallback chain live here only,
 * so callers are unaffected by provider changes.
 *
 * Phase 2 — Amazon Bedrock (ap-southeast-2, Sydney):
 *   Member-PII inference MUST run onshore under APP 8. Set CHAT_PROVIDER=bedrock
 *   (plus AWS creds + region env vars) after completing the PIA to activate the
 *   Bedrock branch. Until then, the default is 'anthropic' and member tools stay
 *   dormant (see memberToolsEnabled() below).
 *
 *   Bedrock model IDs (CHAT_BEDROCK_MODEL_PRIMARY / CHAT_BEDROCK_MODEL_ESCALATION)
 *   must be set to in-region inference-profile IDs for ap-southeast-2 (Sydney).
 *   Example format: "apac.anthropic.claude-haiku-4-5-..." cross-region profile.
 *   NOTE: Haiku 4.5 availability in ap-southeast-2 is UNVERIFIED at time of
 *   writing. If it is not available, use Sonnet 4.6 as the confirmed in-region
 *   fallback (e.g. "apac.anthropic.claude-sonnet-4-6-..."). Confirm the exact
 *   model IDs with the AWS console / Bedrock Model Catalog before going live.
 *
 *   AWS credentials (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION) are
 *   read from env by @ai-sdk/amazon-bedrock automatically via the standard AWS
 *   credential chain — do NOT add a custom AWS client here.
 */

import { anthropic } from "@ai-sdk/anthropic";
import { bedrock } from "@ai-sdk/amazon-bedrock";
import { APICallError } from "@ai-sdk/provider";
import type { LanguageModel } from "ai";

// ─── Model ID defaults (Anthropic first-party) ────────────────────────────────

const DEFAULT_PRIMARY_MODEL = "claude-haiku-4-5";
const DEFAULT_ESCALATION_MODEL = "claude-sonnet-4-6";

// ─── Provider selection ───────────────────────────────────────────────────────

/**
 * Returns the active chat provider.
 * Reads CHAT_PROVIDER from env; any value other than 'bedrock' → 'anthropic'.
 * Default: 'anthropic' (Phase 1 first-party API).
 * Set to 'bedrock' (+ AWS creds + CHAT_BEDROCK_MODEL_* ids) to activate the
 * Phase 2 onshore-residency branch.
 */
export function getChatProvider(): "anthropic" | "bedrock" {
  return process.env.CHAT_PROVIDER === "bedrock" ? "bedrock" : "anthropic";
}

/**
 * Residency safety gate for member-PII tools.
 *
 * Returns true ONLY when the active provider is Amazon Bedrock (ap-southeast-2,
 * Sydney), which is the only onshore inference path that satisfies APP 8 for
 * member PII.
 *
 * ALL member-account tools (get_my_membership, get_my_entries, etc.) MUST check
 * this gate before executing. If false, the tools must refuse and remain dormant
 * regardless of actor.kind — member PII must never reach the offshore
 * first-party Anthropic API.
 *
 * This gate becomes true only after the owner sets CHAT_PROVIDER=bedrock plus
 * valid AWS credentials and in-region Bedrock model IDs, which should only
 * happen after completing a Privacy Impact Assessment (PIA).
 */
export function memberToolsEnabled(): boolean {
  return getChatProvider() === "bedrock";
}

// ─── Provider deps (injectable for tests) ────────────────────────────────────

/**
 * Injectable factories for getChatModel.
 * Tests inject stubs that return fake LanguageModels with no real API calls.
 * Production uses the module-level `anthropic` and `bedrock` instances which
 * read credentials from env automatically.
 */
export interface ChatModelDeps {
  /** Factory for the first-party Anthropic provider. Defaults to `anthropic`. */
  anthropic?: (modelId: string) => LanguageModel;
  /** Factory for the Amazon Bedrock provider. Defaults to `bedrock`. */
  bedrock?: (modelId: string) => LanguageModel;
}

/**
 * Injectable factory used by withModelFallback.
 * The default delegates to getChatModel; tests inject a stub.
 */
export type GetModelFn = (tier: "primary" | "escalation") => LanguageModel;

// ─── getChatModel ────────────────────────────────────────────────────────────

/**
 * Returns an AI SDK LanguageModel for the given tier.
 *
 * When CHAT_PROVIDER=anthropic (default):
 *   Model IDs from CHAT_MODEL_PRIMARY (default: claude-haiku-4-5)
 *   and CHAT_MODEL_ESCALATION (default: claude-sonnet-4-6).
 *   Reads ANTHROPIC_API_KEY from env automatically.
 *
 * When CHAT_PROVIDER=bedrock:
 *   Model IDs from CHAT_BEDROCK_MODEL_PRIMARY and CHAT_BEDROCK_MODEL_ESCALATION
 *   (no defaults — owner MUST set these to in-region ap-southeast-2 inference
 *   profile IDs before going live; see file header comment for details).
 *   Reads AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION from env
 *   automatically via the standard AWS credential chain.
 *
 * @param tier  'primary' for the cheap triage model; 'escalation' for hard cases.
 * @param deps  Optional factory overrides for unit tests (no real API calls).
 */
export function getChatModel(
  tier: "primary" | "escalation",
  deps?: ChatModelDeps
): LanguageModel {
  const provider = getChatProvider();

  if (provider === "bedrock") {
    const modelId =
      tier === "primary"
        ? process.env.CHAT_BEDROCK_MODEL_PRIMARY
        : process.env.CHAT_BEDROCK_MODEL_ESCALATION;

    if (!modelId) {
      throw new Error(
        `CHAT_BEDROCK_MODEL_${tier === "primary" ? "PRIMARY" : "ESCALATION"} is not set. ` +
          "Set this to the in-region ap-southeast-2 Bedrock inference profile ID before using CHAT_PROVIDER=bedrock."
      );
    }

    const bedrockFn = deps?.bedrock ?? bedrock;
    return bedrockFn(modelId);
  }

  // Default: first-party Anthropic API.
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
