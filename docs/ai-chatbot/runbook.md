# AI Support Chatbot — Runbook

Actionable playbook for the Tools Australia support chatbot. For architecture and implementation detail see [implementation-spec.md](./implementation-spec.md).

---

## Quick reference

| Signal | First action |
|--------|-------------|
| Bot giving wrong answer | Fix canonical data → redeploy (see §1) |
| Bot returning 503 | Check `CHAT_KILL_SWITCH`, Vercel logs (see §3) |
| Spend spike / cost alarm | Set `CHAT_KILL_SWITCH=true` immediately (see §4) |
| Budget tripped | Users see fallback; raise `CHAT_DAILY_TOKEN_BUDGET_USD` or wait for reset (see §5) |
| Investigating a bad conversation | Query `ChatAuditLog` + `ChatConversation` (see §6) |

---

## 1. Bot is giving wrong answers

**Symptom:** The bot states an incorrect price, date, eligibility rule, tier benefit, or partner discount.

**Root cause:** The knowledge pack (`src/generated/chatKnowledgePack.ts`) is generated at build time from canonical source files. If the source is wrong, the bot is wrong.

**Fix:**
1. Identify which canonical file contains the stale fact:
   - FAQ answers → `src/data/faqs.ts`
   - Business rules (tiers, billing, draws) → `BUSINESS.md` + the relevant service/config files
   - Knowledge pack build script → `scripts/build-chat-knowledge-pack.ts`
2. Edit the source file (not `chatKnowledgePack.ts` directly — it is generated and overwritten on every build).
3. Run `npm run build:chat-knowledge-pack` locally to verify the regenerated pack.
4. Deploy. The `prebuild`/`predev` hooks regenerate the pack automatically on every Vercel deploy.
5. Run `npm run eval:chat` (or `npm run eval:chat -- --limit 5` for a quick check) to confirm the fixed answer grades PASS against the golden set.

**Regression guard:** `eval:chat` is the offline answer-quality gate. Run it before any deploy that changes knowledge sources. Pass rate < 80% exits non-zero.

---

## 2. Bot answers drift after an FAQ or business rule change

**Symptom:** A repricing, draw-date change, or policy update went out but the bot still recites old values.

**Why this happens:** The knowledge pack is generated at build time. A source change that ships without a redeploy (e.g. a Mongo-stored config) will NOT update the bot until the next deploy.

**Fix:** Same as §1 — update the canonical source file and redeploy. The pack regenerates automatically. No manual cache clear is needed.

---

## 3. Bot is down (returning 503 or not responding)

**Symptom:** Chat widget shows an error or "service unavailable".

**Checks (in order):**

### 3a. Kill switch
```bash
# Check the env var (Vercel Dashboard → Project → Settings → Environment Variables)
CHAT_KILL_SWITCH=true   # if set, bot returns 503 immediately
```
If the kill switch is set, unset it in Vercel and redeploy (or remove from `.env.local` for local).

### 3b. Vercel logs
Go to Vercel Dashboard → Project → Deployments → select the active deployment → Functions → `/api/chat`. Look for:
- `[ChatService] model setup failed` — knowledge pack missing or `ANTHROPIC_API_KEY` unset.
- `[ChatService] stream failed` — transient Anthropic API error or network issue.

### 3c. Route `maxDuration`
`vercel.json` sets `"src/app/api/chat/route.ts": { "maxDuration": 60 }`. If streaming responses are being cut off at 10s, verify this rule is listed **before** the catch-all `src/app/api/**/route.ts: { "maxDuration": 10 }` entry.

### 3d. ErrorReport admin panel
Admin → Error Reports. Filter by `component: ChatService`. Both genuine-failure catch blocks (`model-setup`, `stream-start`) write to ErrorReport, so errors that recur appear there with frequency counts.

### 3e. Anthropic status
Check https://status.anthropic.com/ for outages affecting `claude-haiku-4-5` (primary model, `CHAT_MODEL_PRIMARY`) or `claude-sonnet-4-6` (escalation model, `CHAT_MODEL_ESCALATION`).

---

## 4. Abuse / cost spike

**Symptom:** Unusual spend in the Anthropic Console, many short conversations from one IP, ChatAuditLog showing high token volume from `anonymous` actors.

**Immediate kill (< 1 min):**
```bash
# In Vercel Dashboard → Environment Variables → add/update:
CHAT_KILL_SWITCH=true
# Redeploy (or use Vercel instant rollback if a recent deploy is clean).
```
This returns 503 for all chat requests immediately. FAQ deflection and authenticated sessions are also blocked — it is a hard stop. Use only while investigating.

**Tune rate limits (without full kill):**
The rate limiters are hardcoded in `src/lib/support-chat/withChatbot.ts`:
- Anonymous: 15 req/min
- Member: 40 req/min

