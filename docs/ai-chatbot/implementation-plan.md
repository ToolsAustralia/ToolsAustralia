# AI Support Chatbot — Implementation Plan

> **STATUS:** Phase 1 shipped (FAQ-only Cobber bot). Phase 2 (Amazon Bedrock + per-user member tools + data residency) was **DROPPED** and is not being pursued. Phases 3/4 reference the dropped member features and are likewise not being pursued as written.

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Companion to [implementation-spec.md](implementation-spec.md) (architecture), [alternatives-and-cost-control.md](alternatives-and-cost-control.md) (cost/abuse), and [research.md](research.md) (evidence). This is the **definitive, scalable build plan** — Phase 0 and Phase 1 are detailed to task level and execution-ready; Phases 2–4 are task-outlined and **expanded just-in-time** at the start of each phase, grounded in the code that exists by then (writing exact Phase-4 code before Phase 1 exists would be guesswork, not rigor).

**Goal:** Ship a 24/7, deflection-first, hard-cost-capped AI support chatbot for Tools Australia — fast for guests (FAQ), account-aware for members — built on the existing Next.js/Mongo/Vercel stack so it scales and stays maintainable.

**Architecture:** A thin Node.js streaming route (`/api/chat`) wrapped by a `withChatbot()` security pipeline (mirroring the in-house "Norm" gateway), delegating to a `ChatService` that runs a **deflection-first pipeline** (decision-tree → FAQ search → answer cache → cheapest-model RAG fallback) behind two independent cost ceilings. The model layer is the **Vercel AI SDK**, so providers (first-party Anthropic for zero-PII Phase 1, Amazon Bedrock Sydney for member-PII Phase 2, Gemini as a cost option) swap behind one interface. Knowledge is **generated at build** from canonical data files so it never drifts.

**Tech Stack:** Next.js 15 (App Router, Node runtime), React 19, TypeScript, MongoDB/Mongoose, NextAuth, Zod, Tailwind v4. **New deps:** `ai` (Vercel AI SDK core), `@ai-sdk/react` (`useChat`), `@ai-sdk/anthropic`, `@ai-sdk/amazon-bedrock` (Phase 2), optionally `@ai-sdk/google` (Gemini cost option) and `@ai-sdk/openai` (embeddings, Phase 3). Reuse: `src/utils/security/rateLimiter.ts` + `RateLimit` model, `ErrorReport`, `ContactSubmission`, hCaptcha (already loaded), MongoDB **Atlas Vector Search** (Phase 3).

## Global Constraints

Every task implicitly includes these (copied from the spec, repo CLAUDE.md, and the verified research):

