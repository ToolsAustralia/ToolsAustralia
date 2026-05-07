# Draws — Frontend

## Pages

| Path | Purpose |
|---|---|
| `src/app/(site)/major-draw/page.tsx` | Current major draw landing — hero, countdown, entry CTA |
| `src/app/(site)/mini-draws/[id]/` | Individual mini-draw detail page |
| `src/app/(site)/mini-draw-success/` | Post-purchase success for mini-draw entry |
| `src/app/(site)/draw-results/` | Past major draws |
| `src/app/(site)/winners/` | Winner gallery |

## Key components

| Component | Purpose |
|---|---|
| `src/app/(site)/mini-draws/[id]/components/MiniDrawCountdown.tsx` | Countdown timer to mini-draw end |
| `src/app/(site)/mini-draws/[id]/components/ShareButton.tsx` | Social-share for mini-draw |
| _other major-draw components_ | _TODO: enumerate from src/components/ that map to draws (per the manifest, draws-domain components are not pulled out separately — they live near pages)._ |

## Hooks

| Hook | Purpose | Source |
|---|---|---|
| `useMajorDrawEntryCta()` | CTA state for the major-draw entry button | [src/hooks/useMajorDrawEntryCta.ts](../../src/hooks/useMajorDrawEntryCta.ts) |
| `useMajorDrawPurchaseGate()` | Gating logic — should the user be allowed to purchase right now? | [src/hooks/useMajorDrawPurchaseGate.ts](../../src/hooks/useMajorDrawPurchaseGate.ts) |
| `useMiniDrawTrigger()` | Trigger / opening mini-draw modals or flows | [src/hooks/useMiniDrawTrigger.ts](../../src/hooks/useMiniDrawTrigger.ts) |
| `usePastDrawsData()` | Fetch list of past draws for results page | [src/hooks/usePastDrawsData.ts](../../src/hooks/usePastDrawsData.ts) |

> _TODO: verify each hook's contract by reading source._

## Client state

- All draw reads via TanStack Query.
- Countdown components compute their own `now()` ticks — server-rendered draw end-dates are the source of truth.
- No Zustand for draws.

## Display formatting

- Winner names are rendered via [src/utils/winner-name-formatter.ts](../../src/utils/winner-name-formatter.ts) — privacy convention (first name + last initial).
- Eligibility messaging via [src/utils/giveaway-eligibility.ts](../../src/utils/giveaway-eligibility.ts).

## Cross-domain notes

### Winner testimony display

