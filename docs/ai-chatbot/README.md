# AI Support Chatbot — Research & Implementation Dossier

> **STATUS (as-built):** The shipped bot is FAQ-only (assistant name: **Cobber**). Phase 2 — member account tools + Amazon Bedrock onshore residency — was **DROPPED** and removed from the codebase. There is NO member/account/admin data access. All inference runs via the first-party Anthropic API. The research, cost-model, and alternatives docs below were written for a member-aware design and are retained as **historical research and rationale only**.

> **Audience:** Tools Australia engineering, product, and the business owner.
> **Date:** 2026-06-22.
> **2026-06-24 final-review fixes:** costGuard NaN guard added — non-numeric `CHAT_DAILY_TOKEN_BUDGET_USD` now falls back to $5 default (regression test added). `chatStorage.ts` moved from `src/components/support-chat/` to `src/lib/support-chat/` (shared utility layer). `SupportChatWidget` z-index now derived from `Z_INDEX.MODAL_BASE - 1000` instead of a hardcoded 9000. `clearSupportChatStorage()` wired at all 4 sign-out sites (Header, settings/page, AdminSidebar, queries.ts forced-auth-error path) per the org privacy rule. _(2026-07-07, post-main-merge: the four sites now route through main's canonical `totalSignOut()` / `clearUserScopedClientStorage()`, which clears chat by delegating to `clearSupportChatStorage()` — wiring is centralised, not per-site.)_ Runbook §3c corrected: Vercel picks the most-specific glob regardless of order. Runbook §5 notes that kill-switch and tripped daily budget also gate FAQ deflection.
> **How this was produced:** a 17-agent research workflow — 4 agents that read *this* codebase to ground every business fact, 6 agents that researched models / knowledge / cost / hosting / build-vs-buy / Australian privacy on the live web, and a 7-agent adversarial verification pass that re-checked every pricing, residency, and limit claim against primary sources. Corrections from that verification are already baked into these documents (see [§ Verified corrections](#verified-corrections)).

This dossier answers the five questions you asked, grounded in what the platform *actually* is (not a generic chatbot template):

1. **What is the best AI model for this?**
2. **How will the chatbot know the business?**
3. **What will it cost?**
4. **How do we run it 24/7 as support?**
5. **How do we integrate it into the website?**

---

## The one-paragraph answer

**If — and only if — you get enough repetitive support to justify it, build it in-house, cheaply and hard-capped; otherwise improve `/faq` + the contact form and skip the bot.** When you do build: a deflection-first, hard-capped chat endpoint that reuses the security pattern you *already run in production* — the **"Norm" / OpenClaw** gateway (`src/lib/internal-norm/withNorm.ts`: auth → permission → kill-switch → rate-limit → audit → runtime Zod validation). Answer the common ~70–90% of questions with a **no-LLM FAQ search / canned answers (≈$0)**, and only call the **cheapest capable model** (Gemini 2.5 Flash-Lite or Claude Haiku 4.5) on the long tail. Gate guests (FAQ-only, or hCaptcha + login before the generative bot), and put a **hard cost ceiling** in place — a provider monthly spend cap *plus* an app-level daily token budget + kill-switch — so the bill **physically cannot** reach the ~$1,000 you're worried about. The bot (**Cobber**) is FAQ-only — it has **no access to member account data**. Run it as a **Node.js streaming route on Vercel**. **Realistic run-cost is ~$3–57 AUD/month**, not hundreds — see [§ Cost & worth-it](#cost-worth-it).

## <a id="cost-worth-it"></a>Cost & worth-it — the owner's key question (read this)

The billing fear is the right instinct, and it's fully addressable. Full detail in **[alternatives-and-cost-control.md](alternatives-and-cost-control.md)**; the essentials:

- **A $1,000/month bill is not inevitable — it's preventable by design.** Realistic token cost is **single-digit to low-tens of AUD/month** (Anthropic's own worked example is ~$37 USD per *10,000* support conversations on Haiku). My earlier $41/$166/$815 figures were an *upper bound* for a full "LLM-on-every-message" bot; deflection-first + the cheapest model is ~10–20× lower.
- **You can set a ceiling the bill cannot exceed.** The first-party Anthropic API is the **only** major provider that *hard-stops* at a customer-set monthly spend limit (e.g. $50). On top of that, a small **app-level daily token budget + kill-switch** guarantees a ceiling on *any* provider and is what actually defends a public endpoint against guest abuse.
- **The real risk is guest abuse, not normal use** — an unauthenticated LLM endpoint is "a free inference machine for anyone who finds it." Solved by gating guests, rate limits, capped output tokens, and CAPTCHA/login before the generative bot.
- **Never use per-resolution pricing** (Intercom Fin = $0.99/resolution → ~$10,649 AUD/mo at 10k). *That* is the path to a four-figure bill; a hard-capped build or a flat-rate vendor is not.
- **Worth-it verdict (it depends on volume, not cost):** build the bot only if you get **≳300–500 repetitive, doc-answerable questions/month** *and* someone owns FAQ maintenance. **Below that, don't build it** — rewrite `/faq` to the real business, add a free no-LLM FAQ search, keep the contact form. If you want zero maintenance and a flat bill, **Crisp Essentials (~$158 AUD/mo, default hard-stop)** is a defensible buy.

---

## Headline recommendations

| # | Question | Recommendation | Confidence |
|---|----------|----------------|------------|
| 1 | **Best model** | **Cheapest capable model on the long tail only:** **Gemini 2.5 Flash-Lite** ($0.10/$0.40, ~10× cheaper) or **Claude Haiku 4.5** ($1/$5, best cheap-tier quality + keeps the provider hard cap). Most volume should be answered with **no LLM at all** (FAQ search/canned answers). Sonnet 4.6 only on the rare hard escalation; Opus 4.8 offline eval only. | High |
| 2 | **Knowing the business** | **Hybrid grounding:** cached knowledge pack (Phase 1) → Atlas Vector Search RAG (Phase 2) + read-only per-user tools. Generate the knowledge pack from canonical `src/data/*.ts` + `BUSINESS.md`/Terms at build time so it never drifts. **Do *not* fine-tune. Do *not* feed `src/data/faqs.ts`** (it is stale e-commerce boilerplate that contradicts the real business). | High |
| 3 | **Cost** | **~$3–57 AUD/month** (deflection-first + cheapest model, hard-capped). Upper bound for a full LLM-on-every-message bot is ~$41/$166/$815. **Hard-capped so it can't exceed your chosen ceiling.** See [alternatives-and-cost-control.md](alternatives-and-cost-control.md) + [cost-model.md](cost-model.md). | High (unit prices) / Medium (volume) |
| 3b | **Don't let the bill spike** | First-party Anthropic API monthly spend cap (only provider that hard-stops) **+** app-level daily token budget + kill-switch **+** guest gating. Never per-resolution pricing. | High |
| 4 | **24/7 operation** | **Node.js SSE streaming route** at `src/app/api/chat/route.ts` with explicit `maxDuration: 60`, **Haiku→Sonnet fallback** on refusal/overload, Mongo conversation store, distributed rate-limit + token-budget kill-switch, **human escalation into the existing `ContactSubmission` flow**. | High |
| 5 | **Website integration** | **Same-origin React widget** mounted via `SupportChatWidgetMount` in `src/app/(site)/layout.tsx` (docks **bottom-right**) **and** `src/app/promotions/layout.tsx` (docks **bottom-left** via `side="left"` — the promotions pages already use bottom-right for the guest theme toggle + account FAB). **No CSP change needed** (avoid a third-party script). Member-aware via NextAuth session; works for logged-out visitors too (FAQ-only). The `SupportChatWidget` `side?: "left" \| "right"` prop (default `"right"`) is the single placement knob. | High |
| — | **Build vs Buy** | **Build if volume + maintenance justify it; else buy flat-rate or skip.** Per-resolution vendors (Intercom Fin, Zendesk, Gorgias, HubSpot Breeze) are **unbounded — avoid**. If you want zero maintenance + a flat bill, **Crisp Essentials (~$158 AUD/mo, default hard-stop)** is bounded and fine for FAQ-only. Build wins when you need per-user answers ("what's *my* tier/entries/bill") and someone owns upkeep. | High |
| — | **AU residency / privacy** | For onshore inference under the Privacy Act, use **Amazon Bedrock `ap-southeast-2` (Sydney)** — *not* the first-party API and *not* Vertex (neither offers AU-resident Claude). Phase 1 (logged-out, zero-PII FAQ bot) sidesteps the issue entirely and is the fastest compliant launch. **DROPPED: Phase 2 (member PII + Bedrock) was not implemented; the shipped bot is Phase-1 FAQ-only.** | High |

---

## <a id="verified-corrections"></a>Verified corrections (what the adversarial pass changed)

These four items were corrected against primary sources after the first research draft — they are already reflected throughout the docs, but are called out here because they are the facts most likely to be wrong if taken from memory:

1. **AU data residency — the only onshore path is Amazon Bedrock Sydney.** The first-party Anthropic API supports `inference_geo` of only `us`/`global` and workspace geo of only `us` — **no Australia option**. Google Vertex AI has **no Claude model in `australia-southeast1`** (nearest is Singapore, which is offshore for APP 8). **Amazon Bedrock `ap-southeast-2` (Sydney)** is the only way to keep Claude inference physically in Australia. ⚠️ **Open item:** Bedrock Sydney confirmed for Opus 4.8/4.7 (direct) and Sonnet 4.6 / Fable 5 (via cross-region inference profile); **Haiku 4.5's availability in `ap-southeast-2` must be verified before relying on it as the triage tier** — see [§ Open items](#open-items).
2. **Gemini's current family is 3.x, not 2.5.** Cheapest current paid Gemini is `gemini-3.1-flash-lite` at ~$0.25/$1.50 per 1M (not the $0.10/$0.40 of the superseded 2.5 Flash-Lite). This *narrows* Gemini's cost edge over Claude Haiku and *strengthens* the "stay on Claude" recommendation. OpenAI GPT-5.4 family pricing was confirmed accurate.
3. **Atlas Vector Search dedicated Search Nodes *are* available in Sydney (`ap-southeast-2`).** Earlier draft said they were not. Vector search runs on your existing cluster with no separate software fee; dedicated Search Nodes are an *optional* isolation upgrade and they are available in-region.
4. **Claude prices, the cost math, Vercel limits, and vendor per-resolution prices were all confirmed correct** (Opus 4.8 $5/$25, Sonnet 4.6 $3/$15, Haiku 4.5 $1/$5; cache reads 0.1×; Intercom Fin $0.99/outcome; Vercel Node Fluid Compute 300s default / 800s Pro).

---

## Reading guide

| Document | Read it for |
|----------|-------------|
| **README.md** (this file) | The decision, the corrections, open items. Start here. |
| [research.md](research.md) | The deep research behind all five questions + build-vs-buy + Australian Privacy/security, with sources. |
| [alternatives-and-cost-control.md](alternatives-and-cost-control.md) | **The cost answer.** Hard spend caps, guest-abuse control, cheapest models + free tiers, no-LLM/low-LLM designs, flat-rate vendors, how real sites do it, and the worth-it / don't-build verdict. |
| [cost-model.md](cost-model.md) | AUD cost tables at 500/2k/10k conversations + break-even (full-bot **upper-bound** scenario; the alternatives doc has the cheaper, realistic, hard-capped numbers). |
| [implementation-spec.md](implementation-spec.md) | The technical spec grounded in your stack: routes, Mongo schemas, the `withChatbot()` wrapper, read-only tools, the widget, and the guardrail requirements. |
| [implementation-plan.md](implementation-plan.md) | **The execution-ready build plan.** Target file structure, global constraints, Phase 0/1 detailed to task level (TDD, tests, commits), Phases 2–4 outlined, plus testing/observability/docs/scaling/maintenance. **Phase 1 shipped (FAQ-only Cobber). Phase 2 (Bedrock Sydney + member tools) was DROPPED. Phases 3–4 reference the dropped Phase-2 features and are not being pursued as written.** |

---

## <a id="open-items"></a>Open items to verify before / during build

> **Note:** Items 1 and 2 below relate to Phase 2 (member PII + Bedrock), which was **DROPPED**. They are retained as historical context. Items 3–5 remain relevant to the shipped FAQ-only bot.

1. ~~**Haiku 4.5 in Bedrock `ap-southeast-2`**~~ — **DROPPED** (Phase 2 not implemented; no Bedrock in use).
2. ~~**Whether AU onshore residency is required, or APP-8 informed consent is acceptable.**~~ — **DROPPED** (Phase 2 not implemented; Phase-1 FAQ bot has no member PII).
3. **`CONTACT_RECIPIENT` routing** — confirm the escalation email target (`getContactEmail()` in `src/lib/email/sender-identities`) is a monitored support inbox.
4. **Streaming/SSE spike** — no SSE route exists in the repo yet; a small proof-of-concept de-risks the streaming + `maxDuration` interaction with the existing 10s catch-all in `vercel.json`.
5. **`src/data/faqs.ts` rewrite** — the current FAQ content is generic e-commerce boilerplate (PayPal, international shipping, order modification) that contradicts the membership/giveaway model. It must be rewritten to the real domain before *either* the bot or the public `/faq` page quotes it.

---

## What this bot must never do (non-negotiable)

Enforced **structurally** (not just by prompt) — full detail in [implementation-spec.md](implementation-spec.md) and [research.md](research.md) § Security:

- **No write/mutation tools exist at all** — no cancel, no plan change, no payment update, no entry purchase. The bot is informational + escalation only.
- **No member account tools exist** — the shipped bot is FAQ-only; it has no access to membership status, entries, billing, or any per-user data. (Phase-2 member tools were **DROPPED**.)
- **No cross-user data access** — per-user account tools were never implemented; the structural safeguard (server-side `userId` from session) was designed in but the tools themselves were removed.
- **It never invents** prices, entry counts, draw dates (the 27th, 8:30 PM AEST/AEDT), or **winner outcomes** — and it states plainly that **Tools Australia does not pick winners** ([randomdraws.com.au](https://randomdraws.com.au) does). On low confidence or billing/refund/legal/winner topics it says "I'm not certain" and escalates to a human.
