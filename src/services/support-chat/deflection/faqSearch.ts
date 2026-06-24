/**
 * faqSearch.ts
 *
 * Broader keyword-match FAQ search layer (Layer 2 of deflection).
 *
 * Called when the decision-tree (Layer 1) finds no high-precision intent match.
 * Uses `retrieve.ts` (lib layer) to score all FAQ entries against the query and
 * returns the best match if its score meets the confidence threshold.
 *
 * Confidence threshold rationale:
 *   - Cosine similarity over term-frequencies.
 *   - In empirical testing on the 17-entry Tools Australia FAQ corpus, genuine
 *     matches (e.g. "pricing" → tiers question) score ≥ 0.25, while off-topic
 *     questions (weather, geography, cooking) score < 0.10.
 *   - 0.15 was chosen as the threshold: it is well above the observed off-topic
 *     noise floor (≤ 0.05 for unrelated questions), and low enough to catch
 *     paraphrased FAQ questions that share only 1-2 content words with the
 *     entry's question text.
 *   - The decision-tree already handles the ≥ 0.40 "obvious" cases, so this
 *     layer only needs to be correct in the 0.15–0.40 zone.
 *   - If a Phase 3 vector backend replaces retrieve.ts, the threshold value
 *     should be re-tuned against the embedding similarity distribution.
 */

import { searchFaqs } from "@/lib/support-chat/knowledge/retrieve";

// ─── Config ───────────────────────────────────────────────────────────────────

/**
 * Minimum cosine similarity score for a FAQ match to be accepted.
 * Below this threshold → `answered: false` (falls through to LLM).
 * See module docstring for derivation.
 */
const MIN_CONFIDENCE = 0.15;

// ─── Types ────────────────────────────────────────────────────────────────────

export type FaqSearchResult =
  | { answered: true; answer: string; sources: { id: string; title: string }[] }
  | { answered: false };

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Search the FAQ corpus for an answer to `query`.
 *
 * Returns `{ answered: true, answer, sources }` when the best match score
 * meets MIN_CONFIDENCE. The answer text is taken directly from the matched
 * FAQ entry — never paraphrased — so callers always receive a grounded,
 * approved canned answer.
 *
 * Returns `{ answered: false }` when no match is confident enough.
 */
export function searchFaqLayer(query: string): FaqSearchResult {
  const ranked = searchFaqs(query);

  if (ranked.length === 0) return { answered: false };

  const best = ranked[0];
  if (best.score < MIN_CONFIDENCE) return { answered: false };

  return {
    answered: true,
    answer: best.entry.answer,
    sources: [{ id: best.entry.id, title: best.entry.question }],
  };
}
