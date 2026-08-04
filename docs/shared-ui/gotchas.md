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

## Promotions right-corner FABs dodge the "Enter Now" bar (2026-07-08)

On `/promotions`, the bottom-right floating controls now lift above the full-width floating **Enter Now** bar ([`FloatingGetEntriesButton`](../../src/components/sections/promo/FloatingGetEntriesButton.tsx)) when it scrolls in, and settle back when it's gone — the same collision-dodge the Cobber launcher uses, via `useDodgeFloatingObstacles("right", enabled)` ([hook](../../src/components/support-chat/useDodgeFloatingObstacles.ts)) applied as an inline `bottom` with a `transition-[bottom]`. It's wired in **two** places because the two audiences are mutually exclusive: **guests** → [`PromotionsGuestThemeToggle`](../../src/components/ui/ThemeToggle.tsx) (sun only, `bottom-4`); **authenticated** → [`PromotionsAccountButton`](../../src/components/sections/promo/PromotionsAccountButton.tsx) (one stack = sun toggle **+** account button, `bottom-16`/`sm:bottom-4`). The Enter Now bar carries `data-floating-widget`, so it's the obstacle; the hook only lifts for obstacles that reach the right corner (full-width bars), not narrow centered ones. The dodge hook is generic geometry (not chat-specific) despite living under `support-chat/` — reused as-is rather than relocated.

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
[dashboard-account/gotchas.md](../dashboard-account/gotchas.md)). It is fixed **only for the
account layout** so far, via `overflow-x: clip` — which clips exactly the same way but creates
no scroll container.

**Before adding a `sticky` element anywhere else**, check it actually sticks; if not, this is
almost certainly why, and the fix is `clip` on the offending ancestor rather than anything on
the element. Changing the global base rule would fix every route at once — worth doing
deliberately, weighing that `clip` also forbids programmatic horizontal scrolling.

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
