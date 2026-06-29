# Support-chat — gotchas & incident notes

Hard-won lessons. Read before touching the widget mount, the route runtime, or the build.

---

## Deflection must be HIGH-PRECISION — a low-confidence "nearest FAQ" is confidently-wrong (2026-06-27)

**Incident:** an owner stress-test found Cobber giving confidently-wrong canned answers — "how to become a member" → the *partner-brand* application; "how membership works" → the *refund* policy; "where can I see my entries" → "get **more** entries"; "did I win" → the prize *catalog*; "what tier am I on" → the *downgrade* explainer. A scripted audit measured a **45% mis-route rate** over 20 realistic questions.

**Root cause (two parts):**
1. **Layer-2 scored with raw term-frequency cosine — no IDF** (despite the "TF-IDF-inspired" comment). Ubiquitous domain words ("entries", "membership", "tier") counted as much as rare ones, so a query sharing ONE common word with an off-topic entry scored high (0.55–0.70) and was served verbatim. The 0.15 floor was a noise floor, not a correctness gate.
2. **No FAQ entry existed for whole intents** (join / how-membership-works / "my" account questions), so the matcher returned the nearest *wrong* topic instead of abstaining.

**The fix (root, not bandaid):**
- **Scorer → TF-IDF cosine** ([retrieve.ts](../../src/lib/support-chat/knowledge/retrieve.ts): `buildIdf` + `tfidf`). Common words are down-weighted; discriminating words win. Scores stay in [0,1].
- **Abstain gate** ([faqSearch.ts](../../src/services/support-chat/deflection/faqSearch.ts)): `MIN_CONFIDENCE` 0.15 → **0.18**, **plus a top1-vs-top2 `MIN_MARGIN` (0.05)** — two near-tied candidates above the floor mean the query is ambiguous, so abstain to the grounded LLM rather than serve a coin-flip. Deflection is deliberately high-precision: a missed deflection costs one cheap (grounded) LLM call; a wrong deflection has no model in the loop.
- **Account-aware Layer-1 interception** ([decisionTree.ts](../../src/services/support-chat/deflection/decisionTree.ts)): new intent rules placed FIRST so "did I win", "where are my entries", "what tier am I on", "talk to a human", "charged twice", etc. route deterministically — and the lexical scorer can't pull them to the wrong topic. Over-broad signals tightened (`prize`, `why was I charged`).
- **New FAQ entries** ([faqs.ts](../../src/data/faqs.ts), now 38): join/how-membership-works (28, links `/membership`), account-aware **navigation-only** entries (29 entries, 30 tier, 37 update details — they recite NO data), did-I-win/results (31, links `/draw-results`), login help (32), signed-up-not-member (33), card-safety (34), data-retention (35), GST (36), talk-to-human (38).
- **Account self-service map in the system prompt** ([systemPrompt.ts](../../src/services/support-chat/systemPrompt.ts)) so the LLM long-tail answers "my X" with the exact My-Account location, never a value.

**Why FAQ entries (not hand-copied doc prose):** `faqs.ts` is the single source feeding the /faq page, the deflection matcher, AND the knowledge pack. Adding knowledge there enriches all three with no drift. Hand-copying CUSTOMER.md/BUSINESS.md prose into the pack builder would drift the moment those docs change.

**Regression-locked:** every previously-wrong route is asserted in [deflection.test.ts](../../src/services/support-chat/__tests__/deflection.test.ts) `testRegressionRoutes` (19 routes incl. the critical non-regressions "what can I win" → 3, "get more entries" → 8). **Phase-3 follow-up:** calibrate the threshold/margin against the full golden set via `npm run eval:chat` instead of the hand-picked 0.18/0.05.

**Labelled routing golden set (Task 2, 2026-06-29):** [routingGoldenSet.ts](../../src/services/support-chat/__tests__/routingGoldenSet.ts) provides 96 hand-labelled cases (9 audit mis-routes, 10 Layer-1 regressions, 29 L2-paraphrase-deflect, 20 L2-near-miss-abstain, 9 account-aware-deflect, 10 off-topic-abstain, 10 escalation-worthy). Well-formedness is enforced by `npm run test:chat-routing-shape`. The later calibration sweep (`scripts/calibrate-chat-deflection.ts`) and routing regression lock (`routing.test.ts`) will consume this set.

**Live promo:** Cobber now learns the current public promo per request via [currentPromo.ts](../../src/services/support-chat/currentPromo.ts) → `PromoMultiplierResolverService.getEffectiveForBanner()` (same source the banners use; never surfaces unannounced future promos), injected into the prompt by `buildSystemPrompt(pack, { currentPromo })`. Fail-safe to null (a promo lookup must never break a chat). Resolved only on the real-model path so the unit test stays Mongo-free.

---

## Provider API keys load LAZILY — a missing key fails MID-STREAM, not at construction. Preflight it.

**The trap (2026-06-26):** the AI SDK provider clients (`anthropic()` / `google()`) do **not** read their API key when you build the model — they read it lazily, at request time, when the model resolves its request headers. With `ai@6`'s `streamText` being fire-and-forget (it returns a streaming `Response` immediately, retries internally, and surfaces failures on the stream), a **missing/invalid key surfaces AFTER the 200 response has already started streaming**. Consequences if unguarded:
- The user sees a **broken/empty assistant turn** (the error arrives as a stream `error` part), not a graceful message.
- It is **NOT caught** by ChatService's model-setup `try/catch` (that only wraps construction, which didn't throw).
- It does **NOT** fall back to the other provider (`withModelFallback` isn't on the streaming path, and an auth error isn't fallback-eligible anyway).

