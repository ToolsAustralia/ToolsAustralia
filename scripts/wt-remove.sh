#!/usr/bin/env bash
#
# wt-remove.sh — Remove a worktree under .worktrees/<name>/
#
# Usage:
#   scripts/wt-remove.sh <name> [--force] [--keep-branch]
#
# Options:
#   <name>          The folder name under .worktrees/ to remove.
#   --force         Discard uncommitted changes in the worktree. Without this
#                   flag, the script aborts if `git status --porcelain` is
#                   non-empty inside the worktree.
#   --keep-branch   Do not attempt to delete the local feature/<name> branch
#                   even if it has been merged into main.
#
# Safety:
#   - Refuses if .worktrees/<name>/ does not exist.
#   - Will NOT discard uncommitted changes unless --force is passed; instead
#     prints the dirty file list and exits 1.
#   - Branch deletion uses `git branch -d` (refuses unmerged) by default.
#     Pass --keep-branch to skip the deletion attempt entirely.
#
# Env: relies on git.
#
# Docs: docs/dev-tooling/worktrees.md

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$REPO_ROOT" ]]; then
  echo "wt-remove: must be run inside a git repository" >&2
  exit 1
fi
cd "$REPO_ROOT"

NAME=""
FORCE=0
KEEP_BRANCH=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)        FORCE=1; shift ;;
    --keep-branch)  KEEP_BRANCH=1; shift ;;
    -h|--help)
      sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*)
      echo "wt-remove: unknown option: $1" >&2
      exit 1
      ;;
    *)
      if [[ -n "$NAME" ]]; then
        echo "wt-remove: unexpected positional arg: $1" >&2
        exit 1
      fi
      NAME="$1"
      shift
      ;;
  esac
done

if [[ -z "$NAME" ]]; then
  echo "wt-remove: missing <name>" >&2
  echo "Usage: scripts/wt-remove.sh <name> [--force] [--keep-branch]" >&2
  exit 1
fi

WT_PATH=".worktrees/$NAME"
BRANCH="feature/$NAME"

if [[ ! -d "$WT_PATH" ]]; then
  echo "wt-remove: $WT_PATH does not exist" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Check for uncommitted changes.
# ---------------------------------------------------------------------------
DIRTY="$(git -C "$WT_PATH" status --porcelain 2>/dev/null || true)"
if [[ -n "$DIRTY" && $FORCE -eq 0 ]]; then
  echo "wt-remove: $WT_PATH has uncommitted changes:" >&2
  echo "$DIRTY" | sed 's/^/  /' >&2
  echo "" >&2
  echo "wt-remove: refuse to remove dirty worktree — pass --force to discard" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Remove the worktree.
# ---------------------------------------------------------------------------
echo "wt-remove: removing worktree $WT_PATH"
if [[ $FORCE -eq 1 ]]; then
  git worktree remove --force "$WT_PATH"
else
  git worktree remove "$WT_PATH"
fi

# ---------------------------------------------------------------------------
# Optionally delete the branch.
# ---------------------------------------------------------------------------
BRANCH_STATUS="kept"
if [[ $KEEP_BRANCH -eq 1 ]]; then
  BRANCH_STATUS="kept (--keep-branch)"
elif git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  # `git branch -d` only succeeds if branch is fully merged into its upstream
  # or, lacking upstream, into HEAD. We check against main when present.
  base_ref="HEAD"
  if git show-ref --verify --quiet refs/heads/main; then
    base_ref="main"
  fi
  if git merge-base --is-ancestor "$BRANCH" "$base_ref" 2>/dev/null; then
    git branch -d "$BRANCH" >/dev/null
    BRANCH_STATUS="deleted (merged into $base_ref)"
  else
    echo "wt-remove: branch $BRANCH is not merged into $base_ref — leaving it in place" >&2
    echo "wt-remove: delete manually with \`git branch -D $BRANCH\` if you really want it gone" >&2
    BRANCH_STATUS="kept (unmerged)"
  fi
else
  BRANCH_STATUS="not found"
fi

# ---------------------------------------------------------------------------
# Summary.
# ---------------------------------------------------------------------------
echo ""
echo "wt-remove: ✓ done"
echo "  removed: $WT_PATH"
echo "  branch:  $BRANCH — $BRANCH_STATUS"
