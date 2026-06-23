# AI Support Chatbot — Deep Research

> Companion to [README.md](README.md). This is the evidence behind the recommendations. Every business fact is cited to a file in this repo; every pricing/availability fact is cited to a primary source and was adversarially re-verified. Where a claim is medium/low confidence it says so.

**Contents**

1. [Where the chatbot fits today (grounding)](#1-grounding)
2. [Question 1 — Best AI model](#2-model)
3. [Question 2 — How it knows the business](#3-knowledge)
4. [Question 3 — Cost](#4-cost) (summary; full math in [cost-model.md](cost-model.md))
5. [Question 4 — Running it 24/7](#5-hosting)
6. [Question 5 — Website integration](#6-integration)
7. [Build vs Buy](#7-build-vs-buy)
8. [Security, privacy & Australian compliance](#8-security)
9. [Sources](#9-sources)

---

## <a id="1-grounding"></a>1. Where the chatbot fits today (grounding)

Four facts about the *current* system shape everything else. All were read directly from the codebase.

### 1.1 You already run a secure AI integration — "Norm" / OpenClaw

The single most important asset for this project is that the team has **already built and operates a production AI gateway**. Norm is a read-only HTTP gateway at `/api/internal/norm/v1/*` that exposes admin analytics to an external AI assistant the owner runs on a Mac mini. Every route is wrapped by `withNorm()` (`src/lib/internal-norm/withNorm.ts`), which runs a fixed, ordered pipeline:

> **auth → permission → kill-switch → rate-limit → handler → audit → runtime Zod response-schema validation**

Key properties (all confirmed in source):

- **Single source-of-truth registry** (`src/lib/internal-norm/classification.ts`) declares every endpoint with its `tier`, `requiredPermission`, `path`, `method`, `summary`, and a `responseSchema`. Only entries *with* a `responseSchema` are "wired" and exported to a generated manifest (`scripts/build-norm-manifest.ts` → `src/generated/normToolsManifest.json`).
- **PII boundary enforced at the egress projection**, not the role grant: the Zod `responseSchema` for user data returns **`firstName` + opaque Mongo `userId` (+ AU state code) only** — email, lastName, mobile, address, DOB, bank/payment data are all stripped (`src/lib/internal-norm/schemas/users.ts`). A schema mismatch returns a 500 *before* the payload leaves the server.
- **Audit** to `NormCallLog` (90-day TTL) stores hashes of query/body/response, never raw content; writes are best-effort and never block the request.
- **Kill switch** (`src/lib/internal-norm/killSwitch.ts`) via env CSV or a Mongo flag; **two-dimensional rate limiting** (`rateLimits.ts`) over 1-min and 24-hr windows.

**What this means for the chatbot:** the *machinery* — wrapper pattern, registry, Zod-validated egress projection, audit model, kill-switch, rate-limit — is directly reusable. We propose a `withChatbot()` analogue.

**What must invert (critical):** Norm trusts a single owner-held HMAC credential, so it lets `tier:"read"` endpoints **bypass** the per-permission grant (`withNorm.ts:104-146`) — *safe only because Norm itself is trusted*. A public support bot's caller is **untrusted**. A member must never see another member's data, so the bot must **not** copy the read-bypass; every read must be scoped to the authenticated session user. (Note: `architecture.md` describes the permission step as always running; the *code* skips it for reads — the code is authoritative. Do not copy that shortcut.) Also, Norm's replay-nonce/rate-limit caches are per-process in-memory (`docs/internal-norm/gotchas.md`); a public multi-instance bot needs the Mongo-backed limiter instead.

### 1.2 Support today is async-only — there is no chat UI

- **No chat vendor or chat component exists** anywhere (grep for Intercom/Zendesk/Crisp/tawk/livechat returns only a CSS rule and docs). The "live chat" text on `/contact` is a static heading with no functionality (`src/app/(site)/contact/page.tsx`).
- Support runs through one shared component, **`src/components/features/ContactForm.tsx`** (used by both public `/contact` and authed `/my-account/support`). It POSTs to **`/api/contact-submissions`** (Zod-validated, rate-limited by email+IP via `checkFormSubmissionRateLimit`), persists a **`ContactSubmission`** document, and emails `CONTACT_RECIPIENT` via SendGrid.
- **`ContactSubmission`** (`src/models/ContactSubmission.ts`) already has a `replies[]` thread, `status` (new/in_progress/resolved/closed) and `priority` workflow. Admins reply via `/api/contact-submissions/[id]/reply` (permission `submissions.edit`). **This is the existing human queue the bot should escalate into** — no new escalation system needed.

### 1.3 The auth, rate-limit, and CSP primitives a chat route needs already exist

- Current user inside a route handler: `getServerSession(authOptions)` + the guards `requireAuthenticatedUser()` / `requireAuthenticatedUserDoc()` (`src/lib/api-auth.ts`). The session (`src/types/global.d.ts`) carries `id`, `email`, `firstName`, `lastName`, `userType` (`customer`|`staff`|`admin`), `permissions[]` — **but not subscription/membership status** (load the User doc for that). ⚠️ Do **not** use `requirePermission` for the customer bot — customers are `userType: 'customer'` and would be 403'd; that guard is staff/admin-only.
- **`createDistributedRateLimiter`** (Mongo-backed, shared across serverless instances, *fails open*) + the **`RateLimit`** model (`src/utils/security/rateLimiter.ts`, `src/models/RateLimit.ts`) — the right limiter for a public `/api/chat` endpoint. (Note the manifest glob `src/lib/rate-limiting/**` only contains `error-reports.ts`; the generic limiter lives under `src/utils/security/`.)
- Standard response shape `{ success, error, details }` with inline Zod `.parse()` in a try/catch (template: `src/app/api/user/update-email/route.ts`).
- **CSP** (`src/utils/security/csp.ts`, nonce applied in `src/middleware.ts`, production only, and middleware **excludes `/api`**). A **same-origin React widget streaming from `/api/chat` needs no CSP change**; a third-party hosted widget script would require adding its host to `script-src`/`connect-src`/`frame-src` — a reason to avoid third-party scripts.

### 1.4 The knowledge already exists as canonical data — but one file is a trap

The facts a support bot needs are almost entirely already in the repo (full inventory in [§3](#3-knowledge)):

- **Prose:** `BUSINESS.md` (the richest single source), `README.md`, and the **legally authoritative** Terms page (`src/app/(site)/terms/page.tsx`).
- **Structured:** `src/data/membershipPackages.ts`, `upsellPackages.ts`, `miniDrawPackages.ts`, `partnerBrandOffers.ts`, `src/config/prizes.ts`, `professions.ts`, `australianStates.ts`.
- ⚠️ **`src/data/faqs.ts` is stale e-commerce boilerplate** (PayPal/Apple Pay, "3–5 day shipping", "international shipping", "modify order within 1 hour") that **contradicts** the real membership/giveaway model and the Stripe-card-only flow. It must **not** be fed to the bot as ground truth — it needs a full rewrite for the actual domain first.

---

## <a id="2-model"></a>2. Question 1 — Best AI model

> **Cost-first note:** the two-tier scheme below is the right *model* answer if you run a full generative bot. But a follow-up cost pass found the cheapest, bounded design calls an LLM only on the long tail (most questions answered with no LLM) and can use an even cheaper model (Gemini 2.5 Flash-Lite). For the cost-optimal model + architecture choice and the hard spend cap, **[alternatives-and-cost-control.md](alternatives-and-cost-control.md) supersedes this section**.

### Recommendation

**Stay on Anthropic Claude (where you already run Norm) with a two-tier router:**

| Tier | Model | When | Price (per 1M, in/out) |
|------|-------|------|------------------------|
| **Tier 1 — default (~70–90% of turns)** | **Claude Haiku 4.5** (`claude-haiku-4-5`) | Intent triage, FAQ, simple "where's my subscription / entries / next bill" lookups via tools | **$1 / $5** |
| **Tier 2 — escalation (~10–30%)** | **Claude Sonnet 4.6** (`claude-sonnet-4-6`) | Multi-step billing reasoning, ambiguous complaints, anything Tier 1 flags low-confidence | **$3 / $15** |
| **Offline only** | **Claude Opus 4.8** (`claude-opus-4-8`) | LLM-judge grading the bot's golden-set answers; prompt engineering. Use the **Batch API (50% off)**. Never per-turn. | **$5 / $25** |

All three prices, IDs, context windows, and the **cache-read 0.1× multiplier** were **confirmed** against Anthropic's official pricing/models pages.

### Why Claude over OpenAI / Gemini here

- **You already operate Claude in production (Norm).** The secure-AI patterns you've proven — `withNorm()`, runtime Zod response validation, structured tool-use — are Anthropic-shaped. A second provider means a second SDK, prompt-tuning, eval harness, and ops surface; at SMB support volume the switching cost exceeds the marginal token savings.
- **The cost challengers are real but not compelling enough to justify dual-provider.** Verified current competitor pricing (per 1M, in/out):
  - **OpenAI** (confirmed): GPT-5.4 $2.50/$15, GPT-5.4-mini $0.75/$4.50, GPT-5.4-nano $0.20/$1.25, GPT-5.5 $5/$30. Cached input ~0.1×. Regional/residency endpoints carry a ~10% uplift.
  - **Google Gemini** (corrected to current 3.x family): `gemini-3.1-flash-lite` $0.25/$1.50 (cheapest current paid tier), `gemini-3-flash-preview` $0.50/$3.00, `gemini-3.5-flash` $1.50/$9.00, `gemini-3.1-pro-preview` $2.00/$12.00. The earlier-cited Gemini **2.5** Flash-Lite ($0.10/$0.40) is the *prior* generation. The true current cheapest Gemini ($0.25/$1.50) narrows the gap to Haiku 4.5 ($1/$5) — so Gemini is a **documented fallback**, not a reason to switch.
- **Instruction-following + low hallucination + tool use** are all strong on the Claude tier, and structured outputs + prompt caching + the Citations API directly support the grounding strategy in [§3](#3-knowledge).

### The data-residency constraint that overrides the model choice (corrected)

A customer support bot sends member questions (and, in Phase 2, per-user data) to the model provider — that is "personal information" under the Privacy Act. To keep inference **onshore in Australia**:

- ❌ **First-party Anthropic API cannot do it.** `inference_geo` supports only `us`/`global`; workspace geo is `us`-only. (Source: Anthropic Data Residency docs — verified.)
- ❌ **Google Vertex AI cannot do it.** No Claude model is offered in `australia-southeast1`; the nearest is `asia-southeast1` (Singapore), which is **offshore** for APP 8. (Verified.)
- ✅ **Amazon Bedrock `ap-southeast-2` (Sydney) is the only onshore-AU path.** In-region Claude confirmed for **Opus 4.8 / 4.7** (direct, on-demand) and **Sonnet 4.6 / Fable 5** (via cross-region inference profile). (Verified against AWS Bedrock region-availability docs.)

⚠️ **Open item:** **Haiku 4.5's availability in Bedrock `ap-southeast-2` was not confirmed** and must be checked before committing to it as the onshore triage tier. Contingency if unavailable: run **Sonnet-only on Bedrock Sydney** (~$0.15 AUD/conversation, still cheap — see [cost-model.md](cost-model.md)), or keep Phase 1 logged-out + zero-PII so residency doesn't bind. See also [§8](#8-security).

### Risks

- **Two-tier misroute:** a bad triage decision sends a hard billing question to Haiku. Mitigate with a *low-confidence-escalates-to-Sonnet* rule and the Opus offline eval set.
- **Prompt-cache erosion:** savings depend on a stable cached prefix (system prompt + tool schemas + knowledge pack). Churn in that prefix erodes the discount — regenerate it only on deploy.
- **Competitor prices shift frequently** — re-verify at build time; treat the OpenAI/Gemini figures as medium-confidence snapshots.

---

## <a id="3-knowledge"></a>3. Question 2 — How the chatbot knows the business

### Recommendation: a **hybrid**, not one technique

Split the problem along the axis that determines accuracy:

```
                ┌─────────────────────────── user question ───────────────────────────┐
                │                                                                       │
        "How do draws work?"                                            "What's MY next bill / entries?"
        STATIC business knowledge                                       LIVE per-user data
                │                                                                       │
   Phase 1: cached knowledge pack (prompt caching)            Read-only, session-scoped tools
   Phase 2: + Atlas Vector Search RAG                         (my-membership, my-entries,
   + Citations API (ground every answer)                       my-billing-status, draw-status)
                │                                                                       │
                └──────────────► answer, or "I'm not certain → escalate to a human" ◄───┘
```

### Static knowledge — start cached, grow into RAG

- **Phase 1 — cached, curated knowledge pack (recommended start).** The total knowledge today is small and changes only on deploy. Stuff a curated, citation-tagged pack (the prose + structured facts below) into the prompt behind **Anthropic prompt caching**. Cache reads bill at **~0.1× input**, so after the first call it's fractions of a cent per turn. Nothing can be mis-retrieved because the whole pack is always in context. This is the leanest path to a *correct* bot in days.
- **Phase 2 — MongoDB Atlas Vector Search RAG (when the pack grows).** You are **already on Atlas**, and **Voyage AI is now owned by MongoDB**, so embeddings are first-party to the stack. `$vectorSearch` runs on the existing cluster with **no separate software fee** (free M0 through dedicated M10+; MongoDB 6.0+). **Correction:** dedicated Search Nodes for isolation **are available in Sydney `ap-southeast-2`** (the earlier draft said not) — so production-scale vector isolation in-region is fully possible; co-locating on the primary is a cost choice, not a constraint.
- **Embedding model:** `voyage-3.5-lite` / `voyage-3` ($0.06/1M) or OpenAI `text-embedding-3-small` ($0.02/1M). Embedding the entire knowledge pack costs **cents** — negligible at any volume.
- **Citations:** use Anthropic's **Citations API** (`citations:{enabled:true}` on document blocks) so every factual answer is grounded to a source span. (Note: incompatible with `output_config.format` structured outputs — pick one per call.)

### Live per-user data — read-only tools, never a static KB

Per-user facts (this member's tier, entries balance, subscription state, which draw cycle their entries are in, partner-catalog visibility, referral state) **must not** be staticised. Expose them through **3–5 narrow, read-only, session-scoped tools** that mirror the `withNorm()` pattern. **Critical:** unlike Norm (admin scope), each tool resolves the user **only from the authenticated session** server-side — the model never passes a `userId`.

### Keep it fresh: generate the pack from canonical sources at build time

Your business facts already live as source-of-truth TS data + md docs. **Generate the knowledge pack (and embeddings) from those files in the existing `prebuild` step** (the same pattern as the upsell/landing image manifests). A repricing in `membershipPackages.ts` or a "coming soon → live" change then propagates on the next build — and is already covered by the `README.md`/`BUSINESS.md` doc-sync rule.

### Content inventory (what feeds the KB)

| Source | Holds | Type | Use |
|--------|-------|------|-----|
| `BUSINESS.md` | Tiers/prices/entries, draw cadence + freeze/blackout, prize options, entries pools, partner tiers, upsell/promo math, refund policy, subscription state machine, roadmap | Prose | **Primary KB backbone** |
| `README.md` | Condensed Live vs Coming-soon status | Prose | High-level answers |
| `src/app/(site)/terms/page.tsx` | Eligibility (**18+, AU residents; ACT & SA EXCLUDED by permit**), billing, entries rules, cancellation, ACL refund carve-out | Prose (legal) | **Authoritative for eligibility/refund/legal** |
| `src/config/prizes.ts` | 13 prize entries (12 tool×storage combos +$5,000 cash, or $10,000 cash) | Structured | Prize answers |
| `src/data/membershipPackages.ts` | Tier price/entries/partner-days, Stripe IDs | Structured | **Pull prices/entries from here, don't paraphrase** |
| `src/data/upsellPackages.ts` | 22 upsell records, multipliers, display rules | Structured | Upsell answers |
| `src/data/miniDrawPackages.ts` | Mini-draw pack ladder, member-only flags | Structured | Mini-draw answers |
| `src/data/partnerBrandOffers.ts` | 7 partner brands (ordered; tier visibility = first N%) | Structured | Partner answers |
| `professions.ts`, `australianStates.ts` | Audience/geography vocabulary (cross-ref Terms: ACT/SA excluded) | Structured | Context |
| Selected `docs/*.md` | Refund/billing-anchor/referral/rewards-pause/prize-catalog | Prose (technical) | Summarise into topics; **don't surface verbatim** |
| ⚠️ `src/data/faqs.ts` | **Stale e-commerce boilerplate — contradicts the business** | Prose-in-TS | **Do NOT use until rewritten** |

### What the bot **cannot** answer from code (must escalate)

Flag these as bot limits — they are operational-only (`BUSINESS.md §3c/§9h`, Terms §11):

- **Winner identity verification, prize-claim, prize-customisation pick, physical shipping/delivery** — no claim form, no `claimedAt`, no shipment tracking in code.
- **Discretionary/goodwill refunds** beyond the documented non-refundable policy — case-by-case by support; the bot must **not** promise refunds.
- **Failed-payment email cadence** (Klaviyo flows, not code), **affiliate commission rates** (admin-set per affiliate — no fixed published rate), **mini-draw dates** (threshold-triggered, no fixed date).
- **GST nuance:** prices are GST-inclusive "by silence" today; only the future shop cart adds explicit 10% GST.

### Why not fine-tuning

Rejected: it cannot keep prices/rules fresh (they change often, by design and by the doc-sync rule), cannot cite sources (so hallucination risk goes *up*), and is high-effort/brittle for an SMB. Anthropic's recommended path for knowledge is retrieval/context, not fine-tuning.

---

## <a id="4-cost"></a>4. Question 3 — Cost (summary)

Full tables, assumptions, and break-even in **[cost-model.md](cost-model.md)**. Headlines (AUD, FX 1 USD = 1.53 AUD, two-tier Haiku+Sonnet with caching):

| Conversations/month | **Build (Claude)** | **Buy (Intercom Fin)** |
|---|---|---|
| 500 | **~$41** | ~$574 |
| 2,000 | **~$166** | ~$2,165 |
| 10,000 | **~$815** | ~$10,649 |

- **~$0.08 AUD per conversation** built vs **~$1.51 AUD per resolution** (~$2.16/conversation at a 70% resolution rate) for a per-resolution vendor — a **~25× gap**.
- **Prompt caching saves ~40%** of model cost (the ~9.5k-token system+knowledge prefix reads at 0.1×).
- **Embeddings and Atlas Vector Search are effectively free** at this scale (cents; runs on the existing cluster).
- **Break-even vs buying is well under 100 conversations/month** — below that, the decision is about engineering time, not run-rate. *Build TCO excludes engineering build/maintenance labour — that is the real "build" cost, not the token run-rate.*
- Claude prices, the caching multipliers, and the Intercom Fin $0.99/outcome figure were all **verified**. Per-conversation token estimates are medium-confidence and scale ~linearly with conversation length.

---

## <a id="5-hosting"></a>5. Question 4 — Running it 24/7

### Recommended operating model

- **A Node.js (not Edge) App Router route** at `src/app/api/chat/route.ts` that **streams via SSE**. Edge can't run Mongoose/NextAuth and has a ~25s response-start window; Node Fluid Compute gives 300s default (800s on Pro). **Verified.**
- ⚠️ **Set `maxDuration: 60` explicitly in `vercel.json`** — the repo's catch-all `src/app/api/**/route.ts: { maxDuration: 10 }` would otherwise cap streaming at 10s and cut answers off mid-sentence. **Verified the catch-all exists.**
- **Model fallback chain:** Haiku 4.5 primary → **Sonnet 4.6 on `refusal` / `overloaded_error` (529) / repeated 429** so a single refusal or transient overload never breaks support. The Anthropic SDK already auto-retries 408/409/429/5xx/529 up to 2× with backoff; explicit model fallback covers sustained issues. **Verified.** (Always check `stop_reason` before reading content — Claude 4+ can return `stop_reason: "refusal"` on a 200.)
- **Conversation persistence** in two user-scoped Mongo collections (`ChatConversation` + `ChatMessage`) mirroring `ContactSubmission`/`ErrorReport` conventions (indexes, TTL, hashed IPs).
- **Abuse + cost control:** `createDistributedRateLimiter` keyed by userId-or-IP, a hard per-conversation message cap, max input/output token caps, and a **daily org token budget that trips a kill-switch** into a "contact a human" fallback (mirror Norm's kill-switch).
- **Observability:** reuse the existing **`ErrorReport`** model for failures and **Vercel Speed Insights** for latency/error-rate — do not build a parallel logger. Track deflection/resolution rate as the product metric.
- **Human escalation:** a `request_human` tool the model calls when it can't help → writes a **`ContactSubmission`** (the existing queue) + SendGrid alert. State after-hours response expectations in the bot's opening message (a small team can't staff live 24/7; the bot is 24/7, humans are not).

### Risks

- **Cost runaway on a public endpoint** is the top risk — see the rate-limit/token-budget/kill-switch stack above and [cost-model.md](cost-model.md).
- The in-memory limiter resets per instance; use the **Mongo-backed** `createDistributedRateLimiter` for anything that must hold across Vercel instances (it fails open — pair with the token-budget kill-switch for hard cost capping).
- Editing `vercel.json` triggers the doc-sync hook (update `docs/infrastructure/`).
- Minor verification correction: the Edge "25MB memory ceiling" cited in research is inaccurate (Edge has a 1/2/4MB *code-size* limit by plan; the 25s is the streaming-*start* window) — doesn't change the "use Node" decision.

---

## <a id="6-integration"></a>6. Question 5 — Website integration

- **A same-origin React widget** (floating bubble + panel) mounted in **`src/app/(site)/layout.tsx`** next to `UnifiedModalManager` — that puts it on every site page. (Use the root layout instead only if it must also appear on admin/login routes.)
- **No CSP change** because it streams from same-origin `/api/chat` (`'self'` is already allowed in `connect-src`/`script-src`). This is a strong reason to build the UI in-house rather than load a third-party widget script (which would require widening CSP in `src/utils/security/csp.ts`).
- **Coexist with the modal-priority system** (`src/stores/useModalPriorityStore.ts`): it has no chat type today. Keep the bubble's z-index **below** full-screen modals (so upsell/renewal/gate-closed modals win), or add a new `ModalType` if the widget should participate in priority/queueing.
- **Member-aware:** the route reads `getServerSession` — logged-in members get account-aware answers (Phase 2 tools); **logged-out visitors get the FAQ-only bot** (no PII, fastest compliant path).
- **Client state** follows house conventions (TanStack Query / Zustand); per the standing org rule, **clear per-user chat history on sign-out / account switch** (wire into the sign-out trigger before the server sign-out/redirect).

---

## <a id="7-build-vs-buy"></a>7. Build vs Buy

**Recommendation: BUILD** on the Claude API, modelled on the Norm gateway. The deciding factor: the headline value is answering each member about **their own** subscription/draw/billing, which requires deep authenticated first-party integration with your Mongo/Stripe data. Every managed vendor is built around generic FAQ deflection and prices per resolution — so you'd build the integration that matters **anyway**, on top of a paid platform (pay twice), while shipping AU member PII to a foreign SaaS.

| Option | Pricing (verified) | Fit |
|--------|--------------------|-----|
| **BUILD on Claude API** ✅ | Token usage only — Haiku $1/$5, Sonnet $3/$15; caching ~0.1× reads. No per-resolution/seat fee. | **Strong.** Matches the core need, the stack, the in-house secure-AI capability, cost sensitivity, and the AU privacy posture. |
| Anthropic Managed Agents | Same token rates + beta orchestration; per-session containers. Beta; not on Bedrock/Vertex. | Marginal — right vendor, wrong shape. Support Q&A is stateless, not a containerised long-horizon agent task. Revisit only if the bot later needs multi-step actions. |
| Intercom Fin | **$0.99/outcome**, 50/mo min, + ~$29/seat/mo. No platform fee. | Weak. Best-in-class deflection, but the per-user integration is still custom. |
| Zendesk AI | **$1.50 committed / $2.00 PAYG** per resolution + ~$50/agent/mo Advanced AI (being absorbed into Suite May 2026); uncapped overage since Jan 2026. | Weak. Over-scaled; uncapped overage is a budget risk. |
| Ada | Quote-only; ~$30k/yr entry + per-conversation (moved off per-resolution). | Poor (enterprise). |
| Sierra | Quote-only, outcome-based; ~$150k/yr + $50–200k setup (est.). | Poor (enterprise). |
| Gorgias AI | $0.90–$1.00/resolution + **dual-billed** helpdesk ticket fee; Shopify-centric. | Weak (ecom mismatch). |
| Crisp | Flat per-workspace ~$45–$295/mo (credit-metered AI). | Moderate for a *pure FAQ* widget on a tight budget; weak for per-user status. |

Vendor pricing models (Fin $0.99, Zendesk $1.50/$2.00) were **verified** against the vendors' own pages. Ada/Sierra figures are third-party estimates (low confidence) — get written quotes before relying on them.

---

## <a id="8-security"></a>8. Security, privacy & Australian compliance

### The regulatory frame (verified against OAIC / legislation)

- **OAIC's Oct 2024 commercial-AI guidance**: public-facing AI (chatbots) **must be clearly identified as AI**, and organisations should **not enter personal/sensitive information into publicly available generative AI tools**. AI-inferred personal info is a "collection" (APP 3); accuracy (APP 10) requires treating outputs as probabilistic with human oversight.
- **APP 8 (cross-border disclosure):** if personal information goes to an overseas recipient, the entity **remains accountable in Australia** for the recipient's breaches (s 16C) unless an exception applies (APP-8 informed consent, or a reasonable belief the recipient is bound by a substantially-similar regime). This is why onshore inference (Bedrock Sydney) is the cleanest path.
- **Privacy and Other Legislation Amendment Act 2024:** tiered civil penalties (up to **AUD 50M** / 3× benefit / 30% of turnover) and a new statutory tort of serious invasion of privacy — a single cross-user PII leak from the bot is a "serious interference" candidate. Privacy policies must disclose substantially-automated decisions with significant effect (the bot should make **none** — informational + human-routed only).
- **Anthropic API** never trains on API data; standard log retention is 7 days; **Zero Data Retention** is available. ⚠️ ZDR is about *retention/training*, **not** geographic residency — it does **not** by itself satisfy APP-8 onshore residency.

### Concrete guardrail requirements (the security boundary is structural, not the prompt)

Grouped to map directly into [implementation-spec.md](implementation-spec.md):

1. **Privacy/APP:** label as AI on first message + widget header; update the privacy policy (AI use, provider, what PII the bot accesses, overseas posture, "informational only"); for onshore PII use **Bedrock `ap-southeast-2`** (or keep Phase 1 logged-out/zero-PII); **data-minimise** (pass scoped tool results, never dump the user record into the prompt); run a **PIA before Phase 2**.
2. **Least privilege (enforced structurally):** **no write/mutation tools exist**; every account tool **filters by the session `userId` resolved server-side** (ignore any model-supplied id/email); **output projection capped at `firstName` + opaque `userId`**, Zod-validated before reaching the model; wrap all tools in `withChatbot()` (session auth → rate-limit → kill-switch → audit → Zod I/O); **anonymous sessions get zero account tools**.
3. **Prompt-injection / jailbreak (OWASP LLM01:2025 defence-in-depth):** system prompt fixes role/allowed-topics/hard-refusals; **treat all user and retrieved text as data, not instructions**; privilege separation means even a successful jailbreak can't mutate or read cross-user data (no such tools exist); fixed polite refusal + escalation for out-of-scope/hostile/prompt-extraction; never echo the system prompt or tool schemas.
4. **Hallucination mitigation:** answer **only from provided context** (knowledge pack/RAG + tool results); cite the source; **explicit "I don't know → escalate"** for low confidence or billing/cancellation/winner/legal topics; never invent prices, draw dates, entry counts, or winner outcomes — and reinforce that **randomdraws.com.au picks winners, not the platform**.
5. **PII in logs:** redact emails/phones/card/address patterns before persisting (mirror Norm's hashing); short retention (e.g. 30 days) + documented in the policy; **clear client-side chat history on sign-out/account switch** (standing org rule — wire before server sign-out; clear the chat IndexedDB store / per-user localStorage; keep device prefs; ensure any queued unsent messages can't drain into the next authenticated account); provide a "delete my chat history" affordance.
6. **Abuse + cost controls:** per-session and per-IP rate limits (stricter for anonymous), max input/output caps, per-conversation message cap, **daily token budget + kill-switch**, reject oversized inputs at the Zod boundary, alert on spikes via `ErrorReport` + audit.

### Top footguns

(i) Mis-set residency (only one of workspace/inference geo set) — moot on first-party (no AU option) which is exactly why **Bedrock Sydney** is the route. (ii) Treating the system prompt as the security boundary — the real boundary is *no write tools + server-side userId scoping + Zod output projection*. (iii) Letting the model choose a `userId`/email argument — the classic cross-user leak. (iv) Forgetting the sign-out clear. (v) The bot promising refunds / making "decisions" — keep it informational and human-routed.

---

## <a id="9-sources"></a>9. Sources

**Codebase (this repo):** `src/lib/internal-norm/withNorm.ts`, `classification.ts`, `schemas/users.ts`, `killSwitch.ts`, `rateLimits.ts`, `audit.ts`; `src/models/NormCallLog.ts`, `ContactSubmission.ts`, `RateLimit.ts`, `ErrorReport.ts`; `src/lib/api-auth.ts`, `auth.ts`; `src/utils/security/rateLimiter.ts`, `csp.ts`; `src/middleware.ts`, `next.config.ts`, `vercel.json`; `src/components/features/ContactForm.tsx`; `src/app/(site)/layout.tsx`, `contact/page.tsx`, `terms/page.tsx`; `src/stores/useModalPriorityStore.ts`; `src/data/{membershipPackages,upsellPackages,miniDrawPackages,partnerBrandOffers,faqs,professions,australianStates}.ts`; `src/config/prizes.ts`; `BUSINESS.md`, `README.md`.

**External (verified):**
- Anthropic pricing/models/caching/citations/residency/retention — `platform.claude.com/docs/en/about-claude/pricing`, `/about-claude/models/overview`, `/build-with-claude/prompt-caching`, `/build-with-claude/citations`, `/manage-claude/data-residency`, `/manage-claude/api-and-data-retention`.
- AWS Bedrock region availability — `docs.aws.amazon.com/bedrock/latest/userguide/models-region-compatibility.html`.
- MongoDB Atlas Vector Search / Search Nodes / Voyage — `mongodb.com/products/platform/atlas-vector-search`, `.../atlas-search-nodes-now-with-multi-region-availability`, `mongodb.com/docs/voyageai/models/`, `docs.voyageai.com/docs/pricing`.
- OpenAI pricing — `developers.openai.com/api/docs/pricing`. Google Gemini pricing — `ai.google.dev/gemini-api/docs/pricing`.
- Vercel function/streaming limits — `vercel.com/docs/functions/limitations`, `.../configuring-functions/duration`, `.../runtimes/edge`.
- Vendor pricing — `fin.ai/pricing`, `corepiper.com/blog/zendesk-ai-agent-pricing-2026/`, `gorgias.com/blog/ai-agent-pricing`, `crisp.chat/en/pricing/`, `featurebase.app/blog/ada-cx-pricing`, `featurebase.app/blog/sierra-ai-pricing`.
- Australian privacy — OAIC commercial-AI guidance + APP 8 chapter (`oaic.gov.au/...`); OWASP LLM01:2025 (`genai.owasp.org/llmrisk/llm01-prompt-injection/`); Privacy Act 2024 amendment analysis (`corrs.com.au/insights/...`).
