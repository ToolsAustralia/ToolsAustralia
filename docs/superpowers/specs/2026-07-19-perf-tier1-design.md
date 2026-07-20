# Perf Tier-1 Design — kill the client-side lag root causes

**Date:** 2026-07-19 · **Author:** Claude (approved by DJ) · **Source:** 2026-07-17 performance audit (43-agent verified; report archived in session scratchpad `perf-audit-report.md`)

## Problem

toolsaustralia.com.au is laggy on low/mid-end devices. Verified root causes (all client-side; Vercel Pro/CPU is NOT the problem — TTFB is 0.3–0.5 s and the CPU ceiling on Pro/Enterprise is Performance 4 GB/2 vCPU anyway):

1. **Payment stack for every guest** — all 8 `<MembershipModal>` call sites render the `dynamic()` modal unconditionally, so its ~7,200-line chunk (+ `@stripe/react-stripe-js`, embla, react-zoom-pan-pinch, the `@/hooks/queries` barrel) downloads on every landing view, and a module-scope `getStripePromise()` in `MembershipModal/index.tsx` boots third-party js.stripe.com for 100 % of visitors.
2. **Zero HTML caching** — `export const dynamic = "force-dynamic"` in `src/app/layout.tsx` (+ a redundant one in `src/app/(site)/layout.tsx`) kills the ISR the promotions pages declare (`revalidate = 60`). Root constraint: the per-request CSP nonce. Production HTML confirms every inline script (incl. Next's 48 per-request RSC scripts) is nonced — so nonce-CSP and cached HTML are mutually exclusive.
3. **Double hero videos** — promo landing pages mount BOTH mobile + desktop `<video preload="auto" autoPlay>` (CSS-hidden only): 4–6.9 MB per view, ~half never displayed. Resolver emits MP4 only although WebM twins (35–60 % smaller) exist for drawn-tier clips. `ToolsetLandingPage` preloads the RAW hero image whose URL never matches the optimized `/_next/image` URL actually rendered.
4. **Third-party pile-up at hydration** — GTM + Meta + TikTok + Klaviyo + Contentsquare ≈ 539 KB gz / 1.75 MB raw all start at hydration.
5. **Member data overfetch + render fan-out** — `/api/users/[id]/my-account` returns unprojected `MiniDraw` docs (full `entries[]`, MB-scale) polled every 2 min globally; `/api/users/[id]` ships the near-full User doc (embedded again by my-account); `UserContext` value is un-memoized so every poll tick re-renders all ~39 consumers.

## Approved decisions (DJ, 2026-07-19)

- **CSP:** route-class split. Anonymous marketing routes (`/`, `/promotions/**`, `/winners`, `/draw-results`, `/terms`) get the **existing no-nonce CSP variant** (`'unsafe-inline'` in script-src — already defined at `csp.ts:30` and already shipped as next.config fallback). All other routes keep per-request nonce CSP unchanged. *(Deviation from "pure hash-based" accepted: Next's per-request RSC inline scripts cannot be hashed.)*
- **A/B:** drop the server-side `getServerVariantAssignment()` read on promo landing pages (reads cookies/session → blocks ISR). Client POST remains the authoritative assigner; only returning assigned visitors briefly see the default variant.
- **Tracking:** defer Contentsquare + Klaviyo to `lazyOnload`; GTM/Meta/TikTok untouched.
- **Guardrails:** domain-doc gotchas + CLAUDE.md perf-footguns bullet + ESLint `no-eager-stripe` + tsx projection test. No CI bundle-budget step.
- **Branching:** ONE branch `feature/perf-tier1` in worktree `.worktrees/perf-tier1`, **created from fresh `origin/main`** (DJ requirement — main is 23 commits ahead of the audit worktree, incl. the user-dashboard-revamp which touched my-account pages). Five phased commits in risk order; one PR.
- **Testing gate (DJ requirement):** every phase carries its own verification; before merge, an end-to-end pass on a preview deploy must cover a full membership purchase and Meta/TikTok/Klaviyo event delivery. Nothing ships on type-check alone.

## Design

### Phase 1 — Lazy payment stack
New `src/components/modals/MembershipModal/LazyMembershipModal.tsx`: holds the `dynamic()` import, renders `null` until first `isOpen`, stays mounted after (close animation + internal state preserved). All 8 call sites replace their local `const MembershipModal = dynamic(...)` block with a static import of the wrapper (JSX tag/props unchanged). `src/lib/stripe-client.ts` switches to `@stripe/stripe-js/pure` (no script injection on import; verified present in v7.9.0); the module-scope `getStripePromise()` in `MembershipModal/index.tsx` moves into the component (`useMemo`). Barrel imports (`@/hooks/queries`) inside the modal chunk narrowed to specific modules. Deep-links (`useMembershipModalDeepLink`, Klaviyo resume URLs) unaffected — they open via `isOpen` state which mounts the wrapper.

### Phase 2 — Media
`PromoHero`: after mount, render only the viewport-matching `<video>` (SSR renders neither — visually identical: the clips open on a white frame today). `landing-video-resolver` emits `{src, type}` pairs, WebM before MP4 per clip (browser advances past 404s — the existing fallback mechanism); generate missing WebM twins with the existing convert script/ffmpeg. `ToolsetLandingPage`: remove raw-file preloads on video slugs; still slugs preload the optimized URL via `getImageProps()`. Homepage `Hero` + `/promotions` featured hero: media-scoped preloads per viewport (phones stop preloading hidden desktop art; mobile LCP bg becomes preloaded). `PrizeShowcase` gets `priorityFirstSlide` prop — false on homepage (below fold), true on promotions.

### Phase 3 — Member data + context
New `src/utils/dashboard/my-account-projection.ts` exporting explicit field lists for the my-account route's MiniDraw/Order/User queries (MiniDraw excludes `entries`/`winner` — mirrors the sibling list route). **Precondition step: grep every consumer of `accountData`/`userData` on the NEW worktree (streak feature landed on main) before finalizing the User include list.** UserProvider scopes the 2-min `refetchInterval` to `/my-account` routes via `usePathname()`. `UserContext` value memoized (`useMemo` + `useCallback`); `useUserMembership`/`useUserStats` return memoized objects; same one-liner for `CartContext`. tsx test asserts the projection excludes `entries`.

### Phase 4 — Third-party defer
`layout.tsx` Contentsquare `<Script>` and `KlaviyoScriptLoader`'s `<Script>`: `afterInteractive` → `lazyOnload`. Klaviyo's queue proxy keeps buffering early `klaviyo.push` calls — delivery is delayed, not lost.

### Phase 5 — CSP split + ISR (last, riskiest)
`middleware.ts`: `isStaticMarketingRoute(pathname)` → skip nonce, set `buildSecurityHeaders()` (no-nonce variant), no `x-nonce` header. Remove both `force-dynamic` exports; add `revalidate` (homepage 300, winners 300, draw-results 300; promotions already 60). Remove the `getServerVariantAssignment` call in `ToolsetLandingPage`. Banner-text endpoint → `public, s-maxage=60, stale-while-revalidate=120` (+ client hook drops `cache:"no-store"`).
**Empirical gate:** whether `getNonce()`'s `headers()` call (inside try/catch) still forces dynamic rendering in Next 15.5 is undetermined — first step is a local `next build` route-table check. If marketing routes still render dynamic → **Path B**: root layout goes nonce-free; fixed inline snippets (theme, tier, GTM init, Klaviyo proxy) are extracted to constants, their sha256 hashes added to the **nonce** CSP variant (same pattern as the two existing Next hashes at `csp.ts:29`), GTM/Klaviyo refactored to fixed-inline + external-src form, and a tsx test recomputes the hashes from the constants so drift fails CI.

### Docs & guardrails
Domain docs updated in the same phases: `payment`, `shared-ui`, `promo`, `tracking`, `client-state`, `auth`, `dashboard-account`, `security-csp` (architecture + rules rewrite for the route-class CSP model), each with gotchas entries. CLAUDE.md gains a "Performance footguns" conventions bullet (no unconditional `dynamic()` modal renders; no module-scope Stripe boot; list endpoints must project; viewport-correct `priority`; tier/reduced-motion gates on always-on animations; justify landing-path polling). ESLint `no-eager-stripe` registered alongside `norm-must-import-service`. Manifest gains the new file paths (payment + shared-ui domains).

## Non-goals (Tier 2+, separate work)
Animation fixes (`.fire` repaint, UrgencyClockIcon, marquee gates, backdrop-blur token bypasses, width-only device tier), `/api/major-draw` dual-key polling, promo-config poll consolidation, winners double-fetch, prize-catalog code-split, support-chat lazy bubble, LazyMotion migration, font cleanup (`font-['Poppins']` codemod).

## Success criteria
- Homepage first-party JS ≤ ~400 KB gz (from 633 KB); js.stripe.com absent from guest landing waterfalls.
- `/promotions/milwaukee`: exactly one hero video downloads; WebM served to Chrome/Android.
- `X-Vercel-Cache: HIT` on second request to marketing routes; TTFB ≤ ~100 ms cached.
- my-account payload for the seeded member drops >10× when draws have participants; no missing-field regressions on /my-account (incl. streak UI).
- Meta/TikTok test events received; Klaviyo events delivered; full test purchase succeeds on preview.
- Zero CSP console errors on marketing + checkout + admin routes.
