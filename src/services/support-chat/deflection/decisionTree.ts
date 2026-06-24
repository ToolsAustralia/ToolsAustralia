/**
 * decisionTree.ts
 *
 * High-precision intent matching layer (Layer 1 of deflection).
 *
 * Maps a small set of top-volume support intents to specific FAQ entry IDs
 * using lightweight keyword/phrase rules. Fires ONLY when the signal is
 * strong enough that we can be confident the canonical FAQ entry answers the
 * question exactly — no false positives.
 *
 * Resolution contract:
 *   - Each intent resolves to a specific FAQ entry by its `id`.
 *   - The returned answer text comes from getFaqEntries() — never re-typed here.
 *     This preserves the single source of truth and prevents drift when FAQ
 *     copy is updated.
 *
 * Why a decision-tree first?
 *   The ~15-25 highest-volume intents ("when is the draw", "what does it cost",
 *   "can I get a refund") are extremely predictable. Matching them with a fast
 *   rule-set before any ML step means zero latency and zero per-call cost for
 *   the majority of support traffic.
 */

import { getFaqEntries } from "@/data/faqs";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DecisionTreeResult =
  | { matched: true; faqId: string }
  | { matched: false };

// ─── Intent rules ─────────────────────────────────────────────────────────────

/**
 * A rule: if the normalised question contains ANY of the `signals` and NONE
 * of the `excludes`, resolve to `faqId`.
 *
 * Signals are full-word substring matches (applied after lowercasing and
 * stripping punctuation). Order matters — first matching rule wins.
 */
interface IntentRule {
  /** FAQ entry id to resolve to on match. */
  faqId: string;
  /** At least one of these token groups must appear (each group = contiguous phrase). */
  signals: string[];
  /** If any of these phrases appear, reject this rule even if a signal matched. */
  excludes?: string[];
}

