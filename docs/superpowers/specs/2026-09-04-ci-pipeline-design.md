# CI pipeline — design

**Date:** 2026-09-04 · **Branch:** `feature/ci-pipeline` · **Worktree:** `.worktrees/ci-pipeline/`
**Status:** awaiting sign-off · **Revision:** 2 (after a five-lens adversarial review; 50 raw findings, 36 survived verification)

---

## In plain English

We already have an automated checker. It has never worked.

Every time anyone pushes code to GitHub, a robot is supposed to check it before it goes live.
Ours was set up on 19 August, tucked inside an unrelated shop bugfix, and it has run 108 times
without passing once. Because nothing depends on it, nobody noticed it had been showing a red
cross on every branch for sixteen days.

It fails for three reasons. Two are not problems with the code. The first is a missing file:
Next.js writes a small file that teaches the type-checker — the tool that catches mismatched
code before anyone runs it — how to read `.webp` images. That file is deliberately kept out of
the repository because Next.js normally rewrites it when it builds. Our checker never builds,
so nine image imports look broken to it. The fix is one command that takes four seconds. The
second is a stale list: the checker holds a hand-written list of which test suites to skip
because they need a database. That list was written when there were 236 suites; there are now
292, and nobody updated it. The third reason is real — one test is genuinely broken, and the
checker is currently hiding a second broken one inside that skip list. Step five fixes both.

Of our 292 test suites, forty-six fail on a checking machine. Forty-three of those just need a
database and a few access keys it doesn't have. One talks to a live partner website and will
never be allowed to run automatically. The last two are the genuinely broken ones.

Separately, and more seriously: **anyone can merge anything into the live site right now.** The
`main` branch is completely unguarded — no required checks, no required approvals — and merging
into `main` publishes straight to toolsaustralia.com.au. The most recent merge went in with zero
approvals. We ship about sixteen of these a week.

**What a normal day would look like when this is done.** Say you change the wording on the
membership page and open a pull request. Four checks start automatically. Within about a minute
and a half the first reports back: the code makes sense and follows house style. Around four
minutes in, the second reports: all 289 runnable test suites pass. A third confirms that the
auto-generated lists of images and videos still match the actual files. A fourth opens a real
browser against the private preview copy of the site and reads your new wording, checking it
still says "free entries" and never "odds" or "per entry". Green across the board, and the
merge button works. Today, by contrast, you get a red cross that means nothing, and you merge
anyway.

**When it goes red.** The red mark appears on the pull request page on GitHub, next to the
Vercel ones you already see. Two kinds of red are not your fault: the browser check reads
whatever is currently deployed, so it can flag someone else's wording — a re-run after that is
fixed clears it; and adding a question to Cobber's FAQ list deliberately turns the checker red
until a counter is updated, which is a reminder, not a fault. From step five onward, a red mark
on the first three checks stops the merge button working. As the repo owner you can override
that, and whether to is your call.

The plan is five steps, each of which stands on its own. Make the checker pass. Give it a
scratch database so 43 dead suites come back — including the ones checking shop entry
arithmetic, payment retries and renewal credits. Add checks for drift nothing currently
watches. Point a browser at the preview site to defend the prize-draw wording that has a legal
permit attached. Then, and only once green is normal, make passing compulsory.

**Step four needs one answer from you first:** we do not know whether the preview copy of the
site reads from the real customer database or a test one. If it is the real one, the browser
check must only ever look, never touch. It already only looks — but that needs confirming.

One thing we are deliberately **not** doing: building the app in the checker. Vercel already
builds the entire app on every push, and that build does check the code compiles — but nothing
stops anyone merging when it fails, and it never runs a single one of our test suites. Repeating
the build would cost four minutes and a real database for no new information.

---

## 1. Problem and done

**Problem.** The repo has a CI workflow that has never passed (108 runs, 0 successes), so no
automated check gates anything. `main` is unprotected and auto-deploys to production at ~16
merges/week. Three classes of defect — generated-file drift, unregistered env vars, and rule-11
legal copy outside the chatbot — have no automated detector at all.

**Done means:**

