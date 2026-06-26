# Support-chat — gotchas & incident notes

Hard-won lessons. Read before touching the widget mount, the route runtime, or the build.

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
