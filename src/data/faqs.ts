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
 *
 * SINGLE SOURCE OF TRUTH: this list feeds (1) the /faq page, (2) the support-chat
 * deflection matcher (decisionTree intent rules + faqSearch cosine), and (3) the
 * generated knowledge pack the LLM is grounded on. Add support knowledge HERE (not
 * by hand-copying prose into the knowledge-pack builder) so all three stay in sync.
 *
 * Customer-facing vocabulary: prefer "membership" over "subscription" in prose
 * (per the project naming rule). The literal "Settings → Subscription" references
 * are KEPT verbatim because that is the actual label of the tab in My Account —
 * renaming it in copy would send users to a tab that doesn't exist by that name.
 *
 * Account-aware entries (ids 29, 30, 31, 37) deliberately recite NO personal data —
 * Cobber has no account access. They route the user to the right self-service
 * location (log in → My Account → …). This is navigation, not data exposure.
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
        "Tools Australia is a membership-driven monthly tool giveaway platform built for Australian tradies — electricians, plumbers, carpenters, builders, mechanics, and more. You earn entries into our Major Draw by joining a membership or purchasing one-time tool packs. More entries means better odds of winning.",
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
        "We have three monthly membership tiers (all prices in AUD): Tradie at $20/month gives you 15 entries per month; Foreman at $40/month gives you 40 entries; Boss at $80/month gives you 100 entries. Higher tiers also unlock a larger slice of our partner-discount catalog. Membership entries accumulate and carry forward each month while your membership stays active. You can join on the [membership page](/membership).",
      category: "SHOPPING",
    },
    {
      id: "5",
      question: "Can I buy entries without a membership?",
      answer:
        "Yes. One-time tool packs let you enter the Major Draw without a monthly commitment. Packs range from Apprentice ($25, 3 entries) up to VIP ($1,000, 1,500 entries). If you already have an active membership or entries in the current draw, you also unlock discounted Additional packs — same entries at roughly half the price. One-time and Additional pack entries are valid for the current cycle only and do not carry forward.",
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
      question: "Do my entries carry forward if I cancel my membership?",
      answer:
        "If you cancel mid-cycle, the entries you have already earned this cycle remain valid — they stay in the draw pool for the current month's draw on the 27th. Membership entries stop accumulating from the next renewal cycle. One-time pack entries are always scoped to the cycle they were purchased in and do not carry forward regardless of membership status.",
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
      question: "When does my membership renew?",
      answer:
        "Your membership renews monthly on your own billing date — the day of the month you first joined. The one exception: if you join late in the month (the 25th, 26th, or 27th), your renewal is anchored to the 24th instead, so your payment settles a few days before the 27th Major Draw and your entries are confirmed in time. You can always see your exact next billing date in [My Account](/my-account) → Settings → Subscription.",
      category: "PAYMENTS",
    },
    {
      id: "12",
      question: "Are membership fees refundable?",
      answer:
        "Membership fees are non-refundable once purchased. If you cancel mid-cycle, you will not receive a refund for the unused portion of your membership period — however, your entries for that cycle remain valid and you keep access to your member benefits until the cycle ends. Your rights under Australian Consumer Law are always preserved.",
      category: "PAYMENTS",
    },
    {
      id: "13",
      question: "What happens if my renewal payment fails?",
      answer:
        "If a renewal payment fails, your membership moves to a past-due state. You will receive an email prompt and can retry the payment directly from your account dashboard. We will attempt to recover the payment — if it succeeds, your benefits and entries are reinstated immediately. You can also update your card details from your account settings at any time. The fastest fix is the in-app retry on your existing card from your dashboard — most failures are temporary.",
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
        "Our member shop is coming soon. When it launches, members will receive a shop discount based on their tier — Tradie 5%, Foreman 10%, Boss 20%. We will announce the launch date to all members.",
      category: "REWARDS",
    },

    // ── PARTNERSHIPS ─────────────────────────────────────────────────────────
    {
      id: "16",
      question: "What partner discounts do members get?",
      answer:
        "Active members unlock exclusive discounts with our partner brands — real savings on tools, equipment, and trade services. How much of the catalog you can see depends on your tier: Tradie members unlock 50% of the catalog, Foreman 75%, and Boss 100%. One-time pack buyers receive a time-limited window of partner access based on the pack they purchased. To redeem a partner discount, simply mention Tools Australia when dealing with the partner brand — there is no code to enter. Browse the full list on the [Partner discounts](/partner) page.",
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
        "To close your account or request deletion of your personal data, please [contact us](/contact) — our support team will arrange it (account deletion isn't self-service, and some records are retained as required by law). Before closing, you may want to cancel your membership first from [My Account](/my-account) → Settings → Subscription tab. You can also clear your chat history yourself with the delete option inside the chat widget.",
      category: "PAYMENTS",
    },
    {
      id: "21",
      question: "I was charged unexpectedly — I didn't authorise a renewal",
      answer:
        "Your membership renews automatically each month on your own billing date (the day you joined) — you can see your exact next billing date in [My Account](/my-account) → Settings → Subscription. If you joined late in the month (the 25th–27th), that date is anchored to the 24th so your entries are confirmed before the 27th draw. You can turn off auto-renewal there at any time. If you believe a specific charge was made in error or without your consent, please [contact us](/contact) and our team will look into it.",
      category: "PAYMENTS",
    },

    // ── UPGRADE / DOWNGRADE / REACTIVATE / PAUSE ──────────────────────────────
    {
      id: "22",
      question: "What happens when I upgrade my membership?",
      answer:
        "Upgrading takes effect straight away. You pay the new tier's full monthly price immediately, your billing cycle resets to today, and the extra monthly entries are added to the current draw right away. You can upgrade from [My Account](/my-account) → Settings → Subscription. (Upgrades aren't available while a payment is past due — resolve that first.)",
      category: "PAYMENTS",
    },
    {
      id: "23",
      question: "What happens when I downgrade to a lower tier?",
      answer:
        "Downgrading costs nothing now and takes effect at the end of your current cycle. You keep your current tier's benefits and entries until then, and the lower tier (with its entries and partner access) begins on your next renewal. You'll see the exact switch-over date when you confirm in [My Account](/my-account) → Settings → Subscription.",
      category: "PAYMENTS",
    },
    {
      id: "24",
      question: "I cancelled — how do I restart my membership?",
      answer:
        "Welcome back! If you cancelled recently, you can reactivate your existing plan with no new charge — note that reactivation keeps you on the same tier. If your membership has fully ended, you can resubscribe on any tier you like. Either way your entry history is preserved. Just head to [My Account](/my-account) → Settings → Subscription to restart.",
      category: "PAYMENTS",
    },
    {
      id: "25",
      question: "Can I pause my membership instead of cancelling?",
      answer:
        "When you start the cancellation flow in [My Account](/my-account) → Settings → Subscription, you may be offered alternatives to leaving — such as pausing for a short period or a limited-time discount on your next couple of months. These offers appear during the cancellation steps. If you don't see an option you need, [contact us](/contact) and our team will help.",
      category: "PAYMENTS",
    },

    // ── SHOPPING / ONBOARDING ────────────────────────────────────────────────
    {
      id: "26",
      question: "What's the setup step after my first purchase?",
      answer:
        "After your first purchase we ask for a couple of quick details — your trade and your Australian state — and offer to verify your email. Your state matters because it determines draw eligibility (residents of the ACT and SA are currently excluded). That's the only setup step, and you can update these anytime in [My Account](/my-account).",
      category: "SHOPPING",
    },
    {
      id: "27",
      question: "Do you run entry promotions or bonus-entry deals?",
      answer:
        "Yes. From time to time we run entry-multiplier promotions (like double-entry weekends) that boost the entries on your purchase automatically, and some promos add a fixed number of bonus entries on top. You can also enter referral, promo, or campaign codes at checkout — these add bonus entries, they don't change the price. Keep an eye on our emails and the [promotions page](/promotions) for what's running this cycle.",
      category: "SHOPPING",
    },

    // ── JOINING / HOW MEMBERSHIP WORKS ───────────────────────────────────────
    {
      id: "28",
      question: "How do I become a member and how does membership work?",
      answer:
        "Becoming a member is simple: choose a monthly membership tier — Tradie ($20/month, 15 entries), Foreman ($40/month, 40 entries), or Boss ($80/month, 100 entries) — and sign up on the [membership page](/membership) (or from [My Account](/my-account)). Your entries go into the monthly Major Draw straight away and accumulate each month while your membership stays active, and higher tiers unlock more of our partner-discount catalog. Membership renews monthly and you can cancel anytime. Prefer no monthly commitment? You can also enter with one-time tool packs instead.",
      category: "SHOPPING",
    },

    // ── ACCOUNT-AWARE (navigation only — Cobber has no account access) ────────
    {
      id: "29",
      question: "Where can I see my entries or how many I have?",
      answer:
        "Your personal entry count is on your dashboard when you're signed in: log in and open [My Account](/my-account) — it shows your entries for the current Major Draw, broken down by membership and one-time packs. I can't see your account from here, so I can't read out your exact number, but it's all there on your dashboard.",
      category: "SHOPPING",
    },
    {
      id: "30",
      question: "What membership tier am I on?",
      answer:
        "You can check your current tier when you're signed in: log in and open [My Account](/my-account) — your tier shows on your dashboard, and in **Settings → Subscription** alongside your next billing date. I can't see your account from here, so please check there for your exact tier.",
      category: "PAYMENTS",
    },
    {
      id: "31",
      question: "Did I win, and how do I check the draw result?",
      answer:
        "Winners are drawn on the 27th by an independent, government-certified random-draw service and are contacted directly. You can see each month's result on our public [Draw Results](/draw-results) page (it includes the verification link), and when you're signed in your past draws are in [My Account](/my-account) → Draws. I can't look up your personal result from here — please check those pages, and if you think you've won and haven't heard from us, [contact us](/contact).",
      category: "SHOPPING",
    },
    {
      id: "32",
      question: "How do I log in, or what if I can't?",
      answer:
        "Sign in from the [login page](/login). A few things that catch people out: if you created your account without setting a password, use the \"email me a sign-in code\" option instead of a password; \"Sign in with Google\" only works if you already have an account with that email (otherwise register first); and you can reset a password from the login page (the reset link is single-use and can be requested once every few minutes). Still stuck? [Contact us](/contact) and we'll help.",
      category: "PAYMENTS",
    },
    {
      id: "33",
      question: "I signed up but I'm not a member or I have no entries",
      answer:
        "Registering an account doesn't grant membership on its own — membership and entries are activated only once your first payment goes through. If you registered but haven't completed a purchase yet, you won't have entries and your account shows as a guest. Head to the [membership page](/membership) to choose a tier (or buy a one-time pack), and your entries appear right after payment. If you did pay and still don't see your membership, [contact us](/contact) and we'll sort it out.",
      category: "PAYMENTS",
    },
    {
      id: "34",
      question: "Is my payment information safe?",
      answer:
        "Yes. All card payments are processed securely by Stripe, and we never store your raw card number — only a secure Stripe reference is kept so renewals can run. Please don't share full card numbers or passwords with this chat or with support; you'll never need to.",
      category: "PAYMENTS",
    },
    {
      id: "35",
      question: "How long do you keep my data?",
      answer:
        "In short: your account information is kept while your account is active (and for a period afterwards as required by law), competition and transaction records are retained for several years to meet our legal obligations, and support-chat history is automatically deleted after 90 days. Signed-in members can also delete their chat history anytime from this chat widget. See our [privacy policy](/privacy) for the full detail.",
      category: "PAYMENTS",
    },
    {
      id: "36",
      question: "Do your prices include GST?",
      answer:
        "All prices are shown in Australian dollars. Entries into our draws are GST-free, so your membership and pack tax invoices show a GST amount of $0.00. (When our member shop launches, physical products in the shop will include 10% GST.) For anything specific about a tax invoice, [contact us](/contact).",
      category: "PAYMENTS",
    },
    {
      id: "37",
      question: "How do I update my card or account details?",
      answer:
        "It's all self-service in [My Account](/my-account) when you're signed in: update your saved card and payment details in **Settings**, manage your plan in **Settings → Subscription**, and update your profile (trade, state, email) on your account page. Your state matters because it affects draw eligibility. I can't make these changes for you from here, but they're quick to do there.",
      category: "PAYMENTS",
    },
    {
      id: "38",
      question: "How do I talk to a real person?",
      answer:
        "Happy to point you to a human. You can reach our support team anytime via the [contact page](/contact) — they typically reply within one business day. Tell them what you need — a billing question, a prize you've won, or a charge you don't recognise — and they'll help you directly.",
      category: "ALL QUESTIONS",
    },
  ];
}
