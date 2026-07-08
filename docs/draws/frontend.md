# Draws — Frontend

## Pages

| Path | Purpose |
|---|---|
| `src/app/(site)/major-draw/page.tsx` | Current major draw landing — hero, countdown, entry CTA |
| `src/app/(site)/mini-draws/[id]/` | Individual mini-draw detail page |
| `src/app/(site)/mini-draw-success/` | Post-purchase success for mini-draw entry |
| `src/app/(site)/draw-results/` | Draw Results & Winners — hero, the register (all/major/mini), the wall, how-chosen, CTA (redesigned 2026-06-10) |
| `src/app/(site)/winners/` | Winners' wall — redesigned 2026-06-10 (Claude Design "Winners Hall of Fame"): hero + stats, one-row All/Major/Mini filter + search, premium winner-card grid (`WallCard`: gradient-bordered artwork on an accent-glow dark stage, drawn-date + verify), its own lp-* `WinnersTestimony` (cinematic `CinematicCard` carousel + story modal), shared `HowChosen` + `ResultsCTA` |

## Key components

| Component | Purpose |
|---|---|
| `src/app/(site)/mini-draws/[id]/components/MiniDrawCountdown.tsx` | Countdown timer to mini-draw end |
| `src/app/(site)/mini-draws/[id]/components/ShareButton.tsx` | Social-share for mini-draw |
| `src/app/(site)/mini-draws/[id]/components/MiniDrawImageGallery.tsx` | Prize-image carousel: main slide + thumbnail strip + pagination dots + nav chevrons + image counter, with click-to-fullscreen via `FullscreenImageViewer`. |
| _other major-draw components_ | _TODO: enumerate from src/components/ that map to draws (per the manifest, draws-domain components are not pulled out separately — they live near pages)._ |

### MiniDrawImageGallery

