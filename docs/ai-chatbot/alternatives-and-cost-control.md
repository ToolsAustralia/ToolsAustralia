# AI Support Chatbot — Cost Control, Cheaper Alternatives & the Worth-It Verdict

> **Status note:** This document analyses a member-aware design including Amazon Bedrock onshore residency for member PII. That path was ultimately **DROPPED** — the shipped bot is FAQ-only with no member/account/admin data access. This document is retained as **historical research and rationale only**.

> Added in response to a direct owner concern: *"I don't want my billing to spike to $1,000/month — it's just support. If high cost is inevitable, it isn't worth integrating."* This document answers that head-on, **does not assume the existing stack must be reused**, logs every option and real-world example we found, and gives a plain worth-it / don't-build verdict. All pricing was adversarially **verified** against primary sources; AUD at FX **1 USD = 1.53 AUD**. Read alongside [research.md](research.md) and [cost-model.md](cost-model.md).

---

## TL;DR — the $1,000 fear, answered

1. **A $1,000 bill is not inevitable — it's preventable by design.** Realistic monthly token cost for a support bot is **single-digit to low-tens of AUD**, not hundreds, let alone $1,000.
2. **You can set a ceiling your bill physically cannot exceed.** The first-party Anthropic API is the **only** major provider that *hard-stops* serving at a customer-set monthly spend limit. On top of that, a small **app-level daily token budget + kill-switch** guarantees a ceiling regardless of provider.
3. **The real cost risk isn't normal usage — it's unauthenticated guests abusing a public LLM endpoint.** That's a solved problem: gate guests, rate-limit, cap output tokens, and require a CAPTCHA (you already load hCaptcha) or login before the generative bot.
4. **The cheapest path isn't "an LLM on every message" — it's deflection-first.** Answer the common ~70–90% of questions with a no-LLM FAQ search / canned answers (≈$0), and only call the cheapest model on the long tail.
5. **The honest verdict is about volume, not cost.** If you don't get much repetitive support, **don't build a bot — improve `/faq` + the contact form and add a free no-LLM FAQ search.** Build the bot only once repetitive volume is real. Either way, **never use per-resolution pricing** (Intercom Fin etc.) — that *is* the path to a $1,000+ bill.

---

## 1. The hard cost ceiling — "your bill physically cannot exceed $X"

This is the direct answer to the billing fear. There are two independent ceilings; use both.

### Ceiling A — provider-enforced monthly spend cap (verified)

| Provider | Does a spend limit HARD-STOP serving? | Notes |
|---|---|---|
| **Anthropic (first-party API)** | ✅ **YES — true hard stop** | "Once you reach the spend limit of your tier… you will have to wait until the next month to be able to use the API again." Set a **customer-set limit below your tier ceiling** (e.g. $50 USD). **Usage Tier 1/2 ceiling is $500/mo** — a built-in physical cap with zero code. Granularity is **monthly** (a bad day can still burn a chunk — see Ceiling B). |
| OpenAI | ❌ **No — alert only** | The old hard cap was **removed**; the monthly "budget" is now soft: "API requests will continue to be processed without interruption." Alerts only. |
| Google Gemini / Vertex | ❌ **No — alert only today** | Cloud Billing budgets don't cap spend. A true "Spend Caps" feature that *pauses* traffic was announced but is **private preview**, not GA — don't architect around it yet. |
| AWS Bedrock | ❌ **No real-time stop** | AWS Budgets is alert-only with an **8–12h lag**. Budget *Actions* can auto-apply a deny IAM/SCP policy, but coarse and laggy. **Claude on AWS has no Anthropic spend limit at all** (billed via AWS Marketplace). |

**Implication:** if a guaranteed provider-side ceiling matters most, the **first-party Anthropic API wins** — it's the only one that stops. (This is in tension with AU data residency — see [§3](#3-the-honest-tradeoff-hard-cap-vs-au-residency).)

### Ceiling B — application-level cap (the real guarantee, provider-agnostic)

Build this regardless of provider — it's small and it's what actually defends against guest abuse (the provider cap is monthly; this is real-time and per-user):

