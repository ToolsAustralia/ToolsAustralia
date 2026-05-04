# Git worktrees

A workflow for running multiple isolated checkouts of this repo side by side, each with its own branch, dev server, and `node_modules`.

## What is a worktree?

A git worktree is a second working directory attached to the same `.git` repository. Commits land in the same object store, branches are visible everywhere, but each working directory has its own checked-out files and its own currently-checked-out branch. See `git help worktree` for the underlying machinery — this doc only covers the conventions this repo layers on top.

## Why this repo uses them

- **Parallel feature work without `git stash`.** Keep the membership-status branch live in one worktree while you sketch a hotfix in another.
- **Isolated dev servers.** Each worktree gets its own `PORT`, so `npm run dev` in two worktrees does not collide.
- **No risk to the main checkout.** Risky migrations, dependency upgrades, or codemod experiments stay in their own folder; if it goes wrong, delete the worktree.
- **Same hooks, same skills.** `.claude/` is committed to the repo (only [.claude/.touched-files](../../.gitignore#L45) and [.claude/.session-state](../../.gitignore#L46) are ignored), so every worktree inherits the no-auto-commit and doc-sync hooks automatically.

## Quick start

Four bash scripts under `scripts/wt-*.sh` are the entry point. They work in Git Bash, WSL, and macOS/Linux. Run them from anywhere inside the repo (they `cd` to the repo root themselves).

```bash
# Create a new worktree on a fresh feature branch off main.
scripts/wt-new.sh my-feature

# List all attached worktrees with branch, port, size, and dirty flag.
scripts/wt-list.sh

# After rotating a secret in the main checkout's .env.local, push it
# to every worktree (preserves each one's PORT).
scripts/wt-sync-env.sh

# Remove a worktree (refuses dirty trees unless --force).
scripts/wt-remove.sh my-feature
```

## Conventions

| Convention | Where it lives | Why |
|---|---|---|
| Worktree path | `.worktrees/<name>/` inside the repo root | Keeps siblings discoverable and gitignored as a group ([.gitignore](../../.gitignore#L49)). |
| Branch name | `feature/<name>` | One predictable shape; `wt-remove.sh` knows where to look when cleaning up. |
| Name format | `^[a-z0-9-]+$` (lower-kebab-case) | Matches the repo's domain-key convention used in the [CLAUDE.md Domain Manifest](../../CLAUDE.md#L125). |
| Base branch | `main` if it exists locally, otherwise current HEAD (with warning), or `--from <branch>` | Safe default; explicit override when you need it. |
| `.env.local` | Copied (not symlinked) on creation | Windows symlinks need elevated rights or developer mode; copying always works. |
| `node_modules` | Fresh `npm install` per worktree | Next.js builds and Turbopack ([CLAUDE.md commands](../../CLAUDE.md#L36)) pull native bindings (e.g. swc); sharing across siblings is fragile and crash-prone. |
| `PORT` | Auto-assigned 3001+ by scanning sibling `.env.local` files | Lets multiple `npm run dev` instances run at once without conflict. |

## What each script does

- [scripts/wt-new.sh](../../scripts/wt-new.sh) — validates the name, picks the next free `PORT`, runs `git worktree add .worktrees/<name> -b feature/<name> <base>`, copies `.env.local`, appends the assigned `PORT=...` line (idempotent — strips any existing `PORT=` first), then runs `npm install`. If install fails, the worktree is left in place and the script exits non-zero so you can fix and retry.
- [scripts/wt-list.sh](../../scripts/wt-list.sh) — parses `git worktree list --porcelain` and prints a column-aligned table: name, branch, port, disk size (via `du -sh` if available), and `dirty`/`clean` based on `git -C <path> status --porcelain`. The main checkout shows up labeled `(main)`.
- [scripts/wt-remove.sh](../../scripts/wt-remove.sh) — refuses to remove a dirty worktree unless `--force`. After `git worktree remove`, attempts `git branch -d feature/<name>` only if the branch has been merged into `main` (or HEAD if no main); otherwise leaves the branch with a warning. Pass `--keep-branch` to skip the deletion attempt entirely.
- [scripts/wt-sync-env.sh](../../scripts/wt-sync-env.sh) — for every directory under `.worktrees/`, snapshots the existing `PORT=` line, copies the repo-root `.env.local` over the worktree's, then re-appends the saved `PORT=` line. Use after rotating any secret (Stripe key, Mongo URI, SendGrid token, NextAuth secret).

## Gotchas

### MongoDB is shared across worktrees
Every worktree's `.env.local` is copied from the main one, so they all point at the same `MONGODB_URI`. **Destructive scripts in `scripts/migrations/` or any `migrate:*` / `backfill:*` job affect every worktree's view of reality.** If you need a sandbox database, change `MONGODB_URI` in that one worktree's `.env.local` (and don't run `wt-sync-env.sh` afterward, or it will overwrite the override).

### Stripe webhook listener can only forward to one port
The Stripe CLI's `stripe listen --forward-to ...` flag forwards to a single URL. If you have `npm run dev` running in two worktrees, only the one whose port is currently configured in the listener will receive webhook events. The repo's webhook route is at [src/app/api/stripe/webhook](../../src/app/api/stripe/webhook) — see [docs/billing-stripe](../billing-stripe/) for the broader webhook story.

### `.next/` and `src/generated/upsellImageManifest.ts` are per-worktree
Both are gitignored and per-checkout, so each worktree builds its own. That's fine — but be aware that the upsell manifest regen runs as part of `prebuild`/`predev` ([CLAUDE.md commands](../../CLAUDE.md#L36)). If the build fails because `scripts/build-upsell-image-manifest.ts` errors out, it will fail the same way in every worktree (it's the same source code). Fix it once, in any worktree, and commit.

### Re-sync after rotating a secret in main
If you change a value in the main checkout's `.env.local` (rotating a Stripe key, swapping NextAuth secrets, pointing at a new Mongo cluster), the change does **not** propagate automatically. Run [scripts/wt-sync-env.sh](../../scripts/wt-sync-env.sh) — it preserves each worktree's `PORT` while replacing every other line.

### Hooks are per-repo, not per-worktree
The `.claude/` folder lives in the shared `.git` working tree state, so any change to the no-auto-commit hook ([.claude/hooks/no-auto-commit.mjs](../../.claude/hooks/no-auto-commit.mjs)) or the doc-sync hook ([.claude/hooks/doc-sync.mjs](../../.claude/hooks/doc-sync.mjs)) takes effect in every worktree the next time Claude Code starts there. The hooks themselves are committed code, so this is normally what you want.

### CLAUDE.md hard rules apply in every worktree
Worktrees inherit [CLAUDE.md hard rule #1 (no auto-commit)](../../CLAUDE.md#L9) and [#2 (update docs when code changes)](../../CLAUDE.md#L21) verbatim. Do not assume "it's just a scratch worktree" gives you license to skip authorization keywords or skip doc updates.

## Cleaning up

```bash
# Clean exit (branch deleted only if merged into main):
scripts/wt-remove.sh my-feature

# Discard uncommitted work in the worktree:
scripts/wt-remove.sh my-feature --force

# Remove the worktree but leave the branch around for a PR later:
scripts/wt-remove.sh my-feature --keep-branch
```

If you ever delete a `.worktrees/<name>/` folder by hand instead of via `wt-remove.sh`, run `git worktree prune` afterwards to clean up the dangling administrative records under `.git/worktrees/`.

## Related

- [CLAUDE.md hard rules](../../CLAUDE.md#L5) — the no-auto-commit and doc-sync rules apply in every worktree.
- [CLAUDE.md Domain Manifest](../../CLAUDE.md#L125) — `scripts/wt-*.sh` is registered under the `dev-tooling` domain.
- [docs/dev-tooling/README.md](./README.md) — index for this domain.
