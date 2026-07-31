# Promo — Gotchas

## Promo-visit recording is a dep-injected functional core

`recordPromoVisit` (`src/utils/promo-analytics/record-promo-visit.ts`) holds the visit-recording orchestration: dedup (when an anonymousId is present) → resolve UTM/referrer attribution → persist. Its side effects (`hasRecentVisit`, `recordVisit`) are **injected** by the caller — the `/api/tracking/promo-page-visit` route wires the real Mongo-backed deps inside `after()` (the injected `hasRecentVisit` calls `connectDB()` first — mongoose never auto-connects, and on a cold instance a bare query would buffer ~10s and lose the visit). This keeps the route thin and makes the logic unit-testable with no DB (`npm run test:promo-visit`). Dedup **fails open**: if the dedup read throws (timeout / connection error), the visit is recorded anyway — at worst one duplicate row inside the 60s window beats a silently dropped visit. UTM resolution order is (since 2026-07-31): **first-touch `_ta_attr` cookie** → explicit body value → URL `utm_*` → (utmCampaign only) `fb_<campaign_id>` fallback for Facebook ads that omit `utm_campaign`. The raw slug is passed to `recordVisit` (which lowercases on write); the dedup query uses the normalized slug. See [docs/tracking/gotchas.md](../tracking/gotchas.md) for why it runs in `after()`.

**The cookie is read in the ROUTE, not in the recorder or the client.** `request` cannot be touched once `after()` has been scheduled, and a client-side read would race the write — the hook that WRITES `_ta_attr` mounts above the one that fires this beacon, and React runs child effects first, so on a first landing the beacon could read before the cookie exists. The route passes `firstTouchUtm{Source,Medium,Campaign}` into `PromoVisitCapture`; the recorder stamps `utmBasis` from whether the first-touch source was present.

## A resolver parameter that does not match its callers' key is invisible to `tsc`

`resolvePromoAnalyticsRange` took `{ range }` while all six callers passed `{ dateRange }`, so
**every** date selection on the Page Analytics tab silently returned AEST today — for months, on
both the admin route and the Norm mirror. The type-checker could not see it: the field was
optional, and the argument was a variable rather than an object literal, so excess-property
checking never applied.

Two habits close this class of bug, and the fix applies both:

1. **Name the parameter exactly what the caller's key is.** A rename then becomes a compile error.
2. **Never forward a Zod `parsed.data` wholesale into a function with optional fields.** Map it
   field by field at the call site. The wholesale spread is what let the names drift.

Guard: `npm run test:promo-analytics-range` asserts every range key is reachable and that none
collapses to today.

## Visits expire at 90 days; signups and revenue do not

`PromoAnalyticsVisit` has a TTL; `User` and `PaymentEvent` do not. Any ratio on this tab whose
denominator is visits is meaningless outside the retention window — an unclamped "All Time" renders
visit→signup rates in the hundreds of percent, and a page retired before the floor reads
`visits 0 / signups 400 / revenue $12,000`.

`resolvePromoAnalyticsRange` clamps the **whole** window (not just the visits query) to
`PROMO_VISIT_RETENTION_DAYS` and reports `visitsRetainedFrom` + `clampedToRetention` so the UI can
say why. If you add a new metric here that joins a non-expiring collection to visits, it inherits
this constraint — do not re-derive the floor locally, read it from the model export.

## Page-level uniques are NOT the column sums of a per-combination breakdown

`buildVisitors` / `builds` dedupe a visitor **once per page**; `byBuild[].builders` dedupes **per
combination**. A visitor who lands twice and settles on a different combination each time is 1 in
the first and 2 in the second, so `Σ builders ≥ buildVisitors` always. Summing a distribution for a
numerator while dividing by a page-level count is exactly what shipped a literal **250%** column
(F-013). Never render the page-level figures as a footer total under the breakdown table.

The same shape applies to the channel drill-down's `rawSources`: they are **per-source** uniques
(one visitor can arrive via `ig` and later `facebook.com`), so they MAY sum above `summary.visits`.
They exist to audit what folded into a channel — never as an addend.

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

## Never derive the landing-asset mapping from the art team's filenames (2026-07-27)

The draw 9 export shipped **nine desktop files whose name disagreed with their artwork** —
three Ryobi banners named as HiKOKI, a Kincrome banner named as GearWrench, three files whose
bare name was `drawn-tonight` when the convention says bare = `drawn-tomorrow`, and one
tonight/tomorrow pair that was simply reversed. Every one was a clean, finished banner; only
the label was wrong, and each was the ONLY copy of that combination + tier.

