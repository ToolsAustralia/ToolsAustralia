# AI Support Chatbot — Runbook

Actionable playbook for the Tools Australia support chatbot. For architecture and implementation detail see [implementation-spec.md](./implementation-spec.md).

---

## Quick reference

| Signal | First action |
|--------|-------------|
| Bot giving wrong answer | Fix canonical data → redeploy (see §1) |
| Bot returning 503 | Infra/platform signal (NOT the kill switch) — check Vercel logs (see §3) |
| Every turn canned "busy" | Kill switch on or budget tripped — check `CHAT_KILL_SWITCH` / budget (see §3a, §5) |
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

### 2a. Copy that ships AHEAD of the feature (bonus codes, ids 86–88)

Corpus ids **86–88** answer per-customer bonus codes: the personal deadline (each customer's own, not a
shared cut-off), one-per-person / single-use, and what a refund does. They were added **before** the
feature is switched on, per CLAUDE.md rule 5c — once codes start reaching customers by email they start
asking Cobber about them, and an ungrounded Cobber would improvise copy that is legally constrained
(rule 11: entries are a free inclusion, never sold; no probability framing).

**Four things about this batch changed on 2026-08-26. Three are FIXED; one is a standing warning:**

0. **FIXED (second pass, final review) — id 86 no longer sends the customer to an email that does not
   carry the date.** The first pass replaced the 11:59pm promise with "the exact date and time is
   printed in the email that carries your code… so if you are not sure, check that email." That is
   not true under the shipped design and never could be: `expires_at_label` is a property of the
   `Bonus Code Issued` metric **our server** emits, and a Klaviyo flow email renders against its
   **own** trigger metric — cancel-click / checkout-abandon / one-time-purchase — so the merge tag
   resolves to nothing. The three discount templates carry the hardcoded **code string** and no date.
   Combined with the standing note below (no page shows it either), a customer asking "when does mine
   expire?" was being sent nowhere, on a 72-hour fuse they get one of per lifetime. The entry now
   says plainly that the exact date is not shown anywhere they can reach, gives them the safe rule
   (use it within 72 hours of the email arriving), offers `[contact us](/contact)`, and keeps the one
   honest fallback it already had: signed in, the checkout message names the exact instant **once the
   code has already run out**. A matching ACCOUNT SELF-SERVICE MAP bullet was added to
   `systemPrompt.ts` — with no lookup surface, "there is no page for this, escalate" is exactly what
   that map exists to say. Edited in place; corpus count unchanged at **90**.
1. **FIXED — id 86 no longer promises an 11:59pm Sydney cut-off.** It used to say the deadline "always
   runs to 11:59pm Sydney time on that day," which was true only under the deleted calendar-day model
   (`endOfDayAESTAfterDays`). The window is now an exact **72 hours** from the moment the code is
   created, so it runs out at whatever time of day that lands on. The entry now says exactly that — a
   fixed 72 hours, not an end-of-day cut-off, not tied to a whole calendar date. Edited in
   place, so the corpus count stayed at **90**.
   The guard moved with it: `faqs.test.ts` used to **require** the string `"11:59pm Sydney time"` on id
   86 — an assertion pinning the wrong fact. It now requires `"72 hours"` and asserts `"11:59"` is
   **absent**, so the old sentence cannot be pasted back.
2. **FIXED — id 87 now names the re-arm cooldown.** It promised an expired unused code "can be
   re-issued to you later with a fresh deadline… and we will email you if that happens." True, but only
   outside `REARM_COOLDOWN_DAYS` (30) from the first issue — inside it, qualifying again produces
   nothing at all and no email, which is exactly what a customer would report as broken. The answer now
   says there is a waiting period of about a month. Also edited in place.
3. **STANDING — creating the campaign is no longer the switch-on.** It used to be: the server minted at
   the customer's qualifying act, so an admin creating a campaign carrying `BACKIN200` / `LOCKIN100` /
   `EXTRA100` was sufficient for codes to start going out. Since 2026-08-26 the three internal mint call
   sites are deleted and minting happens only when a **published Klaviyo flow** calls
   `POST /api/bonus-codes/v1/issue`. So the campaign is **necessary but not sufficient**, and the flows
   going live is the real moment customers start asking.

