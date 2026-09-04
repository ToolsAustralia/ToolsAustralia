# CI — the automated checks on every pull request

## What CI is, if you have not set one up before

CI stands for "continuous integration". Strip the jargon and it is one idea: **a
computer that is not yours re-runs your checks, automatically, every time code is
pushed.**

That "not yours" part is the whole value. Your laptop has a `.env.local` full of
real passwords, a database, months of cached build output, and whatever you
installed last March. A fresh machine has none of that. Code that works only
because of something sitting on your laptop will pass locally and fail for
everyone else. CI is the machine that has nothing, so it finds those.

Two terms you will see on a pull request page:

- **A check** — one named pass/fail result. Ours are `static`, `drift`, `suites`
  and `preview`.
- **A required check** — a check GitHub will not let you merge past. **None of ours
  are required yet.** Turning that on is the last step, and it is deliberately last:
  a gate that fires while the pipeline is still unreliable just teaches everyone to
  bypass it.

## Why ours exists when Vercel already builds everything

Reasonable question — Vercel does build the entire app on every push, and that
build does catch type errors. Three things it does not do:

1. **It never runs a single test suite.** All 293 of them are invisible to it.
2. **It only lints `src/`.** Everything in `scripts/` and `e2e/` — hundreds of
   files — is never checked.
3. **Nothing stops you merging when it fails.** It reports; it does not gate.

So CI is not a second opinion on the build. It covers the parts Vercel structurally
cannot see.

## What ours checks today

| Check | What it proves | Roughly |
|---|---|---|
| `static` | Types are consistent, and the whole repo passes lint — not just `src/` | ~2 min |
| `drift` | Machine-generated files still match their inputs, every env var the code reads is registered, every test file is wired to a script, and Norm's routes match its registry | ~1 min |
| `suites` | **292 of the 293** logic suites pass: billing arithmetic, the Stripe webhook queue, renewal-grant reconciliation, shop entry grants, redeemables, promo multipliers, permissions, Cobber's legal-wording guard | ~5 min |
| `preview` | Opens a real browser against the deployed preview and reads the pages, checking the free-entry wording. **Advisory — never blocks a merge** | ~6 min wait + 2 min |

The `suites` job starts a **scratch MongoDB** — a blank database that lives and dies
with the run, holds nothing, and is reachable only from that one machine. It is not
your production database and not the dev cluster; it cannot touch a customer record.
It exists because ~43 suites test code that calls `connectDB()` on the way in, and
with no database configured they throw at import and never run at all.

**What a green tick does not mean.** It does not mean the app builds — there is no
build step, on purpose (Vercel already does that, and repeating it costs four
minutes and a real database for nothing). It does not mean the browser tests ran.
And it does not mean all 293 suites ran — see the skip list below.

## Run the checks yourself

You never need to push to find out why CI is red.

The `static` job needs nothing:

```bash
npm run type-check
npm run lint
```

The `suites` job needs a database. Two commands stand one up — a throwaway you can
delete afterwards:

```bash
docker run -d --name ta-ci-mongo -p 27018:27017 mongo:8.0 --replSet rs0
docker exec ta-ci-mongo mongosh --quiet --eval 'rs.initiate()'
```

Then point the suites at it and run them:

```bash
export MONGODB_URI="mongodb://localhost:27018/toolsaustralia-ci?directConnection=true"
export E2E_MONGODB_URI="mongodb://localhost:27018/toolsaustralia-e2e?directConnection=true"
npm run seed:ci-fixtures        # one active major draw
npm run migrate:create-norm     # the Norm role + service user
bash .github/scripts/run-test-suites.sh         # run them
bash .github/scripts/run-test-suites.sh --list  # just show what runs vs skips
npm run <suite-name>                            # re-run one failing suite
docker rm -f ta-ci-mongo                        # done
```

Three details that will cost you an hour if you skip them:

- **`--replSet rs0` and `rs.initiate()` are not optional.** `migrate:create-norm`
  uses a transaction, and MongoDB refuses transactions on a standalone node with
  *"Transaction numbers are only allowed on a replica set member or mongos"*.
- **`directConnection=true` is not optional.** A single-node replica set advertises
  the *container's* hostname, which nothing outside the container can resolve.
  Without it the driver hangs on topology discovery rather than failing clearly.
- **Port 27018, not 27017**, so it cannot collide with a local MongoDB you already
  run. CI uses 27017 because nothing else is there.

One caveat: locally you also have a `.env.local`, so a suite may pass for you using
real config where CI uses placeholders.

## The skip list — why ONE suite does not run

`.github/scripts/run-test-suites.sh` holds every suite CI does not run, grouped by
**why**. The reason matters more than the list:

| Reason | Count | Meaning |
|---|---|---|
| `POLICY` | 1 | **Never runs here, whatever we provision.** `test:igodirect-sso` POSTs to the live production partner portal — giving CI that secret would fire real third-party traffic on every push. |
| `BROKEN` | 0 | Genuinely failing on `main`. Not an environment problem. |

