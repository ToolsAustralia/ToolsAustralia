import { rewardsEnabled } from "@/config/featureFlags";
import { rewardsDisabledMessage } from "@/config/rewardsSettings";

export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
  /** Markdown is supported — links render in both the widget and the /faq page via ChatMarkdown. */
  category: "ALL QUESTIONS" | "SHOPPING" | "PAYMENTS" | "REWARDS" | "PARTNERSHIPS";
}

export const faqCategories: FaqEntry["category"][] = ["ALL QUESTIONS", "SHOPPING", "PAYMENTS", "REWARDS", "PARTNERSHIPS"];

/**
 * Centralised FAQ content so both the page and the interactive client component stay in sync.
 */
export function getFaqEntries(): FaqEntry[] {
  const isRewardsFeatureEnabled = rewardsEnabled();
  const rewardsAnswer = isRewardsFeatureEnabled
    ? "You earn rewards points for activity on the platform. Points can be redeemed for benefits like bonus entries or other member perks. We will notify members as soon as redemptions are available."
    : `${rewardsDisabledMessage()} We will notify members as soon as redemptions resume.`;

  return [
    // ── SHOPPING / HOW IT WORKS ──────────────────────────────────────────────
    {
      id: "1",
      question: "What is Tools Australia?",
      answer:
        "Tools Australia is a membership-driven monthly tool giveaway platform built for Australian tradies — electricians, plumbers, carpenters, builders, mechanics, and more. You earn entries into our Major Draw by subscribing to a membership or purchasing one-time tool packs. More entries means better odds of winning.",
      category: "SHOPPING",
    },
    {
      id: "2",
      question: "When is the Major Draw and how does it work?",
      answer:
        "The Major Draw runs on the 27th of every month. Entries freeze at 8:00 PM AEST/AEDT, and the draw goes live on Facebook at 8:30 PM. New entry purchases are blocked from 8:00 PM on the 27th until midnight (the start of the 28th). The winner is selected by a government-certified independent random-draw service — randomdraws.com.au — not by Tools Australia. The verification link is published on our [Draw Results](/draw-results) page after each draw.",
      category: "SHOPPING",
    },
    {
      id: "3",
      question: "What can I win?",
      answer:
        "Each month's Grand Winner can customise their prize. They choose either: (A) a power tool brand (Milwaukee, DeWalt, Makita, or Ryobi) plus their choice of professional workshop storage, bundled with a $5,000 cash bonus; or (B) a single $10,000 AUD cash prize instead of tools — no hassle, just cash straight to their bank account.",
      category: "SHOPPING",
    },
    {
      id: "4",
      question: "What are my membership options and how many entries do I get?",
      answer:
        "We have three monthly subscription tiers (all prices in AUD): Tradie at $20/month gives you 15 entries per month; Foreman at $40/month gives you 40 entries; Boss at $80/month gives you 100 entries. Higher tiers also unlock a larger slice of our partner-discount catalog. Subscription entries accumulate and carry forward each month while your membership stays active.",
      category: "SHOPPING",
    },
    {
      id: "5",
      question: "Can I buy entries without a subscription?",
      answer:
        "Yes. One-time tool packs let you enter the Major Draw without a monthly commitment. Packs range from Apprentice ($25, 3 entries) up to VIP ($1,000, 1,500 entries). If you already have an active subscription or entries in the current draw, you also unlock discounted Additional packs — same entries at roughly half the price. One-time and Additional pack entries are valid for the current cycle only and do not carry forward.",
      category: "SHOPPING",
    },
    {
      id: "6",
      question: "What are Mini Draws?",
      answer:
        "Mini Draws are smaller, product-specific giveaways that run separately from the Major Draw. They have no fixed schedule — each one triggers when its entry threshold is reached. Buying a Mini Draw pack enters you into that specific Mini Draw only; it gives you zero Major Draw entries. Mini Draw entries and Major Draw entries are completely separate pools.",
      category: "SHOPPING",
    },
    {
      id: "7",
      question: "Do my entries carry forward if I cancel my subscription?",
      answer:
        "If you cancel mid-cycle, the entries you have already earned this cycle remain valid — they stay in the draw pool for the current month's draw on the 27th. Subscription entries stop accumulating from the next renewal cycle. One-time pack entries are always scoped to the cycle they were purchased in and do not carry forward regardless of subscription status.",
      category: "SHOPPING",
    },
    {
      id: "8",
      question: "How do I get more entries?",
      answer:
        "You can boost your chances in several ways: subscribe to a higher membership tier; buy one-time, Additional, or Mini Draw packs; take a post-purchase upsell offer (heavily discounted bonus entries offered right after checkout); refer a friend (both you and your friend receive 100 bonus entries when they make their first purchase); or keep an eye out for promo codes and special campaigns.",
      category: "SHOPPING",
    },
    {
      id: "9",
      question: "Who is eligible to enter?",
      answer:
        "You must be 18 years or older and a legal Australian resident to enter. Please note that the competition currently excludes residents of the ACT and South Australia due to permit restrictions in those territories. If you believe you were charged while ineligible, please [contact us](/contact) and our team will look into it.",
      category: "SHOPPING",
    },

    // ── PAYMENTS ─────────────────────────────────────────────────────────────
    {
      id: "10",
      question: "What payment methods do you accept?",
      answer:
        "We accept all major credit and debit cards (Visa, Mastercard, American Express) processed securely through Stripe. All prices are in Australian dollars (AUD). Card payments are the only payment method currently supported.",
      category: "PAYMENTS",
    },
    {
      id: "11",
      question: "When does my subscription renew?",
      answer:
        "Subscriptions renew on the 24th of each month. This timing is intentional — it ensures your renewal payment settles at least three days before the 27th Major Draw, so your entries are confirmed and counted for that month's draw.",
      category: "PAYMENTS",
    },
    {
      id: "12",
      question: "Are membership fees refundable?",
      answer:
        "Membership fees are non-refundable once purchased. If you cancel mid-cycle, you will not receive a refund for the unused portion of your subscription period — however, your entries for that cycle remain valid and you keep access to your member benefits until the cycle ends. Your rights under Australian Consumer Law are always preserved.",
      category: "PAYMENTS",
    },
    {
      id: "13",
      question: "What happens if my renewal payment fails?",
      answer:
        "If a renewal payment fails, your subscription moves to a past-due state. You will receive an email prompt and can retry the payment directly from your account dashboard. We will attempt to recover the payment — if it succeeds, your benefits and entries are reinstated immediately. You can also update your card details from your account settings at any time.",
      category: "PAYMENTS",
    },

    // ── REWARDS ──────────────────────────────────────────────────────────────
    {
      id: "14",
      question: "How do rewards points work?",
      answer: rewardsAnswer,
      category: "REWARDS",
    },
    {
      id: "15",
      question: "Is the online shop available?",
      answer:
        "Our member shop is coming soon. When it launches, subscription members will receive a shop discount — Tradie 5%, Foreman 10%, Boss 20%. We will announce the launch date to all members.",
      category: "REWARDS",
    },

    // ── PARTNERSHIPS ─────────────────────────────────────────────────────────
    {
      id: "16",
      question: "What partner discounts do members get?",
      answer:
        "Active subscribers unlock exclusive discounts with our partner brands — real savings on tools, equipment, and trade services. How much of the catalog you can see depends on your tier: Tradie members unlock 50% of the catalog, Foreman 75%, and Boss 100%. One-time pack buyers receive a time-limited window of partner access based on the pack they purchased. To redeem a partner discount, simply mention Tools Australia when dealing with the partner brand — there is no code to enter. Browse the full list on the [Partner discounts](/partner) page.",
      category: "PARTNERSHIPS",
    },
    {
      id: "17",
      question: "How do I become a partner brand?",
      answer:
        "If you run a trade-focused business and would like to offer your products or services to our member community, you can apply via our partner page. Our team reviews every application and will reach out to discuss the arrangement.",
      category: "PARTNERSHIPS",
    },

    // ── ACCOUNT / MEMBERSHIP MANAGEMENT ──────────────────────────────────────
    {
      id: "18",
      question: "How do I cancel my membership or stop auto-renewal?",
      answer:
        "You can cancel or turn off auto-renewal yourself at any time from [My Account](/my-account) — sign in, go to **Settings → Subscription** tab, and use the cancellation option there. Entries already earned in the current cycle stay valid and remain in the draw pool. Membership fees are non-refundable once charged, but your Australian Consumer Law rights are always preserved. If you have trouble accessing the Subscription tab, [contact us](/contact) and our support team will help.",
      category: "PAYMENTS",
    },
    {
      id: "19",
      question: "Can I get a refund on my membership?",
      answer:
        "Membership fees are non-refundable once charged — this is our standard policy as access and entries are granted immediately on payment. Your rights under Australian Consumer Law are always preserved. If you believe you were charged in error or have a billing concern, [contact us](/contact) and our support team will review your case.",
      category: "PAYMENTS",
    },
    {
      id: "20",
      question: "How do I delete my account or my data?",
      answer:
        "To close your account or request deletion of your personal data, please [contact us](/contact) — our support team will arrange it. Before closing, you may want to cancel your subscription first from [My Account](/my-account) → Settings → Subscription tab. You can also clear your chat history with the delete option inside the chat widget.",
      category: "PAYMENTS",
    },
    {
      id: "21",
      question: "I was charged unexpectedly — I didn't authorise a renewal",
      answer:
        "Subscriptions renew automatically on the 24th of each month so your entries are confirmed before the 27th draw — this is explained in our terms at sign-up. You can turn off auto-renewal at any time from [My Account](/my-account) → Settings → Subscription tab. If you believe a specific charge was made in error or without your consent, please [contact us](/contact) and our team will look into it.",
      category: "PAYMENTS",
    },
  ];
}