A filename-derived ingest would have passed lint, types, the manifest check and every URL
assertion while shipping the wrong prize on live pages. **Nothing automated catches this** —
`dewalt-gwTB.webp` containing Makita art satisfies all of them. The only defences are reading
the artwork before renaming, and a proof recording afterwards.

So: `EXCEPTIONS` in `scripts/convert-draw9-landing-to-webp.ts` records what each file
ACTUALLY shows, with the reason. Do not add an entry from a guess, and do not assume a new
drop repeats the last one's ordering — the 2026-07 export already differed from 2026-06.

## A resolver's "return the broken URL so the failure is visible" stops being safe once the case is reachable (2026-07-27)

`resolveLandingHeroImage` ended with `return desired` when nothing existed for a
brand × toolbox — deliberate, so a missing asset would show up. That was fine while every
combination had art. Draw 9 shipped GearWrench without its Ryobi pairing, making the branch
reachable for the first time, and the "visible failure" turned out to be a **400 from
`/_next/image`**: a blank hero plus a console error on a real customer page, not a placeholder.

It now falls back to the evergreen collage. Caught by the e2e QA watchdog mid-recording —
worth remembering that a unit test asserting "this URL is not in the manifest" happily
documented the gap without noticing it rendered as a 400.

## CSS-hidden `<video preload="auto">` still downloads — mount per-viewport, don't just hide with CSS (2026-07-19)

`lg:hidden` / `hidden lg:block` (or any `display:none`) does **not** stop a `<video preload="auto">` from fetching — the browser starts the network request as soon as the `<video>`/`<source>` elements are in the DOM, regardless of visibility. `PromoHero` used to render BOTH the mobile and desktop `<LandingHeroVideo>` unconditionally (gated only by `showVideo`, not by which one was actually visible), so every promo landing visit downloaded two full hero clips — one hidden, one shown. Fixed by adding a client-only `viewport: "mobile" | "desktop" | null` state (`null` until mount, resolved via `matchMedia("(min-width: 1024px)")`) and gating each container's video branch on `viewport === "mobile"` / `viewport === "desktop"` so only the on-screen container ever mounts a `<video>`. **Don't reach for `useIsLgUp`** for this: its SSR/first-paint snapshot is `false` (not `null`), which would mount the MOBILE branch during SSR on every request including desktop — a tri-state local `viewport` is required to render zero videos before mount (see `PromoHero.tsx`). This is the same class of bug documented for images in [shared-ui/gotchas.md](../shared-ui/gotchas.md) "viewport-correct `priority`/preload" — same rule applies to `<video>`, just with a bigger payload.

