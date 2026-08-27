# Dev Tooling — Frontend

## Pages

- `src/app/dev/` — dev panel
- `src/app/dev/modals/` — interactive modal/overlay gallery
- `src/app/dev/membershipsection/` — electric package card preview (returns 404 in production)
- `src/app/dev/cancellation-flow/` — cancellation-flow design/QA harness (returns 404 in production)
- `src/app/test-pixels/` — pixel testing

## Components

[src/components/dev/](../../src/components/dev/) — dev-only UI.

### MembershipSectionDevClient

`src/components/dev/MembershipSectionDevClient.tsx` — electric package card preview harness. Controls:
- **User state**: `guest` | `subscriber` | `entries` — drives which one-time tab shows (regular vs Additional packs)
- **Tab**: `one-time` | `membership` — switches between `ElectricPackageCard` with `getElectricPackageColorScheme` (one-time) and `getMembershipSectionColorScheme` (membership)
- **Multiplier**: `1x` / `2x` / `5x` / `10x` — simulates promo multiplier in plan metadata
- **Theme toggle**: wraps output in a `.dark` class div
- **Reduced-motion**: adds `[&_*]:!transition-none [&_*]:!animate-none` to disable animations
- **Old-vs-new**: shows a reminder label to open the live section in another tab for comparison
- **Locked-preview**: forces the Additional packs to render in their locked state regardless of access, so the locked card UI can be previewed from a no-access user state

The harness computes and passes `showBestValue` (boss tier for membership tab; power/vip tiers for one-time tab via `isOneTimeBestValuePlanId`) and `ribbon` ("MOST POPULAR" for foreman tier) to each `ElectricPackageCard`; the multiplier badge renders automatically when a 2x/5x/10x multiplier is selected.

No Stripe, no providers, no real purchase. Mock data sourced from `src/data/membershipPackages.ts`.

### ModalsGalleryClient

`src/components/dev/ModalsGalleryClient.tsx` — interactive gallery for all modals. Each modal entry has:
- A unique `id` string
- A `source` path (now updated to `src/components/modals/ReferFriendModal/index.tsx` for the decomposed folder structure)
- A label + category for the sidebar

When a modal is moved from a monolith `.tsx` file to a folder structure (`/index.tsx`), update the `source` path in the `MODAL_SOURCES` map inside this file. When a modal is **deleted**, remove all four of its touch points here — the import, its `MODAL_SOURCES` entry, its `MODAL_LIST` entry, and its render — or the gallery fails to compile.

**`MODAL_SOURCES` paths are strings, so nothing type-checks them.** Two entries had been silently wrong for months — `admin-major-draw-create` and `admin-winner-select` both pointed at `<Name>.tsx` files that were folders. Moving a modal only breaks the *import* loudly; the `source` string just keeps rendering a path that no longer exists. After any modal move, verify every mapped path resolves:

```bash
grep -oE '"src/components/modals/[^"]+"' src/components/dev/ModalsGalleryClient.tsx \
  | tr -d '"' | sort -u | while read p; do [ -f "$p" ] || echo "MISSING $p"; done
```

Note (2026-07-31): `ChannelDetailModal`'s gallery entry changed props — `utmSource="google"` became
`channel="google" channelLabel="Google"`, because the Page Analytics drill-down now takes a
canonical channel KEY plus a separate display label instead of a raw `utm_source` (see
[client-state frontend](../client-state/frontend.md)).

**This is the gallery's recurring failure mode and it is worth naming.** The gallery is a real
consumer of every modal's prop types, but it sits far from the feature being changed, so a prop
rename elsewhere surfaces here as a `tsc` error *after* the feature itself already compiles
cleanly. A sub-agent scoped to "the four Page Analytics component files" finished with a green
lint and a green scoped type-check, and the only remaining repo-wide error was this file. When
renaming or retyping a modal prop, grep the gallery in the same change:

```bash
grep -n "<TheModalName" src/components/dev/ModalsGalleryClient.tsx
```

Note (2026-07-30): the eight admin draws modals moved to `src/components/modals/draws/` (see [shared-ui architecture → Modal folder layout](../shared-ui/architecture.md)). Gallery imports and `MODAL_SOURCES` were updated, and the two stale folder paths above were fixed at the same time.

