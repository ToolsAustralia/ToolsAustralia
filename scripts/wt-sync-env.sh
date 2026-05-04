#!/usr/bin/env bash
#
# wt-sync-env.sh — Re-copy repo-root .env.local into every worktree
#
# Usage:
#   scripts/wt-sync-env.sh
#
# Options:
#   (none)
#
# Safety:
#   - Read-only against the repo-root .env.local; only writes to files
#     under .worktrees/<name>/.env.local.
#   - Each worktree's existing PORT= value is preserved across the copy.
#     If the worktree had no PORT line, none is added (run wt-new again
#     for that, or assign manually).
#   - Skips if repo root has no .env.local.
#
# Env: relies on cp, grep.
#
# Use case: you rotated a secret (Stripe key, Mongo URI, SendGrid token)
# in the main checkout's .env.local — run this to push it to every
# attached worktree without nuking their per-worktree PORT assignments.
#
# Docs: docs/dev-tooling/worktrees.md

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$REPO_ROOT" ]]; then
  echo "wt-sync-env: must be run inside a git repository" >&2
  exit 1
fi
cd "$REPO_ROOT"

ENV_SRC="$REPO_ROOT/.env.local"
if [[ ! -f "$ENV_SRC" ]]; then
  echo "wt-sync-env: repo root has no .env.local — nothing to sync" >&2
  exit 1
fi

if [[ ! -d ".worktrees" ]]; then
  echo "wt-sync-env: no .worktrees/ directory — nothing to do"
  exit 0
fi

shopt -s nullglob
COUNT=0
for wt in .worktrees/*/; do
  # Strip trailing slash for cleaner output.
  wt="${wt%/}"
  name="${wt#.worktrees/}"
  dst="$wt/.env.local"

  # Snapshot the existing PORT line (if any).
  port_line=""
  if [[ -f "$dst" ]]; then
    port_line="$(grep -E '^PORT=' "$dst" 2>/dev/null | tail -n 1 || true)"
  fi

  cp "$ENV_SRC" "$dst"

  # Re-apply the saved PORT if there was one. Strip any PORT inherited from
  # the source first (the root usually doesn't have one, but be defensive).
  if [[ -n "$port_line" ]]; then
    tmp="$(mktemp)"
    grep -v -E '^PORT=' "$dst" > "$tmp" || true
    mv "$tmp" "$dst"
    if [[ -s "$dst" ]] && [[ "$(tail -c 1 "$dst" | od -An -c | tr -d ' ')" != "\\n" ]]; then
      printf '\n' >> "$dst"
    fi
    printf '%s\n' "$port_line" >> "$dst"
  fi

  port_val="${port_line#PORT=}"
  echo "wt-sync-env: synced $wt (PORT=${port_val:-—})"
  COUNT=$((COUNT + 1))
done
shopt -u nullglob

if [[ $COUNT -eq 0 ]]; then
  echo "wt-sync-env: no worktrees under .worktrees/ — nothing to sync"
fi
