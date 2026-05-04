#!/usr/bin/env bash
#
# wt-new.sh — Create a new git worktree under .worktrees/<name>/
#
# Usage:
#   scripts/wt-new.sh <name> [--from <branch>]
#
# Options:
#   <name>           Lower-kebab-case identifier (matches ^[a-z0-9-]+$).
#                    Becomes the folder under .worktrees/ and the suffix
#                    of the new branch feature/<name>.
#   --from <branch>  Base branch to fork from. Defaults to "main" if it
#                    exists locally, otherwise the current HEAD (warns).
#
# Safety:
#   - Refuses if .worktrees/<name>/ already exists.
#   - Validates name format (no spaces, no slashes, no upper-case).
#   - Runs `git fetch origin` first if an "origin" remote is configured;
#     skips silently otherwise.
#   - .env.local is COPIED (not symlinked) — Windows symlinks are fragile.
#   - Each worktree gets its own fresh node_modules via `npm install`.
#   - PORT is auto-assigned (3001+) by scanning sibling worktrees so
#     parallel `npm run dev` instances don't collide.
#
# Env: relies on git, npm. Reads repo-root .env.local if present.
#
# Docs: docs/dev-tooling/worktrees.md

set -euo pipefail

# ---------------------------------------------------------------------------
# Locate repo root (this script may be invoked from anywhere).
# ---------------------------------------------------------------------------
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$REPO_ROOT" ]]; then
  echo "wt-new: must be run inside a git repository" >&2
  exit 1
fi
cd "$REPO_ROOT"

# ---------------------------------------------------------------------------
# Parse args.
# ---------------------------------------------------------------------------
NAME=""
FROM=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --from)
      FROM="${2:-}"
      if [[ -z "$FROM" ]]; then
        echo "wt-new: --from requires a branch name" >&2
        exit 1
      fi
      shift 2
      ;;
    --from=*)
      FROM="${1#--from=}"
      shift
      ;;
    -h|--help)
      sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*)
      echo "wt-new: unknown option: $1" >&2
      exit 1
      ;;
    *)
      if [[ -n "$NAME" ]]; then
        echo "wt-new: unexpected positional arg: $1 (already set name=$NAME)" >&2
        exit 1
      fi
      NAME="$1"
      shift
      ;;
  esac
done

if [[ -z "$NAME" ]]; then
  echo "wt-new: missing <name>" >&2
  echo "Usage: scripts/wt-new.sh <name> [--from <branch>]" >&2
  exit 1
fi

if [[ ! "$NAME" =~ ^[a-z0-9-]+$ ]]; then
  echo "wt-new: invalid name '$NAME' — must match ^[a-z0-9-]+\$ (lower-kebab-case)" >&2
  exit 1
fi

WT_PATH=".worktrees/$NAME"
BRANCH="feature/$NAME"

if [[ -e "$WT_PATH" ]]; then
  echo "wt-new: $WT_PATH already exists — pick a different name or remove it first" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Determine base branch.
# ---------------------------------------------------------------------------
if [[ -z "$FROM" ]]; then
  if git show-ref --verify --quiet refs/heads/main; then
    FROM="main"
  else
    FROM="$(git rev-parse --abbrev-ref HEAD)"
    echo "wt-new: WARNING — local 'main' not found; basing off current HEAD '$FROM'" >&2
  fi
fi

if ! git rev-parse --verify "$FROM" >/dev/null 2>&1; then
  echo "wt-new: base branch '$FROM' does not exist" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Fetch origin if configured.
# ---------------------------------------------------------------------------
if git remote get-url origin >/dev/null 2>&1; then
  echo "wt-new: fetching origin..."
  if ! git fetch origin --quiet; then
    echo "wt-new: WARNING — git fetch origin failed; continuing with local refs" >&2
  fi
fi

# ---------------------------------------------------------------------------
# Create the worktree.
# ---------------------------------------------------------------------------
mkdir -p .worktrees
echo "wt-new: creating worktree $WT_PATH on new branch $BRANCH from $FROM"
git worktree add "$WT_PATH" -b "$BRANCH" "$FROM"

# ---------------------------------------------------------------------------
# Copy .env.local from repo root.
# ---------------------------------------------------------------------------
ENV_SRC="$REPO_ROOT/.env.local"
ENV_DST="$WT_PATH/.env.local"
if [[ -f "$ENV_SRC" ]]; then
  cp "$ENV_SRC" "$ENV_DST"
  echo "wt-new: copied .env.local into $WT_PATH"
else
  echo "wt-new: WARNING — repo root has no .env.local; skipping env copy" >&2
fi

# ---------------------------------------------------------------------------
# Compute next free PORT (3001+) by scanning sibling worktree env files.
# ---------------------------------------------------------------------------
PORT=3001
shopt -s nullglob
for env_file in .worktrees/*/.env.local; do
  # Skip the new one we just created; its PORT is not set yet.
  if [[ "$env_file" == "$ENV_DST" ]]; then
    continue
  fi
  existing="$(grep -E '^PORT=' "$env_file" 2>/dev/null | tail -n 1 | cut -d= -f2 | tr -d '[:space:]' || true)"
  if [[ -n "$existing" && "$existing" =~ ^[0-9]+$ ]]; then
    if (( existing >= PORT )); then
      PORT=$(( existing + 1 ))
    fi
  fi
done
shopt -u nullglob

# ---------------------------------------------------------------------------
# Append PORT to the new worktree's .env.local (idempotent — strip first).
# ---------------------------------------------------------------------------
if [[ -f "$ENV_DST" ]]; then
  # Remove any existing PORT line, then append the assigned one.
  tmp="$(mktemp)"
  grep -v -E '^PORT=' "$ENV_DST" > "$tmp" || true
  mv "$tmp" "$ENV_DST"
  # Ensure file ends with newline before append.
  if [[ -s "$ENV_DST" ]] && [[ "$(tail -c 1 "$ENV_DST" | od -An -c | tr -d ' ')" != "\\n" ]]; then
    printf '\n' >> "$ENV_DST"
  fi
  printf 'PORT=%s\n' "$PORT" >> "$ENV_DST"
else
  # No env file at all — create a one-line one with just PORT so dev server picks it up.
  printf 'PORT=%s\n' "$PORT" > "$ENV_DST"
  echo "wt-new: created minimal $ENV_DST with PORT=$PORT only"
fi
echo "wt-new: assigned PORT=$PORT"

# ---------------------------------------------------------------------------
# Install deps in the new worktree.
# ---------------------------------------------------------------------------
echo "wt-new: running npm install in $WT_PATH (this may take a minute)..."
INSTALL_RC=0
( cd "$WT_PATH" && npm install ) || INSTALL_RC=$?
if [[ $INSTALL_RC -ne 0 ]]; then
  echo "wt-new: npm install FAILED (exit $INSTALL_RC) — worktree was created but is unusable until deps install" >&2
  echo "wt-new: try \`cd $WT_PATH && npm install\` manually, or remove with scripts/wt-remove.sh $NAME" >&2
  exit "$INSTALL_RC"
fi

# ---------------------------------------------------------------------------
# Summary.
# ---------------------------------------------------------------------------
echo ""
echo "wt-new: ✓ worktree ready"
echo "  path:   $WT_PATH"
echo "  branch: $BRANCH (from $FROM)"
echo "  port:   $PORT"
echo ""
echo "  Run: cd $WT_PATH && npm run dev"
