# Config & Data domain

Static config (feature flags, brand theme, prizes), constants (z-index, legal, promo banner), seed data (australian states, professions, sample products/users/winners).

## FAQ data — TWO separate sources (decoupled 2026-07-07)

- **`src/data/faqs.ts`** — feeds the **`/faq` page ONLY**. This is the small, generic owner-controlled set (order/shipping/payment/rewards/partner). Do **not** add chatbot knowledge here — the page is the owner's, kept as-is. It still exports the shared `FaqEntry` type + `faqCategories`.
- **`src/data/supportChatFaqs.ts`** — the **Cobber chatbot corpus** (`getSupportChatFaqEntries()`). Feeds ONLY the chatbot: the **deflection matcher** (decisionTree intent rules + faqSearch TF-IDF cosine) and the generated **knowledge pack** the LLM is grounded on. It is NOT rendered on the `/faq` page. Add support knowledge HERE (never by hand-copying prose into the pack builder), then re-run `npm run build:chat-knowledge-pack`. Answers support markdown (rendered via `ChatMarkdown` in the widget).

**Vocabulary:** customer-facing copy says **"membership"**, not "subscription" (project naming rule). Membership management (cancel / pause / upgrade / downgrade / reactivate / view tier + renewal) lives on **My Account → Membership → Manage plan** — the old **"Settings → Subscription"** tab was **REMOVED** in the 2026-07 dashboard revamp; never reference it. Test `test:chat-faqs` enforces "Membership entries" present, "subscription entries" absent, and NO "Settings → Subscription".

