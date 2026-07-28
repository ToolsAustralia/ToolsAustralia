# Panel Review — `feature/drawn-tonight-tomorrow-july-assets` (prize-build URL params + funnel tracking)

> **Scope note:** this branch also carries ~780 files of **unrelated prior work** vs `origin/main`
> (landing hero images, video manifests, the prize-summaries split). This review covers **only the
> 5 prize-build commits `2ea7d4b0..99f4739f`** — 21 source files. Reviewing the branch's full
> divergence would have buried these findings in noise. The prior work is not assessed here.

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
  `test:anchor-billing` pass · `test:refund-reversal` pass. `e2e:smoke` not run (no e2e spec covers
  this surface — that absence is F-008). `e2e:purchase` not run (recommended follow-up).
- **Evidence:** live browser passes against the running dev server (Playwright, direct Node API) at
  390/1280 in both themes; live MongoDB `.explain()` query-plan analysis; live `norm:smoke` against
  the real endpoint; mutation testing of the existing repository guard.
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
> items: F-001, F-002, F-004, F-005.
> Findings were written against `99f4739f` — re-grep each `file:line`, they may have moved.
> One commit-worthy change per finding. Do NOT commit. When a finding is done, tick its box
> and fill `_Handled:_` with the date. If a fix turns out to be wrong, mark it Overridden with
> a reason instead of silently skipping it.

**Now (do these — 5, at the cap):**
- **F-001** (M) — rate-limit the new build beacon; it can be poisoned for free and invisibly.
- **F-002** (M) — the new aggregation maths has zero regression coverage and feeds revenue numbers.
- **F-004** (S) — "Switched away %" doesn't say what it's a percentage *of*.
- **F-005** (S) — the "Top built" prize name renders as unlabelled stray text.
- **F-011** (S) — that same caption wraps into an 8-line staircase on a narrow admin window.

> F-004, F-005 and F-011 are all one-line edits in `PromoAnalyticsManagement.tsx`, two of them on
> the very same lines — do them as a single pass.

**Next:** F-003 (S), F-006 (M), F-007 (S)
**Later:** F-008 (M), F-009 (S), F-010 (S — needs an owner decision first)

---

## Findings

### P1

- [x] **F-001** · P1 · Arch · `src/app/api/tracking/promo-prize-build/route.ts:32-84` — **Anyone with `curl` can silently corrupt the prize-build analytics, and a row-count check would never show it.**
      _What:_ The endpoint is unauthenticated and keyed only by the `ta_anon_id` cookie, whose validation is a *format* check — `id.startsWith("anon_") && id.length > 5 && id.length < 100` (`src/services/ab-testing/AnonymousIdService.ts:23-25`) — not a signature. HttpOnly stops browser JS, not a raw HTTP request. Unlike its sibling visit beacon, which only ever **creates** rows, this one **updates** an existing row's `builtPrizeSlug` / `toolboxSwitches` / `toolsetSwitches` via `$set`. So an attacker can overwrite build attribution at unlimited volume with **zero row growth**, poisoning `topBuiltPrize`, `buildDistribution` and the builder→signup→conversion funnel while every visit-count sanity check stays green.
      _Fix:_ Import `createRateLimiter` / `getClientIdentifier` from `src/utils/security/rateLimiter.ts` (already wired into `src/app/api/error-reports/route.ts`) and check it **synchronously before** the `after()` block — e.g. 20 requests / 5 min per IP.
      _Note:_ The gap is inherited (the sibling beacon has it too, pre-dating this branch), but this branch adds the **cheaper** primitive — update-in-place instead of insert.
      _Raised by:_ Reviewer E · _Verified by controller:_ zero rate-limit imports in `src/app/api/tracking/**`; `isValidAnonymousId` confirmed to be a format check.
      _Shot:_ code-only  _Handled:_ **2026-07-28, working tree (uncommitted)** — `createRateLimiter("promo-prize-build", { windowMs: 5*60*1000, maxRequests: 20 })`, checked synchronously as the first statement in `POST`, before the Zod parse and before `after()` is scheduled. **Proven live against the dev server: 20× `200` then 6× `429`, cutoff exactly at the budget.** `docs/tracking/api.md` updated.

