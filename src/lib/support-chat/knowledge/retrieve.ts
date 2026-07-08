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
 *   time. A cosine-over-TF-IDF approach is offline, ~0 latency, and good enough
 *   for FAQ-sized corpora (currently ~38 entries). Phase 3 replaces this
 *   function body with a $vectorSearch call while keeping the return shape.
 */

import { getSupportChatFaqEntries } from "@/data/supportChatFaqs";
import type { FaqEntry } from "@/data/faqs";

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
 *
 * Note: this strips `$`, so bare price tokens ("$20") never survive into Layer-2
 * cosine. That is intentional — the decisionTree (Layer-1) keeps `$` and owns the
 * bare-price signals ($20/$40/$80 → id4), and Layer-1 runs first. Keep the two
 * tokenisers' punctuation rules in mind if you add price-shaped Layer-2 matching.
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
 * Inverse document frequency over the FAQ corpus.
 *
 * Why this exists: the previous scorer was raw term-frequency cosine — every
 * shared word counted equally, so ubiquitous domain words ("entries",
 * "membership", "tier", "subscription") dominated and pulled queries to the
 * WRONG FAQ (a query sharing one common word with an off-topic entry scored
 * high). Weighting each term by IDF down-weights words that appear in many
 * entries and rewards the rare, discriminating words that actually signal
 * intent — the standard TF-IDF correction. Smoothed so every IDF is > 0.
 *
 * A "document" = one FAQ entry's combined question + answer tokens. Computed
 * once per searchFaqs() call (corpus is tiny: ≤ ~40 entries).
 */
function buildIdf(entries: FaqEntry[]): { idf: Map<string, number>; fallback: number } {
  const n = entries.length;
  const df = new Map<string, number>();
  for (const e of entries) {
    const terms = new Set([...tokenise(e.question), ...tokenise(e.answer)]);
    for (const t of terms) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const idf = new Map<string, number>();
  for (const [t, d] of df) idf.set(t, Math.log((n + 1) / (d + 1)) + 1);
  // A query term absent from the corpus gets the max IDF (rarest possible). It
  // contributes nothing to any dot product (no doc has it), so it only affects
  // the query vector's magnitude — correct behaviour.
  const fallback = Math.log((n + 1) / 1) + 1;
  return { idf, fallback };
}

/** Weight a term-frequency map by IDF, producing a TF-IDF vector. */
function tfidf(
  tf: Map<string, number>,
  idf: Map<string, number>,
  fallback: number
): Map<string, number> {
  const v = new Map<string, number>();
  for (const [t, f] of tf) {
    v.set(t, f * (idf.get(t) ?? fallback));
  }
  return v;
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

  const entries = getSupportChatFaqEntries();
  const { idf, fallback } = buildIdf(entries);

  const queryVec = tfidf(termFreq(queryTokens), idf, fallback);

  const ranked: RankedFaq[] = entries
    .map((entry) => {
      const questionVec = tfidf(termFreq(tokenise(entry.question)), idf, fallback);
      const answerVec = tfidf(termFreq(tokenise(entry.answer)), idf, fallback);

      // Score = weighted average: question similarity × 0.7 + answer similarity × 0.3.
      // Question text is closer to the user's intent phrasing. Cosine over TF-IDF
      // vectors keeps scores in [0, 1] while discounting ubiquitous words.
      const score =
        cosine(queryVec, questionVec) * 0.7 + cosine(queryVec, answerVec) * 0.3;
      return { entry, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked;
}