const INTENT_RULES: IntentRule[] = [
  // ── Draw timing ────────────────────────────────────────────────────────────
  {
    faqId: "2",
    signals: [
      "when is the draw",
      "when does the draw",
      "draw date",
      "draw time",
      "major draw when",
      "when draw happens",
      "next draw",
      "draw on the 27th",
      "27th draw",
    ],
  },
  // ── What can I win / prizes ────────────────────────────────────────────────
  {
    faqId: "3",
    signals: [
      "what can i win",
      "what do i win",
      "prize",
      "what is the prize",
      "grand prize",
      "cash prize",
      "prize value",
      "prize worth",
      "how much can i win",
    ],
  },
  // ── Membership pricing / tiers ────────────────────────────────────────────
  {
    faqId: "4",
    signals: [
      "how much does",
      "how much is",
      "membership cost",
      "membership price",
      "membership fee",
      "subscription cost",
      "subscription price",
      "how much to join",
      "what does it cost",
      "tradie plan",
      "foreman plan",
      "boss plan",
      "pricing",
      "tiers",
      "plans",
      "$20",
      "$40",
      "$80",
      "monthly cost",
    ],
    // exclude pure refund questions that also mention cost
    excludes: ["refund"],
  },
  // ── One-time packs ────────────────────────────────────────────────────────
  {
    faqId: "5",
    signals: [
      "one-time pack",
      "one time pack",
      "without subscription",
      "no subscription",
      "without a membership",
      "apprentice pack",
      "vip pack",
      "buy entries without",
      "single purchase",
    ],
  },
  // ── Mini draws ───────────────────────────────────────────────────────────
  {
    faqId: "6",
    signals: [
      "mini draw",
      "mini draws",
      "what are mini draws",
      "how do mini draws work",
    ],
  },
  // ── Refund policy ────────────────────────────────────────────────────────
  {
    faqId: "12",
    signals: [
      "refund",
      "get my money back",
      "cancel and refund",
      "non-refundable",
      "money back",
      "refundable",
    ],
  },
  // ── Subscription renewal date ─────────────────────────────────────────────
  {
    faqId: "11",
    signals: [
      "when does my subscription renew",
      "renewal date",
      "when will i be charged",
      "billing date",
      "charged on the 24th",
      "renew on the 24th",
    ],
  },
  // ── Failed payment ───────────────────────────────────────────────────────
  {
    faqId: "13",
    signals: [
      "payment failed",
      "payment declined",
      "renewal failed",
      "my card was declined",
      "past due",
      "failed payment",
      "retry payment",
    ],
  },
  // ── Eligibility ──────────────────────────────────────────────────────────
  {
    faqId: "9",
    signals: [
      "who can enter",
      "eligibility",
      "eligible to enter",
      "who is eligible",
      "can i enter",
      "act excluded",
      "south australia excluded",
      "age requirement",
      "must be 18",
      "age to enter",
    ],
  },
  // ── Partner discounts ─────────────────────────────────────────────────────
  {
    faqId: "16",
    signals: [
      "partner discount",
      "partner discounts",
      "partner brand",
      "member discount",
      "discounts for members",
      "brand discount",
      "partner access",
    ],
  },
  // ── What is Tools Australia ───────────────────────────────────────────────
  {
    faqId: "1",
    signals: [
      "what is tools australia",
      "what is this",
      "how does tools australia work",
      "how does it work",
      "about tools australia",
      "what do you do",
    ],
  },
  // ── Entries / how to get more ─────────────────────────────────────────────
  {
    faqId: "8",
    signals: [
      "more entries",
      "boost my entries",
      "increase my entries",
      "how to get more entries",
      "buy more entries",
      "referral entries",
      "bonus entries",
      "promo code entries",
    ],
  },
  // ── Entries after cancellation ────────────────────────────────────────────
  {
    faqId: "7",
    signals: [
      "entries carry forward",
      "keep my entries",
      "entries if i cancel",
      "cancel my subscription",
      "what happens if i cancel",
      "entries after cancel",
    ],
  },
  // ── Payment methods ───────────────────────────────────────────────────────
  {
    faqId: "10",
    signals: [
      "payment method",
      "payment methods",
      "how to pay",
      "accepted payment",
      "credit card",
      "debit card",
      "visa",
      "mastercard",
      "do you accept",
    ],
  },
  // ── Rewards points ────────────────────────────────────────────────────────
  {
    faqId: "14",
    signals: [
      "rewards points",
      "how do rewards",
      "points work",
      "earn points",
      "redeem points",
    ],
  },
];

// ─── Normaliser ───────────────────────────────────────────────────────────────

/** Normalise a question string for rule matching. */
function normalise(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9\s$]/g, " ").replace(/\s+/g, " ").trim();
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Try to match the question against the high-precision intent rules.
 *
 * Returns `{ matched: true, faqId }` when a rule fires, else `{ matched: false }`.
 * The caller resolves `faqId` to a FAQ entry via getFaqEntries() — answers are
 * never stored in this file.
 */
export function matchIntent(question: string): DecisionTreeResult {
  const norm = normalise(question);

  for (const rule of INTENT_RULES) {
    // Check excludes first.
    const excluded = rule.excludes?.some((ex) => norm.includes(ex)) ?? false;
    if (excluded) continue;

    // Check if any signal phrase appears in the normalised question.
    const signalled = rule.signals.some((sig) => norm.includes(sig));
    if (signalled) {
      return { matched: true, faqId: rule.faqId };
    }
  }

  return { matched: false };
}

/**
 * Resolve a matched FAQ id to its entry answer text + source metadata.
 * Returns `null` if the id is not found (defensive; should not happen in prod).
 */
export function resolveToFaqEntry(faqId: string): {
  answer: string;
  source: { id: string; title: string };
} | null {
  const entry = getFaqEntries().find((e) => e.id === faqId);
  if (!entry) return null;
  return {
    answer: entry.answer,
    source: { id: entry.id, title: entry.question },
  };
}
