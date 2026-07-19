# Promo — Gotchas

## Promo-visit recording is a dep-injected functional core

`recordPromoVisit` (`src/utils/promo-analytics/record-promo-visit.ts`) holds the visit-recording orchestration: dedup (when an anonymousId is present) → resolve UTM/referrer attribution → persist. Its side effects (`hasRecentVisit`, `recordVisit`) are **injected** by the caller — the `/api/tracking/promo-page-visit` route wires the real Mongo-backed deps inside `after()` (the injected `hasRecentVisit` calls `connectDB()` first — mongoose never auto-connects, and on a cold instance a bare query would buffer ~10s and lose the visit). This keeps the route thin and makes the logic unit-testable with no DB (`npm run test:promo-visit`). Dedup **fails open**: if the dedup read throws (timeout / connection error), the visit is recorded anyway — at worst one duplicate row inside the 60s window beats a silently dropped visit. UTM resolution order is: explicit body value → URL `utm_*` → (utmCampaign only) `fb_<campaign_id>` fallback for Facebook ads that omit `utm_campaign`. The raw slug is passed to `recordVisit` (which lowercases on write); the dedup query uses the normalized slug. See [docs/tracking/gotchas.md](../tracking/gotchas.md) for why it runs in `after()`.

## Banner behaviour

(Migrated from `docs/PROMO_BANNER_BEHAVIOUR.md` — _TODO: read root file and merge full content._)

Brief: banner displays `PromoBannerText.text`; gets suppressed on certain admin pages; respects schedule via `ScheduledPromo`; can be themed via `usePromoThemeStore`.

## Page analytics

(Migrated from `docs/PROMO_PAGE_ANALYTICS.md` — _TODO: read root file and merge._)

Brief: `PromoAnalyticsVisit` rows track every visit; aggregations roll up per promo / per day. Can desync if Klaviyo / GTM event firing fails — analytics is best-effort.

## Comeback promo

(Migrated from `docs/CANCELLED_MEMBERSHIP_COMEBACK_PROMO.md` — _TODO: read root file and merge._)

Brief: triggered by Klaviyo flow watching `MembershipStatusHistory` for cancellation rows. Respects unsubscribe; gates on prior promo eligibility.

## UTM persistence interplay

PromoLinks rely on `useUTMPersistence` ([tracking](../tracking/)) to keep UTM params across the session. If UTM persistence is broken, promo attribution breaks silently — analytics rows lack source data.

## Multiplier stacking

When a code-based promo is applied while an alternating multiplier is active, the stacking rule isn't always intuitive. Document the resolver decision before changing it. _TODO: add concrete example._

## Scheduled promo timezone

ScheduledPromo dates: are they stored as UTC or AEST? _TODO: confirm and document. If UTC, the helper that compares "now" to range must convert AEST cycles correctly._

## Terminology: `isAdditional` (was `isMemberOnly`) — 2026-07-01

The package flag `isMemberOnly` was renamed to **`isAdditional`** across the codebase. It marks packages that require *additional-package access* — an **active subscription OR current major-draw entries** (see `hasAdditionalPackageAccess`), which is broader than subscribers; it was never truly "member-only". The internal `-member` UI id-suffix (a row disambiguator) is intentionally unchanged. Full rationale: [subscription/gotchas.md](../subscription/gotchas.md).

## CSS-hidden `<video preload="auto">` still downloads — mount per-viewport, don't just hide with CSS (2026-07-19)

`lg:hidden` / `hidden lg:block` (or any `display:none`) does **not** stop a `<video preload="auto">` from fetching — the browser starts the network request as soon as the `<video>`/`<source>` elements are in the DOM, regardless of visibility. `PromoHero` used to render BOTH the mobile and desktop `<LandingHeroVideo>` unconditionally (gated only by `showVideo`, not by which one was actually visible), so every promo landing visit downloaded two full hero clips — one hidden, one shown. Fixed by adding a client-only `viewport: "mobile" | "desktop" | null` state (`null` until mount, resolved via `matchMedia("(min-width: 1024px)")`) and gating each container's video branch on `viewport === "mobile"` / `viewport === "desktop"` so only the on-screen container ever mounts a `<video>`. **Don't reach for `useIsLgUp`** for this: its SSR/first-paint snapshot is `false` (not `null`), which would mount the MOBILE branch during SSR on every request including desktop — a tri-state local `viewport` is required to render zero videos before mount (see `PromoHero.tsx`). This is the same class of bug documented for images in [shared-ui/gotchas.md](../shared-ui/gotchas.md) "viewport-correct `priority`/preload" — same rule applies to `<video>`, just with a bigger payload.