- [ ] **F-002** · P1 · Test · `src/repositories/PromoAnalyticsRepository.ts:248-267, 563-652` — **The maths behind the admin revenue numbers has no test, so a future edit can silently misreport money.**
      _What:_ The `buildDistribution` merge and sort, and every rate calculation in `getAggregatedByBuiltPrize`, were verified only by throwaway probe scripts during implementation — those files no longer exist. This logic feeds the admin dashboard **and** the Norm external API. A regression such as flipping the tie-break comparator, or changing a `builders > 0` guard to `>= 0` (turning `0/0` into `Infinity`), would misreport revenue attribution with nothing in CI to catch it.
      _Fix:_ Add `src/repositories/__tests__/PromoAnalyticsRepository-aggregation.test.ts`, wired as `test:promo-analytics-aggregation` in `package.json`. Follow the proven pattern in `src/utils/promo-analytics/__tests__/record-prize-build.test.ts:175-229`: stub `PromoAnalyticsVisit.aggregate` / `User.aggregate` / `PaymentEvent.aggregate` by call order to return canned arrays, call the **real** repository methods, restore in `finally`. Assert: (1) two rows for one page with different slugs both land in `buildDistribution` with correct counts; (2) an equal-`visitors` tie sorts `builtPrizeSlug` ascending; (3) `topBuiltPrize === buildDistribution[0].builtPrizeSlug`; (4) a page with no builds gives `builds: 0`, `buildDistribution: []`, `topBuiltPrize: null`; (5) a slug in `signupAgg` but absent from `buildAgg` gives `builders: 0` and `builderToSignupRate: 0`, never `NaN`/`Infinity`; (6) `builders:10, signups:4, conversions:2` gives exactly `40 / 50 / 20`; (7) final sort is builders desc, slug asc.
      _Raised by:_ Reviewers D **and** F (independent convergence) · _Verified by controller:_ `grep` confirms 5 files reference these methods, **none** under `__tests__`.
      _Shot:_ code-only  _Handled:_ —

- [ ] **F-003** · P1 · Perf · `src/repositories/PromoAnalyticsRepository.ts:231-246, 567-576` — **The index added for the new aggregations is not the one MongoDB actually uses.**
      _What:_ `PromoAnalyticsVisit` gained `{builtPrizeSlug:1, timestamp:-1}` specifically for the two build aggregations. A live `.explain("queryPlanner")` against the dev DB shows the planner instead picks the TTL index `{timestamp:1}`, then FETCHes every document in the 90-day window and filters `builtPrizeSlug` in-stage. Forcing the new index with `.hint()` proves it is well-formed and usable — the planner simply doesn't choose it. At 100× volume every dashboard load would FETCH the whole 90-day set (~73K docs) rather than the ~0.4% that carry a build.
      _Fix:_ Add `.hint({ builtPrizeSlug: 1, timestamp: -1 })` to both `.aggregate([...])` calls at the two locations above.
      _Raised by:_ Reviewer E (empirical — live `.explain()` output, both default and forced plans captured).
      _Shot:_ code-only  _Handled:_ —

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

- [ ] **F-006** · P1 · Product · `src/repositories/PromoAnalyticsRepository.ts:563-652` + `src/components/admin/PromoAnalyticsManagement.tsx:748-832` — **"Do Kincrome-box builders convert better?" still needs mental arithmetic across five rows.**
      _What:_ Spec §7 promises this as an answerable question. `getAggregatedByBuiltPrize` groups strictly by the full combination (`milwaukee-kincrome`, `ryobi-kincrome`, …), so an admin must sum the five toolset variants per toolbox by hand. The data is captured correctly and nothing is miscounted — it simply isn't grouped into something readable off the screen.
      _Fix:_ Add a toolbox-level rollup keyed on `builtPrizeSlug.split('-').pop()`, summing `builders`/`signups`/`conversions` across toolset variants before computing rates — either as a fourth `$group` in the repository or a `reduce` in the admin component.
      _Raised by:_ Reviewer F (graded the requirement PARTIAL).
      _Controller correction:_ an earlier chat summary claimed all five questions were answerable. Four are; this one is partial. Corrected in the artifact and here.
      _Shot:_ code-only  _Handled:_ —

- [ ] **F-007** · P1 · Eng · `CLAUDE.md` Domain Manifest, `promo` domain `paths` (~line 425) — **A live architecture doc sits outside the manifest, so nothing will ever force it to stay current.**
      _What:_ `src/docs/PROMOTION_ANALYTICS.md` documents exactly the funnel this feature extends, and was edited three times in this branch. It matches **no** manifest glob. `.claude/hooks/doc-sync.mjs` excludes `docs/` but **not** `src/docs/`, so the hook treats it as source, finds no owning domain, and can never require it to be updated again. It is accurate today by diligence, not enforcement.
      _Fix:_ Add `"src/docs/PROMOTION_ANALYTICS.md"` to the `promo` domain's `paths` array in `CLAUDE.md`.
      _Raised by:_ Reviewer A · _Verified by controller:_ a manifest-resolution script over all 21 changed source files reports exactly one orphan — this file. Pre-existing debt (the file predates the branch), but this is the natural place to close it.
      _Shot:_ code-only  _Handled:_ —