- **Daily token/$ budget counter** in Mongo (you already have the infra): before every model call, check the day's spend; if over (e.g. $3–5/day), **skip the LLM and return a canned "support is busy — here's the FAQ / leave a message"** response. **Fail closed** (block if the counter can't be read).
- **Per-IP + per-session rate limits** via the existing `createDistributedRateLimiter` + `RateLimit` model.
- **Hard `max_tokens`** on every request (output is ~5× input cost — the single highest-leverage knob) + a "be brief" system instruction so truncation isn't jarring.
- **Manual kill-switch** env/DB flag to disable the bot instantly (mirror Norm's `killSwitch`).
- *(Optional off-the-shelf)* an LLM gateway like **LiteLLM** enforces per-key/daily budgets and blocks over-limit calls with a 429 before they reach the provider (`fail_closed_budget_enforcement`).

> **Combined:** the app-level daily budget makes a $1,000 month impossible long before any provider cap is approached; the Anthropic monthly spend limit is the backstop if your own code ever fails. With both, the worst case is bounded *twice over*.

---

## 2. Realistic cost (corrected — far lower than the first pass)

The first pass estimated ~$0.08 AUD/conversation (~$41/$166/$815/mo). That assumed a fat RAG context + multi-turn. **Anthropic's own documented support example is ~20× cheaper**, and deflection-first cuts it further:

| Approach | Per conversation | 500/mo | 2,000/mo | 10,000/mo |
|---|---|---|---|---|
| **Deflection-first + cheapest model on the tail** (recommended) | ~$0.0002–0.001 AUD | **~$1–2** | **~$1–5** | **~$3–10** |
| Cheapest model on every message — **Gemini 2.5 Flash-Lite** ($0.10/$0.40) | ~$0.0015 AUD | ~$1 | ~$3 | ~$15 |
| Cheapest model on every message — **Claude Haiku 4.5** ($1/$5; Anthropic's worked example ~$37 USD/10k) | ~$0.006 AUD | ~$3 | ~$11 | ~$57 |
| Full generative two-tier (Haiku→Sonnet), first pass estimate | ~$0.08 AUD | ~$41 | ~$166 | ~$815 |
| **Buy — Intercom Fin per-resolution ($0.99/resolution)** ⚠️ | ~$2.16 AUD | ~$574 | ~$2,165 | **~$10,649** |

**Takeaways:** even the most expensive *build* option is bounded by the caps in §1. The only way to actually hit ~$1,000+ is **per-resolution SaaS**, which gets *more* expensive as the bot improves — avoid it. Per-token prices are verified/high-confidence; the per-conversation token estimates and deflection share are medium-confidence — instrument real traffic and revisit after month one.

---

## 3. The honest trade-off: hard cap vs AU residency

These two "best" recommendations pull in opposite directions, so here's the straight call:

| | Provider hard spend cap | AU data residency (APP 8) |
|---|---|---|
| **First-party Anthropic API** | ✅ Yes (the only one) | ❌ No (`us`/`global` only) |
| **Amazon Bedrock Sydney** | ❌ No (AWS Marketplace billing) | ✅ Yes (only onshore Claude path) |

**Resolution:** the **app-level daily token budget + kill-switch (Ceiling B) is the universal guarantee** — it works identically on Bedrock, so you are *not* forced to choose residency-or-safety. Then:

- **Phase 1 (guests, zero PII):** first-party Anthropic API + a $50 customer-set spend cap + Ceiling B. You get *both* backstops, and with no member PII there's no residency issue. **Fastest, safest, cheapest start.**
- **Phase 2 (members, PII):** if onshore residency is required → **Bedrock Sydney**, relying on Ceiling B (+ AWS Budget Actions as a laggy extra). Or stay first-party with **APP-8 informed consent** and keep the provider hard cap. A business/legal decision — see [research.md §8](research.md#8-security).

---

## 4. Guest abuse — the actual source of the $1,000 fear

A public, unauthenticated LLM endpoint is a known cost/abuse target ("a free inference machine for anyone who finds it"). Real cautionary tales we found: a single forgotten logged-in session reloading a broken page **burned 4× an app's daily budget in an afternoon with no rate limit breached**; the viral *ChipotlAI Max* repackaged a fast-food support bot into a free coding-API replacement. CAPTCHAs are solved by farms for ~$1/1,000 and ~1 in 6 new AI-account signups is fraudulent — so **no single control is enough; layer them.**

**The guest-cost-control stack (in order):**

1. **Login / email gating (strongest lever):** anonymous guests get **only the no-LLM FAQ search** (≈$0); the **generative bot requires sign-in or a verified email**. Most guest questions (pricing, how membership works, draw dates) are FAQ-shaped and never need the LLM. The known userId/email becomes the rate-limit key + abuse trail.
2. **CAPTCHA before the first generative turn:** reuse the **hCaptcha already loaded on the site**, or free **Cloudflare Turnstile** (managed/invisible, free up to 1M verifies/mo). Don't load two CAPTCHA vendors.
3. **Per-IP + per-session rate limits** (existing `RateLimit` model) — first cheap filter, but evadable, so never the only defence.
4. **Per-conversation hard caps:** max messages (~6), max input length (~500–2,000 chars), **`max_tokens` ~300 output**.
5. **App-level daily token budget + kill-switch** (Ceiling B) — catches a drain attack within hours.
6. **Provider monthly spend cap** (first-party Anthropic) — the un-bypassable backstop.

> With this stack, even 10,000 guest chats/month is ~$57 AUD (Haiku) and the absolute worst case is bounded by your chosen spend cap. The honest "don't build it" case here is narrow: **skip the spend cap and a token-drain attack genuinely can run to four figures.** So the spend cap + app budget are non-negotiable, not optional.

---

## 5. Cheapest viable models (verified — including non-stack options)

| Model | Price (USD /1M in-out) | Hard cap? | Quality for FAQ | Notes |
|---|---|---|---|---|
| **Groq Llama 3.1 8B** | **$0.05 / $0.08** | Prepaid balance | Weakest — fine behind strong retrieval | Cheapest by far; good as a cheap triage tier, risky as sole model for billing questions |
| **Gemini 2.5 Flash-Lite (paid)** | **$0.10 / $0.40** (cache $0.01) | Prepaid credits run out | Good enough for support | ~10× cheaper than Haiku; **paid tier not used for training** (PII-safe) |
| **OpenAI GPT-4o-mini** | $0.15 / $0.60 | ❌ alert-only | Good | Mature SDK; **no provider hard cap** (corrected — OpenAI removed it) |
| **OpenAI GPT-5-nano** | $0.20 / $1.25 (cache $0.02) | ❌ alert-only | Good instruction-following | Output price dominates support cost |
| **Claude Haiku 4.5** | $1 / $5 (cache $0.10) | ✅ via Anthropic spend limit | **Best of the cheap tier**; strong guardrail adherence | Anthropic's worked example ~$37/10k tickets; 5–10× Gemini output cost |
| Gemini **FREE** tier | $0 | quota (~1,000 req/day) | Good | ⚠️ **free-tier data may be used for training + human review — never for member PII**; pilot only |

**Cheapest acceptable path:** **Gemini 2.5 Flash-Lite (paid)** for the LLM fallback — ~10× cheaper than Haiku, privacy-safe on the paid tier. **Best-quality cheap path:** **Claude Haiku 4.5** (and it keeps you on the provider with the hard spend cap). Either is trivially cheap once deflection-first handles most volume.

---

## 6. The better architecture you asked for — deflection-first / low-LLM (not "LLM on every message")

This is the option not tied to "call Claude every time." Support traffic is power-law — *"the same 200 questions 80% of the time"* — so most answers should cost **$0**:

```
User question
  │
  1. Decision-tree / quick-reply menu (top 15-25 intents)        → ZERO LLM  (~10-15% of free-text)
  2. Semantic FAQ search → return canned/approved answer          → ~$0 (embeddings ~$0.02/1M)
  3. Semantic answer cache (cache by question embedding)          → ~$0 (61-69% hit rates in practice)
  4. ONLY on "no good match" → cheapest model rephrases the       → cents, on the long tail only
     retrieved snippet (RAG, never free-form), under the §1 caps
```

- **Embeddings:** OpenAI `text-embedding-3-small` ($0.02/1M), Cloudflare's **free** BGE tier, or Voyage. **Vector store:** MongoDB **Atlas Vector Search** (in your existing cluster, ~$0 extra) or pgvector. Embedding your whole FAQ corpus costs **cents**.
- **Real-world proof:** Algolia *pre-generates and stores* answers to avoid live LLM calls; semantic caching cuts API calls up to **68.8%** (arXiv); RouteLLM-style routing reports up to **85%** cost savings. Deflection numbers: Grammarly 87%, Duolingo 80%+, Bilt 70% of 60k tickets/mo, Gridwise 73%, HelloSugar 66% (saved ~$14k/mo), Vodafone −70% cost/chat, Klarna two-thirds of 2.3M chats (**but later re-hired humans → always wire human handoff**).
- **Effect:** at 2,000 conversations with ~70–90% deflected pre-LLM, the model bill is roughly **$1–5 AUD/month**; bounded, not just cheap.
- **Cost of this path:** more moving parts (a router, a vector store, a cache, a threshold to tune) and **FAQ content must be kept current** — *"automation just scales the confusion"* if the docs are messy. This is the real, one-time-ish cost, vs an unbounded monthly bill.

---

## 7. Buy a flat-rate vendor (if you'd rather not build) — bounded by design

If you want a predictable flat bill and **no engineering/maintenance**, buy — but **only flat-rate, never per-resolution**:

| Vendor | Price | Bounded? | Verdict |
|---|---|---|---|
| **Crisp Essentials** | ~$95 USD / ~$158 AUD/mo (10 seats, unlimited human chat, $25 AI-credit ≈ ~450 AI convos) | ✅ **Default hard-stop** — AI escalates to humans when credits run out; PAYG is opt-in with a settable cap | **Best bounded buy.** EU/GDPR-strong. No per-user integration needed (KB ingest of your FAQs/Terms). |
| Tawk.to + AI Assist | Free chat + $29/mo (1,000 AI msgs) | ⚠️ **Not cleanly capped** — overage is a "settle-later negative balance"; AI keeps serving ongoing chats past the allowance | Cheapest *if* you manually disable AI at the cap; verify in-account before relying on it |
| Chatbase | Flat $40–$500/mo by credits | ✅ default hard-stop (leave auto-recharge OFF) | OK; Claude/Opus model choice burns 3–5× credits |
| Tidio + Lyro | $29–$749/mo + Lyro add-on | ⚠️ multi-quota, $59→$749 cliff | EU-strong but unpredictable |
| **Intercom Fin** | **$0.99/resolution** + seat | ❌ **unbounded** (~$6,930 USD/mo at 10k) | **AVOID** — this is the $1,000+ spike |
| **HubSpot Breeze** | $0.50/resolution + Enterprise seats (10-seat min) | ❌ unbounded | **AVOID** |

**Trade-off vs build:** a flat vendor gives a guaranteed bill and zero maintenance, but you lose deep per-user answering (the "what's *my* tier/entries/bill" feature), ship FAQ content to a third party, and (for Crisp/Tidio) accept EU—not AU—residency. For a *pure FAQ* bot on a tight budget with no appetite to build, **Crisp Essentials (~$158 AUD/mo flat)** is a defensible, bounded answer.

---

## 8. The worth-it / don't-build verdict (verified)

**The decision turns on support volume, not token cost** — tokens are trivial once capped. Honest benchmarks: first-year deflection for a brand-new SMB bot is realistically **~20–40%** (50–60% top performers; e-commerce 55–75% only at maturity), and **false deflection erodes savings** (many non-agentic deployments see real cost reduction of 20–30%, not the 60–80% marketed). Fully-loaded human cost is ~$6 USD/ticket at the low/global baseline (blended likely higher → savings stronger). The value is **staff hours returned, not software saved.**

- ✅ **Worth building** when **all** hold: (1) you field **at least ~300–500+ repetitive, doc-answerable questions/month**; (2) your FAQ/docs are clean (or you'll clean them); (3) you implement the §1 hard caps + §4 guest gating; (4) **someone owns maintenance** (content freshness, wrong-answer monitoring). At those volumes the bot deflects ~150–900 contacts/month at a bounded ~$3–57 AUD/month — clearly worth the staff time saved.
- ❌ **Not worth a full bot** when: volume is low (under a few hundred answerable tickets/month — maintenance burden exceeds minutes saved); questions are mostly **non-repetitive or account-specific** (real refund disputes, specific failed charges — these need humans and a bot risks wrong answers on billing/compliance, which carries real downside for a paid-membership + prize-draw business); **nobody owns maintenance**; or you'd be tempted by **per-resolution pricing**.

### The cheapest viable path (do this in order)

1. **Step 1 — do this regardless, possibly *instead* of a bot:** rewrite `/faq` to the **real** business (the current `src/data/faqs.ts` is stale e-commerce boilerplate), add the top 15–20 real questions, and add a **simple no-LLM keyword/embedding FAQ search**. Zero recurring cost, zero abuse surface. For low volume this captures most of the deflection a bot would.
2. **Step 2 — only if volume justifies it:** a **hard-capped, deflection-first bot** over those same FAQ docs on the **cheapest model** (Gemini Flash-Lite or Haiku 4.5), with guest gating, member-aware answers for logged-in users, and billing/refund/dispute intents routed straight to the contact form — built on your existing stack.

---

## 9. Revised recommendation (decision tree)

```
Do you get ≳300-500 repetitive, doc-answerable support questions/month?
│
├─ NO  → Don't build a bot yet. Rewrite /faq to the real business + add a
│        free no-LLM FAQ search + keep the contact form. Revisit when volume grows.
│
└─ YES → Will someone own FAQ maintenance + monitoring?
         │
         ├─ NO  → Buy a FLAT-RATE vendor (Crisp Essentials ~$158 AUD/mo, default hard-stop).
         │        Never per-resolution.
         │
         └─ YES → BUILD deflection-first, hard-capped:
                  • No-LLM FAQ search / canned answers carry ~70-90% (≈$0)
                  • Cheapest model (Gemini Flash-Lite or Haiku 4.5) on the tail only
                  • Guests: FAQ-only OR hCaptcha + login before the generative bot
                  • Ceiling A (provider spend cap) + Ceiling B (daily token budget + kill-switch)
                  • Phase 1 first-party API (zero PII); Phase 2 Bedrock Sydney or APP-8 consent for member data
                  → realistic cost ~$3-57 AUD/month, hard-bounded. NOT $1,000.
```

---

## 10. Sources

**Cost caps & abuse:** Anthropic rate-limits/spend-limit (`platform.claude.com/docs/en/api/rate-limits`), Anthropic pricing (`/about-claude/pricing`); OpenAI limits (`platform.openai.com/settings/organization/limits`, help-center "managing projects"); Google Cloud budgets (`docs.cloud.google.com/billing/docs/how-to/budgets`) + Spend Caps preview (`cloud.google.com/blog/topics/cost-management/introducing-spend-caps-ai-cost-visibility-next26`); AWS Budgets/Actions (`docs.aws.amazon.com/cost-management/...budgets-controls.html`); LiteLLM (`docs.litellm.ai/docs/proxy/users`); Cloudflare Turnstile (`blog.cloudflare.com/turnstile-ga`); token-theft writeups (`workos.com/blog/llm-token-theft`, `dev.to/kmusicman/...`, `dev.to/nimay_04/...`); Netlify/Portkey rate-limit playbooks.

**Cheapest models & embeddings:** Anthropic, OpenAI (`developers.openai.com/api/docs/pricing`), Google Gemini (`ai.google.dev/gemini-api/docs/pricing` + `/terms#data-use-paid` + `/rate-limits`), Groq (`groq.com/pricing`), OpenAI embeddings, Cloudflare Workers AI, pgvector, MongoDB Atlas Vector Search.

**Deflection-first & real-world:** Algolia (`algolia.com/blog/ai/...`), GPT Semantic Cache (`arxiv.org/abs/2411.05276`), PremAI, RouteLLM (`github.com/lm-sys/RouteLLM`), eesel deflection benchmarks, Supportbench, Klarna (`klarna.com/.../klarna-ai-assistant...` + `customerexperiencedive.com/.../747586`), Vodafone/HelloSugar (`quickchat.ai`, `resolve247.ai`), DoorDash RAG (`evidentlyai.com/blog/rag-examples`).

**Flat vendors:** Crisp (`crisp.chat/en/pricing` + `help.crisp.chat/.../hugo-pricing-billing...`), Tawk.to (`help.tawk.to/article/how-to-manage-billing-for-ai-assist`), Chatbase (`chatbase.co/pricing`), Tidio (`tidio.com/pricing`), Intercom Fin (`fin.ai/pricing`, `intercom.com/pricing`), HubSpot (`hubspot.com/company-news/...`).

**Worth-it benchmarks:** eesel/Forrester deflection (`eesel.ai/blog/deflection-rate...`), Supportbench, livechatai cost-per-ticket benchmarks, Pylon (`usepylon.com/blog/ai-ticket-deflection...`).
