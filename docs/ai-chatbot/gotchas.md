# Support-chat — gotchas & incident notes

Hard-won lessons. Read before touching the widget mount, the route runtime, or the build.

---

## Knowledge-gap batch: corpus 39 → 68, and a specific rule MUST beat a broad one (2026-07-15)

Added ids **40-68** to close answerable-but-dodged questions (referrals/affiliate, account+auth, promo/after-checkout offer, upgrade/downgrade/anchor billing, past-due lifecycle, advanced partner discounts, mini-draws/prizes); extended **id24** (reactivation timing). All answers were code-verified and compliance-checked (free-entry framing, no odds/chance/lottery).

**Accuracy fix — past-due cancel is IMMEDIATE (id54).** A normal end-of-period cancel keeps access to the paid date; a **past-due** cancel ends the membership **at once** ([CancelSubscriptionService.ts](../../src/services/subscription/CancelSubscriptionService.ts) — `past_due` cancels immediately; [subscription/rules.md](../subscription/rules.md) R2). id18 needed **no edit** (it never claimed end-of-period access for past-due); the fix is the focused id54 FAQ, locked by an `id54` guard in `faqs.test.ts`.

**THE ROUTING FOOTGUN (why this batch touched `decisionTree.ts` so much):** Layer 1 (decision-tree) **short-circuits** Layer 2 (faqSearch) — `tryDeflect` returns the moment a rule matches. So a **new specific FAQ that shares a token with a broad rule is UNREACHABLE** unless its rule is placed **first**. The broad rules that swallow specifics: `"mini draw"`→id6, `"bonus entries"`→id8, `"renew on the 24th"`→id11, `"refund"`→id12, `"past due"`→id13, `"partner discount"`→id16. 14 new rules (ids 40, 42, 48, 53, 54, 55, 56, 60, 61, 62, 63, 66, 67, 68) were inserted **ahead of** those, in the account/precedence block. Intra-block order also matters (id54 before id56; id63→id66→id68; id60→id61→id62). Signals are **contiguous** phrase substrings after normalisation (apostrophes → spaces), so a signal like `"cancel while past due"` only matches if those words are adjacent — verify against a realistic question, then lock it with a `routingGoldenSet.ts` case + `npm run test:chat-routing`.

Four new entries are **account-aware** (40 referral link, 55 catch-up billing, 62 partner-window 'upcoming', 68 mini-draw entries) — no personal data, matching notes in the systemPrompt ACCOUNT SELF-SERVICE MAP. Everything else (general-fact FAQs like trial-label id58, deactivated-account id46) rides faqSearch + the knowledge pack — no rule needed. Rebuild: `npm run build:chat-knowledge-pack`.

---

## Account-STATE questions: explain the mechanic, don't just deflect to the dashboard (2026-07-09)