- **Layering (hard rule):** `app → services → repositories/lib → models`. Route handlers stay thin (parse → authorize → rate-limit → delegate → stream); business/LLM logic in `src/services/support-chat/`; no DB access or business logic in React components; Mongoose models one-per-file.
- **Runtime:** the chat route is **Node.js** (`export const runtime = 'nodejs'`), never Edge (needs Mongoose/NextAuth). `vercel.json` must add `"src/app/api/chat/route.ts": { "maxDuration": 60 }` (the repo's `src/app/api/**/route.ts` catch-all is 10s and would truncate streaming). Editing `vercel.json` requires updating `docs/infrastructure/` (doc-sync hook).
- **Two cost ceilings, always on before guests can reach the bot:** (A) provider monthly spend cap (first-party Anthropic Console, Phase 1); (B) app-level **daily token budget + kill-switch**, Mongo-backed, **fail-closed**. Plus hard `max_tokens` (~300) and per-IP/session rate limits.
- **Deflection-first:** no-LLM layers (decision-tree, FAQ search, answer cache) run before any model call; the LLM is the fallback, not the default.
- **Guest gating:** anonymous visitors get the no-LLM FAQ search only; the generative bot requires sign-in/email **and** an hCaptcha challenge before a guest's first generative turn. Don't add a second CAPTCHA vendor.
- **Least privilege (structural):** **no write/mutation tools exist**; every per-user tool resolves identity from the **NextAuth session `userId` server-side only** (never a model-supplied id/email); every tool output is **Zod-projected** before it reaches the model. **As built: no per-user account tools exist (FAQ-only).**
- ~~**Residency:** Phase 1 = first-party Anthropic API (zero PII, keeps the provider spend cap). Phase 2 (member PII) = **Amazon Bedrock `ap-southeast-2` (Sydney)** for onshore inference (decision confirmed). ⚠️ Verify Haiku 4.5 in Bedrock Sydney; fall back to Sonnet 4.6 (confirmed in-region) if absent.~~ **DROPPED** — Phase 2 / Bedrock not implemented. As built: first-party Anthropic API only (Phase-1 FAQ-only posture).
- **Model:** cheapest capable model on the tail — Claude Haiku 4.5 (default; keeps Anthropic hard cap) or Gemini 2.5 Flash-Lite (cost option). Sonnet 4.6 only on rare hard escalation; Opus 4.8 offline eval only.
- **Knowledge:** generated at build from `BUSINESS.md`, Terms (`src/app/(site)/terms/page.tsx`), and `src/data/{membershipPackages,upsellPackages,miniDrawPackages,partnerBrandOffers}.ts` + `src/config/prizes.ts`. **Do NOT use `src/data/faqs.ts`** until rewritten (it's stale e-commerce boilerplate).
- **Never invent** prices, entry counts, draw dates (27th, 8:30 PM AEST/AEDT), or winner outcomes; state that **randomdraws.com.au picks winners, not the platform**; on low confidence or billing/refund/winner/legal topics, **escalate to a human**.
- **Tests** are standalone `tsx` scripts under `src/**/__tests__/*.test.ts`, each wired to its own `test:*` entry in `package.json` (no jest/vitest/pytest). A test asserts and exits non-zero on failure.
- **Prod console:** `console.log/info/debug/warn` are stripped in prod builds — use `console.error` or route through `ErrorReport` for anything that must survive (incl. staging).
- **Sign-out clear (org rule):** clear per-user chat history (IndexedDB store + per-user `localStorage`) in the sign-out trigger **before** the server sign-out/redirect; keep device prefs; ensure queued/unsent messages can't drain into the next account.
- **Doc-sync:** register a `support-chat` domain in the `CLAUDE.md` Domain Manifest and keep `docs/ai-chatbot/` in lockstep with code. **No commits without explicit user authorization.**

---

## Target file structure (the scalable end-state)

Build toward this; each phase fills in part of it. One responsibility per file; files that change together live together.

```
src/
  app/api/chat/route.ts                     # thin Node SSE route → withChatbot → ChatService
  lib/support-chat/
    withChatbot.ts                          # identify → rate-limit → kill-switch → audit → Zod I/O
    provider.ts                             # Vercel AI SDK model registry + fallback chain (anthropic/bedrock/google)
    costGuard.ts                            # daily token budget counter + kill-switch (Mongo, fail-closed)
    audit.ts                                # per-request audit (hashed/redacted) → ChatAuditLog
    redact.ts                               # PII redaction for message persistence
    knowledge/
      pack.ts                               # loads src/generated/chatKnowledgePack (cached prefix)
      retrieve.ts                           # Phase 1: keyword/embedding FAQ search; Phase 3: Atlas $vectorSearch
  services/support-chat/
    ChatService.ts                          # orchestrates deflection pipeline → LLM fallback → persist
    deflection/
      decisionTree.ts                       # top-intent quick-replies (zero LLM)
      faqSearch.ts                          # semantic/keyword FAQ match → canned answer
      answerCache.ts                        # Phase 3: semantic answer cache (generic FAQs only)
    tools/
      registry.ts                           # classification-style registry of read-only tools (Phase 2)
      getMyMembership.ts | getMyEntries.ts | getMyBillingStatus.ts | getDrawStatus.ts   # Phase 2
    escalation.ts                           # request_human → ContactSubmission + SendGrid
    systemPrompt.ts                         # hardened system prompt (role/scope/refusals/citations)
  models/
    ChatConversation.ts | ChatMessage.ts | ChatDailyBudget.ts | ChatAuditLog.ts
  components/support-chat/
    SupportChatWidget.tsx                   # floating bubble + panel (useChat); labels as AI
    useSupportChat.ts                       # client hook (AI SDK useChat wrapper + hCaptcha + sign-out clear)
  generated/chatKnowledgePack.ts            # GENERATED — do not hand-edit
scripts/
  build-chat-knowledge-pack.ts              # prebuild: generate knowledge pack from canonical sources
  embed-chat-knowledge.ts                   # Phase 3: build Atlas vector index from the pack
  eval-chat-goldenset.ts                    # offline eval: golden-set graded by Opus 4.8 (Batch API)
src/services/support-chat/__tests__/*.test.ts  # tsx tests, wired to package.json test:chat-*
docs/ai-chatbot/                            # this dossier (the support-chat domain docs)
```

---

## Decision gate (confirm before Phase 0)

The cost is bounded and trivial, so the real question is **volume**: build only if you field **≳300–500 repetitive, doc-answerable questions/month** *and* someone owns FAQ upkeep. Below that, do **Phase 0 Task 0.2 (rewrite `/faq`) + a no-LLM FAQ search only**, skip the bot, and revisit. (See [alternatives-and-cost-control.md §8](alternatives-and-cost-control.md).) **This plan assumes the gate is passed.**

---

## Phase 0 — Foundations (no user-facing change; everything after depends on it)

**Milestone:** the project compiles with the new deps, env, models, config, domain registration, and a verified streaming spike — so Phase 1 is pure feature work.

### Task 0.1: Dependencies, env, and the streaming spike

**Files:** Modify `package.json`, `.env.example`; Create `src/app/api/chat-spike/route.ts` (throwaway), `vercel.json` entry; Modify `docs/infrastructure/`.

**Interfaces — Produces:** the `ai` + `@ai-sdk/anthropic` packages available; env keys `ANTHROPIC_API_KEY` (exists), `CHAT_MODEL_PRIMARY`, `CHAT_DAILY_TOKEN_BUDGET`, `CHAT_KILL_SWITCH`, `HCAPTCHA_SECRET` (may exist).

- [ ] **Step 1:** Add deps: `npm i ai @ai-sdk/anthropic @ai-sdk/react`. Confirm they appear in `package.json` and `package-lock.json`.
- [ ] **Step 2:** Add env placeholders to `.env.example`: `CHAT_MODEL_PRIMARY=claude-haiku-4-5`, `CHAT_MODEL_ESCALATION=claude-sonnet-4-6`, `CHAT_DAILY_TOKEN_BUDGET_USD=5`, `CHAT_KILL_SWITCH=false`. Note `ANTHROPIC_API_KEY` already exists.
- [ ] **Step 3:** Create `src/app/api/chat-spike/route.ts` (Node runtime) that uses `streamText` from `ai` + `anthropic('claude-haiku-4-5')` to stream a one-line reply, returning `result.toDataStreamResponse()`.
- [ ] **Step 4:** Add `"src/app/api/chat-spike/route.ts": { "maxDuration": 60 }` to `vercel.json`; record the change in `docs/infrastructure/`.
- [ ] **Step 5 (manual verify):** `npm run dev`, curl/Postman the spike route, confirm a streamed (chunked) response arrives and does **not** cut off at 10s. Document the result in `docs/ai-chatbot/implementation-plan.md` (this file) under a "spike result" note.
- [ ] **Step 6:** Delete `src/app/api/chat-spike/route.ts`; commit `chore(chat): add AI SDK deps + verify SSE streaming on Vercel`.

### Task 0.2: Rewrite FAQ content to the real domain

**Files:** Modify `src/data/faqs.ts` (rewrite content) — coordinate with the `cart-shop-products`/shared docs owners; this also fixes the public `/faq` page.

- [ ] **Step 1:** Replace the stale e-commerce Q&As with the **real** top 15–25 questions sourced from `BUSINESS.md` + Terms (memberships/tiers/prices, draw cadence + freeze window, entries pools, partner-discount access, cancellation/refund policy, eligibility incl. ACT/SA exclusion, "how do I get more entries"). Keep the existing `getFaqEntries()` shape and category structure.
- [ ] **Step 2:** Write a tsx test `src/data/__tests__/faqs.test.ts` asserting the FAQ set contains the canonical facts (e.g. an entry mentioning the draw is on the 27th, an entry stating memberships are non-refundable) and contains **no** banned stale strings (`PayPal`, `international shipping`, `3-5 business day`). Wire `test:chat-faqs` in `package.json`.
- [ ] **Step 3:** Run `npm run test:chat-faqs` → PASS. Commit `fix(faq): rewrite FAQ content to the membership/giveaway domain`.

### Task 0.3: Data models + domain registration

**Files:** Create `src/models/ChatConversation.ts`, `ChatMessage.ts`, `ChatDailyBudget.ts`, `ChatAuditLog.ts`; Modify `CLAUDE.md` (Domain Manifest), create `docs/ai-chatbot/` domain doc stubs if the doc-sync hook requires per-file docs.

**Interfaces — Produces:** `ChatConversation` (`userId?`, `anonId?`, `status`, `escalatedSubmissionId?`, `modelTier[]`, `tokenUsage`, `ipHash?`, TTL on `updatedAt`); `ChatMessage` (`conversationId`, `role`, `content` (redacted), `citations?`, `toolCalls?`, TTL); `ChatDailyBudget` (`dayKey` unique, `spentUsd`, `tokensIn`, `tokensOut`); `ChatAuditLog` (hashed request metadata, 90-day TTL).

- [ ] **Step 1:** Create the four models following `src/models/ContactSubmission.ts` / `ErrorReport.ts` conventions (indexes, TTL, hashed IPs). One file each.
- [ ] **Step 2:** Add a `support-chat` entry to the `CLAUDE.md` Domain Manifest with `"docs": "docs/ai-chatbot/"` and the `paths` globs from the [spec §11](implementation-spec.md#11-config).
- [ ] **Step 3:** Write `src/models/__tests__/chat-models.test.ts` asserting each schema validates a sample doc and rejects a bad one; wire `test:chat-models`. Run → PASS.
- [ ] **Step 4:** Commit `feat(chat): add chat models + register support-chat domain`.

---

## Phase 1 — Logged-out deflection FAQ bot ✅ *first usable launch (zero PII)*

**Milestone:** a public, streaming, AI-labelled support widget on every site page that answers "how it works" questions grounded in the knowledge pack, deflects most volume with **no LLM**, is **hard-cost-capped**, gates guests, and escalates to a human — with no member PII involved (so no residency/PIA blocker).

### Task 1.1: Cost guard (the bounded-bill core — build this FIRST)

**Files:** Create `src/lib/support-chat/costGuard.ts`, `src/services/support-chat/__tests__/cost-guard.test.ts`.

**Interfaces — Produces:** `assertWithinBudget(): Promise<{ ok: boolean; reason?: 'kill_switch' | 'daily_budget' }>` and `recordUsage(tokensIn, tokensOut, model): Promise<void>`, both backed by `ChatDailyBudget`. **Fails closed** (returns `ok:false` if Mongo is unreachable).

- [ ] **Step 1: Write the failing test** — `cost-guard.test.ts`: (a) under budget → `ok:true`; (b) `CHAT_KILL_SWITCH=true` → `ok:false, reason:'kill_switch'`; (c) day's `spentUsd` over `CHAT_DAILY_TOKEN_BUDGET_USD` → `ok:false, reason:'daily_budget'`; (d) simulated DB error → `ok:false` (fail-closed).
- [ ] **Step 2:** Run `npm run test:chat-cost-guard` → FAIL (module missing).
- [ ] **Step 3:** Implement `costGuard.ts`: atomic `findOneAndUpdate` on `ChatDailyBudget` keyed by UTC `dayKey`; convert tokens→USD via the model's per-token price; fail-closed try/catch.
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat(chat): fail-closed daily token budget + kill-switch`.

### Task 1.2: Provider registry + fallback chain (Vercel AI SDK)

**Files:** Create `src/lib/support-chat/provider.ts`, `__tests__/provider.test.ts`.

**Interfaces — Produces:** `getChatModel(tier: 'primary' | 'escalation', ctx): LanguageModel` (returns an AI SDK model from env config) and `withFallback(call)` that retries on `refusal` / overloaded / repeated 429 by switching primary→escalation. **Consumes:** `@ai-sdk/anthropic` now; `@ai-sdk/amazon-bedrock` is added in Phase 2 behind the same interface.

- [ ] **Step 1: Write the failing test** — assert `getChatModel('primary')` returns the model id from `CHAT_MODEL_PRIMARY`; assert `withFallback` invokes the escalation model when the primary throws an overloaded/refusal error (use a stub).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement using `anthropic(modelId)`; centralise model selection + the fallback policy here so Phase 2 only adds a Bedrock branch.
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat(chat): provider registry + model fallback chain`.

### Task 1.3: Knowledge pack generator (build-time, single source of truth)

**Files:** Create `scripts/build-chat-knowledge-pack.ts`, `src/generated/chatKnowledgePack.ts` (generated), `src/lib/support-chat/knowledge/pack.ts`; Modify `package.json` (`prebuild`/`predev` to run the generator).

**Interfaces — Produces:** `getKnowledgePack(): { text: string; sources: {id,title}[] }` loaded from the generated file, used as the cached system prefix.

- [ ] **Step 1:** Write the generator: read `BUSINESS.md`, the Terms page text, and the structured data files; emit a curated, citation-tagged pack to `src/generated/chatKnowledgePack.ts`. **Exclude `src/data/faqs.ts`'s old content** (use the rewritten FAQ + the canonical data).
- [ ] **Step 2:** Wire it into `prebuild`/`predev` next to `build-upsell-image-manifest.ts`.
- [ ] **Step 3:** Write `__tests__/knowledge-pack.test.ts` asserting the generated pack contains canonical facts (tier prices/entries, draw date) and stays under a token ceiling; wire `test:chat-knowledge`. Run → PASS.
- [ ] **Step 4:** Commit `feat(chat): build-time knowledge pack from canonical sources`.

### Task 1.4: Deflection layers (no-LLM first)

**Files:** Create `src/services/support-chat/deflection/decisionTree.ts`, `faqSearch.ts`, `src/lib/support-chat/knowledge/retrieve.ts`, `__tests__/deflection.test.ts`.

**Interfaces — Produces:** `tryDeflect(question, actor): Promise<{ answered: boolean; answer?: string; sources?: [] }>` — runs decision-tree + keyword/embedding FAQ match; returns `answered:false` on a low-confidence miss (→ caller falls through to the LLM).

- [ ] **Step 1:** Write tests: a known FAQ question ("when is the draw") returns a canned grounded answer with `answered:true` and **no LLM call**; an off-topic question returns `answered:false`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement decision-tree intents + a keyword/cosine FAQ matcher over the rewritten FAQ content (Phase 1 can be keyword-based; embeddings/Atlas come in Phase 3 behind the same `retrieve.ts` interface).
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat(chat): no-LLM deflection (decision-tree + FAQ search)`.

### Task 1.5: System prompt + escalation

**Files:** Create `src/services/support-chat/systemPrompt.ts`, `escalation.ts`, `__tests__/escalation.test.ts`.

**Interfaces — Produces:** `buildSystemPrompt(knowledgePack): string` (role/scope/hard-refusals/cite-or-escalate/"randomdraws.com.au picks winners"); `escalateToHuman({ actor, transcriptSummary }): Promise<{ submissionId }>` writing a `ContactSubmission` + firing the existing SendGrid notification.

- [ ] **Step 1:** Test `escalateToHuman` creates a `ContactSubmission` (status `new`) and calls the email service (stub); assert the system prompt contains the hard-refusal + winner-source lines.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement, reusing the existing contact-submission service + `emailService` (read `src/app/api/contact-submissions/route.ts` to confirm the service signature before calling it).
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat(chat): hardened system prompt + human escalation into ContactSubmission`.

### Task 1.6: `withChatbot()` wrapper

**Files:** Create `src/lib/support-chat/withChatbot.ts`, `audit.ts`, `redact.ts`, `__tests__/with-chatbot.test.ts`.

**Interfaces — Produces:** `withChatbot(handler)` enforcing **identify (session or anon-IP) → rate-limit (`createDistributedRateLimiter`) → kill-switch/budget (`costGuard`) → handler → audit (`ChatAuditLog`, hashed) → Zod I/O**. Anonymous actors are flagged so the handler can restrict them to FAQ-only. **Consumes:** `getServerSession`/`requireAuthenticatedUser` (read `src/lib/api-auth.ts` to confirm signatures), `createDistributedRateLimiter` + `getClientIdentifier` (read `src/utils/security/rateLimiter.ts`).

- [ ] **Step 1:** Tests: a request over the rate limit → 429; kill-switch on → 503 canned fallback; anonymous actor flagged `kind:'anonymous'`; audit row written (hashed).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement; identity is derived **server-side only**.
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat(chat): withChatbot security pipeline (rate-limit, kill-switch, audit)`.

### Task 1.7: `ChatService` orchestration + the route

**Files:** Create `src/services/support-chat/ChatService.ts`, `src/app/api/chat/route.ts`, `__tests__/chat-service.test.ts`; Modify `vercel.json`, `docs/infrastructure/`.

**Interfaces — Produces:** `chatService.respond({ actor, conversationId?, message }): ReadableStream` — runs `tryDeflect` first (no LLM); on a miss, checks `costGuard`, builds messages with the cached knowledge prefix + hardened system prompt, calls the model via `provider` with `maxTokens: 300`, streams via the AI SDK, persists `ChatMessage`s (redacted) + `recordUsage`, and exposes a `request_human` tool that calls `escalateToHuman`.

- [ ] **Step 1:** Tests: a deflectable question never calls the model; a non-deflectable one calls the model once, persists messages, and records usage; over-budget returns the canned "support is busy" fallback.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement `ChatService`; create the thin `route.ts` (Node runtime) = `withChatbot(parse Zod → chatService.respond → stream Response)`. Add `"src/app/api/chat/route.ts": { "maxDuration": 60 }` to `vercel.json` + update `docs/infrastructure/`.
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat(chat): ChatService orchestration + streaming /api/chat route`.

### Task 1.8: Guest gating (hCaptcha)

**Files:** Modify `src/app/api/chat/route.ts` / `withChatbot.ts`; Create `__tests__/guest-gate.test.ts`.

- [ ] **Step 1:** Test: an anonymous actor's **first generative** turn without a valid hCaptcha token → rejected; FAQ-search (no-LLM) turns are allowed without it; a verified token allows the generative turn. (Read how hCaptcha is verified elsewhere in the repo first — reuse the existing siteverify pattern.)
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement: deflection/FAQ path needs no challenge; the LLM fallback for an anonymous actor requires a verified hCaptcha token (server-side siteverify).
- [ ] **Step 4:** Run → PASS. **Step 5:** Commit `feat(chat): hCaptcha gate before guest generative turns`.

### Task 1.9: Widget (frontend) + sign-out clear ✅

**Files:** Create `src/components/support-chat/SupportChatWidget.tsx`, `src/components/support-chat/useSupportChat.ts`, `src/components/support-chat/chatStorage.ts`, `src/components/support-chat/__tests__/chat-storage.test.ts`; Modify `src/app/(site)/layout.tsx` (mount), `src/components/layout/Header.tsx` (sign-out clear), `src/services/support-chat/ChatService.ts` (x-conversation-id headers).

- [x] **Step 1:** Build the floating bubble + panel using the AI SDK v6 `useChat` hook pointed at `/api/chat`; render the no-LLM FAQ quick-replies first; **label the bot as AI** on the first message + header; show after-hours expectations. Keep z-index 9000 **below** full-screen modals (MODAL_BASE = 10000). hCaptcha gate with `key`-based reset; `captchaSitekey`-unset fallback to "sign in" hint.
- [x] **Step 2:** Mount `<SupportChatWidget/>` in `src/app/(site)/layout.tsx` next to `UnifiedModalManager` via `nextDynamic` (aliased to avoid name conflict with `export const dynamic`).
- [x] **Step 3:** `chatStorage.ts` holds `CHAT_STORAGE_KEYS` + `clearSupportChatStorage()`; wired into `Header.tsx` `handleSignOut` before `signOut({ callbackUrl: "/" })`.
- [x] **Step 4 (manual verify):** pending runtime test of the full flow.
- [ ] **Step 5:** Commit `feat(chat): support chat widget + sign-out history clear`.

**Also done in this task:** `ChatService.cannedTextResponse` now accepts optional `headers` param forwarded to `createUIMessageStreamResponse`; deflection path passes `x-conversation-id: conversationId`; LLM path passes same header via `result.toUIMessageStreamResponse({ headers })`. `StreamResultLike.toUIMessageStreamResponse` updated to accept `options?: { headers? }`. `test:chat-storage` script added to `package.json`.

### Task 1.10: Observability + golden-set eval v1

**Files:** Create `scripts/eval-chat-goldenset.ts`, `docs/ai-chatbot/runbook.md` (or a section in this file); Modify `ChatService` to emit metrics.

- [ ] **Step 1:** Emit per-conversation metrics (deflection vs LLM, tokens, latency, escalations) to the audit log; route failures to `ErrorReport`; confirm Vercel Speed Insights covers latency/error-rate.
- [ ] **Step 2:** Write `eval-chat-goldenset.ts`: a curated set of ~30 real support questions with expected-fact assertions, graded by **Opus 4.8 via the Batch API** (50% off, offline). Wire `npm run eval:chat`.
- [ ] **Step 3:** Write a short **runbook** (bot wrong / down / abused / budget tripped → what to do). 
- [ ] **Step 4:** Commit `feat(chat): observability + offline golden-set eval`.

**Phase 1 done when:** the widget answers grounded FAQ questions with sources, deflects most volume with no LLM, is rate-limited + kill-switchable + daily-budget-capped, gates guests behind hCaptcha, escalates to `ContactSubmission`, clears history on sign-out; `npm run lint`, `type-check`, `test:chat-*`, and `eval:chat` pass; `docs/ai-chatbot/` + `docs/infrastructure/` updated.

---

## Phase 2 — Member-aware read-only tools (Bedrock Sydney) — DROPPED

> **DROPPED** — this entire phase was removed from the codebase per owner decision. The bot is FAQ-only with no member account data access. The outline below is retained as historical context only.

**Milestone (not implemented):** logged-in members get accurate answers about **their own** tier/entries/billing/draw allocation via read-only, session-scoped tools, with member-PII inference running **onshore in Bedrock Sydney** and full compliance controls.

**Task outline (historical — not implemented):**

- **2.1 Bedrock provider branch:** add `@ai-sdk/amazon-bedrock`; extend `provider.ts` so member-PII calls use Bedrock `ap-southeast-2`. Verify Haiku 4.5 in-region (else Sonnet 4.6). Tests: provider returns a Bedrock model for member context. Docs: residency note in `docs/ai-chatbot/`.
- **2.2 Tool registry (Norm-style):** `src/services/support-chat/tools/registry.ts` — declares each tool with a Zod **response** schema (egress projection); a generated manifest of "wired" tools. Tests: a tool with no responseSchema is not callable.
- **2.3 Read-only tools:** `getMyMembership`, `getMyEntries`, `getMyBillingStatus`, `getDrawStatus`, `getPartnerVisibility` — each reuses an existing service, resolves `userId` from `ctx.actor` **only**, Zod-projects output. Tests: tool throws on anonymous actor; tool ignores any model-supplied id; output matches the projection schema. (No write tools.)
- **2.4 Wire tools into `ChatService`** via the AI SDK `tools` option; the model calls them; results stream back. Tests: a member "what's my next bill" triggers exactly the billing tool, scoped to that user.
- **2.5 Compliance:** complete the **PIA**; update the **privacy policy** (AI use, Bedrock Sydney, what PII the bot accesses, informational-only); confirm the sign-out clear covers member threads; add a "delete my chat history" affordance.

**Phase 2 done when (not applicable — DROPPED):** a member gets correct, scoped, onshore answers about their own account; no tool accepts an identifier; PIA + policy shipped; tests + eval pass.

---

## Phase 3 — RAG, semantic cache & scale ✅ *cheaper at scale, measurably good*

**Milestone:** knowledge scales beyond the cached pack, repeat questions cost ~$0, and quality is release-gated by eval.

**Task outline:**

- **3.1 Atlas Vector Search RAG:** `scripts/embed-chat-knowledge.ts` builds a vector index on the existing cluster from the same canonical sources; `retrieve.ts` swaps keyword search for `$vectorSearch` behind its existing interface (no caller changes). Embeddings via `@ai-sdk/openai` `text-embedding-3-small` or Voyage. Empty retrieval → escalate.
- **3.2 Semantic answer cache:** `answerCache.ts` caches by question embedding, **generic FAQs only** (never per-user), conservative threshold + TTL, invalidated on knowledge change.
- **3.3 Scale-out:** move the daily-budget/rate counters fully onto the distributed Mongo path (already there); load-test the streaming route; confirm Atlas index sizing.
- **3.4 Analytics:** an admin view of deflection rate, escalation rate, top intents, token spend, latency (reuse the admin dashboard patterns).
- **3.5 Eval gating:** run `eval:chat` in CI; block release on regression.

**Phase 3 done when:** RAG answers ground to retrieved spans with citations, the cache demonstrably cuts LLM calls, an admin sees deflection metrics, and eval gates releases.

---

## Phase 4 — Hardening & optional enhancements *(earned by data)*

**Task outline:**

- **4.1 Prompt-injection / jailbreak red-team** (OWASP LLM01:2025): confirm a successful jailbreak still can't mutate or read cross-user data (it can't — no write tools, server-side scoping); tighten refusals; document the result.
- **4.2 Optional (pull from Phase 3 analytics, don't pre-build):** proactive nudges on the past-due/renewal surface; additional read-only tools for top unmet intents; live human handoff if escalation volume justifies it; shop support when the shop launches; reuse `/api/chat` from the planned Android app.

---

## Cross-cutting: testing, observability, docs, scaling, maintenance

- **Testing strategy:** every service/lib module gets a `tsx` test wired to a `test:chat-*` script; the orchestration path is covered by `ChatService` tests with stubbed providers; **answer quality** is covered by the offline golden-set eval (`eval:chat`, Opus 4.8 judge, Batch API). No live-LLM calls in unit tests.
- **Observability:** audit log (hashed/redacted) is the source of truth for deflection/cost/latency; `ErrorReport` for failures; Vercel Speed Insights for latency/error-rate; the daily-budget counter is both a cap and a spend dashboard.
- **Documentation:** `docs/ai-chatbot/` is the `support-chat` domain doc; keep it in lockstep with code (doc-sync hook). Update README.md/BUSINESS.md only if the bot changes a business-level fact (it shouldn't — it's informational). Add the runbook.
- **Scaling story:** the architecture scales without rework — knowledge grows from cached pack → Atlas RAG (same `retrieve.ts` interface); providers swap via the AI SDK; rate-limit/budget counters are already Mongo-distributed; the deflection layers carry load growth at ~$0; multi-region/residency is a provider-config change, not a redesign.
- **Maintenance:** knowledge has **one source of truth** (canonical data files → generated pack/index at build), so a repricing propagates on deploy; tools are registry-declared with Zod projections (add a tool = add a registry entry + schema); the cost ceilings make runaway spend impossible; the eval golden-set catches quality regressions before release.

---

## Self-review

- **Spec coverage:** model choice (Global Constraints + 1.2/2.1), knowing-the-business (1.3/1.4/3.1), cost (1.1 cost guard + Global Constraints), 24/7 hosting (0.1 runtime/maxDuration + 1.7 streaming + 1.2 fallback), website integration (1.9 widget), build-vs-buy/worth-it (Decision gate), security/compliance/guardrails (1.5/1.6/1.8/2.5/4.1), cheaper alternatives + hard caps (1.1/1.8 + Global Constraints). Covered.
- **Placeholder scan:** integration with existing files uses explicit "read X to confirm signature" steps (the executor has codebase access) — these are concrete instructions, not hand-waving; later-phase task outlines are intentionally expanded just-in-time and labelled as such.
- **Type consistency:** `getChatModel`/`withFallback` (1.2) reused in 2.1; `assertWithinBudget`/`recordUsage` (1.1) reused in 1.7; `tryDeflect` (1.4) consumed by `ChatService` (1.7); `escalateToHuman` (1.5) consumed by 1.7; `retrieve.ts` interface stable across 1.4 → 3.1.

---

## Execution handoff

Phase 0 and Phase 1 are execution-ready. Two options to implement:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, two-stage review between tasks (`superpowers:subagent-driven-development`).
2. **Inline execution** — batch tasks in-session with checkpoints (`superpowers:executing-plans`).

⚠️ **No code will be written or committed without your go-ahead** (repo no-auto-commit rule). Confirm the Decision gate is passed and tell me which execution approach you want when you're ready to build.
