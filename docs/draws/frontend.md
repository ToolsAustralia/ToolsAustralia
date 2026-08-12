# Draws — Frontend

## Pages

| Path | Purpose |
|---|---|
| `src/app/(site)/major-draw/page.tsx` | Current major draw landing — hero, countdown, entry CTA |
| `src/app/(site)/mini-draws/` | Mini-draw browse + filter — hero, sticky mobile control bar (search / filter / sort + brand chip rail) or desktop sidebar, card grid, `HowMiniDrawsWork`, `ReadyToEnter` (redesigned 2026-08-12) |
| `src/app/(site)/mini-draws/[id]/` | Individual mini-draw detail page |
| `src/app/(site)/mini-draw-success/` | Post-purchase success for mini-draw entry |
| `src/app/(site)/draw-results/` | Draw Results & Winners — hero, the register (all/major/mini), the wall (winners-board grid), how-chosen, CTA (redesigned 2026-06-10) |
| `src/app/(site)/winners/` | Winners' wall — hero + stats, one-row All/Major/Mini filter + search, then the **Winners Board** tile grid (`WinnerBoardCard` — winner photo/monogram with name + state on a bottom scrim, month pill, accent top stripe, prize + draw-type sub-line, "Show N more" paging), its own lp-* `WinnersTestimony` (cinematic `CinematicCard` carousel + story modal), shared `HowChosen` + `ResultsCTA`. Board design ported 2026-07-13 from the "Winners Board (standalone)" mockup (replaced the earlier `WallCard` grid). |

## Key components

| Component | Purpose |
|---|---|
| `src/app/(site)/mini-draws/[id]/components/MiniDrawCountdown.tsx` | Countdown timer to mini-draw end |
| `src/app/(site)/mini-draws/[id]/components/ShareButton.tsx` | Social-share for mini-draw |
| `src/app/(site)/mini-draws/[id]/components/MiniDrawImageGallery.tsx` | Prize-image carousel: main slide + thumbnail strip + pagination dots + nav chevrons + image counter, with click-to-fullscreen via `FullscreenImageViewer`. |
| `src/app/(site)/mini-draws/components/ReadyToEnter.tsx` | Closing block on `/mini-draws` — replaced `MembershipSection` there 2026-08-12. Explains the order of operations (pick a draw → choose a pack on that draw) and opens the pack catalogue with **no draw bound**. Deliberately NOT a purchasable grid. |
| `src/components/features/MiniDrawPackTiles.tsx` | Shared light pack tiles (`MiniPackTile`, `BigPackRow`), the `PackTrustRow`, and the full "Entry packages" sheet (`MiniDrawPacksSheet`). One source for the three surfaces that render the two pack tiers. |
| `src/components/features/MiniDrawQuickEnterSheet.tsx` | Browse-page "buy without leaving the list" sheet, opened by a card's **Enter draw** CTA. Mounted per draw so `useMiniDrawPurchase` is always keyed to a real id. |
| _other major-draw components_ | _TODO: enumerate from src/components/ that map to draws (per the manifest, draws-domain components are not pulled out separately — they live near pages)._ |

### MiniDrawImageGallery