Cobber has **no account access**, so for "my…" questions it can't recite a value. But there's a difference between a **lookup** ("where are my entries" → id29, pure navigation) and a **"why is my account in this state"** question — and the latter must **explain the mechanic**, or it reads as skipping the question. First case handled: **"I'm an active member but I see 0 entries"** (FAQ **id39**). The real rule (verified: [next-renewal-entries.ts:36](../../src/utils/subscription/next-renewal-entries.ts#L36), [major-draw-queries.ts:120](../../src/utils/database/queries/major-draw-queries.ts#L120)): membership entries are stored **per-draw** and **credited on the member's RENEWAL (billing) date**, accumulating monthly; each Major Draw is a fresh pool, so after a draw is held (the 27th) a member's entries for the **next** draw are credited on their **next renewal** — so an active member briefly seeing 0 for the upcoming draw is normal (past-due members: 0 until they settle). Cobber now explains this + points to My Account → Membership + escalates only if 0 persists past the renewal date.

**Where Cobber's knowledge is configured (3 levers — keep in lockstep, rebuild the pack after any corpus edit):** (1) `src/data/supportChatFaqs.ts` — the FAQ corpus (free deflection **and** LLM knowledge pack); (2) `src/services/support-chat/systemPrompt.ts` — the ACCOUNT SELF-SERVICE MAP + answering rules (governs the LLM path); (3) `src/services/support-chat/deflection/decisionTree.ts` — intent→FAQ rules for free no-LLM matching (lock it with a case in `routingGoldenSet.ts` → `npm run test:chat-routing`). id39 was wired across all three.

---

## Compliance: NO gambling / "odds" / "chance" framing — entry framing only (2026-07-08)

Tools Australia runs a **game-of-chance trade promotion**, not gambling. Customer-facing copy (Cobber included) must describe value in terms of **entries**, never probability, and must **never call it a lottery / lotto / raffle / sweepstake / gambling / betting** — it's a "giveaway" or "prize draw". Forbidden: `"odds"`, `"chance(s)"`, `"boost your chances"`, `"increase your chance"`, `"better odds"`, `"lottery"`, `"raffle"`, `"gambl…"`; allowed: `"giveaway"`, `"prize draw"`, `"free entries"`, `"{n}× entries"`, `"more entries"`, "a purchase **adds** entries". If a user asks "is this gambling / a lottery?", Cobber does **not** label it either way — it explains it's a tool giveaway where members get **free entries** into monthly prize draws and points to [Terms](/terms). (Origin: the dashboard-revamp design rule; now also stated in BUSINESS.md §1.)

**Entries are a FREE inclusion, never sold.** Legally we can't sell entries directly — the product a member buys is the **membership or the one-time pack**, and the entries come **free** with it. So Cobber must never say a member "buys / purchases / pays for entries" or price entries per unit (NOT "$25 for 3 entries" → "the $25 Apprentice pack **includes** 3 free entries"). The corpus was reframed for this (ids 1, 2, 4, 5, 7, 28 — incl. the old "Can I **buy entries**?" question → "Can I **enter** without a membership?"), the system prompt has a matching HARD RULE, and the guard test bans "buy/sell/purchase entries" + "per entry".

Enforced in three places — keep them in lockstep:
1. **FAQ corpus** ([supportChatFaqs.ts](../../src/data/supportChatFaqs.ts)) — rewrote "better odds of winning" / "boost your chances" / "boost the entries" to entry framing. This feeds the deflection matcher **and** the knowledge pack, so `npm run build:chat-knowledge-pack` after any edit.
2. **System prompt** ([systemPrompt.ts](../../src/services/support-chat/systemPrompt.ts)) — a HARD RULE forbids the LLM from ever generating odds/chance/gambling framing, so grounded answers stay compliant even when the model paraphrases. (Changes the cached prefix once — expected.)
3. **Guard test** ([faqs.test.ts](../../src/data/__tests__/faqs.test.ts) → `npm run test:chat-faqs`) — asserts the corpus contains none of the banned words, so a regression fails CI-style.

Note: `currentPromo.ts` ("multiplies the entries") is also customer-facing. The decision-tree **trigger** phrases ("boost my chances") and the routing golden-set question are user *inputs* (matching), not output — leave them so Cobber still recognises the question.

---

## Cobber has TWO kill switches — admin (DB) + env override (2026-07-08)

"Turn Cobber off" is now a real operator action, not just an env var + redeploy. There are two OR'd signals, resolved in [chatSettings.ts](../../src/lib/support-chat/chatSettings.ts):

- **Admin Pause toggle** — `ChatSettings.killSwitch` (DB boolean, default false). Flipped from **Admin → Team → Chatbot → "Cobber availability"** (`useSetChatKillSwitch` → `PATCH /api/admin/chatbot-settings`). No deploy. (Tab relocated 2026-07-08 from Analytics/"Chatbot Cost" to the Team group; id `chatbot-cost` → `chatbot`.)
- **`CHAT_KILL_SWITCH` env** — break-glass override. **Wins over and locks** the admin toggle (`killSwitchEnvForced` disables the UI switch). Use when you can't reach the admin panel.

Effective off = `isChatKillSwitchEnvOn() || getDbChatKillSwitch()` (`getChatKillSwitchEffective()`). When off, **two** things happen:
1. **Bubble hidden site-wide.** `SupportChatWidgetMount` fetches `GET /api/chat/config` (public, `{ enabled }`) on mount and stays unmounted when `enabled:false`. It renders nothing until the fetch resolves (a paused bot never flashes a bubble) and **fails open** on fetch error (a transient blip shouldn't hide Cobber).
2. **Generative path blocked server-side.** `assertWithinBudget` (costGuard) now OR's the env kill with the **DB** kill via an injectable `readKillSwitch` dep (default `getDbChatKillSwitch`) — so a direct API caller can't spend against a paused bot either. Returns `reason:"kill_switch"` → canned `BUSY_FALLBACK_TEXT`.

**Footguns:**
- **FAQ deflection still answers a paused bot on a *direct* API call** — it runs before the budget/kill gate (unchanged, deliberate). That's harmless because the bubble is hidden, so no UI reaches it; it's free and grounded. Do **not** "fix" this by moving the gate before deflection (breaks the free-FAQ-survives-503 design + its regression test).
- **`getDbChatKillSwitch` fails *open* (returns false on error); `assertWithinBudget` fails *closed*.** Intentional asymmetry: a DB blip must not hide Cobber for everyone (env override stays the reliable break-glass), but inside the cost gate a thrown reader still hits the outer catch → `reason:"error"` → blocked. Locked by `cost-guard.test.ts` ("DB killSwitch=true → kill_switch", "env kill beats DB", "readKillSwitch throws → error").
- **The admin `config.killSwitch` from cost-analytics is env-only and no longer drives the badge** — the availability toggle + Paused pill read the dedicated `useChatbotSettings()` GET (`{ activeProvider, killSwitch, killSwitchEnvForced }`) so the DB toggle actually reflects.

---

## FAQ corpus is decoupled from the /faq page + "Settings → Subscription" is dead (2026-07-07)

The chatbot's FAQ knowledge is **NOT** the `/faq` page's data anymore:
- **`src/data/faqs.ts`** = the `/faq` **page only** (generic, owner-controlled — order/shipping/payment/rewards/partner). Reverted to the owner's original set; do not add chatbot knowledge here. It still exports the shared `FaqEntry` type.
- **`src/data/supportChatFaqs.ts`** = the **Cobber corpus** (`getSupportChatFaqEntries()`) — feeds ONLY the deflection matcher (`decisionTree` + `faqSearch`) and the knowledge pack. Edit chatbot FAQs HERE, then `npm run build:chat-knowledge-pack`. Consumers: `knowledge/retrieve.ts`, `deflection/decisionTree.ts`, `scripts/build-chat-knowledge-pack.ts`, and the tests. **Don't** repoint them back to `faqs.ts` (that would put the 7-entry page set into the bot).

**Membership management nav — "Settings → Subscription" was REMOVED** in the 2026-07 dashboard revamp (the tabbed `?tab=` IA is gone). Everything that manages membership (cancel / pause / upgrade / downgrade / reactivate / change tier / view renewal + tier) now lives on **My Account → Membership → Manage plan** (the "manage" sheet; deep-link `/my-account?open=subscription`). Payment methods → the Membership page's Payment sheet. Profile → Settings. This was fixed across `supportChatFaqs.ts` (10 refs), `systemPrompt.ts` (locations + rules), the pack builder's hardcoded prose + key-pages map, and main's dashboard SupportSheet. `test:chat-faqs` now locks that NO "Settings → Subscription" string reappears.

**Login / forgot-password FAQ (id 32, corrected 2026-07-07):** `/login` is **email+password or Google** only. The old FAQ claimed an "email me a sign-in code" option — that's **false** (the `passwordless-login` route is SMS-OTP and isn't exposed on the login page); it was removed. id 32 now explains the real forgot-password flow: "Forgot password?" → `/reset-password` → enter email → single-use link (24h, one request/5 min). Added `/login` + `/reset-password` to the pack's key-pages map so the LLM may link them. The deflection rule for id 32 already catches "forgot/reset password".

---

## Guest generative access + per-actor provider routing (2026-07-07)

Two coupled controls let guests get AI answers cheaply while members keep the quality model:

- **`CHAT_ALLOW_GUEST_GENERATIVE`** (env, default off). When **on**, anonymous guests **skip the hCaptcha gate** in `ChatService` and reach the LLM directly — protected only by the per-IP generative rate limit (5/300s) + the daily budget. When **off**, the gate stays **fail-closed** (guests are FAQ-only). The flag is resolved once at module load (`GUEST_GENERATIVE_ALLOWED`) — **flipping it needs a redeploy/cold start**, and it is server-env only (never client-flippable; the route passes nothing client-derived into `deps.allowGuestGenerative`).
- **`resolveActorProvider(actorKind, resolveActive)`** ([chatSettings.ts](../../src/lib/support-chat/chatSettings.ts)) routes **anonymous → Gemini** (`GUEST_CHAT_PROVIDER = "google"`, ~10× cheaper than Haiku) and **member → the admin-toggled provider** (`getActiveChatProvider`, default `anthropic`). Guest turns short-circuit — they never await the DB active-provider read. A member reaches Gemini only via the explicit admin toggle; a guest can never reach Anthropic.

**Footguns (verified by adversarial review):**
- **Guests now REQUIRE `GOOGLE_GENERATIVE_AI_API_KEY`.** With the flag on, *every* guest turn routes to Gemini — so a missing Google key makes 100% of guest generative turns silently degrade to the canned `MODEL_ERROR_FALLBACK_TEXT` (no crash — `assertProviderApiKey` throws at construction, caught → canned + `ErrorReport`). Set the Google key whenever `CHAT_ALLOW_GUEST_GENERATIVE=true`. `.env.example` documents this.
- **The gate skip is all-or-nothing.** With the flag on, the ENTIRE anonymous captcha block is skipped (`verifyHcaptcha`, `isAnonConversationVerified`, `markHumanVerified` never run); `freshlyVerified` stays false so guest conversations get no `humanVerifiedAt`. If you later turn the flag OFF, resumed guest conversations correctly fail closed (require a fresh captcha).
- **Budget is the only hard guest cap.** The per-IP generative limiter fails *open*; `assertWithinBudget` (fail-closed, runs before the gate) is the real backstop. On Gemini the budget stretches ~10× further, so a burst overshoot is cheap — acceptable by design. Locked by `guest-gate.test.ts` "allowGuestGenerative=true → captcha skipped" + `chat-settings.test.ts` "resolveActorProvider".

---

## Widget visual system — adaptive brand accent, fixed semantics (2026-07-07)

The `SupportChatWidget` "Workshop" redesign replaced the old fixed **orange** with an **adaptive brand accent**:
- `usePromoTheme()` supplies `accent = theme.primary` / `accentDeep = theme.primaryDark`; a pure `accentInk(hex)` helper picks **dark ink** when the accent is light (luminance > 0.62 — DeWalt yellow, Ryobi lime) else **white**. These are exposed as CSS custom props (`--cob-acc`, `--cob-acc-deep`, `--cob-acc-ink`) on the launcher + panel `style`, consumed via Tailwind arbitrary values (`bg-[var(--cob-acc)]`, gradients inline). Because `usePromoTheme()` **defaults to Milwaukee (Tools Australia red)**, off-promo pages get red automatically — no special-casing.
- **The accent is used ONLY for:** launcher, header band, your-message bubbles, send, quick-reply chips, the welcome "Cobber" highlight, and assistant message links (`[&_a]:text-[var(--cob-acc)]` — out-specificities ChatMarkdown's hardcoded link colour).
- **Semantics are FIXED regardless of brand** (do NOT wire these to the accent, or they vanish into a same-hue brand): **green** Online dot, **amber** notices (rate-limit / busy / captcha — heading amber, body neutral-ink for contrast), **red** hard error. On green/yellow brands the notices stay distinct via border + label, not colour alone.
- Other changes: messages are **grouped** by run (one `CobberMini` avatar per assistant run, warm sand bubbles, `motion-safe` slide-in), a crafted **welcome/empty state**, slimmer header, and the existing **cobber.png** avatar is kept (DRY'd into `CobberMini` + `COBBER_AVATAR`). **Source-citation chips were designed but NOT built** — the citation data isn't streamed to the client yet (a separate backend task).

## The panel is a full-bleed sheet below `lg` (2026-08-13)

Below `lg` the panel spans the viewport (`inset-x-0`, rounded TOP corners only, no side or
bottom border) and sits on the bottom dock; from `lg` it is the 22rem corner-docked card it has
always been. A 22rem card floating in a phone viewport wasted the horizontal space the
conversation needed and read as a widget parked over the page rather than a surface the page
handed you.

**The `side` prop is now `lg:`-scoped.** `sideClass` emits `lg:left-5 lg:right-auto` /
`lg:right-5 lg:left-auto` — the corner dock only applies where there IS a corner, and the
opposite side has to be reset to `auto` or `inset-x-0` keeps it pinned. Both variants are
written as literals: Tailwind's JIT scans source text, so a class assembled from an expression
(`lg:${side}-5`) is never generated.

## The panel follows the site theme (2026-08-13)

The design handoff's Cobber is a dark panel (`#111318` shell, `#1b1f26` bubbles). It briefly
shipped dark in BOTH themes on that basis, and that was wrong — on a light page it read as a black
slab. [`SupportChatWidget`](../../src/components/support-chat/SupportChatWidget.tsx) keeps the
handoff's SHAPE but forks its surface: light panel / gray-50 bubbles / dark ink in light mode, the
handoff's dark palette under `.dark`. The accent header band, the avatar and the hazard stripe are
theme-independent and unchanged.

Two things worth knowing when editing it:

- **Accent-derived colours cannot be plain Tailwind classes.** The quick-reply LABEL has to derive
  from `--cob-acc` *and* fork by theme — the chip's ground is a 10% accent tint, near-white in
  light mode and near-black in dark, so no single colour reads on both. That lives in
  `.cob-quick-ink` (globals.css): a dark neutral by default, `color-mix(accent 30%, white)` under
  `.dark`, with a flat fallback for browsers without `color-mix`. An inline style cannot fork by
  theme; a Tailwind arbitrary value containing `color-mix(...)` with nested commas is fragile to
  parse. The send button's glow is the accent at 40% and stays inline (no fork needed).
- **The panel stacks ON the promo dock.** It carries `promo-dock-stacks-above`, which is inert
  everywhere except under `html[data-promo-dock]`, where it swaps `bottom-24` for the dock's
  measured height (`--promo-dock-h`, published by `PromoBottomDock`). Without it the panel floats
  with a visible gap above the bar, because `bottom-24` was tuned for the old corner launcher.

The welcome state is also no longer a centred splash: the greeting renders as Cobber's FIRST
MESSAGE (avatar + bubble + "Just now"), and the quick replies are full-width rows under a
"Pick a question to get started" rule. Five questions wrapped as pills in a 22rem panel produced a
ragged block nobody scanned.

## The launcher is suppressed on promo prize pages (2026-08-13)

`/promotions/[slug]` and the toolset landings mount
[`PromoBottomDock`](../../src/components/sections/promo/PromoBottomDock.tsx) — one bar that owns the
bottom band. Its **right tab is the Cobber launcher there**, so the corner bubble would be a
duplicate affordance. [`ChatBubbleButton`](../../src/components/support-chat/ChatBubbleButton.tsx)
therefore carries `promo-dock-supersedes`, a class that is **inert everywhere else** and only bites
under `html[data-promo-dock]` (rule in `globals.css`; full write-up in
[shared-ui/gotchas.md](../shared-ui/gotchas.md) § `.promo-dock-supersedes`).

The tab stays visible even where the rest of the bar collapses — in the hero the dock is only its
two tabs — so there is no scroll depth on those pages with no way to reach support.

Two things that make this safe rather than a second chat surface:

- **The dock does not implement chat.** Its tab calls `openSupportChat()` — the same
  `OPEN_SUPPORT_CHAT_EVENT` contract the dashboard's Ask Cobber card uses — which trips the
  `hasOpened` latch in [`SupportChatWidgetMount`](../../src/components/support-chat/SupportChatWidgetMount.tsx)
  and opens the one real lazy panel. Conversation state, budget and audit are untouched.
- **Only the LAUNCHER is hidden, never the panel.** The panel is a separate element at
  `Z_INDEX.MODAL_BASE - 1000`, well above the dock's `z-60`.

This is the same shape as the existing `/my-account` suppression (the dashboard's Ask Cobber card is
the entry point there and the bubble is hidden) — a surface that provides its own Cobber affordance
hides the bubble and opens the panel by event. Any future surface doing this must do BOTH; hiding
the bubble without an event-based opener leaves the page with no way to reach support.

## Launcher placement — collision-aware, not per-page hardcoding (2026-07-07)

The floating bubble mustn't overlap the site's OTHER bottom-anchored floaters (the draw countdown banner `FloatingCountdownBanner`, the promotions "get entries" bar `FloatingGetEntriesButton`, the upsell gift `FloatingGiftIcon`). Researched pattern (Intercom/Zendesk/Material): keep a persistent corner FAB and **lift it above** the obstacle — never hide it, never move it into a menu.

**How it works:** [`useDodgeFloatingObstacles`](../../src/components/support-chat/useDodgeFloatingObstacles.ts) scans `document.querySelectorAll('[data-floating-widget]')`, does an **AABB overlap test against the caller's DEFAULT corner rect**, and returns the target `bottom` (obstacle top + 12px) when one collides, else 0. The widget applies it as an inline `bottom` (the existing `transition-all` animates the slide). Obstacles opt in **declaratively** by carrying `data-floating-widget` — no per-page wiring, no store.

**Three callers, one dock (2026-08-10).** The hook is shared with the two `/promotions` right-corner FABs, so it exports the dock geometry every corner-docked control must use: `FLOATING_DOCK_BOTTOM_PX` (20 = `bottom-5`) and `FLOATING_DOCK_SIDE_PX` (20 = `left-5`/`right-5`). Those constants must stay in lockstep with each caller's Tailwind classes. The signature takes a third `cornerPx` (default 56 = the launcher's `w-14`); the promo FABs pass 48. Before this, the hook hard-coded the launcher's 56px for everyone, so the overlap test ran against a rect two of its three callers didn't occupy — and the promo FABs had drifted to their own `bottom-16`/`bottom-4` offsets, leaving them visibly unaligned with the launcher. Full write-up: [`docs/shared-ui/gotchas.md`](../shared-ui/gotchas.md) § floating dock.

**Why the AABB test is load-bearing (don't "simplify" it to a boolean "banner present"):**
_(2026-08-10: these three claims only became TRUE that day. Every centered bar had `data-floating-widget` on its full-width `inset-x-0` centering wrapper rather than on the visible pill, so the AABB test saw a viewport-wide rect and lifted on every viewport — including desktop, where the bullet below says it shouldn't. The attribute now sits on the pill in all three carriers.)_
- **Mobile** the countdown banner is near-full-width → it reaches the corner → bubble lifts.
- **Desktop** the same banner is centered + narrow (`max-w-4xl`) → it does NOT reach the corner → no lift (correct — a boolean would over-lift here).
- **Top-docked** banners (the scroll-follow `PromoBanner` flips to `top-4`) never intersect the bottom rect → ignored for free.

**Two deliberate scoping choices:**
- **Dodge only while the bubble is shown AND the panel is closed.** The launcher (`ChatBubbleButton`) passes `enabled = !open`; since the mount only renders the launcher OFF `/my-account` (the "Ask Cobber" card is the entry there), the old `!onDashboard` guard is now implicit. An open panel is `z-9000` and opaque — it already covers every obstacle (`z ≤ 50`), so lifting it would instead expose the banner *below* it.
- **Corner selection stays the `side` prop** (right by default, `left` on promotions where the right corner holds the theme toggle + account FAB). The hook only decides how far UP to sit, not which corner.

**Reactivity:** recomputes on scroll (rAF, banners collapse/appear), resize, and a `MutationObserver` (a banner dismissed via ✕ or mounted via AnimatePresence un-lifts the bubble immediately). When you add a NEW bottom-anchored floater, give it `data-floating-widget="true"` and the launcher dodges it automatically — but attach the attribute **only while the floater is visible**. A floater that unmounts when hidden can carry it statically; one that stays mounted and fades (`opacity-0`) must bind it (`data-floating-widget={shown ? "true" : undefined}`), because a faded element still has a non-zero rect and the launcher would lift over something invisible. Reading computed opacity in the hook instead does NOT work — framer obstacles animate in from `opacity: 0` with no `transitionend`, so the gate misses real obstacles (tried and reverted 2026-08-10). See [shared-ui/frontend.md § `data-floating-widget`](../shared-ui/frontend.md).

---

## First-click bubble split — launcher eager, panel lazy (perf Tier-2, 2026-07-20)

The panel chunk (react-markdown + micromark + the AI SDK + hCaptcha) is heavy and was
downloading on **every page view** — the old mount rendered the whole `SupportChatWidget`
immediately via `next/dynamic(ssr:false)`, so its chunk fetched right after hydration even
though most visitors never open chat. The widget is now split so that chunk loads on the
**first open**:

- **[`ChatBubbleButton`](../../src/components/support-chat/ChatBubbleButton.tsx) — EAGER.** A
  dumb launcher with no chat machinery (only the accent + the obstacle dodge, both leaf
  modules). Visually identical to the old inline launcher; lives in the always-loaded mount.
- **[`SupportChatWidget`](../../src/components/support-chat/SupportChatWidget.tsx) — LAZY.** The
  panel only. `SupportChatWidgetMount` owns `open`/`hasOpened` and `next/dynamic`-imports the
  panel on the FIRST open (render-phase `hasOpened` latch — same pattern as
  `LazyMembershipModal`). Once mounted it stays mounted, so chat state survives close/reopen.
- **Shared visual primitives** live in
  [`cobberAccent.ts`](../../src/components/support-chat/cobberAccent.ts) (`useCobberAccentVars`,
  `COBBER_AVATAR`, `COBBER_ALT`) so the eager launcher themes itself WITHOUT pulling the heavy
  panel module into the always-loaded chunk.
- **Every open path must trip the lazy mount.** Both the bubble click and the
  `OPEN_SUPPORT_CHAT_EVENT` window event (dashboard "Ask Cobber" card + any `openSupportChat()`
  caller) funnel through the mount's `setOpen(true)`. The event listener moved from the panel
  to the mount so it fires BEFORE the panel chunk exists.

**Footgun:** if you add a proactive auto-open / greeting timer that fires on page load, it
would force the panel chunk to download on a timer and defeat this split — gate any such
behaviour on a real user signal instead. (Cobber has no such timer today: no auto-open, no
unread badge — the launcher is inert until clicked.)

---

## Chat error/limit/captcha UX — no stacked errors, no dead-ends (2026-07-04)

**The trap:** the 401 (captcha), 429 (rate-limit) and 503 (kill-switch/budget) responses come back as **plain non-2xx JSON**, not a stream. `useSupportChat`'s `customFetch` reads them and sets a specific flag (`captchaRequired` / `rateLimited` / `unavailable`), but then **returns the same non-ok `Response`** — and the AI SDK v6 transport (`HttpChatTransport.sendMessages`) unconditionally throws on any non-2xx, which `useChat` turns into a top-level `error`. Left unhandled, the widget rendered the red **"Something went wrong"** box **stacked above** the amber captcha/limit notice on *every* gated turn — the normal path, not an edge case.

**The fixes (all client-side, [useSupportChat.ts](../../src/components/support-chat/useSupportChat.ts) + [SupportChatWidget.tsx](../../src/components/support-chat/SupportChatWidget.tsx)):**
- **No stacked error:** an effect clears the generic `error` whenever a gate flag is set, and the error box is also render-guarded `!captchaRequired && !isRateLimited && !unavailable`. The user sees only the specific, actionable notice.
- **503 gets a friendly notice:** `customFetch` now handles 503 → `unavailable` state → a calm "Cobber's taking a short break… leave us a message" card (was falling through to the generic error). Cleared on the next 2xx.
- **Captcha expiry/error recover:** `<HCaptcha>` now wires `onExpire`/`onChalExpired`/`onError` to remount a fresh challenge (`captchaKey++`) — hCaptcha tokens expire ~2 min; before this the user was left on a dead box.
- **Input locked while gated:** the textarea + send are disabled during `captchaRequired`/`unavailable` (not just `rateLimited`), so typing a new message can't silently abandon the pending captcha turn.

**Still-solid (verified against `node_modules/ai`):** the one-shot captcha token is read+nulled inside the transport `body()` (only race-free spot); the optimistic user message is trimmed before a captcha re-send (no dup); members never see the captcha (server + client guards); stop/abort doesn't trip the error banner.

**RESOLVED (2026-07-07):** `withChatbot` used to run the kill-switch/budget gate (503) **before** `ChatService`, so it blocked **FAQ deflection too** — contradicting "kill switch disables only the generative bot, FAQ still works." The gate has been **removed from `withChatbot`** (pipeline is now `identify → rate-limit → handler → audit`). `ChatService` owns it: it deflects *first* ([ChatService.ts:555](../../src/services/support-chat/ChatService.ts#L555)) and only re-checks the budget on the LLM path (L591) → a killed/over-budget bot streams the canned `BUSY_FALLBACK_TEXT` (200) on the LLM path while **free FAQ deflection keeps working**. Note the app therefore no longer returns 503 for kill/budget (a 503 is now infra-only); the client's `unavailable` 503 handler remains as defensive infra-503 UX. Locked by `chat-service.test.ts` **"deflect wins over budget"** + `with-chatbot.test.ts` **"no budget gate reaches handler"**.

---

## Deflection must be HIGH-PRECISION — a low-confidence "nearest FAQ" is confidently-wrong (2026-06-27)

**Incident:** an owner stress-test found Cobber giving confidently-wrong canned answers — "how to become a member" → the *partner-brand* application; "how membership works" → the *refund* policy; "where can I see my entries" → "get **more** entries"; "did I win" → the prize *catalog*; "what tier am I on" → the *downgrade* explainer. A scripted audit measured a **45% mis-route rate** over 20 realistic questions.

**Root cause (two parts):**
1. **Layer-2 scored with raw term-frequency cosine — no IDF** (despite the "TF-IDF-inspired" comment). Ubiquitous domain words ("entries", "membership", "tier") counted as much as rare ones, so a query sharing ONE common word with an off-topic entry scored high (0.55–0.70) and was served verbatim. The 0.15 floor was a noise floor, not a correctness gate.
2. **No FAQ entry existed for whole intents** (join / how-membership-works / "my" account questions), so the matcher returned the nearest *wrong* topic instead of abstaining.

**The fix (root, not bandaid):**
- **Scorer → TF-IDF cosine** ([retrieve.ts](../../src/lib/support-chat/knowledge/retrieve.ts): `buildIdf` + `tfidf`). Common words are down-weighted; discriminating words win. Scores stay in [0,1].
- **Abstain gate** ([faqSearch.ts](../../src/services/support-chat/deflection/faqSearch.ts)): `MIN_CONFIDENCE` 0.15 → 0.18 (2026-06-27) → **0.46** (2026-06-29, calibrated), with `MIN_MARGIN` **0.00** — the top1-vs-top2 ambiguity guard is retained in code but inert at the 0.46 floor (the calibration sweep verified margin 0.00–0.10 are identical on the dataset, so the high floor is the precision control; a future lower floor could restore a nonzero margin). Deflection is deliberately high-precision: a missed deflection costs one cheap (grounded) LLM call; a wrong deflection has no model in the loop. The 0.46/0.00 values were calibrated on the 96-case routingGoldenSet (0 mis-routes, 45 correct deflections — see `npm run calibrate:chat-deflection`).
- **Account-aware Layer-1 interception** ([decisionTree.ts](../../src/services/support-chat/deflection/decisionTree.ts)): new intent rules placed FIRST so "did I win", "where are my entries", "what tier am I on", "talk to a human", "charged twice", etc. route deterministically — and the lexical scorer can't pull them to the wrong topic. Over-broad signals tightened (`prize`, `why was I charged`, `"how many entries do i"` → retained `"how many entries do i have"` only, so pricing questions like "how many entries do I get" don't mis-fire to id29).
- **New FAQ entries** ([faqs.ts](../../src/data/faqs.ts), now 38): join/how-membership-works (28, links `/membership`), account-aware **navigation-only** entries (29 entries, 30 tier, 37 update details — they recite NO data), did-I-win/results (31, links `/draw-results`), login help (32), signed-up-not-member (33), card-safety (34), data-retention (35), GST (36), talk-to-human (38).
- **Account self-service map in the system prompt** ([systemPrompt.ts](../../src/services/support-chat/systemPrompt.ts)) so the LLM long-tail answers "my X" with the exact My-Account location, never a value.

**Why FAQ entries (not hand-copied doc prose):** `faqs.ts` is the single source feeding the /faq page, the deflection matcher, AND the knowledge pack. Adding knowledge there enriches all three with no drift. Hand-copying CUSTOMER.md/BUSINESS.md prose into the pack builder would drift the moment those docs change.

**Regression-locked:** every previously-wrong route is asserted in [deflection.test.ts](../../src/services/support-chat/__tests__/deflection.test.ts) `testRegressionRoutes` (21 routes incl. the critical non-regressions "what can I win" → 3, "get more entries" → 8). Thresholds were calibrated on the full golden set via `npm run calibrate:chat-deflection` (2026-06-29): `DEFAULT_MIN_CONFIDENCE=0.46 / DEFAULT_MIN_MARGIN=0.00` → 0 mis-routes, 47 correct deflections on 98 cases (2 eval-surfaced mis-routes fixed in 2026-06-29 eval-fix pass).

**Labelled routing golden set (Task 2, 2026-06-29):** [routingGoldenSet.ts](../../src/services/support-chat/__tests__/routingGoldenSet.ts) provides 98 hand-labelled cases (9 audit mis-routes + 2 eval-surfaced mis-routes, 10 Layer-1 regressions, 29 L2-paraphrase-deflect, 20 L2-near-miss-abstain, 9 account-aware-deflect, 10 off-topic-abstain, 10 escalation-worthy). Well-formedness is enforced by `npm run test:chat-routing-shape`. The calibration sweep (`scripts/calibrate-chat-deflection.ts`) and routing regression lock (`routing.test.ts`) consume this set.

**Live promo:** Cobber now learns the current public promo per request via [currentPromo.ts](../../src/services/support-chat/currentPromo.ts) → `PromoMultiplierResolverService.getEffectiveForBanner()` (same source the banners use; never surfaces unannounced future promos), injected into the prompt by `buildSystemPrompt(pack, { currentPromo })`. Fail-safe to null (a promo lookup must never break a chat). Resolved only on the real-model path so the unit test stays Mongo-free.

---

## Deflection thresholds are calibrated, not eyeballed (2026-06-29)

**Chosen values:** `DEFAULT_MIN_CONFIDENCE = 0.46`, `DEFAULT_MIN_MARGIN = 0.00` (in [`faqSearch.ts`](../../src/services/support-chat/deflection/faqSearch.ts)).

**Measured outcome on the 98-case `routingGoldenSet`:** 0 mis-routes, 47 correct deflections (dataset grew from 96→98 in the 2026-06-29 eval-fix pass; correct-deflect count rose from 45→47).

**How they were produced:** The golden set ([`routingGoldenSet.ts`](../../src/services/support-chat/__tests__/routingGoldenSet.ts)) was assembled by hand (9 audit mis-routes + 2 eval-surfaced mis-routes, 10 Layer-1 regressions, 29 L2-paraphrase-deflect, 20 L2-near-miss-abstain, 9 account-aware-deflect, 10 off-topic-abstain, 10 escalation-worthy = 98 total). A calibration sweep (`npm run calibrate:chat-deflection` → [`scripts/calibrate-chat-deflection.ts`](../../scripts/calibrate-chat-deflection.ts)) grid-searched `minConfidence × minMargin` over the full set, then the Pareto-optimal point (0 mis-routes, highest deflection) was written into `faqSearch.ts`. The routing lock (`npm run test:chat-routing`) asserts mis-route=0 and correct-deflect ≥ 45 on every CI run.

**Re-run trigger:** regenerate the FAQ corpus (edit `src/data/faqs.ts`) OR change the scorer (`src/lib/support-chat/knowledge/retrieve.ts`) ⇒ re-run `npm run calibrate:chat-deflection` (TF-IDF scores shift when the corpus changes), pick the new Pareto-optimal point, update `DEFAULT_MIN_CONFIDENCE` / `DEFAULT_MIN_MARGIN` in `faqSearch.ts`, and update `MIN_CORRECT_DEFLECT` in `routing.test.ts` to match the new correct-deflect count.

**Documented follow-up:** ~17 aspirational paraphrases in the golden set sit below the 0.46 floor (they abstain rather than deflect at these thresholds). A future retrieval upgrade — BM25 or embedding-based nearest-neighbour — could recover them without losing precision. Do not lower the thresholds to capture them; that re-opens the mis-route path. Instead, improve the scorer and re-calibrate.

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
  // (Tier-2: this now renders an eager launcher + a LAZY panel — see "First-click
  //  bubble split" below. The ssr:false-in-a-client-wrapper rule is unchanged.)
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

## Membership Streak knowledge (2026-07-15)

- FAQ ids **69–71** cover the streak (ladder + auto-grant, continuity rules, where to see it); the systemPrompt ACCOUNT SELF-SERVICE MAP has a matching "their Membership Streak" bullet (explain the mechanic, point to /my-account, never state a live streak/entry count). Keep BOTH in lockstep with the ladder config (`src/config/streakMilestones.ts`) — amounts recited by Cobber must match the seeded rungs.
- **Launch-timing caveat:** the streak UI ships dark (`DASHBOARD_FEATURES.loyaltyStreak: false`). The FAQ copy describes the live mechanic; it becomes fully accurate at launch step 4 (flags flip on with grants already active). If launch is delayed long after merge, Cobber will describe a feature members can't see yet — acceptable (it names where it lives once visible), but don't "fix" it by deleting the entries right before launch.
- CLAUDE.md **rule 5c** now requires every customer-facing change to check Cobber's corpus (FAQ + self-service map + knowledge-pack rebuild) in the same task.

## FAQ id3 "What can I win?" — kept in step with the prize builder (2026-07-21)

The prize showcase became the **"Build your prize"** configurator, and id3 in
[`supportChatFaqs.ts`](../../src/data/supportChatFaqs.ts) was stale in two ways: it listed
only four power-tool brands (HiKOKI shipped since) and described the storage half as a vague
"their choice of professional workshop storage" rather than the three named toolboxes the
winner actually picks between.

It now states the real model — **any toolbox** (Monster Milwaukee / 470-piece Kincrome
CONTOUR® / 356-piece Sidchrome) × **any power toolset** (Milwaukee / DeWalt / Makita / Ryobi /
HiKOKI, each with its own brand storage), **plus $5,000 cash** — or the $10,000 tax-free cash
option instead, and points at the home page where the combination can be built and previewed.

**Maintenance rule (CLAUDE.md §5c):** the brand lists here mirror `TOOLBOXES` / `TOOLSETS` in
[`prize-selection/constants.ts`](../../src/components/sections/promo/prize-selection/constants.ts).
Adding a brand there is a one-line data change; **this answer does not update itself** — edit
it in the same task, then re-run `npm run build:chat-knowledge-pack` and
`npm run test:chat-faqs`. GearWrench is deliberately absent from both until draw 9.

## The partner portal is a third party with its own UI (2026-07-31)

The rewards catalogue is a white-labelled iGoDirect/MyRewards platform. It renders surfaces
that look like Tools Australia features but are not:

- **"Your Points : 0" / "$0.00 savings"** — a points currency we do not operate. It reads
  zero for every member, forever. Cobber must never imply a member can earn these; without
  a grounded entry it matched the TA rewards-points FAQ instead (now: entry **75**).
- **An editable profile + password form** — the platform's own copy of the member's
  details. Edits there do not reach us, and its password is never needed because the portal
  is always opened already signed-in from `/my-account/rewards` (now: entry **76**).

Both entries plus the ACCOUNT SELF-SERVICE MAP bullet in
`src/services/support-chat/systemPrompt.ts` must stay in lockstep. Full audit:
`docs/partner/igodirect-portal-ux-audit.md`.

## What the visitor types to Cobber is masked from session replay (2026-08-07)

Contentsquare records 100% of sessions, and the chat widget is the one place on the site where a
visitor types **arbitrary free text** — order numbers, email addresses, phone numbers, whatever
they think support needs. Two elements in `SupportChatWidget.tsx` therefore carry `data-cs-mask`:
the **user** message bubble (the `isUser` branch only) and the composer `<textarea>`. Assistant
bubbles are deliberately left visible — Cobber's own replies are not customer data, and being
able to read them in a replay is exactly how you debug a bad answer.

Convention: [docs/shared-ui/frontend.md](../shared-ui/frontend.md). Mechanism:
[docs/tracking](../tracking/).

The `<textarea>` attribute is belt-and-braces: Contentsquare masks `<textarea>` content by
default. The **bubble** is the one that mattered — once a message is sent it stops being form
input and becomes ordinary page text, which nothing masks automatically. If the transcript is
ever re-rendered somewhere else (an admin review view, an emailed transcript, a re-hydrated
history panel), that surface needs the attribute too.

## Cobber is bottom-RIGHT everywhere again, including /promotions (2026-08-10)

`src/app/promotions/layout.tsx` no longer passes `side="left"` to `SupportChatWidgetMount`, so
the launcher uses its site-wide default corner on every route. The left override existed only
because `/promotions` had the guest theme toggle + account FAB in the bottom-right; both moved
to bottom-left when that control became the hamburger-morph column
([shared-ui/gotchas.md § Promotions corners SWAPPED](../shared-ui/gotchas.md)).

Worth stating plainly since the `side` prop still exists: bottom-right is the convention
(Intercom, Zendesk, Drift, Crisp, HubSpot) and the better thumb target for the most-tapped
floating control. Only pass `side="left"` if some future route genuinely occupies the right
corner — and prefer moving *that* control instead.

## `request_human` files nothing without an email — and the widget never sends one (2026-08-10)

**The trap:** `buildRequestHumanTool.execute()` creates a `ContactSubmission` **only** when it can
resolve an email. It deliberately refuses a model-supplied address (identity must never come from
the LLM), so its only sources are the request body's `contact` field and — as of 2026-08-10 — a
signed-in member's account email read server-side from `actor.userId`.

`SupportChatWidget.tsx` **does not send `contact`.** It never has. So for the whole first month
every escalation attempt hit the no-email branch, filed nothing, and the model papered over it:
six customers were told support would reach out within one business day, and no ticket existed for
any of them. Nothing in the audit surfaced it either — `escalated` stays false when the tool
short-circuits, so the admin "Escalations" metric read a confident `0` the entire time.

**Two things to remember when touching this path:**

1. **A member never needs to be asked.** `resolveMemberEmail(userId)` is authoritative; pair a
   session-resolved email with the session `firstName`, not a widget-supplied name. Anonymous
   actors have no session email, so they must NOT trigger the lookup (guarded + tested).
2. **The tool's return string is load-bearing.** The no-email branch returns a `NOT_ESCALATED:`
   prefix that explicitly forbids claiming a handoff. Do not soften it — that string, plus the
   `systemPrompt` HARD RULE, is what stops the model inventing a confirmation. And do not rely on
   it alone: prompt-only enforcement is exactly what failed here, which is why `onFinish` also
   detects a claim-without-escalation, logs an `ErrorReport`, and marks the message with a failed
   `escalation_claim_unverified` tool call (renders red in Admin → Chatbot → Conversations).

**Guests are still uncovered.** Until the widget collects an email into `contact`, an anonymous
visitor cannot be escalated at all — they now get an honest "I can't pass this on yet" instead of
a fake promise, which is the correct failure mode but not a substitute for wiring the capture step.

## The free FAQ layer was confidently wrong, twice over (2026-08-11)

A read of all 76 production conversations (350 messages, 8 Jul – 9 Aug) found the deflection
layer's two failure modes. Both are now guarded in `ChatService.respond` **before** a canned answer
is accepted — deliberately at the call site, not inside `tryDeflect`, because both guards need
conversation context the deflection module doesn't have.

**1. It repeated itself.** The matcher is stateless, so a rephrase that lands on the same entry
replays it verbatim. One member asked *"But I can't add a payment method"* **five times** and got
the identical "we accept Visa, Mastercard, American Express" every single time — never helped,
never escalated. Eleven such repeat events across 76 conversations. `isSameAsLastAssistantMessage`
now compares the candidate answer against the previous assistant turn (whitespace-normalised) and
falls through to the model on a match. Repetition IS the signal that the canned answer missed.

**2. It answered complaints with facts.** Scoring is keyword overlap, so *"You have just taken $20
from my bank account, I didn't sign up for any membership"* scored against the membership entry and
the customer was served **the price list**. Same for *"I've made 2 $80 payments and have no
entries"* and *"why don't you disclose SA residents are ineligible before they sign up"* — one of
them replied *"That did not answer my question."* `looksLikeComplaint` now short-circuits deflection
for unauthorised-charge, personal-refund-demand, regulator-threat, and paid-but-missing language,
sending those turns to the model (which can escalate).

**Tuning notes for `looksLikeComplaint`:** it is NOT a general sentiment classifier — it targets
money and authorisation language, which is what every production failure had in common. A bare
policy lookup ("Refund policy") must keep deflecting for free, so the refund branch requires a
possessive/demand cue, not the word alone. Validated against all 176 real user messages: **13
flagged (7.4%), 0 false positives** on the routine top-10 questions. Watch the plurals — the first
draft used `\bpayment\b`, which does not match "payments", and missed the real transcript *"I have
made 2 $80 payments … there are no entries showing up"*.

**Cost note:** both guards trade a free canned answer for a paid LLM turn, on ~7% of traffic plus
repeats. That is the correct trade — those were precisely the turns where the free answer did
damage.

## We were *asking* Cobber to print `[from major-draw]` (2026-08-11)

Eight production replies contained internal source tags like `[from membership-tiers]` in
customer-visible text. Not a leak — system-prompt rule 2 literally said *"Cite your source section
when possible (e.g. `[from membership-tiers]`)"*. Nothing ever parsed those tags (generative
citations are never extracted; only the deflection path sets `citations`, from
`deflection.sources`), so they were pure noise. Rule 2 is now an explicit prohibition. Fix the
variable, not the consumer — do not add an output-side stripper for this unless the prompt change
proves insufficient, and note a stream transform would be needed since the text streams to the
customer before `onFinish` sees it.

## The launcher out-ranked `SheetShell` on public routes (2026-08-12)

`ChatBubbleButton` docks at `Z_INDEX.MODAL_BASE - 1000` = **9000**;
[`SheetShell`](../../src/components/ui/SheetShell.tsx) was at `z-[120]`. Every SheetShell caller
until now lived on `/my-account`, where `SupportChatWidgetMount` **suppresses the launcher** (the
dashboard "Ask Cobber" card is the canonical entry there), so nothing ever revealed the mismatch.
The first public-route SheetShell — the `/mini-draws` filter / sort / quick-enter / catalogue /
pack-detail sheets — put Cobber straight over the sheet's primary CTA.

Fixed in `SheetShell` (raised to `z-[9500]`, still below `MODAL_BASE` 10000 and the
`TOAST_LOADING` payment overlay), not in the chat widget: a **modal** surface should out-rank
persistent chrome. The panel's own header comment was corrected at the same time.

The other direction still holds: a bottom-anchored **non-modal** bar (the mini-draw sticky
"Enter draw" bar) must NOT climb above the launcher — it carries `data-floating-widget` and
[`useDodgeFloatingObstacles`](../../src/components/support-chat/useDodgeFloatingObstacles.ts)
lifts Cobber clear of it instead. Modal → out-rank it; persistent chrome → dodge it.

## Blocked-card advice: never lead with "just wait"

Cobber's system prompt is **byte-stable** (for prompt caching) and injects **no date** — it has no way
to know how close the next Major Draw is, and rule 105 forbids inventing draw dates. So when a
member's card is temporarily blocked after repeated failed attempts, Cobber **cannot** work out
whether waiting the ~3 days is safe.

The HARD RULE added 2026-08-18 makes the copy structurally safe instead of computed:

- **Lead with the action that works now** — add a different card on `/my-account/membership`.
- **Waiting is the slower alternative**, only sensible if the draw is still a way off. Let the
  member judge the timing; never assert how many days remain.
- **Be accurate about what's at stake.** Verified against [BUSINESS.md §175](../../BUSINESS.md):
  free entries a member has **already earned stay in the draw while past-due and are never
  removed** — a `past_due` member's entries are still in the weighted winner pool. Only the **next**
  grant pauses. Never imply they lose entries they already hold; that would be false.

FAQ entries **84** and **85** carry the same framing, and the pre-existing renewal-failure entry was
corrected — it previously said "the fastest fix is the in-app retry on your existing card", which is
exactly wrong for a blocked card (retrying is what caused the block). Corpus count assertion bumped
85 → 87.

Backend counterpart: `EXCESSIVE_RETRY_COOLDOWN_DAYS` in
[chargeOrRecoverPolicy.ts](../../src/server/admin/chargeOrRecoverPolicy.ts). If that window changes,
FAQ 84/85 and the member Pay-Now copy must change with it.
