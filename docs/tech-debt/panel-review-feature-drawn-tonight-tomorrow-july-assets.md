# Panel Review — `feature/drawn-tonight-tomorrow-july-assets` (prize-build URL params + funnel tracking)

> **Scope note (corrected 2026-07-28).** This review covers **only the 5 prize-build commits
> `2ea7d4b0..99f4739f`** — 21 source files, 43 files including docs.
>
> An earlier version of this note said the branch "carries ~780 files of unrelated prior work".
> **That was wrong.** 796 was a two-dot `git diff origin/main` count, which also includes everything
> `origin/main` had moved ahead by — 10 commits of draw-9 work (GearWrench toolbox, landing assets,
> NTP/17494). The three-dot `git diff origin/main...HEAD` shows this branch's real contribution as
> 43 files. The panel's *scope* was right either way; only the explanation of the number was wrong.
> `origin/main` was merged in after the review (see the post-review note below).

- **Date:** 2026-07-28
- **Branch:** `feature/drawn-tonight-tomorrow-july-assets` · **HEAD:** `99f4739f`
- **Base:** `2ea7d4b0` (the commit this feature started from) · diff:
  `git diff 2ea7d4b0..99f4739f` — 5 commits, 21 source files + docs.
- **PR:** none open (`gh` unavailable/unauthenticated, no PR exists). **Acceptance was still
  graded** — against the user-approved spec
  [`docs/superpowers/specs/2026-07-27-prize-build-url-params-design.md`](../superpowers/specs/2026-07-27-prize-build-url-params-design.md),
  whose §7 carries a concrete B1–B8 behaviour matrix and five named analysis questions. Substitution
  stated plainly rather than skipping Reviewer F.
- **Touched domains:** admin · auth · internal-norm · tracking · shared-ui · promo · subscription ·
  mongodb · payment
- **Artifact:** https://claude.ai/code/artifact/edf583ad-c63c-4ae4-99b2-529a43eef59e
- **Gate:** `type-check` ✓ pass (exit 0) · `lint` ✓ clean on **all 21 feature files**; repo-wide 6
  errors / 32 warnings are the documented pre-existing baseline (e2e fixtures ×3, codemod scripts
  ×2, a klaviyo migration ×1) — untouched by this diff.
- **Suites run:** `test:prize-builder` 39/39 · `test:prize-builder-card` 22/22 ·
  `test:prize-build` 9/9 · `test:promo-visit` pass · `test:prize-summaries` pass ·
  `test:anchor-billing` pass · `test:refund-reversal` pass. `e2e:smoke` not run at review time (no
  e2e spec covered this surface — that absence was F-008). **Since closed:**
  `e2e/specs/marketing/prize-build-url-params.spec.ts` now covers it, green on all three projects
  (20 passed, 0 flaky, 2026-07-28). `e2e:purchase` not run (recommended follow-up).
- **Evidence:** live browser passes against the running dev server (Playwright, direct Node API) at
  390/1280 in both themes; live MongoDB `.explain()` query-plan analysis; live `norm:smoke` against
  the real endpoint; mutation testing of the existing repository guard.
- **Post-review (2026-07-28):** all 5 Now items and all 3 Next items were fixed and committed
  (`59b30943`, `61eca88f`), then `origin/main` was merged in (`66127362`, 10 commits of draw-9 /
  GearWrench, 2 conflicts resolved — branch is now 0 behind). A full production build was run for
  the first time and passes: **the promo routes are still prerendered** (`○`/`●`, none became `ƒ`
  dynamic), which is the CSP-R8 property `useSearchParams` would have destroyed and which only a
  build can prove. Findings below still cite line numbers as of `99f4739f` — re-grep before acting.
- **Verdict:** **SHIP WITH FIXES** — **0 P0**, 8 P1, 3 P2. All 8 behaviour checks (B1–B8)
  independently reproduced live by **two** reviewers (B and F, separately). Nothing is incorrect
  today; the P1s are integrity, durability and clarity gaps.
- **Panel split, adjudicated:** Reviewer D called the missing aggregation tests (F-002)
  *must-fix-before-merge*; Reviewer F called the same gap *a fast follow, not a blocker*. **I side
  with F on the merge question and with D on the urgency.** The aggregation was proven correct
  today — its totals were verified byte-identical against the live DB before and after the change
  (`84 / 53 / 64 / 3249.89`) — so nothing is currently miswritten or misreported. The risk F-002
  guards is *future regression*, which merging does not increase. It stays a **Now** item because
  it protects revenue numbers and the Norm external feed, but it does not block.

## Handoff

Fresh session? Run `/panel-fix` on this branch, or paste:

