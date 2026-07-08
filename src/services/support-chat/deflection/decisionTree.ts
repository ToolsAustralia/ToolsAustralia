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

import { getSupportChatFaqEntries } from "@/data/supportChatFaqs";

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
  // ══ Account-specific, result, and escalation intents ════════════════════════
  // Placed FIRST so a precise account/result/escalation phrase wins over the broad
  // topic rules below — e.g. "did i win" must beat the "prize" catalog rule (id3),
  // and "where are my entries" must beat "get more entries" (id8). Account-aware
  // entries (29/30/31/37) route the user to My Account; they never recite data.

  // Did I win / draw results — MUST precede prizes (id3)
  {
    faqId: "31",
    signals: [
      "did i win",
      "have i won",
      "did we win",
      "was i the winner",
      "am i the winner",
      "draw result",
      "draw results",
      "results of the draw",
      "who won the draw",
      "who won the major draw",
      "who won this month",
      "winner announced",
      "check the result",
      "check if i won",
      "where are the results",
      "see the results",
    ],
  },
  // Talk to a human / prize fulfilment / duplicate charge — escalation routes.
  // MUST precede prizes (id3, prize-fulfilment) and unexpected-charge (id21, dup charge).
  {
    faqId: "38",
    signals: [
      "talk to a human",
      "speak to a human",
      "talk to a person",
      "speak to a person",
      "real person",
      "talk to someone",
      "speak to someone",
      "human support",
      "live agent",
      "customer service",
      "contact support",
      "talk to support",
      "speak to support",
      "human agent",
      // prize fulfilment — a winner chasing their prize needs a human, not the catalog
      "where is my prize",
      "where s my prize",
      "claim my prize",
      "collect my prize",
      "receive my prize",
      "when do i get my prize",
      // duplicate / double charge — a billing dispute needs a human, not the auto-renew explainer
      "charged twice",
      "charged me twice",
      "double charged",
      "charged double",
      "two charges",
      "duplicate charge",
      "charged again",
      // prize fulfilment disputes — confirmed winners chasing / damaged prize need a human
      "received my prize",
      "haven t received my prize",
      "not received my prize",
      "never received my prize",
      "prize arrived broken",
      "prize is broken",
      "broken prize",
      "damaged prize",
      "prize arrived damaged",
      // post-cancellation billing disputes
      "charged after i cancelled",
      "charged after cancelling",
      "charged me after i cancelled",
    ],
  },
  // Where can I see my entries / how many do I have — account lookup (precede id8/id7)
  {
    faqId: "29",
    signals: [
      "where can i see my entries",
      "where are my entries",
      "where do i see my entries",
      "see my entries",
      "view my entries",
      "check my entries",
      "how many entries do i have",
      "my entry count",
      "my current entries",
      "number of entries i have",
    ],
    excludes: ["more", "carry", "buy", "cancel"],
  },
  // What tier / plan am I on — account lookup (precede pricing id4 + up/downgrade)
  {
    faqId: "30",
    signals: [
      "what tier am i on",
      "what tier am i",
      "which tier am i",
      "what is my tier",
      "my membership tier",
      "my current tier",
      "what plan am i on",
      "which plan am i on",
      "what is my plan",
    ],
    excludes: ["upgrade", "downgrade", "higher", "lower", "change"],
  },
  // Signed up but not a member / no entries / shows as guest
  {
    faqId: "33",
    signals: [
      "signed up but",
      "registered but",
      "i registered but",
      "not a member",
      "i m not a member",
      "im not a member",
      "am i a member",
      "why am i a guest",
      "still a guest",
      "says guest",
      "shows as guest",
      "shows me as guest",
      "paid but no membership",
      "no membership but",
      "joined but no entries",
      "i have no entries",
      "have no entries",
    ],
  },
  // Login help / password / google sign-in
  {
    faqId: "32",
    signals: [
      "how do i log in",
      "how do i login",
      "how to log in",
      "how do i sign in",
      "can t log in",
      "cant log in",
      "can t sign in",
      "cannot log in",
      "cannot sign in",
      "forgot my password",
      "forgot password",
      "reset my password",
      "reset password",
      "password doesn t work",
      "password not working",
      "sign in with google",
      "log in with google",
      "google sign in",
    ],
  },
  // Update card / payment method / account details — account self-service
  {
    faqId: "37",
    signals: [
      "update my card",
      "change my card",
      "update my payment method",
      "change my payment method",
      "update my payment",
      "change my payment",
      "update my card details",
      "change my card details",
      "update my details",
      "update my email",
      "change my email",
      "update my profile",
      "change my profile",
      "update my state",
    ],
    excludes: ["safe", "secure", "stored"],
  },
  // Is my payment / card safe
  {
    faqId: "34",
    signals: [
      "is my card safe",
      "is my payment safe",
      "card data safe",
      "card details safe",
      "is my card information safe",
      "is my payment information safe",
      "do you store my card",
      "store my card",
      "is it safe to pay",
      "is my data secure",
      "is my payment secure",
      "credit card safe",
      "credit card info",
      "card info safe",
      "card information safe",
      "is my credit card safe",
    ],
  },
  // Data retention / privacy (delete-my-data stays on id20)
  {
    faqId: "35",
    signals: [
      "how long do you keep",
      "how long do you store",
      "data retention",
      "how long is my data kept",
      "retention period",
      "how long do you hold",
    ],
    excludes: ["delete"],
  },
  // GST / tax invoice
  {
    faqId: "36",
    signals: [
      "gst",
      "include gst",
      "gst included",
      "is gst included",
      "tax invoice",
      "do prices include tax",
      "prices include gst",
      "gst on my",
    ],
  },
  // Become a member / how membership works (join). "how much to join" stays on id4 (pricing).
  {
    faqId: "28",
    signals: [
      "become a member",
      "how to become a member",
      "how do i become a member",
      "how do i join",
      "how to join",
      "how do i sign up",
      "how to sign up",
      "sign up",
      "signup",
      "create an account",
      "how does membership work",
      "how membership works",
      "how do memberships work",
      "how does the membership work",
      "what is membership",
    ],
    // Keep "sign up" out of the one-time-pack flow (id5) and email-list signups.
    excludes: ["partner", "one-time", "one time", "pack", "email", "newsletter", "mailing"],
  },

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
    // Win-check + prize-fulfilment go to id31/id38 (handled above); never the catalog.
    // Belt-and-suspenders: id38 top-block precedence already wins, but these excludes
    // also prevent the bare "prize" signal from catching complaint-style queries.
    excludes: ["did i win", "have i won", "where is my prize", "where s my prize", "claim my prize", "broken", "damaged", "received my prize", "arrived broken"],
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
      "how many entries do i get",
      "how many entries per",
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
      "without a subscription",
      "enter without a subscription",
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
    // A duplicate/double charge is a billing dispute → escalate (id38, handled above),
    // not the auto-renewal-date explainer.
    excludes: ["twice", "double", "duplicate", "two charges", "charged again"],
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
      "when does my membership renew",
      "when is my renewal",
      "when is my next renewal",
      "when do i renew",
      "next renewal",
      "renewal date",
      "when will i be charged",
      "when am i charged",
      "billing date",
      "charged on the 24th",
      "renew on the 24th",
    ],
    // "renewal payment failed/declined" belongs to id13 (handled later); a bare
    // renewal-date question must not be shadowed by it.
    excludes: ["failed", "declined", "fail", "past due"],
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
  const entry = getSupportChatFaqEntries().find((e) => e.id === faqId);
  if (!entry) return null;
  return {
    answer: entry.answer,
    source: { id: entry.id, title: entry.question },
  };
}