Lowering these requires a code change + deploy. For an emergency, the kill switch is faster.

**Lower the daily budget:**
```bash
# Vercel Dashboard → Environment Variables:
CHAT_DAILY_TOKEN_BUDGET_USD=1.00   # default is higher; lower to tighten
```
Once the daily budget is spent, the bot returns a canned "busy" fallback (not a hard error). Redeploy to apply.

**Provider hard cap:**
Set a monthly spend cap in the Anthropic Console (https://console.anthropic.com/) under Billing → Usage limits. This is the backstop that survives even a misconfigured `CHAT_DAILY_TOKEN_BUDGET_USD`.

**hCaptcha gate:**
Anonymous guests must pass hCaptcha before reaching the LLM. If `HCAPTCHA_SECRET` is set and `NEXT_PUBLIC_HCAPTCHA_SITEKEY` is configured, this gate is active. Verify both are set in Vercel env. Bot traffic that fails hCaptcha never reaches the model.

---

## 5. Daily budget tripped

**Symptom:** Users see: "Our team is a bit busy right now — meanwhile our FAQ may help, or leave a message and we'll get back to you."

This is the canned `BUSY_FALLBACK_TEXT` response. It means `assertWithinBudget()` (from `src/lib/support-chat/costGuard.ts`) returned `{ ok: false }`.

**What's still working:** FAQ deflection still answers common questions (no model cost). Escalation (leaving a message) still works. Only the LLM generative path is gated.

**To raise the budget (same day):**
```bash
# Vercel Dashboard → Environment Variables:
CHAT_DAILY_TOKEN_BUDGET_USD=10.00   # increase to unblock for the rest of the day
# Redeploy to apply immediately.
```

**Budget resets:** The daily counter resets at midnight UTC. Without a config change, normal service resumes automatically.

**To check current spend:** The `ChatDailyBudget` Mongo collection tracks the running token total per UTC date. Query it in the admin DB connection or via the admin dashboard if a spend view is wired.

---

## 6. Where to look

### ChatAuditLog
Every chat request writes a row. Fields:
- `actorKind` — `member` or `anonymous`
- `deflected` — `true` if FAQ/decision-tree answered (no model cost)
- `escalated` — `true` if `request_human` tool was called
- `modelTier` — model ID used (e.g. `claude-haiku-4-5`)
- `tokensIn` / `tokensOut` — per-request token counts
- `durationMs` — end-to-end latency
- `status` — HTTP status (200, 429, 503)
- `conversationId` — link to `ChatConversation`

Useful queries (MongoDB shell / Compass):
```js
// Escalation rate (last 7 days)
db.chatauditlogs.aggregate([
  { $match: { createdAt: { $gte: new Date(Date.now() - 7*86400000) } } },
  { $group: { _id: null, total: { $sum: 1 }, escalated: { $sum: { $cond: ["$escalated", 1, 0] } } } }
])

// Top-costing conversations (last 24h)
db.chatauditlogs.aggregate([
  { $match: { createdAt: { $gte: new Date(Date.now() - 86400000) }, deflected: false } },
  { $sort: { tokensOut: -1 } },
  { $limit: 10 }
])
```

### ErrorReport
Admin → Error Reports. Filter by component `ChatService`. Both genuine-failure paths (`model-setup`, `stream-start` errors) write here via `ErrorLoggingService.logSystemError()`, best-effort, wrapped in try/catch so they can never block the user response.

### Vercel Speed Insights
Speed Insights (mounted via `src/components/tracking/SpeedInsightsClient.tsx` in `src/app/layout.tsx`) captures `/api/chat` latency and error-rate percentiles. No additional instrumentation needed — it covers the route automatically.

### Vercel Function Logs
Real-time streaming logs in the Vercel Dashboard. Filter by `/api/chat`. Look for `console.error` lines — all error paths in app code use `console.error` (production builds strip `console.log`).

---

## 7. Env var reference

| Var | Required | Description |
|-----|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | First-party Anthropic key. Set a spend cap in the Console. |
| `CHAT_MODEL_PRIMARY` | No | Default: `claude-haiku-4-5` |
| `CHAT_MODEL_ESCALATION` | No | Default: `claude-sonnet-4-6` |
| `CHAT_DAILY_TOKEN_BUDGET_USD` | No | App-level daily cost ceiling. Fail-closed — tripped budget returns canned fallback. |
| `CHAT_KILL_SWITCH` | No | Set to `true` to disable all LLM chat immediately. FAQ deflection + auth session gate still runs. |
| `HCAPTCHA_SECRET` | Yes (guests) | Server secret for hCaptcha verification. Unset = anonymous guests cannot use generative bot. |
| `NEXT_PUBLIC_HCAPTCHA_SITEKEY` | Yes (guests) | Public sitekey for client-side hCaptcha widget. |
