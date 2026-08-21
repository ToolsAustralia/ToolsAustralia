# Shared UI — Gotchas

## `useSearchParams()` + `<Suspense fallback={null}>` = a section that ships as zero height (fixed 2026-07-27)

`/promotions/*` measured **CLS 1.1689** on a throttled 390×844 phone profile (0.4352 unthrottled) —
far past the 0.1 "good" threshold. Root cause of the part fixed here was NOT a slow image or a late
font: two of the page's largest sections were **absent from the prerendered HTML entirely** and only
appeared after hydration.

Both [`MembershipSection`](../../src/components/sections/MembershipSection.tsx) and
[`PrizeShowcase`](../../src/components/sections/promo/PrizeShowcase.tsx) called `useSearchParams()`
and each "solved" the resulting Next build error by self-wrapping in `<Suspense fallback={null}>`.
On a **prerendered** route (these pages are `revalidate = 60`; see
[security-csp/rules.md R8](../security-csp/rules.md)) `useSearchParams()` de-opts the client subtree
up to the nearest Suspense boundary to **client-only rendering** — Next renders the *fallback* into
the static HTML. A `null` fallback means the section is rendered as **nothing**: no element, no
reserved space. The page-level `<Suspense fallback={<div className="min-h-[600px]" />}>` in
[`[slug]/page.tsx`](../../src/app/promotions/[slug]/page.tsx) never got a chance to help — the inner
boundary is the closer one, so its `null` won.

Measured on `/promotions/milwaukee` (390×844), before → after hydration:

| Section | in static HTML | after hydration |
| --- | --- | --- |
| `#packages` (MembershipSection) | ~2px (empty `<section>`) | 1,265px |
| `.prize-builder` (PrizeShowcase, "Build your prize") | absent, 0px | 1,115px |

`#how-it-works` (GiveawayDetails) started at `y=522` — inside the 844px viewport — and was shoved to
`y=2913`. That single element is **0.3717** of the total on its own.

Measured A/B, same machine / port / viewport / build config, `next start` on the port matching
`NEXT_PUBLIC_APP_URL` (otherwise CSP blocks every client query and the numbers are meaningless).
Per-shift breakdown, 390×844, **4× CPU throttle + 1.6Mbps/150ms** — Speed Insights reports FIELD
data from real phones, so the throttled column is the one that matches what it scores:

| shift | before | after | what it is |
| --- | --- | --- | --- |
| 0.0020 @3.0s | ✓ | ✓ | promo-banner text reflow |
| **0.7458 @3.2s** | ✓ | ✓ | **the `<footer>`** — see below, NOT this fix's problem |
| **0.3717 @8.7s** | ✓ | **gone** | `#how-it-works` shoved off-screen — **this fix** |
| 0.0401 @9.0s | ✓ | ✓ | packages promo-multiplier banner |
| 0.0093 @9.9s | ✓ | ✓ | packages promo badge |
| **total** | **1.1689** | **0.7970** | |

Unthrottled on localhost the same A/B reads **0.4352 → 0.0566**, because the whole load resolves in
under a second and the footer shift never happens. Do not quote the unthrottled number as the field
result — it flatters the page and hides the biggest contributor.

Final laid-out geometry is **identical** either way (`#packages` 520/1265, `.prize-builder`
1784/1128, `#how-it-works` 2913/733) — the fix changes only *when* those sections exist, never how
they look.

Video proof of the pair (side-by-side, live CLS read-out, shifted regions flashed) — one-off
harness, artifact at `e2e-artifacts/proof/2026-07-27-cls-fix/cls-promotions-before-after.mp4`.

**Confirmed against LIVE production** (2026-07-27, pre-deploy, throttled 390×844): CLS **1.0815**,
carrying both the 0.7458 footer shift and a 0.3279 `#how-it-works` shift — so neither number is a
localhost artifact. The served production HTML is 206,911 bytes with a 56,765-char `<main>`, and
grepping it shows the de-opt exactly as diagnosed: `how-it-works` ×1 and `min-h-[400px]` ×2 present,
but **zero** occurrences of `Build your prize`, `prize-builder`, `Tradie`, `id="membership"`,
`min-h-[600px]` or `ENTER NOW`. Note when re-running this: a plain `curl` gets an
`X-Vercel-Mitigated: challenge` 429 bot-challenge page (an Astro interstitial, `data-astro-cid-*`) —
measure with a real browser, and assert the challenge markers are absent before trusting a sample.

### Still open — two shifts this pass did NOT fix

**0.7458 — the footer. Cause NOT yet isolated; do not repeat the first guess.** An earlier revision
of this entry blamed the page-level `min-h-[600px]`/`[400px]`/`[300px]` fallbacks in
[`[slug]/page.tsx`](../../src/app/promotions/[slug]/page.tsx) under-reserving against the real
1,265px / 1,128px sections. **The measurements contradict that** and it should not be quoted.

What is actually measured, sampling layout every 150ms through the load (throttled 390×844, live
production, reproduced across runs at CLS 1.0815 / 1.0816):

```
 1178ms  doc=844   main not in DOM yet
 3520ms  doc=844   mainH=0     footerTop=0      <- <main> is ZERO px; footer fills the viewport
 3789ms  doc=4311  mainH=3584  footerTop=3666   <- main expands; footer shoved 3,666px  = 0.7458
 8340ms                                          <- #how-it-works shift 0.3279 (the part fixed here)
```

At the instant of the shift `<main>` is **0px**, not the ~2,400px those fallbacks would occupy — so
the fallbacks are not what is holding the page open, and resizing them would not have fixed it.
In an earlier run that also sampled `document.styleSheets.length`, `main` gained its height in the
same 150ms window that the **5th stylesheet** finished loading, which makes a late, non-render-
blocking CSS chunk the leading hypothesis — but that is a correlation from one run, not a
conclusion. Root-cause it before changing anything.

It is present identically in the before AND after builds (byte-identical 0.7458), so it is
independent of this fix, and it is now the single largest CLS contributor on `/promotions/*`.

**0.0401 — the promo multiplier banner.** `MembershipSection`'s banner is gated on
`useResolvedMultiplier(...)`, a client query, so with a promo active it appears ~113px tall above
the packages grid on resolve. Reserving a fixed height just trades an expand-shift for a
collapse-shift on no-promo pages; the real fix is threading the page's already-server-fetched
`getEffectivePromosForDisplay()` down through `PromoPackages` so it renders in the static HTML.
That crosses several call sites of a shared component and was left out deliberately.

**The fix is to remove the hook, not to grow the fallback.** Both query reads were client-only
anyway, so they moved to `window.location.search` behind a small local helper
(`readForcedPackagesTab()` / `readCurrentSearchParams()`), matching what
[`PromoBanner`](../../src/components/sections/promo/PromoBanner.tsx) already does for the same
`?packages=` param. Both sections now server-render in full — which also puts the prize card and the
package grid back into the crawled HTML.

The self-wrapping `<Suspense>` was then **deleted**, deliberately: the homepage renders both
components with no boundary of its own, so re-introducing `useSearchParams()` (directly, or via a
hook like [`useMembershipModalDeepLink`](../../src/hooks/useMembershipModalDeepLink.ts)) now fails
`npm run build` loudly instead of silently reinstating the collapse. Keep it that way.

**Rules of thumb**

- A Suspense fallback of `null` around anything with height is a CLS bug waiting to happen. If a
  boundary is genuinely needed, the fallback must reserve the real height.
- Check the hook's whole *transitive* subtree, not just the component: `MembershipSection` itself
  was only half the problem — `useMembershipModalDeepLink()` called `useSearchParams()` too, and
  either one alone keeps the de-opt alive.
- Verify against the built output, not the dev server:
  `npm run build && grep -c "Build your prize" .next/server/app/promotions/milwaukee.html`.
  Dev mode renders these routes dynamically and hides the whole class of bug.

**See also:** `PrizeShowcase`'s `?toolset=`/`?toolbox=` URL sync (added 2026-07-27, after this
fix) reads and writes via `window.location.search` / `window.history.replaceState` for the same
reason — never `useSearchParams()`, and separately never `router.replace` (it resets scroll on
this page). See [promo/gotchas.md](../promo/gotchas.md) "`router.replace` resets scroll on the
prize builder".

## `getBaseUrl()` must strip a trailing slash — `NEXT_PUBLIC_APP_URL` may end in `/` (fixed 2026-07-23)

[`getBaseUrl()`](../../src/utils/url/get-base-url.ts) returned `process.env.NEXT_PUBLIC_APP_URL`
verbatim, while every sibling base-URL reader ([`layout.tsx`](../../src/app/layout.tsx),
[`sitemap.ts`](../../src/app/sitemap.ts), `requireSameOrigin.ts`) normalizes with
`.replace(/\/$/, "")`. Because the Vercel **Production** and **Preview** `NEXT_PUBLIC_APP_URL`
values were set with a trailing slash (`https://toolsaustralia.com.au/`), every
`` `${getBaseUrl()}/path` `` concatenation produced a double slash — surfaced during a Playwright
payment-endpoint check as `//api/major-draw`, `//api/winners/all` etc. returning `308` redirects
on staging (local was clean: `http://localhost:3000`, no trailing slash). The same value builds
Stripe **`return_url`s** ([`payment-intent-config.ts`](../../src/utils/payment/stripe/payment-intent-config.ts)
and the one-time-purchase / upsell-purchase routes), so a `//` there is harmless in test mode
(the redirect resolves) but undesirable for a live 3-D Secure return. Fixed defensively in the
helper (`.replace(/\/$/, "")`); the env vars themselves should also be set without the trailing
slash (remember `NEXT_PUBLIC_*` is inlined at **build time** — the fix needs a redeploy to take
effect, and must be applied in every environment, not just Production).

## Header top-bar rotating CTA: contrast fixed at its ANIMATION root cause, not just a color swap (fixed 2026-07-22)

`TopBarPromoLeaf` (inside [`Header.tsx`](../../src/components/layout/Header.tsx)) renders the
rotating "Join Tools Australia..." / "Monthly tool giveaway..." strip on `bg-red-600`. It was
axe-baselined as a `color-contrast` failure with wildly different captured ratios on different
pages/runs (~4.36:1 on `/`, ~1.05:1 on `/membership`) — investigated with a temporary axe debug
capture rather than guessed: the reported `fgColor` (`#ef0a0a`/`#f01a1a`, near-identical to the
`#ee0000` bg) proved the text was being sampled **mid-animation**, not at its static declared
color (`text-white` / `#ffffff`). Root cause: `.animate-topbar-reappear[-once]`'s
`topBarReappear` keyframes (`globals.css`) animated `opacity: 0 → 1 → 0` each 3s cycle (the
"reappear" fade); axe's scan timing (relative to `waitForLoadState('networkidle')`) landed in
that ramp often enough to alpha-blend the white text almost fully into the red background — no
static color pair can pass when the real defect is transient opacity, since any foreground
converges to the background at `opacity: 0`. Fixed at the root: `topBarReappear`'s keyframes
now pin `opacity: 1` throughout (kept the `translateY` slide + `text-shadow` glow pulse — same
visual "reappear" character, zero copy change). Defense-in-depth margin: the strip's background
also moved `bg-red-600` (`#ee0000`, white text only ~4.53:1 — razor-thin over the 4.5:1
threshold) → `bg-red-700` (`#b91c1c`, an existing brand-red shade in
[`tailwind.config.ts`](../../tailwind.config.ts), white text ~6.47:1). Scoped to this one
`data-top-bar` strip only — `bg-red-600` is untouched everywhere else (409 other sites per the
tailwind config comment). Verified 2× green `@a11y` runs with the baseline entry removed.

## "MOST POPULAR" corner ribbon: hardcoded white ink failed on light-toned tiers (fixed 2026-07-22)

[`CornerRibbonBadge`](../../src/components/ui/CornerRibbonBadge.tsx) always rendered ribbon text
in white except for the one `text-premium-gold` (VIP/black-tier) special case. For the
"MOST POPULAR" ribbon on the dewalt-yellow (foreman) membership card, that's white-on-`#ffc517`
gold — axe measured ~2.19:1 (needs 4.5:1; true math for white directly on that gold is ~1.6:1,
even worse). The codebase already tracks per-tier ink via `colorScheme.text` (`"text-black"` for
the light/bright tiers — dewalt-yellow, ryobi-green, mint-green — same signal
`ElectricPackageCard.tsx`'s `blackText`/`lightInk` already reads); `CornerRibbonBadge` just
wasn't consulting it. Fixed by generalizing the existing `usePremiumBlackRibbon` dark-ink branch
into `useDarkRibbonInk` (`usePremiumBlackRibbon || colorScheme?.text?.includes("black")`), reusing
the same `#141414` ink token already used for the VIP ribbon — no new color invented. Only
flips ink for the 3 light-toned tiers; red/blue/teal/dark-green tiers (`text-white`) are
unaffected. Computed contrast: white or `#141414` — `#141414` on `#ffc517` is ~11.6:1 (and
~8.4:1 against axe's own pixel-sampled `#d9a814`, which reads slightly darker than the declared
CSS value — likely anti-aliasing on the ribbon's `rotate(-45deg)` strip edge, not a distinct
bug). Visual `@visual` baselines for the home membership grid were regenerated for this change.

## `Carousel3D` hydration mismatch under reduced-motion — fixed via two-pass read (2026-07-22)

[`Carousel3D`](../../src/components/ui/Carousel3D.tsx) fed framer-motion's `useReducedMotion()` directly into a render-path value (`geometry.maxBlur`, consumed by every card's blur `useTransform`). Framer-motion resolves `useReducedMotion()` from `matchMedia` **synchronously on the client's first render** (no effect gate — see its own source, `prefersReducedMotion` is a module-level ref lazily initialised the first time the hook runs), while SSR has no `window` and the ref stays `null` — so a real OS-level reduced-motion user's SSR pass rendered non-zero card blur and the client's very first hydration pass already read the true `matchMedia` value and rendered `none`, a genuine SSR/CSR attribute mismatch on every page hosting the carousel (`/`, `/membership`). Fixed the same way [`useDeviceProfile`](../../src/hooks/useDeviceProfile.ts) already handles this class of bug: keep the render-path `reduceMotion` state at its SSR-safe default (`false`) through hydration, and resolve the real preference only inside a `useEffect` — reduced-motion users lose card blur one frame after mount, which is imperceptible and hydration-safe. This traces back to the e2e-side finding in [docs/e2e/gotchas.md](../e2e/gotchas.md) ("`/membership`/`/` hydration mismatch under emulated `reducedMotion`").

