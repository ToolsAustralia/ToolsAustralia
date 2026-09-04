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
| `suites` | 246 of the 292 logic suites pass: billing arithmetic, redeemables, promo multipliers, permissions, Cobber's legal-wording guard | ~4 min |

**What a green tick does not mean.** It does not mean the app builds — there is no
build step, on purpose (Vercel already does that, and repeating it costs four
minutes and a real database for nothing). It does not mean the browser tests ran.
And it does not mean all 292 suites ran — see the skip list below.

## Run the checks yourself

You never need to push to find out why CI is red.

```bash
npm run type-check                              # what the `static` job runs
npm run lint
bash .github/scripts/run-test-suites.sh         # what the `suites` job runs
bash .github/scripts/run-test-suites.sh --list  # just show what runs vs skips
npm run <suite-name>                            # re-run one failing suite
```

One honest caveat: locally you have a `.env.local`, so suites that CI cannot pass
will pass for you. That gap is exactly what the skip list exists to record.

## The skip list — why 46 suites do not run

`.github/scripts/run-test-suites.sh` holds every suite CI cannot run, grouped by
**why**. The reason matters more than the list:

| Reason | Count | Meaning |
|---|---|---|
| `NEEDS_MONGO` | 29 | Wants a database. Fixed by giving CI a scratch one. |
| `NEEDS_STRIPE_KEY` | 9 | Dies at import without a Stripe key, without ever calling Stripe. |
| `NEEDS_AUTH_ENV` | 3 | `src/lib/auth.ts` demands five login-related variables and throws without them. |
| `NEEDS_E2E_MONGO` | 2 | Wants its own throwaway database and refuses to touch a real one. |
| `POLICY` | 1 | **Never runs here.** `test:igodirect-sso` talks to the live production partner portal — giving CI that secret would fire real third-party traffic on every push. |
| `BROKEN` | 2 | Genuinely failing. Not an environment problem. |

`NEEDS_*` are temporary — they become runnable once CI gets a database. `POLICY` and
`BROKEN` never do. **`BROKEN` is meant to be empty**; two suites sit there today and
each one is named in the script with what is actually wrong.

That distinction is the lesson from the previous version of this file. Its skip list
mixed "cannot run here" with "known broken", and once those blur, no entry on the
list can be trusted.

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

### Lint has almost no headroom

`npm run lint` allows a fixed number of warnings and sits very close to it. Add one
unrelated warning and CI goes red on a rule you never touched. If that happens, fix
the warning — do not raise the ceiling. The ceiling is the only thing stopping the
count creeping upward forever. It lives in `package.json`, not in the workflow.

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

Planned, in order: a scratch database (revives most of the 46), drift checks for the
auto-generated image/video manifests, and a real browser run against the Vercel
preview to defend the free-entry wording. Only after all of that has been reliably
green does passing become **required** to merge — turning that on while the pipeline
is unreliable would block every merge and teach everyone to bypass it.

Deliberately excluded: building the app (Vercel does it), Prettier (would reformat
~2,700 files and collide with every open branch), and the full e2e suite (needs an
interactive Stripe login that no unattended machine can do).

## Related

- [testing.md](./testing.md) — how the `test:*` suites are structured
- [worktrees.md](./worktrees.md) — parallel checkouts, and why `.worktrees/` is excluded from lint
- [../e2e/how-to-run.md](../e2e/how-to-run.md) — the browser suite and its modes
- [../infrastructure/README.md](../infrastructure/README.md) — Vercel, environments, deploys
