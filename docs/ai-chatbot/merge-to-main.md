# Landing Cobber (AI support chatbot) into `main`

**Status:** `feature/ai-chatbot` is now merged **up to date with `origin/main`** (merge `d6280a4e`, 2026-07-07). This doc is the plan for the reverse direction — landing the chatbot **into** `main`.

> Companion docs: [`README.md`](./README.md) (feature overview), [`runbook.md`](./runbook.md) (ops), [`gotchas.md`](./gotchas.md) (footguns), [`privacy-policy-changes.md`](./privacy-policy-changes.md). This file is the **release/merge checklist** — analogous to [`docs/internal-norm/merge-to-main.md`](../internal-norm/merge-to-main.md).

---

## 1. Where we are

- The chatbot branch has been brought **current with `main`** (186 commits merged in; 0 behind). Landing is now a clean fast-followable merge, not a big-bang.
- The whole feature is **additive**: ~80 new files under the `support-chat` domain plus a small set of shared touchpoints (below). Nothing in `main` is deleted by the chatbot.
- Verified on the merged tree: `tsc` clean · 17/17 offline chat tests pass · full Turbopack build green.

## 2. What `main` brought that touches the landing

The parallel study (2026-07-07) found **three** things in `main` that genuinely interact with the chatbot, and a lot that doesn't. The interacting ones:

### 2a. 🔴 `main` pre-built an "Ask Cobber" dashboard card — with a **dead button**
`main` added `src/config/dashboardFeatures.ts` — a small visibility map (`DASHBOARD_FEATURES` + `isDashboardFeatureOn()`), all flags **OFF**. One flag is **`cobberSupport`**, explicitly commented *"AI support assistant ('Ask Cobber') — Support overlay sub-project."*

It gates the "Ask Cobber" hero card in [`SupportSheet.tsx`](../../src/app/(site)/my-account/components/sheets/SupportSheet.tsx):
- `cobberSupport: false` (today) → card shows a **"Coming soon"** badge and an **"Available soon"** disabled button.
- Flip to `true` → button reads **"Start a chat"** — but it is `disabled={!cobberOn}` with **no `onClick`**. It's a placeholder `main` built *for us to wire*.

**This is the single most important landing decision** (see §4a).

### 2b. 🟠 Dual entry point + z-index collision with the new dashboard sheets
- Our `SupportChatWidgetMount` mounts **unconditionally** in [`(site)/layout.tsx`](../../src/app/(site)/layout.tsx) (and `promotions/layout.tsx`, `side="left"`). `/my-account` is under `(site)`, so once landed the **always-on floating bubble coexists** with the flag-gated "Ask Cobber" card → two Cobber affordances on one page.
- `main`'s new [`SheetShell`](../../src/components/ui/SheetShell.tsx) portals its overlay to `document.body` at **`z-[120]`**. Our bubble **and** panel sit at `Z_INDEX.MODAL_BASE - 1000` = **9000**. So `9000 ≫ 120` — the floating Cobber bubble/panel **renders on top of every dashboard sheet** (the Support sheet, the mini-draw entry sheet) and its backdrop. This is a visible bug regardless of the card decision.

### 2c. 🟢 Shared files that already reconciled cleanly in this merge
- **`Header.tsx`** — the most-contended file: `main` added the "Giveaways" dropdown + `/my-account/benefits`→`/rewards` rename; we route sign-out through `totalSignOut()`. Both coexist in `d6280a4e`. (Re-confirm on the reverse merge.)
- **`total-sign-out.ts`** — `main`'s canonical sign-out; we fold `clearSupportChatStorage()` into `clearUserScopedClientStorage()` (single delegating call; chat module owns its key list). Preserved in the merge.
- **`src/data/{membershipPackages,miniDrawPackages}.ts`** — `main` renamed `isMemberOnly` → `isAdditional`; the pack builder now reads `isAdditional`. Regenerated pack is byte-identical.
- **`partnerBrandOffers.ts`** — `main` added a `category` field; the pack builder doesn't read it → no break; re-run the pack build to refresh cited catalog.
- **`/my-account/benefits` → `/rewards` rename** — the chatbot knowledge emits **no** `/benefits` link today (grep-verified); re-run the pack build after landing to keep it that way.