Note (2026-07-24): the `pixel-consent` / `PixelConsentModal` entry was removed — the component was deleted (panel F-019, a permanently-unreachable consent modal whose Decline gated nothing). See [docs/tracking/rules.md R9](../tracking/rules.md) for the no-consent-banner posture.

Note (2026-07-06): the gallery's `PackageSelectionModal` entry passes `onPlanSelect={close}` — the picker no
longer self-closes after a pick (close-after-pick is the parent's job inside `onPlanSelect`; `onClose` is
dismissal-only). See [shared-ui/frontend.md](../shared-ui/frontend.md) for the contract.

When a modal's props change, the gallery mount must follow. Note `ChargePastDueModal` (gallery id `admin-charge-past-due`) is now self-driven (it owns its `start → chunk` charge loop) and no longer takes an `onConfirm` prop — the gallery mounts it with just `isOpen`/`onClose` (the optional `onCompleted` is omitted). The separate `ChargePastDueUserModal` is unrelated and still uses `onConfirm`.

### CancellationFlowHarnessClient

`src/app/dev/cancellation-flow/CancellationFlowHarnessClient.tsx` — design/QA harness for the restyled cancellation-flow modal steps. Returns 404 in production (`process.env.NODE_ENV !== "development"`).

**Purpose:** Mount every real cancellation-flow component in every meaningful state on a single scrollable page so colours, typography, spacing, and motion can be reviewed and tuned without a network connection or a live Stripe subscription.

**Toolbar controls:**
- **Light/Dark toggle** — wraps the content area in a `dark` className, exercising all `dark:` Tailwind variants.
- **Viewport width** — narrows the panel container to 320 / 360 / 600 px to simulate mobile, small-phone, and wide-mobile breakpoints.
- **Reduced-motion** — toggled via OS preference or Chrome DevTools > Rendering > "Emulate CSS prefers-reduced-motion" (not a toolbar button — avoids duplicating OS signals).

**Panels rendered (top to bottom):**

| Panel | Component | State / notes |
|---|---|---|
| Step 1 — Reason (default) | `Step1Reason` | Uses real `useCancellationFlow()` hook; `startMutation` is a mock no-op |
| Step 2 — discount_50_2mo | `Step2Offer` | `offerCursor=0`, `offersShown=["discount_50_2mo","bonus_entries_100"]` |
| Step 2 — tier_downgrade | `Step2Offer` | `tierDowngradeAvailable=true` |
| Step 2 — pause_30d | `Step2Offer` | pause card |
| Step 2 — unsubscribe_marketing | `Step2Offer` | unsubscribe card |
| Step 2 — bonus_entries_100 | `Step2Offer` | +100 entries (Step3BonusEntries inline) |
| Step 2 — tier_downgrade (unavailable) | `Step2Offer` | `tierDowngradeAvailable=false` → falls back to bonus_entries_100 |
| StepSaveSuccess × 4 | `StepSaveSuccess` | discount_50_2mo / pause_30d (with resumesAt) / unsubscribe_marketing / bonus_entries_100 |
| Step 4 — normal | `Step4Confirm` | Standard confirm screen |
| Step 4 — past-due | `Step4Confirm` | `pastDue=true` — payment-attention variant |

**`ALL_OFFERS` list:** The five offer types (`discount_50_2mo`, `tier_downgrade`, `pause_30d`, `unsubscribe_marketing`, `bonus_entries_100`) are hardcoded in the harness as a plain `OfferType[]` array. They are **not** imported from `OFFER_TYPES` at runtime — `CancellationFlowHarnessClient` is a `"use client"` component and `@/models/CancellationFlowEvent` is a Mongoose model module (`mongoose` is `serverExternalPackages`); runtime-importing it in client code crashes the browser. The `OfferType` type is imported `import type` (erased at build). If the offer set changes, update the hardcoded list by hand.

**Mock strategy:** All mutations are no-op objects shaped like a TanStack Query `useMutation` result, cast `as never` to satisfy production prop types without weakening them. Clicking Accept/Decline on Step2Offer and the confirm/back buttons on Step4Confirm all go through these mocked mutations — no network calls are made for those actions.