> Read `docs/tech-debt/panel-review-feature-drawn-tonight-tomorrow-july-assets.md`. Fix ONLY the Now
> items: F-015, F-016, F-017.
> Findings were written against `99f4739f` — re-grep each `file:line`, they may have moved.
> (F-014, F-015 were raised 2026-07-28 and F-016, F-017 on 2026-07-29, against the post-merge tree.)
> One commit-worthy change per finding. Do NOT commit. When a finding is done, tick its box
> and fill `_Handled:_` with the date. If a fix turns out to be wrong, mark it Overridden with
> a reason instead of silently skipping it.

**Now:** **F-015, F-016, F-017** — three open items, all P2, none introduced by this branch.

**Everything from the original panel is closed**, as are F-013 (found on staging), F-008 (the e2e
spec) and F-014 (superseded by main). What remains:
- **F-015** (P2, open) — `/api/major-draw` intermittently 404s under load despite an active draw.
  Not root-caused; reproducible in the e2e run. Would make the draw vanish from a live promo page.
- **F-016** (P2, open) — `/admin` fires 500s from `spend-by-url` when the Meta ad account is
  unconfigured, where its sibling endpoint returns `supported: false`. Inherited from main.
- **F-017** (P2, open) — a React hydration mismatch on `/membership` (`Carousel3D`'s `useId`).
  The mismatching components are byte-identical to main; the likely trigger is our rewards-return
  banner rendering upstream of them, but causation is NOT proven. Reproduce before patching.
- **F-009** — deferred with measurements (see its entry): the collection is 1.1 MB and no row carries
  the field yet, so the index would be premature.

**F-014 closed 2026-07-29 as SUPERSEDED** — `origin/main`'s `c5a360c1` mints `ta_anon_id` in
middleware, exactly the fix the finding called for. Discovered while merging main into this branch;
now guarded by an assertion in the prize-build e2e spec so it cannot silently regress.

Everything else (F-001 … F-008, F-010 … F-014) is closed.

---

## Findings

### P1

- [x] **F-013** · P1 · Bug · `src/components/admin/PromoAnalyticsManagement.tsx:123-141` — **The "Switched away %" column showed 250%, which is impossible.**
      _What:_ Found on STAGING with real traffic, after a full purchase run. The numerator summed `buildDistribution` (unique visitors **per combination**) while the denominator was `row.builds` (unique visitors **across the page**). A visitor gets one visit row per page load and each row keeps its own final build, so one person landing four times and settling on a different combination each time contributes 1 to `builds` but 4 to the distribution. Real data: `makita` on 2026-07-28 had 5 recorded builds from 2 unique visitors → 5/2 = 250%.
      _Why every test missed it:_ the unit suite, the seeded accuracy proof and the local browser runs all used **one row per visitor** — the single shape that cannot reproduce it. Only genuine multi-page-load behaviour does.
      _Fix:_ divide the distribution by **its own total** so both sides count the same unit, and relabel to "% of builds" (records, not people) with a tooltip saying so. Applied to the header, the per-row tooltip and the rate helper.
      _Raised by:_ controller, during staging verification · _Proven:_ replaying the exact real row gives 250% → 100%; 3 default + 1 switched → 25%; all-default → 0%; no builds → null (em dash).
      _Shot:_ code-only  _Handled:_ **2026-07-28**

- [x] **F-001** · P1 · Arch · `src/app/api/tracking/promo-prize-build/route.ts:32-84` — **Anyone with `curl` can silently corrupt the prize-build analytics, and a row-count check would never show it.**
      _What:_ The endpoint is unauthenticated and keyed only by the `ta_anon_id` cookie, whose validation is a *format* check — `id.startsWith("anon_") && id.length > 5 && id.length < 100` (`src/services/ab-testing/AnonymousIdService.ts:23-25`) — not a signature. HttpOnly stops browser JS, not a raw HTTP request. Unlike its sibling visit beacon, which only ever **creates** rows, this one **updates** an existing row's `builtPrizeSlug` / `toolboxSwitches` / `toolsetSwitches` via `$set`. So an attacker can overwrite build attribution at unlimited volume with **zero row growth**, poisoning `topBuiltPrize`, `buildDistribution` and the builder→signup→conversion funnel while every visit-count sanity check stays green.
      _Fix:_ Import `createRateLimiter` / `getClientIdentifier` from `src/utils/security/rateLimiter.ts` (already wired into `src/app/api/error-reports/route.ts`) and check it **synchronously before** the `after()` block — e.g. 20 requests / 5 min per IP.
      _Note:_ The gap is inherited (the sibling beacon has it too, pre-dating this branch), but this branch adds the **cheaper** primitive — update-in-place instead of insert.
      _Raised by:_ Reviewer E · _Verified by controller:_ zero rate-limit imports in `src/app/api/tracking/**`; `isValidAnonymousId` confirmed to be a format check.
      _Shot:_ code-only  _Handled:_ **2026-07-28, working tree (uncommitted)** — `createRateLimiter("promo-prize-build", { windowMs: 5*60*1000, maxRequests: 20 })`, checked synchronously as the first statement in `POST`, before the Zod parse and before `after()` is scheduled. **Proven live against the dev server: 20× `200` then 6× `429`, cutoff exactly at the budget.** `docs/tracking/api.md` updated.

- [x] **F-002** · P1 · Test · `src/repositories/PromoAnalyticsRepository.ts:248-267, 563-652` — **The maths behind the admin revenue numbers has no test, so a future edit can silently misreport money.**
      _What:_ The `buildDistribution` merge and sort, and every rate calculation in `getAggregatedByBuiltPrize`, were verified only by throwaway probe scripts during implementation — those files no longer exist. This logic feeds the admin dashboard **and** the Norm external API. A regression such as flipping the tie-break comparator, or changing a `builders > 0` guard to `>= 0` (turning `0/0` into `Infinity`), would misreport revenue attribution with nothing in CI to catch it.
      _Fix:_ Add `src/repositories/__tests__/PromoAnalyticsRepository-aggregation.test.ts`, wired as `test:promo-analytics-aggregation` in `package.json`. Follow the proven pattern in `src/utils/promo-analytics/__tests__/record-prize-build.test.ts:175-229`: stub `PromoAnalyticsVisit.aggregate` / `User.aggregate` / `PaymentEvent.aggregate` by call order to return canned arrays, call the **real** repository methods, restore in `finally`. Assert: (1) two rows for one page with different slugs both land in `buildDistribution` with correct counts; (2) an equal-`visitors` tie sorts `builtPrizeSlug` ascending; (3) `topBuiltPrize === buildDistribution[0].builtPrizeSlug`; (4) a page with no builds gives `builds: 0`, `buildDistribution: []`, `topBuiltPrize: null`; (5) a slug in `signupAgg` but absent from `buildAgg` gives `builders: 0` and `builderToSignupRate: 0`, never `NaN`/`Infinity`; (6) `builders:10, signups:4, conversions:2` gives exactly `40 / 50 / 20`; (7) final sort is builders desc, slug asc.
      _Raised by:_ Reviewers D **and** F (independent convergence) · _Verified by controller:_ `grep` confirms 5 files reference these methods, **none** under `__tests__`.
      _Shot:_ code-only  _Handled:_ **2026-07-28, commit `59b30943`** — `src/repositories/__tests__/PromoAnalyticsRepository-aggregation.test.ts` (7 cases) wired as `test:promo-analytics-aggregation`. All seven listed assertions implemented, with hard-coded expected values rather than recomputed ones. **Mutation-proven load-bearing:** flipping the tie-break comparator, weakening `builders > 0` to `>= 0` (produced `Infinity !== 0`), and breaking the per-slug merge into an overwrite each failed the suite before being reverted. Separately, an end-to-end proof against a real MongoDB confirmed the numbers themselves — 7 seeded rows / 6 unique visitors returning visits 6, builds 5, never-engaged 16.67%, switched-away 40%, and 0/0 flooring to 0.

- [x] **F-003** · P1 · Perf · `src/repositories/PromoAnalyticsRepository.ts:231-246, 567-576` — **The index added for the new aggregations is not the one MongoDB actually uses.**
      _What:_ `PromoAnalyticsVisit` gained `{builtPrizeSlug:1, timestamp:-1}` specifically for the two build aggregations. A live `.explain("queryPlanner")` against the dev DB shows the planner instead picks the TTL index `{timestamp:1}`, then FETCHes every document in the 90-day window and filters `builtPrizeSlug` in-stage. Forcing the new index with `.hint()` proves it is well-formed and usable — the planner simply doesn't choose it. At 100× volume every dashboard load would FETCH the whole 90-day set (~73K docs) rather than the ~0.4% that carry a build.
      _Fix:_ Add `.hint({ builtPrizeSlug: 1, timestamp: -1 })` to both `.aggregate([...])` calls at the two locations above.
      _Raised by:_ Reviewer E (empirical — live `.explain()` output, both default and forced plans captured).
      _Shot:_ code-only  _Handled:_ **2026-07-28, working tree (uncommitted at time of writing)** — hint passed via the aggregate **options object** (`{ hint: { builtPrizeSlug: 1, timestamp: -1 } }`), NOT the chained `.hint()`: the aggregation test stubs `model.aggregate` to return a bare `{ exec }` with no `.hint` method, so chaining would throw at test time. `Model.aggregate(pipeline, options)` forwards to `Aggregate.prototype.option()`, which is exactly what `.hint()` sets internally — functionally identical, verified against the mongoose 8.18.1 source. Applied at BOTH call sites with a comment so it is not later deleted as redundant.

- [x] **F-004** · P1 · UX · `src/components/admin/PromoAnalyticsManagement.tsx:653-658` — **"Switched away %" doesn't say what it's a percentage of, and the obvious guess is the alarming one.**
      _What:_ An ops person scanning the table sees "Builds", then "Switched away %". Nothing visible says the denominator. The natural read is "% of visits" — a much larger base, so the number looks far more dramatic than it is. The real denominator is `builds`, and that fact lives only in a `title` attribute nobody hovers while skimming.
      _Fix:_ Put the denominator in the visible label, matching how the sibling table already names ratio columns (`B→S %`): change the header text to `Switched away % of Builds`.
      _Raised by:_ Reviewer C.
      _Shot:_ code-only  _Handled:_ **2026-07-28, working tree (uncommitted)** — header now reads `Switched away % of Builds`.

- [x] **F-005** · P1 · UX · `src/components/admin/PromoAnalyticsManagement.tsx:710-715` — **The most-built prize renders as unlabelled grey text that reads like a stray note.**
      _What:_ Under the Builds count sits a small second line, e.g. "Ryobi + Kincrome", with no heading or prefix. Nothing on screen identifies it; you must hover to get "Most built here: …" before realising it is the most-assembled combination rather than a warning or a stale value.
      _Fix:_ Prefix the visible text so it explains itself without a hover: `Top: {getPrizeLabel(row.topBuiltPrize) ?? row.topBuiltPrize}`.
      _Raised by:_ Reviewer C. **Same lines as F-011 — done together in one pass.**
      _Shot:_ code-only  _Handled:_ **2026-07-28, working tree (uncommitted)** — caption now renders `Top: {label}`.

- [x] **F-011** · P1 · UX · `src/components/admin/PromoAnalyticsManagement.tsx:710-716` — **On a narrow admin window the top-built prize name wraps into an 8-line staircase and triples the row height.**
      _What:_ The Builds column shares the table with 9 siblings, so at phone/tablet width its cell collapses to ~81px. The muted caption underneath the count then wraps word-by-word, each line right-justified, and that one row balloons to roughly 3× the height of every other row. This is a real path, not hypothetical — the component itself imports `AdminMobileLayoutDateRangeShell`, so narrow-width admin use is anticipated by design.
      _Fix:_ Truncate to one line and let the existing `title` tooltip on the parent `<td>` (`:704-708`) carry the full name — change the caption's className at `:712` to `"block truncate text-[10px] font-sans text-gray-500 dark:text-neutral-400 max-w-[110px] ml-auto"`.
      _Raised by:_ Reviewer B — **measured, not inferred**: at 390px the `<td>` is 80.8px wide, a 44-char label wraps to 8 lines / 160px, row height 204.5px vs a 165px baseline (+39.5px). Fine at 1280px (one line, 388px column).
      _Caveat:_ the live admin table could not be rendered (no admin session; `/admin` 302s to `/`). B reproduced it by injecting the exact JSX/Tailwind fragment, with real labels from `src/config/prize-summaries.ts`, against the site's own compiled stylesheet. Confirm against the real table before ticking.
      _Shot:_ `<scratchpad>/06-admin-builds-wrap-repro-390.webp`  _Handled:_ **2026-07-28, working tree (uncommitted)** — caption className gained `truncate max-w-[110px] ml-auto`; parent `<td>` `title` still carries the full name; the `builds === 0` em dash is preserved. **Not visually re-confirmed** (no admin session).

- [x] **F-006** · P1 · Product · `src/repositories/PromoAnalyticsRepository.ts:563-652` + `src/components/admin/PromoAnalyticsManagement.tsx:748-832` — **"Do Kincrome-box builders convert better?" still needs mental arithmetic across five rows.**
      _What:_ Spec §7 promises this as an answerable question. `getAggregatedByBuiltPrize` groups strictly by the full combination (`milwaukee-kincrome`, `ryobi-kincrome`, …), so an admin must sum the five toolset variants per toolbox by hand. The data is captured correctly and nothing is miscounted — it simply isn't grouped into something readable off the screen.
      _Fix:_ Add a toolbox-level rollup keyed on `builtPrizeSlug.split('-').pop()`, summing `builders`/`signups`/`conversions` across toolset variants before computing rates — either as a fourth `$group` in the repository or a `reduce` in the admin component.
      _Raised by:_ Reviewer F (graded the requirement PARTIAL).
      _Controller correction:_ an earlier chat summary claimed all five questions were answerable. Four are; this one is partial. Corrected in the artifact and here.
      _Shot:_ code-only  _Handled:_ **2026-07-28, working tree (uncommitted at time of writing)** — added a **By Toolbox** rollup table derived CLIENT-SIDE from the existing `byBuiltPrize`, so no new API field and therefore no rule-10 Norm churn for a number the client can derive. Toolbox resolved with registry-validated `fromPrizeSlug()` rather than positional splitting; `cash-prize` excluded (it has no toolbox); rates recomputed from SUMMED totals and never averaged — 40% over 10 builders plus 20% over 5 rolls up to 33.33%, not 30%. All five spec §7 questions are now a read rather than mental arithmetic.

- [x] **F-007** · P1 · Eng · `CLAUDE.md` Domain Manifest, `promo` domain `paths` (~line 425) — **A live architecture doc sits outside the manifest, so nothing will ever force it to stay current.**
      _What:_ `src/docs/PROMOTION_ANALYTICS.md` documents exactly the funnel this feature extends, and was edited three times in this branch. It matches **no** manifest glob. `.claude/hooks/doc-sync.mjs` excludes `docs/` but **not** `src/docs/`, so the hook treats it as source, finds no owning domain, and can never require it to be updated again. It is accurate today by diligence, not enforcement.
      _Fix:_ Add `"src/docs/PROMOTION_ANALYTICS.md"` to the `promo` domain's `paths` array in `CLAUDE.md`.
      _Raised by:_ Reviewer A · _Verified by controller:_ a manifest-resolution script over all 21 changed source files reports exactly one orphan — this file. Pre-existing debt (the file predates the branch), but this is the natural place to close it.
      _Shot:_ code-only  _Handled:_ **2026-07-28, working tree (uncommitted at time of writing)** — added to the `promo` domain `paths` (now 32 entries). Manifest re-parsed cleanly (31 domains) and `usePrizeBuildTracking.ts` confirmed still present, so nothing was lost in the edit.

- [x] **F-012** · P1 · Arch · `src/app/api/tracking/promo-page-visit/route.ts` — **The sibling visit beacon is still unauthenticated and unrate-limited.**
      _What:_ Surfaced while fixing F-001. The same format-only cookie check guards this endpoint, and it has no rate limit either. It is **less** dangerous than F-001's target because it only ever INSERTS — abuse shows up as visibly inflated visit counts rather than silently rewritten attribution — but it is the same free-write primitive, and F-001 has now made the asymmetry obvious: one tracking beacon is guarded and its twin is not.
      _Fix:_ Apply the identical guard now proven on F-001 — `createRateLimiter("promo-page-visit", { windowMs: 5 * 60 * 1000, maxRequests: 20 })` from `src/utils/security/rateLimiter.ts`, checked synchronously as the first statement in `POST`, before `after()` is scheduled. Update `docs/tracking/api.md` in the same change.
      _Raised by:_ the F-001 implementer, correctly flagged rather than drive-by fixed (it was outside that finding's scope). Pre-dates this branch.
      _Shot:_ code-only  _Handled:_ **2026-07-28** — `createRateLimiter("promo-page-visit", { windowMs: 5*60*1000, maxRequests: 20 })`, checked synchronously before the Zod parse and before `after()`. **Proven live: 20× `200` then 5× `429`**, cutoff exactly at the budget, returning a clean JSON body with `retryAfterSeconds` and a `Retry-After` header. **Bucket independence also proven** — with the visit beacon's budget exhausted, the build beacon still returned `200`, confirming the two keys do not share a budget (sharing one would have let traffic on either starve the other).

### P2

- [x] **F-008** · P2 · Test · `e2e/specs/marketing/prize-build-url-params.spec.ts` — **The exact bug this branch fixes has no automated guard against coming back.**
      _What:_ Spec §7's B1–B8 matrix was verified once, by hand. No e2e spec touches `/promotions/*` query-param behaviour (`grep` over `e2e/specs/` returns nothing for `toolbox=`/`toolset=`/`PrizeShowcase`). The scroll-reset bug already reached production once; nothing stops a future edit reintroducing it or silently regressing the debounced beacon.
      _Fix:_ Add `e2e/specs/marketing/prize-build-url-params.spec.ts` per `docs/e2e/adding-a-spec.md` (import from `../../fixtures/test`, tag `@smoke`) asserting: B1 scroll delta 0 on a reel click; B5 `history.length` unchanged after 4 clicks; B4 a direct `?toolset=milwaukee&toolbox=kincrome` load selects the matching cards; and the beacon debounce — intercept `POST /api/tracking/promo-prize-build`, switch 3× rapidly, wait >1s, assert exactly one request with cumulative counters.
      _Raised by:_ Reviewer D.
      _Shot:_ code-only  _Handled:_ **2026-07-28** — spec written and **green on all three projects (20 passed, 0 failed, 0 flaky; `EADDRINUSE: 0`, so the results are the harness's own server)**. Six tests: B1 (scroll delta 0 + `aff` preserved + untouched URL stays clean), B5 (`history.length` unchanged over 4 selections, plus cross-lane cumulative counters), B4 (deep link hydrates both lanes), B8 (garbage params fall back), the debounce (a 3-step burst → exactly one write), and one addition beyond the finding: **one visitor producing three distinct builds across three page loads** — the F-013 shape, which every unit test missed because they all used one row per visitor.
      **Four things the writing surfaced, none of them in the original fix line:** (1) `?toolbox=`/`?toolset=` deep-link hydration and the no-scroll contract both hold on WebKit and both mobile viewports, not just desktop; (2) three `click()`s are **not** a burst — Playwright's per-click actionability checks exceeded the 1000ms debounce under parallel load, so an early draft failed on all three projects with 3 beacons; the burst now uses the component's ARIA keyboard path, and the assertion measures the product instead of the machine; (3) crossing reel lanes mid-burst is unsafe on WebKit — `selectAndFocus`'s `requestAnimationFrame` stole a key press back into the previous lane (read `toolboxSwitches: 3, toolsetSwitches: 0` instead of 2/1), so cross-lane counting is asserted in the history test where timing cannot interfere; (4) two new findings below, F-014 and F-015.

- [ ] **F-009** · P2 · Perf · `src/repositories/PromoAnalyticsRepository.ts:596-617` — **The admin analytics page now runs two unindexed full scans of the payments collection instead of one.**
      _What:_ `PaymentEvent` has no index on any `data.*` path (confirmed: five indexes, none matching). The existing `data.promotionSlug` query already full-scans this always-growing, non-TTL'd collection — inherited debt. This branch adds a second full scan on `data.builtPrizeSlug`, run concurrently via `Promise.all` in the same admin route.
      _Fix:_ Add `PaymentEventSchema.index({ eventType: 1, "data.builtPrizeSlug": 1, timestamp: -1 })` in `src/models/PaymentEvent.ts`, matching the `$match` shape at `:602-606`.
      _Raised by:_ Reviewer E.
      _Shot:_ code-only  _Handled:_ **DEFERRED **2026-07-28**, with evidence** — measured before deciding: `PaymentEvent` holds **2,313 documents / 1.1 MB** with 11 indexes, and **0 rows currently carry `data.builtPrizeSlug`** (the feature only just shipped). A "full collection scan" of 1.1 MB is negligible, and a 12th index would index nothing yet — adding it now is the speculative infrastructure CLAUDE.md rule 4 warns against. Revisit if that collection grows an order of magnitude; the fix line above stays valid. Recorded so the next reader does not re-derive these numbers.

- [x] **F-010** · P2 · Eng · `src/components/sections/promo/PrizeShowcase.tsx:342-349` — **Leaving the cash option by clicking a toolset doesn't count as a toolbox change, so engagement is under-reported on that path.**
      _What:_ `handleSelectCash` bumps `toolboxSwitches` because cash is modelled as the toolbox lane's opt-out. But `handleSelectToolset` **also** exits cash mode and does not bump it. A visitor who picks cash then clicks a different toolset changes the toolbox lane's state without it being counted.
      _Fix:_ **Decision needed before coding.** Two defensible readings: (a) the counters measure *lane state changes* → capture `isCash` before the state updates and add `if (isCash) setToolboxSwitches((n) => n + 1);` in `handleSelectToolset`; or (b) they measure *reel interactions* → the current behaviour is right and `handleSelectCash`'s bump is the odd one out. Pick one and make both handlers consistent with it.
      _Raised by:_ Reviewer A · _Verified by controller:_ asymmetry confirmed by reading both handlers.
      _Shot:_ code-only  _Handled:_ **2026-07-28** — **owner ruled (b): the counters mean reel touches.** So the bump was REMOVED from `handleSelectCash` (a cash toggle is not a reel card) and nothing was added to `handleSelectToolset`.
      **This would have caused a regression, caught before implementing:** the beacon gated on `tb === 0 && ts === 0`, so once cash stopped bumping a counter, a visitor who clicked ONLY "take the $10,000 cash" would have had both counters at 0 and their choice would never have been recorded — despite `cash-prize` being a real build choice. Fixed by separating the two concepts: an explicit `hasInteracted` flag (set by all three handlers) now gates the beacon, while the counters stay pure reel-touch counts. **Proven live:** clicking only the cash CTA fires exactly one beacon with `{"builtPrizeSlug":"cash-prize","toolboxSwitches":0,"toolsetSwitches":0}`, scroll delta 0.

- [x] **F-014** · P1 · Bug · `src/services/ab-testing/AnonymousIdService.ts` + `src/app/api/tracking/promo-page-visit/route.ts:89` — **Nearly 4 in 10 promo-page visits are recorded against nobody, so "unique visitors" undercounts and the per-visitor dedup silently does not apply to them.**
      _What:_ Promo analytics keys a visitor on the `ta_anon_id` cookie. That cookie's **only writer is `/api/ab-testing/assign`** — it is the sole caller of `getOrCreateAnonymousId`, and `AnonymousIdService` itself never sets it (its own comment says "the cookie will be set by the API route that calls this service"). A visitor who lands on `/promotions/*` and never triggers an experiment assignment therefore has no id, and their visit row stores `anonymousId: undefined`. Found while writing F-008's spec: an assertion that the cookie existed failed outright in the e2e environment. **Measured against the real database on 2026-07-28** — of **241** promo visits in the preceding 30 days, **149 (61.8%)** carried an `anonymousId`, **0** carried a `userId`, and **92 (38.2%) carried neither**. Two consequences: the admin's unique-visitor counts are computed over the 62% that can be grouped, and `promo-page-visit`'s "one visit per slug per anonymousId per minute" dedup cannot fire for the other 38%, so their reloads each create a fresh row.
      _Fix:_ Decide where the id is minted, then do it in one place. The lean option: set the cookie in `src/middleware.ts` for public page requests when absent (it already runs per-request and injects the CSP nonce), so identity no longer depends on an unrelated A/B feature being live. Do **not** paper over it in the e2e spec — the spec deliberately documents the gap instead of seeding the cookie.
      _Raised by:_ controller, while writing the F-008 spec. _Verified:_ counts above are a direct read of `promoanalyticsvisits`.
      _Shot:_ code-only  _Handled:_ **2026-07-29 — SUPERSEDED by `origin/main` `c5a360c1` ("fix(ab-testing): mint ta_anon_id in middleware so concurrent assigns share one identity"), found while merging main into this branch.** Main fixed it independently and by exactly the mechanism this finding recommended: `src/middleware.ts` now mints the cookie on every matched page route (the matcher covers all pages, excluding only `/api` and static assets) using the new edge-safe `src/lib/ab-testing/anon-id-cookie.ts` — `AnonymousIdService` imports `next/headers` + node `crypto`, neither available in the edge runtime, hence a shared contract module rather than a re-export. Main's stated motivation was a different symptom (concurrent `/assign` calls minting two ids and double-counting one visitor as two exposures), but the fix resolves this finding too.
      **Now guarded, not just fixed:** `e2e/specs/marketing/prize-build-url-params.spec.ts` asserts `ta_anon_id` is present, `anon_`-prefixed, and unchanged across three navigations. Narrowing the matcher or dropping the minting turns that test red instead of silently under-counting visitors again. The 38.2% figure above stands as the measured pre-fix state; it is not a claim about the tree after `c5a360c1`.

- [ ] **F-015** · P2 · Bug · `src/app/api/major-draw/route.ts:59` (via `getCurrentMajorDrawForDisplay`) — **`/api/major-draw` intermittently answers "No active major draw found" while an active draw plainly exists.**
      _What:_ Under a three-project concurrent e2e run, `/promotions/makita` occasionally logged `ApiError: No active major draw found` plus its companion 404. The e2e seed creates exactly one draw — `status: "active"`, `activationDate` −1 day, `drawDate` +20 days (`e2e/seed/draw.ts:19-39`) — which `getCurrentMajorDrawForDisplay`'s step-1 query matches unambiguously, so this is not seed state and not a missing-draw condition. It is intermittent and load-correlated, which points at `transitionMajorDrawsIfNeeded()` (called first, described as "debounced and idempotent") or a connection-pool failure being swallowed into a `null`. Not root-caused — it is orthogonal to the prize-build work and was not worth widening that task to chase.
      _Why it matters beyond e2e:_ a customer hitting this on a live promo page sees the draw disappear from the page. The e2e run is simply the first place it was reproducible.
      _Fix:_ Needs investigation before a fix can be named. Start by logging the branch taken inside `getCurrentMajorDrawForDisplay` when it returns `null`, and check whether `transitionMajorDrawsIfNeeded` can transiently move a draw out of `active`/`frozen` under concurrent calls.
      _Raised by:_ controller, while writing the F-008 spec. _Verified:_ seed values read from `e2e/seed/draw.ts`; the failure is recorded in the run logs and is allowlisted **only** in that spec's one navigation-heavy test — the other five tests load the same route under the strict watchdog, so a frequent recurrence still fails the file.
      _Shot:_ code-only  _Handled:_ —

- [ ] **F-016** · P2 · Bug · `src/app/api/admin/analytics/spend-by-url/route.ts` (+ `e2e/lib/env.ts:69`) — **Opening the admin dashboard fires 500s whenever the Meta ad account isn't configured, instead of degrading like its sibling endpoint does.**
      _What:_ Surfaced by the full `e2e:smoke` run on the merged tree (2026-07-29): `admin-gate.spec.ts` ("admin reaches /admin") tripped the QA watchdog with `HTTP 500 /api/admin/analytics/spend-by-url` **twice per page load**, on two projects. Cause is not a merge defect — `e2e/lib/env.ts:69` deliberately overlays `FACEBOOK_AD_ACCOUNT_ID: ""`, and main's endpoint returns `500 misconfigured` when it is unset (documented behaviour, `docs/internal-norm/norm-context.md`). So the failure is the harness meeting main's new analytics work, and it will flake `/admin` for anyone whose environment lacks that var. **Inherited from `origin/main`; not introduced by this branch** — our diff touches none of these files.
      _Why it is still worth fixing:_ main's OWN sibling endpoint `/analytics/packages-focus` returns `supported: false` for an unconfigured platform rather than 500ing. A missing optional ad-platform integration should not make an admin page emit server errors; the two endpoints should agree.
      _Fix:_ Make `spend-by-url` (and `/detail`) mirror `packages-focus`: return a `supported: false` / empty-bucket payload when the platform's account id is unset, reserving 500 for genuine failures. Then drop the resulting dead expectation, if any, from the admin specs.
      _Raised by:_ controller, from the merged-tree `e2e:smoke` run. _Verified:_ `grep -n FACEBOOK_AD_ACCOUNT_ID e2e/lib/env.ts` → line 69 sets `""`; the 500s appear in the run log under the admin-gate test.
      _Shot:_ code-only  _Handled:_ —

- [ ] **F-017** · P2 · Bug · `src/components/ui/Carousel3D.tsx:470` (trigger likely upstream in `src/app/(site)/membership/components/MembershipPageClient.tsx:53`) — **`/membership` logs a React hydration mismatch, which React explicitly does not repair.**
      _What:_ Also surfaced by the merged-tree `e2e:smoke` run, under `registration.spec.ts`. React reported *"A tree hydrated but some attributes of the server rendered HTML didn't match the client properties. This won't be patched up."* The mismatching attribute is `id="_R_…-stage"` on a `motion.div` inside `Carousel3D` → `MembershipDrawCycle`, i.e. a **`useId()`** value (`Carousel3D.tsx:470` `const baseId = useId()`) differing between server and client.
      _What I ruled out:_ `Carousel3D.tsx` and `MembershipDrawCycle.tsx` are **byte-identical to `origin/main`** (`git diff --quiet origin/main --` on both). So the components that mismatch are not ours.
      _Unproven hypothesis, stated as such:_ `useId` is positional, so a component rendering a different subtree shape between SSR and first client render shifts every id after it. `MembershipPortalReturnBanner` (ours, arriving via the staging merge) renders at `MembershipPageClient.tsx:53`, **before** `MembershipDrawCycle` at `:65`, and has four `return null` paths (`:86, :94, :97, :102`) plus an `aria-busy` skeleton branch (`:112`). That is the classic way to shift a `useId` sequence. **I did not prove causation** — the error is intermittent (the test passed on retry), which is unusual for a deterministic mismatch and suggests it depends on session/`guestUserData` state mid-registration.
      _Fix:_ Reproduce first, don't patch blind. Load `/membership` with and without the banner rendering (portal params absent vs present, guest vs seeded member) and diff the SSR HTML against the hydrated DOM around `Carousel3D`'s `baseId`. If the banner is confirmed as the trigger, make its server and first-client render agree (render the skeleton on both, or gate the whole banner behind a single stable branch) rather than changing `Carousel3D`.
      _Raised by:_ controller, from the merged-tree `e2e:smoke` run.
      _Shot:_ code-only  _Handled:_ —

---

## Acceptance grade (Reviewer F, against the approved spec)

| Requirement | Verdict |
|---|---|
| B1 scroll delta 0px | MET — live-clicked, `maxDelta: 0` over 1.2s |
| B2 no RSC refetch | MET — zero `useRouter`/`router.replace` in `PrizeShowcase.tsx` |
| B3 refresh restores build | MET — direct nav, correct radios checked |
| B4 shared link opens on build | MET |
| B5 Back leaves page | MET — `history.length` 9→9 across two clicks |
| B6 clean URL until touched | MET |
| B7 `aff`/`packages` survive | MET |
| B8 garbage params, no crash | MET — falls back to default, 0 console errors |
| Q1 never-touched-reels % | MET |
| Q2 switch-away % per page | MET |
| Q3 built vs landed by brand | MET |
| **Q4 conversion by toolbox brand** | **PARTIAL — see F-006** |
| Q5 conversion rate per built combination | MET |
| §3 decisions 1–8 | MET |
| §5 data model | MET |
| §6 three write paths | MET |

**Scope creep:** none beyond the one ruled-on item (Task 11's 3-line Norm route edit — a required
schema field with no route wiring would have 500'd a live endpoint).

## Not verified

- **A live Stripe test-mode purchase** confirming `PaymentEvent.data.builtPrizeSlug` end to end.
  The Stripe connector is unauthenticated in this environment. The static path is reviewed and the
  signup half is proven against a real database, but this last hop is unexercised. Run
  `npm run e2e:purchase` or a manual test-mode purchase before relying on build-level revenue.
- **The admin surface was not rendered** — no admin session was available (`/admin` 302s to `/`),
  so F-004, F-005, F-006 were assessed from source and F-011 from a faithful JSX/Tailwind
  reproduction rather than the live table. Confirm all four visually before ticking.
- **The 26×26px reel arrow buttons** are under the 44px touch-target guideline. Reviewer B
  measured it and correctly excluded it: `SelectorReel.tsx` is untouched by these 5 commits, so it
  is pre-existing debt, not this feature's regression. Recorded here so it is not lost.