The cinematic Hear From Our Winners section + Read Full Story modal live under [src/components/sections/winner-testimony/](../../src/components/sections/winner-testimony/) — owned by the **shared-ui** domain (see [docs/shared-ui/frontend.md](../shared-ui/frontend.md#sectionswinner-testimony--hear-from-our-winners)). Draws-domain code (the `Winner` model, `WinnerSummary` type, [src/utils/winners.ts](../../src/utils/winners.ts) helpers) feeds it; the visual layout is owned by shared-ui.

Refactored 2026-05-04: the photo is now used as a full-bleed cinematic background (not a centered display image) and the modal uses a magazine-article layout. No data-shape, API, or business-logic changes.

## E2E test IDs (draws/major)

| Component | testid string | Notes |
|---|---|---|
| `src/components/banners/FloatingCountdownBanner.tsx` (outer `motion.div`) | `floating-countdown-banner` | Only mounts after `useCurrentMajorDraw` returns data; absent in seeded/empty test DBs |
| `src/components/modals/PastDrawsModal.tsx` (`ModalContainer testId`) | `past-draws-modal` | Triggered from `MajorDrawOverview` "View Past Draws" button on `/my-account` |

Existing testids (already registered in `e2e/utils/selectors.ts`) consumed by these specs: `gate-closed-modal`, `login-prompt-modal`, `membership-modal`.

## E2E spec coverage (draws/major)

Specs live in `e2e/draws/major/*.spec.ts`. Run with `npx playwright test e2e/draws/major/<file> --project=chromium-<role>`.

| Spec | Project | Status | Notes |
|---|---|---|---|
| `view.spec.ts` | `chromium-guest` | NARROWED | `/major-draw` → 308 redirect to `/promotional/giveaway` (404 today). Asserts redirect occurred + body renders. |
| `entry-guest.spec.ts` | `chromium-guest` | NARROWED | Guest entry-CTA gating not exercisable until redirect destination is restored; spec records BLOCKED annotation. |
| `entry-member.spec.ts` | — | BLOCKED | Same redirect-target issue as above + relies on full Stripe walk; deferred. |
| `entry-promo.spec.ts` | — | BLOCKED | No live promo slug in seed; full purchase walk required. |
| `entry-declined.spec.ts` | — | BLOCKED | Full Stripe walk with DECLINED card — out of fan-out scope. |
| `entry-3ds.spec.ts` | — | BLOCKED | Full Stripe walk with 3DS challenge — out of fan-out scope. |
| `cooldown.spec.ts` | — | BLOCKED | Depends on full purchase flow + post-entry re-click within cooldown window. |
| `gate-closed.spec.ts` | `chromium-guest` | NARROWED | Cannot deterministically force gate-closed without seeded major draw; asserts page survives. |
| `past-draws.spec.ts` | `chromium-fresh` | PASS | Asserts `PastDrawsModal` opens from `/my-account`. Uses `dispatchEvent("click")` to bypass `FloatingCountdownBanner` overlay. |
| `winners.spec.ts` | `chromium-guest` | PASS | `/winners` renders + `/api/winners/all` resolves; tolerates empty list. |
| `countdown-banner.spec.ts` | `chromium-guest` | PASS | Asserts `FloatingCountdownBanner` mounts conditionally on home; tolerates absence (no major draw seeded). |

Restoring blocked specs requires: (a) restoring the `/promotional/giveaway` route or changing the `/major-draw` redirect target, (b) seeding an active `MajorDraw` document in `scripts/seed-e2e-fixtures.ts`, (c) parametrising the existing payment-element helper for DECLINED/3DS variants in shop-style flows.

## E2E spec coverage (draws/mini)

Specs live in `e2e/draws/mini/*.spec.ts`. Run with `npx playwright test e2e/draws/mini/<file> --project=chromium-<role>`.

| Spec | Project | Status | Notes |
|---|---|---|---|
| `list.spec.ts` | `chromium-guest` | PASS | `/mini-draws` renders. Hero heading visible; results header tolerates either populated count ("Showing N-M of T") or empty-state ("No mini draws found"). |
| `purchase.spec.ts` | `chromium-fresh` | NARROWED | Looks up an active mini-draw with capacity via `getDb()`. Asserts detail page renders the package picker (Secure Payment / Instant Entry trust signals visible). Full Stripe walk BLOCKED — out of fan-out scope. SKIPS if no active draw with capacity in DB. |
| `success.spec.ts` | `chromium-fresh` | PASS | `/mini-draw-success` renders without a real `payment_intent` query — heading, body copy, and the two CTA links visible. |
| `stock.spec.ts` | `chromium-guest` | PASS | Mutates an active mini-draw to `totalEntries == minimumEntries` so `entriesRemaining <= 0`, asserts "Entries are now closed" copy, then restores in `finally`. SKIPS if no mini-draws exist. Serial mode. |
| `promo-applied.spec.ts` | `chromium-fresh` | BLOCKED | No active `Promo` documents in test DB. Spec records BLOCKED annotation and `test.skip()`. Restoring requires seeding an active multiplier promo and wiring it through a mini-draw entry walk. |

Restoring `purchase.spec.ts` to a full walk requires: parametrising the payment-element helper with the mini-draw `MiniDrawPackageModal` flow (different from shop checkout) and asserting the post-purchase increment of `userEntryCount` via `useMiniDraw` query rehydration. The DB-backed lookup (vs. fixture-seeded ID) means specs are robust to dev-DB rotation but skip cleanly when the DB is wiped — adding a `MiniDraw` seed in `scripts/seed-e2e-fixtures.ts` would harden the suite.

## Banner specs (added 2026-05-05)

`e2e/banners-widgets/` (project: `chromium-guest`) covers the floating banners that orbit the draws domain:

| Spec | Status | Notes |
|---|---|---|
| `floating-countdown-mode.spec.ts` | PASS | Asserts `FloatingCountdownBanner` mode-toggle: when mounted, headline matches "GATES CLOSED" (status !== "active", counts to next draw activationDate) OR "WIN THE BEST TRADIE SETUP" (gates open, counts to current draw drawDate). Tolerates absence of any major draw seed. Companion to the existing `e2e/draws/major/countdown-banner.spec.ts`. |
| `freeze-period-banner.spec.ts` | BLOCKED (skipped) | `FreezePeriodBanner` (file: `src/components/banners/FreezePeroidBanner.tsx`) is presentational only — no parent in `src/` mounts it conditional on a frozen MajorDraw. Asserting "renders when frozen" has no DOM target; reserve the testid in selectors registry for when the banner is wired up. |
