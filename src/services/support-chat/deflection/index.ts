/**
 * deflection/index.ts
 *
 * Public API for the no-LLM deflection layer.
 *
 * Orchestrates two layers in order:
 *   1. Decision-tree (decisionTree.ts) — high-precision intent matching via
 *      phrase rules for the top ~15 support intents. Zero latency, zero cost.
 *   2. FAQ keyword search (faqSearch.ts) — broader cosine term-frequency
 *      match over all FAQ entries via retrieve.ts (lib). Falls back to
 *      `answered: false` below the confidence threshold.
 *
 * CRITICAL — no-drift / single source of truth:
 *   All answers returned here come from getFaqEntries() via decisionTree.ts
 *   / faqSearch.ts. No answer strings are stored or re-typed in this file.
 *   When the FAQ copy is updated, deflection answers update automatically.
 *
 * This module imports NO network-making code (no provider.ts, no ai SDK,
 * no fetch). It is fully offline and deterministic.
 *
 * Actor-independence note (Task 1.4 design decision):
 *   The brief mentions `tryDeflect(question, actor)`, but `ChatActor` is
 *   defined in Task 1.6 (withChatbot.ts). Phase 1 FAQ deflection is
 *   actor-independent — anonymous-vs-member gating happens at the
 *   route/withChatbot layer (Task 1.8), not inside deflection. This
 *   signature is therefore `tryDeflect(question: string)` with no actor
 *   param. If actor-specific answer variants are needed in the future
 *   (e.g., personalised entry counts), the signature can be extended then.
 */

import { matchIntent, resolveToFaqEntry } from "./decisionTree";
import { searchFaqLayer } from "./faqSearch";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DeflectionResult {
  answered: boolean;
  /** The canned answer text (only present when answered: true). */
  answer?: string;
  /**
   * Source references for the answer — mirrors the knowledge-pack `{id, title}`
   * shape. Only present when answered: true.
   */
  sources?: { id: string; title: string }[];
}

export interface DeflectOpts {
  minConfidence?: number;
  minMargin?: number;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Attempt to answer `question` without calling an LLM.
 *
 * Layer 1: decision-tree (high-precision intent rules, O(rules) string match).
 * Layer 2: keyword FAQ search (cosine similarity, O(entries) in-memory).
 *
 * Returns `{ answered: false }` when neither layer is confident enough,
 * signalling the caller (ChatService in Task 1.7) to fall through to the LLM.
 *
 * `opts` allows callers (e.g. offline calibration scripts) to override the
 * Layer-2 thresholds. Layer-1 intent matching is threshold-independent and
 * ignores opts. Production callers omit opts and get the defaults.
 *
 * This function is declared async (returns Promise) to satisfy the interface
 * contract — the caller treats it as async so Phase 3 can swap retrieve.ts
 * internals for an async Atlas $vectorSearch call without changing this
 * signature.
 */
export async function tryDeflect(
  question: string,
  opts: DeflectOpts = {}
): Promise<DeflectionResult> {
  // ── Layer 1: decision-tree ────────────────────────────────────────────────
  const intentMatch = matchIntent(question);
  if (intentMatch.matched) {
    const resolved = resolveToFaqEntry(intentMatch.faqId);
    if (resolved) {
      return {
        answered: true,
        answer: resolved.answer,
        sources: [resolved.source],
      };
    }
    // Defensive: FAQ id in rules but not found in getFaqEntries() — fall through.
  }

  // ── Layer 2: FAQ keyword search ───────────────────────────────────────────
  const searchResult = searchFaqLayer(question, opts);
  if (searchResult.answered) {
    return {
      answered: true,
      answer: searchResult.answer,
      sources: searchResult.sources,
    };
  }

  // ── No match — caller falls through to LLM ────────────────────────────────
  return { answered: false };
}