So toggling the live provider to Gemini (Admin → Chatbot Cost) **before** setting `GOOGLE_GENERATIVE_AI_API_KEY` would silently break every non-deflected chat.

**The fix (not a bandaid):** `getChatModel()` now calls `assertProviderApiKey(provider)` **before** building the real client — failing FAST and synchronously at construction, where ChatService's model-setup `try/catch` catches it and returns the graceful canned "having trouble, let me connect you" reply **+** logs an `ErrorReport` (observable). The check is **skipped when a stub factory is injected** (`deps.google`/`deps.anthropic`), so unit tests still need no key. Regression-tested in `provider.test.ts` (`testMissingApiKeyPreflight`). Net: a mis-toggle degrades gracefully and is visible in error reporting instead of silently failing.

**Rule:** any new provider must (a) be added to `PROVIDER_API_KEY_ENV` in `provider.ts` so its key is preflighted, and (b) NOT rely on the lazy key throw to surface — that throw is too late to handle. If you add a non-streaming model call path, remember the streaming path can't un-send a started response.

---

## AI SDK provider packages must match the `ai` core's `@ai-sdk/provider` major

**Incident (2026-06-26):** Adding Gemini via `@ai-sdk/google@4.0.0` type-checked and built green but would have **thrown at runtime** the moment the model was used. Root cause: `ai@6` (core) and `@ai-sdk/anthropic@3` both depend on **`@ai-sdk/provider@3`** (the LanguageModel "v3" spec), but `@ai-sdk/google@4` depends on **`@ai-sdk/provider@4`** — a different, newer spec. `ai@6`'s `streamText` can only drive a v3-spec model. An `as unknown as (id) => LanguageModel` cast silenced the TS error but did NOT fix the runtime incompatibility. Fixed by pinning `@ai-sdk/google@3` (3.0.84 → `@ai-sdk/provider@3.0.11`, matches the core's 3.0.10) and removing the cast.

**Rule:** every `@ai-sdk/<provider>` package MUST be on the **same major as the `ai` core's `@ai-sdk/provider` peer**. Today that's v3 — so `@ai-sdk/anthropic@3` AND `@ai-sdk/google@3` (NOT 4). Verify: compare `require("@ai-sdk/<pkg>/package.json").dependencies["@ai-sdk/provider"]` for each provider against the `ai` core's installed `@ai-sdk/provider` — they must share a major.

**Red flag:** if you reach for `as unknown as …` / `as any` to make a provider model assign to `LanguageModel`, STOP — that's a version mismatch, not a type quirk. Align the version; a clean assignment (no cast) is the proof the spec matches. `tsc`/build passing *with* a cast does NOT prove the model works at runtime.

---

## 1. `next/dynamic({ ssr: false })` is forbidden in a Server Component — it breaks `next build` (not `tsc`)

**Incident (2026-06-25):** The Vercel build failed with:

> `` `ssr: false` is not allowed with `next/dynamic` in Server Components. Please move it into a Client Component. `` — `src/app/(site)/layout.tsx`

The support widget was mounted in the `(site)` layout via `next/dynamic(() => import(...), { ssr: false })`. `src/app/**/layout.tsx` and `page.tsx` are **Server Components by default** (no `"use client"`), and Next.js App Router **forbids `dynamic({ ssr: false })` in a Server Component**. The build failed both on Vercel **and** locally with `npm run build`.

**Why it slipped through:** `npm run type-check` (`tsc --noEmit`) **passed** — `tsc` does not know this App-Router rule. The per-task verification used type-check + unit tests + a deferred "preview verify"; nobody ran a full `next build` after the widget landed. **Only `next build` catches it.**

### The correct fix (NOT a bandaid)

Isolate the `ssr:false` dynamic import inside a small **Client Component** wrapper, and import that wrapper *normally* (a static import) into the Server Component:

```tsx
// src/components/support-chat/SupportChatWidgetMount.tsx
"use client";
import nextDynamic from "next/dynamic";
const SupportChatWidget = nextDynamic(
  () => import("@/components/support-chat/SupportChatWidget"),
  { ssr: false }
);
export default function SupportChatWidgetMount() {
  return <SupportChatWidget />;
}
```

```tsx
// src/app/(site)/layout.tsx  (Server Component — normal import, no nextDynamic here)
import SupportChatWidgetMount from "@/components/support-chat/SupportChatWidgetMount";
// ...
<SupportChatWidgetMount />
```

This is the **canonical Next.js App Router pattern** and it matches how this repo already does `ssr:false` in ~10 other places (`FAQPageClient.tsx`, `MembershipPageClient.tsx`, the `my-account/*` client pages, etc. — every one is inside a `"use client"` component). `ssr: false` is genuinely needed here: the widget is browser-only (localStorage, hCaptcha, the AI SDK `useChat`), so it must stay out of SSR to avoid hydration mismatches.

### Prevention (so this class of error can't recur)

`tsc` is **not** a sufficient build gate. It misses App-Router build-time errors: `dynamic({ssr:false})` in a server component, client/server boundary violations, importing server-only code into a `"use client"` component, etc.

**Rule:** run a full **`npm run build`** (not just `npm run type-check`) before pushing any change that:
- mounts/renders a component inside a Server Component `layout.tsx` / `page.tsx`,
- adds or moves a `next/dynamic({ ssr: false })`,
- adds/removes a `"use client"` directive or otherwise shifts the client/server boundary,
- adds a new dependency that has client-only or server-only constraints.

A green `type-check` + green `test:chat-*` is necessary but **not** sufficient for those changes — `next build` is the authoritative gate (it is exactly what Vercel runs).
