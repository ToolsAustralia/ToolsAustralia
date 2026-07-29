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

---

# Round 2 — post-merge panel (2026-07-29)

A **second full panel** ran against the merged tree. Round 1 (above) reviewed 5 commits in isolation;
this round reviews **the whole PR-into-main surface** including everything `origin/main` and
`origin/staging` brought in. Round 1's findings are unchanged and still authoritative for their scope.

- **Date:** 2026-07-29 · **HEAD:** `24a46f13` · tree clean, pushed.
- **Base:** `origin/main`. Both `origin/main` and `origin/staging` are **ancestors of HEAD**, so
  `git diff origin/main` and `git diff origin/main...HEAD` are equivalent here — **42 commits, 104
  files, +12,207/−248**. That is the PR-into-main surface. `git diff origin/staging` is *not* usable.
- **Deployment this review gates:** branch → `origin/staging` → `origin/main`. It deliberately carries
  **two** features shipping together: (1) prize-build URL params + funnel tracking (this branch's own
  work); (2) **igodirect rewards-return**, arrived via the staging merge (PRs #732/#736).
- **PR:** none (`gh` not installed). Acceptance graded against the approved spec
  [`docs/superpowers/specs/2026-07-27-prize-build-url-params-design.md`](../superpowers/specs/2026-07-27-prize-build-url-params-design.md)
  §7 (B1–B8 + Q1–Q5) — stated as a substitution, not skipped. igodirect was **not** re-graded; it has
  its own panel doc and was checked only for *survival across the merge*.
- **New findings:** **F-018 … F-047** (Round 1 ended at F-017; nothing renumbered).
- **Artifact:** https://claude.ai/code/artifact/eeea34f3-91c6-49b7-bb0d-f20c3f78558a
- **Gate:** `type-check` ✓ · `lint` 39 problems / 6 errors = documented baseline (caveat below) ·
  30/30 targeted tsx suites ✓ · production build exit 0 with `/`, `/promotions`, `/promotions/[slug]`
  and every toolset landing page **still prerendering** (`○`/`●`, none `ƒ` — the CSP-R8 property) ·
  `e2e:smoke` 85 passed / 0 failed / 9 flaky · **`norm:smoke` 2/2 endpoints 200** (run this round).
- **Lint caveat, worth keeping:** `npm run lint` also scans `e2e-artifacts/` — gitignored but missing
  from eslint's flat-config `ignores` — so after any failing e2e run it reports **~3,066 problems**
  from Playwright's own report bundle. Always use `--ignore-pattern "e2e-artifacts/**"` before
  concluding anything about lint.
- **Evidence:** live rendering via the repo's own `e2e:env` harness at 390/1280 in both themes
  (guest / seeded member / seeded admin), Chrome `layout-shift` observer, pixel-sampled contrast,
  live MongoDB `.explain("executionStats")`, and a live rate-limiter probe. Chromium at a given width
  is a viewport, not a device — no real-device claim is made anywhere below.

### The three things this round found that no earlier review could

1. **A closed finding's fix does not do what it claimed.** F-003 added
   `{ hint: { builtPrizeSlug: 1, timestamp: -1 } }` to both build aggregations to stop them scanning
   the whole 90-day window. **Measured on the dev DB this round: it changes nothing** — 764 keys /
   764 docs examined with the hint, and 764 / 764 without. The index is **non-sparse**, so
   `$exists: true` cannot narrow it (bounds come back `[MinKey, "") ("", MaxKey]` — the entire key
   space). The hint buys zero and adds a **hard-failure mode**: hinting an absent index throws and
   500s the whole admin page. See **F-020** / **F-021**.
2. **Two other closed fixes each introduced a new problem** — F-012's rate limit can now silently
   drop real visit rows (**F-024**), and F-011's unconditional `max-w-[110px]` truncates the
   most-built prize to ~11 characters at *every* width, including 1600px (**F-031**).
3. **The merge seam is real but narrow.** `main` widened the attribution guard with `&& !clickPlatform`;
   combined with a whole-subdocument replace, a returning visitor's promo **and** prize-build
   attribution is now silently wiped (**F-019**). This path did not exist pre-merge.

### The merge seams DJ asked to be scrutinised — verdicts

| # | Seam | Verdict |
|---|---|---|
| 1 | `src/app/api/auth/register/route.ts` (the only real code conflict) | **Merge itself is correct** — all four registration branches thread both `builtPrizeSlug` and `clickPlatform` in the right positions, and the guard is right *as a decision about whether to write*. The defect is the **write mode**, not the guard → **F-019**. |
| 2 | Domain Manifest in `CLAUDE.md` | **Clean.** Set-differenced main's manifest against the current one: 31 domains both sides, 457 → 470 paths, **zero domains and zero path globs dropped**. Independently, all **60 changed source files resolve to exactly one domain** via the hook's own `readManifest` + `findDomain`. 7 stale globs point at nothing, but **all 7 are inherited from main** → **F-047** (hygiene only). |
| 3 | Norm lockstep (rule 10) | **Clean, and now actually exercised** — `norm:smoke` run this round: 2/2 endpoints `200`, `withNorm`'s runtime `responseSchema` validation passed. Schema ↔ output desk-checked field-by-field; `norm-context.md` is current. **Caveat:** the DB had no build rows, so the *populated* branches of the new schema were never validated → **F-041**. |
| 4 | Rule 11 legal copy, both features | **One violation**, in a line this branch edited → **F-025** (P0). Everything else clean: a banned-vocabulary sweep over every added line, plus a **rendered-DOM** sweep across 10 URLs, returned only test fixtures. |
| 5 | Cobber (rule 5c) | **FAQ corpus is current** (FAQ 72 added, count assertion bumped 71 → 72 deliberately). **Gap:** the ACCOUNT SELF-SERVICE MAP has **zero** mention of the partner portal → **F-034**. |

## Handoff

Fresh session? Run `/panel-fix` on this branch, or paste:

> Read `docs/tech-debt/panel-review-feature-drawn-tonight-tomorrow-july-assets.md`. Fix ONLY the Now
> items: F-025, F-018, F-019, F-020, F-024.
> Findings F-018+ were written against `24a46f13`; F-001…F-017 against `99f4739f` — re-grep each
> `file:line`, they may have moved.
> One commit-worthy change per finding. Do NOT commit. When a finding is done, tick its box
> and fill `_Handled:_` with the date. If a fix turns out to be wrong, mark it Overridden with
> a reason instead of silently skipping it.

**Now — clear these before `origin/main`. Staging can take the branch as-is** (staging is where
F-018 and F-024 become observable with real traffic, exactly how F-013 was caught):

- ~~**F-025**~~ — **OVERRIDDEN by DJ**, see its entry.
- ~~**F-018**~~ ~~**F-019**~~ ~~**F-020**~~ ~~**F-024**~~ — **all DONE 2026-07-29**, uncommitted.

### UPDATE 2026-07-29 — the Now set is done, plus F-022, F-023 and F-026

DJ reviewed the findings and directed: proceed on **F-018, F-019, F-022, F-023, F-024, F-026**;
**override F-025**. All seven are applied **in the working tree and NOT committed** (CLAUDE.md
rule 1 — commits were never authorised this session).

Gates after the changes: `type-check` clean · `lint` 39 problems / 6 errors = **unchanged**
baseline · `test:prize-build` 11/11 (2 new cases) · `test:promo-analytics-aggregation`,
`test:promo-visit`, `test:prize-builder`, `test:prize-builder-card` all pass.

**F-018 grew beyond its stated one-line fix, deliberately.** Removing the interaction gate *alone*
would have turned `getAggregatedByPage.builds` from "engaged visitors" into "≈ every visitor",
silently breaking the admin **Builds** column and the "41% never touch the reels" question — trading
one wrong number for another. Engagement therefore moved onto a new explicit field,
`PromoAnalyticsVisit.buildInteracted`, because it genuinely cannot be derived from the counters (a
cash-only visitor is legitimately `0/0`, F-010). Rationale in `docs/promo/models.md`.

**What is left before `origin/main`:**

- **Re-verify F-022 and F-023 visually.** Both were applied from measured numbers but **not
  re-measured after the change**: re-run the layout-shift observer for F-022 (including the
  unmeasured `sm`–`lg` band) and re-sample the button contrast for F-023 (including a real
  Boss-tier account).
- **F-021** — now the natural pair to F-020: the hints are gone, but the indexes still narrow
  nothing until they are partial.
- **F-038** — the test for `buildSignupAttribution`, which F-019 just changed and which has no
  coverage at all.

**Next:** F-030, F-031, F-032, F-039, F-040.
**Later:** everything else (F-027 … F-029, F-033 … F-037, F-039 … F-047).

**Round 1's three open items still hold, re-confirmed this round:**

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
      _Shot:_ code-only  _Handled:_ **2026-07-29, working tree (uncommitted)** — the beacon no longer gates on interaction, so builders and signups are counted over the same population. Engagement moved onto a NEW explicit field `PromoAnalyticsVisit.buildInteracted` rather than being inferred: the counters cannot express it (cash is a toggle, not a reel touch — F-010), and without it `getAggregatedByPage.builds` would silently have become "all visitors", breaking the admin Builds column and the never-touched-the-reels question. Threaded route → recorder → service → repository, **optional at every layer with absent = engaged**, so a pre-flag client, a queued `sendBeacon` from before a deploy, and every legacy row are all counted as engaged. `builds` gates on `buildInteracted: {$ne:false}`; `byBuiltPrize.builders` deliberately does NOT (it must match `signups`). Two new cases in `test:prize-build` pin the un-engaged and cash-only shapes — 11/11 pass. **Scope note:** the extra field is beyond this finding's one-line fix, and is the reason it is not a half-fix; see the reasoning in `docs/promo/models.md`.

- [ ] **F-016** · P2 · Bug · `src/app/api/admin/analytics/spend-by-url/route.ts` (+ `e2e/lib/env.ts:69`) — **Opening the admin dashboard fires 500s whenever the Meta ad account isn't configured, instead of degrading like its sibling endpoint does.**
      _What:_ Surfaced by the full `e2e:smoke` run on the merged tree (2026-07-29): `admin-gate.spec.ts` ("admin reaches /admin") tripped the QA watchdog with `HTTP 500 /api/admin/analytics/spend-by-url` **twice per page load**, on two projects. Cause is not a merge defect — `e2e/lib/env.ts:69` deliberately overlays `FACEBOOK_AD_ACCOUNT_ID: ""`, and main's endpoint returns `500 misconfigured` when it is unset (documented behaviour, `docs/internal-norm/norm-context.md`). So the failure is the harness meeting main's new analytics work, and it will flake `/admin` for anyone whose environment lacks that var. **Inherited from `origin/main`; not introduced by this branch** — our diff touches none of these files.
      _Why it is still worth fixing:_ main's OWN sibling endpoint `/analytics/packages-focus` returns `supported: false` for an unconfigured platform rather than 500ing. A missing optional ad-platform integration should not make an admin page emit server errors; the two endpoints should agree.
      _Fix:_ Make `spend-by-url` (and `/detail`) mirror `packages-focus`: return a `supported: false` / empty-bucket payload when the platform's account id is unset, reserving 500 for genuine failures. Then drop the resulting dead expectation, if any, from the admin specs.
      _Raised by:_ controller, from the merged-tree `e2e:smoke` run. _Verified:_ `grep -n FACEBOOK_AD_ACCOUNT_ID e2e/lib/env.ts` → line 69 sets `""`; the 500s appear in the run log under the admin-gate test.
      _Shot:_ code-only  _Handled:_ **2026-07-29, working tree (uncommitted)** — added `mergeSignupAttribution` + `plainSignupAttribution` and routed all three existing-account branches through them. **Preserve-when-absent** for `promotionSlug` / `promotionPageType` / `builtPrizeSlug` — they survive only when the incoming signup does not carry one — and last-write-wins for everything else. New-account branches still assign directly (nothing to preserve). Rule recorded in `docs/auth/gotchas.md`, `docs/subscription/models.md` and `CUSTOMER.md`.
      **Correction (surfaced while writing F-038's test):** this entry and the docs first described the rule as "first-touch-wins", which is **wrong** — if the new signup *does* carry a promo slug, `...next` wins and the previous one is replaced. The F-019 scenario (a returning visitor on a bare ad click, no promo context) is protected either way; a re-registration from a genuinely *different* promo page re-attributes to it. All three docs corrected. **Whether strict first-touch-wins is actually wanted is an open product question for DJ — it is a behaviour change, not a defect.**
      **Now tested** — see F-038.

- [ ] **F-017** · P2 · Bug · `src/components/ui/Carousel3D.tsx:470` (trigger likely upstream in `src/app/(site)/membership/components/MembershipPageClient.tsx:53`) — **`/membership` logs a React hydration mismatch, which React explicitly does not repair.**
      _What:_ Also surfaced by the merged-tree `e2e:smoke` run, under `registration.spec.ts`. React reported *"A tree hydrated but some attributes of the server rendered HTML didn't match the client properties. This won't be patched up."* The mismatching attribute is `id="_R_…-stage"` on a `motion.div` inside `Carousel3D` → `MembershipDrawCycle`, i.e. a **`useId()`** value (`Carousel3D.tsx:470` `const baseId = useId()`) differing between server and client.
      _What I ruled out:_ `Carousel3D.tsx` and `MembershipDrawCycle.tsx` are **byte-identical to `origin/main`** (`git diff --quiet origin/main --` on both). So the components that mismatch are not ours.
      _Unproven hypothesis, stated as such:_ `useId` is positional, so a component rendering a different subtree shape between SSR and first client render shifts every id after it. `MembershipPortalReturnBanner` (ours, arriving via the staging merge) renders at `MembershipPageClient.tsx:53`, **before** `MembershipDrawCycle` at `:65`, and has four `return null` paths (`:86, :94, :97, :102`) plus an `aria-busy` skeleton branch (`:112`). That is the classic way to shift a `useId` sequence. **I did not prove causation** — the error is intermittent (the test passed on retry), which is unusual for a deterministic mismatch and suggests it depends on session/`guestUserData` state mid-registration.
      _Fix:_ Reproduce first, don't patch blind. Load `/membership` with and without the banner rendering (portal params absent vs present, guest vs seeded member) and diff the SSR HTML against the hydrated DOM around `Carousel3D`'s `baseId`. If the banner is confirmed as the trigger, make its server and first-client render agree (render the skeleton on both, or gate the whole banner behind a single stable branch) rather than changing `Carousel3D`.
      _Raised by:_ controller, from the merged-tree `e2e:smoke` run.
      _Shot:_ code-only  _Handled:_ **2026-07-29, working tree (uncommitted)** — both `{ hint: … }` option objects deleted, along with the stale comments asserting they avoided a full-window FETCH. The measurement and the two general lessons (a hint 500s when the index is absent; `$exists` needs a PARTIAL index) are recorded in `docs/mongodb/gotchas.md` so the hint is not re-added without doing F-021 first.

---

## Round 2 findings (2026-07-29, against `24a46f13`)

### P0

- [~] **F-025** · P0 · LEGAL · `src/components/features/MiniDrawPackages.tsx:203` — **A Mini Pack tile's tooltip prices the entries — "3 free entries · $25" — which is the shape CLAUDE.md §11 bans.**
      _What:_ A customer hovers (or long-presses, or screen-reads) any Mini Pack tile and the tooltip reads `50% partner catalogue · 3 free entries · $25`. Read left-to-right on a **buy** button that is a quantity of entries with a price attached. Tools Australia legally cannot sell entries; the purchasable unit is the **pack** and the entries are a free inclusion.
      _Where:_ `title={`${partnerCatalogPct}% partner catalogue · ${pkg.entries} free entries · $${pkg.price}`}`
      _Fix:_ Put the price first and the entries as an inclusion — replace the `title` value with `` `$${pkg.price} Mini Pack · includes ${pkg.entries} free entries · ${partnerCatalogPct}% partner catalogue` ``.
      _Raised by:_ Reviewers A **and** C (independent convergence). _Verified by controller:_ `git diff origin/main -- src/components/features/MiniDrawPackages.tsx` shows **this branch edited this exact line** (`catalog` → `catalogue`), so §11's "every new or edited customer string" applies.
      _Severity note, stated honestly:_ the string does say "**free** entries", which is the mitigation, and the ordering pre-dates this branch. Both reviewers flagged the tension (A proposed P1, C P0). **Ruled P0** — §11 names `N entries · $X` verbatim as banned, the rule is unconditional for customer-facing copy, and the fix is one line, so there is no cost to being strict. `e2e/specs/marketing/legal-copy.spec.ts` bans the *vocabulary* but has no assertion for the priced-per-unit *shape*, so nothing catches this.
      _Shot:_ code-only  _Handled:_ **2026-07-29, working tree (uncommitted)** — both beacons re-keyed onto the `ta_anon_id` visitor cookie (IP only as fallback) and widened 20 → 60 per 5 min, matching the `promo/link/validate` precedent. Argument order to `getClientIdentifier` corrected to `(x-real-ip, x-forwarded-for)` so the bucket keys on the client rather than the whole proxy chain. `docs/tracking/api.md` updated. Also dissolves the e2e starvation Reviewer D found, since each browser context now carries its own anon id instead of all three projects sharing the literal `"unknown"`.

### P1

- [x] **F-018** · P1 · Bug · `src/hooks/usePrizeBuildTracking.ts:78` + `src/components/modals/MembershipModal/index.tsx:1464-1469` + `src/repositories/PromoAnalyticsRepository.ts:654` — **The admin's "B→S %" and "Conv %" columns count two different groups of people, so they can show more than 100%.**
      _What:_ 100 people land on `/promotions/makita` and 41 never touch the reels. Those 41 still get `builtPrizeSlug: "makita-milwaukee"` on their **signup** row — the modal deliberately falls back to the page default. But they get **no** `builtPrizeSlug` on their **visit** row, because the beacon returns early without an interaction. So `signups` includes them and `builders` excludes them, and the ratio of the two is not a rate. Every landing page's *default* combination in the **By Built Prize** and **By Toolbox** tables is inflated, freely past 100%.
      _Where:_ the two halves state the asymmetry in their own comments —
      `usePrizeBuildTracking.ts:78` → `if (!interacted) return; // never touched anything — the visit row is already correct`
      `MembershipModal/index.tsx:1460` → `// Falls back to the page's own prize when they never touched the reels.`
      `PromoAnalyticsRepository.ts:654` → `builderToSignupRate: builders > 0 ? (signups / builders) * 100 : 0,`
      _Why it matters:_ this is the **same failure class as F-013** (the 250% column found on staging), and it will be found the same way — the unit tests all use one row per visitor, the shape that cannot reproduce it.
      _Fix:_ Make the visit row match the signup row and the spec. In `src/hooks/usePrizeBuildTracking.ts` delete `if (!interacted) return;` at `:78` so an untouched page fires exactly one beacon with `toolboxSwitches: 0, toolsetSwitches: 0` (the existing `lastSent` payload-dedup at `:85` already prevents duplicates). Drop the `hasInteracted` argument from the hook and from `PrizeShowcase.tsx:237`. Then change the never-engaged metric in `PromoAnalyticsManagement.tsx` to key on `toolboxSwitches === 0 && toolsetSwitches === 0` — which is what spec §5 says the counters are for — and re-pin the affected expected values in `src/repositories/__tests__/PromoAnalyticsRepository-aggregation.test.ts`.
      _Raised by:_ Reviewer F. _Verified by controller:_ both code paths read directly; the two comments above are quoted verbatim from the tree.
      _Shot:_ code-only  _Handled:_ **OVERRIDDEN 2026-07-29 by DJ** — *"the free entries in the mini pack is just fine leave that"*. Owner call, recorded rather than deleted so it is not re-raised: the string does say "**free** entries", the ordering pre-dates this branch, and the panel only surfaced it because a spelling edit (`catalog` → `catalogue`) touched the line. The panel had ruled it P0 on the strict reading of §11's `N entries · $X` shape; the owner's reading is that "free" defuses it. If the wording is ever revisited, the fix line above still stands.

- [x] **F-019** · P1 · Bug (merge seam) · `src/app/api/auth/register/route.ts:253` + `:546`, `:691`, `:789` — **A returning visitor who re-registers after an abandoned checkout loses the promo page and the prize they built.**
      _What:_ Someone lands on `/promotions/makita`, builds `makita-kincrome`, completes step 1, then abandons payment — the exact visitor the Klaviyo resume flow exists to bring back. Days later they click a Meta ad, land somewhere with no promo slug and no UTMs, and re-register with the same email. `_fbc` is present, so `clickPlatform: "meta"` alone now passes the guard, and the whole `signupAttribution` subdocument is **replaced**. `promotionSlug`, `promotionPageType`, `builtPrizeSlug` and the original UTMs are gone. When they finally buy, the conversion is attributed to no page and no build.
      _Where:_ `if (!hasPromo && !hasAttribution && !clickPlatform) return undefined;` then `if (signupAttr) existingUser.signupAttribution = signupAttr;` — a whole-object assignment, at all three existing-account branches.
      _Why this is a merge seam:_ pre-merge (`99f4739f`) the guard was `if (!hasPromo && !hasAttribution)`, so that request returned `undefined` and left the prior attribution **intact**. `origin/main` added the `&& !clickPlatform` third trigger. The merge kept it, and this branch's `builtPrizeSlug` is now part of what it destroys. **This path did not exist on either branch alone.**
      _Fix:_ Merge instead of replace. At each of `:546`, `:691`, `:789` replace `existingUser.signupAttribution = signupAttr;` with a field-wise merge that preserves already-set promo fields: `existingUser.signupAttribution = { ...(existingUser.signupAttribution?.toObject?.() ?? existingUser.signupAttribution ?? {}), ...signupAttr };`
      _Raised by:_ Reviewer E (P1) and Reviewer A (P2) — **independent convergence**, ruled P1 on E's evidence. _Evidence:_ E hydrated a real mongoose 8.18.1 document in `signupAttribution`'s exact inline-nested shape and captured the emitted write — `{"$set":{"signupAttribution":{"visitedAt":"…","clickPlatform":"meta"}}}`, whole-object, nothing merged.
      _Shot:_ code-only  _Handled:_ **2026-07-29, working tree (uncommitted)** — both indexes redeclared as PARTIAL with new names (`builtPrizeSlug_ts_partial`, `signupBuiltPrize_createdAt_partial`), and `scripts/migrations/2026-07-29-partial-build-prize-indexes.ts` added to drop the two superseded ones, wired as `migrate:partial-build-prize-indexes` with a `:dry` variant that is the DEFAULT (live requires `--live`). Dry-run verified against the dev DB: both partial indexes already built by autoIndex, both superseded indexes PRESENT, "Would drop: 2, Failed: 0". Idempotent (a missing index is a reported no-op, catching `IndexNotFound` code 27) and prints the index list before and after.

- [x] **F-020** · P1 · Bug · `src/repositories/PromoAnalyticsRepository.ts:251` and `:587` — **The admin promo dashboard and Norm's promo feed both hard-500 if one index is missing, in exchange for a speed-up that measurably does not happen.**
      _What:_ Both build aggregations pass `{ hint: { builtPrizeSlug: 1, timestamp: -1 } }`. MongoDB does **not** fall back when a hint names an index that isn't there — it rejects the command. On a fresh deploy before Mongoose's background index build finishes, after an Atlas restore, or if anyone ever sets `autoIndex: false` for serverless, `/api/admin/promo-analytics` returns 500 and Norm returns 500. Because the admin route wraps all three services in one `Promise.all`, the visits / signups / revenue tables die alongside the build tables — the whole page, not one column.
      _Where:_ `], { hint: { builtPrizeSlug: 1, timestamp: -1 } }).exec();`
      _Fix:_ Delete both `{ hint: … }` option objects — the second argument to `.aggregate(...)` at `:251` and at `:587` — leaving `PromoAnalyticsVisit.aggregate([...]).exec()`. Remove the two stale comments above them that claim the hint avoids a full-window FETCH. Then do **F-021**, which is what actually delivers the speed-up F-003 was after.
      _Raised by:_ Reviewers D and E (independent convergence). **_Measured by the controller, on the dev DB (764 docs, 8 carrying `builtPrizeSlug` = 1.05%):_**
      | run | index used | keysExamined | docsExamined | returned |
      |---|---|---|---|---|
      | no hint | `promo_analytics_visits_ttl` | 764 | 764 | 7 |
      | **with the shipped hint** | `builtPrizeSlug_1_timestamp_-1` | **764** | **764** | 7 |
      Hinting a one-character-different index **threw** rather than degrading. The bounds explain the tie: `"builtPrizeSlug":["[MinKey, \"\")","(\"\", MaxKey]"]` — the entire key space.
      **This overturns the premise of closed finding F-003**, which added the hint believing it would replace a full-window FETCH. It does not. F-003's *diagnosis* was right; its *remedy* was not.
      _Shot:_ code-only  _Handled:_ **2026-07-29, working tree (uncommitted)** — `buildSignupAttribution`, `mergeSignupAttribution` and `plainSignupAttribution` moved verbatim (names unchanged, per the one-concept-one-name rule) into `src/services/attribution/signup-attribution.ts`, imported back into the route — which also clears CLAUDE.md's "no business logic in `app/api/**`". New suite `src/services/attribution/__tests__/signup-attribution.test.ts`, wired as `test:signup-attribution`, covering all 12 required assertions including the **argument-position guard** (the one that catches two branches each adding a third parameter) and the four F-019 merge cases. Passes; proven load-bearing by deliberately breaking the guard and the merge and confirming red, then reverting.

- [x] **F-024** · P1 · Bug · `src/app/api/tracking/promo-page-visit/route.ts:27-30` (and `promo-prize-build/route.ts:21-24`) — **Twenty-one people on the same mobile network opening the same ad in five minutes means the twenty-first visit is never recorded.**
      _What:_ Both beacons gained a **20-request / 5-minute, per-IP** limit. Australian mobile carriers put very large numbers of users behind shared CGNAT egress IPs, so a single ad burst can exhaust the budget for everyone behind it. The 21st visitor gets `429` and **no `PromoAnalyticsVisit` row is created** — silently, because the beacon is fire-and-forget. Visit counts and every rate derived from them undercount. Spec §7 lists visit row counts as **explicitly unchanged**.
      _Where:_ `createRateLimiter("promo-page-visit", { windowMs: 5 * 60 * 1000, maxRequests: 20 })` — the identifier is the raw IP header, with no per-visitor component. The route's own header comment calls this "the highest-traffic path."
      _Fix:_ Key the bucket on the visitor and widen the budget, in **both** beacon routes. Read `AnonymousIdService.extractAnonymousId(request)` before the limiter and pass `` `${anonymousId ?? identifier}` `` as the identifier — `ta_anon_id` is minted in middleware for every page request since `origin/main` `c5a360c1`, so it is present on essentially every real beacon. Raise `maxRequests` to `60`. **In the same edit fix the argument order**: both routes call `getClientIdentifier(clientIp, xff)` with `x-forwarded-for` in *both* positions, so the key becomes the whole proxy chain; the four auth routes pass `(x-real-ip, x-forwarded-for)` and are the pattern to match. Update the budget numbers in `docs/tracking/api.md`.
      _Raised by:_ Reviewer F (customer impact), Reviewer D (test impact), Reviewer E (key correctness) — **three reviewers, one root cause, merged here**.
      _Verified by controller:_ the repo's own comparable public unauthenticated endpoint, `src/app/api/promo/link/validate/route.ts:6-9`, budgets **60/min = 300 per 5 min** — **15× looser** than what these two beacons got. Reviewer D measured the limit firing live: 26 sequential POSTs → `{"200":20,"429":6}`.
      _Also fixes:_ the e2e starvation Reviewer D found — one server serves all three browser projects and `getClientIdentifier` returns the literal `"unknown"` for every localhost request, so chromium-desktop, mobile-chrome and mobile-safari share **one** 20-request bucket. Keying on `ta_anon_id` gives each browser context its own budget.
      _Consequence of closed F-012's fix._ Not a reason to revert it — a reason to calibrate it.
      _Shot:_ code-only  _Handled:_ —

- [x] **F-022** · P1 · UX · `src/components/sections/membership/MembershipPortalReturnBanner.tsx:110-140` (sized against `SECTION_CLASS` at `:37-38`) — **Arriving on `/membership` from the partner portal, the whole page jumps up or down about 2.4 seconds after it loads.**
      _What:_ A visitor taps a partner-portal offer link, lands on `/membership?utm_campaign=rewards-return&offer_id=…`, and starts reading the hero. Roughly 2.3–2.4s later the banner's skeleton swaps for real copy and everything below it moves. The anti-CLS skeleton reserves *a* height but not *the* height — it sits between the tallest and shortest settled variants, so it is wrong for every state.
      _Where:_ `<div className="mt-1.5 h-[50px] w-64 max-w-full rounded bg-white/10 … sm:h-[56px] lg:h-[44px]" />`
      _Fix:_ Floor the shared section so the settled banner can never be shorter than the skeleton reserved — at `:37-38` append `min-h-[333px] lg:min-h-[273px]` to `SECTION_CLASS`. This removes the upward jump in 3 of the 4 measured states. (The `sm`–`lg` band was not measured; re-measure before pinning a `sm:` value.)
      _Raised by:_ Reviewer B — **measured, not inferred**, with a Chrome `layout-shift` observer:
      | session / width | CLS **with** banner | CLS **without** | hero `<h1>` top, skeleton → settled |
      |---|---|---|---|
      | guest @1280 | **0.5774** | 0.0100 | 468.8 → 479.6 |
      | member @1280, offer 21190 | **0.6134** | 0.0252 | 479.6 → 444.8 (**up** 34.8px) |
      | member @390, offer 21190 | 0.4377 | — | 488.3 → 447.1 (**up** 41.2px) |
      Google's "good" CLS bar is **0.10**. The dominant shift entry names the banner's own CTA column and the hero beneath it as its unstable sources.
      _Shot:_ `<scratchpad>/f-cls-skeleton-390.webp`, `<scratchpad>/f-cls-settled-390.webp`  _Handled:_ **2026-07-29, working tree (uncommitted)** — `min-h-[333px] lg:min-h-[273px]` added to `SECTION_CLASS`, so the settled banner can only ever grow into space already reserved rather than shrink out of it. **Not re-measured after the change** — re-run the layout-shift observer at 390/1280 across the six banner states to confirm the CLS drop, and measure the `sm`–`lg` band, which was never measured.

- [x] **F-023** · P1 · A11y · `src/components/sections/rewards/RewardsPartnerCard.tsx:111-126` — **The Rewards page's main "Open partner portal" button is white text on light cyan and is hard to read.**
      _What:_ A Tradie member — the entry tier, the highest-traffic one — opens `/my-account/rewards`. The card's primary call to action renders white 13px text on the tier's cyan gradient. In daylight or on a dimmed screen the label washes out; the 10px sub-label is worse.
      _Where:_ `style={{ color: inkOn(c), background: `linear-gradient(150deg, ${shade(c, 22)}, ${shade(c, -16)})` … }}`
      _Fix:_ Darken the gradient so the existing white ink passes, and stop discounting the sub-label — at `:116` use `` background: `linear-gradient(150deg, ${shade(c, -44)}, ${shade(c, -60)})` `` and at `:123` replace `"rgba(255,255,255,.78)"` with `"#ffffff"`. Measured result: Tradie **5.95:1**, Boss 10.5:1.
      _Raised by:_ Reviewer B — **pixel-sampled from the rendered button**, not computed from source: bold label `#ffffff` on `rgb(42,196,231)` = **2.07:1**; sub-label = **1.79:1**. WCAG AA needs 4.5:1. Sampling across the whole gradient gives 1.98–2.78:1 — no part of the button passes. Panel F-035 (igodirect doc) fixed the *sibling* guest CTA at `:95` and left this one.
      _Caveat:_ the seeded member is Tradie; Boss (`#ee0000`) was **computed** at ~3.9:1, not sampled — confirm against a real Boss account.
      _Shot:_ `<scratchpad>/f-sso-contrast-390.webp`  _Handled:_ **2026-07-29, working tree (uncommitted)** — gradient darkened to `shade(c,-44)` → `shade(c,-60)` and the 10px sub-label un-discounted from `rgba(255,255,255,.78)` to `#ffffff`. Expected Tradie 5.95:1, Boss 10.5:1. **Not re-sampled from the rendered button** — confirm visually, and confirm Boss against a real Boss-tier account (the seeded member is Tradie).

- [x] **F-026** · P1 · Bug · `src/components/sections/promo/PrizeShowcase.tsx:295-313` — **Clicking from one prize page to another records a prize the visitor never built, on the second page.**
      _What:_ A visitor lands on `/promotions/ryobi-milwaukee`, spins the reels three times, then clicks a link to another prize page in the same route family. Next.js reuses the component instead of remounting it, so the engagement counters and the "they touched something" flag carry over. A second later the beacon fires again — stamped with the **new** page's slug and its **default** prize, plus the previous page's switch counts. Page two is credited with a build that never happened.
      _Where:_ the effect resets `selection` and `isCash` and clears the URL params, but never the counters —
      `const next = resolveStateForSlug(slugProp); setSelection(next.selection); setIsCash(next.isCash);`
      _Fix:_ Reset the three pieces of engagement state in the same effect, immediately after `setIsCash(next.isCash);` at `:300`: `setToolboxSwitches(0); setToolsetSwitches(0); setHasInteracted(false);`
      _Raised by:_ Reviewer A. _Verified by controller:_ the effect body read in full — it handles the URL leak (its own comment: *"page A's build leaks onto page B and is attributed there"*) but not the counters; `grep` confirms `setToolboxSwitches` / `setToolsetSwitches` / `setHasInteracted` are called **only** from the three reel handlers at `:347`, `:356`, `:366`. No test covers it — the e2e spec navigates exclusively with `page.goto`, which remounts.
      _Note:_ if **F-018** is fixed as written (beacon no longer gated on interaction), this bug's blast radius grows — fix them together.
      _Shot:_ code-only  _Handled:_ **2026-07-29, working tree (uncommitted)** — `setToolboxSwitches(0); setToolsetSwitches(0); setHasInteracted(false);` added to the `slugProp` effect alongside the existing URL-param cleanup. **Still unguarded by a test** — the e2e spec navigates only with `page.goto`, which remounts; reproducing this needs a client-side transition between two `[slug]` prize pages.

### P2

- [x] **F-021** · P2 · Perf · `src/models/PromoAnalyticsVisit.ts:116` and `src/models/User.ts:1295` — **Both indexes added for the build funnel scan the entire window anyway.**
      _What:_ `PromoAnalyticsVisit` gained `{builtPrizeSlug:1, timestamp:-1}` and `User` gained `{"signupAttribution.builtPrizeSlug":1, createdAt:1}`, both to make the new build aggregations cheap. Neither does. Both are **non-sparse**, and every query that would use them filters on `$exists: true` — which a non-sparse index cannot narrow, because a missing field is indexed as `null` and sits inside the bounds. They pay write amplification for zero read benefit.
      _Fix:_ Declare both as partial indexes with **new names** (mongoose cannot alter an index in place — `createIndex` with changed options throws `IndexOptionsConflict` code 85 and would silently never build):
      `PromoAnalyticsVisitSchema.index({ builtPrizeSlug: 1, timestamp: -1 }, { name: "builtPrizeSlug_ts_partial", partialFilterExpression: { builtPrizeSlug: { $exists: true } } });`
      `UserSchema.index({ "signupAttribution.builtPrizeSlug": 1, createdAt: 1 }, { name: "signupBuiltPrize_createdAt_partial", partialFilterExpression: { "signupAttribution.builtPrizeSlug": { $exists: true } } });`
      Then drop the two superseded indexes in a `scripts/migrations/` one-off, and re-run the explain asserting `totalDocsExamined` equals the number of rows carrying the field.
      _Raised by:_ Reviewer E — `.explain("executionStats")` on both collections; **independently re-measured by the controller** (see F-020's table). The `User` one is worse than useless: the planner correctly rejects it, and forcing it examines 128 keys vs `createdAt_-1`'s 127.
      _Do F-020 first_ (remove the hints) — this is the follow-up that delivers what F-003 originally wanted. **P2 not P1** because at current volume (764 docs / 1.1 MB) a full scan is negligible; this is the fix to make before the collection grows an order of magnitude.
      _Shot:_ code-only  _Handled:_ —

- [ ] **F-027** · P2 · Bug · `src/repositories/PromoAnalyticsRepository.ts:155-160` — **A build reported today can rewrite an older day's visit row, changing numbers that were already reported.**
      _What:_ A visitor built `makita-kincrome` on Monday. They return Friday; Friday's visit beacon is lost (rate-limited per F-024, a dedup race, a failed request). They build `cash-prize`. The build beacon finds no Friday row, so `findOneAndUpdate` sorted `timestamp: -1` lands on **Monday's** row and overwrites its build and both counters. Re-running a Monday report after Friday returns different numbers.
      _Where:_ the match has no time predicate — `{ anonymousId: args.anonymousId, slug: args.slug.toLowerCase().trim(), pageType: args.pageType }`
      _Fix:_ Spec §6.1 explicitly bounds this to "the most recent visit … **within the session window**". Declare `const VISIT_BUILD_SESSION_WINDOW_MS = 30 * 60 * 1000;` beside `updateVisitBuild` and add `timestamp: { $gte: new Date(Date.now() - VISIT_BUILD_SESSION_WINDOW_MS) }` to the filter. The existing `{ anonymousId: 1, timestamp: -1 }` index serves this match. Add a case to `src/utils/promo-analytics/__tests__/record-prize-build.test.ts` asserting a stale-row match returns `no_visit_row`.
      _Raised by:_ Reviewer F. Probability rises if F-024 is left unfixed.
      _Shot:_ code-only  _Handled:_ —

- [ ] **F-028** · P2 · Arch · `src/utils/partner-discounts/sso-flow.ts:74-82` — **When the partner portal is slow the member gets a raw gateway error, and the failure is never recorded.**
      _What:_ A member taps "Open partner portal" while iGoDirect is degraded. `generatePortalSso` takes `resilientFetch`'s defaults — 3 attempts × 5s plus backoff ≈ **15.9s** — but the route's Vercel budget is **10s**. The lambda is killed mid-flight: the member sees a platform 504 instead of the crafted `PARTNER_SSO_ERRORS.providerDown` copy, and `logSsoIssuance` (the line after the call) never runs, so the `PartnerDiscountSsoIssuance` audit trail is blank for exactly the incidents ops would investigate.
      _Where:_ `{ label: "igodirect-generatetoken" }` — no `timeoutMs`, no `retries`.
      _Fix:_ Bound the vendor call to fit the budget — pass `{ label: "igodirect-generatetoken", timeoutMs: 2_500, retries: 1 }` (worst case ≈ 5.4s, leaving headroom for the Mongo work and the audit write). Record the timing contract in `docs/partner/igodirect-integration-playbook.md`.
      _Raised by:_ Reviewer E. _Evidence:_ `src/lib/http/outbound.ts:137` defaults (`timeoutMs = 5_000, retries = 2`) and `:165` backoff; `vercel.json:113` `"src/app/api/**/route.ts": { "maxDuration": 10 }` is the only rule matching this route (all 38 `functions` keys checked). Inherited from the igodirect work, but this branch is what ships the hand-off to customers.
      _Shot:_ code-only  _Handled:_ —

- [ ] **F-029** · P2 · Arch · `src/utils/security/rateLimiter.ts:38-71` — **The rate limiter now guarding the two busiest public routes never forgets anyone.**
      _What:_ Counters live in a `globalThis` Map keyed by client identifier, and nothing ever removes an entry — expired windows are only overwritten if that same identifier returns. A warm Vercel instance serving an ad burst retains one entry per unique visitor IP, forever, across two buckets. This branch is what put that structure on the two hottest public routes; the pre-existing callers are all low-volume.
      _Where:_ the only three writes to `bucket` are `set`, never `delete` — `bucket.set(identifier, { hits: 1, resetAt: now + options.windowMs });`
      _Fix:_ Add opportunistic eviction inside `check()`, immediately before the return paths: `if (bucket.size > 5_000) { for (const [k, v] of bucket) if (v.resetAt <= now) bucket.delete(k); }`. Do **not** swap these routes to `createDistributedRateLimiter` — its awaited Mongo round-trip on the request path is the 504 failure mode the `after()` design was introduced to eliminate.
      _Raised by:_ Reviewer E. _Evidence:_ whole module read — no sweep, no TTL, no size cap; `grep -rn "__rateLimiterStore" src/` returns only these lines.
      _Shot:_ code-only  _Handled:_ —

- [ ] **F-030** · P2 · UX · `src/components/admin/PromoAnalyticsManagement.tsx:654` (columns at `:682`, `:727`) — **On a 1280px screen the admin's new "Switched away %" column is off-screen with no scrollbar to hint at it.**
      _What:_ An ops person opens promo analytics at 1280 to read the metric this branch shipped. The funnel table ends at "V→S %" with the header clipped mid-column; "S→C %", "Conv %" and "Switched away % of builds" sit behind a horizontal scroll with no resting scrollbar. They will not see the number unless they think to drag sideways.
      _Where:_ `<div className="overflow-x-auto">` wrapping a table that no longer fits.
      _Fix:_ Push the three generic rate columns to `xl` so the build columns fit at 1280. Change `hidden md:table-cell` → `hidden xl:table-cell` on the `S→C %` `<th>` at `:721`, the `Conv %` `<th>` at `:724`, and their `<td>`s at `:801` and `:802`; add `hidden xl:table-cell` to the `Cross-visits` `<th>` at `:673` and its `<td>` at `:771`.
      _Raised by:_ Reviewer B — **measured**: table 1137.1px inside a 940px container → **197.1px hidden**. Subtracting only the two columns this branch added (134.0 + 87.1 = 221.1px) leaves 916.0px, which fits with 24px to spare — i.e. **the table fitted before this change and does not now**, and the branch's own headline metric is the first thing pushed out. Measured fix: 1137.1 − 58.7 − 59.4 − 88.0 = **931.0px ≤ 940px**.
      _Shot:_ `<scratchpad>/f-admin-perf-cut-1280.webp`  _Handled:_ —

- [ ] **F-031** · P2 · UX · `src/components/admin/PromoAnalyticsManagement.tsx:786` — **The most-built prize is cut to about eleven characters at every screen width, including a 1600px one.**
      _What:_ The Builds cell shows `Top: GearWrench 28…`. An admin cannot tell which combination that is without hovering — which is exactly what F-005 was filed to remove. The "By Built Prize" table three sections below prints the *same* labels in full over two lines, so the page contradicts itself on one screen.
      _Where:_ `<span className="block truncate text-[10px] … max-w-[110px] ml-auto">Top: {getPrizeLabel(row.topBuiltPrize) ?? row.topBuiltPrize}</span>`
      _Fix:_ Width-gate the clamp instead of applying it unconditionally — replace the className with `"block truncate text-[10px] font-sans text-gray-500 dark:text-neutral-400 max-w-[110px] ml-auto md:max-w-[180px] md:whitespace-normal md:line-clamp-2"`, the pattern already used at `src/components/admin/spend-by-url/SpendByUrlAdBreakdownTable.tsx:302`. 180px × 2 lines = 360px, above the 351px longest measured label.
      _Raised by:_ Reviewer B — **measured at 390, 1280 and 1600**: `clientWidth` 110px at all three, against `scrollWidth` **335 / 351 / 297px**. At 1600 the table has 1260px and no horizontal scroll at all and the clamp still bites.
      _Consequence of closed F-011's fix_ — its unconditional `max-w-[110px]` traded the mobile row-height blowup for permanent truncation everywhere. F-011 was ticked without visual re-confirmation (no admin session at the time); this round had one.
      _Shot:_ `<scratchpad>/f-admin-topbuilt-trunc.webp` vs `<scratchpad>/f-admin-builtprize-readable.webp`  _Handled:_ —

- [ ] **F-032** · P2 · UX · `src/utils/partner-discounts/portal-return.ts:312-318` — **A top-tier member returning from the partner portal is told to upgrade to unlock more, when they already have all of it.**
      _What:_ A Boss subscriber bounces back to `/membership?utm_campaign=rewards-return` and reads *"You're at 100% of the partner catalogue. Upgrade your membership or grab a one-time pack to unlock more of the 1,833 offers."* There is no tier above Boss and 100% **is** the whole catalogue. The only button is "See packages", which scrolls them to the tier chooser they already topped out. The highest-paying customer gets a nonsense upsell and no way back to the portal they just came from.
      _Where:_ the final fallback `return { headline: "Back from the partner portal?", sub: `You're at ${partnerAccessPct}% … unlock more of the ${total} offers.`, cta: { kind: "scroll", label: "See packages" } }`
      _Fix:_ Insert a top-of-ladder branch immediately **before** that final `return`, mirroring the covered state's flag handling: `if (partnerAccessPct >= 100) { return { headline: "You're set — the whole partner catalogue is open.", sub: ssoEnabled ? `All ${total} offers are unlocked on your account. Head back to the portal to redeem one.` : `All ${total} offers are unlocked on your account. Head back to the partner portal tab you came from to redeem one.`, cta: ssoEnabled ? { kind: "sso" } : null, showLoginHint: false }; }`
      _Raised by:_ Reviewer C. _Evidence:_ `PARTNER_CATALOG_TIER_COUNTS[100] === 1833 === PARTNER_CATALOG_TOTAL`; `PARTNER_CATALOG_LADDER_PCTS` tops out at 100. `portal-return.test.ts:268-271` only exercises this branch at `partnerAccessPct: 50`, which is why it reads fine in the suite. **Not rendered** — confirm by loading the page as a Boss member before ticking.
      _Shot:_ code-only  _Handled:_ —

- [ ] **F-033** · P2 · UX · `src/app/(site)/purchase-success/components/PurchaseSuccessClient.tsx:123-136` — **A first-time buyer is one unexplained grey button away from being sent to a third-party site.**
      _What:_ Someone buys their first one-time pack and lands on "Purchase Successful!". Below it sit three buttons, of which "Open partner portal" is visually identical to "Continue Shopping" — no icon, no sub-line. Nothing on the page has ever used the phrase "partner portal"; the "What's Next?" list below talks only about email, entries and My Account. Clicking it does a full same-tab navigation off toolsaustralia.com.au. Every *other* place this branch renders the same action explains it — only the buyer who has never seen any of it gets it bare.
      _Where:_ `<button type="button" onClick={() => sso.mutate()} … className="… bg-gray-200 text-gray-900 …">{sso.isPending ? "Opening…" : "Open partner portal"}</button>`
      _Fix:_ Import `ExternalLink` from `lucide-react`, add `gap-2` to the button className and `<ExternalLink className="w-4 h-4" />` after the label, then add a sibling paragraph below the button row: `<p className="text-sm text-gray-600 text-center">Your pack includes partner discounts. The partner portal is where you browse and redeem them — it opens on our partner&apos;s site and signs you in automatically.</p>`, gated on the same `showPartnerPortalCta`.
      _Raised by:_ Reviewer C. **Not rendered** — the CTA is gated on `status?.processed === true`, which needs a real `payment_intent`.
      _Shot:_ code-only  _Handled:_ —

- [ ] **F-034** · P2 · Eng (rule 5c) · `src/services/support-chat/systemPrompt.ts:75-78` — **Cobber cannot tell a member where the partner portal is.**
      _What:_ A member asks "where do I open the partner portal?" The ACCOUNT SELF-SERVICE MAP — the section that exists precisely to answer "where is my…" — contains **zero** mentions of the portal. This branch adds four customer entry points to it, two of them under `/my-account`. The member's answer depends entirely on FAQ retrieval landing on FAQ 16, whose *question* is "What partner discounts do members get?" — a different question.
      _Fix:_ Insert this bullet directly above the "If the member appears logged out" line: `• "Where do I open the partner portal / how do I use my partner discounts?" → the "Open partner portal" button on [My Account → Rewards](/my-account/rewards); active members also get a "Partner portal" chip at the top of the [My Account](/my-account) dashboard. They're signed in automatically and each offer shows its own redemption steps in the portal. You cannot see which offers they can reach — never name a percentage or a specific offer.`
      _Raised by:_ Reviewer C. _Verified:_ `grep -i portal src/services/support-chat/systemPrompt.ts` returns nothing. The **FAQ corpus itself is current** (FAQ 72 added, count assertion bumped deliberately) — this is the systemPrompt half only.
      _Shot:_ code-only  _Handled:_ —

- [ ] **F-035** · P2 · A11y · `src/components/sections/membership/MembershipPortalReturnBanner.tsx:192-202` — **The "Log in to check your access" link is a 15-pixel-tall tap target directly above the purchase button.**
      _What:_ A signed-out visitor arrives from the partner portal on a phone, recognises they already have an account, and reaches for the log-in link sitting above a 44px primary button. The link's hit area is 15px tall, so thumbs land on the red "Unlock with the …" purchase call to action instead — the most expensive possible mis-tap on this page.
      _Where:_ `<Link href="/login" className="font-bold text-white underline underline-offset-4 hover:text-[#ff6b6b]">Log in to check your access</Link>`
      _Fix:_ Apply the trick already proven on the sibling link at `:226` — change the `Link` className at `:197` to `"-my-1.5 inline-block py-[15px] font-bold text-white underline underline-offset-4 hover:text-[#ff6b6b]"` (15px line + 30px padding = 45px hit area, visual rhythm unchanged).
      _Raised by:_ Reviewer B — **measured** `getBoundingClientRect()`: **163.8 × 15.0px** at both 390 and 1280. The "See all packages" link 25 lines below is 340 × 44.0px because igodirect F-012's `-my-1 py-[13px]` was applied there and not here.
      _Shot:_ `<scratchpad>/f-loginhint-390.webp`  _Handled:_ —

- [ ] **F-036** · P2 · A11y · `src/components/sections/dashboard/DashboardHero.tsx:107-114` — **The dashboard's only route to the partner portal is a 31-pixel-tall chip.**
      _What:_ An active member opens `/my-account` on a phone to reach their partner discounts. The gold "Partner portal" chip in the hero is the sole entry point, it is 31px tall — under the 44px touch minimum — and it sits on a busy gradient next to a similar-looking non-interactive tier badge.
      _Where:_ `className="inline-flex items-center gap-1.5 rounded-full px-[11px] py-[7px] text-[10px] font-extrabold …"`
      _Fix:_ At `:110` replace `px-[11px] py-[7px]` with `min-h-[44px] px-3.5 py-[7px]`. The sibling `TRADIE` badge at `:134` is a non-interactive `<span>` and needs no change.
      _Raised by:_ Reviewer B — **measured 130.0 × 31.0px** at both 390 and 1280. This branch renamed the handler and the label on `:109` and `:113`.
      _Shot:_ `<scratchpad>/f-hero-chip-390.webp`  _Handled:_ —

- [ ] **F-037** · P2 · UX · `src/components/admin/PromoAnalyticsManagement.tsx:864-866` and `:950-952` — **Two new admin tables have a percentage column whose name matches no column on screen.**
      _What:_ A staffer scrolls to the new "By Built Prize" and "By Toolbox" tables. The visible column names are **Builders**, **Registrations**, **Conversions**, **Revenue** — then a column headed `B→S %`. There is no "S" anywhere in that header row, and every other new column in the same `<tr>` carries a `title` explaining itself. This one has neither a tooltip nor a decodable name.
      _Where:_ `<th className="text-right p-3 font-semibold …">B→S %</th>`
      _Fix:_ At both locations replace with `<th className="hidden md:table-cell text-right p-3 font-semibold text-gray-800 dark:text-neutral-100" title="Share of builders who went on to create an account">Builder→Reg %</th>`
      _Raised by:_ Reviewer C. `V→S %` / `S→C %` share the defect but are pre-existing; `B→S %` is introduced by this branch, in two places.
      _Shot:_ code-only  _Handled:_ —

- [x] **F-038** · P2 · Test · `src/app/api/auth/register/route.ts:213-271` — **The function deciding whether a signup's prize build is saved at all has no test, and it is the merge's only real conflict.**
      _What:_ Nothing is wrong today — all four call sites pass all four arguments in the right order. But `buildSignupAttribution` is 60 lines of attribution logic inside `route.ts`, it is the single gate deciding whether `builtPrizeSlug` ever reaches the database, and it cannot be tested where it lives because it is not exported. Two branches each added a third parameter to it; nothing in CI would have caught getting that wrong.
      _Where:_ `function buildSignupAttribution(promotionSlug?, attribution?, builtPrizeSlug?, clickPlatform?)` … `if (!hasPromo && !hasAttribution && !clickPlatform) return undefined;`
      _Fix:_ Move `buildSignupAttribution` and `resolveSignupClickPlatform` into `src/services/attribution/signup-attribution.ts` as named exports (keeping both names character-for-character — `src/services/attribution/**` already exists and owns this concept), import them in `route.ts`, and add `src/services/attribution/__tests__/signup-attribution.test.ts` wired as `"test:signup-attribution"`. Assert: promo-only → persists; UTM-only → persists; click-platform-only → persists, `builtPrizeSlug` undefined; none of the three → `undefined`; a valid `builtPrizeSlug` **alone** → `undefined`; an invalid `builtPrizeSlug` beside a valid promo → promo persists and build is dropped; `"RYOBI-Kincrome  "` → `"ryobi-kincrome"`; and an **argument-position guard** passing all four distinct values at once, asserting each lands on its own key — the one assertion that catches the merge hazard.
      _Raised by:_ Reviewers A, D **and** E (three-way convergence). _Verified:_ `grep -rn "buildSignupAttribution"` returns only the four call sites plus two doc references — no test file. Also satisfies CLAUDE.md's "no business logic in route handlers".
      _Do this together with **F-019**_, which is a defect in the same function's callers.
      _Shot:_ code-only  _Handled:_ —

- [ ] **F-039** · P2 · Test · `e2e/specs/marketing/prize-build-url-params.spec.ts:63` — **The prize-build spec proves the browser sent the beacon, never that the server stored it.**
      _What:_ A regression making `/api/tracking/promo-prize-build` reject every request — rate-limit exhaustion, a Zod tightening, a broken cookie — leaves the whole suite green, because the assertions read the outgoing POST body from the Playwright request listener and never look at the response status or the resulting row. The feature's only durable write is unverified end to end.
      _Where:_ `page.on("request", (request) => { … const body = request.postData(); if (body) seen.push(JSON.parse(body) as BuildBeacon); });`
      _Fix:_ Extend the existing "three rapid switches" test: (a) have `captureBuildBeacons` also record `(await request.response())?.status()` and assert `expect(statuses).toEqual([200])`; (b) read the row directly from `E2E_MONGODB_URI` — the established in-repo pattern, see `e2e/specs/marketing/promo-theme-split.spec.ts` — and assert `findOne({ anonymousId, slug: "makita", pageType: "toolset" })` yields one document with `builtPrizeSlug === "makita-gearwrench"`, `toolboxSwitches === 3`, `toolsetSwitches === 0`, plus `countDocuments({ anonymousId })` unchanged (proving `upsert: false`).
      _Raised by:_ Reviewer D — **demonstrated**: 26 sequential POSTs returned `{"200":20,"429":6}` and every current assertion would still have passed.
      _Shot:_ code-only  _Handled:_ —

- [ ] **F-040** · P2 · Test · `src/hooks/usePrizeBuildTracking.ts:78` — **Two rows of the spec's own acceptance matrix shipped with no automated guard.**
      _What:_ B3 ("switch toolset, then refresh → reopens on the same build") and B6 ("land and touch nothing → URL stays clean") were hand-verified once. B6 guards a data-integrity rule: an untouched visitor must produce **no** build beacon, or the "41% never touch the reels" metric the spec promises becomes unmeasurable.
      _Fix:_ Two tests in the existing describe block of `e2e/specs/marketing/prize-build-url-params.spec.ts` — **B6:** `await openShowcase(page); await settleAtShowcase(page); await page.waitForTimeout(2500);` then `expect(beacons).toHaveLength(0)` and `expect(new URL(page.url()).search).toBe("")`. **B3:** click the Ryobi toolset radio, wait for `toolset=ryobi` in the URL, `await page.reload()`, then `await expect(toolsetLane(page).getByRole("radio", { checked: true })).toHaveAccessibleName(/ryobi/i)`.
      _Raised by:_ Reviewer D. B1/B4/B5/B8 + the debounce are covered; B7 is covered at unit level.
      _Interaction:_ if **F-018** is fixed, B6's expected beacon count becomes 1, not 0 — write this test *after* F-018 and assert `toolboxSwitches: 0, toolsetSwitches: 0`.
      _Shot:_ code-only  _Handled:_ —

- [ ] **F-041** · P2 · Test · `src/lib/internal-norm/schemas/promo-analytics.ts:46` — **The Norm smoke test passes without validating any of the new schema branches.**
      _What:_ `npm run norm:smoke` returns 200 for the changed endpoint, but the database had no builds, so `byBuiltPrize` was `[]` and every `buildDistribution` was `[]`. `BuiltPrizeMetricsSchema` — seven new fields — was never exercised. A field-name mismatch between the repository and the Zod projection is a runtime 500 in production that this smoke reports as green.
      _Fix:_ Add a `NormPromoAnalyticsSummarySchema` round-trip case to `src/repositories/__tests__/PromoAnalyticsRepository-aggregation.test.ts` (which already stubs `Model.aggregate`). Feed a stub returning one build row, one signup row and one conversion row, then assert `NormPromoAnalyticsSummarySchema.parse({ … })` on the exact object the route builds at `src/app/api/internal/norm/v1/promo-analytics/route.ts:41-50` does not throw. That converts the runtime-500 class into a CI failure.
      _Raised by:_ Reviewer D. _Evidence:_ the real run returned `"byBuiltPrize":[]` with every `builds:0`, `topBuiltPrize:null`, `buildDistribution:[]` across all 26 pages.
      _Shot:_ code-only  _Handled:_ —

- [ ] **F-042** · P2 · Test · `src/utils/payment/payment-processing.ts:423` — **The purchase leg drops the built prize whenever the promo slug is missing, and neither side of that nesting is tested.**
      _What:_ `byBuiltPrize[].conversions` and `.revenue` come only from `PaymentEvent.data.builtPrizeSlug`, which is written **inside** the `promotionSlug` branch. A user whose attribution carries a build but no promo slug (server-side reachable) appears in `signups` but never in `conversions`, so the dashboard reports a 0% conversion rate for a build that converted.
      _Where:_ `if (signupAttr?.promotionSlug) { … if (signupAttr.builtPrizeSlug) { attributionData.builtPrizeSlug = signupAttr.builtPrizeSlug; } }`
      _Fix:_ Extract the block into an exported pure `buildPromoAttributionFields(signupAttr)` and add `src/utils/payment/__tests__/promo-attribution-fields.test.ts` as `"test:promo-attribution-fields"`. Assert: both keys present when both are set; **the intended outcome when `builtPrizeSlug` is set without `promotionSlug`** — so the current drop is either pinned as deliberate or fixed; `builtPrizeSlug` **absent, not `undefined`-valued**, when no build (a literal `undefined` on a Mongo `$set` writes the key); `{}` for undefined input.
      _Raised by:_ Reviewer D. _Verified:_ no test file references both `payment-processing` and `builtPrizeSlug`.
      _Shot:_ code-only  _Handled:_ —

- [ ] **F-043** · P2 · Doc · `docs/superpowers/specs/2026-07-27-prize-build-url-params-design.md:332` — **The spec's risk table says a `<Suspense>` boundary handles the prerender risk. That boundary was deliberately deleted.**
      _What:_ The next person to extend this feature reads §11 — the one place risks are enumerated — sees the prerender risk marked handled by an existing boundary, reaches for `useSearchParams()`, and either breaks the build or re-ships the measured CLS 0.4352 regression. §4 of the same document carries the correction; §11 was never updated to match.
      _Where:_ `| Prerender / CSP R8 | Existing `<Suspense>` boundary already covers `useSearchParams`. |`
      _Fix:_ Replace that row's Handling cell with: ``No `<Suspense>` boundary and no `useSearchParams()` — every query read goes to `window.location.search` inside an effect (`PrizeShowcase.tsx:58-69`). Re-introducing the hook fails the build on `/`. See §4.`` and append the same `Corrected` marker §4's note already uses.
      _Raised by:_ Reviewer F. Contradicted by `:161-170` of the same file and by the comment at `PrizeShowcase.tsx:497-502`.
      _Shot:_ code-only  _Handled:_ —

- [ ] **F-044** · P2 · Bug (latent) · `src/components/sections/promo/prize-selection/utils.ts:105-109` + `src/app/api/auth/register/route.ts:248` — **The visit row records the catalog-resolved prize; the signup row records the raw composition, so a new toolbox brand would silently blank the signup field.**
      _What:_ Spec decision 6 says record the **resolved** `activeSlug`, never the requested one. The visit path does. The signup path composes `${toolset}-${toolbox}` and, if that combination has no catalog entry, `isValidPromoSlug` rejects it and the key is dropped entirely — where the card would have fallen back to the page default. Add a 5th toolbox to `TOOLBOXES` before its five `prize-summaries` entries exist and signups for it vanish. GearWrench in draw 9 is the precedent; `utils.ts:19-32` documents that exact fork.
      _Fix:_ In `buildSignupAttribution`, when `builtPrizeSlug` is present but fails `isValidPromoSlug` **and** `promotionSlug` is valid, substitute the page's own default — `isToolsetLandingSlug(promotionSlug) ? getDefaultPrizeForToolsetSlug(promotionSlug) : promotionSlug` — instead of omitting the field. Keep the omit branch for when `promotionSlug` is itself absent or invalid.
      _Raised by:_ Reviewer F. **Currently latent** — all 20 combinations plus `cash-prize` exist in `src/config/prize-summaries.ts`.
      _Shot:_ code-only  _Handled:_ —

- [ ] **F-045** · P2 · Product · `src/components/admin/PromoAnalyticsManagement.tsx:150-157` — **The spec asks what % of Makita *landers* switched away; the dashboard answers what % of *recorded builds* weren't the default.**
      _What:_ Spec §7's headline example is *"62% of Makita landers switch the toolset away from Makita."* The column gives a share of build **records**, deduped by neither visitor nor page load. Getting to the visitor-level number would mean applying `builds ÷ visits` to it, mixing a unique-visitor count with a record-based ratio — precisely the unit mix F-013 banned. So the spec's question is not answerable off the screen.
      _Fix:_ Compute the visitor-deduped figure server-side where the visitor sets already exist. In `getAggregatedByPage`, while building `buildVisitorIds` (`PromoAnalyticsRepository.ts:258-266`) also accumulate a second `Map` holding only visitor ids from groups whose `_id.builtPrizeSlug` differs from that page's default. Add `switchedAwayBuilders: number` to `PromoPageMetrics` and set it from that map's `.size`. Render `switchedAwayBuilders / builds` as a column labelled `Switched away % of builders` **alongside** the existing per-build column, and mirror both into the Norm schema per rule 10.
      _Raised by:_ Reviewer F, who **changed this verdict from MET to PARTIAL**. This is a correct-but-narrowing side effect of F-013's fix, not a regression — F-013 had to be fixed, and this is the question it stopped answering.
      _Shot:_ code-only  _Handled:_ —

- [ ] **F-046** · P2 · Tooling · `scripts/internal-norm-smoke.ts:17` — **`npm run norm:smoke` silently builds a garbage URL when run from Git Bash.**
      _What:_ CLAUDE.md rule 10 names this script as *the* way to verify a Norm change. Passing a path argument from Git Bash triggers MSYS path conversion, and the script crashes before making a request — so a developer following the rule gets an opaque `Invalid URL`, or falls back to the argument-less default (`/health`) which never touches the endpoint they changed.
      _Where:_ `const url = new URL(base + pathArg);`
      _Fix:_ Normalise before constructing the URL — `const pathArg = (process.argv[3] || "/api/internal/norm/v1/health").replace(/^.*?(\/api\/internal\/norm\/)/, "$1");` — and throw a named error if the result does not start with `/api/internal/norm/v1/`. Add `MSYS_NO_PATHCONV=1 npm run norm:smoke -- GET /api/internal/norm/v1/<route>` to `docs/internal-norm/README.md` as the Git Bash form.
      _Raised by:_ Reviewer D. _Evidence:_ the failure is `input: 'http://localhost:3799C:/Program Files/Git/api/internal/norm/v1/health'`. The same command under PowerShell returns `200 OK`.
      _Shot:_ code-only  _Handled:_ —

- [ ] **F-047** · P2 · Eng · `CLAUDE.md` Domain Manifest — **Seven manifest globs point at files that no longer exist.**
      _What:_ The manifest is the source of truth for the doc-sync hook, and it claims coverage of seven paths that are absent from disk: `src/utils/utm/**`, `src/models/MetaAdDestination.ts`, `src/app/api/facebook/**`, `src/schemas/metrics/**`, `src/components/theme/**`, `src/app/test-pixels/**`, `scripts/embed-chat-knowledge.ts`. A reader trusting the manifest believes those domains cover code that isn't there, and the entries are dead weight that makes real drift harder to spot.
      _Fix:_ Delete those seven strings from their domains' `paths` arrays (`tracking` ×3, `metrics-analytics`, `theme`, `dev-tooling`, `support-chat`). If a path was renamed rather than deleted, point it at the new location instead of removing it — check `git log --diff-filter=D` for each before deleting.
      _Raised by:_ controller, via an independent audit using the hook's own `readManifest` + `findDomain`. **All seven are inherited from `origin/main`** (`git show origin/main:CLAUDE.md` contains each), so this is **not** merge damage. Recorded because the same audit is what proved the merge did *not* drop anything.
      _Related, and deliberately not filed:_ the same audit found **61 orphan source files** repo-wide that no domain covers, and **80 files covered by two domains**. Both are long-standing structural facts about the manifest, not this branch's doing, and fixing them is a separate piece of work.
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

### Round 2 re-grade (2026-07-29, `24a46f13`) — three verdicts moved

Reviewer F re-derived every verdict by grepping the merged tree rather than trusting the table above.
**B1–B8 all still MET** and are now guarded by `e2e/specs/marketing/prize-build-url-params.spec.ts`.
§3 decisions 1–8, §5 and §6 hold. Three changes:

| Requirement | Round 1 | Round 2 | Why |
|---|---|---|---|
| **Q4** conversion by toolbox brand | PARTIAL | **MET** | F-006 closed — client-side rollup, `fromPrizeSlug`-validated, cash excluded, rates recomputed from summed totals |
| **Q2** switch-away % per page | MET | **PARTIAL** | answers "% of recorded builds", not the spec's "% of *landers*" — a correct-but-narrowing side effect of F-013's fix → **F-045** |
| **Q5** genuine rate per built combination | MET | **PARTIAL** | `builders` and `signups` are counted over different populations → **F-018** |
| §5 "always the resolved activeSlug" | — | **PARTIAL** | spec §5 and §6.1 contradict each other; the code follows §6.1 on the visit side and §5 on the signup side → **F-018** |
| §6.1 "within the **session window**" | — | **MISSING** | the match has no time bound → **F-027** |

**§7 "Explicitly unchanged" (the regression bar) — graded for the first time this round**, because the
merge is exactly the event that could have broken it:

| Item | Verdict |
|---|---|
| Ad-spend matching in `PrizePerformanceCard` | **MET** — file byte-identical to `origin/main`; sources `useSpendByUrlAnalytics`, never promo-analytics |
| A/B assignment, server-side per landing slug | **MET** — posts a constant `PROMO_THEME_SLUG`; `src/services/ab-testing/**` untouched by this branch |
| Klaviyo `Viewed Giveaway` once per route | **MET** — deps are `promo.id/slug`, `pathname`, session; `replaceState` does not move `usePathname()` |
| Non-promo surfaces + `localStorage` toolbox preference | **MET** — `isPromoPage` gates both the URL write and the beacon |
| Visit / signup / revenue **row counts** + landing identity | **PARTIAL** — never *inflated* (`upsert:false`, and `builtPrizeSlug` is not an attribution trigger), but the new per-IP cap can *suppress* genuine rows → **F-024** |

**Scope check, reverse direction — clean.** This branch's 14 non-merge commits map 1:1 to a spec phase
or a recorded panel finding. Everything else in the 104 files (the 1,850-row partner CSV,
`MembershipPortalReturnBanner`, `no-models-in-client.js`, GearWrench/draw-9 assets, `queryKeys.ts`)
arrived through the staging or main merges. No unrelated churn was invented here.

**igodirect rewards-return** was **not** re-graded — it has its own panel doc (49 closed / 1 open) and
was checked only for survival across the merge. It survives: file sets are disjoint, both flag twins
are registered in `.env.example`, the playbook is current, its three suites are wired. Its one
merge-induced issue (the `/membership` hydration mismatch possibly triggered by the banner rendering
upstream of `Carousel3D`) is already recorded as **F-017** and was not duplicated.

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

## Not verified — Round 2 (2026-07-29)

- **`npm run e2e:purchase` — RAN, and it FAILED. Root-caused as environmental, not a branch
  regression.** Result: **5 failed, 1 skipped, 3 passed**, and
  `chromium-desktop=FAIL, mobile-chrome=FAIL, mobile-safari=FAIL` — all three legs.
  **The exit code was 0, which is misleading; read the summary lines, not `$?`.**
  - **No assertion failed.** Every one of the 10 artifacts fails on a timeout (`No active
    membership + entries … within 180s (webhook not processed?)`, `page.goto: Timeout`) or on the
    QA-watchdog fixture collecting console noise. There are **zero** `Expected:`/`Received:` diffs,
    **no double-grant, and no wrong entry count** — so nothing in the money path is disproven.
  - **Mechanism:** dev-server saturation. `stripe-listen.log` shows 622× `Failed to POST … context
    deadline exceeded`, and `server.log` shows the server receiving `payload: ''` — the webhook body
    never arrived, so grants never happened and the DB polls timed out. Counts per leg:
    chromium-desktop 2608 empty-payload failures, mobile-chrome 1284, mobile-safari 1513.
  - **The CSP `style-src` noise is not ours.** `next.config.ts:23-26` and `src/middleware.ts:135`
    only emit security headers when `NODE_ENV === "production"`, and the repo never emits
    `Content-Security-Policy-Report-Only` at all — the `[Report Only]` lines come from Stripe's
    payment iframe. `access control checks` is WebKit's wording for a nav-cancelled fetch, already
    documented at `prize-build-url-params.spec.ts:295`. F-015 explains the 2 `/api/major-draw` 404s
    and F-016 the 32 `spend-by-url` 500s.
  - **There is no green baseline to regress from** — `e2e:purchase` had never been run on this
    branch, so "it used to pass" cannot be claimed either way.
  - **Two harness defects this surfaced** (both worth fixing, neither a product bug): (1)
    `e2e/run.ts:97` fires three `playwright test` invocations into ONE `outputDir` with only
    `list`+`html` reporters, so **each leg overwrites the previous** — the chromium-desktop and
    mobile-chrome per-test detail is unrecoverable. Add a per-project JSON reporter. (2) the
    branch-added `await page.waitForURL(/\/purchase-success/, { timeout: 60_000 })` at
    `e2e/specs/membership/purchase-one-time.spec.ts:62` is the only `waitForURL` in that spec and
    sits *after* the DB assertions, so it fails when the POST times out client-side despite
    succeeding server-side. Give it the same tolerance the DB polls use.
  - **Still unproven:** whether `e2e:purchase` can pass on this machine at all (all three legs share
    one Turbopack dev server with `fullyParallel: true`), and therefore whether
    `PaymentEvent.data.builtPrizeSlug` is correct end to end. **F-019 changed this exact path**, so
    re-run this suite — with concurrency capped — before `origin/main`.
- **`PaymentEvent.data.builtPrizeSlug` end to end** remains statically reviewed only unless the
  purchase run above covers it. The Stripe connector is unauthenticated in this environment.
- **The `builtPrizeSlug_1_timestamp_-1` index in production.** The explain numbers in **F-020** /
  **F-021** are from the dev DB (764 docs, 8 carrying the field). The *plan shape* — a full-window
  scan because a non-sparse index cannot narrow `$exists` — is volume-independent, but the absolute
  cost at production scale is unmeasured, and whether the index exists in production is unverified.
- **F-032 (100% member upsell) and F-033 (purchase-success CTA) were never rendered.** F-032 needs a
  Boss-tier account; F-033's button is gated on a real `payment_intent`. Both traced from source.
- **Boss-tier contrast in F-023 was computed, not sampled** (~3.9:1) — the seeded member is Tradie.
- **The SSO error paths never rendered** — the seeded environment's SSO calls did not error, so the
  inline `role="alert"` copy on the banner, the Rewards card and the my-account toast are unexercised.
- **`norm:smoke` passed but vacuously** for the new fields — the database had no build rows, so
  `byBuiltPrize` was `[]` and the seven new `BuiltPrizeMetricsSchema` fields were never validated
  against real output. That is **F-041**, and it is the residual runtime-500 risk on the Norm surface.
- **Chromium at a given width is a viewport, not a device.** Every measured UI number in Round 2 came
  from Chromium at 390 or 1280; none of it is a real-device claim.
- **Admin data was generated, not seeded** — the e2e seed carries no promo-analytics rows, so the UI
  reviewer drove seven real funnel sessions through the product path to populate the tables. Those
  writes went to the ephemeral `e2e` database only.

---

## Post-fix verification (2026-07-29) — two of my own fixes were wrong until re-measured

Both F-022 and F-023 were applied from the panel's pre-fix measurements and **not re-measured**.
Re-measuring found both incomplete, one of them actively harmful. Recorded because "applied the
stated fix" is not the same as "the problem is gone", and neither gap was visible from the diff.

### F-022 — the first floor was wrong in two of three breakpoint bands

The panel's fix line said `min-h-[333px] lg:min-h-[273px]`. Re-measured, that left:

| width | state | CLS after first fix | verdict |
|---|---|---|---|
| 390 | guest, offer 21190 | **0.2247** | needs-improvement |
| 768 | guest (band never measured) | **0.2209** | needs-improvement |

Cause, from measuring skeleton vs settled height per band rather than guessing:

| band | skeleton | tallest settled | direction |
|---|---|---|---|
| <768 | 333px | **361.8px** (longest short-of offer copy) | GROWS |
| 768–1023 | **339px** | 333px | **SHRINKS** — the skeleton is taller than every settled state |
| 1024+ | 273px | 283.3px | GROWS |

A floor derived from the skeleton alone cannot fix the 768 band, and a single base value cannot
express it — hence a third breakpoint. Final: `min-h-[362px] md:min-h-[339px] lg:min-h-[284px]`.

**Verified after:** every band's skeleton-to-settled delta is **0.0px**, and CLS is GOOD everywhere —
guest@1280 **0.0263**, guest@390 0.035, offer@390 0.0348, 768 band 0.0437, against a *no-banner
control* of 0.0106. The hero `<h1>` moves **0px** in all six configurations. (Pre-fix: 0.5774 /
0.6134 / 0.4377.) An early 1280 reading of 0.5539 was a cold-Turbopack artifact — its shift lands at
24.9s — and disappeared once warm; noted so the number is not mistaken for a real regression.

### F-023 — the panel's fix broke the Foreman tier, and would have shipped

The fix line ("darken the gradient to `shade(c,-44) → shade(c,-60)`") was derived from the two tiers
that were failing, both of which use **white** ink. But `inkOn()` returns **dark** ink for a bright
tier, and Foreman's yellow was already passing comfortably. Applying the darkening unconditionally
puts dark ink on a dark ground:

| tier | ink | before | panel's fix as written | conditional fix (shipped) |
|---|---|---|---|---|
| Tradie | `#ffffff` | 1.85 ✗ | 5.96 ✓ | **5.96 ✓** |
| Boss | `#ffffff` | 3.89 ✗ | 10.51 ✓ | **10.51 ✓** |
| **Foreman** | `#0a0a0a` | 9.64 ✓ | **2.70 ✗ REGRESSION** | **9.64 ✓** |

Shipped version gates the darkening on `inkOn(c) === "#ffffff"`. A second, smaller defect surfaced
in the same pass: the 10px sub-label was the worst contrast on the card in **both** branches —
`rgba(255,255,255,.78)` gave 1.79:1, and even the untouched `rgba(0,0,0,.6)` dark branch only
reached **4.45:1**, just under AA. It now uses the resolved `inkOn(c)` solid in both branches; the
10px/13px size gap carries the hierarchy without discounting opacity. **All three tiers now pass AA
on both labels** (worst point of the gradient — both stops and the midpoint).

**Method caveat, stated plainly:** F-023's numbers are **computed** from the repo's own `shade()` and
`inkOn()` across all three tier colours, **not sampled from a rendered button**. The button never
rendered in the seeded environment — the `PARTNER_DISCOUNT_SSO_ENABLED` flag is on, so this is a
session/branch condition (the seeded member does not reach that CTA branch), not the launch gate.
The pre-fix 2.07:1 WAS pixel-sampled, and the computed pre-fix figure of 1.85 is within rounding of
it, which is what gives confidence in the computed post-fix figures. **Confirm visually against a
real account before relying on it** — especially Foreman, the tier this nearly broke.

### F-021 — measured proof the partial indexes actually work (2026-07-29)

`.explain("executionStats")` on both aggregations' real `$match` stages, against the dev
collections (764 visits with 8 carrying `builtPrizeSlug`; 895 users with 1):

| query | index | keys | docs | returned |
|---|---|---|---|---|
| visits, planner's own choice | `builtPrizeSlug_ts_partial` | **8** | **8** | 7 |
| visits, old plain index forced | `builtPrizeSlug_1_timestamp_-1` | 764 | 764 | 7 |
| users, planner's own choice | `signupBuiltPrize_createdAt_partial` | **1** | **1** | 1 |
| users, old plain index forced | `signupAttribution.builtPrizeSlug_1_createdAt_1` | 128 | 127 | 1 |

`totalDocsExamined` now equals the number of rows that actually carry the field, and **the planner
picks both unprompted** — which is what makes F-020's hint removal safe permanently, rather than
trading a 500 risk for a slow query.

**Two corrections to the finding, both measured:**

1. The re-declaration error is **code 86** (`An existing index has the same name as the requested
   index`), not `IndexOptionsConflict` (85) as the finding and the older `gotchas.md` text claimed.
   The *behaviour* described was right — the create fails and `autoIndex` swallows it — only the
   number was wrong. Corrected in `docs/mongodb/gotchas.md`, noting both codes.
2. **A differently-named partial index can coexist with the old non-partial one** (verified:
   created cleanly alongside it). So there is no deploy-vs-migrate ordering hazard and never a
   window with no usable index — the migration and the deploy can land in either order.

**Not done:** the `--live` drop has **not** been run; both superseded indexes are still present on
dev. Run `npm run migrate:partial-build-prize-indexes:dry` first (dry-run is the default), then
`npm run migrate:partial-build-prize-indexes`.

**Disclosed side effect:** verifying this built the two partial indexes on the **dev** database. That
is the intended end state anyway (mongoose `autoIndex` defaults to `true`, so the app creates them
on next start), but it was a real write made outside the migration and is recorded rather than
glossed over. Nothing else on dev was written.

### `e2e:purchase` re-run with `--workers=1` (2026-07-29) — the money path now passes

The investigator's diagnosis (dev-server saturation) is **confirmed by fixing it**. Capping
concurrency turned the run around:

| run | passed | failed | flaky | skipped | wall clock |
|---|---|---|---|---|---|
| default parallelism | 3 | **5** | 0 | 1 | 9.0m |
| `--workers=1` | **5** | **1** | 2 | 1 | 15.1m |

The webhook timeouts and the `payload: ''` empty bodies are **gone** — those were saturation, not
code. The four money-path specs (idempotency, one-time pack, subscription, via-showcase) now pass,
which is the end-to-end confirmation that was missing for **F-019**, since that finding changed the
register→pay→webhook path.

**The one remaining failure is not a product defect.** `webhook-replay.spec.ts` ("resending the
payment event does not double-grant") trips the QA-watchdog fixture, and all **6** collected
problems are the identical string:

```
console.error: Refused to apply a stylesheet because its hash, its nonce, or 'unsafe-inline'
does not appear in the style-src directive of the Content Security Policy.
```

**Zero assertions failed** across the whole run — no `Expected:`/`Received:` diff anywhere, no
double-grant, no wrong entry count. The CSP noise is Stripe's payment iframe: this repo emits
security headers only when `NODE_ENV === "production"` (`next.config.ts:23-26`,
`src/middleware.ts:135`) and never emits `Content-Security-Policy-Report-Only` at all, yet a
`[Report Only]` line appears.

**Fix (harness, not product):** `e2e/fixtures/test.ts:68` only exempts third-party CSP noise when
`E2E_EXTERNAL=1`, which `e2e/run.ts:177` sets solely in `runExternal()`. Extend that exemption to
local mode by matching the **origin** of the offending stylesheet rather than gating on the env
flag, so Stripe's iframe cannot fail a money-path spec. Until then `e2e:purchase` cannot go green on
this machine, and its per-project summary will keep reporting FAIL despite every assertion passing.

**Also still worth doing** (from the investigator, unchanged): `e2e/run.ts:97` fires three
`playwright test` invocations into ONE `outputDir` with only `list`+`html` reporters, so each leg
overwrites the previous and per-test detail for the first two legs is unrecoverable — add a
per-project JSON reporter.
