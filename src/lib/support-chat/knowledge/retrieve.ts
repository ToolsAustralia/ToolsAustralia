/**
 * retrieve.ts
 *
 * Low-level FAQ search primitive consumed by the deflection service layer.
 *
 * Phase 1 — pure, offline, deterministic keyword/TF-IDF-inspired scoring
 * over the in-memory FAQ entries returned by getFaqEntries(). No network,
 * no DB, no embedding API call. Zero external dependencies.
 *
 * Stable interface contract (Phase 3 will swap internals for Atlas $vectorSearch
 * without changing callers):
 *   searchFaqs(query: string): RankedFaq[]
 *
 * Returns entries sorted by descending score; callers apply their own threshold.
 *
 * Why term-frequency overlap?
 *   Support traffic is power-law — the same ~200 questions appear ~80% of the
 *   time. A cosine-over-term-frequency approach is offline, ~0 latency, and
 *   good enough for FAQ-sized corpora (≤ 30 entries). Phase 3 replaces this
 *   function body with a $vectorSearch call while keeping the return shape.
 */

import { getFaqEntries, type FaqEntry } from "@/data/faqs";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RankedFaq {
  entry: FaqEntry;
  /** Cosine-like similarity score in [0, 1]. Higher is more relevant. */
  score: number;
}

// ─── Internals ────────────────────────────────────────────────────────────────

/** English stop-words to strip before scoring (reduces noise). */
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "can", "i", "my", "me", "we", "our",
  "you", "your", "it", "its", "this", "that", "what", "when", "where",
  "how", "who", "which", "there", "their", "they", "he", "she", "his",
  "her", "if", "not", "no", "so", "up", "out", "about", "into", "get",
  "also", "just", "some", "any", "all", "than", "more",
]);

/**
 * Tokenise a string: lowercase, remove punctuation, split on whitespace,
 * filter stop words.
 */
function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/** Term-frequency map for a token list. */
function termFreq(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) ?? 0) + 1);
  }
  return tf;
}

/**
 * Cosine similarity between two term-frequency vectors.
 * Returns 0 if either vector is empty.
 */
function cosine(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 || b.size === 0) return 0;

  let dot = 0;
  for (const [term, freqA] of a) {
    const freqB = b.get(term);
    if (freqB !== undefined) dot += freqA * freqB;
  }

  const magA = Math.sqrt([...a.values()].reduce((s, v) => s + v * v, 0));
  const magB = Math.sqrt([...b.values()].reduce((s, v) => s + v * v, 0));

  return dot / (magA * magB);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Search the in-memory FAQ corpus for entries relevant to `query`.
 *
 * Scores both the FAQ question AND the answer text (answer weighted slightly
 * lower — the question text is more intent-aligned). Returns all entries with
 * a score > 0, sorted descending.
 *
 * Phase 3 contract: replace this function body with an Atlas $vectorSearch
 * call returning the same `RankedFaq[]` shape. Callers are unaffected.
 */
export function searchFaqs(query: string): RankedFaq[] {
  const queryTokens = tokenise(query);
  if (queryTokens.length === 0) return [];

  const queryTf = termFreq(queryTokens);
  const entries = getFaqEntries();

  const ranked: RankedFaq[] = entries
    .map((entry) => {
      const questionTf = termFreq(tokenise(entry.question));
      const answerTf = termFreq(tokenise(entry.answer));

      // Score = weighted average: question similarity × 0.7 + answer similarity × 0.3
      // Question text is closer to the user's intent phrasing.
      const score = cosine(queryTf, questionTf) * 0.7 + cosine(queryTf, answerTf) * 0.3;
      return { entry, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked;
}
