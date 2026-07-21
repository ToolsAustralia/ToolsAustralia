/**
 * Unit test for `decidePauseTransition` — the pure decision shared by the Stripe webhook
 * (`handleSubscriptionUpdated`) and the `cancellation-retention-resume` cron backstop that owns the
 * app-side retention-`paused` membership state. No Stripe / DB / env — pure inputs → decision.
 *
 * Run: `npm run test:pause-transition`
 */
import { decidePauseTransition } from "../pauseCollectionPolicy";

let failures = 0;
function eq(name: string, actual: unknown, expected: unknown) {
  if (actual !== expected) {
    console.error(`FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failures += 1;
  }
}

// Timeline: pause accepted → freeze begins at period end (pausedFrom) → auto-resume 30d later (pausedUntil).
const pausedFrom = new Date("2026-03-01T00:00:00Z"); // freeze start (member's period end)
const pausedUntil = new Date("2026-03-31T00:00:00Z"); // resume date (pausedFrom + 30d)
const beforeWindow = new Date("2026-02-20T00:00:00Z"); // still in the paid period
const inWindow = new Date("2026-03-10T00:00:00Z"); // frozen
const afterWindow = new Date("2026-04-05T00:00:00Z"); // past the resume date

// 1. FLIP once the freeze window has begun (retention pause live, not yet flipped).
eq(
  "flip once window started",
  decidePauseTransition({
    pauseCollectionPresent: true,
    pauseReason: "retention",
    dbStatus: "active",
    pausedFrom,
    pausedUntil,
    now: inWindow,
  }),
  "flip_to_paused"
);

// 2. NO flip before the window — the member keeps the paid period they bought.
eq(
  "no flip before window (paid period)",
  decidePauseTransition({
    pauseCollectionPresent: true,
    pauseReason: "retention",
    dbStatus: "active",
    pausedFrom,
    pausedUntil,
    now: beforeWindow,
  }),
  "none"
);

// 3. NO flip if already paused — idempotent; the member simply stays paused.
eq(
  "no flip if already paused",
  decidePauseTransition({
    pauseCollectionPresent: true,
    pauseReason: "retention",
    dbStatus: "paused",
    pausedFrom,
    pausedUntil,
    now: inWindow,
  }),
  "none"
);

// 4. NO flip after the window is over (Stripe should have resumed; don't re-freeze).
eq(
  "no flip after window over",
  decidePauseTransition({
    pauseCollectionPresent: true,
    pauseReason: "retention",
    dbStatus: "active",
    pausedFrom,
    pausedUntil,
    now: afterWindow,
  }),
  "none"
);

// 5. NO flip for a NON-retention (recovery/keep_as_draft) pause — only retention drives `paused`.
eq(
  "no flip for a recovery pause",
  decidePauseTransition({
    pauseCollectionPresent: true,
    pauseReason: undefined,
    dbStatus: "active",
    pausedFrom,
    pausedUntil,
    now: inWindow,
  }),
  "none"
);

// 6. RESTORE: DB says paused but Stripe already resumed (pause_collection gone).
eq(
  "restore when Stripe resumed",
  decidePauseTransition({
    pauseCollectionPresent: false,
    pauseReason: "retention",
    dbStatus: "paused",
    pausedFrom,
    pausedUntil,
    now: afterWindow,
  }),
  "restore_from_paused"
);

// 7. NO restore when the member isn't paused.
eq(
  "no restore when active",
  decidePauseTransition({
    pauseCollectionPresent: false,
    pauseReason: undefined,
    dbStatus: "active",
    pausedFrom: null,
    pausedUntil: null,
    now: inWindow,
  }),
  "none"
);

// 8. FLIP with a null pausedUntil (open-ended window is treated as not-over).
eq(
  "flip with null pausedUntil",
  decidePauseTransition({
    pauseCollectionPresent: true,
    pauseReason: "retention",
    dbStatus: "active",
    pausedFrom,
    pausedUntil: null,
    now: inWindow,
  }),
  "flip_to_paused"
);

if (failures === 0) {
  console.log("PASS decidePauseTransition (8 cases)");
  process.exit(0);
} else {
  console.error(`${failures} decidePauseTransition test(s) failed`);
  process.exit(1);
}
