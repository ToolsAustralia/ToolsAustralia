# AI Support Chatbot — Cost Model (AUD)

> Companion to [research.md](research.md). All figures in **AUD** at **FX 1 USD = 1.53 AUD** (representative mid-2026 rate — adjust as needed; the build-vs-buy *ratio* is FX-insensitive because both sides scale with FX). Claude unit prices and the prompt-caching multipliers were **adversarially verified** against Anthropic's official pricing page. Per-conversation **token estimates are medium-confidence** and scale ~linearly with conversation length — re-baseline against real traffic after launch.

> ⚠️ **READ THIS FIRST — the tables below are an UPPER BOUND.** They model a full "LLM-on-every-message" two-tier bot. A second research pass found the **realistic** cost is **~10–20× lower** and **hard-cappable**: Anthropic's own worked example is **~$37 USD per 10,000 support conversations** on Haiku 4.5 (~$0.004 each), and a **deflection-first** design (no-LLM FAQ search answering ~70–90% of volume) lands the whole bot at **~$3–57 AUD/month**. Crucially, the bill can be made to **physically not exceed a ceiling you choose** (provider monthly spend cap + app-level daily token budget + kill-switch). For the cheaper numbers, the hard-cap mechanism, guest-abuse control, cheaper non-Claude models, flat-rate vendors, and the worth-it/don't-build verdict, see **[alternatives-and-cost-control.md](alternatives-and-cost-control.md)** — that document supersedes this one on the "what will it actually cost / will it spike" question. The tables here remain useful as the worst-case ceiling for a maximalist build.

---

## 1. Assumptions

**Conversation shape** — a typical 4-turn support exchange:

| Component | Tokens | Notes |
|---|---|---|
| Cacheable prefix (system prompt + tool schemas + knowledge pack) | ~9,500 / turn | Written once (1.25×), then read 3× at 0.1× → ~9,500 write + ~28,500 read |
| Fresh uncached input | ~11,200 / conversation | RAG context ~8,000 + history ~2,400 + user messages ~800 |
| Output | ~1,400 / conversation | Streamed answer text |

**Model prices (per 1M tokens, verified):** Haiku 4.5 **$1 / $5**; Sonnet 4.6 **$3 / $15**; Opus 4.8 **$5 / $25**. **Prompt caching: cache read 0.1× input, cache write 1.25× (5-min TTL).**

**Routing:** two-tier — **70% Haiku** (triage/FAQ) + **30% Sonnet** (complex). An "Opus-for-complex" variant is shown for comparison but is **not recommended** (Opus is for offline eval only).

**Resolution rate (buy side):** 70% of conversations resolve (a billable "outcome" for per-resolution vendors).

---

## 2. Per-conversation cost (with prompt caching)

| Model | USD / conversation | AUD / conversation |
|---|---|---|
| Haiku 4.5 | ~$0.033 | **~$0.050** |
| Sonnet 4.6 | ~$0.099 | **~$0.151** |
| Opus 4.8 | ~$0.165 | ~$0.252 |

**Prompt caching saves ~41%** of model cost (e.g. Sonnet $0.099 cached vs $0.169 uncached) because the ~38k-token prefix-read total bills at 0.1× instead of 1× input. **This is the single biggest cost lever** — keep the cached prefix stable (regenerate only on deploy).

**Two-tier blended cost:**

- **70% Haiku + 30% Sonnet = ~$0.080 AUD / conversation** ✅ (recommended)
- 70% Haiku + 30% Opus = ~$0.111 AUD / conversation (not recommended)

---

## 3. Monthly cost — BUILD (recommended: two-tier, caching on)

| Conversations / month | Model cost | + Embeddings | + Vector store | + Vercel/Mongo | **Total TCO** |
|---|---|---|---|---|---|
| 500 | ~$40 | ~$0 | ~$0 | ~$0 | **~$41** |
| 2,000 | ~$160 | ~$0.04 | ~$0 | ~$0 | **~$166** |
| 10,000 | ~$800 | ~$0.18 | ~$0 | ~$15 | **~$815** |

**Why the add-ons are ~$0:**

