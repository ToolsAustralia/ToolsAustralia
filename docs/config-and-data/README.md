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

`DASHBOARD_FEATURES.loyaltyStreak` + `milestoneProgress` are **false in git** until the streak launch runbook completes against the PRODUCTION database (backfill → seed markers → activate → flip flags). The card/toast copy promises "+N free entries, automatic" — showing it while rungs are `isActive:false` would assert grants that never happen, and rungs crossed in that window would be marker-stamped at seed time and never paid. The full runbook is documented on the flag in `src/config/dashboardFeatures.ts`.

**Local preview:** set `NEXT_PUBLIC_DASHBOARD_STREAK_PREVIEW=true` in `.env.local` (registered in `.env.example`; never set in Vercel). Both flags read the override via the `STREAK_PREVIEW` const, so git stays dark with a clean working tree — no uncommitted code flip needed. Only meaningful once the runbook has run against the DB your `.env.local` points at (the owner's dev DB completed a full rehearsal 2026-07-15: rungs active + 548 markers, zero stray grants). At production launch (step 4) replace `STREAK_PREVIEW` with `true` on both flags and deploy.

## Cobber partner-portal redemption model (2026-07-28, panel-fix F-007)

FAQ **16** no longer says "mention Tools Australia when dealing with the partner brand" (the pre-portal
redemption model) and no longer links `/partner` (that page is the **B2B become-a-partner form**, not a
discount list — latent bug). Both FAQ 16 and FAQ 72 now describe the ONE redemption model: open the
partner portal from **My Account → Rewards** (signed in automatically), each offer shows its steps in
the portal; tier wording disambiguated ("the Tradie **membership** unlocks 50%…" — the Tradie *Pack* is
40%) and Mini Packs' smaller time-limited slice named. **Launch coupling (CLAUDE.md 5c) — a SEQUENCING note, NOT a code task.** This copy describes the
portal-live world, so ideally the merge and the SSO flag flip land close together. **Do not build
anything for this** — no flag-gated FAQ copy, no conditional answers (owner call, 2026-07-28: the
vendor portal goes live ~2026-07-31, so any gap is a few days of a slightly early FAQ answer and
self-resolves). If a future session finds this note, the correct action is to check whether the flag
is already on, not to add machinery. Corpus count stays 72.

## Cobber speaks ONE spelling: "catalogue" (2026-07-28, panel F-049)

The FAQ 16/72 rewrite introduced British "catalogue" while the older entries and the pack builder still
said US "catalog", so a single conversation could contain both. FAQ 4 and 28 plus five lines in
`scripts/build-chat-knowledge-pack.ts` were converted; the generated pack now holds **17 "catalogue"
and 0 US "catalog"**, matching every rendered UI string. Keep new copy British — the pack is generated,
so fixing prose in the builder is as load-bearing as fixing it in the corpus.

## Cobber streak FAQs (2026-07-15)

`src/data/supportChatFaqs.ts` ids **69–71** (REWARDS): what the Membership Streak is + the ladder, continuity rules (failed payment / pause / 30-day rejoin grace / reset), and where to see it.

## Cobber partner-portal locked-offer FAQ (2026-07-24)

`src/data/supportChatFaqs.ts` id **72** (REWARDS, "PARTNER PORTAL — LOCKED OFFERS" section): why an offer in the partner portal shows as locked — each offer unlocks at an access percentage from the member's membership tier or active one-time pack (Tradie 50 / Foreman 75 / Boss 100); upgrading or grabbing a pack on `/membership` unlocks it straight away. Added with the rewards-return funnel (see `docs/partner/igodirect-integration-playbook.md` §10); rule-11 safe (no entries mention). The corpus-size assertion in `src/data/__tests__/faqs.test.ts` is now pinned at **72** — bump it deliberately when adding entries (CLAUDE.md rule 5c).

## 2026-07-31 — FAQ corpus 72 → 74

[supportChatFaqs.ts](../../src/data/supportChatFaqs.ts) gained entries **73** ("What details do you share with the partner rewards portal?") and **74** ("Do I have to agree to open the partner portal?"), covering the new consent screen. The count assertion in [faqs.test.ts](../../src/data/__tests__/faqs.test.ts) was bumped deliberately; `npm run build:chat-knowledge-pack` re-run. Copy is grounded in what the hand-off actually sends — keep it in step with `buildPartnerSsoSharedFields` ([docs/partner/rules.md R4](../partner/rules.md)).

## FAQ corpus grew to 78 entries (2026-08-05)

`src/data/supportChatFaqs.ts` gained two PARTNERSHIPS entries (ids `77`, `78`) covering the
public `/discount` page: that the catalogue is readable without an account, and how to tell
which offers a membership actually covers. The count assertion in
`src/data/__tests__/faqs.test.ts` was bumped 76 → 78 deliberately — it is a double-entry check,
not a formality. Re-run `npm run build:chat-knowledge-pack` after any corpus edit.

## FAQ corpus vocabulary aligned (2026-08-05)

Five answers in `supportChatFaqs.ts` said "partner catalogue" / "the catalogue"; they now say
"partner discounts" (or "them", where the sentence already named the discounts). Cobber must not
be the last surface using a retired noun — a member who reads "partner discounts" everywhere and
then hears "catalogue" from the chatbot reasonably concludes they are two different things.
Corpus size is unchanged at 78; `npm run build:chat-knowledge-pack` re-run and
`npm run test:chat-faqs` green.

## Cobber corpus: entry accumulation, and 5 gaps real customers found (2026-08-11)

Driven by a read of all 76 production conversations. Corpus is now **83 entries** (was 78 — bump
the count assertion in `src/data/__tests__/faqs.test.ts` deliberately when adding more).

### The entries contradiction — ids 4 and 39 rewritten

Two live entries said opposite things, and Cobber served both:

- **id 4:** "Membership entries **accumulate and carry forward** each month"
- **id 39:** "**Each monthly draw is a fresh pool** … an active member often sees **0 entries**"

**Neither was complete.** The mechanic, verified in code and against production:
`calculateRenewalEntries` ([subscription-entries-calculator.ts:109](../../src/utils/payment/subscription-entries-calculator.ts#L109))
is `entriesToGrant = lastAccumulated + baseEntries`, and that total **becomes** the new
`lastMonthAccumulatedEntries`. So the number credited into each draw **compounds**. Production
confirms it exactly — `lastMonthAccumulatedEntries` values fall on clean multiples of each tier's
base: Tradie (15) shows 75, 90, 105, 120…; Foreman (40) shows 240, 280, 320…; Boss (100) shows 700,
800, 1000, 1200, **1300**. (That 1300 is the member in conversation #35 who told Cobber *"I
currently have 1300 entries just from the boss membership"* — Cobber couldn't confirm it. They were
right.)

Both entries now tell one three-part story: **(a)** the total grows every month (each renewal adds
your tier's entries on top of the running total), **(b)** each draw is still its own pool that the
total is credited *into*, and **(c)** crediting happens on the member's **renewal date**, so a brief
0 between a draw and the next renewal is normal. Part (c) was id 39's real and valid point; its
"fresh pool" phrasing wrongly implied a reset to base.

### New entries 77–81 — every one a question a real customer asked and got "I don't know" for

| id | Question | Fact source |
|---|---|---|
| 77 | Where do I watch the live draw / what's your Facebook page? | `https://www.facebook.com/toolsaust` — canonical, used in the contact page, `ResultsCTA`, mini-draw countdown and `layout.tsx` JSON-LD `sameAs` |
| 78 | Do you have a mobile app? | **No.** Android/Play Store *planned, not started*; iOS not on the roadmap ([BUSINESS.md:714](../../BUSINESS.md), README.md:36) |
| 79 | How many people enter / is there a cap? | **Rule-11 sensitive.** Answers without probability framing: totals aren't published, and there's no cap on entries *you* can hold. Never phrase as odds |
| 80 | What was the cheap offer after checkout? | The post-purchase upsell — optional, one screen only, *includes* extra free entries |
| 81 | Who won / are winners public? | Yes — first name + last initial, state, prize, plus the randomdraws.com.au verification link, on `/draw-results` |

Entry 79 is the one to be careful with on future edits: customers ask it as an odds question
("what are my chances"), and the answer must stay in entries language per CLAUDE.md rule 11.
`npm run test:chat-faqs` enforces the banned vocabulary.

**After any corpus edit:** `npm run build:chat-knowledge-pack` then `npm run test:chat-faqs`. The
pack is regenerated into `src/generated/chatKnowledgePack.ts` and its size ceiling lives in
`src/lib/support-chat/__tests__/knowledge-pack.test.ts` — read the comment there before raising it
(the pack is currently ~13,375 tokens and is re-sent **uncached** on every request).