- [ ] **F-012** · P1 · Arch · `src/app/api/tracking/promo-page-visit/route.ts` — **The sibling visit beacon is still unauthenticated and unrate-limited.**
      _What:_ Surfaced while fixing F-001. The same format-only cookie check guards this endpoint, and it has no rate limit either. It is **less** dangerous than F-001's target because it only ever INSERTS — abuse shows up as visibly inflated visit counts rather than silently rewritten attribution — but it is the same free-write primitive, and F-001 has now made the asymmetry obvious: one tracking beacon is guarded and its twin is not.
      _Fix:_ Apply the identical guard now proven on F-001 — `createRateLimiter("promo-page-visit", { windowMs: 5 * 60 * 1000, maxRequests: 20 })` from `src/utils/security/rateLimiter.ts`, checked synchronously as the first statement in `POST`, before `after()` is scheduled. Update `docs/tracking/api.md` in the same change.
      _Raised by:_ the F-001 implementer, correctly flagged rather than drive-by fixed (it was outside that finding's scope). Pre-dates this branch.
      _Shot:_ code-only  _Handled:_ —

### P2

- [ ] **F-008** · P2 · Test · no file — an absence — **The exact bug this branch fixes has no automated guard against coming back.**
      _What:_ Spec §7's B1–B8 matrix was verified once, by hand. No e2e spec touches `/promotions/*` query-param behaviour (`grep` over `e2e/specs/` returns nothing for `toolbox=`/`toolset=`/`PrizeShowcase`). The scroll-reset bug already reached production once; nothing stops a future edit reintroducing it or silently regressing the debounced beacon.
      _Fix:_ Add `e2e/specs/marketing/prize-build-url-params.spec.ts` per `docs/e2e/adding-a-spec.md` (import from `../../fixtures/test`, tag `@smoke`) asserting: B1 scroll delta 0 on a reel click; B5 `history.length` unchanged after 4 clicks; B4 a direct `?toolset=milwaukee&toolbox=kincrome` load selects the matching cards; and the beacon debounce — intercept `POST /api/tracking/promo-prize-build`, switch 3× rapidly, wait >1s, assert exactly one request with cumulative counters.
      _Raised by:_ Reviewer D.
      _Shot:_ code-only  _Handled:_ —

- [ ] **F-009** · P2 · Perf · `src/repositories/PromoAnalyticsRepository.ts:596-617` — **The admin analytics page now runs two unindexed full scans of the payments collection instead of one.**
      _What:_ `PaymentEvent` has no index on any `data.*` path (confirmed: five indexes, none matching). The existing `data.promotionSlug` query already full-scans this always-growing, non-TTL'd collection — inherited debt. This branch adds a second full scan on `data.builtPrizeSlug`, run concurrently via `Promise.all` in the same admin route.
      _Fix:_ Add `PaymentEventSchema.index({ eventType: 1, "data.builtPrizeSlug": 1, timestamp: -1 })` in `src/models/PaymentEvent.ts`, matching the `$match` shape at `:602-606`.
      _Raised by:_ Reviewer E.
      _Shot:_ code-only  _Handled:_ —

- [ ] **F-010** · P2 · Eng · `src/components/sections/promo/PrizeShowcase.tsx:342-349` — **Leaving the cash option by clicking a toolset doesn't count as a toolbox change, so engagement is under-reported on that path.**
      _What:_ `handleSelectCash` bumps `toolboxSwitches` because cash is modelled as the toolbox lane's opt-out. But `handleSelectToolset` **also** exits cash mode and does not bump it. A visitor who picks cash then clicks a different toolset changes the toolbox lane's state without it being counted.
      _Fix:_ **Decision needed before coding.** Two defensible readings: (a) the counters measure *lane state changes* → capture `isCash` before the state updates and add `if (isCash) setToolboxSwitches((n) => n + 1);` in `handleSelectToolset`; or (b) they measure *reel interactions* → the current behaviour is right and `handleSelectCash`'s bump is the odd one out. Pick one and make both handlers consistent with it.
      _Raised by:_ Reviewer A · _Verified by controller:_ asymmetry confirmed by reading both handlers.
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