**Caveat — Step4Confirm "Cancel anyway" CTA:** The "No thanks, cancel anyway" text-link inside `Step4Confirm` calls `fetch("/api/stripe/cancel-subscription")` directly inside the component (structural, not via the mocked mutation). This cannot be intercepted by the harness. Clicking it in dev with no active subscription will fire a real API request and return a 401/403. Do not click it during visual QA; treat it as a structural test only if you have a real dev subscription to cancel.

**No `onSaved` on Step2Offer** — that prop was removed when `onAcceptedOffer` replaced it; the harness passes only the current `Step2OfferProps` interface.

## Examples

[src/examples/](../../src/examples/):
- `PixelTrackingExamples.tsx` — code samples for pixel-tracking integrations

## State conventions

- Direct `fetch()` is OK in dev pages (escape hatch for testing)
- TanStack Query optional for dev tools

## 2026-07-20 — sweep-font-poppins codemod

`scripts/codemods/sweep-font-poppins.ts` (npm: `sweep:font-poppins` / `:dry`) rewrites the
arbitrary `font-['[Poppins]']` Tailwind class → the real `font-poppins` utility across
`src/**`. Dry-run by default, `--apply` to write; follows the `sweep-brand-red` conventions
(codemod-runner + per-file replacement summary). What/why: docs/shared-ui/tailwind-conventions.md §10.

_Fix round 1 (2026-07-20):_ `sweep-font-poppins.ts` regex hardened to also match the
fallback-suffixed `font-['[Poppins]',sans-serif]` form (was exact-literal only), preserving
variant prefixes; dry-run/apply behavior unchanged; idempotent.

## 2026-08-10 — dev corner widgets are dismissible for a page view

Both bottom-left dev overlays now have a ✕ that removes them from the corner outright:

- [`MajorDrawTestControls`](../../src/components/dev/MajorDrawTestControls.tsx) — the beaker pill at `bottom-6 left-6`, `z-[9998]`.
- [`PromoHolidayDevToolbar`](../../src/components/sections/promo/PromoHolidayDevToolbar.tsx) — the "Holiday dev" pill at `bottom-3 left-3`, `z-[10000]` (✕ on both the collapsed pill and the expanded panel).

Why: each already had a collapse-to-pill, but the *pill itself* is a fixed overlay at a
z-index above everything, sitting exactly where the bottom-left product UI lives — so
collapsing didn't actually free the corner. This matters more now that `/promotions` is
getting a bottom-left control of its own.

**Dismissal is in-memory (`useState`), deliberately NOT persisted** — unlike
`PromoHolidayDevToolbar`'s collapse state, which stays in `sessionStorage`. A reload brings
the widget back, which is both how you restore it and the guarantee that a dev tool can't be
permanently lost. If you add another corner dev overlay, follow the same shape.

`PromoHolidayDevToolbar`'s "Hide" button also swapped its icon from `X` to `ChevronDown`, so
collapse and dismiss no longer look like the same action.

## ModalsGallery: `ParticipantsModal` props renamed (2026-08-13)

The gallery entry passes `drawId` / `drawName` / `drawType="major"` — the modal became
draw-type-agnostic so the mini-draws admin page could reuse it (see
[shared-ui/patterns.md](../shared-ui/patterns.md)). The preview still renders the major-draw
variant; nothing else about the gallery changed.

## ModalsGallery: passwordless-login + OTP entries removed (2026-08-26)

`PasswordlessLoginModal` and `OTPVerificationModal` were deleted along with the dead
`/api/auth/passwordless-login`, `/api/auth/send-otp` and `/api/auth/verify-otp` routes — this
gallery was their only remaining consumer, nothing in the product reached them. All four touch
points per modal (import, `MODAL_SOURCES`, `MODAL_LIST`, render) are gone from
[`ModalsGalleryClient.tsx`](../../src/components/dev/ModalsGalleryClient.tsx).

[`src/data/dev/modal-reachability.json`](../../src/data/dev/modal-reachability.json) was
regenerated with `npm run analyze:modals` in the same change — it is generated, never
hand-edited (see [config-and-data/architecture.md](../config-and-data/architecture.md)). The
inventory is now 52 modals: 50 reachable, 2 unreachable.

The replacement mobile-verification UI is **not built yet**; its design lives in the
[2026-08-25 mobile verification + SMS login spec](../superpowers/specs/2026-08-25-mobile-verification-and-sms-login-design.md).
