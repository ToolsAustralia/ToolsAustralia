#!/usr/bin/env bash
#
# run-test-suites.sh — run every `test:*` npm script that can pass without secrets.
#
# This is the body of CI's "test suites" step, kept out of the workflow YAML for one
# reason: you can run it yourself. Reproducing a red CI should not require pushing.
#
#   bash .github/scripts/run-test-suites.sh            # run them
#   bash .github/scripts/run-test-suites.sh --list     # just print what would run/skip
#
# Locally you will have a .env.local, so suites the runner cannot pass will pass for
# you. That difference is the whole reason the SKIP table below exists.
#
# Docs: docs/dev-tooling/ci.md

set -uo pipefail

cd "$(dirname "$0")/../.." || exit 1

# ---------------------------------------------------------------------------
# SKIP — every suite that cannot pass on a runner today, with WHY.
#
# Measured 2026-09-04 by running all 292 suites with no .env.local and every
# relevant variable unset: 246 passed, these 46 failed. Not inferred from names.
#
# The reason tags are load-bearing. `NEEDS_*` means "we could turn this on by
# giving CI a thing" and Phase 2 of docs/superpowers/specs/2026-09-04-ci-pipeline-design.md
# does exactly that. POLICY and BROKEN never become NEEDS_*.
# ---------------------------------------------------------------------------

# NEEDS_MONGO — src/lib/mongodb.ts throws from getMongoURI() without MONGODB_URI.
SKIP_NEEDS_MONGO=(
  test:bonus-code-mint
  test:bonus-code-webhook
  test:campaign-enrolment
  test:campaign-window
  test:checkout-intent-recovery
  test:claim-grant-compensation
  test:code-visibility
  test:dashboard-stats-aggregator
  test:dashboard-stats-reader
  test:dashboard-stats-service
  test:global-campaign-enrolment
  test:hourly-revenue
  test:membership-snapshot-write-once
  test:norm-call-log
  test:norm-kill-switch
  test:norm-pending
  test:norm-permissions
  test:norm-receipt
  test:norm-user-service-account
  test:norm-with-norm
  test:recovery-claim
  test:renewal-grant-reconciler
  test:resolve-norm-date-range
  test:upsell-entries-v2
  test:upsell-multiplier-resolver
  test:webhook-queue-claim
  test:webhook-queue-enqueue
  test:webhook-queue-mark-result
  test:webhook-queue-orphan-recovery
)

# NEEDS_E2E_MONGO — these read E2E_MONGODB_URI, never MONGODB_URI, and refuse to
# fall back so they can never touch a real database. checkout-reuse additionally
# requires /e2e/i to match the whole connection string.
SKIP_NEEDS_E2E_MONGO=(
  test:shop-checkout-reuse
  test:shop-entries
)

# NEEDS_STRIPE_KEY — src/lib/stripe.ts:4-5 throws at module scope, so these die at
# import without ever calling Stripe. Presence is enough; validity is not needed.
SKIP_NEEDS_STRIPE_KEY=(
  test:ack-gate
  test:allowlist-reconcile
  test:campaign-refund-reversal
  test:force-charge-mint-map
  test:mint-current-cycle
  test:prepare-recovered-cycle
  test:webhook-queue-process
  test:webhook-queue-replay-safe
  test:zero-trial-guard
)

# NEEDS_AUTH_ENV — src/lib/auth.ts:24-40 gates on FIVE vars (NEXTAUTH_SECRET,
# NEXTAUTH_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, MONGODB_URI) with a !value
# test, and throws at module scope. Note: an empty string counts as missing, and
# next-auth's parseUrl throws on NEXTAUTH_URL='' — never blank these, unset them.
SKIP_NEEDS_AUTH_ENV=(
  test:api-auth-permissions
  test:campaign-code-metadata
  test:staff-activity
)

# POLICY — never runs in CI, no matter what secrets exist. This one POSTs and GETs
# against the LIVE production partner portal myrewards.toolsaustralia.com.au, so
# giving CI the secret would fire real third-party traffic on every push.
SKIP_POLICY=(
  test:igodirect-sso
)

# BROKEN — genuinely failing on main, not an environment problem. Each must be
# fixed and removed from this list; this category is meant to be empty.
#   subscription-management: 5/5 "invariant expected app router to be mounted".
#     The test mounts UserProvider (:157) which reads usePathname, and provides no
#     router. Already red when the original skip list was written on 2026-08-19.
#   dashboard-date-range: real assertion — membershipAsOfMode expected "live",
#     got "snapshot". Skipped since 2026-08-19.
SKIP_BROKEN=(
  test:dashboard-date-range
  test:subscription-management
)

SKIP=(
  "${SKIP_NEEDS_MONGO[@]}"
  "${SKIP_NEEDS_E2E_MONGO[@]}"
  "${SKIP_NEEDS_STRIPE_KEY[@]}"
  "${SKIP_NEEDS_AUTH_ENV[@]}"
  "${SKIP_POLICY[@]}"
  "${SKIP_BROKEN[@]}"
)

# Coverage ratchet. Raise it deliberately when suites are added; a DROP means a
# script was deleted or renamed, which is the one failure this file cannot detect
# any other way. Measured 2026-09-04: 292 total - 46 skipped = 246.
BASELINE=246

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