| Observable | Today | Target |
|---|---|---|
| CI runs ending green on `main` | 0 of 21 (0 of 108 across all branches) | every run, barring a real defect |
| Test suites executed per run | 261 attempted, 15 silently red | 289 of 292 executed and green |
| `main` merge-able with a red check | yes | no |
| Generated-file drift detected | never | every PR |
| Rule-11 copy checked outside Cobber | never | every PR, against the preview deploy |
| Wall-clock to a meaningful verdict | 5m37s (to a meaningless red) | under 8 min for `static`/`suites`/`drift` |

**Failure looks like:** a pipeline that is red for reasons unrelated to the change in front of
it. That is what killed the current one, and it is the only outcome that makes things worse than
doing nothing. Every decision below is tie-broken in favour of "a red tick must mean *your*
change is wrong."

---

## 2. Decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | Repair `ci.yml` or write a new pipeline | **Repair** | One check name, one file, one history. Its comment block is wrong in four places and gets rewritten wholesale. |
| D2 | Fix the missing `next-env.d.ts` | **`npx next typegen` step** | `verified`: 4.3s, recreates the file *and* `.next/types/routes.d.ts`, after which `tsc --noEmit` exits 0. Next's own supported command (present in 15.5.9). Rejected: committing the file — fights `.gitignore:68` and goes stale against `routes.d.ts`. |
| D3 | Does CI get a database | **Yes — ephemeral MongoDB service container** | `verified`: `src/lib/mongodb.ts:5-13` throws lazily inside `getMongoURI()` (throw at `:9`), reached only from `connectDB()` at `:230` — not at module scope. So no test code changes. These are the money paths. |
| D4 | Placeholder env vars | **Five, all non-empty** | `verified`: `src/lib/stripe.ts:4-5` throws at module scope; `src/lib/auth.ts:24-40` gates on **five** vars via a `!value` test — `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MONGODB_URI` — and throws at module scope. Set `STRIPE_SECRET_KEY=sk_test_ci_placeholder`, `NEXTAUTH_SECRET=ci-not-a-secret`, `NEXTAUTH_URL=http://localhost:3000`, `GOOGLE_CLIENT_ID=ci-placeholder`, `GOOGLE_CLIENT_SECRET=ci-placeholder`. Two placeholders would have failed; see §3's empty-string trap for why none may be `''`. |
| D5 | `test:igodirect-sso` | **Permanently excluded, reason stated** | `verified`: it POSTs/GETs against the *live production* partner portal `myrewards.toolsaustralia.com.au` (`:126`, `:148`). Supplying the secret fires real third-party traffic on every push. The one exclusion that is policy, not capability. |
| D6 | Build the app in CI | **No** | `verified`: Vercel runs `next build --turbopack` on every push to every branch with `typescript.ignoreBuildErrors` unset, so compile+typecheck is already gated. A CI build costs ~4 min and needs a *reachable* database — `getAllWinners()` calls `connectDB()` with no try/catch (`src/utils/draws/get-all-winners.ts:46`) and `/winners`, `/draw-results` are ISR pages that use it. |
| D7 | Generated-file drift: fail or auto-fix | **Fail the PR** | Auto-fixing means CI pushes commits to the author's branch, defeating CLAUDE.md rule 1b. Failing is noisy but airtight. |
| D8 | Lint warning ceiling | **Delete the 7 dead directives, keep the ceiling at 77** | `verified`: 77 warnings = 45 scroll-lock + 17 unused-vars + 8 exhaustive-deps + 7 dead `eslint-disable` directives. Removing the 7 and *also* dropping the ceiling to 70 restores the exact zero-headroom state this decision exists to fix. Removing them against an unchanged 77 buys 7 warnings of genuine headroom. Ceiling lives at `package.json:32`, not in `ci.yml`. |
| D9 | Which browser tests run against the preview | **`@smoke`, unnarrowed** | `legal-copy.spec.ts` is the only automated defence of the rule-11 wording, which CLAUDE.md calls a legal exposure. Six other describes also survive EXTERNAL mode (`marketing/landing`, `marketing/mini-draws`, `marketing/prize-build-url-params` ×2, `marketing/promo-theme-split`, `membership/modal`); the broader deployed-build coverage earns its place at the same accepted cost. `verified`: `E2E_TARGET_URL` routes to `runExternal()` before any local setup (`e2e/run.ts:244-246`) — no DB, no Stripe, no secrets. |
| D10 | When branch protection goes on | **Last phase** | Turning it on while red blocks every merge. |
| D11 | Where the docs live | **`docs/dev-tooling/ci.md`** | Beside `worktrees.md`, its closest analogue. |
| D12 | Suite runner | **Keep `npm run <script>`** | The ~500ms/suite npm overhead is real, but 4 scripts chain multiple invocations and **26** need a `--require` flag for asset stubs. Per rule 4, not worth the fragility. Revisit only if a run exceeds 10 min. |
| D13 | Which checks become *required* in Phase 5 | **`static`, `suites`, `drift` only — not `preview`** | A required check that never reports deadlocks the PR, and `preview` cannot report when a deployment is skipped or cancelled. It stays a visible-but-advisory review blocker. |