[src/app/(site)/mini-draws/[id]/components/MiniDrawImageGallery.tsx](../../src/app/(site)/mini-draws/[id]/components/MiniDrawImageGallery.tsx) is the prize-image gallery on the mini-draw detail page. As of Phase 3 of the [Site-wide Interaction Smoothness plan](../superpowers/plans/2026-05-09-site-smoothness.md) (2026-05-10) it uses two inline `useEmblaCarousel` instances (replacing the previous Swiper `[Navigation, Pagination, Thumbs]` + `[FreeMode, Thumbs]` pair) so the rounded main card can carry absolutely-positioned overlay UI — see [shared-ui/patterns.md `Inline two-Embla pattern`](../shared-ui/patterns.md#embla-wrappers) for the rationale. Behaviour: the main viewport drives `activeIndex`; clicking a thumbnail calls `mainApi.scrollTo(i)`; the thumbs strip scrolls into the active slide via `thumbsApi.scrollTo(i)` whenever `mainApi` selects. Tap-vs-drag detection uses `pointerStartRef` with an 8px deadzone — taps open `FullscreenImageViewer` at the clicked index, drags scroll the carousel without opening fullscreen.

## Hooks

| Hook | Purpose | Source |
|---|---|---|
| `useMajorDrawEntryCta()` | CTA state for the major-draw "Get more entries" button. **`openEntryFlow` pre-selects a pack by state:** additional-access users → the special-packages modal; users with an **existing (blocking) subscription** (active / past_due) → a **one-time pack** (`getOneTimePlan`, never a membership sub — a 2nd subscription would 500 with `EXISTING_SUBSCRIPTION`); everyone else → the Tradie sub as the default. | [src/hooks/useMajorDrawEntryCta.ts](../../src/hooks/useMajorDrawEntryCta.ts) |
| `useMajorDrawPurchaseGate()` | Gating logic — should the user be allowed to purchase right now? `gatesClosed = !isError && !isMajorDrawLoading && currentMajorDraw?.status !== "active"`, true during both the **30-min freeze (8:00–8:30 PM)** and the **3h 30min gap (8:30 PM → 12:00 AM)**. The **`!isError` AND `!isMajorDrawLoading` guards are both load-bearing** — see [gotchas.md](./gotchas.md#the-purchase-gate-failed-closed-on-an-api-error-2026-08-03). Surfaces [`GateClosedModal`](../../src/components/modals/GateClosedModal.tsx) with the next draw's name and activation date. This is a **UX affordance only** — the authority is the server gate in [backend.md](./backend.md) `major-draw-gate-http.ts`, which 403s a closed-gate purchase regardless of what the client believes. See [rules R3a](./rules.md#r3a-new-entry-purchases-require-status-active--the-blackout-covers-freeze-and-gap). | [src/hooks/useMajorDrawPurchaseGate.ts](../../src/hooks/useMajorDrawPurchaseGate.ts) |
| `useMiniDrawTrigger()` | Trigger / opening mini-draw modals or flows | [src/hooks/useMiniDrawTrigger.ts](../../src/hooks/useMiniDrawTrigger.ts) |
| `useMiniDrawPurchase({ miniDrawId, minimumEntries, totalEntries })` | **The single source of truth for the mini-draw entry-pack money path**, extracted from `MiniDrawPackages` so multiple surfaces share ONE orchestration (never a fork). Owns: optimistic cache bump → `POST /api/mini-draw/purchase` (webhook-only granting) → 3DS `requiresAction` / no-saved-card `requiresPayment` branches → `PaymentProcessingScreen` polling → success toast + invalidation + post-purchase upsell. **Its cache contract is load-bearing — see [cache contract](#useminidrawpurchase-cache-contract) below.** Returns `{ purchase, purchasingPackageId, entriesRemaining, isSoldOut, isExceedsCapacity, paymentProcessing, loginModal }`; the consumer renders `PaymentProcessingScreen` + `LoginPromptModal` from that state. Consumed by both `MiniDrawPackages` (detail page) and `MiniDrawEntrySheet` (dashboard Draws tab). | [src/hooks/useMiniDrawPurchase.ts](../../src/hooks/useMiniDrawPurchase.ts) |
| `usePastDrawsData()` | Fetch list of past draws (used by `PastDrawsModal`; the `/draw-results` page no longer consumes it — it SSRs the unified winners feed instead) | [src/hooks/usePastDrawsData.ts](../../src/hooks/usePastDrawsData.ts) |

### Mini-draw entry sheet (dashboard Draws tab, 2026-07-02)

On `/my-account/draws` (Mini tab), tapping a `MiniDrawCard` **no longer navigates** to `/mini-draws/[id]` — it opens [`MiniDrawEntrySheet`](../../src/components/sections/draws/MiniDrawEntrySheet.tsx) in place (green prize/fill card → entry-pack grid populated by `getMiniDrawPackages()` → running new-entry total → CTA). The sheet drives the purchase through the shared `useMiniDrawPurchase` hook, so it hits the **same** `/api/mini-draw/purchase` endpoint and webhook-confirmed grant as the detail page — no re-implemented money path. `MiniDrawCard` gained an optional `onSelect` prop (via a module-level `CardShell` that swaps the `<Link>` for a `<button>`); when absent (the public `/mini-draws` grid, `RelatedMiniDraws`) the card still navigates. `DrawsMini` holds the `selected` state + passes the viewer's per-draw entry count from `miniDrawParticipation`.

> _Refinements 2026-07-03:_ pack tiles lead with the **package name** (`displayName ?? name`) + "{n} free
> entries" + price — **not** a bare entries count, and the "$/entry" line was dropped, because the product
> sold is the pack (which *grants* free entries), not entries. The CTA reads "Get {PackName} · $X" and the
> running-total row shows the selected pack name. A **"View mini draw"** button (under the prize card) is
> the way back to the full `/mini-draws/[id]` detail page. The header sub was reworded ("Buy an entry pack
> to join this draw") so "the moment it fills" is no longer duplicated with the footer line.

### `useMiniDrawPurchase` cache contract

Three things about this hook's optimistic layer are load-bearing; all three were once wrong (see
[gotchas.md](./gotchas.md#the-mini-pack-money-path-wrote-optimistic-state-to-a-user-id-that-does-not-exist-2026-08-03)).

- **Every user-scoped key is built from `session.user.id`** — the id `UserContext`,
  `useMyAccountData` and `useUserMiniDrawEntries` read with. `queryKeys.users.account(...)` and
  `miniDraws.userEntries(...)` are keyed by it, so any other value writes to a key nothing reads.
  `handlePurchase` therefore treats a missing id the same as being signed out and opens the login
  modal.
- **The rollback snapshot lives in `optimisticSnapshotRef`, not in `handlePurchase`'s scope.** The
  paths that undo the bump (`requiresAction`, `requiresPayment`, the thrown-error path, the failed
  polling result, `handlePaymentProcessingError`, `handlePaymentProcessingTimeout`) mostly run after
  `handlePurchase` has returned. The ref is cleared when `miniDrawId` changes and on confirmed
  success, so a rollback can never restore another draw's state or undo a granted pack. All of them
  call the one `rollbackOptimisticPurchase()`.
- **Post-webhook invalidation is `queryKeys.miniDraws.all` + `usePurchaseInvalidation(userId)`,
  2s after success.** The namespace root `["mini-draws"]` prefix-matches detail/list/entries/
  activity/user-entries — the grid behind the sheet reads the **list**, so invalidating only the
  detail leaves stale fill bars and "top mini draws" ordering. `usePurchaseInvalidation` is the same
  shared helper `useEnterMiniDraw` / `usePurchaseUpsell` use ([client-state](../client-state/)),
  covering the account, dashboard, major-draw, orders and rewards slices a granted pack moves.

> _TODO: verify each hook's contract by reading source._

### `useMajorDrawEntryCta` — `?packages=one-time` opens the one-time flow (2026-07-03)

`openEntryFlow()` is the shared entry point behind every "Enter Now" CTA (promo hero, countdown, prize
showcase, unlock-discounts, promo-welcome modal; also my-account). The `MembershipModal` has **no**
membership-vs-one-time toggle — its inner `PackageSelectionModal` derives the active tab purely from the
passed plan's `period` (`"mo"` → membership, else → one-time). By default a guest is handed the Tradie
**subscription** (`getHeavyDutyPack()`), so the modal opens on membership packs.

When the ad-landing param `?packages=one-time` is present (parsed by the shared
[`parseMembershipPackagesTab`](../../src/utils/membership/packagesTabParam.ts)), `openEntryFlow` hands the
modal a **one-time** plan (`getOneTimePlan()`) instead, so it opens on the One-Time tab — keeping the modal
consistent with the on-page membership section and the `PromoBanner` badge on a one-time ad landing (see
[shared-ui/frontend.md](../shared-ui/frontend.md#membershipsection--promomembershipdesign--packages-tab-pre-select-2026-07-03)).
Falls back to the subscription default if no one-time plan is resolvable yet. **Guests only** — members with
additional-package access divert to the `special-packages` modal earlier in `openEntryFlow`, before plan
selection, so they are unaffected. The param is read from `window.location.search` (not `useSearchParams`)
because it runs inside a click handler.

#### The param no longer skips the package picker (2026-08-04)

`?packages=one-time` used to **bypass** package-selection-first entirely: the guard read
`packageSelectionFirst && !hasBlockingSubscription(userData) && !forcedOneTime`, so those visitors
jumped straight to a pre-selected pack while everyone else got the picker first. The stated reason —
"a membership tier is the wrong pre-select for a one-time visitor" — was true, but skipping the picker
was the wrong remedy: it gave the same CTA a different number of steps depending on a URL param.

`forcedOneTime` is now dropped from that condition and used to choose the **pre-selected plan** instead
(`getOneTimePlan() ?? getRecommendedSubscriptionPlan()`). Because `PackageSelectionModal` derives its
tab from `currentPlan.period`, handing it the one-time plan opens it on the One-Time tab — same flow,
right tab. Keep the `??` fallback: `getOneTimePlan()` returns nothing until packages resolve, and
without it a slow fetch opens the picker with no selection, which is the empty-payment-step failure
package-selection-first exists to prevent.

**`hasBlockingSubscription` still skips the picker**, for an unrelated and still-valid reason: that
visitor cannot create a second subscription (`EXISTING_SUBSCRIPTION`), so the picker's membership tab
would offer them nothing payable. Do not collapse the two conditions — they guard different things.

## Draw Results & Winners page (redesigned 2026-06-10)

[src/app/(site)/draw-results/](../../src/app/(site)/draw-results/) was rebuilt to the Claude Design "Draw Results & Winners" mockup. Design record: [docs/superpowers/specs/2026-06-10-draw-results-redesign-design.md](../superpowers/specs/2026-06-10-draw-results-redesign-design.md).

**Section sequence:** Hero → The Register → The Wall → How a winner is chosen → Closing CTA. The page renders inside the shared `(site)` Header/Footer (no own chrome).

**Components** (all under `draw-results/components/`):

| Component | Render | Purpose |
|---|---|---|
| `ResultsHero.tsx` | server | Editorial headline, 3 real stat counts (major / mini / all from SSR `countDocuments`), featured latest-major card ("Latest draw" + draw-name pills in one row; Verify → `drawResultUrl`). Background = all-prizes photo behind a strong theme-aware scrim (`.ta-hero-bg`). Ends with a full-width `PromoTrustBar` reused from the promotions page (replaces the old hand-built ribbon). |
| `ResultsRegister.tsx` + `MajorDrawResultCard` | **client** | Heading "Draw results". **All / Major draws / Mini draws** filter (in-memory over the SSR'd feed). **Major** draws render as a rich `MajorDrawResultCard` (landscape draw artwork + prize description via `dangerouslySetInnerHTML` + "View draw result"); **mini** draws use the compact `DrawRow` — an always-4-column grid (date · draw image · winner "First L." + state + type tag · "View result") that never stacks and shows the image on mobile. No prize value shown anywhere. |
| `WinnersWall.tsx` | **client** | "The wall" — intro + real "N winners and counting", then the shared **Winners Board** tile grid (`WinnerBoardCard`) with "Show N more" paging (8 at a time over the SSR'd feed). Replaced the old horizontal `WinnerRail` (deleted 2026-07-13). |
| `WinnerBoardCard.tsx` | client-consumed | One Winners-Board tile — winner photo (`imageUrl` → `prize.images[0]`) or an initials **monogram** fallback, name + state on a bottom scrim, month pill, accent top stripe, prize name (clamped to 2 lines) + "Major/Mini draw" sub-line (no decorative icon). Photo frame is responsive — portrait **3/4 on mobile** (so portrait winner photos aren't cropped) → 4/3 tablet → 1/1 desktop. Link: an explicit **`href`** prop (the homepage `LatestWinnerHero` → promo / mini-draws) makes the whole tile that link (internal `<Link>`, or `<a>` for an external URL); otherwise the tile is static. (No per-card "Verify" affordance — every draw is verified, so the badge was dropped.) Shared by `/winners` (`WinnersBrowser`), the draw-results wall, and `LatestWinnerHero`. **Must render inside a `.ta-results` root** (both draws pages do; `LatestWinnerHero` wraps its grid in one, piping the promo accent into `--accent`). `.lw-*` styles live in draw-results.css. |
| `HowChosen.tsx` | server | 4-step stepper; copy verified against BUSINESS.md + competition terms (8pm freeze, randomdraws.com.au cert, 8:30pm FB live, contacted to arrange delivery/cash). No per-draw permit claim, no "insured". |
| `ResultsCTA.tsx` | **client** | "Want your name on this page?" — **active members** (`subscription.isActive`) open `SpecialPackagesModal` via `requestModal("special-packages")` (globally mounted by `UnifiedModalManager`); everyone else opens `MembershipModal`. Both gated by `useMajorDrawPurchaseGate`. Secondary "Watch live on Facebook" → `facebook.com/toolsaust`, styled with `lp-btn-fb` (deliberately smaller than the primary `lp-btn-xl` entries CTA — extra-small on mobile, comfortable on sm+). |
| `Reveal.tsx` | client | `Reveal` / `Stagger` IntersectionObserver wrappers (transform-only, `prefers-reduced-motion` aware). |
| `PrizeImage.tsx` | server | Draw/prize `<img>` with a trophy fallback when no artwork. |
| `format.ts` | — | Deterministic (UTC + manual grouping) date helpers — no hydration drift. |

**Data flow:** `page.tsx` (server) SSRs the hero counts and the unified winners feed via `getAllWinners({ limit: 60 })` ([src/utils/draws/get-all-winners.ts](../../src/utils/draws/get-all-winners.ts)), derives the featured latest major, and passes the array down as props. Only client islands are the register filter, the CTA modal, the winners-board grid (its "Show N more" paging), and the reveal wrappers. The register + the major-draw rich card use the **draw's own artwork** (`prize.images[0]`); the "wall" board and the `/winners` board (both `WinnerBoardCard`) prefer the **winner's photo** (`imageUrl`), falling back to artwork, then to an initials monogram.

**Visual system:** page-scoped under a `.ta-results` root in [draw-results.css](../../src/app/(site)/draw-results/draw-results.css) — `lp-*` classes + a CSS-variable token set (light default, dark under the site's `.dark` class) + a scoped `:focus-visible` ring (`!important`, since globals.css strips outlines). Accent is brand red `#ee0000`. Archivo + Space Mono load per-route via `next/font`; body inherits Inter. Section backgrounds alternate `--bg` → `--surface` → `--bg` → `--surface` → `#08080a` finale. Mobile follows the project rule (keep the 375px layout across phone widths, scale down — see [[mobile-320-mirrors-390]]): no column collapse, smaller base headings/paddings; the **Winners Board** (`.lw-grid`) reflows 2 → 3 → 4 columns at 600px / 920px. **The `/winners` page reuses this same `.ta-results` scope + stylesheet + fonts** (cross-imports `draw-results.css`, `Reveal`, `format`, `ResultsCTA`), so the two pages stay visually aligned. The `/winners` testimony quotes use a per-route **Newsreader** serif (`.winners-serif`), and the page renders its own lp-* `WinnersTestimony` (NOT the shared cinematic section — that stays for the homepage).

**Real-data-only:** the mockup's placeholder permit numbers, entrant counts, **prize values**, "$ paid out" total, "watch replay", and reviews rating were all dropped (no backend source / per user request). Copy avoids "chance/odds"-style gambling language. Removed the old `CompletedDrawsSection`, `DrawResultCard`, `DrawResultsHero`, `UnifiedCompletedDrawCard`, the orphaned `CountdownHero`/`WinnerAnnouncement`, the static "How Winners Are Selected" tiles, the membership upsell, and the floating countdown banner.

## Client state

- All draw reads via TanStack Query.
- Countdown components compute their own `now()` ticks — server-rendered draw end-dates are the source of truth.
- No Zustand for draws.

## Display formatting

- Winner names are rendered via [src/utils/winner-name-formatter.ts](../../src/utils/winner-name-formatter.ts) — privacy convention (first name + last initial).
- Eligibility messaging via [src/utils/giveaway-eligibility.ts](../../src/utils/giveaway-eligibility.ts).

## Cross-domain notes

### Winner testimony display — `WinnersTestimony` (the one Hear-From-Our-Winners section)

**Redesigned to the "speech bubble" testimonial design (2026-07-23).** The single **draws-domain** component [src/app/(site)/winners/components/WinnersTestimony.tsx](../../src/app/(site)/winners/components/WinnersTestimony.tsx) now renders the Claude design-handoff look, replacing the prior `.ta-results` `CinematicCard` carousel + `StoryModal`:

- **Header** (`.wt-header`) — a centred two-line title, `Winners` (italic muted kicker) over a large bold `testimonial`, framed by big **red** serif quote glyphs (`.wt-quote-open` top-left / `.wt-quote-close` right). Adapted from a supplied sample; replaces the earlier eyebrow-only treatment. Text colours are theme-adaptive tokens (`--wt-heading` / `--wt-heading-muted`).
- **Card** (`TestimonyCard`) — a dark-navy "speech bubble" (`#1c1f28`, theme-INVARIANT) with the winner avatar (`next/image`, or a person glyph) straddling the top edge inside a red ring, name, a `STATE · MONTH` meta row with 5 decorative stars, a 3-line-clamped italic quote, and a footer with **Read full story** + the prize line (green trophy + `selectedPrize || prize.name`).
- **Two layouts** off a Tailwind `md:` breakpoint — desktop: an auto-fitting, width-capped centred grid (`repeat(auto-fit, minmax(280px, 360px))`); mobile: a **one-at-a-time** carousel (prev/next + dot indicators; the single card is re-keyed by id so the `wt-swap` animation replays as the "swap"). The dot indicators are ≥44×24 tap targets — a small visual pill (`.wt-dot span`) inside a large button — to satisfy WCAG 2.5.8.
- **Modal** (`WinnerStoryModal`) — theme-aware, **portalled to `document.body`** (mounted-gated) so `position:fixed` is viewport-correct under the promo stage's transforms. The portal tree is wrapped in a `.dark` div mirroring the launching section (`sectionRef.closest('.dark')`) so it themes correctly even where the host carries `.dark` on a wrapper the portal escapes — e.g. the force-dark Ryobi promo pages, where `.dark` is a `<div>` inside `<body>`, not on `<html>`. Adds Esc, a Tab **focus-trap**, and **return-focus** on close (the shared `ModalContainer` has none of these). Shows the id row (avatar · name · state · `{drawName} · certified` linking `drawResultUrl` · month badge), stars, the full testimony, and a footer with the prize + the optional **"Watch the draw"** link (`watchUrl`, major draws only — preserved from the prior modal; not in the handoff mock).

**Theming is CSS-driven, not a JS theme read.** Colours come from the self-contained `.winner-testimonies` / `.winner-testimonies-modal` token scopes in [globals.css](../../src/app/globals.css) (keyed off the global `.dark` class — the same class the promo guest toggle and the sitewide toggle flip). Only the section chrome + modal switch on theme; the card bubble is identical in light/dark. This avoids the SSR light→dark hydration flash a JS `isDark` read would cause (same rationale as the prize-builder `--pbc-*` tokens). Fonts: `font-poppins` (global `--font-poppins`) + `font-mono` for the draw ref — the section no longer loads Archivo/Space Mono/Newsreader or uses `.ta-results`.

It is **portable** — the token scope + fonts are self-contained, so it renders identically on every host page. Call sites:

- `/winners` page (SSR) — rendered inline by `WinnersBrowser`.
- Homepage, the `/promotions` **index gallery** (added 2026-07-23, after `PrizeGallerySpotlight`), and the `/promotions/[slug]` brand pages — via [src/app/(site)/components/WinnerTestimoniesClient.tsx](../../src/app/(site)/components/WinnerTestimoniesClient.tsx) (and its lazy wrapper `WinnerTestimoniesClientLazy`, which wraps the dynamic import in `LazyMount` so the chunk + fetch defer until near-viewport).
- Account draws tab — [src/app/(site)/my-account/draws/page.tsx](../../src/app/(site)/my-account/draws/page.tsx).

> **Shared winners feed (perf Tier-2, 2026-07-20):** `WinnerTestimoniesClient` and the homepage/promotions
> `LatestWinnerHero` both previously did their own raw `useEffect` fetch of `/api/winners/all` (limit 100 and
> 16), so every page made **two** requests. They now share [`useWinnersFeed(WINNERS_FEED_LIMIT)`](../../src/hooks/queries/useWinnersQueries.ts)
> (React Query key `winners.feed(limit)`), so a page fetches **once** and the CDN `s-maxage=300` entry is
> reused; the board slices the most recent 16 client-side. Both consumers MUST pass the same exported
> `WINNERS_FEED_LIMIT` so they collapse onto one key/URL.

It filters to winners with a testimony (`hasWinnerTestimony`) and returns null when none exist; card and modal strip rich-text HTML (`stripRichTextHtml`) — from [src/utils/winners.ts](../../src/utils/winners.ts) — and the card CSS-clamps the quote to 3 lines. The draw month is formatted via the UTC-deterministic `auDateParts` (no hydration mismatch). **Data adapted to real fields:** the handoff mock's `suburb`, per-winner star rating, and `#TA-XXXX` draw-ref have no backing fields, so the card shows `winnerState` only, 5 fixed decorative stars, and the real `drawName` + certified `drawResultUrl` link.

### Draw-level result & watch links (2026-06-11)

Major draws carry two optional admin-editable links on the `MajorDraw` model: `resultUrl` (randomdraws verification page) and `watchUrl` (Facebook live-draw / announcement video). They're set in the admin **Edit Draw** modal (see [docs/admin/architecture.md](../admin/architecture.md#prize-image-cleanup-on-draw-save-2026-06-11) section "Edit Draw links") and surface on the public feed via [`getAllWinners`](../../src/utils/draws/get-all-winners.ts):

- `WinnerSummary.drawResultUrl` = `majorDraw.resultUrl ?? winner.drawResultUrl` — the draw-level value wins, with the legacy per-winner field as fallback (no migration needed). Powers the **"View result" / "Verify"** link on `ResultsRegister` (the draw-register rows). The Winners Board tiles (`WinnerBoardCard`) do **not** surface a per-card verify link — every draw is verified, so the badge was dropped 2026-07-13.
- `WinnerSummary.watchUrl` = `majorDraw.watchUrl` (major draws only; `undefined` for minis). Powers the **"Watch the draw"** button in the testimony `StoryModal`.

## className conventions (2026-05-08)

Draw components use `cn()` from `@/utils/cn` for conditional class composition. The `sweep-classname-template-literals` codemod (Plan 5 Phase 2) converted template-literal `className={`...`}` patterns to `className={cn(...)}`. Use `cn()` rather than template literals when adding new conditional classes.

## Interaction smoothness (Phase 1, 2026-05-09)

[`MiniDrawCountdown`](../../src/app/(site)/mini-draws/[id]/components/MiniDrawCountdown.tsx) is now leaf-isolated via [`<CountdownLeaf>`](../../src/components/ui/CountdownLeaf.tsx) / [`useLeafTimer`](../../src/hooks/useLeafTimer.ts) so the mini-draw detail page does not re-render on every tick of the countdown. See [shared-ui/patterns.md](../shared-ui/patterns.md#site-wide-interaction-smoothness--phase-1-2026-05-09) for the pattern.

## Conversion tracking (Purchase)

`MiniDrawSuccessClient.tsx` fires the browser Purchase pixel via `trackConversion(buildPurchaseEvent(...))`, with `eventId = paymentIntentId` for browser↔server dedup. The fire is guarded by `shouldSuppressPurchasePixel` / `markPurchasePixelFired` ([purchase-pixel-fired-storage.ts](../../src/utils/tracking/purchase-pixel-fired-storage.ts), localStorage key `purchasePixelFired_${paymentIntentId}` holding the first-fire time) — not just a per-mount `firedRef`. Re-fires within 46h of the first fire stay allowed (Meta merges them; free delivery-recovery); only older re-fires are suppressed. The ref alone re-fired on every remount (refresh/back-nav/history revisit); Meta's event_id dedup only lasts ~48h, so a revisit later than that counted as a brand-new conversion and inflated Meta-reported ROAS. The first legitimate fire and the server CAPI redundancy are unchanged. It passes `contentName: status.data.packageName` so the Purchase carries `content_name` on both the pixel and the server Events API/CAPI (same source as the server, so values match). Field-by-field reference: [docs/tracking/EVENT_PARAMETER_MATRIX.md](../tracking/EVENT_PARAMETER_MATRIX.md).

## 2026-07-20 — Tier-2 perf: Poppins codemod

Components in this domain were touched by the sitewide `font-'[Poppins]'` → `font-poppins`
codemod (`npm run sweep:font-poppins`). Their Poppins-classed text now renders **real Poppins**
instead of a browser fallback — an intended visual change. Details + rules:
docs/shared-ui/tailwind-conventions.md §10.

## Mini-draws redesign — browse + detail (2026-08-12)

Both public mini-draw surfaces were rebuilt from a design handoff. Three problems it set out to fix,
and what replaced each:

| Problem | Fix |
|---|---|
| Mobile filtering was buried in a 320px left drawer with a 13-item scrolling list | Sticky control bar (search + filter + sort) with a horizontal **brand chip rail**, plus a filter **bottom sheet** whose brand list is a 2-column grid |
| The pack picker was 8 neon-glow tiles ~76px wide in a 4-column grid | Two clearly-labelled tiers of clean light cards — see [shared-ui/patterns.md](../shared-ui/patterns.md#minidrawpackages--two-light-tiers-rewritten-2026-08-12) |
| `MembershipSection` closed both pages — it sells **major-draw** entries, which do nothing here | Removed from both; `/mini-draws` gets `ReadyToEnter` instead, `/mini-draws/[id]` ends at Related draws |

### Browse (`/mini-draws`)

- **Sticky control bar** (below `lg`) pinned at `top-[var(--app-header-h)]`: 42px search, 42px filter
  button with a live selected-brand count badge, 42px sort button, then the chip rail
  (`All brands` → Sidchrome, Milwaukee, Makita, KINCROME, DEWALT, Knipex → a dashed `+ More` that
  opens the filter sheet). `All brands` renders "on" when no brand is selected.
- **Desktop (`lg+`)** keeps the sidebar (`MiniDrawsFilters isMobile={false}`, sticky at `top-24`) plus
  a control card with search, grid/list toggle and a 250px sort **dropdown** (a popover — it asserts
  `aria-expanded`, so it must NOT lock scroll; it closes on outside pointer-down, not `useModalA11y`).
- **Sheets** — filter, sort and quick-enter all use [`SheetShell`](../../src/components/ui/SheetShell.tsx)
  rather than a fourth hand-rolled overlay, so scroll-lock, focus trap, Escape and the portal come from
  one place. `MiniDrawsFilters` in mobile mode returns a **fragment** (pinned search + scrolling grid) so
  the sheet's own header and sticky `Show {n} draws` footer are siblings in the panel's flex column —
  the footer count is live and filter-aware, and the button only dismisses (selection already applied).
- **Card CTA divergence.** `MiniDrawCard` gained an optional `onEnter`: the image and title still
  navigate to `/mini-draws/{id}`, but the CTA opens `MiniDrawQuickEnterSheet` for that draw. Only the
  browse grid passes it — the homepage grid, `RelatedMiniDraws` and the dashboard keep their existing
  behaviour. `viewMode` also gained a third value, `"compact"`, used by `RelatedMiniDraws`.

### Detail (`/mini-draws/[id]`)

- **Key facts strip** (mobile only) under the hero: `$1 / Per entry`, `{n} / Entries left`,
  `{pct}% / Filled`. The `$1 Entry` pill stays desktop-only — on mobile the sticky bar carries the price.
- **Sticky gallery column** on `lg+`. The gallery sits in a wrapper `div` that stretches to the grid row
  height, with `sticky top-24` on an inner div; `sticky` applied directly to a grid item collapses to
  content height and never engages. The right column's old `lg:sticky lg:top-28` is gone — two sticky
  columns fight.
- **Sticky "Enter draw" bar** (mobile only) is owned by `MiniDrawPackages`, portaled to `<body>`, and
  reflects the **currently selected pack**; tapping it opens that pack's detail sheet, not the list. The
  page container carries `pb-[78px]` so it never covers the last card. It opts into
  `data-floating-widget` so [`useDodgeFloatingObstacles`](../../src/components/support-chat/useDodgeFloatingObstacles.ts)
  lifts the Cobber launcher above it.
- **Pack card first on both breakpoints.** Desktop previously ordered "About this prize" above the
  buy card via `lg:order-1/2`; those overrides are removed.
- **Winners & rules** is no longer wrapped in `CollapsibleSection` — the tabs are their own affordance.
  The empty-winners "Get your entries" link dispatches the `OPEN_MINI_DRAW_PACKS_EVENT` window event
  (exported from `MiniDrawPackages`), the same decoupling `useOpenMembershipModalListener` uses, so the
  tabs never need a reference to the picker.

### Copy corrections shipped with it

`MiniDrawTabs` listed **"Buy a mini pack to receive free entries (membership required)"** under Entry
methods. Mini-draw entry is **package-only** — no membership is required, and members' free entries go
to the *major* draws. Now reads "Buy a mini pack to receive free entries". Everything customer-facing
here follows CLAUDE.md §11: the purchasable unit is the pack, entries are a free inclusion, and no
odds/chance framing appears anywhere on either page.