## Always-on animations: transform/opacity only, and tier-gate them (2026-07-20, perf Tier-2 Task 1)

Infinite/looping animations on customer surfaces must animate **`transform` and/or `opacity` only** — never `background-position`, `filter`, `box-shadow`, `width/height`, etc. A transform/opacity animation runs on the compositor from a once-rasterized texture; anything else repaints on the main thread every frame (and re-runs any `filter` on the layer), which was the single worst scroll-jank source on low-end devices per the 2026-07 perf audit.

Additionally, every **infinite** animation must be **tier-gated**: `globals.css` has a gate cluster (search `Promo-banner surface tier gates`) that sets `animation: none !important` for `html[data-tier="mobile"]`, `html[data-tier="tablet"]`, and `html[data-save-data="true"]` — matching the older `border-glow-` gate pattern. **`.fire` exception (2026-07-20):** `.fire` is NOT in the mobile/tablet `data-tier` gate — it animates on phones/tablets. It uses the original `background-position` rendering (the Tier-2 transform rewrite was reverted because `mix-blend-mode` made the flame read green against brand-coloured banners — colour fidelity of a brand element won over the micro-opt). Its per-frame repaint is instead mitigated by a **stuck-state** gate: `html[data-tier="mobile"] [data-banner-stuck="true"] .fire::before` disables it while the banner floats on scroll (PromoBanner sets `data-banner-stuck` from `isScrolled`), plus the usual `save-data` + reduced-motion. The other loops (clock/dot/glow/vip) stay fully mobile/tablet-gated. `.fire` is the ONE background-position exception to the "transform/opacity only" rule — don't add others. `prefers-reduced-motion` is covered globally (the 1ms/1-iteration rule). `data-tier` is stamped pre-paint by the inline snippet ([`inline-snippets.ts`](../../src/utils/security/inline-snippets.ts)); `data-save-data` is stamped post-hydration by `DeviceTierProvider` (save-data also demotes `data-tier` to `"mobile"` there).

Rewritten under this rule (all previously always-on repaint stacks):

- **`.fire`** (PromoBanner background): was ONE pseudo-element animating `background-position` across a 3-deep `background-image` stack with `brightness/blur/contrast` re-running per frame. Now three layers — `::before` = static warm gradient; `.fire > .fire-glitter` (child div rendered by PromoBanner, the only `.fire` consumer) = 400×650 glitter tile rising 650px/8s; `::after` = 350×500 tile rising 500px/8s — each animated with transform-only keyframes (`fire-rise-650`/`fire-rise-500`), `mix-blend-mode: overlay` replacing the old `background-blend-mode`, `opacity: 0.7` on `.fire` providing the composite weight AND the stacking context that contains the blending. **Loop contract:** each glitter layer is `calc(100% + <tile-height>)` tall and translates up exactly one tile per iteration — if you change a `background-size` tile height you must change the matching layer height + keyframe distance or the loop visibly snaps. The old `.fire > * { z-index: 1 }` rule was removed (no `.fire` element has content children).
- **`UrgencyClockIcon`** ([src](../../src/components/ui/UrgencyClockIcon.tsx)): was 4 infinite framer-motion tracks + a blurred glow span + a smooth 2s SVG second-hand sweep. Now zero framer: `.ta-clock-pulse` (scale 1→1.08→1, 1.2s) on the wrapper + `.ta-clock-second-hand` (`ta-clock-tick 60s steps(60)` — one style update per second) on the SVG group. Props/API unchanged (`animated={false}` still renders fully static). Do not reintroduce a rAF/framer loop here.
- **Backdrop-blur literals**: `backdrop-blur-xl`/`-lg` bypass the `--ta-blur` device-tier token (mobile 0px / tablet 4px / desktop 12px). Landing-path surfaces must use `backdrop-blur-[var(--ta-blur)]` — swapped in `GiveawayGalleryClient` (filter bar; **that component was deleted 2026-07-22** with the /promotions Spotlight rewrite, which has no blurred surface), `PromoHero` CTA, and `FloatingGetEntriesButton`. If the element's own background is **opaque**, backdrop blur is pure invisible GPU cost — delete it instead (done on `FloatingCountdownBanner`'s opaque gradient pill). Known remaining literal: `src/app/(site)/affiliate/page-client.tsx` (not a landing path, out of that task's scope).

## Marquee gating, tier-gate holes, scroll-frame work (2026-07-20, perf Tier-2 Task 2)

Continuation of the Task-1 rule above — the remaining always-on/per-frame offenders:

- **`--ta-marquee-state` is now actually consumed.** The two CSS marquees — the `/promotions` hero wordmark marquee ([`src/app/promotions/page.tsx`](../../src/app/promotions/page.tsx)) and [`MembershipBrandShowcase`](../../src/components/sections/membership/MembershipBrandShowcase.tsx) — carry `[animation-play-state:var(--ta-marquee-state)]`, so Save-Data / `prefers-reduced-motion` pause them via the token. Class order matters and is verified: Tailwind v3 emits the base arbitrary property **after** the `animate-[…]` shorthand and `hover:[animation-play-state:paused]` after both, so token pause works and hover-pause still wins. Any new CSS marquee must carry this class.
- **Marquees pause offscreen via `content-visibility: auto`** (+ `contain-intrinsic-size:auto <strip-height>` to avoid CLS) on the masked wrapper div — chosen over `useInViewportAnimation` because `/promotions/page.tsx` is a **Server Component** (a JS hook would force a new client boundary) and the strips are fixed-height, so pure CSS gets paint + animation skipping for free; it no-ops gracefully on engines without support.
- **`BrandScroller` skips the embla `AutoScroll` plugin entirely** (`plugins: []` → static, still-draggable strip) when framer's `useReducedMotion()` is true or `navigator.connection?.saveData` is set — no rAF loop at all for those users. The existing `useInViewportAnimation` play/stop wiring stays for everyone else and no-ops when the plugin is absent.
- **Tier-gate holes closed in `globals.css`:** the `border-glow-` kill now includes `html[data-tier="tablet"]`; `.animate-shimmer-horizontal-fast` joined the `.animate-shimmer`/`.animate-shimmer-horizontal` kill (mobile-width + reduced-motion media query); and the Task-1 gate cluster now also kills `[class*="glow-pulse"]` (Tailwind `animate-glow-pulse*` — filter loops) and `[class*="vip-"]` (the `vip-premium-*`/`animate-vip-*` classes + the arbitrary `animate-[vip-sheen_…]` sweep in `MembershipOneTimePacks`) on mobile/tablet/save-data. Note `[class*="vip-"]` is a substring match — don't coin non-animation class names containing `vip-`. **Parking rule:** when you tier-gate an infinite transform animation, give the element a **base transform equal to a rest-state keyframe** — with `animation: none` the keyframes stop applying and the element snaps to its base style (e.g. the `MembershipOneTimePacks` vip-sheen span carries inline `transform: translateX(-180%) skewX(-18deg)` = the `vip-sheen` 0% frame, so the gated/reduced-motion state parks the sheen off-screen instead of leaving the gradient wash over the left half of the card; the running animation overrides the base, so the sweep is unchanged).
- **`FloatingGetEntriesButton` no longer text-scans the DOM per scroll frame.** The old handler ran `querySelectorAll("section")` + `textContent.includes("Unlock Partner Discounts")` + `offsetTop`/`getBoundingClientRect` reads on **every** rAF frame. Now: the target section carries a stable `id="unlock-partner-discounts"` ([`UnlockDiscounts`](../../src/components/sections/promo/UnlockDiscounts.tsx)); hide state comes from an IntersectionObserver whose root region is half-open above the 200px line (huge top `rootMargin`), so `isIntersecting` ⇔ "section reached/passed" and programmatic scroll jumps can't skip it (rebuilt on throttled resize — its bottom margin depends on `innerHeight`); the Winners/How-it-works pulse band uses a second observer with `rootMargin: "-15% 0px -15% 0px"`. All three targets are lazy-mounted (`next/dynamic`), so a 500ms `setInterval` polls `getElementById` until each is found, then stops (MutationObserver-free; `#latest-winners` may legitimately never mount if there's no recent winner — the poll just keeps idling at 2 cheap lookups/sec). The remaining per-frame work is one `scrollY > innerHeight` compare.

## Customer copy in shared sections: free-entry framing (2026-07-08)