**Login / forgot-password (id 32, verified 2026-07-07):** the `/login` page offers **email + password** or **Sign in with Google** only. Forgot-password: click **"Forgot password?"** → `/reset-password` → enter email → **single-use reset link** (valid 24h; one request per 5 min; "no account found" if the email isn't registered). There is **NO "email me a sign-in code"** option on the login page (the `passwordless-login` route is **SMS-OTP** and not exposed there) — the FAQ was corrected to drop that false claim.

**Chatbot corpus entries (`supportChatFaqs.ts`, as of 2026-07-07):**

| id | Question | Category |
|----|----------|----------|
| 1–9 | What is TA, draw date/mechanics, prizes, tiers, packs, mini draws, carry-forward, more entries, eligibility | SHOPPING |
| 10–13 | Payment methods, renewal date (24th), refund policy, failed payment (id 13 enhanced: in-app retry tip) | PAYMENTS |
| 14–15 | Rewards points, shop (coming soon) | REWARDS |
| 16–17 | Partner discounts, become a partner | PARTNERSHIPS |
| 18 | **How to cancel / stop auto-renewal** — self-service path: My Account → Settings → Subscription tab | PAYMENTS |
| 19 | **Refund policy** — non-refundable + ACL rights + escalation path | PAYMENTS |
| 20 | **Delete account / data** — contact support; cancel via Subscription tab first | PAYMENTS |
| 21 | **Unexpected/unauthorised charge** — explains 24th auto-renewal; how to turn off; escalate disputes | PAYMENTS |
| 22 | **Upgrade membership** — takes effect immediately, billing cycle resets, entries added right away | PAYMENTS |
| 23 | **Downgrade membership** — takes effect at end of current cycle; lower tier begins on next renewal | PAYMENTS |
| 24 | **Restart / reactivate membership** — reactivate existing plan or resubscribe to any tier | PAYMENTS |
| 25 | **Pause membership** — alternatives to cancelling offered during the cancellation flow | PAYMENTS |
| 26 | **Setup after first purchase** — trade + state details; state affects draw eligibility | SHOPPING |
| 27 | **Entry promotions / bonus-entry deals** — multiplier promos, fixed bonus entries, promo codes at checkout | SHOPPING |
| 28 | **How to become a member / how membership works** — pick a tier, sign up at `/membership`, entries accumulate | SHOPPING |
| 29 | **Where can I see my entries** _(account-aware — navigation only)_ → My Account dashboard | SHOPPING |
| 30 | **What tier am I on** _(account-aware)_ → My Account → Settings → Subscription | PAYMENTS |
| 31 | **Did I win / how to check draw results** _(account-aware)_ → Draw Results + My Account → Draws | SHOPPING |
| 32 | **How do I log in / can't log in** — passwordless code, Google-needs-account, password reset | PAYMENTS |
| 33 | **Signed up but not a member / no entries** — registration ≠ membership until payment | PAYMENTS |
| 34 | **Is my payment information safe** — Stripe only; no raw card numbers stored | PAYMENTS |
| 35 | **How long do you keep my data** — chat 90 days; account/records per privacy policy | PAYMENTS |
| 36 | **Do prices include GST** — entries GST-free; invoice GST line $0.00; future shop +10% | PAYMENTS |
| 37 | **Update card / account details** _(account-aware)_ → My Account → Settings | PAYMENTS |
| 38 | **Talk to a real person** — escalation → `/contact`; also catches prize-fulfilment + duplicate-charge disputes | ALL QUESTIONS |

Entries 18–21 are the premeditated answers for the top-volume support inbox questions (cancel, refund, delete, unexpected charge). Entries 22–27 cover upgrade/downgrade/reactivate/pause lifecycle transitions plus onboarding setup and promo deals. Entries 28–38 (added 2026-06-27) close the answer-quality gaps the support-quality audit found: joining/how-membership-works, **account-aware navigation** (29/30/31/37 — they recite NO data, only point to My Account), login/data/GST/safety knowledge, and a human-escalation route. All wired into `decisionTree.ts` (high-precision intent rules placed first) for zero-LLM deflection. See `docs/ai-chatbot/gotchas.md` (the 2026-06-27 answer-quality overhaul) and `docs/ai-chatbot/implementation-spec.md`.
> **`partnerBrandOffers.ts` (2026-07-02):** `PartnerBrandOffer` gained a `category` field (short label — Vehicle / Media / Supply / Trade / Auto / Tools) shown in the dashboard partner deal rows. Additive; the Unlock-Discounts grid is unaffected.

> **`dashboardFeatures.ts` (2026-07-02):** `DASHBOARD_FEATURES` — off-by-default visibility switches for member-dashboard features that are **built but hidden** (`milestoneProgress`, `personalWins`, `orderHistory`, `loyaltyStreak`). The UI is fully implemented and mounted behind these flags; flip one to `true` (once its backing endpoint lands) to surface it. `isDashboardFeatureOn(feature)` reads them. This is a small visibility map, not flag infrastructure — see the dashboard revamp spec (`docs/superpowers/specs/2026-07-02-user-dashboard-revamp-foundation-home-design.md`).
> **`cobberSupport` flipped ON (2026-07-07):** the "Ask Cobber" dashboard support card is now **live** — its "Start a chat" button opens the Cobber support-chat panel (the floating bubble is suppressed on `/my-account` so the card is the single entry point). See [ai-chatbot/merge-to-main.md § 4a](../ai-chatbot/merge-to-main.md) + [dashboard-account/frontend.md](../dashboard-account/frontend.md).

## Index

- [architecture.md](./architecture.md) — config vs constants vs data
- [frontend.md](./frontend.md) — _Read by both client + server_
- [backend.md](./backend.md) — Read by server code
- [api.md](./api.md) — _N/A_
- [rules.md](./rules.md) — when to put in DB vs code, fixture vs prod
- [patterns.md](./patterns.md) — feature flags, package config
- [gotchas.md](./gotchas.md) — fixture-as-prod-fallback risk
- [models.md](./models.md) — _N/A_
- [testing.md](./testing.md) — _TODO_

## Membership Streak ladder config (P3 — 2026-07-07)

`src/config/streakMilestones.ts` — the SINGLE client-side source for the streak reward ladder (rungs 2/4/6/8/10/12 → +100…+600 free entries, repeating every 12 renewals). MUST mirror the seeded `MilestoneReward` rows (`scripts/seed-streak-milestone-rewards.ts`); every UI surface (streak card rail, milestones track, guest teaser, wallet, future cancellation stakes) reads from it. Helpers: `nextStreakMilestone(streak)` (annual-repeat aware — streak 13 → Lv.14 +100), `isRungEarned(rungLevel, streak)` (year-cycle position).

## Dashboard streak flags ship DARK (2026-07-15)

`DASHBOARD_FEATURES.loyaltyStreak` + `milestoneProgress` are **false** until the streak launch runbook completes (backfill → seed markers → activate → flip flags). The card/toast copy promises "+N free entries, automatic" — showing it while rungs are `isActive:false` would assert grants that never happen, and rungs crossed in that window would be marker-stamped at seed time and never paid. The full runbook is documented on the flag in `src/config/dashboardFeatures.ts`.

## Cobber streak FAQs (2026-07-15)

`src/data/supportChatFaqs.ts` ids **69–71** (REWARDS): what the Membership Streak is + the ladder, continuity rules (failed payment / pause / 30-day rejoin grace / reset), and where to see it. The corpus-size assertion in `src/data/__tests__/faqs.test.ts` is pinned at 71 — bump it deliberately when adding entries (CLAUDE.md rule 5c).