### 2d. What `main` brought that does **not** affect the chatbot
Member-dashboard revamp (sections + `Monogram`/`QuickTile`/`FreeEntriesChip`/`SelectMenu`/`DashboardLoader`), past-due tier switch, MembershipModal selection-first + auto-reopen fix, receipt move (the client `/api/invoice/finalize` route was **removed**, not added), admin activity-log **keyset** pagination (kept in Norm lockstep — no drift), monthly-coupon validation, PromoBanner `followOnScroll`, partner-SSO env gating, mini-draw entry sheet. None require chatbot changes.

## 3. Chatbot landing footprint

### New files (~80), by layer
| Area | ~Count | Purpose |
|---|---|---|
| `src/models/Chat*.ts` (+test) | 6 | 5 Mongoose models + model test |
| `src/lib/support-chat/**` (+tests) | 16 | `withChatbot` pipeline, `costGuard`, `captcha`, `chatSettings`, `provider`, `audit`, `redact`, `chatStorage`, `knowledge/{pack,retrieve}` (offline TF-IDF) |
| `src/services/support-chat/**` (+tests) | 17 | `ChatService`, `systemPrompt`, `escalation`, `deleteMemberChatHistory`, `currentPromo`, `deflection/{index,decisionTree,faqSearch}` |
| `src/services/admin/chatbotCostAnalytics.ts` (+test) | 2 | Cost/usage aggregation |
| `src/app/api/chat/**` + `admin/chatbot-*` | 4 | `POST /api/chat`, `DELETE /api/chat/history`, `GET /admin/chatbot-cost`, `GET+PATCH /admin/chatbot-settings` |
| `src/components/support-chat/**` (+test) | 5 | `SupportChatWidget`, `…Mount`, `useSupportChat`, `ChatMarkdown` |
| `src/components/admin/ChatbotCostManagement.tsx` + query hooks | 3 | Admin cost dashboard |
| `src/generated/chatKnowledgePack.ts` | 1 | Build-time pack (NOT hand-edited) |
| `scripts/*chat*.ts` | 5 | pack build (in prebuild/predev), eval, calibrate, 2 smokes |
| `src/utils/auth/total-sign-out.ts` | — | `main`'s file, extended (delegates to `clearSupportChatStorage`) |
| `docs/ai-chatbot/**`, `public/images/icons/cobber.png` | 5 | docs + widget avatar |

### Shared touchpoints
`(site)/layout.tsx` + `promotions/layout.tsx` (mount) · `admin/component/{adminTabs.ts,AdminPage.tsx}` (Chatbot Cost tab, `overview.view`) · `package.json` (5 deps + `build:chat-knowledge-pack` in prebuild/predev + ~22 test scripts) · `.env.example` (chat block) · `vercel.json` (`/api/chat` `maxDuration: 60`) · 3 sign-out files + `queries.ts` · `src/data/faqs.ts` · `CLAUDE.md` (manifest) · `CUSTOMER.md`/`BUSINESS.md`/`README.md`.

### DB models (indexes/TTL auto-created by Mongoose on first write)
`ChatConversation` (userId/status idx, **90d** TTL) · `ChatMessage` (conversationId idx, **90d**) · `ChatDailyBudget` (unique dayKey, **35d**) · `ChatAuditLog` (requestId idx, **90d**, no PII) · `ChatSettings` (singleton, no TTL). Escalations write the **existing** `ContactSubmission` (no new model).

### Infra
**No crons** (pack is build-time; budget resets via UTC dayKey + TTL; retention via TTL). `vercel.json` adds only `/api/chat maxDuration 60`. Admin tab reuses `overview.view` (no new RBAC permission). Norm mirroring: **not wired** (see §4e).

## 4. Pre-landing decisions & tasks