**Two things these entries deliberately do NOT say: "check your rewards wallet", and "check your
email for the date."** There is no customer-reachable surface that displays the code string or its
deadline. `RedeemablesWallet` renders both, but it is mounted only on `/rewards`, which is behind the
`rewardsEnabled` pause flag (BUSINESS.md §8a); `RewardsFloatingWidget` also renders both and has been
unmounted since the 2026-07 dashboard revamp. The live claimables surface (`/my-account/rewards`)
shows the grant and a Claim button but neither the code nor the date. **And the email carries the
code but not the deadline** (see item 0 above). So there is currently **nowhere** a customer can read
their deadline before it lapses, and Cobber must say that rather than send them looking. Two things
would change it, and each must update ids 86–88, the self-service-map bullet and this note in the
same change: a wallet/claimables surface that shows the code again, or a **separate Klaviyo flow
built on the `Bonus Code Issued` metric** — the one place `expires_at_label` actually resolves
(docs/rewards-redeemables/gotchas.md, launch step 4).

**Consequence to watch:** until those campaigns exist, Cobber describes something no customer has. That
is accepted and low-risk — the entries only answer a question a customer would not think to ask — but
if the launch is abandoned, delete ids 86–88 and drop the count assertion back to 87.

**If the codes' rules change** (window length, re-arm behaviour, refund handling), these three entries
assert them and will silently go stale: update `src/data/supportChatFaqs.ts`, re-run
`npm run build:chat-knowledge-pack`, then `npm run test:chat-faqs`.

---

## 3. Bot is down (every turn canned, 503, or not responding)

**Symptom:** Chat widget streams the canned "busy" reply on every generative turn, shows an error, or a genuine 503 "service unavailable". (Kill switch / budget → canned "busy" on the LLM path, FAQ still answers; a real 503 is infra.)

**Checks (in order):**

### 3a. Kill switch
```bash
# Check the env var (Vercel Dashboard → Project → Settings → Environment Variables)
CHAT_KILL_SWITCH=true   # if set, the paid LLM path is off; the bot streams a canned
                        # "busy" reply and FAQ deflection still answers (NOT a 503)
```
If the kill switch is set, unset it in Vercel and redeploy (or remove from `.env.local` for local). Note: a genuine **503** is an infra/platform signal, not the kill switch — the kill switch and daily budget gate only the LLM path *inside* `ChatService`, after free FAQ deflection.

> **Bubble visibility is CDN-cached ~60 s (perf Tier-2, 2026-07-20).** The Pause toggle / `CHAT_KILL_SWITCH`
> hides the floating bubble via `GET /api/chat/config` (`{ enabled: !killed }`). That route now serves
> `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`, and the client mount
> ([`SupportChatWidgetMount`](../../src/components/support-chat/SupportChatWidgetMount.tsx)) no longer sends
> `cache: "no-store"`. So after you flip Pause, the **bubble** can take up to ~60 s (plus SWR) to
> appear/disappear for a given visitor. This is cosmetic only — the paid LLM path is blocked server-side in
> `costGuard` the instant the switch flips, regardless of what the cached flag says.

### 3b. Vercel logs
Go to Vercel Dashboard → Project → Deployments → select the active deployment → Functions → `/api/chat`. Look for:
- `[ChatService] model setup failed` — knowledge pack missing or `ANTHROPIC_API_KEY` unset.
- `[ChatService] stream failed` — transient Anthropic API error or network issue.

### 3c. Route `maxDuration`
`vercel.json` sets `"src/app/api/chat/route.ts": { "maxDuration": 60 }`. If streaming responses are being cut off at 10s, verify this rule is more specific than the catch-all `src/app/api/**/route.ts: { "maxDuration": 10 }` entry. Vercel applies the most-specific glob match regardless of declaration order, so the chat-specific rule wins as long as the path is more precise.

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
This disables the **paid LLM path** immediately: every generative turn streams the canned "busy" fallback instead of calling the model. **Free FAQ deflection and escalation still work** (the gate lives inside `ChatService`, after deflection), so common questions keep getting answered at zero cost. To take the bot down entirely, revert the deploy.

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

This is by design: both `CHAT_KILL_SWITCH=true` and a tripped daily budget gate **only the paid LLM path**, inside `ChatService`, *after* free FAQ deflection has run — so FAQ stays live. (`withChatbot` deliberately holds no budget gate; see `withChatbot.ts` pipeline note + `chat-service.test.ts` "deflect wins over budget".)

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
