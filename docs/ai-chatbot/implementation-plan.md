# AI Support Chatbot — Implementation Plan

> Companion to [implementation-spec.md](implementation-spec.md). Lean-but-complete: **four phases, each ships a usable win**, sequenced so the fastest-compliant version goes live first and risk is retired before member PII is ever involved. Aligned to the repo ethos — don't overengineer, don't under-build.

---

## Decision gate (answer this BEFORE Phase 1) — is a bot worth building?

The cost is bounded and trivial (see [alternatives-and-cost-control.md](alternatives-and-cost-control.md)), so the real question is **volume**, not money:

- **Do you get ≳300–500 repetitive, doc-answerable support questions/month, AND will someone own FAQ upkeep + wrong-answer monitoring?**
  - **No, low volume →** *don't build a bot.* Do **Pre-flight P2 only** (rewrite `/faq` to the real business) + add a free **no-LLM FAQ search**, and keep the contact form. Revisit when volume grows. This is the honest "not worth it" path.
  - **Yes, but no maintenance owner →** buy a **flat-rate** vendor (Crisp Essentials ~$158 AUD/mo, default hard-stop). Never per-resolution (that's the $1,000+ spike).
  - **Yes + maintenance owned →** build, starting at Phase 1 below.

---

## Pre-flight (decisions & checks — do before Phase 1 build)

These are quick and unblock everything; none is a build phase.

| # | Item | Owner | Why it matters |
|---|------|-------|----------------|
| P1 | **SSE streaming spike** on a throwaway `src/app/api/chat-spike/route.ts` (Node runtime) confirming SSE + `maxDuration` override works against the 10s catch-all in `vercel.json`. | Eng | De-risks the one unproven mechanism in the repo. |
| P2 | **Rewrite `src/data/faqs.ts`** to the real giveaway/membership domain (or author the knowledge pack from `BUSINESS.md` + Terms + data files and leave `faqs.ts` for the `/faq` page only). | Product + Eng | Current FAQ is stale e-commerce boilerplate that contradicts the business — must not ground the bot. |
| P3 | **Confirm `CONTACT_RECIPIENT`** (`getContactEmail()`) is a monitored support inbox. | Ops | Escalations must reach a human. |
| P4 | **Residency decision** for Phase 2: onshore (Bedrock `ap-southeast-2`) vs APP-8 informed consent. **Verify Haiku 4.5 is available in Bedrock Sydney.** | Owner + Eng + Legal | Determines the Phase 2 provider path and cost. (Not needed for Phase 1 — it's zero-PII.) |

---

## Phase 1 — Logged-out, FAQ-only grounded bot ✅ *fastest compliant launch*

**Ships:** a working, streaming support chatbot on every site page that answers "how it works" questions (memberships, tiers, draws, entries, partner discounts, eligibility, refunds-policy) accurately and grounded, and escalates anything it can't handle to a human. **No member PII leaves the system**, so it sidesteps the residency/APP-8 question entirely and is the fastest path to a compliant live bot.

**Scope (deflection-first + hard-capped from day one):**
- `SupportChatWidget` mounted in `src/app/(site)/layout.tsx` (same-origin, **no CSP change**; below full-screen modals). Labels itself as AI; states after-hours expectations.
- **No-LLM layers first** ([spec §10b](implementation-spec.md#10b-cost)): a semantic FAQ search / canned answers over the rewritten FAQ content answer the common questions at ≈$0; the LLM is only called on a no-match.
- `src/app/api/chat/route.ts` (Node, SSE) behind `withChatbot()` (identify-as-anonymous → distributed rate-limit → kill-switch → audit → Zod I/O). `vercel.json` `maxDuration: 60` + `docs/infrastructure/` updated.
- **Cheapest capable model on the fallback** — Gemini 2.5 Flash-Lite or Claude Haiku 4.5 — grounded on a **cached knowledge pack** generated at build from `BUSINESS.md`, Terms, and the structured data files (Citations API on). First-party Anthropic API is fine here (zero PII).
- **Both cost ceilings live before guests can reach it:** provider monthly spend cap (e.g. $50) **+** app-level daily token budget + kill-switch (fail-closed), **hard `max_tokens` ~300**, per-IP/session rate limits. Guests are FAQ-search-first; require **hCaptcha** (already loaded) before a guest's first generative turn.
- Escalation `request_human` → writes `ContactSubmission` + SendGrid alert.
- `ChatConversation` / `ChatMessage` models with TTL + PII redaction; failures → `ErrorReport`.
- System-prompt guardrails: answer only from context, cite, refuse/escalate on low confidence or billing/winner/legal; never invent prices/dates/outcomes; state randomdraws.com.au picks winners.

**Cost:** ~$3–57 AUD/month at 500–10k conversations once the no-LLM layers carry most volume (cheapest model on the tail). Worst case is bounded by the spend cap + daily kill-switch — it **cannot** reach $1,000.

**Risks/mitigation:** guest abuse / cost runaway → the two ceilings + guest gating + `max_tokens` from day one (this is the owner's #1 concern — non-negotiable); stale facts → knowledge pack generated from canonical sources in `prebuild`.

**Done when:** the bot answers grounded FAQ questions, cites sources, escalates correctly, and is rate-limited + kill-switchable; lint/type-check clean; `/faq` and bot share the rewritten content.

---

## Phase 2 — Member-aware, read-only per-user answers ✅ *the headline value*

**Ships:** for logged-in members, the bot answers **about their own account** — current tier, entries this cycle, subscription/billing status, next billing date, which draw their entries are in, partner brands visible at their tier — without any write capability. This is the feature that no off-the-shelf vendor delivers without custom integration.

**Scope:**
- **Read-only, session-scoped tools** (`get_my_membership`, `get_my_entries`, `get_my_billing_status`, `get_draw_status`, `get_partner_visibility`) reusing existing services; identity from `ctx.actor.userId` **only**; Zod egress projection capped to a tight PII boundary; **no write tools**. Anonymous users stay FAQ-only.
- **Two-tier routing live:** Haiku 4.5 triage/FAQ → Sonnet 4.6 on complexity/low-confidence.
- **Residency:** route Phase-2 (PII-touching) inference through **Bedrock `ap-southeast-2`** per P4 — or implement an **APP-8 informed-consent** step if offshore is accepted.
- **Compliance:** complete the **Privacy Impact Assessment**; update the **privacy policy** (AI use, provider, what PII the bot accesses, overseas posture, informational-only); implement **sign-out chat-history clear** (standing org rule); add a "delete my chat history" affordance.

**Cost:** blended ~$0.08 AUD/conversation → ~$41 / $166 / $815 AUD per month (add ~10% if Bedrock Sydney regional pricing applies).

**Risks/mitigation:** cross-user leak → structural (no model-supplied id, server-side scoping, Zod projection, audit); Haiku-in-Bedrock unconfirmed → Sonnet-only onshore fallback; over-broad answers → projection schemas + golden-set eval.

**Done when:** a member gets correct, scoped answers about their own account; no tool accepts an identifier; PIA + policy + sign-out clear shipped; residency path confirmed.

---

## Phase 3 — Quality, scale & hardening ✅ *measurably better, provably safe*

**Ships:** higher answer quality at scale, a measured deflection/resolution rate, and a hardened security posture.

**Scope:**
- **Atlas Vector Search RAG** if/when the knowledge pack outgrows the cache sweet-spot (embed from canonical sources on deploy; empty-retrieval → escalate). Runs on the existing cluster.
- **Offline eval harness:** a golden-set of real support questions graded by **Opus 4.8** (Batch API, 50% off) gating each release; track regressions.
- **Analytics:** deflection rate, escalation rate, top intents, token spend, latency — via `ErrorReport` + Vercel Speed Insights + the audit log; a simple admin view.
- **Prompt-injection / jailbreak hardening pass** (OWASP LLM01:2025): red-team the system prompt, confirm a successful jailbreak still can't mutate or read cross-user data (it can't — no such tools), tighten refusals.

**Done when:** there's a release-gating eval, a deflection metric the owner can see, and a documented red-team result.

---

## Phase 4 — Optional enhancements *(only if the data says so)*

Pull from this list based on Phase 3 analytics — do **not** pre-build:

- Proactive, context-aware nudges (e.g. offer help on the past-due / renewal-failed surface).
- Additional read-only tools as top-intent analysis reveals gaps.
- Live human handoff (real-time agent takeover) if escalation volume justifies it beyond the async `ContactSubmission` flow.
- **Shop support** once the shop launches (new knowledge + GST nuance).
- **Android app** integration (the planned native app) — reuse the same `/api/chat` endpoint.

---

## Sequencing & effort (indicative)

| Phase | Relative effort | Gating dependency |
|-------|-----------------|-------------------|
| Pre-flight | Small | — |
| Phase 1 | Medium | Pre-flight P1–P3 |
| Phase 2 | Medium–Large | Pre-flight P4 (residency + Haiku check), PIA |
| Phase 3 | Medium | Phase 2 traffic to learn from |
| Phase 4 | Variable | Phase 3 analytics |

**Guiding principle:** Phase 1 proves the UX, streaming, grounding, and escalation with zero privacy risk. Phase 2 adds the per-user value behind a resolved residency/PIA gate. Phases 3–4 are quality and scale — earned by data, not assumed.