---

## 3. Starting state (verified)

### The workflow

`verified` — `.github/workflows/ci.yml`, 163 lines, added by commit `9a109e9b` (2026-08-19)
inside a 27-file shop bugfix; the only file in `.github/` (`find .github -type f` → exactly one).
One job, `verify`: checkout → setup-node 22 → `npm ci` → `type-check` → `lint` → a bash loop
over every `test:*` script minus a hardcoded 31-entry SKIP array.

`verified` — GitHub REST API (public repo, no token): `actions/workflows/ci.yml/runs` →
`total_count: 108`; with `status=success` → `total_count: 0`.

`verified` — `ci.yml:79` claims the SKIP list was "verified by running all 237". It was not:
`test:subscription-management` was already failing at that commit and is not in the list. (The
"236" in the plain-English section is the measured count at `9a109e9b`; `ci.yml`'s "237" is one
of the comment block's own errors.)

### The type-check failure

`verified` — `next-env.d.ts` is gitignored (`.gitignore:68`) and untracked. Reproduced by
removing it on a clean checkout and running `npx tsc --noEmit`: **exactly 9 errors, all TS2307**,
all `.webp` imports — `src/utils/images/package-icons.ts:14-19`,
`src/components/admin/UserDetailModal.tsx:67`, `src/components/admin/UsersManagement.tsx:53`,
`src/features/admin/users/components/UserRow.tsx:21`. `npx next typegen` (4.3s) recreates it;
`tsc --noEmit` then reports **0 errors**.

### The suite baseline — measured first-hand

`verified` — full sweep of all 292 `test:*` scripts with `.env.local` hidden (51 test files load
dotenv, so its presence would have contaminated the result) and every relevant var unset.
Result: **246 pass, 46 fail, 417s wall.** Failures by first-error cause:

| Root cause | Count | Addressed by |
|---|---|---|
| `MONGODB_URI` | 29 | D3 service container |
| `E2E_MONGODB_URI` | 2 | D3, second database |
| `STRIPE_SECRET_KEY` | 9 | D4 placeholder |
| `src/lib/auth.ts`'s five-var gate | 3 | D4 placeholders |
| `IGODIRECT_SSO_SECRET` | 1 | nothing — excluded by D5 |
| Real defect | 2 | Phase 5 |

`verified` — the two shop suites read `E2E_MONGODB_URI`, never `MONGODB_URI`.
`shop-entry-grant.test.ts:57,86-88` requires it non-empty; `checkout-reuse.test.ts:48,64-70`
additionally requires `/e2e/i` to match **the whole connection string**, not just the db name.
`E2E_MONGODB_URI` is `LOCAL_ONLY` (`check-env.mjs:40`), so it belongs in the workflow YAML and
never in `.env.example`.

`verified` — **D3+D4 alone revive 39, not 43. Four more need seed data.** Measured 2026-09-04
against a real `mongo:8` container on port 27018 with the five D4 placeholders and both
connection strings: **285 pass, 6 fail** of 292 (`igodirect-sso` force-skipped per D5).

| Outcome | Count | Suites |
|---|---|---|
| Revived by container + placeholders alone | **39** | — |
| Need one `active` MajorDraw seeded | 3 | `bonus-code-mint`, `campaign-window`, `claim-grant-compensation` |
| Needs the Norm role + service user | 1 | `norm-permissions` |
| Excluded on policy (D5) | 1 | `igodirect-sso` |
| Genuinely broken | 2 | `dashboard-date-range`, `subscription-management` |

The earlier projection of 43 was right on the total but **wrong on the mechanism** — it did not
account for a seed step. Shipping it unmeasured would have turned CI red on four suites.

`verified` — the three `no_target_draw` suites do **not** create their own draw; they mutate a
pre-existing one and undo it in `finally` (`campaign-window.test.ts:18` docstring, and its
`MajorDraw.updateMany` at `:646`). The lookup is
`MajorDraw.findOne({ status: { $in: ["active","frozen"] } })`
(`src/utils/draws/major-draw-helpers.ts:50-52`), which matches nothing on an empty database. A
dev database always has an active draw, which is why this never surfaced locally.

`verified` — `norm-permissions` names its own fix in its assertion message:
`assert.ok(role, "Norm role exists (run npm run migrate:create-norm first)")`
(`src/lib/internal-norm/__tests__/permissions.test.ts:23,26`). Seed data, not a defect.

`verified` — **a standalone container is sufficient; no replica set needed.** Zero of the 292
failed with a transaction or replica-set error, confirming the earlier static finding that
`startSession`/`withTransaction` appear only in API routes and migrations, never in a suite.
Production is a 3-node replica set (Atlas M10, `ap-southeast-2`), and standalone is the stricter
of the two, so anything green here is green there.

`verified` — **pin the image to `mongo:8.0`, not `mongo:8`.** Production runs 8.0.30; the
floating `mongo:8` tag resolved to 8.3.8, which is *ahead* of production. Testing against a
newer server than you run can pass on behaviour 8.0 does not have.

### The two real defects

`verified` — `test:subscription-management` fails 5/5 with "invariant expected app router to be
mounted". The test imports `UserProvider` (`SubscriptionManagementModal.test.ts:24`) and wraps
the tree in it (`:157`); `src/contexts/UserContext.tsx:5` has imported `usePathname` since
2026-07-20 (`94e7b784`), predating `ci.yml`. **It was already red when the SKIP list was
written.**

`verified` — `test:dashboard-date-range` has been skipped 16 days over a real assertion
(`membershipAsOfMode`: expected `"live"`, got `"snapshot"`).

### The gate

`verified` — GitHub API `branches/main`: `"protected": false`,
`required_status_checks.enforcement_level: "off"`, `contexts: []`, `checks: []`. Owner type is
**User**, not Organization, so org-level rulesets and required workflows are unavailable;
enforcement must be per-repo branch protection or a repo ruleset.

### What Vercel already covers

`verified` — `vercel.json` has only `crons` and `functions`; no `buildCommand`, no
`ignoreCommand`. Vercel runs `npm run build` = `next build --turbopack` on every push to every
branch (`main` → production, others → preview), running all six `prebuild` generators — **but
never diffing them against the committed copies**, which is the gap Phase 3 fills.
`next.config.ts` sets neither `typescript.ignoreBuildErrors` nor `eslint.ignoreDuringBuilds`.
Vercel's lint covers `src/**` only; our `eslint .` covers ~2.7k files including `scripts/`,
`e2e/` and `.claude/` — that delta is CI's real lint value.

`verified` — measured across runs #103–108: Install 25–29s, `tsc` ~47s, `eslint` ~31s, suites
~3m20s. Preview deployment reached `success` in 6m16s on run #108.

### Latent traps this work will hit

`verified` — **No domain in the Domain Manifest claims `.github/**`** (grep for `".github` in
CLAUDE.md → 0 hits; control: `"vercel.json"`, `"package.json"`, `"eslint.config.mjs"` all
claimed at `CLAUDE.md:960-964`). The doc-sync substantive-edit filter (`doc-sync.mjs:195-201`)
exempts `docs/`, `.claude/`, the four root status docs, and anything `isTrivialEdit()` judges
trivia — nothing under `.github/`. **So the first edit to the tracked `ci.yml` reaches the orphan
check and blocks the Stop.** Phase 1a must register the glob.

`verified` — **A live rule-11 violation is in the tree right now.**
`src/app/(site)/mini-draws/[id]/page.tsx:223` ships `{ value: "$1", label: "Per entry" }` —
"Per Entry" is named verbatim as forbidden by CLAUDE.md rule 11.2. It landed 2026-08-12 in
`ade906ab` and is inside a `lg:hidden` block (`:254`), so it is **mobile-only** and invisible to
a desktop-viewport scan. `legal-copy.spec.ts:32-42` lists `/mini-draws` but not the detail route,
so nothing has ever scanned it. This is a copy fix that belongs to DJ, not to this spec; Phase 4
is what stops the next one.

`verified` — `.worktrees/**` is absent from the eslint ignore list (`eslint.config.mjs:24` names
11 entries, none of them `.worktrees`). Zero CI impact (`git ls-files .worktrees` → 0) but it
makes local `npm run lint` traverse every sibling worktree's build output.

`documented` — `test:chat-faqs` pins the FAQ corpus at exactly 99 entries (`faqs.test.ts:188`),
so every FAQ addition turns CI red until the number is bumped. Intended ratchet; undocumented it
reads as breakage.

`verified` — **Do not set unused env vars to empty strings.** `next-auth`'s `parseUrl` falls back
to `localhost:3000` when `NEXTAUTH_URL` is *undefined* but throws `TypeError: Invalid URL` on
`''`. `auth.ts`'s `!value` test likewise treats `''` as missing. Leave a var genuinely unset, or
give it a real-shaped value — never `''`.

`verified` — no suite has its own timeout (0 hits for `AbortSignal.timeout|--test-timeout` across
297 test files; control `assert` hits 289/297), and 33 test files contain `https?://` URLs without
all of them stubbing `fetch`.

---

## 4. Design

### Job shape

Four jobs replacing the single `verify`. Splitting gives one pass/fail per check in the PR's
status list and one required-status context per class for Phase 5; the cost is ~47s of duplicated
checkout+install per extra job.

| Job | Runs | Needs | Est. |
|---|---|---|---|
| `static` | `next typegen` → `tsc --noEmit` → `eslint .` | nothing | ~1.8 min |
| `suites` | all 292 `test:*` minus the exclusions | Mongo service, 5 placeholder vars | ~4 min |
| `drift` | regenerate + `git diff --exit-code`; env registry; asset checks; parity checks | nothing | ~1 min |
| `preview` | Playwright `@smoke` vs the preview URL | preview deployment | ~6 min wait + ~2 min |

**Triggers.** `pull_request`, plus `push: branches: [main, staging]`. `staging` is a real deployed
environment (`docs/e2e/how-to-run.md:154`) and 8 of the last 100 runs were pushes to it; dropping
it would silently uncover it. Pushes to feature branches *without* an open PR are deliberately
uncovered — open a PR to get checked.

**Concurrency.** The existing `group: ci-${{ github.ref }}` (`ci.yml:31`) is **kept unchanged** —
it is already per-PR on `pull_request` (`refs/pull/N/merge`, stable across re-pushes) and
per-branch on `push`. Switching to `head_ref` would collapse per-PR isolation. The double run is
fixed by the trigger filter alone: today both `on: push` and `on: pull_request` fire with no
branch filter into different concurrency groups, so every PR runs twice (`verified` empirically
as runs #104 and #105 on one branch).

**Permissions.** Every job gets `timeout-minutes` and an explicit `permissions: contents: read`.
`preview` needs `contents: read, deployments: read` — an explicit block sets every unlisted scope
to `none`.

### The skip list, rebuilt

The current list is a hand-maintained array that drifts by construction. Replaced by a declarative
block with three properties:

1. **Each entry carries its reason.** After D3/D4 only two reasons remain: `POLICY`
   (igodirect-sso) and `BROKEN` (the two real defects, until Phase 5).
2. **Every entry must resolve to a real npm script.** A renamed suite leaving a stale skip entry
   fails the run rather than silently reducing coverage.
3. **The run count is derived, with a ratchet.** Assert `RAN == ${#ALL[@]} - ${#SKIP[@]}` at run
   time — this subsumes property 2 and needs no hand-editing — plus a committed floor
   `RAN >= BASELINE`, raised deliberately, to catch the genuinely silent case of a deleted or
   renamed script shrinking coverage. An *exact* committed count was rejected: `ci.yml:134`
   already derives `ALL` from `package.json` at run time so new suites already run and already
   fail loudly, and 50 commits since 2026-08-01 added a `test:*` script (~10/week) — each would
   have required a mandatory bump for no added coverage.

### Drift detection

`npm run prebuild && git diff --exit-code src/generated` covers all nine committed generated files
in one step. The two existing bespoke guards — `test:partner-catalog-drift`
(`package.json:510`) and `test:chat-knowledge` (`package.json:200`) — are **kept**, not deleted,
so the 292/289 counts are unaffected; they assert semantic properties the diff does not.

`verified` — no env pinning needed: leaving the four `REWARDS_*` vars unset reproduces the
committed chat pack exactly, and the generators write LF, matching the committed blobs.

Two blind spots stated rather than hidden: `src/components/email-preview/designSamples.generated.ts`
has **no generator** (control search confirmed), so regenerate-and-diff cannot cover it; and
`build-norm-manifest.ts:3` generates the manifest *from* `classification.ts`, so an unregistered
Norm route produces no diff — it needs the separate route↔registry parity check, which is in
Phase 3.

### Env registry check

Implemented as a **third mode of the existing script** — `node scripts/check-env.mjs --registry` —
reusing its `varNames('.env.example')` and `LOCAL_ONLY` directly. No new file (rule 4).
`verified`: a named import is impossible anyway — `check-env.mjs` has zero exports and calls
`process.exit()` at module scope (`:111`).

`verified` — the count is **24** unregistered `process.env.*` reads, or 20 excluding
platform-injected vars. Four (`VERCEL`, `VERCEL_ENV`, `VERCEL_REGION`, `VERCEL_URL`) are absent
from both `.env.example` and `LOCAL_ONLY`, so the design needs a second `PLATFORM_INJECTED`
allowlist or the gate is red forever.

Because the gate would be red on its own PR, **Phase 3's first task is registering the ~20
existing reads** — plus an `# optional` marker that `check-env.mjs` honours by excluding a var
from `missing`. Without that marker, registering optional debug flags makes `npm run check:env`
exit 1 in the main folder and all 33 worktrees and go noisy on every `predev`; this already
happens today for `DASHBOARD_STATS_AD_RESTATEMENT_WINDOW_DAYS`.

`verified` trap: 15 reads use bracket form (`process.env['X']`), two in production code
(`src/lib/support-chat/provider.ts:78`, `src/services/analytics/adPlatformAccounts.ts:28`). Every
name they can currently produce happens to be registered — by luck, not construction. The check
must parse both forms and **report an unresolvable dynamic read rather than passing it**.

### The preview job

`npm ci` installs no browsers (`hasInstallScript: false` on all three playwright packages), and
`e2e/run.ts:176` adds no `--project`, so `playwright.config.ts:29-38` fans out to three projects
across two engines. The job therefore needs an explicit
`npx playwright install --with-deps` step, cached on `~/.cache/ms-playwright` keyed to the
`@playwright/test` version. **At least one mobile project must run** — the live rule-11 violation
above sits inside `lg:hidden` and is invisible at a 1280×720 desktop viewport.

URL discovery is not hand-waved: poll
`GET /repos/{owner}/{repo}/deployments?sha=${{ github.event.pull_request.head.sha }}&environment=Preview`
and take `environment_url` from the first `success` status. Use `head.sha`, not `github.sha` —
the merge commit never matches. Fork PRs get no deployment and the job is skipped, not failed.

### Failure states

| Situation | Behaviour |
|---|---|
| Mongo container fails to start | `suites` fails loudly. Never silently skipped — a skipped DB suite is indistinguishable from a passing one. |
| Preview deployment never becomes ready | `preview` fails after a bounded wait. It does **not** pass-by-default. It is not a required check (D13), so it cannot deadlock a merge. |
| A suite hangs | `timeout-minutes` on the job caps it. |
| Preview flags copy the PR didn't touch | Documented in `ci.md` with a re-run instruction. Accepted cost of D9. |
| Third-party CSP blocks in the preview run | Already downgraded to `external-csp-block` annotations; same-origin violations still fail. |
| Fork PR | `preview` skipped (no deployment, no secrets). The other three still run. |

---

## 5. Threading checklist

| When you… | You must also… | Miss it and… | Loud or silent |
|---|---|---|---|
| Add a `*.test.ts` file | add a `test:<name>` script to `package.json` | the suite never runs anywhere — as happened to `klaviyo/__tests__/bulk-import.test.ts`, which passes today and has never been executed | **silent** |
| Add a suite needing a secret/DB | decide: covered by the container, or a new exclusion with a reason | it fails every run and trains everyone to ignore the tick | loud |
| Delete or rename a `test:*` script | raise/lower the `BASELINE` floor deliberately | coverage silently shrinks | **silent today, loud after Phase 1a** |
| Read a new `process.env.X` in `src/` | register it in `.env.example` **and** set it in Vercel + every `.env.local` | prod reads `undefined` and behaves plausibly wrong | **silent** |
| Add a file under `.github/` | ensure a Domain Manifest glob covers it | doc-sync blocks the Stop | loud on an edit to a tracked file; **silent on a new file** (`doc-sync.mjs:111-112` treats an untracked file's empty diff as trivia) |
| Add an input to any generator (image, video, partner CSV) | re-run `npm run prebuild` and commit the result | Vercel regenerates at deploy so the site looks right, while the committed manifest the tests import is stale | **silent** |
| Add an FAQ to the Cobber corpus | bump the count at `faqs.test.ts:188` | CI goes red on an unrelated PR | loud but confusing |
| Add a Norm route | add the registry entry + schema, run `build:norm-manifest` | a runtime 500 that `tsc`, `next build` *and* regenerate-and-diff all miss | **silent** |
| Add a customer-facing page or route | add it to `legal-copy.spec.ts`'s `PAGES` | rule-11 copy ships unscanned — exactly how `mini-draws/[id]` shipped "Per entry" | **silent** |

---

## 6. Tests

CI is itself test infrastructure, so "tests" means: how do we know each gate actually fires?
Every silent row above needs a positive control.

| Gate | Proof it works |
|---|---|
| `next typegen` fix | **Done.** Removed `next-env.d.ts` + `.next`, ran `tsc` → 9 errors; ran `typegen`, ran `tsc` → 0 errors. |
| Skip-list integrity | Add a bogus name to the skip list on a scratch commit; the run must fail. |
| Derived run count | Delete a `test:*` script; the `BASELINE` floor must fail. |
| Generated-file drift | Touch a landing video filename; `git diff --exit-code` must fail. |
| Every test file has a script | Add a scratch `*.test.ts` with no `test:` entry; the check must fail. |
| Norm route parity | Add a route under `src/app/api/internal/norm/v1/` with no `classification.ts` entry; the check must fail. |
| Env registry | Add `process.env.CI_CANARY` to a `src/` file; the check must fail. |
| Mongo container | Assert `test:webhook-queue-claim` (currently dead) passes. If the container silently fails, this suite fails — that is the canary. |
| Legal-copy guard | On a known-good preview, confirm the full `@smoke` set runs and reports — including at least one mobile project and the mini-draw **detail** route — before making it a review blocker. |
| Branch protection | Open a throwaway PR with a deliberate type error; confirm merge is blocked. |

The 43 revived suites are their own proof — they cover money paths (`webhook-queue-*`,
`renewal-grant-reconciler`, `shop-entries`) at the database level, where CLAUDE.md requires
entitlement assertions to live.

---

## 7. Phases

**Phase 1a — Make the tick mean something.** *Win: CI passes for the first time in its life.*
`next typegen` step; rebuild the skip list from the measured sweep; the derived run-count +
`BASELINE` assertion; dedupe the double run via the trigger filter; register
`.github/workflows/**` in the Domain Manifest (forced — the hook blocks the first `ci.yml` edit
otherwise). Coverage after: 246 green, 46 excluded with stated reasons.

**Phase 1b — Housekeeping.** *Win: the pipeline is hardened and lint is usable locally again.*
`timeout-minutes` + `permissions`; bump `checkout`/`setup-node` to the current major (v7 as of
2026-09-04); add `.worktrees/**` to the eslint ignores; delete the 7 dead `eslint-disable`
directives keeping the ceiling at 77; write `docs/dev-tooling/ci.md`.

**Phase 2 — Turn on the database.** *Win: the money-path suites come back.*
Measurement is **done** (§3): 39 revive on the container alone, 4 more need seed data.
Provision a `mongo:8.0` service container with `MONGODB_URI` and a *separate* `E2E_MONGODB_URI`
whose whole connection string matches `/e2e/i`; add the five D4 placeholders. Then a seed step:
`npm run migrate:create-norm` (existing script — do not write a new one) plus one `active`
MajorDraw. Re-measure to confirm 289 of 292 before the phase is done. Skip list shrinks to 3.

**Phase 3 — Catch what nothing catches.** *Win: generated-file and env drift become unmergeable.*
First register the ~20 unregistered env reads plus the `# optional` marker, so the gate is green
on its own PR. Then: regenerate-and-diff; `check-env.mjs --registry`; the Norm route↔registry
parity check; `check:promo-landing-assets`; the every-test-has-a-script check; wire the orphaned
`klaviyo/bulk-import` suite. `check:brand-wordmarks` is **excluded** — its red condition is
aesthetic (a wordmark over a 6% dead-canvas budget), not correctness, so it would cry wolf.

**Phase 4 — Guard the legal copy.** *Win: the free-entry wording is defended automatically for the
first time.* Playwright EXTERNAL mode against the preview URL with browser install and deployment
polling; add a mini-draw **detail** route to `PAGES`, navigated from the index rather than a
hard-coded id; ensure a mobile project runs. The guard is red until
`mini-draws/[id]/page.tsx:223` is fixed **as a copy change, never by weakening the regex or the
page list**. Advisory throughout — never a required check (D13).

**Phase 5 — Close the gate.** *Win: nothing reaches production unchecked.* Fix
`test:subscription-management` and `test:dashboard-date-range`; empty the `BROKEN` category;
enable branch protection on `main` requiring `static`, `suites` and `drift`.

---

## 8. Rollback

CI is advisory through Phases 1–4 — a red tick blocks nothing, so any phase reverts by reverting
its PR with no production impact. There is no runtime code in this work; nothing ships to
customers.

Phase 5 is the only irreversible-feeling step, and it is a **GitHub UI toggle, not a deploy**.
Turning off "require status checks" on `main` restores today's behaviour in seconds, with no code
change and no redeploy. In-flight PRs are unaffected. Because the repo is User-owned, admin
override remains available on every PR; `ci.md` documents when using it is legitimate, and that
call is DJ's.

---

## 9. Open dependencies

| Item | Owner | Asked | Expected by | Blocks |
|---|---|---|---|---|
| What Vercel's **Preview** env vars point at — production Mongo or a dev cluster | DJ (Vercel dashboard) | 2026-09-04 | before Phase 4 | Phase 4. Docs claim previews run against the shared production database (`docs/infrastructure/README.md:51-52`), unconfirmed. If true, `@smoke` must stay read-only — it already is, but the constraint must be stated. A live production-safety question independent of CI. |
| Whether the two real defects are test bugs or code bugs | DJ | 2026-09-04 | Phase 5 | Phase 5 only. `subscription-management` looks like a test bug (missing router mock; the sibling membership-modal test provides one). `dashboard-date-range` needs a judgement on whether `"snapshot"` is correct. |
| The live rule-11 violation at `mini-draws/[id]/page.tsx:223` | DJ | 2026-09-04 | before Phase 4 goes advisory-visible | Nothing structurally, but Phase 4's guard stays red until it is fixed. It is a copy decision with a legal permit attached, so it is not this spec's to make. |
| Whether an empty Mongo container actually revives all 43 | DJ / Phase 2 | 2026-09-04 | Phase 2 task 1 | Phase 2's suite count. Unmeasurable here — no Docker daemon on this machine. Settled by the Phase 2 measurement step. |
| Whether the 46 failures are the full set on **ubuntu** | DJ / Phase 1a | 2026-09-04 | Phase 1a first run | Nothing. Every measurement here is Windows. Partial mitigation `verified`: `forceConsistentCasingInFileNames` defaults on and `tsc` resolves all 297 test files at exit 0, so import-path casing is covered; residual risk is runtime string paths. |

---

## Appendix — deliberately out of scope

| Item | Why |
|---|---|
| `npm run build` in CI | D6. Vercel already does it per push. |
| Prettier | Not installed, not even transitively. Adding it means reformatting ~2,700 files, colliding with every open branch and the 33 live worktrees. Separate decision. |
| e2e in local mode | A full local run throws without an interactive `stripe login` (`e2e/run.ts:318-325`). `@smoke`-only runs continue with a warning, so the real blockers for a local `@smoke` are the seeded `E2E_MONGODB_URI` database, the port pre-flight and a booted server (`e2e/run.ts:315`, `:334`, `:337`). |
| `norm:smoke` | Needs a live dev server plus two secrets. Its statically-checkable half (route↔registry parity) is in Phase 3; the schema↔output half stays manual. |
| `check:brand-wordmarks` | Aesthetic red condition; would cry wolf. |
| `designSamples.generated.ts` | Has no generator, so regenerate-and-diff cannot cover it. |
| Faster suite runner (`node --import tsx`) | D12. Revisit only if a run exceeds 10 minutes. |
| Fixing `mini-draws/[id]/page.tsx:223` | A customer-copy change with a legal permit attached. Flagged, not decided here. |