- **Embeddings** (if/when RAG is added): one-time index build of ~1k docs (~600k tokens) ≈ **$0.06 AUD**; ongoing query embeddings at 10k conversations ≈ **$0.18 AUD/mo** (Voyage AI ~$0.06 USD/1M). Negligible. *(low confidence on exact rate; immaterial at any plausible price.)*
- **Atlas Vector Search** runs on your **existing cluster** with **no separate software fee** (verified). Incremental cost is **$0** if the cluster has RAM headroom. *Optional* dedicated Search Nodes for isolation: ~$87 AUD/mo for one M10-class node, ~$174 AUD/mo for the 2-node HA minimum — a rounding error at 10k conversations, and **available in Sydney `ap-southeast-2`** (corrected).
- **Vercel/Mongo** streaming-endpoint compute is within the existing Vercel Pro plan; ~$15 AUD/mo function-duration overhead only at 10k conversations.

### Variant: single-model (Sonnet only) — simplest Phase-1 build

No router/classifier; consistent quality; ~$0.151 AUD/conversation. **Lean way to ship fast, then add the Haiku triage tier later (additive, no rework).**

| Conversations / month | Sonnet-only, caching on | Sonnet-only, **no** caching |
|---|---|---|
| 500 | ~$76 | ~$129 |
| 2,000 | ~$302 | ~$516 |
| 10,000 | ~$1,510 | ~$2,580 |

---

## 4. Monthly cost — BUY (Intercom Fin, representative per-resolution vendor)

**Verified:** Intercom Fin = **USD $0.99 per outcome**, 50-outcome/month minimum, + ≥1 seat (~USD $29/mo ≈ ~$44 AUD/mo). At 70% resolution and FX 1.53, per resolution = **$1.51 AUD**.

| Conversations / month | Resolutions (70%) | **Total (Fin)** |
|---|---|---|
| 500 | 350 | **~$574** |
| 2,000 | 1,400 | **~$2,165** |
| 10,000 | 7,000 | **~$10,649** |

Other vendors (verified pricing models): Zendesk AI $1.50 committed / $2.00 PAYG per resolution + ~$50/agent/mo (uncapped overage since Jan 2026); Gorgias $0.90–$1.00/resolution **dual-billed** with a helpdesk ticket fee; Crisp flat ~$45–$295/mo (credit-metered); Ada/Sierra enterprise quote-only (~$30k–$150k+/yr).

---

## 5. Build vs Buy & break-even

| Conversations / month | **Build (two-tier)** | **Buy (Fin)** | Buy ÷ Build |
|---|---|---|---|
| 500 | ~$41 | ~$574 | ~14× |
| 2,000 | ~$166 | ~$2,165 | ~13× |
| 10,000 | ~$815 | ~$10,649 | ~13× |

- Per unit: **~$0.08 AUD/conversation (build)** vs **~$2.16 AUD/conversation (Fin at 70% resolution)** — a **~25× gap**.
- **Break-even is ~50–100 conversations/month.** Below that the absolute dollars are small either way and the decision is **engineering time, not run-rate**. Above it, build wins decisively and the gap widens.
- At 10,000/month the **~$118k/yr saving vs Fin** funds the build/maintenance engineering many times over.

> **The cost model excludes engineering build + maintenance labour** — that is the genuine "build" cost and the real decision variable, not the token run-rate. The recommendation to build rests on (a) the per-user integration being custom work you'd do anyway, (b) the existing reusable Norm pattern lowering build risk, and (c) the AU-PII residency control you keep by not shipping data to a foreign SaaS — not primarily on the token savings.

---

## 6. Caveats & re-verify-before-build

- **Token estimates drive everything.** At 8 turns/conversation, model cost roughly doubles. Re-baseline on real traffic after launch.
- **AU-region (Bedrock Sydney) pricing.** The AUD figures use the quoted Claude rates. **Regional endpoints typically carry a ~10% premium** over global — add ~10% to the model line if you run onshore via Bedrock `ap-southeast-2`. Still cheap; doesn't change the build-vs-buy conclusion.
- ⚠️ **Haiku 4.5 in Bedrock Sydney is unconfirmed.** If unavailable, the **single-model Sonnet build** (~$0.15 AUD/conversation; ~$76/$302/$1,510 per month) is the onshore fallback — still ~14× cheaper than Fin.
- The **70/30 Haiku/Sonnet split** and **70% resolution rate** are assumptions; heavier complex traffic raises build cost but it stays far below buy.
- **FX (1.53) is volatile** but cancels out of the build-vs-buy ratio.