Promo/section copy is customer-facing and must follow **CLAUDE.md §11** (game-of-chance trade promotion — entries are never sold, they're a free inclusion; no odds/chance/gambling framing). `PartnerBenefitsPromoSection` showed tiers as "{entries} entries/mo · {price}/giveaway" (reads as pricing entries) → reframed to "{price}/giveaway · includes {entries} free entries/mo" so the price attaches to the membership. When adding any tier/pack/price label, lead with the product (membership/pack) and show entries as **included free**.

## Promotions corners SWAPPED — controls left, Cobber right (2026-08-10)

> **Read this before the two entries below**, which describe the pre-swap layout. On
> `/promotions` the floating controls now live **bottom-LEFT** and the Cobber launcher lives
> **bottom-RIGHT** (the site-wide default — `src/app/promotions/layout.tsx` no longer passes
> `side="left"`). `/promotions` was the only page where chat sat on the wrong side, and that was
> never a design choice: it was a workaround for the right corner being occupied.

The member control is now a **hamburger that morphs into a vertical column of discs**
([`PromotionsAccountButton`](../../src/components/sections/promo/PromotionsAccountButton.tsx)),
replacing the sun-toggle + account-FAB stack and its side-flyout link menu. Guests still get
the lone [`PromotionsGuestThemeToggle`](../../src/components/ui/ThemeToggle.tsx), now also
bottom-left — the two audiences are mutually exclusive so they never stack.

**Why a column and not the arc fan it was designed as.** Three 44px discs need ~96° of sweep at
a tight radius, but only ~50° is usable: past vertical is the screen edge, and reaching
horizontal collides with the centred floating "Enter Now" pill (x 132–257, y 16–58 at 390px).
Forcing three discs into 50° needs a ~115px radius — *further* out, the opposite of the goal.
A column keeps every disc in a 44px lane on the far left, clear of that pill at any height.
**Don't "improve" this back into an arc.**

**The morph is one-to-one:** the three hamburger bars *are* the three discs (`scaleX .44 /
scaleY .075` closed → full circle open), bottom bar → bottom disc so the order never shuffles.
Two bugs to not re-introduce, both of which made the closed button render as an empty circle:

1. **Paint order.** The trigger renders after the items in DOM order, so the items need an
   explicit `zIndex: 2` against the trigger's `1` or the trigger covers the bars.
2. **Bar colour.** The disc's open fill is dark glass; left unchanged while collapsed it's a
   dark bar on a dark trigger. The fill animates to the promo accent when closed.

Items are `pointer-events: none` while closed so the bars can sit on the trigger's face without
eating its click. Order bottom-to-top is My Account → Mini Draws → theme toggle (most-tapped
nearest the thumb); reorder the `MENU_ITEMS` array to change it. Interaction-driven, so it takes
the `prefers-reduced-motion` gate (snaps instead of travelling) but not a device-tier gate.

**"Homepage" was dropped** from the menu: a fourth bar stops the closed glyph reading as a
hamburger, and the one-to-one morph is the whole idea. Add it back only if you accept four bars.

## Promotions right-corner FABs dodge the "Enter Now" bar (2026-07-08)

On `/promotions`, the bottom-right floating controls now lift above the full-width floating **Enter Now** bar ([`FloatingGetEntriesButton`](../../src/components/sections/promo/FloatingGetEntriesButton.tsx)) when it scrolls in, and settle back when it's gone — the same collision-dodge the Cobber launcher uses, via `useDodgeFloatingObstacles("right", enabled, cornerPx)` ([hook](../../src/components/support-chat/useDodgeFloatingObstacles.ts)) applied as an inline `bottom` with a `transition-[bottom]`. It's wired in **two** places because the two audiences are mutually exclusive: **guests** → [`PromotionsGuestThemeToggle`](../../src/components/ui/ThemeToggle.tsx) (sun only); **authenticated** → [`PromotionsAccountButton`](../../src/components/sections/promo/PromotionsAccountButton.tsx) (one stack = sun toggle **+** account button). Both dock at the shared `bottom-5 right-5` (see the next entry). The Enter Now bar carries `data-floating-widget`, so it's the obstacle; the hook only lifts for obstacles that reach the right corner (full-width bars), not narrow centered ones. The dodge hook is generic geometry (not chat-specific) despite living under `support-chat/` — reused as-is rather than relocated.

## `.promo-dock-supersedes` — how the promo bottom dock stands the corner controls down (2026-08-13)

A promo **prize** page (`/promotions/[slug]` and the toolset landings) now mounts
[`PromoBottomDock`](../../src/components/sections/promo/PromoBottomDock.tsx) — one bar that owns the
whole bottom band: menu, Cobber and the entry CTA. The three separately-docked controls documented
in the entries above must not also render there, or the page gets two of everything.

The mechanism is **CSS keyed on an attribute**, not props:

1. `PromoBottomDock` stamps `data-promo-dock` on `<html>` while mounted (removed on unmount, so a
   client transition to `/promotions` — the Spotlight gallery, which mounts no dock — restores the
   controls).
2. `globals.css` hides `html[data-promo-dock] .promo-dock-supersedes` at every viewport and
   reserves the bar's height via `body { padding-bottom }` (taller from `lg`).
3. Four elements carry the class: [`FloatingGetEntriesButton`](../../src/components/sections/promo/FloatingGetEntriesButton.tsx),
   [`PromotionsAccountButton`](../../src/components/sections/promo/PromotionsAccountButton.tsx),
   [`PromotionsGuestThemeToggle`](../../src/components/ui/ThemeToggle.tsx) and
   [`ChatBubbleButton`](../../src/components/support-chat/ChatBubbleButton.tsx).

**Why not props.** Two of those four are mounted by the promotions **layout**
(`PromotionsGuestThemeToggle` via `PromotionsLayoutShell`, `ChatBubbleButton` via
`SupportChatWidgetMount`), not by the page — a page-level prop can never reach them, and threading
one through the layout would apply it to `/promotions` too, which has no dock.

A `display:none` element has a zero rect, so the dodge hook above correctly ignores the hidden
floaters — no extra wiring needed.

_(The rule was originally gated to `max-width: 1023.98px`, matching an `lg:hidden` on the dock.
The gate came off on 2026-08-13 when the dock was extended to desktop; if the dock is ever
scoped back to one breakpoint, the CSS gate has to come back WITH it — a mismatch gives a
viewport band either two docks or none.)_

## Floating dock: every corner-docked control shares one baseline (2026-08-10)

The three floating controls on `/promotions` — the Cobber launcher (bottom-**left**), and in the bottom-**right** corner the theme toggle + account FAB — were each positioned by their own hard-coded offsets and visibly failed to line up. Four independent mismatches:

| | was | now |
|---|---|---|
| [`ChatBubbleButton`](../../src/components/support-chat/ChatBubbleButton.tsx) | `bottom-5`, `left-5`/`right-5`, 56px | unchanged |
| [`PromotionsAccountButton`](../../src/components/sections/promo/PromotionsAccountButton.tsx) | `bottom-16 sm:bottom-4`, `right-4`, 48px | `bottom-5 right-5`, 48px |
| [`PromotionsGuestThemeToggle`](../../src/components/ui/ThemeToggle.tsx) | `bottom-4 right-4`, 48px | `bottom-5 right-5`, 48px |

Root cause of the big one: `bottom-16 sm:bottom-4` was a hand-rolled mobile lift added 2026-04-08 (`6b005ffe`) to clear the Enter Now bar. When the dodge hook was wired into the same component three months later (2026-07-08, `29d04640`) the manual lift was never removed, so mobile double-lifted — the account FAB sat **44px** above Cobber's baseline.

**The rule now:** every corner-docked floating control docks at `bottom-5` + `{left,right}-5`, exported as `FLOATING_DOCK_BOTTOM_PX` / `FLOATING_DOCK_SIDE_PX` from the dodge hook. **Never hand-roll a different bottom offset to clear an obstacle** — that is exactly what `useDodgeFloatingObstacles` is for, and a manual offset stacks on top of it.

Discs may differ in size (Cobber is 56px, the promo FABs 48px — a deliberate hierarchy call: Cobber is the primary affordance). They align on **bottom edges**, not centres, so different diameters still read as sitting on one floor.

The hook now takes a third `cornerPx` arg (default 56). Previously it hard-coded the launcher's 56/20/20 for *all* callers, so the AABB overlap test ran against a rect the right-corner FABs didn't occupy. Pass the height of the **bottom-most** disc of a stack — bottom-anchored obstacles can't reach a higher one without also hitting it.

Verified on a 390×844 viewport, `/promotions/milwaukee`: guest and authenticated both measure Cobber `bottom 20 / left 20` and the right FAB `bottom 20 / right 20` (against `documentElement.clientWidth` — `window.innerWidth` includes the desktop scrollbar and reads 10px wider). Scrolling the Enter Now bar in lifts **both** corners to the identical inset, so they stay bottom-aligned through the slide.

## `(site)/layout.tsx` is a Server Component — `ssr:false` dynamic imports must live in a Client wrapper (2026-06-25)

`src/app/(site)/layout.tsx` is the site shell (Server Component): Header/Footer/Newsletter/Modals + the support chat widget (**Cobber**). The widget is mounted via `src/components/support-chat/SupportChatWidgetMount.tsx` — a `"use client"` wrapper that does `next/dynamic(() => import(...), { ssr: false })`. Do **NOT** call `next/dynamic({ ssr:false })` directly in this layout (or any `layout.tsx`/`page.tsx` without `"use client"`): Next.js App Router forbids `ssr:false` in a Server Component and **`next build` fails** (on Vercel and locally) even though `tsc`/`type-check` **passes**. This matches the repo-wide pattern — every other `ssr:false` lives inside a `"use client"` component. **Run a full `npm run build` (not just `type-check`)** after any change to a server `layout.tsx`/`page.tsx`, a `dynamic({ssr:false})`, or the client/server boundary. Full incident write-up: [`docs/ai-chatbot/gotchas.md`](../ai-chatbot/gotchas.md) §1.
## MembershipModal package-picker auto-reopen loop (2026-07-07)

The "Select your package" picker inside `MembershipModal` ([`src/components/modals/MembershipModal/index.tsx`](../../src/components/modals/MembershipModal/index.tsx)) auto-reopened after every select/exit on `/promotions/[slug]` (never the homepage), trapping users before payment and dropping new-member conversions to near-zero — a **silent** outage (no server error, only auto-renewals still landing). Cause: a re-arm block cleared the once-per-session auto-open latch after any real plan was selected, and the `/promotions` auto-open branch was **not gated on `isPlaceholderPlan`** (its config sibling was), so the cleared latch immediately reopened the picker. Fix: removed the re-arm (latch resets only on `!isOpen`) **and** gated the `/promotions` branch on `isPlaceholderPlan`. **Invariant:** the picker auto-opens at most once per modal-open session and only while on the placeholder; never re-arm the latch on an in-session condition, and keep every auto-open branch gated on `isPlaceholderPlan`. Full write-up: [docs/subscription/package-selection-first.md](../subscription/package-selection-first.md).

## Selected Package card: first row is partner-discount access, NOT `features[0]` (2026-06-22)

`PlanSummaryCard` ("Selected Package" summary) renders two benefit rows. The first row must show the **partner-discount access %**; the second shows the entries. It previously rendered `promoEnhancedPlan.features[0].text` as row 1 — but `features[0]` is the **entries** line for these packages (and the promo enhancement in `useMajorDrawEntryCta.ts` rewrites it to `"N Free Entries (KX PROMO!)"`), so the card showed **entries twice** and never showed the partner line. Fix: row 1 now derives the partner line from `getPartnerDiscountBenefitTextForPackageId(selectedCatalogId)` (null = package grants no partner access → fall back to `features[0]`/subtitle) with the subscription-aware percent from `getPartnerCatalogAccessPercentForMembershipPackageId` (so a subscription Tradie reads 50%, not the one-time 40%). Don't reintroduce `features[0]` as the first row here.

## Auto-login in MembershipModal / LoginModal needs proof (2026-06-19)

Both modals establish a NextAuth session via `signIn("auto-login", { token })`. Following the auto-login account-takeover fix:

- **MembershipModal** (3 post-payment call sites) now sends `paymentIntentId` in the `/api/auth/auto-login` body — the endpoint verifies that PaymentIntent belongs to the user's Stripe customer before issuing a token. If you add a new auto-login call site, you **must** pass a real `paymentIntentId` or it returns 403.
- **Subscription PI fallback (the "paid but not redirected" fix, 2026-06-19):** `confirm-subscription-payment`'s auto-login response omits `paymentIntentId`, so the subscription call site's `effectivePaymentIntentId` can be empty if the PI-id state wasn't captured. The auto-login body therefore falls back to the **invoice PaymentIntent derived from `paymentIntentClientSecret`** (`split("_secret_")[0]`) when the id is otherwise missing. It only engages when the id is empty (the failing case), so it never changes a flow that already works. Without it, the user gets "Account Created!" but is not logged in or redirected.
- **LoginModal** (email-verification path) no longer calls `/api/auth/auto-login`. `/api/auth/verify-email` now returns a `token` (minted off the just-verified code, when the user has membership) and the modal signs in with `data.token` directly. The `else` branches (no token) fall back to the password prompt — keep that behaviour.

**Known gap (pre-existing):** a **new** user buying a **one-time** package is created asynchronously by a Stripe webhook, so `create-one-time-purchase` returns no `user`/`autoLogin` → that flow never attempts auto-login (the buyer isn't auto-redirected). Not addressed by the above.

See [docs/auth/jwt-auth-remediation-spec.md](../auth/jwt-auth-remediation-spec.md) (A0).

## MembershipModal: Klaviyo `Started Checkout` fires from THREE paths (split by who is firing it)

The canonical Klaviyo `Started Checkout` event covers every realistic checkout-entry path with three mutually-exclusive callsites. Revised 2026-05-28 Phase-7 — the original Phase-4 design fired authed users from `MembershipModal:handleSubmit`, but the right semantic for authed users is at **intent capture** (the "Enter Now" click) so abandoners are captured even if they never reach the payment form.

| User | Where it fires | Why there |
|---|---|---|
| **AUTHED user clicks "Enter Now" on a package card** | [`MembershipSection.handlePlanSelect`](../../src/components/sections/MembershipSection.tsx) at the `membershipModal.openModal(plan)` callsite | Intent is the click. The user has selected a package and signalled "I want to buy this." Fires BEFORE the modal even renders the card form, so abandoners who close the modal mid-flow are captured. `package_id` is the canonical API ID (via `getPackageId`); `is_authenticated: true`. |
| **GUEST first-open** (`step="registered"`) | `fireKlaviyoStartedCheckoutForGuestRegistration` in [`/api/auth/register`](../../src/app/api/auth/register/route.ts) — called from all 4 register branches (new-user + 3 plain-account updates) | Guest just submitted step-1 with a `packageId` — Klaviyo profile is being created in the same request, so server-side fire with explicit `customer_properties.email` attaches reliably. |
| **GUEST second-open fallback** (`step="viewed"`) | [`MembershipModal.handleSubmit`](../../src/components/modals/MembershipModal/index.tsx) with `if (!isAuthenticated)` gate, alongside existing Facebook `trackInitiateCheckout` | Edge case: `guestUserData` persisted across modal close/reopen so the modal jumped straight to step-2 — `handleRegistration` never ran → server fire never had a chance. The `initiateCheckoutFiredRef` guard ensures one fire per modal lifecycle even when paired with handleRegistration. |

**Why authed users don't fire from `handleSubmit` (Phase-7 change)**: dedupe with the `handlePlanSelect` fire. If both fired, every authed checkout would log two `Started Checkout` events per session. The `if (!isAuthenticated)` gate prevents that.

**`is_authenticated` is always passed explicitly, NEVER derived from `step`** — see [docs/auth/gotchas.md](../auth/gotchas.md) "Registration ≠ authenticated session". A guest can fire with `step="viewed"` + `is_authenticated: false` (when they reach payment-submit without ever logging in).

**Modal opens that DO NOT come through `MembershipSection.handlePlanSelect`** — there are other entry points (e.g. `useMembershipModal.openModalWithPackageSelectionFirst()`, RewardsFloatingWidget, my-account direct opens) that don't preselect a plan. For now `Started Checkout` doesn't fire for these — the user has no specific package context yet. If/when those paths need event coverage, fire at the moment the user selects a plan within the modal (not on modal-open).

See [docs/tracking/KLAVIYO_INTEGRATION.md](../tracking/KLAVIYO_INTEGRATION.md) "Recently added canonical events" + spec `docs/superpowers/specs/2026-05-27-klaviyo-events-expansion-design.md` §5.

### `additional-*` pack access-check failure shows an actionable toast, not a dead-end error (Phase 8 Option B, 2026-05-29)

When a non-member (or guest) tries to purchase an `additional-*` pack (e.g. via the Klaviyo abandoned-checkout email opened in a different browser), the modal previously surfaced a generic "Payment Error" toast at payment-submit time — **after** the user had already completed registration and entered card details. The error came from an `Error` throw in `MembershipModal:handleSubmit` ([see L2814 area](../../src/components/modals/MembershipModal/index.tsx#L2814)).

The throw is replaced with an actionable toast that surfaces the user's actual next step:

- **Guest path** (`!isAuthenticated`): toast title "Log in to continue", action button "Log in" routes to `/login`. Pre-existing accounts can sign in and try again from the email link.
- **Logged-in without access**: toast title "Membership required", action button "View memberships" routes to `/membership` so they can subscribe to a tier first.

Both branches close the modal and clear the in-progress purchase state so the toast isn't blocked by the loading overlay.

**Known limitation**: `/login` does NOT currently accept a `callbackUrl` / `returnTo` — it always lands at `/my-account` after success. So a user post-login has to re-click their original Klaviyo email link to re-enter the funnel. A future enhancement (Phase 8 Option A) would pre-check access in `useMembershipModalDeepLink` BEFORE opening the modal, so the user never wastes effort on registration + card entry when the access requirement can't be satisfied. That fix needs UX for two new prompts and is scoped separately.

The error-throw path is still intact for genuinely unexpected purchase errors (network failures, Stripe declines, etc.) — only the specific "additional-* without member access" case is intercepted and replaced with the actionable toast.

### Klaviyo abandoned-checkout deep-link auto-opens MembershipModal (Phase 8, 2026-05-29)

The abandoned-checkout email CTA built by `buildCheckoutResumeUrl` lands the user on either `/membership` or `/promotions/<slug>` with `?openMembership=1&packageId=<canonical-id>` in the query string. The new [`useMembershipModalDeepLink`](../../src/hooks/useMembershipModalDeepLink.ts) hook is wired into `MembershipSection` — on mount it reads those params **from `window.location.search`** (never `useSearchParams()` — see the CLS entry at the top of this file), resolves the canonical `packageId` via `useMemberships()`, fires the host's `onOpen(plan)` callback (which wraps in the major-draw purchase gate), then **cleans the URL params** so a page refresh doesn't loop back into the modal.

`MembershipSection` is mounted on both landing destinations (directly on `/promotions/<slug>` and indirectly via `MembershipPageClient → MembershipSection` on `/membership`), so a single hook integration covers both URLs. The deep-link does NOT re-fire `Started Checkout` — the original "Enter Now" click already fired it; this is funnel resumption, not a new entry.

If the `packageId` from the URL no longer resolves to a known package (e.g. the link is from a stale email referencing a discontinued tier), the hook silently no-ops after cleaning the URL — no error, no surfaced toast. In `NODE_ENV=development` a `console.warn` surfaces for debugging.

## Rendering a `dynamic()` component while closed still downloads its chunk (2026-07)

`next/dynamic(() => import(...), { ssr: false })` only defers **when** the chunk loads relative to SSR — it does NOT defer loading until the component is actually shown. A `<DynamicModal isOpen={false} .../>` mount still triggers the `import()` and downloads/evaluates the chunk on render, even though nothing is visible. This shipped Stripe.js + the entire ~7k-line `MembershipModal` payment chunk to every guest who merely landed on a page containing a `<MembershipModal>` mount point (homepage, `/membership`, draw pages, dashboard) — the 2026-07 perf audit finding.

**Fix pattern:** gate the render itself, not just the import — see [`LazyMembershipModal`](../../src/components/modals/MembershipModal/LazyMembershipModal.tsx): a small wrapper that renders `null` until the first `isOpen === true`, then mounts the real `dynamic()` component and keeps it mounted for the rest of the session (so close/reopen animation and internal state behave like an always-mounted modal). Any heavy modal that's conditionally rendered from a page-level mount point (not user-triggered open) should use this pattern, not a bare `dynamic()` call. See [payment/frontend.md](../payment/frontend.md) for the full write-up and [payment/gotchas.md](../payment/gotchas.md) for the companion "Stripe boots on import" fix.

**Second confirmed instance (2026-07-21): `ReferFriendModal`.** `page-client.tsx` already wrapped it in a bare `dynamic()` call, but rendered it unconditionally with `isOpen={false}` on every `/my-account` load — downloading its chunk AND running `useReferralProfile(userId)` (the hook sits above `Shell`'s `if (!isOpen) return null`, so it always fires) on mount, hitting `/api/referrals/code` for every member who never opened the modal. Fixed with [`LazyReferFriendModal`](../../src/components/modals/ReferFriendModal/LazyReferFriendModal.tsx), the same first-open latch. See [dashboard-account/gotchas.md](../dashboard-account/gotchas.md) for the companion `ManageSheet` fix (same bug shape, a query instead of a chunk).

## Viewport-correct `priority`/preload — a CSS-hidden `<img>` (even `loading="eager"`, not just `priority`) still downloads (2026-07-19, corrected 2026-07-19)

A common pattern in this codebase used to be two separate `<Image>` elements for the same hero slot — one in an `lg:hidden` container, one in a `hidden lg:block` container. Marking **both** `priority`, or even swapping both to plain `loading="eager"`, still downloads BOTH images on every device: a CSS-hidden element (`display:none`) does **not** defer an `<img>`'s network fetch regardless of its `loading`/`priority` attribute — hiding a *second, fully-mounted* `<img>` element is never sufficient, no matter what loading mode it uses. (Original version of this entry recommended `loading="eager"` on both as a fix — that was wrong; corrected below. `<video preload="auto">` has the identical problem — see [promo/gotchas.md](../promo/gotchas.md) "CSS-hidden `<video preload>`".)

**The actual fix is structural, not attribute-level: render ONE `<picture>` element with viewport-scoped `<source media=...>`s and a single fallback `<img>`, not two separate `<Image>`s toggled by CSS.** The browser's native `<picture>`/`<source>` matching means only the `<source>` whose `media` query matches ever gets fetched — there is no second element in the DOM competing for bandwidth. Reference implementation: `src/components/sections/Hero.tsx`'s background (also `src/app/promotions/page.tsx`'s featured-card hero):

```tsx
const mobileBg = getImageProps({ src: "...", alt: "...", fill: true, sizes: "100vw", loading: "eager" }).props;
const desktopBg = getImageProps({ src: "...", alt: "...", fill: true, sizes: "100vw", loading: "eager" }).props;
// ...
<picture>
  <source media="(min-width: 1024px)" srcSet={desktopBg.srcSet} sizes="100vw" />
  <source media="(max-width: 1023px)" srcSet={mobileBg.srcSet} sizes="100vw" />
  <img {...mobileBg} alt="..." className="object-cover" />
</picture>
```

If the two viewport variants also need different container geometry (e.g. a different `aspect-[...]` per viewport, not just a different image source — see the `/promotions` featured card), put the RESPONSIVE variant on the SAME wrapper div via Tailwind breakpoint classes (`aspect-[1080/1164] lg:aspect-[2560/1044]`) rather than two conditionally-hidden divs — one div, one `<picture>`, one `<img>` in the DOM at a time.

- Still add your OWN single, **media-scoped** preload `<link>` pair via the SAME `getImageProps` result (`<link rel="preload" as="image" media="(max-width: 1023px)" imageSrcSet={mobileProps.srcSet} imageSizes="100vw" />` + the `(min-width: 1024px)` desktop twin) so the browser starts the request before it even parses the `<picture>`. Raw-path `href` preloads don't work here — see [promo/gotchas.md](../promo/gotchas.md) "Raw-path image preloads never match `/_next/image` URLs."
- **Components rendered at multiple call sites** (e.g. `PrizeShowcase`'s combo hero `priority`): if one call site already sits below another `priority` hero on the same page, add an opt-out prop rather than hardcoding `priority` — two competing `priority` images on one page fight for the browser's preload attention, and the lower one never needed it anyway. `PrizeShowcase` does this with **`priorityHero?: boolean`** (default `true`; renamed from `priorityFirstSlide` on 2026-07-21 when the gallery became a single combo hero), and the homepage passes `priorityHero={false}` because `Hero` + `MembershipSection` already sit above it. Always check the actual markup per call site — a component may render a mobile/desktop `<Image>` pair.
- **When only ONE of the two variants needs `priority`-style urgency and the other is a non-visual fallback** (e.g. `PromoHero`'s still-image fallback, which is itself gated behind `showVideo`/`viewport` JS state rather than pure CSS `hidden`), `loading="eager"` on the still (not `priority`) is correct — the JS gate, not CSS, is what prevents the *other* viewport's branch from mounting at all.

## Z-index conflicts

Modals, banners, tooltips, dropdowns — many things stack. If something disappears behind another, check `z-index.ts` and the constant in use.

## Inline-rendered modals trapped inside a `sticky`/`transform` ancestor

A modal that renders **inline** (no `createPortal`) inherits whatever stacking context its mount point lives in. If the mount point is descended from anything that creates a stacking context — `position: sticky`, `position: fixed`, `transform`, `filter`, `opacity < 1`, `will-change`, `isolation: isolate` — the modal's `z-index` is *trapped local to that context*. A sibling element in a different ancestor at a lower numeric `z-index` (e.g. `z-20`) can paint on top of it because the modal's "effective" page-level layer is whatever the trapping ancestor was assigned (often auto/0).

Concrete prior hit: on the mini-draws prize-details page, `LoginPromptModal` rendered inside the `lg:sticky lg:top-28` right column. `MiniDrawImageGallery`'s carousel chevrons (`z-20`) in the sibling left column painted over the modal's `zIndex: 90`. Fix was to portal the modal's Shell to `document.body` and use `Z_INDEX.MODAL_BASE` — same pattern `ModalContainer` already follows. See [Shell.tsx](../../src/components/modals/LoginPromptModal/Shell.tsx).

Rule of thumb: **any full-screen overlay modal must portal to `document.body`** (and use `Z_INDEX.MODAL_BASE` from `constants/z-index.ts`). Bumping the numeric z-index does **not** fix this — only escaping the trapping ancestor does. The Shell-pattern modal suite (Upgrade/Downgrade/Refer/PastDraws/StripePayment/ExistingAccount/PackageDetail/SubscriptionExplainer) historically used `zIndex: 90` without a portal — fine until rendered under a sticky/transform parent; if a similar bug appears for any of these, the fix is the same.

## Modal stacking

Multiple modals open simultaneously is a UX hazard. The modal primitive in `components/modals/` should handle this — the modal-priority store ([client-state](../client-state/)) coordinates.

## SSR + theme flash

Theme bootstrap (in [theme](../theme/)) runs pre-React. If a shared-ui component references `theme` via context before bootstrap completes, you can see a flash. **Light is the hard default** — the bootstrap only applies `dark` for a genuinely user-chosen dark, so a component that defaults to light renders correctly first.

## Theme toggle buttons are tap-only

`ThemeToggle.tsx` (`ThemeToggleButton`) and `HeaderThemeToggle.tsx` switch light/dark on a plain tap and persist the choice. The old hold-to-restore time-based (Sydney) auto mode was removed — there is no time-of-day / system-preference auto theme anymore (see [theme/rules.md](../theme/rules.md)). Don't reintroduce the `onPointer*`/hold handlers on these buttons.

## Dark mode coverage gaps

When adding a new component, write the `dark:` variants alongside. It's hard to retrofit later.

## Package color cards: `bgGradient` is a CSS string, not a Tailwind class

`PackageColorScheme.bgGradient` (from [packageColorScheme.ts](../../src/utils/package-colors/packageColorScheme.ts)) is a **CSS `linear-gradient(...)` string**, not a Tailwind class. Apply it via `style={{ background: scheme.bgGradient }}` — putting it in `className` silently does nothing (the browser drops the invalid class), leaving the card with no background. This bit `ResubscribeTierCard` (the SubscriptionManagementModal resubscribe picker): the gradient was passed to `className`, so cards rendered white while the text was white → invisible. Also drive text contrast off the scheme (`scheme.text` / `scheme.textMuted`; `scheme.text === "text-black"` marks a light-background tier like ryobi/dewalt/mint that needs dark text) rather than a fixed `theme` flag.

## ElectricPackageCard / PackagesGrid price layout

`ElectricPackageCard` stacks the struck regular price above the discounted price in a vertical flex column so the `w-fit` panel contains both values without overflow; the swing tag is positioned at `-top-6 -left-2`. The `BestValueBadge` and `CornerRibbonBadge` are rendered `size="small"` with `scale-[0.5] origin-top-left` so the sash stays in the top-left corner without crossing the centred title. In `PackagesGrid` the struck original entries and struck regular price are `absolute` (offset `-top-3`) so they add no height to the row in the non-promo case.

## Image lazy-load gotchas

Lazy-loaded images need width/height to prevent layout shift. The image helper in `utils/images/` enforces this via prop validation. Don't bypass.

## PaymentMethodsTab — two different "defaults" (2026-05-19)

The wallet has **two unrelated notions of default** and conflating them double-stars cards:

1. **Wallet default** — `pm.isDefault`, a flag persisted on `user.savedPaymentMethods[].isDefault` in Mongo. Set when a card is added with `setAsDefault` or via "Set default". It does **not** stay in sync with Stripe.
2. **Subscription billing card** — `subscriptionDefaultPaymentMethodId`, fetched live from Stripe in [api/stripe/payment-methods/route.ts](../../src/app/api/stripe/payment-methods/route.ts) via `getStripeSubscriptionDefaultPaymentMethodId`. This is the card the subscription **actually charges**.

These legitimately diverge. The **legacy** view ([index.tsx](../../src/components/modals/PaymentMethodsTab/index.tsx) + [SavedMethodRow.tsx](../../src/components/modals/PaymentMethodsTab/SavedMethodRow.tsx)) shows them as **two separate badges**. The settings-redesign view ([SettingsRedesignPayment.tsx](../../src/components/modals/PaymentMethodsTab/SettingsRedesignPayment.tsx)) collapses them into one "DEFAULT" star.

**Bug that was fixed:** the redesign computed `isDefault = pm.isDefault || pm.paymentMethodId === subscriptionDefaultPaymentMethodId`. When the wallet default ≠ the subscription card, **both** rendered the star + red ring — contradicting the panel copy *"The card with the star is charged for your subscription"* (singular).

**Current (single-star) rule** — keep it: with an active subscription **and** a known Stripe subscription default, star **only** that card; otherwise fall back to `pm.isDefault`. This guarantees exactly one star and that it reflects the truthfully-charged card. Do **not** reintroduce the `||`.

## PaymentMethodsTab — a FAILED renewals move must not be a green toast (2026-08)

Because those two defaults are separate, "Set default" is **two writes**: `setDefaultPaymentMethod` (the wallet flag), then — only when `hasActiveSubscription` — `updateSubscriptionPaymentMethod.mutateAsync` (the card Stripe actually charges). The second can reject on its own, and its `catch` used to fire `type: "success"` titled **"Default payment method updated"**, with the failure buried mid-message ("However, failed to update subscription payment method"). A member moving off a dying card therefore got an explicit green confirmation that renewals had moved when they had not — a silent failed-renewal set up weeks in advance, with the one UI signal that could have prevented it saying the opposite.

The subscription half now lives in its own `moveSubscriptionBillingCard(paymentMethodId)` in [index.tsx](../../src/components/modals/PaymentMethodsTab/index.tsx). Its failure branch toasts `type: "error"` — "Renewals are still on your old card" — with `duration: 0` (no auto-dismiss; the retry is the only way to finish what the member started) and a **Retry** action that recurses into the same function. Retrying *only* the subscription half matters: the wallet write already succeeded, so re-running `handleSetDefault` would redo it.

**Rule:** when one user action is two independent writes, the toast type must follow the outcome of the thing the member was actually trying to change. A `type: "success"` whose body contains "however … failed" reads as success — on a money path that is worse than no toast at all, because it stops the retry.

## Stripe PaymentElement must be `ready` before `elements.submit()` / `confirmPayment()`

Stripe throws "We could not retrieve data from the specified Element…" if you call `elements.submit()`/`confirmPayment()` before the `<PaymentElement>` has emitted its `ready` event, and `confirmStripeIntent` returns "Stripe not loaded" if `useStripe()`/`useElements()` haven't resolved. The Purchase button must be gated on readiness, not just on a client secret. [`CardFormSection`](../../src/components/modals/PaymentMethodSelector/CardFormSection.tsx) tracks `ready` via `<PaymentElement onReady>` + a ref, short-circuits `confirmStripeIntent` through the pure guard in [`paymentReadiness.ts`](../../src/components/modals/PaymentMethodSelector/paymentReadiness.ts), and emits an `onElementReady` callback that threads up through PaymentMethodSelector → PaymentStep → [MembershipModal](../../src/components/modals/MembershipModal/index.tsx) `isFormValid()` to disable the button until ready. When wiring a new payment surface, thread `onElementReady` to **every** `<PaymentMethodSelector>`/`<CardFormSection>` mount (the guest mount was missed once, which would permanently disable guest checkout). This was a production conversion bug on `/promotions/*`.

## LoginModal: don't invalidate/identify off the closure `session` after `signIn()`

After `signIn(..., { redirect: false })`, the `session` from the component's `useSession()` closure is still the pre-login value (`null` for a guest). Reading `session?.user?.id` there silently skips cache invalidation and Klaviyo `identify()`. Always `await getSession()` for the fresh id. All [LoginModal](../../src/components/modals/LoginModal/index.tsx) flows use the canonical [`usePurchaseInvalidation`](../../src/hooks/usePurchaseInvalidation.ts) keyed off the fresh session. See [auth/gotchas.md](../auth/gotchas.md).

## Klaviyo identify and event keys are snake_case

Client-side Klaviyo calls — [LoginModal](../../src/components/modals/LoginModal/index.tsx) `identify(...)`, [ProductCard](../../src/components/ui/ProductCard.tsx) `trackKlaviyoAddToCart`, [RedeemablesWallet](../../src/components/features/RedeemablesWallet.tsx) `track("Monthly Redeemable Redeemed", ...)` — pass **snake_case** keys (`first_name`, `last_name`, `user_id`, `product_id`, `num_items`, `entries_granted`, …). The values often come from camelCase TypeScript objects (e.g. `session.user.firstName`); only the Klaviyo-facing **key** must be snake_case. The `KlaviyoIdentifyParams` / `KlaviyoEventParams` interfaces in [src/hooks/useKlaviyoTracking.ts](../../src/hooks/useKlaviyoTracking.ts) enforce this. Mixing camelCase creates duplicate shadow properties on Klaviyo profiles and silently breaks flow filters / segment conditions. See [docs/tracking/KLAVIYO_INTEGRATION.md](../tracking/KLAVIYO_INTEGRATION.md) for the full contract.

## CardFormSection AddPaymentInfo: dual Pixel+CAPI with billing-derived PII

[`CardFormSection`](../../src/components/modals/PaymentMethodSelector/CardFormSection.tsx) fires `AddPaymentInfo` via `usePixelTracking().trackAddPaymentInfo` (dual Pixel+CAPI, shared event_id) with `billingDetails`-derived PII — not the old browser-only `trackConversion`. It no longer fires the Snapchat browser pixel for AddPaymentInfo (consistent with other funnel events; Snap is reached server-side via the mirror).

## MembershipModal InitiateCheckout: guest PII for CAPI identity matching

`MembershipModal` passes guest `formData` PII (email/first/last/phone, country AU) to `trackInitiateCheckout` so guest InitiateCheckout CAPI events carry identity; the checkout fire site sends it only when `!isAuthenticated` (logged-in users rely on session enrichment).

## MembershipModal pre-warm toast removed — single actionable toast only

The MembershipModal auto-creates a subscription on open (background pre-warm) so checkout is faster on purchase click. Previously, if a stale `EXISTING_SUBSCRIPTION` (409) was returned during this pre-warm, it would immediately surface an `EXISTING_SUBSCRIPTION` error toast — followed by a second "Active Subscription Found" toast if the user then clicked Purchase. This produced two toasts for a single user action. The pre-warm path now only logs the 409 response and does not show a toast; the single actionable "Active Subscription Found" toast on the purchase-click path is the only one displayed. Its **"Manage Subscription"** action deep-links to **`/my-account?open=subscription`**, which opens the **Manage-membership bottom sheet** on arrival (handled in `my-account/page.tsx`) — not just the dashboard home.

## Confirm-time card declines surface the real reason in three modals (2026-07-16)

Server routes now return `400 { error: "Payment failed", details, code, decline_code }` for confirm-time card declines (previously generic 500s), and three modals read that shape so the user sees the actual decline reason (e.g. "This card is linked to a closed or invalid account. Use a different card, or contact your bank.") instead of a generic message:

- **MembershipModal** ([index.tsx](../../src/components/modals/MembershipModal/index.tsx)) — the checkout `catch`'s error extraction understands the `ApiError` shape from [`src/lib/queries.ts`](../../src/lib/queries.ts), which carries the response body on **`.data`** (NOT `.response.data`): a dedicated branch reads `errorMessage` from `data.details` / `data.error` / `data.message` and picks up `data.code` + `data.decline_code`; the inline `extractStripeErrorCode` / `extractStripeDeclineCode` helpers also probe `.data`. Previously `ApiError` decline details ("Invalid account.") were silently dropped and the user got a generic message. The user-facing toast still comes from `formatPaymentError` ([payment domain](../payment/)), which returns decline-specific concise guidance.
- **SpecialPackagesModal** ([index.tsx](../../src/components/modals/SpecialPackagesModal/index.tsx)) — the purchase `catch` now toasts via `formatPaymentError(error)` (central payment-error copy: decline-specific title/message when the API 400 carries `code`/`decline_code`) instead of raw `error.message`.
- **SubscriptionManagementModal** ([index.tsx](../../src/components/modals/SubscriptionManagementModal/index.tsx)) — the renew/reactivate `catch` checks `extractPaymentErrorCodes` + `getCardDeclineGuidance` and shows the concise decline guidance (title + message) when the failure was a card decline; the payment-method-invalid and generic messages are unchanged.

**Rule:** when handling a purchase/renew failure in a modal, don't read only `.response.data` or raw `error.message` — `ApiError` from `src/lib/queries.ts` carries the body on `.data`. Prefer the central payment-domain helpers (`formatPaymentError`, or `extractPaymentErrorCodes` + `getCardDeclineGuidance`, in `src/utils/payment/stripe/`) over hand-rolled copy.

## `ModalContent` is already `flex-1 overflow-y-auto` — don't wrap it again (2026-05-27)

`<ModalContent>` (in `src/components/modals/ui/`) is itself a `flex-1 overflow-y-auto` container — wrapping its children in another `<div className="flex-1 overflow-y-auto">` produces **two stacked scrollable regions and a double vertical scrollbar**. This bit [`MembershipByPackageDetailModal.tsx`](../../src/components/modals/MembershipByPackageDetailModal.tsx) in the membership breakdown drill-down: the inner wrapper was removed and the immediate child of `<ModalContent padding="none">` is now a plain `<div>` that fills naturally. When porting a modal body, drop any outer `flex-1`/`overflow-y-auto` wrapper and let `ModalContent` own the scroll.

## ImageUpload preview card: the remove (X) button needs `z-20` above the full-card replacement input (2026-06-24)

[`ImageUpload`](../../src/components/modals/ui/ImageUpload.tsx) — the shared modal image uploader (used by `MajorDrawEditModal` and others) — renders, inside each preview card, a full-card hidden `<input type="file" className="absolute inset-0 …">` for drag/click-to-replace **after** the remove (X) button in DOM order. With equal (auto) z-index the later-painted input won hit-testing and overlaid the X button, so clicking X opened the **replace** file-dialog instead of deleting the image (reported in the admin "Edit Major Draw" modal). Fix: the X button now carries `z-20` (above the replacement input) plus `onClick` `e.preventDefault()`/`e.stopPropagation()` and an `aria-label`, so clicking X calls `removeImage(index)` (delete) while the rest of the card still triggers replace. **Rule:** when an interactive control sits over a full-card `absolute inset-0` input, the control must win z-order — DOM order alone won't save it.

## MembershipModal register POST: client-computed `fbc`/`fbp` for server CAPI Click ID

`MembershipModal.handleRegistration` sends client-computed `fbc`/`fbp` (`getFBCFromURL()` / `getFBPFromCookie()` from [facebook-helpers](../../src/utils/tracking/facebook-helpers.ts), guarded by `typeof window !== "undefined"`) in the `/api/auth/register` POST body so the server-side `CompleteRegistration` CAPI event gets the Meta Click ID. The register POST can fire before the pixel writes the `_fbc` cookie and the API URL has no `fbclid`, so the server can't reliably source `fbc` itself — the client supplies it (it can read the cookie or reconstruct from the landing `fbclid`). Server counterpart prefers these body values over the cookie: see [auth/api.md](../auth/api.md) and [auth/gotchas.md](../auth/gotchas.md).

## Mobile-UX hardening pass: iOS focus-zoom + dvh→svh modal heights + safe-area CTA (2026-06-09)

A batch of fixes targeting iOS Safari behavior. Two reusable rules came out of it (also recorded in [tailwind-conventions.md](./tailwind-conventions.md) §9):

1. **Focusable inputs must render ≥16px (`text-base`) to avoid iOS focus zoom.** iOS Safari auto-zooms a focused input whose *computed* font-size is <16px (e.g. `text-sm` = 14px). Fixed in this pass:
   - [`Input.tsx`](../../src/components/modals/ui/Input.tsx) — the `md` size class went `text-sm` → `text-base`.
   - [`CouponRow.tsx`](../../src/components/modals/MembershipModal/CouponRow.tsx) — coupon input `text-sm sm:text-base` → `text-base`.
   - [`PaymentMethodsTab/index.tsx`](../../src/components/modals/PaymentMethodsTab/index.tsx) — Stripe Elements appearance now uses the shared `buildMembershipStripeAppearance(isDarkMode)` (16px inputs + dark-mode support) instead of a hardcoded light 14px object; Elements are re-keyed on theme so the appearance actually swaps.

2. **Size modal CONTENT with `svh`, not `dvh`.** `dvh` (dynamic viewport height) is throttled by WebKit and janks/clips as the mobile browser chrome shows/hides ([WebKit bug 266835](https://bugs.webkit.org/show_bug.cgi?id=266835)); `svh` (smallest viewport height) is the stable unit. [`ModalContainer.tsx`](../../src/components/modals/ui/ModalContainer.tsx) content heights (`auto` max-h, `screen`, `fixed`, `mobileFullBleed` variants) moved `dvh` → `svh`. Tall content relies on the modal body's own `overflow-y-auto` scroll region (see the `ModalContent` gotcha below). The backdrop may stay `dvh` — only the content box needs the stable unit.

3. **Floating CTA clears the iOS home indicator via safe-area inset.** The app now sets `viewport-fit=cover`, so fixed bottom UI sits under the home indicator. [`FloatingGetEntriesButton.tsx`](../../src/components/sections/promo/FloatingGetEntriesButton.tsx) bottom offset is now `bottom-[calc(env(safe-area-inset-bottom)+1rem)]`. Any new fixed-bottom CTA should follow the same pattern.

### PromoBanner: skeleton placeholder + scroll-to-top placement fix (2026-06-09)

[`PromoBanner.tsx`](../../src/components/sections/promo/PromoBanner.tsx) had two issues fixed together:

4. **CLS on load.** While promo/draw/variant data resolves (`!isPromoResolved`) the component used to `return null` — zero height — then pop in at full height and push the whole landing page down. It now returns a **height-reserving skeleton** (full-bleed black bar at the bar-mode `min-h-[5rem] sm:min-h-[8rem] lg:min-h-[8.25rem]` (raised 2026-06-12 with the extended art — see below), with `bg-white/10 animate-pulse` left-art + countdown blocks) so the space is reserved from first paint. Uses the banner's own pulse idiom so it reads as one loading state with the hero's `animate-pulse` loader below it. **Rule:** a client-gated, above-the-fold banner must reserve its height while loading, never `return null`.

5. **Misplacement when scrolling back to top.** The banner morphs between an in-flow full-bleed bar (top) and a `position: fixed` floating pill (scrolled) via Framer MotionValues on `top/left/width` (FLIP). On revert, Framer sometimes left a stale fixed-era inline `top: <px>`; with `position: relative` that shifts the bar **down** (gap above it) while its flow slot stays at `top:0` (hero below overlaps under it). Fix: the "leaving fixed mode" `useLayoutEffect` now force-resets `node.style.top/left/right/width` to the bar geometry (`top:0px; left/right:auto; width:100vw`) directly on the DOM, so the bar always lands flush. Belt-and-braces over the existing MotionValue reset — the conditional MotionValue↔static `style` swap is the fragile part.

### PromoBanner: extended left-art size + drawn-tomorrow parity (2026-06-12)

New `drawn-tomorrow` / `drawn-tonight` brand art is a tall clock lockup (replacing the old short-wide tomorrow art), so the left-art size was bumped and **`drawn-tomorrow` now renders at the same size as `drawn-tonight`** — the `isDrawnTomorrowLeftArt` shrink branch was retired (both its art + skeleton branches now carry the default sizing; the flag is kept only so the ternary stays explicit). Non-scrolled art is `h-[5rem] sm:h-[8rem] lg:h-[8.25rem]` (was 4.5/7/6.75rem; tomorrow was 3.125/4.875/4.75rem), scrolled pill `h-[4.25rem] sm:h-[7rem] lg:h-[7rem]`. Bar `min-h` (both layers) and the `!isPromoResolved` skeleton were raised to match so there's no CLS. **Width is aspect-driven** — the art is `object-contain` at a fixed height, so making it "wider" means raising the height. `Holiday` takeover art keeps its own (larger) sizing untouched.

### Branded loaders + empty-state hygiene (2026-06-09 follow-up)

- **PromoBanner load state shows the brand logo, not pulse blocks.** The `!isPromoResolved` skeleton (item 4) renders the white-text Tools Australia logo (`/images/Tools Australia Logo/White-Text Logo.webp`) centered on the dark bar with a gentle breathe (opacity + scale via Framer, gated by `prefersReducedMotion`). Still reserves the same `min-h` so there's no CLS.
- **`MultiplierBannerImage` has its own loader.** [`MultiplierBannerImage.tsx`](../../src/components/ui/MultiplierBannerImage.tsx) now tracks `loaded` (`onLoad`), fades the art in (`opacity-0`→`opacity-100`), and overlays a branded loader **inside the image's reserved box** (next/Image keeps the aspect-ratio, so no shift): social-profile logo (`Social_Media_Profile_Primary-removebg-preview.webp`) + `.animate-shimmer-horizontal-fast` sweep + gradient "Gearing up your multipliers…" text. Used by MembershipSection + PrizeShowcase (both multiplier banners). The passed `className` now sizes the wrapper `<div>`; the `<Image>` is `w-full h-auto`.
- ~~**`GiveawayCountdownTimer` hides on TBA.**~~ **DELETED 2026-07-22** — the prize builder's combo hero carries the draw stamp (`DRAWN 27 JUL · 8PM AEST`), so the separate countdown/date card above the card was redundant. `PrizeShowcase` was its only consumer; the `showCountdown` prop and the verbose `formatMajorDrawLiveDateLineUtc` formatter went with it.

## UpsellModal: `isProcessing` does NOT guard the post-success window — a `purchaseComplete` latch does (2026-06-02)

[`UpsellModal`](../../src/components/modals/UpsellModal/index.tsx) shows a `PaymentProcessingScreen` overlay on a successful charge and only auto-closes ~3s later (`setTimeout(handleClose, 3000)`), polling the webhook in between. The in-flight guards — `isProcessing` state and the synchronous `upsellPurchaseLockRef` — are both reset in the `finally` block **the instant `purchaseUpsell.mutateAsync` resolves**, including on the success path. That left a multi-second window where the underlying modal was still mounted and the "Purchase" button was re-enabled (its `disabled` read only `isProcessing`). Because every tap mints a **fresh** `crypto.randomUUID()` idempotency key, a second tap was a brand-new Stripe PaymentIntent — i.e. a real **double charge + double entry grant** (the server's DB pre-check reads the user doc before the webhook writes the purchase row, and a per-tap random key defeats Stripe idempotency, so neither server guard catches the race).

Fix: a `purchaseComplete` state latch set to `true` in the success branch (before `finally` runs) and never cleared while the offer is shown. It is OR'd into the `runUpsellPurchase` early-return guard (covers the button **and** the inline-card `handleUpsellInlineCardSaved` path) and into [`AcceptDeclineRow`](../../src/components/modals/UpsellModal/AcceptDeclineRow.tsx)'s button `disabled` (which then renders a "Purchased" state). A `useEffect` keyed on `offer.id` resets the latch so a back-to-back upsell reusing the same modal instance starts enabled (the normal close path unmounts the modal, so per-open reset is automatic). The latch is intentionally **not** cleared on `handlePaymentError`/`onTimeout`: once `mutateAsync` returns `success` with a `paymentIntentId` the money is already taken, so re-enabling would risk a second charge. This is a UI-only fix; no backend change.

## UpsellModal / UpsellManager no longer finalize invoices client-side (2026-07)

[`UpsellModal`](../../src/components/modals/UpsellModal/index.tsx) and [`UpsellManager`](../../src/components/modals/UpsellManager.tsx) previously called `/api/invoice/finalize` from the client to emit the "Invoice Generated" Klaviyo receipt — on modal show (via a 30s timeout), on decline, on accept-with-upsell, and on close. That path was **unreliable**: if the customer navigated away before the fetch fired, the receipt was silently dropped. It has been **removed** — the `finalizeInvoice` function, all its call sites, the `/api/invoice/finalize` fetch, and the related state/refs (`invoiceFinalized`, `isFinalizingRef`, `finalizationTimeoutIdRef`/`finalizationTimeoutId`) are gone from both files. The "Invoice Generated" receipt is now emitted **server-side** from payment processing (`trackKlaviyoEvent`), so it can never be dropped by a client that navigates away. Do not reintroduce a client-side finalize. Side effects of the removal: `UpsellManager` no longer uses `originalPurchaseContext` — the prop was dropped from [`UpsellManagerProps`](../../src/types/upsell.ts) entirely (it was only ever a delayed-invoice carrier and no caller passed it) — and `UpsellModal` no longer destructures `userContext` (unused). The modals' core behaviour (show offer, take payment, accept/decline/close) is unchanged, and `UpsellModal` still uses `originalPurchaseContext` for upsell package-type/promo resolution.

## MultiplierBannerImage: stuck "GEARING UP YOUR MULTIPLIERS…" loader on a cached `src` swap (2026-07-01)

[`MultiplierBannerImage`](../../src/components/ui/MultiplierBannerImage.tsx) fades the banner in on the `<Image>` `onLoad` and shows a shimmer loader until then, swapping `src` through an ordered path list (branded → generic). On a promo page the branded/slug inputs settle *after* first paint (the promo-theme store populates in an effect), so the `src` swaps. When the swapped-in `src` points at an **already-cached** image, the browser does **not** re-fire `onLoad` → `loaded` stayed `false` forever → the shimmer never cleared, and only a hard refresh (fresh uncached load) fixed it ("needs a refresh for the correct image"). Fix: in the `[multiplier, slug, toolsetSlug, pathKey]` reset effect, resolve `loaded` immediately when the freshly-set image is already complete (`imgRef.current.complete && naturalWidth > 0`), alongside the existing `onLoad` path. Root-level fix — benefits **every** consumer (currently `MembershipSection` + `PrizeShowcase`).

## Acumin @font-face is local()-only (2026-07-20)

The url() source 404'd on every page (file never added to public/fonts/). If the licensed woff2 is ever obtained, re-add the url() source per the comment in globals.css.

## ModalContainer: `mobileFullBleed` silently dropped its desktop max-width (2026-07-21)

[`ModalContainer`](../../src/components/modals/ui/ModalContainer.tsx) built the full-bleed
panel shape with an **interpolated** class — `` `w-full max-w-none … lg:${sizeStyles[size]}` ``
→ `lg:max-w-4xl`. Tailwind scans *source text*, so an interpolated class only survives if that
exact string happens to appear literally somewhere else in the repo. `lg:max-w-2xl` did (in
[`affiliate/page-client.tsx`](../../src/app/(site)/affiliate/page-client.tsx)), which is why
`CancellationFlowModal` (`size="2xl"`) worked **by accident**; `lg:max-w-4xl` did not, so the
first `size="4xl" + mobileFullBleed` modal rendered edge-to-edge on desktop (`max-w-none` never
being overridden) — a ~1900px sheet on a 1920px screen.

Fixed with a literal `lgSizeStyles` map alongside `sizeStyles`. **Never interpolate a Tailwind
class name from a variable** — see [tailwind-conventions §8](tailwind-conventions.md). If you
add a `size` key, add it to *both* maps.

## Prize builder reels are an ARIA radiogroup, not a set of toggle buttons (2026-07-21)

[`SelectorReel`](../../src/components/sections/promo/prize-selection/SelectorReel.tsx) is
`role="radiogroup"` with `role="radio"` cards and a **roving tabindex**: only the selected card
is `tabIndex={0}`, so Tab reaches each lane once and Left/Right/Home/End move the selection —
and `selectAndFocus` moves DOM focus with it, so the ring never desynchronises from the choice.
Two consequences to preserve if you touch it:

- The focus ring is `ring-inset`. The 3D stage is `overflow-hidden`, so an offset ring on a side
  card is sliced in half at the stage bounds.
- Cards outside the visible window get `aria-hidden` **and** `tabIndex={-1}` together. Setting
  only one of the two either strands a Tab stop on an invisible card or hides a focusable one.

Guarded by `npm run test:prize-builder-card` (radiogroup/radio/checked counts and the tab-stop
count).

## ModalContainer gained a `drawer` presentation (2026-07-22)

`presentation="drawer"` renders a **full-height panel sliding in from the right edge** below
`lg`, reverting to the normal centered dialog at `lg`+. It exists because the prize-details
handoff specifies exactly that (its `pbcdrawer` keyframe animates `translateX(100%) → 0`), and
neither `sheet` (slides up from the bottom) nor `mobileFullBleed` (bottom-anchored 95svh) is
that shape.

Three coordinated pieces, all in [`ModalContainer`](../../src/components/modals/ui/ModalContainer.tsx):
`outerFlex` (`items-stretch justify-end`), `panelShape` (`rounded-none` + the `lg:` size), and
`panelHeight` (`h-full`), plus `drawerPanelVariants` in
[`modalPresets`](../../src/utils/motion/modalPresets.ts). Reduced motion still falls through to
the shared fade. `drawer` and `mobileFullBleed` are mutually exclusive — `drawer` wins.

## Prize spec cards: the green `$5K` tile is CASH-ONLY (2026-07-22)

`SpecCard`'s photo-less branch originally rendered the green `$5K` plate, on the assumption
that the injected cash item was the only entry without an image. It is not — plenty of real
catalogue items have no photo (`dewalt-kincrome` alone has 8: the whole TOUGHSYSTEM® storage
section plus the workshop-storage item). Every one of them rendered a green `$5K` tile, which
reads as "this storage box is worth $5,000".

There are now three tile states, and the cash one is gated on an explicit `isCash` prop set
from `activeSection.id === CASH_SECTION_ID` — never inferred from a missing image:

| state | tile |
|---|---|
| `item.image` | white plate + `next/image` |
| `isCash` | green-tinted plate + `$5K` |
| neither | dashed neutral tile + a muted crate glyph ("Photo coming soon") |

When adding a spec section, don't reuse the id `cash-prize` for anything that isn't the cash
bonus, or its items will inherit the `$5K` treatment.

## Prize-builder reel: never fade card TEXT with card-level opacity (2026-07-22)

The coverflow reel's side-card recede was `opacity: var(--pbc-reel-side-opacity)` (0.5 on
desktop) + a brightness/saturate filter on the WHOLE `.pbc-reel-card` — which composited the
`--pbc-sub` labels down to ~2:1 and produced 12 serious axe `color-contrast` violations on `/`
(plus an illegible NEW badge). The recede now lives on `.pbc-card-art` (a wrapper class on the
product render / brand mark / wordmark spans in `ReelCards.tsx`) so text and badges stay
full-opacity; the scale/rotate/border/shadow differences plus the dimmed artwork still read as
"not selected". Cash-mode's deeper `data-dimmed` fade follows the same artwork-only rule.
If you add a new visual element to a reel card, put it INSIDE a `.pbc-card-art` wrapper if it
should recede — and leave any text OUTSIDE it.

Cash-green ink pairs with this: small cash-coloured text must use `--pbc-cash-ink`
(#0e7434 light / #3ddc84 dark — same contract and value as `--pgs-cash-ink`), never raw
`--pbc-cash`/#18a94d (3.08:1 on light surfaces). White-on-green pills use `--pbc-cash-dark`
as the fill. Full node-by-node table: docs/e2e/a11y-baseline.md "redesigned prize-showcase".

## A reserved skeleton must be a FLOOR, not a guess (2026-07-29, panel F-022)

`MembershipPortalReturnBanner` reserved a fixed skeleton height to avoid layout shift, but the
settled banner has six variants and the reserved height sat *between* the tallest and the shortest.
When the data landed the section sometimes **shrank**, pulling the whole page up. Measured with a
Chrome `layout-shift` observer: **CLS 0.5774 guest @1280, 0.6134 member @1280** (Google's "good" bar
is 0.10), against 0.0100 for the same page with the banner absent — the hero `<h1>` moved up 34.8px.

**Rule:** when a placeholder reserves space for content of unknown size, put the reservation on the
**shared container as a `min-h`**, so the settled state can only ever grow into space already
reserved. Sizing the placeholder alone only avoids shift for the one variant it happens to match.
Keep the `min-h` values and the skeleton's own heights in sync — they are the same measurement.

## `inkOn()` picking white does not mean white is legible (2026-07-29, panel F-023)

`inkOn()` returns white for any brand colour under its luminance threshold, which is a
*black-or-white* decision, not a contrast guarantee. On the lighter membership tiers that produced
**2.07:1** for the Rewards partner-portal button's label (AA needs 4.5:1) — pixel-sampled from the
rendered button, not computed from source; no part of the gradient passed.

**Rule:** where white ink sits on a tier/brand gradient, darken the **gradient** (`shade(c, -44)` →
`shade(c, -60)`) rather than flipping to dark ink — the tier stays recognisable as its tier and the
label becomes legible (Tradie 5.95:1, Boss 10.5:1). Also avoid discounting small sub-labels with
`rgba(255,255,255,.78)`: at 10px that was 1.79:1. Sample the rendered pixels; do not trust the
token's own contrast.

## Reused-not-remounted components must reset per-page state (2026-07-29, panel F-026)

`/promotions/{a}` → `/promotions/{b}` is a client transition **within the same `[slug]` segment**, so
`PrizeShowcase` is reused and its `useState` initialisers never re-run. The effect keyed on
`slugProp` already re-derived the selection and cleared the URL params, but left the engagement
counters and the interaction flag — so page B's visit row was credited with page A's reel activity,
and (because the beacon re-fires on the new slug) with a build nobody made there.

**Rule:** when an effect re-derives state for a route-param change, reset **every** piece of
per-page state in that same effect, not just the visible ones. Analytics counters are the easy ones
to miss because nothing on screen looks wrong.

## A portal escapes a scoped-token block — `DrawModalShell` (2026-07-30)

`ModalContainer` renders via `createPortal(modalContent, document.body)`. That escapes the React
tree, so **a modal opened from inside a scoped-token container is not a DOM descendant of it.**

The admin draws pages scope their design tokens to `.admin-draws` (see
[tailwind-conventions §11](./tailwind-conventions.md)). A modal opened from one of those pages
would therefore resolve every `var(--panel)` / `var(--m-btn-h)` to **nothing** — no error, no
warning, just unstyled boxes and zero-height buttons.

Fix: [`DrawModalShell`](../../src/components/modals/draws/DrawModalShell.tsx) puts the
`admin-draws` class on **its own panel**, via `ModalContainer`'s `className` passthrough. Verified
in the browser — the panel reports `isInPortal: true` **and** resolves `--accent: #e00`, with the
primary button computing to `rgb(238, 0, 0)`.

**The general rule:** a CSS-variable scope only reaches what is inside it *in the DOM*. React
context crosses a portal; CSS inheritance does not. Any portal-rendered UI that needs scoped tokens
must re-apply the scope class itself.

Two related notes:

- **`.dark` still works across the portal** without re-application, because it lives on `<html>`,
  which *is* an ancestor of `document.body`. Only the page-level scope class is lost. Confirmed:
  the portaled panel picks up `--accent: #f44` in dark.
- **Match the breakpoint the container already uses.** `DrawModalShell` passes
  `presentation="sheet"`, whose flush-to-bottom alignment flips at ModalContainer's `sm` (640px).
  The shell's top-radius override is keyed to the same `sm`, not to the draws `900px` breakpoint —
  keying them differently would round the top corners of a *centered* dialog between 640 and 900.
## The header Suspense fallback reserved height a `fixed` header never occupies (CLS 0.073)

**Found 2026-07-30 by measurement; fixed in `src/app/(site)/layout.tsx`.**

`(site)/layout.tsx` wrapped `<Header />` in:

```tsx
<Suspense fallback={<div className="h-[86px] sm:h-[106px] site-header" />}>
```

`Header` renders `fixed top-0 left-0 right-0 z-40` (`isFixed` defaults to `true`, and no
caller overrides it — both call sites use a bare `<Header />`). A fixed element is out of
flow, so once it resolves the `.site-header` wrapper computes to **height 0**. Measured on
production:

```
.site-header wrapper : static  h=0
its first child      : fixed   h=100  (header)
```

So the fallback reserved 106px of flow height that the real header never uses, and at
hydration everything below jumped **up** by that amount:

```
t=2803ms  headerH=106  mainTop=106
t=3147ms  headerH=0    mainTop=0     ← content jumps up 106px
```

Worth a measured **0.073 CLS on every `(site)` route** — `/`, `/winners`, `/membership`,
`/mini-draws`. Small individually, but it is the most widespread shift on the site, and the
source element reported by the browser is `div.site-main-content`, which misleadingly points
at the content rather than the header above it.

**Fix:** the fallback reserves zero height (`<div className="site-header" aria-hidden />`),
matching what actually renders. Pages already clear the fixed header with their own
`pt-[var(--app-header-h)]`.

**Keep the `site-header` class on the fallback** — `body[data-account-layout]` in
globals.css targets it to hide site chrome on `/my-account` routes.

**Rule:** a Suspense fallback must reserve the height its real content will occupy in FLOW.
For a `fixed`/`absolute` child that is **zero**, not the element's visual height. Reserving
its visual height guarantees a shift in the opposite direction.

## `overflow-x: hidden` on html/body silently disables `position: sticky` (2026-07-31)

`globals.css` `@layer base` sets `overflow-x: hidden` on **both** `html` and `body`. Per CSS
spec, when one axis is not `visible` the other **computes to `auto`** — so both elements are
scroll containers, and any `position: sticky` descendant sticks to *them* rather than to the
viewport. Since the window is what actually scrolls, such an element just scrolls away.

This is what broke the dashboard's sticky sidebar (full write-up, with measurements:
[dashboard-account/gotchas.md](../dashboard-account/gotchas.md)). The fix is `overflow-x: clip`
— it clips exactly the same way but creates no scroll container.

**Resolved site-wide 2026-08-04**: the base rule is now `body { overflow-x: clip }` (both the
base declaration and the mobile media-query copy), so sticky works on every route rather than
just the account layout. `html` deliberately keeps `hidden` — the root element propagates its
overflow to the viewport instead of becoming a separate scroll container, so it was never the
culprit. The trade-off accepted with `clip`: programmatic horizontal scrolling of `body` is no
longer possible. Nothing in the app does that.

**Before adding a `sticky` element anywhere else**, check it actually sticks. If it doesn't,
look for a *nearer* ancestor with a non-`visible` overflow — the same rule applies at every
level, and the fix is `clip` on that ancestor rather than anything on the element.

**Hit again 2026-08-12 — the nearer ancestor was a PAGE wrapper.** The mini-draws redesign added
a sticky mobile control bar to `/mini-draws` and a sticky gallery column to `/mini-draws/[id]`.
Neither engaged, even though `body` had been fixed site-wide: both page roots carried
`w-full overflow-x-hidden`, so each page's own wrapper was the scroll container. Measured: the
bar's `getBoundingClientRect().top` read **28.8px** at `scrollY = 300` with `top: 86px` set — it
was simply scrolling away. Swapping both wrappers to `overflow-x-clip` fixed it. The site-wide
`body` fix does **not** immunise a page that re-introduces the same declaration one level down;
`overflow-x-hidden` on a full-bleed page container is a common instinct, so check for it first.

## The same mutation mounted three times must fail the same way three times (2026-08)

[`RewardsClaimables`](../../src/components/sections/rewards/RewardsClaimables.tsx) called
`redeem.mutate({ … })` fire-and-forget and read nothing back. Every rejection — 409 already
redeemed, 400 expired, 403 ineligible, a dropped request — landed nowhere: no toast, no inline
message, and since the button's only feedback was `redeem.isPending`, the reward stayed listed
as claimable. The member's rational response to a Claim button that visibly does nothing is to
press it again.

The same `useRedeemableRedemption` mutation is mounted in two sibling surfaces
([`RewardsFloatingWidget`](../../src/components/features/RewardsFloatingWidget.tsx),
[`RedeemablesWallet`](../../src/components/features/RedeemablesWallet.tsx)) and **both** already
awaited it and toasted the error. So the feedback a member got depended on which of three
identical-looking Claim buttons they happened to press. `RewardsClaimables` now uses the same
`await mutateAsync` → `if (!response.success) throw` → success/error toast shape.

Two things this leans on, both worth carrying to any other consumer:

- **A resolved promise is not a success.** `/api/redeemables/redeem` answers `200 { success:
  false, error }` for business rejections, so `mutateAsync` resolving proves nothing — the
  `!response.success` check is what converts it into the `catch`.
- **The list self-corrects either way.** `useRedeemableRedemption`'s `onSettled` re-syncs the
  wallet on both outcomes (a 409 means the server *did* burn the issuance, so the rolled-back
  optimistic snapshot is the stale one), which is why a rejected item stops rendering as
  claimable without the component doing anything.

**Rule:** when the same mutation has more than one mount, error handling is part of the
mutation's contract, not of one component's polish. Copy the handler, or the surfaces diverge
silently.

## ProductCard: a local mirror of cart state made its own error UI unreachable (2026-08)

[`ProductCard`](../../src/components/ui/ProductCard.tsx) kept three per-product local maps —
`localAddedState`, `localLoadingState`, `localErrorState` — beside the cart's own state, and
drove the button off them. The cart is optimistic-with-queue: `addToCart` writes the item list
immediately and **resolves right away**, and the provider POSTs the operation later, pushing
rejections into `failedOperations`. So `await addToCart(...)` essentially never throws for a
server rejection — which meant the `catch` that set `localErrorState` never ran, and the whole
`AlertCircle` + `RefreshCw` error branch was dead code. What the member saw instead was
`localAddedState` holding the button green ("Added") over an add the server had refused and the
provider had since reverted out of `items`.

All three maps are gone. `isInCart` reads `items` (the provider's optimistic list, reverted on
failure) and `hasError` reads the matching entry in `failedOperations`, so the error UI is
reachable from the state that actually records failure. Retry likewise had to change: it used
to re-run `handleAddToCart`, which **queues a second operation** and leaves the original stuck
in `failedOperations` forever (nothing else removes it) — it now calls
`retryFailedOperation(failedAddOperation.id)`, which is what drains that entry.

Known edge still open: the lookup matches `operation.data.productId`, and a mini-draw add is
queued as `{ miniDrawId }` with no `productId`, so a failed mini-draw add does not light the
error state.

**Rule:** with an optimistic provider, the provider's own state *is* the feedback channel.
A component-local copy of "added"/"loading"/"error" can only ever drift from it, and the drift
always fails toward the reassuring answer.

## A purchase flow that ends without the success screen must still say something (2026-08)

[`SpecialPackagesModal`](../../src/components/modals/SpecialPackagesModal/index.tsx) and
[`UpsellModal`](../../src/components/modals/UpsellModal/index.tsx) both hand off to
[`PaymentProcessingScreen`](../../src/components/loading/PaymentProcessingScreen.tsx) after a
charge. Its non-success exits — `onError`, and the member tapping "still processing" — used to
`setShowPaymentProcessing(false)` / `handleClose()` and nothing else (`SpecialPackagesModal`'s
error handler literally carried a `// Could show error message to user here`). The overlay just
vanished, on a flow where money may well have moved.

Both now toast on the way out: an `error` toast on the failed-confirmation path and an `info`
"Still processing" on the dismiss path. The copy deliberately does **not** claim the payment
failed — the confirmation failed, and the charge may still land — so it points at the emailed
receipt and support, and says free entries will appear once it completes.

Two wiring details:

- These paths bypass the global success screen, so the dashboard's own entry-hold release
  (which runs when that overlay closes) never fires. Each handler calls
  `clearDashboardEntryHold()` itself, or the wallet keeps rendering pre-purchase numbers after
  a charge that may have succeeded.
- `PaymentProcessingScreen` destructures `onTimeout` as `_onTimeout` and **never invokes it** —
  `onStillProcessingDismiss` is the only live exit. Wiring only `onTimeout` is wiring nothing;
  `UpsellModal` points both props at the same `handleProcessingDismiss` so it can't rot back.

The `purchaseComplete` latch documented above is still intentionally **not** cleared on either
path — once `mutateAsync` returned a `paymentIntentId` the money is taken, and re-enabling the
button would risk a second charge.

## Two ways a sticky bar inside a modal fails to sit flush (2026-08-05)

[`TabSwitcher`](../../src/components/modals/PackageSelectionModal/TabSwitcher.tsx) — the
One-Time / Membership Packs toggle — was `sticky top-0` with an opaque background and still
docked wrong in both axes. Two independent causes, each easy to mistake for the other.

**1. A scroll container's padding offsets its sticky children.** `ModalContent`'s body is
`p-3 sm:p-6`. Sticky offsets resolve against the scrollport's **content** box, so `top-0`
docked the bar 25px down (1px border + 24px padding) with the page showing through the gap
above it. The negative margin that pulls the bar to the container edge fixes the **at-rest**
position only — once sticky engages, `top` takes over and the margin no longer applies.

So the offset has to cancel the padding too: `-top-3 sm:-top-6` alongside `-mx-3 -mt-3
sm:-mx-6 sm:-mt-6` (with matching `px-3 pt-3 sm:px-6 sm:pt-6` putting the bar's own content
back). Docked position then equals flow position, and the band is flush left/right/top in
**both** states. Measured after the fix: `gapTop: 1` (the panel's 1px border), `left: 0`,
`right: 0` at 390px and 1320px, light and dark.

**Verify by measuring, not by eye.** A bar that is 25px low still looks plausible. Scroll the
container to `scrollHeight`, then compare `bar.getBoundingClientRect()` against the scroll
container's — and `elementFromPoint` at the band's own corners to confirm nothing paints over it.

**2. `.dark .modal-panel-body .bg-white` glasses every white chip.** That rule
([globals.css](../../src/app/globals.css)) repaints `bg-white` inside a dark modal body as
`rgb(38 38 38 / .4)` so general chips read as glass. At specificity (0,3,0) it beats
`dark:bg-neutral-950` at (0,2,0), so the bar's background silently became **40% transparent**
and the tiles read straight through it — while every geometric measurement said "flush".

The rule's own comment prescribes the escape hatch: use arbitrary values. The bar is
`bg-[#ffffff] dark:bg-[#0a0a0a]`, which matches the scroll body's measured surface exactly and
is not caught by the selector. **Any element inside `.modal-panel-body` that needs a genuinely
opaque light surface must do the same** — `bg-white` there does not mean white.

## An `overflow-x-auto` rail inside a grid item sizes the TRACK, not itself (2026-08-06)

`MembershipPrizeChooser` rendered a giant, cropped sliver of one toolbox on every phone. The
image is `aspect-[4/3] w-full` inside a `<div className="relative">` grid item — nothing about
it is wide. What was wide was its **sibling**: a 20-thumbnail `overflow-x-auto` rail whose
max-content width is ~1432px.

A grid item defaults to **`min-width: auto`**, which floors it at its content's min-content
size, and the single implicit MOBILE track is `auto`-sized. So the track resolved to 1432px
inside a 348px grid box, the `w-full` image frame filled that 1432px, and the whole right-hand
column (price, bullets, CTA) went with it. `overflow-x-auto` never engaged, because the rail
got all the width it asked for.

Two things made this survive review:

1. **The section had `overflow-hidden`**, so it never produced a page-level horizontal
   scrollbar — the usual tell for this bug. It just rendered wrong, quietly.
2. **`lg:grid-cols-2` is immune**, because Tailwind's `grid-cols-*` already expands to
   `repeat(N, minmax(0, 1fr))`. So it looked correct on the desktop the author was using and
   broke only below `lg`, where the explicit template drops away.

**The rule: any grid or flex item that CONTAINS a scrolling region needs an explicit
`min-w-0`.** Tailwind's `grid-cols-*` gives you `minmax(0,1fr)` for free only where the
utility applies; a single-column (or `flex`) parent gives you nothing. Verify at a phone width
by reading `getComputedStyle(grid).gridTemplateColumns` — if the track is wider than the grid
box, this is what you are looking at.

## Inline `style={{ color }}` is invisible to `dark:` — the upgrade flow's real dark-mode bug (2026-08-06)

Reported as "the upgrade flow's dark mode is not properly coded — light features in dark
mode". A 20-agent audit traced it to **two independent causes**, and refuted a third that
looked far more likely.

**Cause 1 — light-only shared primitives.** `ui/Card.tsx` was `bg-white` with no pair, and
`ui/Button.tsx` had **no `dark:` token at all** (its `outline` variant is `bg-white`). The
Card failure is the instructive one: its only consumer, StripePaymentModal's Order Summary,
themes its *own* text with `dark:`, so in dark mode the labels correctly went light-grey —
onto a white card. **A light-only primitive does not render "in light mode"; it renders broken
against any child that respects the theme.** `PaymentProcessingScreen`'s 45s "Still
processing" card had the same shape (zero `dark:` tokens, pure white, mid-payment).

**Cause 2 — tier inks applied as INLINE STYLES.** `UpgradeConfirmModal/ActionRow`,
`BenefitsBody`, `StripePaymentModal/UpgradeBenefitsPreview` and `ui/UpgradeBenefitStatGrid`
all paint tier accents via `style={{ color: theme.deep }}` or
`style={{ color: "var(--tier-color-deep)" }}`. Those inks (`#0b7e88` teal, `#a17b00` gold,
`#b91c1c` red) and the pastel borders beside them (sky-200 / amber-200 / red-200) are chosen
to read on **white**, and a `dark:` utility cannot override an inline style. So they survived
on a `neutral-950` panel at ~3:1 contrast while the text right next to them themed correctly.

The fixes, in order of preference:
1. **Fix the VARIABLE, not the consumer.** `--tier-color-deep` was set only in the light
   `.scrollFrame[data-tier=…]` blocks — the dark ones overrode three stat vars and skipped the
   ink — which is what stranded `BenefitsBody`'s glyphs. The first attempt patched the one
   glyph anyone had noticed, with a `dark:text-[color:var(--tier-color)]` utility. That left
   every OTHER reader broken, including two byte-identical call sites in
   `DowngradeConfirmModal` that were live in the default dark theme. Giving the variable a
   dark value in both stylesheets was six lines and fixed all of them at once.
   **Upgrade and Downgrade are done; `PackageDetailModal`, `ReferFriendModal` and
   `SubscriptionExplainerModal` still define it light-only.**
2. Failing that, resolve the value in JS from `useHtmlDarkForUi()` and keep two maps.
3. Last resort, an `!important` utility (`dark:!text-white`) — already the local idiom in
   `UpgradeBenefitsPreview`.

**What was REFUTED, and why it matters:** the obvious suspect was that six payment modals read
`useThemeStore((s) => s.theme === "dark")` instead of `useHtmlDarkForUi()`, so Stripe's iframe
would get the wrong `appearance.theme`. It is a real inconsistency but **not this bug**:
the store's default is already `"dark"`, zustand's persist rehydrates synchronously from
localStorage (so there is no pre-hydration light render), the one genuine divergence path
(`PromoThemeExperimentGate` calling `setState` instead of `setTheme`) self-heals in a root
`useLayoutEffect` before any modal mounts, and every `<Elements>` already carries an
isDark-keyed remount key so it re-themes anyway. Chasing the plumbing would have cost a day
and fixed nothing — the bug was always plain CSS.

**Guard:** `Card.test.ts` now asserts every `bg-`/`text-`/`border-` token it renders has a
`dark:` counterpart (`npm run test:ui-primitives`). That catches cause 1. Cause 2 is not
mechanically checkable — when you reach for an inline colour, pick option 1 above.

## Homepage hero photo is HIGH-KEY — the scrim is directional, not a flat wash (2026-08-10)

`public/images/background/{desktopBg,mobileBg}.webp` were replaced with a real studio shot of
the prize haul (white wall, bright concrete floor, two people centre-frame) in place of the
dark moody render. Same filenames, so [`Hero.tsx`](../../src/components/sections/Hero.tsx) paths,
the media-scoped preload pair, and the `<picture>` `<source>`s are all unchanged.

**The scrim had to be rebuilt.** The old `bg-black/20 dark:bg-black/45` flat wash was tuned for a
dark image; over a white wall it left the white type barely legible. What replaced it, and why
each piece exists:

**GOVERNING RULE: darken only where the words are.** This took three passes to land, and every
wrong turn was the same mistake — a full-bleed layer trading the photo's colour for contrast it
didn't need across most of its area. The photo *is* the point; if you're about to add a global
wash, don't.

- **Not theme-varied.** The copy is `text-white` in both themes, so the scrim must be dark in
  both. A `dark:`-only scrim is a bug waiting to happen here.
- **No base wash on desktop at all.** There is exactly one darkening layer: a soft ellipse over
  the copy column, `36%/53%` radii at `27%/45%`, peaking at `0.82` and feathered to zero by 86%
  of its radius so its edge is never a visible blob. Its peak is high *because* nothing else is
  helping — don't pair it with a wash "for safety" and then lower it.
- **Why not a horizontal ramp** (two earlier attempts): an edge-anchored ramp is darkest at
  `x=0`, which is pure container margin (`lg:px-[100px]`) with no text in it — it crushed the
  left of the prize to buy contrast nobody needed, which is precisely what the client flagged
  ("the far left side is too tinted"). Re-centring it on the copy fixed the edge but still
  flattened the midfield, because a linear ramp spans the full height at every x.
- **Mobile is a BAND, not a top-weighted ramp.** The copy is vertically centred (~38–58%), so a
  top-weighted gradient is darkest at 0% — empty wall above the title — and still heavy at 62%
  where the prize is. Same mistake, different axis. It now runs light → dense across the copy
  band → light over the prize → a tail for the marquee.
- **Bottom fade** so "WIN AUSTRALIA'S TOP TOOL BRANDS" and `BrandScroller` survive the pale
  floor. Kept short (`sm:h-32`, `from-black/55`) — the brand cards under it are opaque anyway.
- **The stats row is the trap.** It's the lowest and widest part of the copy, so it falls near
  the ellipse's feathered edge and lands on busy pallet/tool art. It's carried mostly by type,
  not scrim: a tight hard shadow for edge definition plus a wide soft one for separation
  (`0 1px 2px rgba(0,0,0,1), 0 2px 12px rgba(0,0,0,0.92)`). A single soft shadow just smudges at
  that size. Check this row first when judging any scrim change.

Copy contrast was raised to match: `text-gray-200`/`text-gray-300` → `text-white/95`/`text-white/90`,
and the generic `drop-shadow-lg|md|sm` filters → tuned `[text-shadow:...]` values (a `drop-shadow`
filter on text is softer than a real text-shadow at the same nominal radius). Desktop stat
dividers went `bg-white/30` → `bg-white/45` to survive the lighter right-hand scrim.

**Perf note:** desktop went 1536×1024 / **1635 KB** → 1920×1280 / **137 KB** — larger and ~12×
lighter, because a flat studio wall compresses far better than a noisy dark render. Mobile:
1024×1536 / 137 KB → 1200×1800 / 115 KB.

**Regenerating:** the source is a 6000×4000 JPG kept outside the repo. Desktop is a straight
`resize(1920,1280)`; mobile is `extract({left:1700,top:0,width:2667,height:4000})` (2:3, biased
right so both people sit centred) then `resize(1200,1800)`, both `webp({quality:80,effort:6})`
via `sharp`. **After replacing either file, delete `.next/cache/images`** — the optimizer caches
by URL, so reusing a filename serves the stale image and looks like your change did nothing.

## Homepage hero: scrim removed entirely, copy rewritten (2026-08-10, supersedes the entry above)

The scrim described in the previous entry is **gone**. Once the stats row was dropped from the
hero, what remained — an 80px headline, one paragraph, and a solid red button — carries itself
on text-shadow alone, so [`Hero.tsx`](../../src/components/sections/Hero.tsx) now runs the photo
at full colour with **no darkening layer at any breakpoint**. The scrim history above is kept
because it documents what was tried and why; treat it as background, not current state.

Text-shadows had to get heavier to pay for it. All hero strings use **three-layer** shadows: a
tight hard edge (1–2px) for legibility against photographic detail, a mid for body, and a wide
halo for separation. A single soft shadow smudges at these sizes — that was the earlier version.

**If copy is ever added back BELOW the CTA, re-check contrast there first.** Every scrim
iteration existed to serve the stats row, which sat lowest and widest, over busy pallet art.
That zone is the hero's genuinely hard case; the headline never was.

Other hero changes in the same pass:
- **Stats row deleted** (`Australia's Best Brands` / `High-Quality Products` / `Happy Customers`)
  from both the mobile and desktop blocks.
- **Mobile copy is top-aligned** (`justify-start` + `pt-2`, was `justify-center`) so the centre
  of the frame is left to the photo — the subjects were previously behind the button stack.
- **One CTA.** "Join Membership" → **"Become a member"**; the `/shop` "Shop Now" button was
  removed because the shop is still coming-soon. `/shop` itself is untouched and still routable,
  and Cobber's corpus never referenced the homepage shop button, so nothing else needed syncing.
- **Copy rewritten** to lead with membership. Two deliberate deviations from the wording as
  first drafted, both worth preserving:
  1. It does **not** say membership unlocks mini draws. Per BUSINESS.md §3b, Mini Packs 1–3
     ($1/$5/$10) are explicitly audience **"Guests"** — mini draws are open to everyone, so
     gating them in copy is both untrue and a drag on the guest funnel. The line presents them
     as "open to everyone" instead.
  2. It keeps **"Australia's biggest tool giveaways"** from the previous copy. Dropping the
     stats row already removed the hero's other keyword-bearing text, and the replacement draft
     contained neither "tools" nor "Australia". Page metadata is unchanged and still carries
     both, but the visible `<h1>` + this paragraph are the on-page signal.

  Rule-11 check: "free entries", "giveaways", "mini draws" — no odds/chance/lottery framing, and
  entries are never priced or sold.

### Mobile CTA pinned to the bottom of the frame (2026-08-12)

Top-aligning the copy (above) freed the centre of the photo but left the **button** mid-frame,
directly over the two subjects. The mobile CTA wrapper is now `mt-auto` inside a
`flex flex-1 flex-col` content column, so it sits at the **bottom of the hero content area** —
below the people, just above the brand marquee — with the column's `pb-8` as the only gap. Its
old `mb-8 sm:mb-12` is gone: with `mt-auto` a bottom margin just lifts the button back up.

`flex-1` needs the `min-h-[calc(100vh-200px)]` on the parent to have something to fill — if that
min-height is ever removed, the column collapses to content height and `mt-auto` silently does
nothing (no layout break, the button just drifts back up under the paragraph).

**Mobile only** (`lg:hidden` block). The desktop hero is a left-aligned column where the button
already reads directly under the copy and nothing sits behind it; it was left untouched.

Contrast: this moves the CTA into the busy-pallet zone the note above flags as the hero's hard
case. It survives the move because a solid red filled button carries its own contrast — the
warning is about **text**, which is why nothing else was moved down with it.

## Membership hero deck must show PROMO-BOOSTED entries (2026-08-10)

[`MembershipHero`](../../src/components/sections/membership/MembershipHero.tsx)'s three deck
cards used to render `metadata.originalEntries` — the **pre-promo base** — with the comment
"hero deck shows BASE entries (not promo-boosted), matching the prototype". With a 5× promo
live, that put **"15 free entries / mo"** in the hero and **"was 15 → 75"** in
[`MembershipTierChooser`](../../src/components/sections/membership/MembershipTierChooser.tsx)
one screen below, on the same page, for the same tier. That reads as a bug or a bait-and-switch.

**The rule: any surface quoting tier entries uses `metadata.entriesCount`** (the multiplier is
already applied upstream). `metadata.originalEntries` exists only to render the `was <s>N</s>`
strike, and is only present while a promo is live — so `originalEntries != null && != entriesCount`
is also the correct test for "is a promo running". The deck now mirrors the tier chooser: strike
above, boosted number below. Verified live: 15→75, 40→200, 100→500 in both places.

**Package icon medallions** were added to the deck at the same time, centred on each card's TOP
EDGE. They are a **sibling of the `<button>`, not a child** — the button is `overflow-hidden`
(it clips the gloss and sheen layers), so a child would have the straddling half cut off. They
carry `pointer-events-none` (never steal the card's click) and `aria-hidden` (the button's
`aria-label` already names the tier; the icon is decoration, not a second label). Card top
padding went `pt-[22px]` → `pt-[30px]` to clear them. Icons come from the shared
`getPackageIcon(plan.id)` helper, same source the tier cards use — don't add a second mapping.

## `SheetShell` at `z-[120]` rendered UNDER the Cobber launcher (2026-08-12)

[`SheetShell`](../../src/components/ui/SheetShell.tsx) documented its z as "above the nav +
floating chrome but below the payment/modal layer" — but the value was `z-[120]`, and the Cobber
chat launcher ([`ChatBubbleButton`](../../src/components/support-chat/ChatBubbleButton.tsx)) docks
at `Z_INDEX.MODAL_BASE - 1000` = **9000**. The comment and the number disagreed by two orders of
magnitude.

It never showed, because every SheetShell caller until now lived on `/my-account`, where
`SupportChatWidgetMount` **suppresses the launcher** (the dashboard "Ask Cobber" card is the
canonical entry point there). The first public-route SheetShell — the `/mini-draws` filter, sort,
quick-enter, catalogue and pack-detail sheets — put the robot straight over the sheet footer,
covering the primary CTA.

Fixed by raising the overlay to `z-[9500]`: above every floating control, still below
`Z_INDEX.MODAL_BASE` (10000) and `TOAST_LOADING` (99999, the `PaymentProcessingScreen` overlay
that a pack purchase opens *on top of* the sheet). The lesson generalises — **a z-index chosen
against the surfaces you can see today is untested against the ones you can't**; if a comment
claims an ordering, the number has to be checkable against the constants in
[`z-index.ts`](../../src/constants/z-index.ts).

Related: a bottom-anchored **non-modal** bar (the mini-draw sticky "Enter draw" bar) must NOT
climb above the launcher — it opts into `data-floating-widget` instead, and
[`useDodgeFloatingObstacles`](../../src/components/support-chat/useDodgeFloatingObstacles.ts)
lifts Cobber clear of it. Modal → out-rank it; persistent chrome → dodge it.

## A hover-opened dropdown must not close on the trigger's own click (2026-08-12)

The header's three desktop dropdowns (Giveaways / Results / Explore) open on hover **and** on
click. The trigger's handler was a plain toggle:

```tsx
onClick={() => setIsGiveawaysMenuOpen(!isGiveawaysMenuOpen)}
```

With hover-to-open added on top, that reads the wrong intent. The pointer opens the panel; the
user then clicks the trigger they are already hovering; `isOpen` is already `true`, so the toggle
**collapses the menu under the cursor**. Every pointer user hits this — the only way to keep the
menu was to never click the thing that looks clickable.

Fixed with an ownership ref rather than by removing the toggle. `openOnHover` records which menu
hover opened (`hoverOpenedMenu`); `toggleFromClick` absorbs the first click on a hover-opened menu
and hands ownership to click, so the *second* click closes it normally. Keyboard (Enter) and touch
never set the ref — `openOnHover` returns early without `(hover: hover) and (pointer: fine)` — so
both keep toggling in each direction. Moving the pointer away still closes it via the existing
140ms `closeOnHover` delay.

**The general rule: when a surface can be opened two ways, "toggle" is not a safe default for
either.** A click must mean "open" or "keep", never "undo what hover just did" — decide from what
opened it, not from the boolean alone.

## Three tiers paint a DIFFERENT tier's colour — remap in one place (2026-08-21)

Membership Tradie renders the one-time Foreman scheme (electric cyan), one-time Boss
renders the membership Foreman scheme (DeWalt yellow), and membership Boss renders the
one-time Power scheme (electric red). Deliberate art direction, so no two adjacent cards
in either tab repeat a colour.

`getRemappedPackageScheme(planId, isMembershipTab)` in `packageCardSurface.ts` is the one
place that knows this. **Import it rather than calling a scheme getter directly.**

Anything that skipped the remap drifted. The header's `MembershipBadge` called
`getMembershipSectionColorScheme` and rendered membership Tradie as `#5ca9ec` while its own
card rendered `#00E5FF` — and because that function returns the **same** value for
`tradie-subscription` and `tradie-pack`, the badge read as the one-time pack's colour to
anyone comparing them.

> It returns a whole **scheme**, not just an accent, and that distinction is load-bearing:
> the badge paints `badgeStyle.background` and falls back to the accent only when that is
> absent. A first fix remapped only `accentHex` and left the badge **filled from one tier
> and outlined from another** — visibly unchanged, because the fill is what you see.
> Verified by reading the computed background back, not by reasoning about the code.
