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
  // ── Cancel membership / stop auto-renewal (self-service) ─────────────────
  // NOTE: must appear BEFORE the "entries after cancellation" rule (faqId:7)
  // because these signals are more specific and should resolve to the how-to
  // cancel FAQ (id 18) rather than the entries-carry-forward FAQ (id 7).
  {
    faqId: "18",
    signals: [
      "how do i cancel",
      "how to cancel",
      "cancel my membership",
      "cancel membership",
      "cancel my subscription",
      "cancel subscription",
      "stop auto renewal",
      "stop auto-renewal",
      "stop autorenew",
      "stop auto renew",
      "turn off auto renewal",
      "turn off auto-renewal",
      "disable auto renewal",
      "disable auto-renewal",
      "unsubscribe",
      "how do i stop being charged",
      "stop being charged",
      "dont want to renew",
      "don t want to renew",
      "stop my membership",
      "end my membership",
      "end my subscription",
    ],
    // Exclude "entries if i cancel" — those should fall to faqId:7 further down
    excludes: ["entries if i cancel", "entries after cancel", "keep my entries", "entries carry"],
  },
  // ── Refund / money back (policy + escalation) ────────────────────────────
  // faqId 19 = the refund FAQ with ACL note + escalation path.
  // We re-map the core refund signals here; faqId:12 (the pure policy entry)
  // remains in the existing rule below for policy-only queries.
  {
    faqId: "19",
    signals: [
      "can i get a refund",
      "want a refund",
      "request a refund",
      "asking for a refund",
      "give me a refund",
      "i want my money back",
      "get my money back",
      "cancel and refund",
    ],
  },
  // ── Refund policy (informational) ────────────────────────────────────────
  {
    faqId: "12",
    signals: [
      "refund",
      "non-refundable",
      "money back",
      "refundable",
    ],
    // Exclude signals already captured by the targeted refund-escalation rule above
    excludes: ["can i get a refund", "want a refund", "request a refund", "give me a refund", "i want my money back", "get my money back"],
  },
  // ── Unexpected / unauthorised charge ──────────────────────────────────────
  {
    faqId: "21",
    signals: [
      "charged without my consent",
      "charged without consent",
      "didn t authorise",
      "didnt authorise",
      "did not authorise",
      "didn t authorize",
      "didnt authorize",
      "did not authorize",
      "unauthorised charge",
      "unauthorized charge",
      "unexpected charge",
      "unexpected renewal",
      "surprise charge",
      "why was i charged",
      "why did you charge me",
      "i didn t agree",
      "i didn t approve",
    ],
  },
  // ── Delete account / data ─────────────────────────────────────────────────
  {
    faqId: "20",
    signals: [
      "delete my account",
      "delete account",
      "close my account",
      "close account",
      "remove my account",
      "remove account",
      "delete my data",
      "delete my personal data",
      "right to erasure",
      "gdpr delete",
      "erase my data",
      "remove my data",
      "how do i delete",
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
  // Narrowed to entries-carry-forward signals only; pure cancel-intent signals
  // are handled above by the faqId:18 rule which appears earlier and takes priority.
  {
    faqId: "7",
    signals: [
      "entries carry forward",
      "keep my entries",
      "entries if i cancel",
      "what happens if i cancel",
      "entries after cancel",
      "what happens to my entries",
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
  // ── Upgrade membership ────────────────────────────────────────────────────
  {
    faqId: "22",
    signals: [
      "upgrade my membership",
      "upgrade my plan",
      "upgrade my subscription",
      "move to a higher tier",
      "switch to a higher tier",
      "how do i upgrade",
      "how to upgrade",
    ],
  },
  // ── Downgrade membership ──────────────────────────────────────────────────
  {
    faqId: "23",
    signals: [
      "downgrade my membership",
      "downgrade my plan",
      "downgrade my subscription",
      "move to a lower tier",
      "switch to a lower tier",
      "cheaper plan",
      "cheaper membership",
      "how do i downgrade",
      "how to downgrade",
    ],
  },
  // ── Restart / reactivate / resubscribe ───────────────────────────────────
  // NOTE: must appear AFTER cancel rule (faqId:18) so "restart" does not conflict.
  {
    faqId: "24",
    signals: [
      "restart my membership",
      "restart my subscription",
      "reactivate my membership",
      "reactivate my subscription",
      "resubscribe",
      "come back to tools australia",
      "rejoin tools australia",
      "how do i rejoin",
      "how do i come back",
      "how to reactivate",
    ],
  },
  // ── Pause membership ──────────────────────────────────────────────────────
  {
    faqId: "25",
    signals: [
      "pause my membership",
      "pause my subscription",
      "can i pause",
      "pause instead of cancel",
      "pause membership",
      "pause subscription",
    ],
  },
  // ── Entry promotions / bonus entries / double entries ─────────────────────
  // NOTE: "bonus entries" also appears in faqId:8 (how to get more entries).
  // These signals are more specific (promotions context) and appear later, so
  // the faqId:8 rule (which uses "bonus entries") takes priority for generic
  // "how do I get bonus entries" questions. The promo signals here fire only
  // when the question is specifically about promotions/deals/double-entry events.
  {
    faqId: "27",
    signals: [
      "entry promotions",
      "entry promotion",
      "double entries",
      "double entry weekend",
      "entry multiplier",
      "bonus entry deals",
      "bonus-entry deals",
      "do you run promotions",
      "run entry promotions",
      "promo deals",
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
  // Pad with single spaces so substring checks are word-boundary aware:
  // `" plans "` will NOT fire on "plans for the future" being a longer word, and
  // `" visa "` will NOT fire on "revisable". `normalise` already collapses runs
  // of whitespace to a single space, so a leading/trailing pad is sufficient to
  // anchor every token's boundaries. Multi-word phrase signals (e.g.
  // "when is the draw") and the bare price signals ($20/$40/$80) still match
  // because each is itself space-delimited after normalisation.
  const norm = ` ${normalise(question)} `;

  for (const rule of INTENT_RULES) {
    // Check excludes first (word-boundary aware, same padding rationale).
    const excluded = rule.excludes?.some((ex) => norm.includes(` ${ex} `)) ?? false;
    if (excluded) continue;

    // Check if any signal phrase appears as whole word(s) in the question.
    const signalled = rule.signals.some((sig) => norm.includes(` ${sig} `));
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