**Residual gap (known, accepted):** pre-mount (`viewport === null`), both the mobile and desktop containers fall through to the pre-existing still-image fallback branch (the same one used when a slug has no video at all) — so there is a brief window where BOTH stills are in the DOM before the mount effect narrows to one video. Fixed (2026-07-19, fix round 1) to use `loading="eager"` rather than `priority` on these two fallback stills — `priority` auto-generates a `<link rel="preload" fetchpriority="high">` (via Next's own `ImagePreload`, `loading` alone does not), so the still-fallback branches no longer force a **preload-priority** double-fetch, just the two `<img>` elements' own normal-priority requests during the brief pre-mount window. This is a strict improvement over the pre-fix bug (both FULL VIDEOS downloading unconditionally, with no mount gate at all) and self-corrects on the next paint; it is not literally zero double-download, and the still-image branches were intentionally left as JS-gated (`showVideo`/`viewport`) rather than getting the `<picture>`-element treatment used in [shared-ui/gotchas.md](../shared-ui/gotchas.md)'s CSS-hidden-pair fix, since here the pair is gated by JS state, not CSS `hidden`.

**`LandingHeroVideo`'s `onUnavailable` does not fire when every `<source>` is exhausted (known, practically unreachable).** `<source>` `error` events do not bubble to the parent `<video>` element — only an error on the `<video>` element ITSELF (e.g. a decode failure after a source loads) triggers `onError`. When all `<source>`s 404/fail to decode, the browser sets the media element to `networkState === NETWORK_NO_SOURCE` silently, with no error event at all — so `onUnavailable` (wired via `<video onError=...>`) never fires and the caller never falls back to the still. In practice this is unreachable today because every clip ships both a WebM and an MP4 twin (see the WebM-first entry in [frontend.md](./frontend.md)) and the resolver always emits at least the base tier, so total exhaustion would require BOTH format twins to be missing from disk — a deployment error, not a runtime condition. Documented so the next editor doesn't assume `onUnavailable` is a complete safety net if that assumption ever changes (e.g. a future tier ships only one format).

## Raw-path image preloads never match `/_next/image` URLs — use `getImageProps` (2026-07-19)

A `<link rel="preload" as="image" href="/images/foo.webp">` preloads the **raw source path**, but `next/image` actually requests the browser-optimized `/_next/image?url=...&w=...&q=75` URL — the two never match, so the hand-written preload silently does nothing useful (no error, just a wasted/ignored hint) while the real image request still incurs full latency. Fixed across the promo landing hero preloads (`ToolsetLandingPage` AND the dynamic-slug `app/promotions/[slug]/page.tsx` — both compute `getLandingHeroVideoPaths(slug, urgency)` first: a video-eligible slug emits NO image preload at all, since the still never paints there), the homepage `Hero`, and the `/promotions` gallery's featured card: compute the preload via `getImageProps({ src, alt: "", fill: true, sizes: "100vw" })` (from `next/image`) and pass its `props.srcSet` to `imageSrcSet` (+ `imageSizes`) on the `<link>`, so the preloaded URL is the SAME one the browser will actually request. `getImageProps` is a plain function (no hooks) — safe to call in both Server and Client Components. Also fold in the viewport split via `media="(max-width: 1023px)"` / `media="(min-width: 1024px)"` on each `<link>` rather than emitting both unconditionally — an unconditional pair downloads both the mobile AND desktop variant regardless of which one the visitor will actually see. **The preload `<link>` alone is not the whole fix** — if the visible markup still mounts two separate `<Image>`s toggled by CSS `hidden`/`lg:block`, BOTH still download regardless of what you preload; see [shared-ui/gotchas.md](../shared-ui/gotchas.md) "Viewport-correct `priority`/preload" for the paired `<picture>` fix (`Hero.tsx`, `/promotions` featured card).

## Hero "Enter Now" needs the page's package section to listen for `openMembershipModal` (2026-07-01)

The promo hero / giveaway countdown / entry CTAs don't own a modal — `useMajorDrawEntryCta.openEntryFlow({ openLocalModal: false })` dispatches a `window` `"openMembershipModal"` CustomEvent (the major-draw purchase gate is already applied; **members** with additional-package access are routed to the special-packages modal instead, so the event only fires for non-members). Whatever **package section** renders on the page is expected to listen for that event and open its `MembershipModal`. The lesson came from the 2026-07 packages-design A/B test (concluded 2026-07-06, control won, treatment removed): the treatment component originally didn't listen, so the hero "Enter Now" silently no-op'd for non-members on that arm. Fixed with a shared [`useOpenMembershipModalListener`](../../src/hooks/useOpenMembershipModalListener.ts) hook (gating built in) — one line, impossible to half-implement. `MembershipSection` uses it today; any future package-section variant rendered on a promo page must too, or it will reintroduce the silent no-op.

## Promo landing pages are ISR again — two server-side reads were removed to get there (2026-07-19)

The root-layout `force-dynamic` that nullified `/promotions/**`'s declared `revalidate = 60` is gone, and `ToolsetLandingPage` no longer calls `getServerVariantAssignment()` (it read `cookies()`/session, which forces dynamic rendering). A/B assignment is client-authoritative (`POST /api/ab-testing/assign` creates assignments + records page_view); first-time visitors are unaffected, returning assigned visitors briefly see the default variant until the client assignment applies. Content staleness is bounded by the ISR window (60 s). Do NOT reintroduce `cookies()`/`headers()`/`getServerSession` into any promotions server component — it silently flips the page back to per-request rendering (check the `next build` route table).

## Banner-text endpoint is CDN-cacheable now

`/api/admin/promo/banner-text/active` (public, no auth, admin-scheduled content) serves `public, s-maxage=60, stale-while-revalidate=120` — matching its sibling `/api/promo/effective-for-banner` — and the client hook dropped its `cache: "no-store"`. It was `no-store` before, which forced one serverless + Mongo round trip per ad-landing visitor for content that changes at most a few times a day.
