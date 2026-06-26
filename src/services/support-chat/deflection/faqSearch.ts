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
 *   - TF-IDF cosine similarity (retrieve.ts), so ubiquitous words ("entries",
 *     "membership") are down-weighted and don't pull a query to the wrong entry.
 *   - High-precision by design: a missed deflection costs one cheap, grounded LLM
 *     call; a WRONG deflection is a confidently-wrong canned answer with no model
 *     in the loop. So we prefer to abstain when unsure.
 *   - MIN_CONFIDENCE is the floor; MIN_MARGIN abstains when the top two candidates
 *     both clear the floor and are near-tied (ambiguous topic). The decision-tree
 *     (Layer-1) owns the obvious intents, so this layer covers the fuzzy tail.
 *   - These values (0.18 / 0.05) were set against the regression routes in
 *     deflection.test.ts; calibrate them on the full golden set via
 *     `npm run eval:chat` (Phase-3 follow-up), and re-tune if a vector backend
 *     replaces retrieve.ts.
 */

import { searchFaqs } from "@/lib/support-chat/knowledge/retrieve";

// ─── Config ───────────────────────────────────────────────────────────────────

/**
 * Minimum TF-IDF cosine score for a FAQ match to be accepted.
 * Below this → `answered: false` (falls through to the grounded LLM).
 *
 * Deflection is intentionally HIGH-precision: a missed deflection just costs one
 * cheap LLM call (and the LLM is itself grounded on the knowledge pack), whereas
 * a wrong deflection is a confidently-wrong canned answer with no model in the
 * loop to catch it. So we prefer to abstain when unsure. (Full golden-set
 * calibration of this bar is the Phase-3 follow-up; `npm run eval:chat`.)
 */
const MIN_CONFIDENCE = 0.18;

/**
 * Minimum lead the top match must have over the runner-up when BOTH clear the
 * floor. Two near-tied candidates mean the query is ambiguous between topics —
 * returning either verbatim would be a coin-flip, so we abstain and let the
 * grounded LLM disambiguate instead of guessing.
 */
const MIN_MARGIN = 0.05;

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

  // Ambiguity guard: if the runner-up also clears the floor and is within
  // MIN_MARGIN of the top, the query doesn't clearly belong to one FAQ — abstain
  // and let the grounded LLM decide rather than serve a coin-flip canned answer.
  const second = ranked[1];
  if (second && second.score >= MIN_CONFIDENCE && best.score - second.score < MIN_MARGIN) {
    return { answered: false };
  }

  return {
    answered: true,
    answer: best.entry.answer,
    sources: [{ id: best.entry.id, title: best.entry.question }],
  };
}
