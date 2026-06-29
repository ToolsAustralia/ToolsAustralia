/**
 * routingGoldenSet.ts
 *
 * Labelled DEFLECTION-ROUTING dataset (not answer quality). Each case states what
 * the matcher SHOULD do. Shared by scripts/calibrate-chat-deflection.ts (the sweep)
 * and routing.test.ts (the lock). Curated by hand — label quality is the point.
 *
 * For routing, "escalate" and "abstain" both mean "must NOT deflect" (the grounded
 * LLM / escalation layer owns them); they are distinguished only for readability.
 *
 * Buckets (target ~80–120 total, weighted to the Layer-2 boundary):
 *   audit mis-routes · Layer-1 regression routes · L2-paraphrase-deflect ·
 *   L2-near-miss-abstain · account-aware · off-topic · escalation.
 */

export type RoutingExpectation =
  | { kind: "deflect"; faqId: string }
  | { kind: "abstain" }
  | { kind: "escalate" };

export interface RoutingCase {
  question: string;
  expect: RoutingExpectation;
  note: string;
}

export const ROUTING_GOLDEN_SET: RoutingCase[] = [
  // ── Audit mis-routes (the 9 the 2026-06-27 fix corrected) ──────────────────
  {
    question: "how to become a member",
    expect: { kind: "deflect", faqId: "28" },
    note: "audit: was mis-routed → partner id17; must route to membership how-it-works id28",
  },
  {
    question: "how membership works",
    expect: { kind: "deflect", faqId: "28" },
    note: "audit: was mis-routed → refund id19; must route to membership overview id28",
  },
  {
    question: "where can i see my entries",
    expect: { kind: "deflect", faqId: "29" },
    note: "audit: was mis-routed → get-more id8; must route to account-aware entries id29",
  },
  {
    question: "how many entries do i have",
    expect: { kind: "deflect", faqId: "29" },
    note: "audit: account-aware personal count → id29",
  },
  {
    question: "what tier am i on",
    expect: { kind: "deflect", faqId: "30" },
    note: "audit: was mis-routed → downgrade id23; must route to tier lookup id30",
  },
  {
    question: "did i win",
    expect: { kind: "deflect", faqId: "31" },
    note: "audit: was mis-routed → prize catalog id3; must route to draw result id31",
  },
  {
    question: "where is my prize",
    expect: { kind: "deflect", faqId: "38" },
    note: "audit: prize fulfilment dispute → talk-to-human id38",
  },
  {
    question: "why was i charged twice",
    expect: { kind: "deflect", faqId: "38" },
    note: "audit: billing dispute → talk-to-human id38",
  },
  {
    question: "when is my renewal",
    expect: { kind: "deflect", faqId: "11" },
    note: "audit: was mis-routed → failed-payment id13; must route to renewal date id11",
  },

  // ── Layer-1 regression non-regressions (must NOT move) ─────────────────────
  {
    question: "what can i win",
    expect: { kind: "deflect", faqId: "3" },
    note: "regression: prize catalog stays at id3",
  },
  {
    question: "how do i get more entries",
    expect: { kind: "deflect", faqId: "8" },
    note: "regression: get-more-entries id8, not account-aware id29",
  },
  {
    question: "how much to join",
    expect: { kind: "deflect", faqId: "4" },
    note: "regression: pricing/tiers id4, not join overview id28",
  },
  {
    question: "how do i sign up for a one-time pack",
    expect: { kind: "deflect", faqId: "5" },
    note: "regression: one-time packs id5, not membership id28",
  },
  {
    question: "what payment methods do you accept",
    expect: { kind: "deflect", faqId: "10" },
    note: "regression: payment methods id10 stays",
  },
  {
    question: "are membership fees refundable",
    expect: { kind: "deflect", faqId: "12" },
    note: "regression: refund policy id12 stays",
  },
  {
    question: "when does my membership renew",
    expect: { kind: "deflect", faqId: "11" },
    note: "regression: renewal date id11 stays",
  },
  {
    question: "what is Tools Australia",
    expect: { kind: "deflect", faqId: "1" },
    note: "regression: about/overview id1 stays",
  },
  {
    question: "how do I talk to a real person",
    expect: { kind: "deflect", faqId: "38" },
    note: "regression: escalation path id38 stays",
  },

  // ── L2 paraphrases that SHOULD deflect (no strong Layer-1 signal) ───────────
  {
    question: "are membership fees returnable to me",
    expect: { kind: "deflect", faqId: "12" },
    note: "L2: 'returnable' paraphrase of refund-policy id12",
  },
  {
    question: "is there a way to pay other than card",
    expect: { kind: "deflect", faqId: "10" },
    note: "L2: payment-methods paraphrase id10",
  },
  {
    question: "can i pay with paypal or bank transfer",
    expect: { kind: "deflect", faqId: "10" },
    note: "L2: payment-methods paraphrase — tradie asking about non-card options id10",
  },
  {
    question: "what prizes are up for grabs this month",
    expect: { kind: "deflect", faqId: "3" },
    note: "L2: prize catalog paraphrase id3",
  },
  {
    question: "whats the grand prize",
    expect: { kind: "deflect", faqId: "3" },
    note: "L2: prize catalog paraphrase id3 — tradie shorthand",
  },
  {
    question: "do i get cash or tools if i win",
    expect: { kind: "deflect", faqId: "3" },
    note: "L2: prize options paraphrase id3",
  },
  {
    question: "when is the next draw",
    expect: { kind: "deflect", faqId: "2" },
    note: "L2: major draw schedule paraphrase id2",
  },
  {
    question: "what time does the draw happen",
    expect: { kind: "deflect", faqId: "2" },
    note: "L2: draw time paraphrase id2",
  },
  {
    question: "how do i boost my chances of winning",
    expect: { kind: "deflect", faqId: "8" },
    note: "L2: get-more-entries paraphrase — tradie phrasing id8",
  },
  {
    question: "can i buy extra tickets",
    expect: { kind: "deflect", faqId: "5" },
    note: "L2: one-time packs / extra entries paraphrase id5",
  },
  {
    question: "is there a monthly subscription",
    expect: { kind: "deflect", faqId: "28" },
    note: "L2: membership overview paraphrase id28",
  },
  {
    question: "how do i sign up",
    expect: { kind: "deflect", faqId: "28" },
    note: "L2: join / become member paraphrase id28",
  },
  {
    question: "do unused entries roll over to next month",
    expect: { kind: "deflect", faqId: "7" },
    note: "L2: entries carry-forward paraphrase id7",
  },
  {
    question: "what happens to my entries if i cancel",
    expect: { kind: "deflect", faqId: "7" },
    note: "L2: cancel-entries carry-forward paraphrase id7",
  },
  {
    question: "can i stop my subscription",
    expect: { kind: "deflect", faqId: "18" },
    note: "L2: cancel membership paraphrase id18",
  },
  {
    question: "how do i turn off auto renewal",
    expect: { kind: "deflect", faqId: "18" },
    note: "L2: auto-renewal cancel paraphrase id18",
  },
  {
    question: "my payment bounced what now",
    expect: { kind: "deflect", faqId: "13" },
    note: "L2: failed renewal payment paraphrase id13",
  },
  {
    question: "what if my card gets declined",
    expect: { kind: "deflect", faqId: "13" },
    note: "L2: failed payment paraphrase id13",
  },
  {
    question: "how do i upgrade to a higher tier",
    expect: { kind: "deflect", faqId: "22" },
    note: "L2: upgrade membership paraphrase id22",
  },
  {
    question: "can i drop down to a cheaper plan",
    expect: { kind: "deflect", faqId: "23" },
    note: "L2: downgrade membership paraphrase id23",
  },
  {
    question: "how do i rejoin after cancelling",
    expect: { kind: "deflect", faqId: "24" },
    note: "L2: reactivate/resubscribe paraphrase id24",
  },
  {
    question: "can i pause my membership",
    expect: { kind: "deflect", faqId: "25" },
    note: "L2: pause membership paraphrase id25",
  },
  {
    question: "do i get partner discounts",
    expect: { kind: "deflect", faqId: "16" },
    note: "L2: partner discounts paraphrase id16",
  },
  {
    question: "what discounts do members get from partner brands",
    expect: { kind: "deflect", faqId: "16" },
    note: "L2: partner discounts paraphrase id16",
  },
  {
    question: "how do i check if i won last month",
    expect: { kind: "deflect", faqId: "31" },
    note: "L2: draw result check paraphrase id31",
  },
  {
    question: "who is eligible to enter the draw",
    expect: { kind: "deflect", faqId: "9" },
    note: "L2: eligibility paraphrase id9",
  },
  {
    question: "can sa residents enter",
    expect: { kind: "deflect", faqId: "9" },
    note: "L2: eligibility/SA restriction paraphrase id9",
  },
  {
    question: "do prices include gst",
    expect: { kind: "deflect", faqId: "36" },
    note: "L2: GST paraphrase id36",
  },
  {
    question: "is my credit card info safe with you",
    expect: { kind: "deflect", faqId: "34" },
    note: "L2: payment security paraphrase id34",
  },

  // ── L2 near-misses that SHOULD abstain (share words, wrong topic) ────────────
  {
    question: "do you have a physical store i can visit",
    expect: { kind: "abstain" },
    note: "near-miss: 'shop' word overlap but not the online shop FAQ; no FAQ covers physical stores",
  },
  {
    question: "can i visit your office",
    expect: { kind: "abstain" },
    note: "near-miss: sounds like contact/support but no FAQ covers in-person visits",
  },
  {
    question: "what brands of tools do you sell",
    expect: { kind: "abstain" },
    note: "near-miss: shares 'tools' with prize FAQ but no FAQ covers retail tool sales",
  },
  {
    question: "do you ship tools to regional areas",
    expect: { kind: "abstain" },
    note: "near-miss: 'ship' + 'tools' overlap but no shipping FAQ exists",
  },
  {
    question: "how long does delivery take",
    expect: { kind: "abstain" },
    note: "near-miss: delivery-like question; no delivery FAQ (Tools Australia is not a retailer)",
  },
  {
    question: "can i get a discount on my next pack if i refer five people",
    expect: { kind: "abstain" },
    note: "near-miss: 'refer' + 'discount' overlap with referral/partner but specific deal not in any FAQ",
  },
  {
    question: "what is the chance of winning based on entries",
    expect: { kind: "abstain" },
    note: "near-miss: probability maths not covered by any FAQ despite 'entries' overlap",
  },
  {
    question: "has anyone from victoria won before",
    expect: { kind: "abstain" },
    note: "near-miss: past winner lookup by state; no FAQ covers historical winner breakdown",
  },
  {
    question: "can i split my entries across different draws",
    expect: { kind: "abstain" },
    note: "near-miss: 'entries' + 'draws' overlap; no FAQ covers entry splitting",
  },
  {
    question: "how do i know randomdraws.com.au is legit",
    expect: { kind: "abstain" },
    note: "near-miss: draw legitimacy adjacent to id2 but specific third-party verification not a separate FAQ answer",
  },
  {
    question: "is tools australia registered as a business",
    expect: { kind: "abstain" },
    note: "near-miss: business legitimacy; no FAQ covers company registration",
  },
  {
    question: "can i gift a membership to someone else",
    expect: { kind: "abstain" },
    note: "near-miss: gifting sounds like membership but no FAQ covers gift subscriptions",
  },
  {
    question: "can two people share an account",
    expect: { kind: "abstain" },
    note: "near-miss: account overlap; no FAQ covers shared accounts",
  },
  {
    question: "do mini draw entries count for the major draw",
    expect: { kind: "abstain" },
    note: "near-miss: 'entries' + 'draw' but the combination (mini vs major cross-counting) is nuanced and not directly in a single FAQ",
  },
  {
    question: "what tools are available in the boss pack",
    expect: { kind: "abstain" },
    note: "near-miss: 'Boss' + 'pack' overlap with tier FAQ but no FAQ lists pack-specific tool contents",
  },
  {
    question: "do you have an ios or android app",
    expect: { kind: "abstain" },
    note: "near-miss: mobile app not covered by any FAQ",
  },
  {
    question: "how do i contact the winner to congratulate them",
    expect: { kind: "abstain" },
    note: "near-miss: 'winner' overlap with id31 but asking for social contact of a past winner",
  },
  {
    question: "what is your abn",
    expect: { kind: "abstain" },
    note: "near-miss: business info not covered by any FAQ",
  },
  {
    question: "do you do corporate memberships for my work crew",
    expect: { kind: "abstain" },
    note: "near-miss: 'membership' overlap but corporate/group plans not in any FAQ",
  },
  {
    question: "what is the minimum age to enter in western australia",
    expect: { kind: "abstain" },
    note: "near-miss: 'age' + 'enter' adjacent to id9 but WA-specific minimum age not in FAQ",
  },

  // ── Account-aware — must deflect to nav-only entries ────────────────────────
  {
    question: "how do i update my card",
    expect: { kind: "deflect", faqId: "37" },
    note: "account-aware: update card nav → id37",
  },
  {
    question: "how do i change my payment details",
    expect: { kind: "deflect", faqId: "37" },
    note: "account-aware: update payment details → id37",
  },
  {
    question: "where do i see my current membership tier",
    expect: { kind: "deflect", faqId: "30" },
    note: "account-aware: tier lookup nav → id30",
  },
  {
    question: "how many entries do i currently have in the draw",
    expect: { kind: "deflect", faqId: "29" },
    note: "account-aware: personal entry count → id29",
  },
  {
    question: "where do i find my entry total",
    expect: { kind: "deflect", faqId: "29" },
    note: "account-aware: entry total location → id29",
  },
  {
    question: "did i win this month",
    expect: { kind: "deflect", faqId: "31" },
    note: "account-aware: personal draw result → id31",
  },
  {
    question: "how do i see my past draws",
    expect: { kind: "deflect", faqId: "31" },
    note: "account-aware: past draw history → id31",
  },
  {
    question: "how do i update my email address",
    expect: { kind: "deflect", faqId: "37" },
    note: "account-aware: profile/account details update → id37",
  },
  {
    question: "where do i change my state in my profile",
    expect: { kind: "deflect", faqId: "37" },
    note: "account-aware: profile update (state field affects eligibility) → id37",
  },

  // ── Off-topic (must abstain) ─────────────────────────────────────────────────
  {
    question: "what's the weather in sydney",
    expect: { kind: "abstain" },
    note: "off-topic: weather query, no FAQ coverage",
  },
  {
    question: "do you ship overseas",
    expect: { kind: "abstain" },
    note: "off-topic: international shipping, not a draw/membership platform service",
  },
  {
    question: "who won the afl grand final",
    expect: { kind: "abstain" },
    note: "off-topic: sports result, nothing to do with Tools Australia",
  },
  {
    question: "can you recommend a good sparky in brisbane",
    expect: { kind: "abstain" },
    note: "off-topic: trade referral; not a FAQ topic",
  },
  {
    question: "what is the capital of australia",
    expect: { kind: "abstain" },
    note: "off-topic: geography trivia",
  },
  {
    question: "what software do you use to run your website",
    expect: { kind: "abstain" },
    note: "off-topic: technical stack question; no FAQ coverage",
  },
  {
    question: "can you write me a cover letter",
    expect: { kind: "abstain" },
    note: "off-topic: AI writing request completely unrelated to Tools Australia",
  },
  {
    question: "whats the best drill for concrete",
    expect: { kind: "abstain" },
    note: "off-topic: product advice question; Tools Australia is a giveaway platform not a tool retailer",
  },
  {
    question: "how do i fix a leaking tap",
    expect: { kind: "abstain" },
    note: "off-topic: plumbing advice; no FAQ coverage",
  },
  {
    question: "convert 100 aud to usd",
    expect: { kind: "abstain" },
    note: "off-topic: currency conversion; no FAQ coverage",
  },

  // ── Escalation-worthy (must NOT deflect to a topic FAQ) ─────────────────────
  {
    question: "i want a refund for last month",
    expect: { kind: "escalate" },
    note: "specific billing dispute → human; refund FAQ is general policy not resolution",
  },
  {
    question: "i was charged after i cancelled and want my money back",
    expect: { kind: "escalate" },
    note: "specific post-cancellation charge dispute → human",
  },
  {
    question: "my account was hacked and someone made purchases",
    expect: { kind: "escalate" },
    note: "account security incident → human immediately",
  },
  {
    question: "i think someone else is using my account",
    expect: { kind: "escalate" },
    note: "account compromise → human",
  },
  {
    question: "i won the major draw but haven't received my prize",
    expect: { kind: "escalate" },
    note: "prize fulfilment follow-up for confirmed winner → human",
  },
  {
    question: "i received an email saying i won but i didn't enter",
    expect: { kind: "escalate" },
    note: "potential fraud / phishing concern → human",
  },
  {
    question: "i need to dispute a charge with my bank",
    expect: { kind: "escalate" },
    note: "chargeback / bank dispute advice → human",
  },
  {
    question: "you charged me three times this month",
    expect: { kind: "escalate" },
    note: "triple-charge dispute; specific billing issue → human",
  },
  {
    question: "i have a complaint about your service",
    expect: { kind: "escalate" },
    note: "formal complaint → human",
  },
  {
    question: "my prize arrived broken",
    expect: { kind: "escalate" },
    note: "prize condition issue → human for resolution",
  },
];
