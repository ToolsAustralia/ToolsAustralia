import { rewardsEnabled } from "@/config/featureFlags";
import { rewardsDisabledMessage } from "@/config/rewardsSettings";
import type { FaqEntry } from "@/data/faqs";

/**
 * Support-chat (Cobber) FAQ corpus — the chatbot's knowledge, SEPARATE from the
 * public /faq page (which is `src/data/faqs.ts`, a small generic set the owner
 * controls). This expanded list feeds ONLY the chatbot: (1) the deflection matcher
 * (decisionTree intent rules + faqSearch cosine), and (2) the generated knowledge
 * pack the LLM is grounded on. It is NOT rendered on the /faq page.
 *
 * Add / edit support knowledge HERE (not by hand-copying prose into the knowledge-pack
 * builder), then re-run `npm run build:chat-knowledge-pack`.
 *
 * Customer-facing vocabulary: prefer "membership" over "subscription" in prose (per the
 * project naming rule). Membership management (cancel / pause / upgrade / downgrade /
 * reactivate / change tier / view renewal date + tier) lives on the **Membership** page
 * (`/my-account/membership`) via **Manage plan** (opens the Manage sheet). The old
 * "Settings → Subscription" tab was REMOVED in the 2026-07 dashboard revamp — never
 * reference it. Profile (trade / state / email) is still under **Settings**.
 *
 * Account-aware entries (ids 29, 30, 31, 37, 40, 55, 62, 68) deliberately recite NO
 * personal data — Cobber has no account access. They route the user to the right
 * self-service location (log in → My Account → …). This is navigation, not data
 * exposure. Their intent also has a matching note in the systemPrompt ACCOUNT
 * SELF-SERVICE MAP so the LLM path stays consistent with the deflection path.
 */
