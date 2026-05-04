#!/usr/bin/env bash
#
# wt-list.sh — Show all git worktrees attached to this repo
#
# Usage:
#   scripts/wt-list.sh
#
# Options:
#   (none)
#
# Safety:
#   Read-only. Never mutates state.
#
# Env: relies on git, optional du.
#
# Output columns:
#   NAME    folder under .worktrees/ (or "(main)" for the main checkout)
#   BRANCH  git branch checked out in that worktree
#   PORT    PORT line from the worktree's .env.local (or — if missing)
#   SIZE    disk size from `du -sh` (or — if du unavailable)
#   STATE   "dirty" if working tree has uncommitted changes, "clean" otherwise
#   PATH    absolute filesystem path
#
# Docs: docs/dev-tooling/worktrees.md

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$REPO_ROOT" ]]; then
  echo "wt-list: must be run inside a git repository" >&2
  exit 1
fi
cd "$REPO_ROOT"

# ---------------------------------------------------------------------------
# Parse `git worktree list --porcelain` into parallel arrays.
# Porcelain format: blank-line separated records, each with key/value lines.
# ---------------------------------------------------------------------------
declare -a WT_PATHS=()
declare -a WT_BRANCHES=()

cur_path=""
cur_branch=""
flush() {
  if [[ -n "$cur_path" ]]; then
    WT_PATHS+=("$cur_path")
    WT_BRANCHES+=("$cur_branch")
  fi
  cur_path=""
  cur_branch=""
}

while IFS= read -r line; do
  if [[ -z "$line" ]]; then
    flush
    continue
  fi
  case "$line" in
    worktree\ *) cur_path="${line#worktree }" ;;
    branch\ *)   cur_branch="${line#branch refs/heads/}" ;;
    detached)    cur_branch="(detached)" ;;
  esac
done < <(git worktree list --porcelain)
flush

# ---------------------------------------------------------------------------
# Helpers.
# ---------------------------------------------------------------------------
have_du=0
if command -v du >/dev/null 2>&1; then have_du=1; fi

read_port() {
  local env_file="$1/.env.local"
  if [[ -f "$env_file" ]]; then
    grep -E '^PORT=' "$env_file" 2>/dev/null | tail -n 1 | cut -d= -f2 | tr -d '[:space:]' || true
  fi
}

read_size() {
  if [[ $have_du -eq 1 ]]; then
    du -sh "$1" 2>/dev/null | cut -f1 || true
  fi
}

read_state() {
  local out
  out="$(git -C "$1" status --porcelain 2>/dev/null || true)"
  if [[ -n "$out" ]]; then echo "dirty"; else echo "clean"; fi
}

# ---------------------------------------------------------------------------
# Build rows. Main checkout first, then any under .worktrees/.
# ---------------------------------------------------------------------------
declare -a ROWS=()
ROWS+=("NAME|BRANCH|PORT|SIZE|STATE|PATH")

# Find which entry corresponds to the main checkout (== REPO_ROOT).
main_idx=-1
for i in "${!WT_PATHS[@]}"; do
  norm="${WT_PATHS[$i]//\\//}"
  root_norm="${REPO_ROOT//\\//}"
  if [[ "$norm" == "$root_norm" ]]; then
    main_idx=$i
    break
  fi
done

if [[ $main_idx -ge 0 ]]; then
  p="${WT_PATHS[$main_idx]}"
  b="${WT_BRANCHES[$main_idx]:-(detached)}"
  size="$(read_size "$p")"
  state="$(read_state "$p")"
  ROWS+=("(main)|$b|—|${size:-—}|$state|$p")
fi

for i in "${!WT_PATHS[@]}"; do
  if [[ $i -eq $main_idx ]]; then continue; fi
  p="${WT_PATHS[$i]}"
  b="${WT_BRANCHES[$i]:-(detached)}"
  # Only display worktrees living under .worktrees/ relative to repo root.
  rel="${p#$REPO_ROOT/}"
  case "$rel" in
    .worktrees/*)
      name="${rel#.worktrees/}"
      name="${name%%/*}"
      ;;
    *)
      # External worktrees (created outside this repo's convention) — still show.
      name="$(basename "$p")"
      ;;
  esac
  port="$(read_port "$p")"
  size="$(read_size "$p")"
  state="$(read_state "$p")"
  ROWS+=("$name|$b|${port:-—}|${size:-—}|$state|$p")
done

# ---------------------------------------------------------------------------
# Pretty-print as a column-aligned table.
# ---------------------------------------------------------------------------
# Compute column widths.
declare -a W=(0 0 0 0 0 0)
for row in "${ROWS[@]}"; do
  IFS='|' read -ra cols <<< "$row"
  for j in "${!cols[@]}"; do
    len=${#cols[$j]}
    if (( len > W[j] )); then W[j]=$len; fi
  done
done

print_row() {
  IFS='|' read -ra cols <<< "$1"
  local out=""
  for j in "${!cols[@]}"; do
    if (( j == ${#cols[@]} - 1 )); then
      out+="${cols[$j]}"
    else
      printf -v cell "%-${W[$j]}s" "${cols[$j]}"
      out+="$cell  "
    fi
  done
  echo "$out"
}

for row in "${ROWS[@]}"; do
  print_row "$row"
done
