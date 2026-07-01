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

When a modal is moved from a monolith `.tsx` file to a folder structure (`/index.tsx`), update the `source` path in the `MODAL_SOURCES` map inside this file.

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