**`BROKEN` is empty, and that is the point.** Two suites lived there:
`subscription-management` (the test mounted a provider needing Next's router and
never supplied one) and `dashboard-date-range` (the test was stale, not the code).
Both were fixed on 2026-09-04 rather than left skipped. Adding an entry back is
admitting a real defect ships unchecked — prefer fixing it.

There is deliberately **no category for "needs a service we could provide"**. Before
the database there were 43 such suites across four `NEEDS_*` groups; rather than
leave them listed, Phase 2 provisioned what they needed. If you are tempted to add a
`NEEDS_*` group back, provision the thing instead.

That is the lesson from the previous version of this file. Its skip list mixed
"cannot run here" with "known broken" in one undifferentiated array, and once those
blur, no entry on the list can be trusted — which is precisely what happened: it
claimed to have been "verified by running all 237" suites while one of its entries
had already been failing for an unrelated reason.

### The list defends itself

Two guards run before any suite does, because a skip list that silently rots is
worse than none:

- **Every skip entry must name a script that still exists.** Rename a suite and
  forget the list, and CI fails rather than quietly running something you thought
  was skipped.
- **Coverage cannot fall below a committed baseline** (`BASELINE=292`). Delete or
  rename a suite and the run fails until someone lowers that number on purpose and
  says why. It has only ever gone up: 246 before CI had a database, 289 with the
  container and seed step, 290 once a never-executed suite was found and wired, 292
  once the two broken suites were fixed.

## The `drift` job — four silent failures

Everything here catches a defect that is **silent**: it ships, it looks fine in review,
and it surfaces in production or not at all. Each runs in about a second and needs no
database and no secrets.

| Check | The silent failure it catches |
|---|---|
| `npm run prebuild` + `git diff` | Nine files in `src/generated/` are committed *and* machine-generated from images, videos and the partner spreadsheet. Vercel regenerates them on every deploy but never compares them to what is committed — so adding a video without re-running the generator gives you a correct-looking preview and a stale manifest that the tests actually import. |
| `check:env:registry` | `.env.example` is the single source of truth for which env vars exist, and there is no runtime validation. An unregistered var means production reads `undefined` and behaves plausibly wrong. This found **29** already unregistered. |
| `check:test-scripts` | A `*.test.ts` with no `test:*` entry runs nowhere, forever, and nothing says so. It looks like coverage in a review. This found one that had never executed. |
| `check:norm-parity` | A Norm route with no registry entry is a runtime failure that `tsc`, `next build` **and** the drift check above all miss — the manifest is generated *from* the registry, so it still matches itself perfectly. |

Run any of them yourself: `npm run check:env:registry`, `npm run check:test-scripts`,
`npm run check:norm-parity`.

**On marking an env var `[optional]`.** Some vars have a code-side default and are
never set in practice. Put `[optional]` in the comment above the declaration in
`.env.example`:

```
# Verbose Klaviyo payload logging. [optional]
KLAVIYO_DEBUG_PROFILE=
```

It stays registered — so the CI check is satisfied and the var is discoverable — but
`npm run check:env` will not demand it of every folder. Without that escape hatch,
registering a debug flag makes `check:env` exit 1 in the main checkout and all ~30
worktrees, and go noisy on every `npm run dev`, which is how vars end up unregistered
in the first place.

**What `check:norm-parity` does NOT prove.** It confirms the *paths* line up. It cannot
confirm that each `responseSchema` matches what its handler actually returns — that
mismatch is a runtime 500 and still needs `npm run norm:smoke` against a live server,
which CI cannot run.

## The `preview` job — the legal-wording guard

This one opens an actual browser against the Vercel preview deployment for the pull
request and reads the pages the way a customer would. It is the **only** automated
defence of the free-entry wording (CLAUDE.md §11) outside Cobber's FAQ corpus — the
wording that has a trade-promotion permit attached.

**Why it exists.** On 2026-08-12 the mini-draw detail page shipped `$1 / "Per entry"`
and its hero shipped `$1 / "Entry"`. Both sat in production for 23 days. The banned-word
list already contained `per entry` — **the pattern was never the problem**. The page list
did not include the mini-draw *detail* route, so nothing ever looked at it. The same rule
had already been applied and then regressed once before, in a design-handoff rebuild.

Three things follow from that, all now baked in:

1. **Adding a customer-facing route means adding it to `PAGES`** in
   `e2e/specs/marketing/legal-copy.spec.ts`. There is no discovery mechanism; the list
   is the coverage.
2. **At least one mobile viewport must run.** The offending strip was inside `lg:hidden`
   — invisible at a desktop viewport to a human reviewer *and* to any desktop-only scan.
   The job runs `chromium-desktop` and `mobile-chrome`.
3. **An empty scan must fail, not pass.** If the detail page renders no draw content,
   the test fails loudly rather than reporting green having read nothing.

**It is advisory on purpose, and must stay that way.** It depends on a Vercel deployment
existing. A required check that never reports — deployment skipped, cancelled, or a pull
request from a fork — leaves the PR permanently unmergeable, which is worse than the gap
it closes. Never add `preview` to branch protection.

