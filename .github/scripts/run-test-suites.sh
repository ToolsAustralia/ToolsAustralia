#!/usr/bin/env bash
#
# run-test-suites.sh — run every `test:*` npm script that CI can run.
#
# This is the body of CI's "test suites" step, kept out of the workflow YAML for one
# reason: you can run it yourself. Reproducing a red CI should not require pushing.
#
#   bash .github/scripts/run-test-suites.sh            # run them
#   bash .github/scripts/run-test-suites.sh --list     # just print what would run/skip
#
# It expects the same environment the `suites` job provides — a MongoDB with the
# fixtures seeded, plus the five placeholder vars. See "Run the checks yourself" in
# docs/dev-tooling/ci.md for the two docker commands that reproduce it locally.
# Without a database, 43 suites fail here that pass in CI.
#
# Docs: docs/dev-tooling/ci.md

set -uo pipefail

cd "$(dirname "$0")/../.." || exit 1

# ---------------------------------------------------------------------------
# SKIP — every suite CI does not run, with WHY.
#
# Measured 2026-09-04 against a seeded mongo:8.0 single-node replica set: of 293
# suites, 292 run and pass. ONE is excluded. Not inferred from names.
#
# Both categories are permanent-or-bug, never environment:
#   POLICY  — must never run automatically, whatever we provision.
#   BROKEN  — a real defect. Fix it and delete the line. Currently EMPTY.
#
# There is deliberately no third category for "needs a service we could provide".
# Before the database there were 43 such suites in four NEEDS_* groups; Phase 2
# provisioned what they needed instead of leaving them listed here. If you find
# yourself adding a NEEDS_* group back, provision the thing instead — a skip list
# that accumulates environment excuses is how the previous one rotted.
# ---------------------------------------------------------------------------

# POLICY — never runs in CI, no matter what secrets or services exist. This one
# POSTs and GETs against the LIVE production partner portal
# myrewards.toolsaustralia.com.au (:126, :148), so giving CI the secret would fire
# real third-party traffic on every push. This category never becomes NEEDS_*.
SKIP_POLICY=(
  test:igodirect-sso
)

# BROKEN — genuinely failing on main. Not an environment problem, and NOT fixed by
# the database. Each must be fixed and its line deleted.
#
# THIS CATEGORY IS EMPTY, WHICH IS THE POINT. Both former entries were fixed on
# 2026-09-04 rather than left skipped:
#   subscription-management — the test mounted UserProvider (which reads usePathname)
#     without an app-router context, so all 5 cases threw. The sibling MembershipModal
#     test had always provided one. Fixed by wrapping the same two contexts.
#   dashboard-date-range — the TEST was stale, not the code. It asserted that every
#     range reads live membership; snapshot-for-past-ranges shipped 2026-04-29, one day
#     after the test was last touched, and is documented in docs/admin/backend.md:334.
#
# Adding an entry here is admitting a real defect ships unchecked. Prefer fixing it.
SKIP_BROKEN=()

SKIP=(
  "${SKIP_POLICY[@]}"
  "${SKIP_BROKEN[@]}"
)

# Coverage ratchet. Raise it deliberately when suites are added; a DROP means a
# script was deleted or renamed, which is the one failure this file cannot detect
# any other way.
#
# Measured 2026-09-04 against a seeded mongo:8.0 single-node replica set with the
# five placeholder vars: 293 total - 1 skipped = 292 run, 292 pass, 0 fail.
#
# How it got here: 246 before CI had a database; 289 once the container and seed step
# landed; 290 after check:test-scripts found test:klaviyo-bulk-import had never run
# anywhere; 292 once the two genuinely-broken suites were fixed instead of skipped.
BASELINE=292

# ---------------------------------------------------------------------------
# Discover suites. `test` (no colon) is an alias for test:anchor-billing, so
# filtering on the `test:` prefix keeps it from running twice.
# ---------------------------------------------------------------------------
mapfile -t ALL < <(node -p "Object.keys(require('./package.json').scripts).filter(s => s.startsWith('test:')).sort().join('\n')")

if [ "${#ALL[@]}" -eq 0 ]; then
  echo "FATAL: found no test:* scripts. Wrong directory, or package.json is unreadable." >&2
  exit 1
fi

is_skipped() {
  local needle="$1"
  local s
  for s in "${SKIP[@]}"; do [ "$s" = "$needle" ] && return 0; done
  return 1
}

# ---------------------------------------------------------------------------
# Integrity check 1: every SKIP entry must name a script that still exists.
#
# Without this, renaming a suite leaves a dead skip entry, the rename runs
# unnoticed, and the list rots exactly the way the 2026-08 one did.
# ---------------------------------------------------------------------------
STALE=()
for s in "${SKIP[@]}"; do
  found=0
  for a in "${ALL[@]}"; do [ "$s" = "$a" ] && { found=1; break; }; done
  [ "$found" -eq 0 ] && STALE+=("$s")
done

if [ "${#STALE[@]}" -gt 0 ]; then
  echo "FAIL: ${#STALE[@]} skip-list entries name scripts that no longer exist:" >&2
  printf '  %s\n' "${STALE[@]}" >&2
  echo "Fix: delete them from the SKIP arrays, or correct the rename." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Integrity check 2: the run count must equal total minus skipped, and must not
# fall below the committed baseline.
# ---------------------------------------------------------------------------
EXPECTED=$(( ${#ALL[@]} - ${#SKIP[@]} ))

if [ "$EXPECTED" -lt "$BASELINE" ]; then
  echo "FAIL: only $EXPECTED suites would run; baseline is $BASELINE." >&2
  echo "A suite was deleted, renamed, or newly skipped. If that was deliberate," >&2
  echo "lower BASELINE in this file in the same commit, and say why." >&2
  exit 1
fi

if [ "${1:-}" = "--list" ]; then
  echo "total=${#ALL[@]} skip=${#SKIP[@]} would_run=$EXPECTED baseline=$BASELINE"
  echo "--- skipped ---"
  printf '  %s\n' "${SKIP[@]}" | sort
  exit 0
fi

echo "Running $EXPECTED of ${#ALL[@]} suites (${#SKIP[@]} skipped, baseline $BASELINE)"
echo

# ---------------------------------------------------------------------------
# Run them.
# ---------------------------------------------------------------------------
FAILED=()
RAN=0

for suite in "${ALL[@]}"; do
  is_skipped "$suite" && continue
  RAN=$(( RAN + 1 ))
  if out=$(npm run --silent "$suite" 2>&1); then
    echo "PASS  $suite"
  else
    echo "FAIL  $suite"
    # Suites print err.message, rarely err.stack, so keep a generous tail — it is
    # often the only diagnostic a reader of a red run will get.
    printf '%s\n' "$out" | tail -40 | sed 's/^/      /'
    FAILED+=("$suite")
  fi
done

echo
echo "ran $RAN, ${#FAILED[@]} failed, ${#SKIP[@]} skipped"

# A filter bug that ran nothing would otherwise report success — the worst outcome
# for a check nobody reads twice.
if [ "$RAN" -ne "$EXPECTED" ]; then
  echo "FAIL: ran $RAN but expected $EXPECTED. The suite filter is broken." >&2
  exit 1
fi

if [ "${#FAILED[@]}" -gt 0 ]; then
  echo
  echo "Failed suites:" >&2
  printf '  %s\n' "${FAILED[@]}" >&2
  echo >&2
  echo "Reproduce one locally with: npm run <suite>" >&2
  exit 1
fi

echo "All $RAN suites passed."