[src/app/(site)/mini-draws/[id]/components/MiniDrawImageGallery.tsx](../../src/app/(site)/mini-draws/[id]/components/MiniDrawImageGallery.tsx) is the prize-image gallery on the mini-draw detail page. As of Phase 3 of the [Site-wide Interaction Smoothness plan](../superpowers/plans/2026-05-09-site-smoothness.md) (2026-05-10) it uses two inline `useEmblaCarousel` instances (replacing the previous Swiper `[Navigation, Pagination, Thumbs]` + `[FreeMode, Thumbs]` pair) so the rounded main card can carry absolutely-positioned overlay UI — see [shared-ui/patterns.md `Inline two-Embla pattern`](../shared-ui/patterns.md#embla-wrappers) for the rationale. Behaviour: the main viewport drives `activeIndex`; clicking a thumbnail calls `mainApi.scrollTo(i)`; the thumbs strip scrolls into the active slide via `thumbsApi.scrollTo(i)` whenever `mainApi` selects. Tap-vs-drag detection uses `pointerStartRef` with an 8px deadzone — taps open `FullscreenImageViewer` at the clicked index, drags scroll the carousel without opening fullscreen.

## Hooks

| Hook | Purpose | Source |
|---|---|---|
| `useMajorDrawEntryCta()` | CTA state for the major-draw "Get more entries" button. **`openEntryFlow` pre-selects a pack by state:** additional-access users → the special-packages modal; users with an **existing (blocking) subscription** (active / past_due) → a **one-time pack** (`getOneTimePlan`, never a membership sub — a 2nd subscription would 500 with `EXISTING_SUBSCRIPTION`); everyone else → the Tradie sub as the default. | [src/hooks/useMajorDrawEntryCta.ts](../../src/hooks/useMajorDrawEntryCta.ts) |
| `useMajorDrawPurchaseGate()` | Gating logic — should the user be allowed to purchase right now? `gatesClosed = currentMajorDraw?.status !== "active"`, which is true during both the **30-min freeze (8:00–8:30 PM)** and the **3h 30min gap (8:30 PM → 12:00 AM)**. Surfaces [`GateClosedModal`](../../src/components/modals/GateClosedModal.tsx) with the next draw's name and activation date. Mirrors the server gate in [backend.md](./backend.md) `major-draw-gate-http.ts`. See [rules R3a](./rules.md#r3a-new-entry-purchases-require-status-active--the-blackout-covers-freeze-and-gap). | [src/hooks/useMajorDrawPurchaseGate.ts](../../src/hooks/useMajorDrawPurchaseGate.ts) |
| `useMiniDrawTrigger()` | Trigger / opening mini-draw modals or flows | [src/hooks/useMiniDrawTrigger.ts](../../src/hooks/useMiniDrawTrigger.ts) |
| `useMiniDrawPurchase({ miniDrawId, minimumEntries, totalEntries })` | **The single source of truth for the mini-draw entry-pack money path**, extracted from `MiniDrawPackages` so multiple surfaces share ONE orchestration (never a fork). Owns: optimistic cache bump → `POST /api/mini-draw/purchase` (webhook-only granting) → 3DS `requiresAction` / no-saved-card `requiresPayment` branches → `PaymentProcessingScreen` polling → success toast + invalidation + post-purchase upsell. Returns `{ purchase, purchasingPackageId, entriesRemaining, isSoldOut, isExceedsCapacity, paymentProcessing, loginModal }`; the consumer renders `PaymentProcessingScreen` + `LoginPromptModal` from that state. Consumed by both `MiniDrawPackages` (detail page) and `MiniDrawEntrySheet` (dashboard Draws tab). | [src/hooks/useMiniDrawPurchase.ts](../../src/hooks/useMiniDrawPurchase.ts) |
| `usePastDrawsData()` | Fetch list of past draws (used by `PastDrawsModal`; the `/draw-results` page no longer consumes it — it SSRs the unified winners feed instead) | [src/hooks/usePastDrawsData.ts](../../src/hooks/usePastDrawsData.ts) |

### Mini-draw entry sheet (dashboard Draws tab, 2026-07-02)

On `/my-account/draws` (Mini tab), tapping a `MiniDrawCard` **no longer navigates** to `/mini-draws/[id]` — it opens [`MiniDrawEntrySheet`](../../src/components/sections/draws/MiniDrawEntrySheet.tsx) in place (green prize/fill card → entry-pack grid populated by `getMiniDrawPackages()` → running new-entry total → CTA). The sheet drives the purchase through the shared `useMiniDrawPurchase` hook, so it hits the **same** `/api/mini-draw/purchase` endpoint and webhook-confirmed grant as the detail page — no re-implemented money path. `MiniDrawCard` gained an optional `onSelect` prop (via a module-level `CardShell` that swaps the `<Link>` for a `<button>`); when absent (the public `/mini-draws` grid, `RelatedMiniDraws`) the card still navigates. `DrawsMini` holds the `selected` state + passes the viewer's per-draw entry count from `miniDrawParticipation`.

> _Refinements 2026-07-03:_ pack tiles lead with the **package name** (`displayName ?? name`) + "{n} free
> entries" + price — **not** a bare entries count, and the "$/entry" line was dropped, because the product
> sold is the pack (which *grants* free entries), not entries. The CTA reads "Get {PackName} · $X" and the
> running-total row shows the selected pack name. A **"View mini draw"** button (under the prize card) is
> the way back to the full `/mini-draws/[id]` detail page. The header sub was reworded ("Buy an entry pack
> to join this draw") so "the moment it fills" is no longer duplicated with the footer line.

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

## Draw Results & Winners page (redesigned 2026-06-10)

[src/app/(site)/draw-results/](../../src/app/(site)/draw-results/) was rebuilt to the Claude Design "Draw Results & Winners" mockup. Design record: [docs/superpowers/specs/2026-06-10-draw-results-redesign-design.md](../superpowers/specs/2026-06-10-draw-results-redesign-design.md).

**Section sequence:** Hero → The Register → The Wall → How a winner is chosen → Closing CTA. The page renders inside the shared `(site)` Header/Footer (no own chrome).

**Components** (all under `draw-results/components/`):

| Component | Render | Purpose |
|---|---|---|
| `ResultsHero.tsx` | server | Editorial headline, 3 real stat counts (major / mini / all from SSR `countDocuments`), featured latest-major card ("Latest draw" + draw-name pills in one row; Verify → `drawResultUrl`). Background = all-prizes photo behind a strong theme-aware scrim (`.ta-hero-bg`). Ends with a full-width `PromoTrustBar` reused from the promotions page (replaces the old hand-built ribbon). |
| `ResultsRegister.tsx` + `MajorDrawResultCard` | **client** | Heading "Draw results". **All / Major draws / Mini draws** filter (in-memory over the SSR'd feed). **Major** draws render as a rich `MajorDrawResultCard` (landscape draw artwork + prize description via `dangerouslySetInnerHTML` + "View draw result"); **mini** draws use the compact `DrawRow` — an always-4-column grid (date · draw image · winner "First L." + state + type tag · "View result") that never stacks and shows the image on mobile. No prize value shown anywhere. |
| `WinnersWall.tsx` + `WinnerRail.tsx` | server + **client** | "The wall" — left intro + real "N winners and counting" + horizontal winner rail. `WinnerRail` adds mouse click-drag scrolling (touch stays native) with `user-select:none` so dragging never selects text; card width `min(84vw, 332px)` so it never overflows small phones. |
| `HowChosen.tsx` | server | 4-step stepper; copy verified against BUSINESS.md + competition terms (8pm freeze, randomdraws.com.au cert, 8:30pm FB live, contacted to arrange delivery/cash). No per-draw permit claim, no "insured". |
| `ResultsCTA.tsx` | **client** | "Want your name on this page?" — **active members** (`subscription.isActive`) open `SpecialPackagesModal` via `requestModal("special-packages")` (globally mounted by `UnifiedModalManager`); everyone else opens `MembershipModal`. Both gated by `useMajorDrawPurchaseGate`. Secondary "Watch live on Facebook" → `facebook.com/toolsaust`, styled with `lp-btn-fb` (deliberately smaller than the primary `lp-btn-xl` entries CTA — extra-small on mobile, comfortable on sm+). |
| `Reveal.tsx` | client | `Reveal` / `Stagger` IntersectionObserver wrappers (transform-only, `prefers-reduced-motion` aware). |
| `PrizeImage.tsx` | server | Draw/prize `<img>` with a trophy fallback when no artwork. |
| `format.ts` | — | Deterministic (UTC + manual grouping) date helpers — no hydration drift. |

**Data flow:** `page.tsx` (server) SSRs the hero counts and the unified winners feed via `getAllWinners({ limit: 60 })` ([src/utils/draws/get-all-winners.ts](../../src/utils/draws/get-all-winners.ts)), derives the featured latest major, and passes the array down as props. Only client islands are the register filter, the CTA modal, the winner rail, and the reveal wrappers. The register + the major-draw rich card use the **draw's own artwork** (`prize.images[0]`); the "wall" rail and the `/winners` cards prefer the **winner's photo** (`imageUrl`), falling back to artwork.

**Visual system:** page-scoped under a `.ta-results` root in [draw-results.css](../../src/app/(site)/draw-results/draw-results.css) — `lp-*` classes + a CSS-variable token set (light default, dark under the site's `.dark` class) + a scoped `:focus-visible` ring (`!important`, since globals.css strips outlines). Accent is brand red `#ee0000`. Archivo + Space Mono load per-route via `next/font`; body inherits Inter. Section backgrounds alternate `--bg` → `--surface` → `--bg` → `--surface` → `#08080a` finale. Mobile follows the project rule (keep the 375px layout across phone widths, scale down — see [[mobile-320-mirrors-390]]): no column collapse, smaller base headings/paddings, viewport-capped rail cards. **The `/winners` page reuses this same `.ta-results` scope + stylesheet + fonts** (cross-imports `draw-results.css`, `Reveal`, `format`, `ResultsCTA`), so the two pages stay visually aligned. The `/winners` testimony quotes use a per-route **Newsreader** serif (`.winners-serif`), and the page renders its own lp-* `WinnersTestimony` (NOT the shared cinematic section — that stays for the homepage).

**Real-data-only:** the mockup's placeholder permit numbers, entrant counts, **prize values**, "$ paid out" total, "watch replay", and reviews rating were all dropped (no backend source / per user request). Copy avoids "chance/odds"-style gambling language. Removed the old `CompletedDrawsSection`, `DrawResultCard`, `DrawResultsHero`, `UnifiedCompletedDrawCard`, the orphaned `CountdownHero`/`WinnerAnnouncement`, the static "How Winners Are Selected" tiles, the membership upsell, and the floating countdown banner.

## Client state

- All draw reads via TanStack Query.
- Countdown components compute their own `now()` ticks — server-rendered draw end-dates are the source of truth.
- No Zustand for draws.

## Display formatting

- Winner names are rendered via [src/utils/winner-name-formatter.ts](../../src/utils/winner-name-formatter.ts) — privacy convention (first name + last initial).
- Eligibility messaging via [src/utils/giveaway-eligibility.ts](../../src/utils/giveaway-eligibility.ts).

## Cross-domain notes

### Winner testimony display — `WinnersTestimony` (the one Hear-From-Our-Winners section, 2026-06-11)

The "Hear from our winners" section is now a single **draws-domain** component, [src/app/(site)/winners/components/WinnersTestimony.tsx](../../src/app/(site)/winners/components/WinnersTestimony.tsx), built in the page-scoped `.ta-results` design system (`CinematicCard` carousel + `StoryModal`). It replaces the deleted `src/components/sections/winner-testimony/` folder entirely.

It is **portable**: it self-loads its fonts (Archivo / Space Mono / Newsreader) and wraps its output in `.ta-results`, and the shared stylesheet [src/app/(site)/draw-results/draw-results.css](../../src/app/(site)/draw-results/draw-results.css) is imported globally in [src/app/layout.tsx](../../src/app/layout.tsx). So it renders identically on every host page. Call sites:

- `/winners` page (SSR) — rendered inline by `WinnersBrowser`.
- Homepage + promotions — via [src/app/(site)/components/WinnerTestimoniesClient.tsx](../../src/app/(site)/components/WinnerTestimoniesClient.tsx) (and its lazy wrapper).
- Account draws tab — [src/app/(site)/my-account/draws/page.tsx](../../src/app/(site)/my-account/draws/page.tsx).

It filters to winners with a testimony (`hasWinnerTestimony`), shows a cleaned excerpt (`getWinnerTestimonyExcerpt`), and the modal strips rich-text HTML to clean paragraphs (`stripRichTextHtml`) — all from [src/utils/winners.ts](../../src/utils/winners.ts). The modal's "Watch the draw" link uses `watchUrl` (the Facebook link — see "Draw-level result & watch links" below) when present.

### Draw-level result & watch links (2026-06-11)

Major draws carry two optional admin-editable links on the `MajorDraw` model: `resultUrl` (randomdraws verification page) and `watchUrl` (Facebook live-draw / announcement video). They're set in the admin **Edit Draw** modal (see [docs/admin/architecture.md](../admin/architecture.md#prize-image-cleanup-on-draw-save-2026-06-11) section "Edit Draw links") and surface on the public feed via [`getAllWinners`](../../src/utils/draws/get-all-winners.ts):

- `WinnerSummary.drawResultUrl` = `majorDraw.resultUrl ?? winner.drawResultUrl` — the draw-level value wins, with the legacy per-winner field as fallback (no migration needed). Powers every **"View result" / "Verify"** link (`ResultsRegister`, `WinnersBrowser`).
- `WinnerSummary.watchUrl` = `majorDraw.watchUrl` (major draws only; `undefined` for minis). Powers the **"Watch the draw"** button in the testimony `StoryModal`.

## className conventions (2026-05-08)

Draw components use `cn()` from `@/utils/cn` for conditional class composition. The `sweep-classname-template-literals` codemod (Plan 5 Phase 2) converted template-literal `className={`...`}` patterns to `className={cn(...)}`. Use `cn()` rather than template literals when adding new conditional classes.

## Interaction smoothness (Phase 1, 2026-05-09)

[`MiniDrawCountdown`](../../src/app/(site)/mini-draws/[id]/components/MiniDrawCountdown.tsx) is now leaf-isolated via [`<CountdownLeaf>`](../../src/components/ui/CountdownLeaf.tsx) / [`useLeafTimer`](../../src/hooks/useLeafTimer.ts) so the mini-draw detail page does not re-render on every tick of the countdown. See [shared-ui/patterns.md](../shared-ui/patterns.md#site-wide-interaction-smoothness--phase-1-2026-05-09) for the pattern.

## Conversion tracking (Purchase)

`MiniDrawSuccessClient.tsx` fires the browser Purchase pixel via `trackConversion(buildPurchaseEvent(...))`, with `eventId = paymentIntentId` for browser↔server dedup. The fire is guarded by `shouldSuppressPurchasePixel` / `markPurchasePixelFired` ([purchase-pixel-fired-storage.ts](../../src/utils/tracking/purchase-pixel-fired-storage.ts), localStorage key `purchasePixelFired_${paymentIntentId}` holding the first-fire time) — not just a per-mount `firedRef`. Re-fires within 46h of the first fire stay allowed (Meta merges them; free delivery-recovery); only older re-fires are suppressed. The ref alone re-fired on every remount (refresh/back-nav/history revisit); Meta's event_id dedup only lasts ~48h, so a revisit later than that counted as a brand-new conversion and inflated Meta-reported ROAS. The first legitimate fire and the server CAPI redundancy are unchanged. It passes `contentName: status.data.packageName` so the Purchase carries `content_name` on both the pixel and the server Events API/CAPI (same source as the server, so values match). Field-by-field reference: [docs/tracking/EVENT_PARAMETER_MATRIX.md](../tracking/EVENT_PARAMETER_MATRIX.md).