**It reads whatever is deployed**, so it can legitimately flag copy your PR did not
touch. That is the accepted cost of scanning the real build. Fix the copy on the branch
it came from and re-run.

**Safe to run:** preview deployments read the **dev** database, not production, and the
external mode is read-only regardless — it skips all database setup and hard-excludes the
purchase and admin suites.

## Gotchas

### CI's database starts genuinely empty, and yours never does

This is the single biggest difference between a run here and a run on your machine, and it
caused the first real failure of the rebuilt pipeline (run #122).

The `suites` job's seed step runs a migration that writes inside a transaction. On a brand-new
database Mongoose builds the `users` indexes the first time the model is touched, and an index
build holds a lock the transaction cannot get within Mongo's 5ms default:

```
Unable to acquire IX lock on '<db>.users' within 5ms
code 24 · LockTimeout · errorLabels: [ TransientTransactionError ]
```

It only ever bites the **first** run. The failed attempt leaves the collections and indexes
behind, so an immediate retry passes — which makes it look intermittent and is exactly why it
never reproduced locally against a warm container.

`seed:ci-fixtures` now awaits `User.init()` and `Role.init()` first, which resolve only once
index builds have finished. Creating the collections alone is **not** enough; that was tried.

**If you are debugging a CI-only failure, drop your local database first.** A warm database
hides this entire class of bug:

```bash
docker exec ta-ci-mongo mongosh --quiet "mongodb://localhost:27017/toolsaustralia-ci" \
  --eval 'db.dropDatabase()'
```

### The bug that kept this red for sixteen days

The workflow was added on 2026-08-19 and failed **108 times without ever passing**.
Nobody noticed, because nothing depended on it.

The cause: `next-env.d.ts` is deliberately kept out of git, and it is the only thing
that teaches the type-checker how to read a `.webp` image import. Next.js normally
rewrites it during a build — but CI never builds, so the file was never there, and
nine image imports looked broken. The fix is the `next typegen` step, which takes
four seconds.

The lesson worth keeping: **a check nobody reads is worse than no check**, because
it looks like coverage. The original workflow's own comments argued that adding e2e
would make it fail constantly and get switched off. That is precisely what happened
to the workflow itself.

### Adding a Cobber FAQ turns CI red on purpose

`test:chat-faqs` pins the FAQ corpus at an exact count. Add an FAQ and CI goes red
until you bump the number in `src/data/__tests__/faqs.test.ts`. That is a deliberate
ratchet, not a break — it forces the count to be changed knowingly.

### Adding a test file is not enough to run it

A `*.test.ts` file with no matching `test:*` entry in `package.json` runs nowhere,
forever, and nothing tells you. One suite in this repo is in that state today.

### Lint runs on a budget, with deliberate headroom

`npm run lint` allows at most **77** warnings and currently emits **70** — so there are
seven spare. That gap is on purpose. It used to be 77 of 77, meaning the next warning
anyone added turned CI red on a rule they had never touched, which is the fastest way
to teach people that a red tick is noise.

If you use up the headroom, **fix the warning — do not raise the ceiling.** The ceiling
is the only thing stopping the count creeping upward forever, and it is meant to go
down, not up. It lives in `package.json`, not in the workflow.

### Editing anything under `.github/` needs a doc update

`.github/**` belongs to the `dev-tooling` domain, so the doc-sync hook expects a
matching update in `docs/dev-tooling/` — usually this file. Before 2026-09-04 no
domain claimed `.github/` at all, so any edit to the workflow was reported as an
orphaned file.

## Where things live

| File | What it is |
|---|---|
| `.github/workflows/ci.yml` | The workflow: when it runs, which jobs, which steps |
| `.github/scripts/run-test-suites.sh` | The skip list, the guards, and the suite runner — runnable locally |
| `package.json` | Every `test:*` suite, plus the lint warning ceiling |
| `docs/superpowers/specs/2026-09-04-ci-pipeline-design.md` | The design and the phase plan |

## What is coming, and what is deliberately not

Done: the pipeline passes, and the scratch database revived 43 suites.

Planned, in order: drift checks for the auto-generated image/video manifests and the
environment registry, then a real browser run against the Vercel preview to defend
the free-entry wording. Only after all of that has been reliably green does passing
become **required** to merge — turning that on while the pipeline is unreliable would
block every merge and teach everyone to bypass it.

The browser check will stay **advisory even then**. A required check that never
reports — because a deployment was skipped or cancelled — leaves the pull request
permanently unmergeable, and that failure mode is worse than the gap it closes.

Deliberately excluded: building the app (Vercel does it), Prettier (would reformat
~2,700 files and collide with every open branch), and the full e2e suite (needs an
interactive Stripe login that no unattended machine can do).

## Related

- [testing.md](./testing.md) — how the `test:*` suites are structured
- [worktrees.md](./worktrees.md) — parallel checkouts, and why `.worktrees/` is excluded from lint
- [../e2e/how-to-run.md](../e2e/how-to-run.md) — the browser suite and its modes
- [../infrastructure/README.md](../infrastructure/README.md) — Vercel, environments, deploys
