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

- **A check** — one named pass/fail result. Ours are `static` and `suites`.
- **A required check** — a check GitHub will not let you merge past. Ours are
  **not required yet**; that is the last phase of the rollout plan.

## Why ours exists when Vercel already builds everything

Reasonable question — Vercel does build the entire app on every push, and that
build does catch type errors. Three things it does not do:

1. **It never runs a single test suite.** All 292 of them are invisible to it.
2. **It only lints `src/`.** Everything in `scripts/` and `e2e/` — hundreds of
   files — is never checked.
3. **Nothing stops you merging when it fails.** It reports; it does not gate.

So CI is not a second opinion on the build. It covers the parts Vercel structurally
cannot see.

## What ours checks today

| Check | What it proves | Roughly |
|---|---|---|
| `static` | Types are consistent, and the whole repo passes lint — not just `src/` | ~2 min |
| `suites` | **289 of the 292** logic suites pass: billing arithmetic, the Stripe webhook queue, renewal-grant reconciliation, shop entry grants, redeemables, promo multipliers, permissions, Cobber's legal-wording guard | ~5 min |

The `suites` job starts a **scratch MongoDB** — a blank database that lives and dies
with the run, holds nothing, and is reachable only from that one machine. It is not
your production database and not the dev cluster; it cannot touch a customer record.
It exists because ~43 suites test code that calls `connectDB()` on the way in, and
with no database configured they throw at import and never run at all.

**What a green tick does not mean.** It does not mean the app builds — there is no
build step, on purpose (Vercel already does that, and repeating it costs four
minutes and a real database for nothing). It does not mean the browser tests ran.
And it does not mean all 292 suites ran — see the skip list below.

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

## The skip list — why 3 suites do not run

`.github/scripts/run-test-suites.sh` holds every suite CI does not run, grouped by
**why**. The reason matters more than the list:

| Reason | Count | Meaning |
|---|---|---|
| `POLICY` | 1 | **Never runs here, whatever we provision.** `test:igodirect-sso` POSTs to the live production partner portal — giving CI that secret would fire real third-party traffic on every push. |
| `BROKEN` | 2 | Genuinely failing on `main`. Not an environment problem. |

**`BROKEN` is meant to be empty.** Two suites sit there today, each named in the
script with what is actually wrong with it.

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
- **Coverage cannot fall below a committed baseline** (`BASELINE=246`). Delete or
  rename a suite and the run fails until someone lowers that number on purpose and
  says why.

## Gotchas

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