export function getSupportChatFaqEntries(): FaqEntry[] {
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
        "Tools Australia is a membership-driven monthly tool giveaway platform built for Australian tradies — electricians, plumbers, carpenters, builders, mechanics, and more. You get free entries into our Major Draw with every membership or one-time tool pack — the entries come free with the product; they're never sold on their own. All your entries go into each monthly Major Draw.",
      category: "SHOPPING",
    },
    {
      id: "2",
      question: "When is the Major Draw and how does it work?",
      answer:
        "The Major Draw runs on the 27th of every month. Entries freeze at 8:00 PM AEST/AEDT, and the draw goes live on Facebook at 8:30 PM. New purchases are blocked from 8:00 PM on the 27th until midnight (the start of the 28th). The winner is selected by a government-certified independent random-draw service — randomdraws.com.au — not by Tools Australia. The verification link is published on our [Draw Results](/draw-results) page after each draw.",
      category: "SHOPPING",
    },
    {
      id: "3",
      question: "What can I win?",
      answer:
        "Each month's Grand Winner builds their own prize. They match any toolbox (Monster Milwaukee, 470-piece Kincrome CONTOUR®, 356-piece Sidchrome, or the new 288-piece GEARWRENCH tool set & mobile workstation) with any power toolset (Milwaukee, DeWalt, Makita, Ryobi, or HiKOKI — each kit ships with its own brand storage system), and we add a $5,000 cash bonus on top. Or they skip the gear entirely and take a single $10,000 AUD tax-free cash prize straight to their bank account. You can build and preview any combination on the prize showcase on our [home page](/).",
      category: "SHOPPING",
    },
    {
      id: "4",
      question: "What are my membership options and how many entries do I get?",
      answer:
        "We have three monthly membership tiers (all prices in AUD): Tradie at $20/month includes 15 free entries per month; Foreman at $40/month includes 40 free entries; Boss at $80/month includes 100 free entries. Higher tiers also unlock a larger share of our partner discounts. Your free entries **build up while your membership stays active** — each renewal adds your tier's entries on top of the total you've already built, so a Tradie member is in with 15 free entries for their first draw, 30 for the next, 45 after that, and so on (Boss: 100, then 200, then 300). You can join on the [membership page](/membership).",
      category: "SHOPPING",
    },
    {
      id: "5",
      question: "Can I enter without a membership?",
      answer:
        "Yes. One-time tool packs let you enter the Major Draw without a monthly commitment — each pack includes free entries. Packs range from Apprentice ($25, 3 free entries) up to VIP ($1,000, 1,500 free entries). If you already have an active membership or entries in the current draw, you also unlock discounted Additional packs — the same free entries, in a pack priced at roughly half as much. Entries from one-time and Additional packs are valid for the current cycle only and do not carry forward.",
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
        "If you cancel mid-cycle, the entries you have already earned this cycle remain valid — they stay in the draw pool for the current month's draw on the 27th. Membership entries stop accumulating from the next renewal cycle. Entries from a one-time pack are always scoped to the cycle the pack was purchased in and do not carry forward regardless of membership status.",
      category: "SHOPPING",
    },
    {
      id: "8",
      question: "How do I get more entries?",
      answer:
        "There are several ways to earn more entries: subscribe to a higher membership tier; buy one-time, Additional, or Mini Draw packs; take a post-purchase upsell offer (heavily discounted bonus entries offered right after checkout); refer a friend (both you and your friend receive 100 bonus entries when they make their first purchase); or keep an eye out for promo codes and special campaigns.",
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
        "Your membership renews monthly on your own billing date — the day of the month you first joined. The one exception: if you join late in the month (the 25th, 26th, or 27th), your renewal is anchored to the 24th instead, so your payment settles a few days before the 27th Major Draw and your entries are confirmed in time. You can always see your exact next billing date in [My Account → Membership](/my-account/membership) → **Manage plan**.",
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
        "Active members unlock exclusive discounts with our partner brands — real savings on tools, equipment, and trade services. How many you can see depends on your tier: the Tradie membership unlocks 50% of them, Foreman 75%, and Boss 100%, while one-time packs open their own share for a set number of days. To redeem an offer, open the partner portal from [My Account → Rewards](/my-account/rewards) — you're signed in automatically, and each offer shows its redemption steps in the portal.",
      category: "PARTNERSHIPS",
    },
    {
      id: "77",
      question: "Can I see the partner discounts before I join?",
      answer:
        "Yes — the whole catalogue is open to read at [Partner discounts](/discount), no account needed. Every offer shows its partner, category and exactly what the deal is, whether you're signed in or not. What a membership buys is the ability to **redeem** an offer, not the ability to look at it. The list is grouped by the access level each offer needs, so you can see at a glance what your current access covers and what sits above it.",
      category: "PARTNERSHIPS",
    },
    {
      id: "78",
      question: "How do I find which partner offers my membership actually covers?",
      answer:
        "Two places, depending on what you're after. [Partner discounts](/discount) shows the full catalogue with a marker across the list at your access level — everything above it needs more access, and each of those offers will show you the cheapest membership and the cheapest one-time pack that reach it. If you'd rather see only what you can use right now, [My Account → Rewards → What your tier unlocks](/my-account/rewards/catalogue) filters to exactly that. Redeeming always happens in the partner portal, which you open from [My Account → Rewards](/my-account/rewards).",
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
        "You can cancel or turn off auto-renewal yourself at any time from [My Account → Membership](/my-account/membership) — sign in, open **Manage plan**, and use the cancellation option there. Entries already earned in the current cycle stay valid and remain in the draw pool. Membership fees are non-refundable once charged, but your Australian Consumer Law rights are always preserved. If you have trouble finding it, [contact us](/contact) and our support team will help.",
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
        "To close your account or request deletion of your personal data, please [contact us](/contact) — our support team will arrange it (account deletion isn't self-service, and some records are retained as required by law). Before closing, you may want to cancel your membership first from [My Account → Membership](/my-account/membership) → **Manage plan**. You can also clear your chat history yourself with the delete option inside the chat widget.",
      category: "PAYMENTS",
    },
    {
      id: "21",
      question: "I was charged unexpectedly — I didn't authorise a renewal",
      answer:
        "Your membership renews automatically each month on your own billing date (the day you joined) — you can see your exact next billing date in [My Account → Membership](/my-account/membership) → **Manage plan**. If you joined late in the month (the 25th–27th), that date is anchored to the 24th so your entries are confirmed before the 27th draw. You can turn off auto-renewal there at any time. If you believe a specific charge was made in error or without your consent, please [contact us](/contact) and our team will look into it.",
      category: "PAYMENTS",
    },

    // ── UPGRADE / DOWNGRADE / REACTIVATE / PAUSE ──────────────────────────────
    {
      id: "22",
      question: "What happens when I upgrade my membership?",
      answer:
        "Upgrading takes effect straight away. You pay the new tier's full monthly price immediately, your billing cycle resets to today, and the extra monthly entries are added to the current draw right away. You can upgrade from [My Account → Membership](/my-account/membership) → **Manage plan**. (Upgrades aren't available while a payment is past due — resolve that first.)",
      category: "PAYMENTS",
    },
    {
      id: "23",
      question: "What happens when I downgrade to a lower tier?",
      answer:
        "Downgrading costs nothing now and takes effect at the end of your current cycle. You keep your current tier's benefits and entries until then, and the lower tier (with its entries and partner access) begins on your next renewal. You'll see the exact switch-over date when you confirm in [My Account → Membership](/my-account/membership) → **Manage plan**.",
      category: "PAYMENTS",
    },
    {
      id: "24",
      question: "I cancelled or turned off auto-renew — how (and how long) do I have to restart my membership?",
      answer:
        "Welcome back! If you turned off auto-renew or scheduled a cancellation, your plan keeps running until your current paid period ends — and you can **Resume** it for free any time before then (there's a short grace window too), staying on your same tier. Once that access date has passed the membership is fully ended, so you'd resubscribe instead — and then you can pick any tier you like. Either way your entry history is preserved. Head to [My Account → Membership](/my-account/membership) → **Manage plan** to Resume or resubscribe, and [contact us](/contact) if you're unsure which applies to you.",
      category: "PAYMENTS",
    },
    {
      id: "25",
      question: "Can I pause my membership instead of cancelling?",
      answer:
        "When you start the cancellation flow in [My Account → Membership](/my-account/membership) → **Manage plan**, you may be offered alternatives to leaving — such as pausing for a short period or a limited-time discount on your next couple of months. These offers appear during the cancellation steps. If you don't see an option you need, [contact us](/contact) and our team will help.",
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
        "Yes. From time to time we run entry-multiplier promotions (like double-entry weekends) that multiply the entries on your purchase automatically, and some promos add a fixed number of bonus entries on top. You can also enter referral, promo, or campaign codes at checkout — these add bonus entries, they don't change the price. Keep an eye on our emails and the [promotions page](/promotions) for what's running this cycle.",
      category: "SHOPPING",
    },

    // ── JOINING / HOW MEMBERSHIP WORKS ───────────────────────────────────────
    {
      id: "28",
      question: "How do I become a member and how does membership work?",
      answer:
        "Becoming a member is simple: choose a monthly membership tier — Tradie ($20/month, 15 free entries), Foreman ($40/month, 40 free entries), or Boss ($80/month, 100 free entries) — and sign up on the [membership page](/membership) (or from [My Account](/my-account)). Your entries go into the monthly Major Draw straight away and accumulate each month while your membership stays active, and higher tiers unlock more of our partner discounts. Membership renews monthly and you can cancel anytime. Prefer no monthly commitment? You can also enter with one-time tool packs instead.",
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
        "You can check your current tier when you're signed in: log in and open [My Account](/my-account) — your tier shows on your dashboard, and on your [Membership](/my-account/membership) page alongside your next billing date. I can't see your account from here, so please check there for your exact tier.",
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
        "Sign in with your email and password from the [login page](/login), or use **Sign in with Google**. **Forgot your password?** On the login page tap **\"Forgot password?\"** (or go straight to [reset your password](/reset-password)), enter the email you joined with, and we'll email you a **single-use reset link** — it stays valid for 24 hours, and you can request a new one every 5 minutes. Open the link, choose a new password, and you're back in. Two things that catch people out: **\"Sign in with Google\"** only works if you already have an account with that email (otherwise register first), and if you get **\"no account found\"** when resetting, double-check the email address you used to join. Still stuck? [Contact us](/contact) and we'll help.",
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
        "It's all self-service in [My Account](/my-account) when you're signed in: update your saved card and payment details on your [Membership](/my-account/membership) page (Payment), manage your plan there via **Manage plan**, and update your profile (trade, state, email) in [Settings](/my-account/settings). Your state matters because it affects draw eligibility. I can't make these changes for you from here, but they're quick to do there.",
      category: "PAYMENTS",
    },
    {
      id: "38",
      question: "How do I talk to a real person?",
      answer:
        "Happy to point you to a human. You can reach our support team anytime via the [contact page](/contact) — they typically reply within one business day. Tell them what you need — a billing question, a prize you've won, or a charge you don't recognise — and they'll help you directly.",
      category: "ALL QUESTIONS",
    },
    {
      id: "39",
      question: "I have an active membership but I see 0 entries — why?",
      answer:
        "That's usually just timing, not a problem — and nothing has been lost. Your free membership entries are **credited into each Major Draw on your renewal (billing) date**, not on the 1st or on draw day. Each month's draw is its own pool, so once a draw is held (on the 27th) your entries for the **next** one land on your **next renewal date** — which means an active member can briefly see **0 for the upcoming draw** in the gap between the two. Your total isn't reset by that: every renewal credits your tier's entries **on top of the total you've already built**, so the number going into each draw keeps growing while your membership stays active (a Tradie member: 15, then 30, then 45; a Boss member: 100, then 200, then 300). They appear automatically on your renewal date — there's nothing you need to do. (If a renewal payment recently failed, they're credited as soon as you settle it.) You can see your exact renewal date on [My Account → Membership](/my-account/membership). If that date has passed and you still see 0, please [contact us](/contact) and we'll look into it. I can't see your account from here, so I can't read your live entry count.",
      category: "SHOPPING",
    },

    // ── REFERRALS & AFFILIATE ────────────────────────────────────────────────
    {
      id: "40",
      question: "How do I refer a mate, and where's my referral link or code?",
      answer:
        "Love that! Head to [My Account](/my-account) and open the \"Refer a Friend\" panel — that's where your personal referral code and shareable link live, ready to send to a mate. When your mate signs up with your code and makes their **first** purchase, **you both get 100 free bonus entries** dropped straight into the current monthly prize draw. If your code isn't showing up, give [our team](/contact) a shout and we'll sort it. I can't see your account from here, so I can't read out your code.",
      category: "REWARDS",
    },
    {
      id: "41",
      question: "Can I refer someone who already has an account or has already bought something?",
      answer:
        "Referrals are just for **brand-new mates** — the code only works for someone who hasn't made any purchase yet, so an existing customer who's already bought won't qualify. Each person can also only ever be credited to **one** referrer (first code used wins), so if your mate already applied someone else's code, a second one won't override it. For genuinely new mates though, share away — you'll both pick up 100 free bonus entries on their first purchase!",
      category: "REWARDS",
    },
    {
      id: "42",
      question: "Is there a limit on how many mates I can refer, and when do the bonus entries land?",
      answer:
        "No cap at all — refer as many mates as you like, and each successful referral stacks **another 100 free bonus entries** for you (there's no one-time limit). The entries land **immediately** when your mate completes their first purchase, going straight into the current monthly prize draw for both of you. You can watch your successful referrals tally up in the \"Refer a Friend\" panel on [My Account](/my-account).",
      category: "REWARDS",
    },
    {
      id: "43",
      question: "Is there an affiliate program — can I earn commission, and how's it different from referring a mate?",
      answer:
        "Two different things! **Referring a mate** is open to every member — you share your code and you both get 100 free bonus entries when they first buy. The **affiliate program** is a separate partner arrangement that earns a cash commission (30% by default) and is set up by our team, not self-serve. If you'd like to be considered as an affiliate, [get in touch](/contact) and we'll take it from there.",
      category: "PARTNERSHIPS",
    },

    // ── ACCOUNT & AUTH ───────────────────────────────────────────────────────
    {
      id: "44",
      question: "Do I have to verify my email to use my membership?",
      answer:
        "No — verifying your email is optional and never required to use your membership or to receive your free entries. Your account works and your entries are granted whether or not your email is verified. The one place it matters is signing in with an emailed one-time code — for that we need to confirm your address. You can always verify later from [My Account → Settings](/my-account/settings).",
      category: "ALL QUESTIONS",
    },
    {
      id: "45",
      question: "I signed up with Google — can I add an email + password, and how do I change my password?",
      answer:
        "Yes — if you joined with Google (or another passwordless method) you can set a password from [My Account → Settings](/my-account/settings). Since there's no existing password on the account, it's a first-time set, so you won't be asked for a current password — just choose a new one and you'll then be able to sign in with email + password too. If your account already has a password, the same Settings area lets you change it, and you'll need to enter your current one first. If anything looks off, [contact us](/contact) and we'll help.",
      category: "ALL QUESTIONS",
    },
    {
      id: "46",
      question: "Why does it say 'This account has been deactivated' when I try to log in?",
      answer:
        "That message means the account itself has been deactivated, so sign-in is blocked — it isn't a password problem, and resetting your password won't restore access. To have it looked into and reactivated, please [contact us](/contact) and our team can help sort it out.",
      category: "ALL QUESTIONS",
    },

    // ── PROMO CODES & AFTER-CHECKOUT OFFER ───────────────────────────────────
    {
      id: "47",
      question: "I entered a promo code at checkout but it said invalid — why?",
      answer:
        "A promo code has to be 6–32 characters (letters, numbers and hyphens), so a stray space or typo is the most common culprit. Beyond format, a code is turned down if it's inactive, expired, already used on your account (they're one-use-per-member), or set for a different audience (for example, returning members only). Promo codes also only add free bonus entries on a **membership or one-time pack** — they don't apply to Mini Packs or the after-checkout offer. Double-check the exact spelling, and if it still won't take, [contact us](/contact) and we'll check that specific code for you.",
      category: "REWARDS",
    },
    {
      id: "48",
      question: "Do bonus entries from a promo code, referral, or the after-checkout offer carry forward, or only this draw?",
      answer:
        "Free bonus entries from a promo code, a referral, or the after-checkout offer all count toward the **current major draw** only — like the free entries in a one-time pack, they're scoped to that draw and don't roll into future ones. The only entries that carry forward month to month are the free entries included with an **active membership**, which keep accumulating while your membership stays active. You can see your current draw entries anytime on [My Account](/my-account).",
      category: "REWARDS",
    },
    {
      id: "49",
      question: "That discounted bonus-entries offer right after I paid — is it a one-off or another subscription?",
      answer:
        "That offer right after checkout is a genuine **one-off** — a single payment tied to that order at a discounted price, not a new subscription and not a recurring charge, so you won't be billed for it again. It simply adds more free bonus entries to your current draw. You can review any charges under [My Account → Membership](/my-account/membership), and if something looks unexpected, [contact us](/contact).",
      category: "PAYMENTS",
    },
    {
      id: "50",
      question: "If a 2× entries promo is running, does it also apply to the after-checkout offer?",
      answer:
        "Yes — when a multiplied entries promo (like a 2× entries promo) is live, it stacks with the after-checkout offer. The offer's free entries are worked out as the active promo multiplier × the offer's own multiplier × its base entries, so a running promo increases that bonus too. For a mini after-checkout offer the offer's own multiplier is fixed at 1×, so it still picks up the promo on its base entries.",
      category: "REWARDS",
    },

    // ── UPGRADE / DOWNGRADE / ANCHOR BILLING ─────────────────────────────────
    {
      id: "51",
      question: "If I upgrade to a higher tier mid-cycle, do I keep the free entries I've already built up? And do I get credit for the unused days on my old tier?",
      answer:
        "Good news on your entries: upgrading mid-cycle keeps everything you've already built up. Your accumulated free entries carry over, and on top of that your new tier's free entries are added right away, so you're never worse off for upgrading early. On the billing side, an upgrade charges the new tier's full price straight away and resets your billing cycle to that date — there's no pro-rata credit for the unused days on your old tier, so it's usually best to upgrade close to your renewal date. You can review your tier and renewal date any time in [My Account → Membership](/my-account/membership).",
      category: "PAYMENTS",
    },
    {
      id: "52",
      question: "If I downgrade to a cheaper tier, will I lose the free entries I've accumulated?",
      answer:
        "No — downgrading doesn't wipe the free entries you've built up; your accumulated entries carry forward. You stay on your current tier until the end of the cycle you've already paid for, and the cheaper tier (with its lower monthly free-entry base) takes effect from your next renewal. So each renewal going forward gives you the new tier's monthly free entries plus whatever you've carried over. You can see your current tier and next renewal date in [My Account → Membership](/my-account/membership).",
      category: "PAYMENTS",
    },
    {
      id: "53",
      question: "I joined late in the month and paid full price but I renew on the 24th — did I overpay for a short first period?",
      answer:
        "You haven't been short-changed. If you joined on the 25th, 26th, or 27th, your renewal is anchored to the 24th so you always have a few days to sort out any renewal payment before the monthly prize draw period. You paid the normal full package price at signup (it's never prorated) and you received the full benefits and free entries that come with your pack straight away — the period up to the 24th is a genuine full inclusion, not a partial one. You can check your renewal date any time in [My Account → Membership](/my-account/membership), and if anything looks off, [contact us](/contact).",
      category: "PAYMENTS",
    },

    // ── PAST-DUE & LIFECYCLE ─────────────────────────────────────────────────
    {
      id: "54",
      question: "I'm past due and want to cancel — do I keep access until the end of the month like a normal cancellation?",
      answer:
        "Past due works differently from a normal cancellation. If a renewal payment has failed and your account is past due, cancelling ends your membership **immediately** — there's no paid period left to run out, so it won't carry through to the end of the month the way a regular cancellation does. Any free entries you already earned this cycle stay valid in the draw pool. You can do this from [My Account → Membership](/my-account/membership) → **Manage plan**, or [contact us](/contact) if you'd rather settle the outstanding payment first.",
      category: "PAYMENTS",
    },
    {
      id: "55",
      question: "I was past due and just paid to catch up — when am I charged next?",
      answer:
        "Once your catch-up payment clears, your billing date resets: your next charge lands about **one month from the day you caught up**, not your old renewal date. (If that day happens to fall on the 25th, 26th, or 27th, it shifts to the 24th so there's a buffer before the monthly draw.) Your benefits and free entries switch back on straight away. You can see your exact next renewal date on [My Account → Membership](/my-account/membership) — if it looks off, [contact us](/contact). I can't see your account from here, so I can't read your live billing date.",
      category: "PAYMENTS",
    },
    {
      id: "56",
      question: "While past due, do I keep my free entries and partner discounts?",
      answer:
        "While a renewal is unpaid and your membership sits in a past-due state, member benefits are paused — partner-discount access is on hold and the new cycle's free entries haven't been credited yet. The good part: any free entries you already earned in earlier cycles stay safe in the draw pool, and the moment your payment goes through, your benefits and the new entries are reinstated. You can retry the payment from [My Account → Membership](/my-account/membership), and [contact us](/contact) if you need a hand.",
      category: "PAYMENTS",
    },
    {
      id: "57",
      question: "What if I never fix my failed renewal — does my membership auto-cancel?",
      answer:
        "No — a failed renewal won't automatically cancel your membership. We pause collection so no new charges stack up, and your subscription simply waits for you: you can retry the payment whenever you're ready and pick up right where you left off. Until it's settled, your member benefits stay paused. Head to [My Account → Membership](/my-account/membership) to retry, or [contact us](/contact) if the payment won't go through.",
      category: "PAYMENTS",
    },
    {
      id: "58",
      question: "My membership shows 'trial' or 'trialing' — did I not pay, or is it a free trial?",
      answer:
        "No free trial here — if your membership shows 'trial' or 'trialing' (usually on a payment receipt), you were still charged the full price at signup. It's just a billing label we use to line your renewal up with the 24th of the month; your membership is fully active, with benefits and free entries live from day one. Your account itself shows your plan as **Active** on [My Account → Membership](/my-account/membership). If anything looks off, [contact us](/contact).",
      category: "PAYMENTS",
    },
    {
      id: "59",
      question: "How long does pausing my membership last, and what happens to my entries and billing?",
      answer:
        "If you take the pause offer during the cancellation flow, your membership pauses for **30 days** and then resumes automatically — you don't have to do anything. While paused you aren't billed, and your free entries are frozen rather than lost: nothing new is added, but everything you've already earned stays put and starts accruing again once the plan restarts. The pause is a one-time option and only appears when you begin cancelling from [My Account → Membership](/my-account/membership) → **Manage plan**. Need something different? [contact us](/contact).",
      category: "PAYMENTS",
    },

    // ── PARTNER DISCOUNTS — ADVANCED ─────────────────────────────────────────
    {
      id: "60",
      question: "I'm a Tradie member but bought a higher one-time pack (like a Boss or VIP pack) — do I get extra partner discounts, or does my 50% still apply?",
      answer:
        "Partner-discount access isn't stacked or added together — at any moment you get the single highest active tier across your membership and any active packs. Your Tradie membership unlocks 50% of our partner discounts, but while a higher pack's window is running its access takes over automatically (a Boss one-time pack opens more of them, a VIP one-time pack opens the whole set); once that pack window ends you simply drop back to your membership's 50%. You can see your current effective access and which packs are live any time on [My Account → Rewards](/my-account/rewards).",
      category: "REWARDS",
    },
    {
      id: "61",
      question: "If I cancel my membership, do I keep partner discounts until my paid cycle ends? What about a pack I bought?",
      answer:
        "Your membership's partner-discount access is tied to your membership being active, so with a standard end-of-period cancellation you keep it right through to your paid-up renewal date — it ends when the membership actually lapses, not the moment you hit cancel. Any one-time pack you bought is completely separate: its partner-discount window runs to its own expiry regardless of what happens to your membership, so you keep that pack's access even after the membership ends. You can check both your membership status and any active pack windows on [My Account → Rewards](/my-account/rewards).",
      category: "REWARDS",
    },
    {
      id: "62",
      question: "I bought a pack but my partner-discount access says 'upcoming' / hasn't started — why?",
      answer:
        "Partner-discount windows run one at a time, not all at once. If you buy a pack at the same tier as one that's already active, the new pack queues up behind it and its window starts the moment the current one finishes — so 'upcoming' just means it's next in line, and none of your paid access is lost (a higher-tier pack is the exception: it jumps ahead and takes over straight away). You can see the running window and what's queued on [My Account → Rewards](/my-account/rewards); if a pack still shows upcoming after the active window should have ended, [contact us](/contact) and we'll sort it out.",
      category: "REWARDS",
    },

    // ── MINI DRAWS & PRIZES ──────────────────────────────────────────────────
    {
      id: "63",
      question: "How is a Mini Draw winner chosen, and when will my Mini Draw be drawn?",
      answer:
        "Each Mini Draw runs until it fills its set number of entries — once it hits that point it automatically closes to new entries, and a winner is then picked at random using an independent, government-approved random-draw tool. Every draw, both major and mini, is independently certified by randomdraws.com.au, and the winner is contacted directly. Because a Mini Draw is drawn once it fills, the timing depends on how quickly that particular draw reaches its target — you can see which draws are open on the [Mini Draws page](/mini-draws) and past results on the [Winners wall](/winners).",
      category: "ALL QUESTIONS",
    },
    {
      id: "64",
      question: "If I win, will you post my full name publicly?",
      answer:
        "No — we never publish a winner's full surname or contact details. On the public [Winners wall](/winners) we only ever show your first name plus the initial of your last name (for example \"John D.\") alongside your state. Your full details stay private and are only used by our team to get in touch and organise your prize.",
      category: "ALL QUESTIONS",
    },
    {
      id: "65",
      question: "If I win, do I have to pay anything to claim the prize or get the tools delivered?",
      answer:
        "Not at all — there's no claim fee and no delivery charge. If you take the cash option, it goes straight to your bank account, and if you take the tool prize, our team arranges delivery for you. After the live draw we contact the winner directly and handle all the logistics from there, so there's nothing to pay to receive your prize. You can read the full details on our [terms page](/terms).",
      category: "ALL QUESTIONS",
    },
    {
      id: "66",
      question: "The Mini Draw I wanted already has a winner — is that it, or will it run again?",
      answer:
        "A Mini Draw can run again — many of them cycle through multiple rounds, each with its own separate winner. When a new round opens it starts fresh, so entries from a previous round don't carry over into the next one. Keep an eye on the [Mini Draws page](/mini-draws) to catch the next round of the prize you're after.",
      category: "ALL QUESTIONS",
    },
    {
      id: "67",
      question: "If I get a refund on a pack or membership, do I lose the free entries it gave?",
      answer:
        "Yes — the free entries are a bonus inclusion tied to that purchase, so if the payment is refunded or reversed, the entries that came with it are removed too. In practice this only comes up with genuine billing-error or one-time pack refunds, since memberships aren't refundable once charged and you keep your benefits and entries through the paid cycle. If you think entries were removed in error, please [contact us](/contact) and we'll sort it out.",
      category: "PAYMENTS",
    },
    {
      id: "68",
      question: "Where do I see the Mini Draws I've entered and my mini-draw entries?",
      answer:
        "Your Mini Draw entries are tracked separately from your Major Draw entries, so they won't show up in the main entry count on your dashboard. To see the Mini Draws you're in, head to the [Mini Draws page](/mini-draws), and you can manage the rest of your account from [My Account](/my-account). If something looks off or an entry seems to be missing after a purchase, [contact us](/contact) and we'll take a look. I can't see your account from here, so I can't read your live entries.",
      category: "ALL QUESTIONS",
    },

    // ── MEMBERSHIP STREAK ────────────────────────────────────────────────────
    {
      id: "69",
      question: "What is the Membership Streak and what do I get for it?",
      answer:
        "The Membership Streak rewards you for keeping your membership going month after month. Every consecutive monthly renewal builds your streak — your first renewal takes it to 1, and the rewards start at your 2nd. Milestone renewals include bonus free entries on top of your membership's usual monthly entries: +100 at your 2nd renewal, +200 at your 4th, +300 at your 6th, +400 at your 8th, +500 at your 10th, and +600 at your 12th — where you also earn the permanent Founding member badge. The free entries are added automatically to that month's Major Draw when the milestone renewal goes through — nothing to claim. After 12 renewals the ladder starts again for your next membership year, so the milestones keep coming for as long as you stay. You can see your streak on your [My Account](/my-account) dashboard.",
      category: "REWARDS",
    },
    {
      id: "70",
      question: "Will I lose my streak if a payment fails, I pause, or I cancel my membership?",
      answer:
        "The streak is built to be forgiving. A failed renewal payment doesn't break it — fix your card or catch up on the payment and your streak carries straight on. If you pause your membership through the pause offer, the streak freezes and resumes when you come back. If you cancel and rejoin within 30 days of your membership ending, your streak continues from where it left off. Upgrading or downgrading your tier never affects it. Only a full lapse — being without a membership for more than 30 days — resets the streak to zero, and even then you can earn every milestone again on your new streak. Manage your membership any time from [My Account → Membership](/my-account/membership).",
      category: "REWARDS",
    },
    {
      id: "71",
      question: "Where do I see my streak and the free entries my streak milestones gave me?",
      answer:
        "Your streak lives on your [My Account](/my-account) dashboard — the Streak card shows your current streak, your next milestone, and the free entries it will include. When a milestone lands, its free entries appear as their own \"Streak\" portion of your entry total and are already in that month's Major Draw — no claiming needed. I can't see your account from here, so I can't read your live streak or entry count; if a milestone renewal has gone through and the free entries haven't appeared, [contact us](/contact) and we'll take a look.",
      category: "REWARDS",
    },

    // ── PARTNER PORTAL — LOCKED OFFERS ───────────────────────────────────────
    {
      id: "72",
      question: "Why can't I redeem an offer in the partner portal?",
      answer:
        "Each partner discount unlocks at a set access percentage, and your access comes from your membership tier or an active one-time pack — the Tradie membership unlocks 50% of them, Foreman 75%, and Boss 100%, while one-time packs open their own share for a set number of days and Mini Packs include a smaller time-limited slice. If an offer shows as locked in the partner portal, your partner access doesn't reach it yet. Upgrading your membership or grabbing a one-time pack on the [membership page](/membership) unlocks it straight away — then head back to the portal to redeem it.",
      category: "REWARDS",
    },

    // ── PARTNER PORTAL — WHAT GETS SHARED ────────────────────────────────────
    {
      id: "73",
      question: "What details do you share with the partner rewards portal?",
      answer:
        "The rewards catalogue runs on a partner platform, so the first time you open it we show you exactly what gets shared and ask you to agree before anything leaves us. We send three things: your name, your email address, and an internal account reference so your redemptions link back to your membership. Your card and payment details, your billing address and your draw entry history never leave Tools Australia. You'll only be asked once — but if we ever change what's shared, we'll ask again before that change applies. You can read the details on the consent screen itself when you open the portal from [My Account → Rewards](/my-account/rewards).",
      category: "REWARDS",
    },
    {
      id: "74",
      question: "Do I have to agree to open the partner portal?",
      answer:
        "Opening the partner portal is optional — you can choose \"Not now\" on the consent screen and nothing is shared and nothing changes on your account. You just won't be able to browse or redeem partner offers until you continue, because the portal can't create your account there without your name and email. Everything else in your membership is unaffected: your free entries, the monthly prize draws and the rest of your account all work exactly the same either way.",
      category: "REWARDS",
    },

    // ── PARTNER PORTAL — THE PLATFORM'S OWN UI ───────────────────────────────
    // The portal is a white-labelled third-party platform, so it ships surfaces that are
    // NOT part of Tools Australia's product: a points wallet we do not operate, and an
    // editable profile that is the platform's copy rather than the TA account. Members
    // WILL ask about both. Without these two entries Cobber's nearest neighbours are the
    // TA rewards-points entry and the TA profile entry — i.e. it would confidently give
    // the wrong answer. (Portal audit, 2026-07-31.)
    {
      id: "75",
      question:
        "The rewards portal shows \"Your Points: 0\" and \"$0.00 savings\" — how do I earn those points?",
      answer:
        "Those counters belong to the partner platform that runs the rewards catalogue, not to Tools Australia — we don't run a points currency there, so they stay at zero for every member and there's nothing you're missing out on. Your Tools Australia benefits are the free entries that come with your membership or pack, and the partner discounts themselves. Redeem an offer and you save at the merchant directly; the portal's own savings counter may not reflect it. If you're after your entries or your membership details, those live on [My Account](/my-account).",
      category: "REWARDS",
    },
    {
      id: "76",
      question:
        "If I change my name, email or password inside the rewards portal, does it update my Tools Australia account?",
      answer:
        "No — the partner platform keeps its own copy of your details, so anything you edit over there stays over there and won't reach Tools Australia. It also won't change how you sign in with us: you always reach the portal by opening it from [My Account → Rewards](/my-account/rewards), which signs you in automatically, so a password set inside the portal isn't one you need. To change the details we actually hold, use [My Account → Settings](/my-account/settings) — and if your portal details already look out of date, updating them with us is the change that matters.",
      category: "REWARDS",
    },

    // ── GAPS FOUND IN LIVE TRANSCRIPTS (2026-08-11) ──────────────────────────
    // Each of these is a question real customers asked that Cobber answered
    // with "I don't have that information". Sources are cited per entry so the
    // facts can be re-verified rather than trusted.
    {
      id: "77",
      question:
        "Where do I watch the live draw — what's your Facebook page?",
      answer:
        "The Major Draw is streamed **live on Facebook at 8:30 PM AEST/AEDT on the 27th**, right after entries freeze at 8:00 PM. Our page is [facebook.com/toolsaust](https://www.facebook.com/toolsaust) — that's where the stream runs, and it's the same page linked from our [contact page](/contact). If you miss it, every result plus the independent verification link is published on the [Draw Results](/draw-results) page afterwards.",
      category: "ALL QUESTIONS",
    },
    {
      id: "78",
      question: "Do you have a mobile app I can download?",
      answer:
        "Not yet. A native **Android** app for the Google Play Store is planned but hasn't been built — and an iPhone/iOS app isn't on the roadmap at this stage. For now everything works in your phone's browser: sign in at [My Account](/my-account) and you can check your entries, manage your membership, and buy packs exactly as you would on a computer. You can add the site to your home screen if you'd like it to open like an app.",
      category: "ALL QUESTIONS",
    },
    {
      id: "79",
      question:
        "How many people enter the draw? Is there a limit on entries?",
      answer:
        "We don't publish how many members or entries are in a draw — that's not something we share. What we can tell you is there's **no cap on entries for you**: you can hold as many free entries as your membership and packs include, and there's no limit on how many one-time or Additional packs you buy, or how many mates you refer (each referral adds 100 free bonus entries for both of you once they make their first purchase). Every entry you hold goes into that month's Major Draw. You can see your own total any time on your [My Account](/my-account) dashboard.",
      category: "SHOPPING",
    },
    {
      id: "80",
      question:
        "I was offered something cheap right after checkout — what was that?",
      answer:
        "That's our post-purchase offer: a one-off, heavily discounted pack shown once, straight after you've paid, which **includes extra free entries** for the draw you've just entered. It's entirely optional, it's only available on that screen, and declining it doesn't affect the pack you already bought. If you took it, it appears as a separate small charge alongside your original purchase. To see exactly what you bought and what entries it included, sign in and check [My Account](/my-account) — and if the charge doesn't look right, [contact us](/contact) and our team will pull up your order.",
      category: "PAYMENTS",
    },
    {
      id: "81",
      question: "Who won the last draw — are winners announced publicly?",
      answer:
        "Yes. Every Major Draw winner is published on our [Draw Results](/draw-results) page, shown as their first name and last initial (like \"John D.\") along with their state and the prize they took — plus the verification link from randomdraws.com.au, the independent service that picks the winner. Winners are also contacted directly by our team, and the draw itself is streamed live on [Facebook](https://www.facebook.com/toolsaust). We don't share any more of a winner's details than that. I can't look results up from here, so head to [Draw Results](/draw-results) for the latest.",
      category: "ALL QUESTIONS",
    },
  ];
}