**Residual gap (known, accepted):** pre-mount (`viewport === null`), both the mobile and desktop containers fall through to the pre-existing still-image fallback branch (the same one used when a slug has no video at all) — so there is a brief window where BOTH stills are in the DOM before the mount effect narrows to one video. Fixed (2026-07-19, fix round 1) to use `loading="eager"` rather than `priority` on these two fallback stills — `priority` auto-generates a `<link rel="preload" fetchpriority="high">` (via Next's own `ImagePreload`, `loading` alone does not), so the still-fallback branches no longer force a **preload-priority** double-fetch, just the two `<img>` elements' own normal-priority requests during the brief pre-mount window. This is a strict improvement over the pre-fix bug (both FULL VIDEOS downloading unconditionally, with no mount gate at all) and self-corrects on the next paint; it is not literally zero double-download, and the still-image branches were intentionally left as JS-gated (`showVideo`/`viewport`) rather than getting the `<picture>`-element treatment used in [shared-ui/gotchas.md](../shared-ui/gotchas.md)'s CSS-hidden-pair fix, since here the pair is gated by JS state, not CSS `hidden`.

**`LandingHeroVideo`'s `onUnavailable` does not fire when every `<source>` is exhausted (known, practically unreachable).** `<source>` `error` events do not bubble to the parent `<video>` element — only an error on the `<video>` element ITSELF (e.g. a decode failure after a source loads) triggers `onError`. When all `<source>`s 404/fail to decode, the browser sets the media element to `networkState === NETWORK_NO_SOURCE` silently, with no error event at all — so `onUnavailable` (wired via `<video onError=...>`) never fires and the caller never falls back to the still. In practice this is unreachable today because every clip ships both a WebM and an MP4 twin (see the WebM-first entry in [frontend.md](./frontend.md)) and the resolver always emits at least the base tier, so total exhaustion would require BOTH format twins to be missing from disk — a deployment error, not a runtime condition. Documented so the next editor doesn't assume `onUnavailable` is a complete safety net if that assumption ever changes (e.g. a future tier ships only one format).

## `PromoHero` withholds theme-forked art until the default-theme experiment settles (2026-07-28)

An earlier draft of the default-theme A/B design (`docs/superpowers/specs/2026-07-28-promo-theme-split-design.md`) asserted "the hero physically cannot paint before JS runs, so the banner is never wrong." **That was wrong** — an audit caught it before ship. `PromoHero` only gates the `<video>` on the post-mount `viewport` tri-state (see the CSS-hidden-video entry above). Pre-mount, and whenever there's no video for a slug, BOTH the `isLoading` stage and the main-render still-image branch fall through to theme-forked assets: the `isLoading` stage background comes from `resolveLandingHeroBackground(themeMode)`, and the main branch's `<Image src>` comes from `getImageForMode(landingHeroPaths, themeMode, …)`. Both read `themeMode` from `useThemeStore`, which is populated from `localStorage`/media-query on mount — so on first paint of the *default*-theme experiment (before the visitor's assigned arm is known), these would paint (and fetch) the wrong-arm hero.

That matters specifically because `PromoThemeExperimentGate` (`src/components/ab-testing/PromoThemeExperimentGate.tsx`, Task 8) is an **overlay**, not a replacement — the page is ISR-static for SEO, so `children` (including `PromoHero`) always render underneath the full-screen loader, gated only by `inert`/`aria-hidden`, not by unmounting. A mounted `<Image>` underneath an opaque loader still gets **fetched**. Without withholding the art, a dark-arm visitor would download the light hero (whatever `themeMode` resolves to pre-decision), discard it, then fetch the dark one once the experiment settles — a systematic bandwidth/LCP handicap on exactly one arm, which would corrupt the experiment's own result (the arm being penalized would look like it "converts worse" purely from the extra fetch + repaint).

Fixed by reading `usePromoThemeSettled()` (default `true` outside the gate — a no-op everywhere except promo landings) and adding a new early return **above** the `isLoading` block: when `!themeSettled`, `PromoHero` returns the same reserved `<section>` box (identical className, so no layout shift either way it resolves) with a plain themed `bg-white dark:bg-neutral-950` div and **no `<Image>` elements at all** — no theme-forked asset is emitted until the arm is known. The `isLoading` and main-render still-image branches are unchanged; this only closes the gap between mount and the experiment settling.

## Raw-path image preloads never match `/_next/image` URLs — use `getImageProps` (2026-07-19)

A `<link rel="preload" as="image" href="/images/foo.webp">` preloads the **raw source path**, but `next/image` actually requests the browser-optimized `/_next/image?url=...&w=...&q=75` URL — the two never match, so the hand-written preload silently does nothing useful (no error, just a wasted/ignored hint) while the real image request still incurs full latency. Fixed across the promo landing hero preloads (`ToolsetLandingPage` AND the dynamic-slug `app/promotions/[slug]/page.tsx` — both compute `getLandingHeroVideoPaths(slug, urgency)` first: a video-eligible slug emits NO image preload at all, since the still never paints there), the homepage `Hero`, and the `/promotions` gallery's featured card: compute the preload via `getImageProps({ src, alt: "", fill: true, sizes: "100vw" })` (from `next/image`) and pass its `props.srcSet` to `imageSrcSet` (+ `imageSizes`) on the `<link>`, so the preloaded URL is the SAME one the browser will actually request. `getImageProps` is a plain function (no hooks) — safe to call in both Server and Client Components. Also fold in the viewport split via `media="(max-width: 1023px)"` / `media="(min-width: 1024px)"` on each `<link>` rather than emitting both unconditionally — an unconditional pair downloads both the mobile AND desktop variant regardless of which one the visitor will actually see. **The preload `<link>` alone is not the whole fix** — if the visible markup still mounts two separate `<Image>`s toggled by CSS `hidden`/`lg:block`, BOTH still download regardless of what you preload; see [shared-ui/gotchas.md](../shared-ui/gotchas.md) "Viewport-correct `priority`/preload" for the paired `<picture>` fix (`Hero.tsx`, `/promotions` featured card).

**Second skip trigger added 2026-07-28:** both files' `heroImagePreload` guard now also returns `null` when the baked `themeExperimentId` (the default-theme A/B sentinel, see [frontend.md](./frontend.md#default-theme-ab-gate-wired-into-both-promo-landing-pages-2026-07-28)) is non-null, not just when `heroVideo` is truthy. `heroImagePaths` here is always the LIGHT variant — the server has no theme — so with the theme test live, preloading it would hand exactly one arm (dark) a wasted download-then-discard while the other arm benefits, a one-sided LCP handicap that would bias the experiment's own conversion numbers.

## Hero "Enter Now" needs the page's package section to listen for `openMembershipModal` (2026-07-01)

The promo hero / giveaway countdown / entry CTAs don't own a modal — `useMajorDrawEntryCta.openEntryFlow({ openLocalModal: false })` dispatches a `window` `"openMembershipModal"` CustomEvent (the major-draw purchase gate is already applied; **members** with additional-package access are routed to the special-packages modal instead, so the event only fires for non-members). Whatever **package section** renders on the page is expected to listen for that event and open its `MembershipModal`. The lesson came from the 2026-07 packages-design A/B test (concluded 2026-07-06, control won, treatment removed): the treatment component originally didn't listen, so the hero "Enter Now" silently no-op'd for non-members on that arm. Fixed with a shared [`useOpenMembershipModalListener`](../../src/hooks/useOpenMembershipModalListener.ts) hook (gating built in) — one line, impossible to half-implement. `MembershipSection` uses it today; any future package-section variant rendered on a promo page must too, or it will reintroduce the silent no-op.

## Promo landing pages are ISR again — two server-side reads were removed to get there (2026-07-19)

The root-layout `force-dynamic` that nullified `/promotions/**`'s declared `revalidate = 60` is gone, and `ToolsetLandingPage` no longer calls `getServerVariantAssignment()` (it read `cookies()`/session, which forces dynamic rendering). A/B assignment is client-authoritative (`POST /api/ab-testing/assign` creates assignments + records page_view); first-time visitors are unaffected, returning assigned visitors briefly see the default variant until the client assignment applies. Content staleness is bounded by the ISR window (60 s). Do NOT reintroduce `cookies()`/`headers()`/`getServerSession` into any promotions server component — it silently flips the page back to per-request rendering (check the `next build` route table).

## Banner-text endpoint is CDN-cacheable now

`/api/admin/promo/banner-text/active` (public, no auth, admin-scheduled content) serves `public, s-maxage=60, stale-while-revalidate=120` — matching its sibling `/api/promo/effective-for-banner` — and the client hook dropped its `cache: "no-store"`. It was `no-store` before, which forced one serverless + Mongo round trip per ad-landing visitor for content that changes at most a few times a day.

## Guest promo hooks no longer poll — flips reach an active guest ≤120 s (perf Tier-2, 2026-07-20)

The four public promo-surface hooks — `useActivePromos` (was a 30 s `refetchInterval`), `useEffectiveForBanner`,
`useCurrentAlternatingMultipliers`, `useActivePromoBannerText` (all were 60 s) — **dropped their
`refetchInterval`** and now use `staleTime: 60 s` + `refetchOnWindowFocus`/`refetchOnMount` (and no
`cache: "no-store"`, so the routes' `s-maxage=60` CDN entries are honoured — the POST `/api/admin/promo/active`
used by `useActivePromos` isn't CDN-cached, but the poll removal still applies).

**Freshness contract:** a promo **multiplier flip** (or banner-text change) reaches an **active** guest within
**≈120 s** — the value refreshes on their next focus/navigation once the 60 s `staleTime` lapses, served
fresh-within-60 s from the CDN. An **idle** guest who leaves the tab focused but never interacts only refreshes
on focus — this is the **accepted trade** for eliminating the every-30/60 s poll. This is safe because the
banner **countdown ticks client-side from `endDate`** (`useLeafTimer` leaf tickers in `PromoBanner` /
`FloatingCountdownBanner`) — no on-screen clock depends on the poll; only the multiplier/banner-text *values*
do. See [client-state/rules.md R8](../client-state/rules.md#r8-prefer-cdn-s-maxage--focusnavigation-refetch-over-a-guest-refetchinterval).

## Drawn-tier stills were redesigned but the drawn CLIPS were not — motion users still see the old art (2026-07-24)

The 2026-07 export re-shipped every `drawn-tomorrow` / `drawn-tonight` **still** in the new
brand-coloured "WIN A …" design and added HiKOKI. The drawn **video clips** under
`public/videos/landing/{brand}/` were **not** part of that drop — they are still the previous dark
"WIN THE ULTIMATE" design for the four original brands, and HiKOKI has no drawn clip at all.

This matters because `PromoHero` is **video-first**: `showVideo = heroVideoPaths != null &&
!videoFailed`, and the still is rendered alongside but CSS-hidden (`motion-reduce:hidden` on the
`<video>`, `hidden … motion-reduce:block` on the `<Image>`). So on the drawn tier today:

| Brand | Motion on (default) | Reduced motion |
|---|---|---|
| milwaukee / dewalt / makita / ryobi | **old** dark drawn clip | **new** drawn still |
| hikoki | base clip (no drawn clip exists) | **new** drawn still |

So the redesign is only visible to reduced-motion users until the matching drawn clips land. Nothing
is broken — every path resolves to real art — but the animated and still heroes are **different
designs** in the meantime. When the new clips arrive, run
`npm run convert:drawn-tonight-tomorrow-videos` (re-verify its numbering mapping first — see
[architecture.md](architecture.md), the numbering scheme changed between drops) and the two agree again.

To *see* a drawn still in a browser without waiting for the clips, emulate reduced motion
(DevTools → Rendering → "Emulate CSS prefers-reduced-motion") — that is exactly what the
`landing drawn-state` demo spec does.

## `router.replace` resets scroll on the prize builder — use `history.replaceState`

Picking a toolbox on `/promotions/makita` used to snap the visitor to the top of the page.
Measured on production 2026-07-27: `scrollY` 2769 -> 0 roughly 100ms after the click, with
`document.scrollHeight` unchanged (9122) and no route loader — so not a re-render collapse and
not a navigation. It is the App Router resetting scroll **despite** `{ scroll: false }`.

`PrizeShowcase` therefore mirrors the build with `window.history.replaceState`, which cannot
scroll and triggers no RSC refetch. Same root cause and same fix as the note at
`useMembershipModalDeepLink.ts:97-107`.

**Only the lanes that wrote to the URL ever jumped** — the toolbox lane and the cash opt-out.
The toolset lane wrote nothing, which is why it never jumped and also why the chosen brand was
invisible to analytics until the build params landed.

Use `replaceState`, never `pushState`: Back must leave the page, not step back through builds.

## The prize-build beacon: report everyone, but only write once (2026-07-29, F-018)

`usePrizeBuildTracking` has two senders and they are gated differently **on purpose**. Getting this
wrong is a live regression that shipped once and was caught only by e2e.

- **Debounced send** — gated on `hasInteracted`.
- **Unload flush** (`pagehide` / `visibilitychange`) — **never** gated.

The reasoning runs in two steps, and skipping either one breaks something:

1. **Every visitor's build must reach the visit row**, including someone who never touches the reels.
   The signup path records the page's default build for that visitor, so if the visit row omits it,
   `builders` and `signups` count different populations and `builderToSignupRate` can exceed 100% —
   the same class of visibly-impossible number as F-013's 250% column.
2. **But the debounced sender must not run for them.** It fires on mount, so ungating it means one
   write per visitor on arrival *plus* another after their first switch — **double the writes on the
   highest-traffic ad-landing path in the product**, for no extra information. That regression was
   real: `prize-build-url-params.spec.ts` failed with `Expected: 1, Received: 2` and
   `Expected: 2, Received: 4` across all three browser projects.

The unload flush already covers the untouched visitor, so gating only the debounce gives **one write
per visitor** in both cases: untouched → one write at unload; engaged → the debounced write, with the
unload flush suppressed by the `lastSent` payload dedup.

**Do not "simplify" this by gating both senders** (untouched visitors vanish from `builders` again)
**or neither** (writes double). And do not infer engagement from `toolboxSwitches`/`toolsetSwitches`:
cash is a toggle, not a reel card, so a cash-only visitor sits at `0/0` and has still engaged (F-010).
The payload carries `interacted` explicitly for that reason.

## The footer paints at the top of the viewport before promo content streams (CLS 0.59)

**Found 2026-07-30 by measurement; fixed by one line in `src/app/promotions/layout.tsx`.**

Desktop Speed Insights showed `/promotions/*` at **CLS 0.59** — the largest contributor to a
Real Experience Score of 78. Every affected route reported the *same* value, which is the
tell for one shared cause rather than per-page content.

### Mechanism (traced live, not inferred)

`promotions/layout.tsx` rendered `{children}` followed immediately by
`<NewsletterSection /> + <Footer />`, with nothing reserving height for the page. Page
sections sit behind `<Suspense fallback={null}>` boundaries, which reserve none either. On a
slow connection the footer is therefore in the shell and paints first — at the very top of
the viewport — then gets displaced when content arrives:

```
t=3332ms  footerTop=0     footerH=537  mainH=null   ← footer at viewport top
t=3758ms  footerTop=5210  footerH=537               ← content arrives, footer shoved down
```

A 537px, full-width element moving 5210px is an enormous shift fraction.

### The fix, and why it works

`<div className="min-h-screen-svh">{children}</div>` in the LAYOUT. Being in the layout is
the whole point: it is part of the RSC shell, so it renders immediately and the footer
starts below the fold. The later displacement is then off-screen, and a shift of an
off-screen element does not count toward CLS. `(site)/layout.tsx` already made exactly this
reservation via `.site-main-content`, which is why those routes scored 0.073 rather than
0.59.

### A viewport of reservation is 92px too short — the newsletter overhangs it (CLS 0.102)

Reserving a flat `100svh` leaves a smaller, second shift behind. `NewsletterSection` is
`absolute top-0 -translate-y-1/2` inside the wrapper it shares with the footer, so it paints
**half its own height above** that wrapper's top edge. With the wrapper's top at exactly
100svh, that half lands inside the viewport:

```
reservedH=900  newsH=184  newsTop=808        <- 92px of card visible in a 900px viewport
shift: div.absolute.top-0.left-0.right-0  from y=808 h=92  ->  to y=0 h=0
92/900 = CLS 0.1015, deterministic across runs
```

The reservation therefore has to be `100svh + half the card's height`, which is what
`.min-h-screen-svh-newsletter` (globals.css) does. Measured card heights are 120 / 140 / 188px
at `<640` / `640–1023` / `≥1024`, so the overhang is 60 / 70 / 94px, reserved as 64 / 72 / 96.
After the fix `newsTop=904` — just below the fold — and all seven promo routes measure
**0.000** on desktop and mobile.

**`pb-*` cannot substitute for this, and an earlier commit that tried was reverted.**
`min-height` resolves against the border box here, so bottom padding is absorbed by the
reservation rather than added to it — the box stays exactly 100svh tall and the score stays
exactly 0.102. The `pb-20 sm:pb-24 lg:pb-32` on `(site)`'s `.site-main-content` is spacing
so content clears the same overhang visually; it is **not** a CLS reservation, and copying it
here fixed nothing. Verify any change to this by measurement, not by reading the class list.

`(site)` routes carry the identical markup but do **not** exhibit this shift: their reserved
block already holds real content at first paint (measured 2457px on `/`, 3211px on
`/winners`), so it is never exactly 100svh tall and the card never enters the viewport. The
promo layout is exposed because its `children` is a Suspense boundary that paints empty.

### Two things measurement disproved — do not re-suspect them

- **Not the theme experiment.** Identical CLS with the gate disabled (0.604 vs 0.604) and
  present on `/promotions` which has neither the gate nor `PromoHero`.
- **Not the urgency tiers.** base / final-hours / drawn-tomorrow / drawn-tonight all produce
  the byte-identical `footer y0 h537 -> h0` shift. The hero art is dimension-matched across
  tiers (2560x1044 desktop, 1080x1164 mobile) and all three `PromoHero` branches share one
  `<section>` className, so the tier swap contributes nothing.

### Measuring it at all requires throttling

Unthrottled runs score **0.000** and prove nothing — the shift only appears when content
streams slowly, which is the P75 cohort Speed Insights reports. Reproduce with 4x CPU
throttling on a ~1.6 Mbps / 150 ms link, and read `layout-shift` PerformanceEntries with
their `sources[]` so the finding names an element rather than a number. An unthrottled
"looks fine" is a false negative, and it briefly sent this investigation down the wrong path.