### 4a. ✅ DONE (Option A) — the "Ask Cobber" card is wired + bubble de-duped
Chosen: **A** (wire the card + de-dupe on dashboard). Implemented 2026-07-07:
- `cobberSupport` flipped **`true`** ([dashboardFeatures.ts](../../src/config/dashboardFeatures.ts)) → the card shows "Online / **Start a chat**".
- "Start a chat" calls `closeSheet()` then `openSupportChat()` ([widget-events.ts](../../src/lib/support-chat/widget-events.ts)) — a shared `window` event (mirrors the `openMembershipModal` convention) that `SupportChatWidget` listens for to open its panel.
- The floating bubble is **suppressed on `/my-account`** (route check in the widget) so the card is the single Cobber entry point there; elsewhere the bubble is unchanged. The panel is closed by its own header ✕.

### 4b. ✅ DONE — z-index/portal collision fixed
The widget now **hides the panel while a dashboard overlay sheet (Support/Payment/Manage) is open** — it reads `useDashboardSheetStore((s) => s.sheet !== null)` — so Cobber never floats over a `SheetShell` (which portals to `<body>` at `z-[120]`, below the widget's `9000`). Combined with the `/my-account` bubble suppression + the card closing the Support sheet before opening the panel, the bubble/panel no longer overlay dashboard sheets. **Residual (minor):** the mini-draw entry sheet (Draws tab) uses `SheetShell` but is not in `useDashboardSheetStore`, so an *already-open* panel could still overlap it — rare (the panel is normally closed before navigating) and cosmetic; revisit if reported. Still visual-QA the left-docked launcher on the rebuilt `/promotions` gallery.

### 4c. ✅ DONE — kill-switch/budget no longer blocks free FAQ
Previously [`withChatbot.ts`](../../src/lib/support-chat/withChatbot.ts) ran the kill-switch + daily-budget check (`assertWithinBudget` → 503) **before** the handler, so `CHAT_KILL_SWITCH=true` or an exceeded budget returned 503 for **every** request — including zero-cost FAQ deflection. **Fixed (2026-07-07):** the gate was removed from `withChatbot` (pipeline is now `identify → rate-limit → handler → audit`); `ChatService` owns it — it deflects *first*, then re-checks the budget only on the LLM path (streams the canned `BUSY_FALLBACK_TEXT` at 200). A killed/over-budget bot now disables **only the paid LLM path**; free FAQ deflection keeps working, and the input stays usable (no 503 lock). The app no longer emits 503 for kill/budget (503 is now infra-only). Locked by `chat-service.test.ts` "deflect wins over budget" + `with-chatbot.test.ts` "no budget gate reaches handler". See [gotchas.md](./gotchas.md).

### 4d. 🟠 DECISION — rollout safety
`CHAT_KILL_SWITCH` defaults **OFF** and the widget mounts **unconditionally**, so on merge the bot is **immediately live for all traffic**. Recommended: ship the merge with `CHAT_KILL_SWITCH=true` (or `cobberSupport` gating the mount, if 4a=A), smoke in prod (`npm run smoke:chat-service`), then flip on. Note this interacts with 4c — if the gate still blocks FAQ, `KILL_SWITCH=true` also hides FAQ.

### 4e. 🟢 DECISION — Norm mirroring (hard-rule 10)
The new admin read `GET /api/admin/chatbot-cost` is **not** mirrored to internal-norm. It's optional — flag to the owner: mirror it (registry + schema + route + manifest + `norm-context.md`) or explicitly skip. Not a blocker.

### 4f. 🟢 TASK — cleanup
Remove the manifest **ghost path** `scripts/embed-chat-knowledge.ts` from the `support-chat` domain in `CLAUDE.md` (the file doesn't exist — Phase 1 uses offline TF-IDF, no embeddings).

### 4g. ✅ DECIDED — hCaptcha deferred; guests are FAQ-only at launch
Owner decision (2026-07-07): **skip hCaptcha for the initial release** (cost). Leave `HCAPTCHA_SECRET` / `NEXT_PUBLIC_HCAPTCHA_SITEKEY` **unset**. This needs **no code** — it's the default: because `verifyHcaptcha` fails **closed**, anonymous visitors get free FAQ deflection + a "sign in to chat" nudge for anything the FAQ can't answer, and signed-in **members** (incl. everyone on `/my-account`) get the **full generative bot**. So there is **zero anonymous exposure on the paid path** (guests can't reach it); the daily budget (`CHAT_DAILY_TOKEN_BUDGET_USD`) remains the hard spend cap for members. hCaptcha isn't the cost cap — the daily budget is — so deferring it doesn't raise cost risk.

To let guests get AI answers **later**, pick one:
- **hCaptcha** — set the two env vars (captcha-gated guest generative). Already built + tested; no code.
- **Open the gate** — add a `CHAT_ALLOW_GUEST_GENERATIVE`-style flag (~10 lines) so guests reach the LLM behind the rate-limit + daily-budget only. **Not built now** (no speculative flag per CLAUDE.md §4); wire it when the decision is made. Watch the admin Chatbot Cost page + `ChatAuditLog` anonymous rows and set a conservative budget ($2–3/day) if you go this route.

## 5. Production env checklist

| Var | Needed | Effect if unset |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Yes** | Every generative turn degrades to a canned "having trouble" reply (bot still deflects FAQs). Set a **monthly spend cap** in the Anthropic console as the hard ceiling. |
| `HCAPTCHA_SECRET` | **Deferred (optional)** — see §4g | Left unset for the initial release (owner decision, 2026-07-07). `verifyHcaptcha` fails **closed**, so guests are then FAQ-only (their generative turns get `401 captcha_required` → a "sign in to chat" nudge); members/FAQ unaffected. Set it (with the sitekey) later to give guests captcha-gated generative answers. |
| `NEXT_PUBLIC_HCAPTCHA_SITEKEY` | **Deferred (optional)** — see §4g | Public sitekey. Unset → the widget shows a "sign in to chat" nudge to guests instead of a captcha. |
| `CHAT_KILL_SWITCH` | No (`false`) | See §4c/§4d. On → paid LLM path streams the canned "busy" reply; **free FAQ still works**. |
| `CHAT_DAILY_TOKEN_BUDGET_USD` | No (`5`) | Hard app-level daily USD ceiling. Once exceeded, the LLM path streams the canned "busy" reply; **free FAQ deflection keeps working** (§4c). This is the real spend cap. |
| `CHAT_MODEL_PRIMARY`/`ESCALATION` | No | Default `claude-haiku-4-5` / `claude-sonnet-4-6`. |
| `CHAT_GENERATIVE_LIMIT_MAX`/`WINDOW_SECONDS` | No | Per-user LLM cap (default 5/300s); FAQ never counts; fails open. |
| `GOOGLE_GENERATIVE_AI_API_KEY` (+ `CHAT_GOOGLE_MODEL_*`) | Only if provider toggled to Google | Toggling to Google without it degrades every turn to canned. |

## 6. How to land it

1. Land the decisions in §4 on `feature/ai-chatbot` first (at minimum 4a + 4b + 4c; 4d/4e/4f are quick).
2. Open PR `feature/ai-chatbot` → `main`. Because we already merged `main` in (`d6280a4e`), the PR merge is conflict-light; the only historically-contended file is `Header.tsx` — **confirm it keeps BOTH** the Giveaways dropdown/rewards-rename **and** the `totalSignOut` chat-clear (a careless resolution could silently drop the sign-out privacy clear).
3. Provision the §5 env vars in the prod/preview Vercel project **before** the deploy builds (the pack build runs in `prebuild`; missing data imports fail the build, not missing keys).
4. Gates before merge: `npm run type-check` · the offline `test:chat-*` suite (17) · `npm run build` · `npm run smoke:chat-service` (one live call) on a preview.
5. Post-deploy: keep `CHAT_KILL_SWITCH=true` until smoke passes in prod, then flip. Re-run `npm run build:chat-knowledge-pack` is automatic in `prebuild`, so the pack reflects current package/partner data.

## 7. Verification gates (run on every landing candidate)
`npm run type-check` → `npm run build` (Turbopack — catches `ssr:false`-in-server-component, which `tsc` misses) → the 17 offline `test:chat-*` scripts → `npm run smoke:chat-service` on a preview deploy.
