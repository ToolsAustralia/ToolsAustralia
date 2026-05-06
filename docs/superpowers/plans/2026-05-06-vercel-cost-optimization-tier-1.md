# Vercel Cost Optimization — Tier 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce projected Vercel infrastructure cost from ~$80/cycle to ~$40/cycle **and improve page speed / Core Web Vitals** by applying nine zero-to-low-risk optimizations that align with current Next.js 15 + Vercel e-commerce best practices.

**Architecture:** This is config + small surgical edits across nine independent areas. No new features, no refactors. Each step is selected because it has either a positive or neutral effect on user-facing speed — there is no cost-reduction step here that trades speed for dollars. Each task ends with manual verification (type-check, lint, dev-server smoke). No commits without explicit user authorization (per `CLAUDE.md` no-auto-commit rule).

**Tech Stack:** Next.js 15.5.9 App Router, React 19, TanStack Query 5, NextAuth 4.24, Mongoose, Vercel Pro, `@vercel/speed-insights@1.2.0`, `@vercel/analytics@1.5.0`.

## Performance Impact Summary (the speed half of the goal)

| Step | Cost saved | User-facing speed impact |
|---|---|---|
| 1. SpeedInsights sampleRate | $20/cycle | Neutral (telemetry only) |
| 1B. Contentsquare → next/script `afterInteractive` | $0 | **+ FCP / LCP** — analytics no longer competes with critical-path render |
| 3. refetchIntervalInBackground: false | $3–7/cycle | **+ device CPU/battery** for users with multiple tabs open; on-focus refresh covers freshness |
| 4. NextAuth 5→15min refetch | $1/cycle | Neutral |
| 5. Winners cache + DB limit | $1–3/cycle | **+ TTFB** — second hit returns from edge cache (~50ms vs ~500ms cold) |
| 6a. Image `minimumCacheTTL` 30 days | (in $2–4) | **+ image stability** — fewer revalidations, more cache hits |
| 6b. `optimizePackageImports` | (in $2–4) | **+ JS bundle size** — `lucide-react` and `date-fns` are barrel-imported across the app; tree-shaking commonly cuts those bundles 20–50% |
| 6c. `staleTimes` (dynamic: 30, static: 180) | (in $2–4) | **+ navigation feel** — restores client router cache that Next 15 reset to 0s |
| 7. Middleware matcher | $1–3/cycle | **+ static-asset TTFB** — no JWT decode + nonce gen on `/sitemap.xml`, `/images/**`, fonts, etc. |
| 8. Functions memory right-size | $1.5/cycle | Neutral (warm path) / slight cold-start regression possible — monitor logs |
| 9. Bot Filtering | $1–2/cycle | Neutral |

**Net direction: every step is cost-down OR speed-up (or both); no step is speed-down for cost-down.**

## Why these and not others (best-practice scope)

The following Next.js 15 / Vercel performance best practices were considered and **deferred** to Tier 2 because they require larger, per-component or per-route surgery rather than surgical config edits:

- `next/image` `priority` audit (30+ uses; only the actual LCP element should have it)
- `next/image` explicit `sizes` attribute on the ~45% of `<Image>` instances missing it
- Replace remaining raw `<img>` in [PromoBanner.tsx:889](../../src/components/sections/promo/PromoBanner.tsx#L889) hot path
- Add `loading.tsx` to hot route segments for streaming Suspense (currently only 2 routes have one)
- Add `error.tsx` for graceful error boundaries (currently 0)
- Add `generateStaticParams` + `dynamicParams = false` to `/shop/[slug]` and `/mini-draws/[id]` (10K crawlable URLs)
- Cloudinary loader to bypass `/_next/image` for already-optimized URLs
- Modernize `<meta name="viewport">` → `export const viewport` (cosmetic — no perf change)
- Remove `force-dynamic` from layouts (structural fix, biggest savings; deferred — needs nonce strategy that respects CSP rule R1)

---

## Findings Discovered While Reading Docs (corrections to original audit)

These were caught **before** code was changed by reading `docs/<domain>/` and `.claude/hooks/`:

1. **The duplicate `membership-daily-snapshot` cron is INTENTIONAL** — `docs/infrastructure/architecture.md:46-48` documents: *"Idempotent upsert; the second fire is a no-op for redundancy."* The 14:00 + 15:00 schedule is a designed safety net (if the first fire fails on a Vercel/DB blip, the second one catches it). **Original audit Step 2 (delete the 15:00 entry) is REMOVED from this plan.** Cost of redundancy is ~$0.30/cycle — fully worth keeping.

2. **Middleware changes require QA review** — `docs/security-csp/rules.md` Rule R6: *"Mandatory QA review for security/auth changes. Always."* Step 7 (middleware matcher tightening) qualifies. The user is the QA reviewer here; the plan calls this out explicitly so it isn't applied silently.

3. **`docs/security-csp/rules.md` Rule R1 forbids `unsafe-inline`** in CSP. This rules out one of the three options I considered for the deferred Step 10 (force-dynamic removal) — Option A "drop nonce, accept unsafe-inline" violates R1 and is therefore off the table. Tier 2 must use Option B (per-route nonce) or Option C (script hashes + external files).

4. **Orphan-file domain mappings revised**:
   - `src/app/layout.tsx` → **`tracking`** domain (not `shared-ui`). The layout's primary responsibility is mounting analytics/tracking components; the SpeedInsights edit IS a tracking-domain change.
   - `src/app/providers.tsx` → **`client-state`** domain. Wires TanStack Query, NextAuth SessionProvider, Contexts.

5. **Doc-sync hook (`.claude/hooks/doc-sync.mjs`) requires that ANY file in the matching domain's `docs/<domain>/` is also changed in the same git working tree** — auto-clears `.touched-files` and bumps `lastVerified` automatically when all is fresh. Trivia detection exempts comments/whitespace/import-only edits. Substantive edits (like adding `sampleRate={0.1}`) trigger the requirement.

---

## Source-of-Truth Findings (verified by reading actual files)

- `src/middleware.ts:14` generates a per-request CSP nonce in production — combined with `force-dynamic` at `src/app/layout.tsx:72` and `src/app/(site)/layout.tsx:8`, this opts every page out of static caching. Confirmed by Vercel `ISR Writes = 3` over 17 days.
- `src/app/api/winners/all/route.ts:38, 107` runs `Winner.find({...}).sort(...).populate(...).lean()` with **no `.limit()`** — pulls all winners then JS-sorts and slices.
- `package.json:96` confirms `@vercel/speed-insights@^1.2.0` supports `sampleRate` prop.
- `src/components/ui/TopLoadingBar.tsx:59-65` already wraps `useSearchParams` in `<Suspense>` — so the comment in `src/app/(site)/layout.tsx:7` ("Mark layout as dynamic to prevent static generation issues with useSearchParams") is likely obsolete. Step 10 (remove force-dynamic) is feasible but **deferred** to Tier 2 — keeping Tier 1 surgical.
- `public/images/Tools Australia Logo/Tools Australia Logo.psd` is **4.3 MB** and tracked in git. Mentioned for awareness; deletion is **not** part of Tier 1 (doesn't directly affect billing).

## Cost Targets

Partial cycle (Apr 19 – May 5, 17/30 days): $46.26 infra. Projected full cycle: ~$80.
Tier 1 target savings: **$30–$45/cycle** (37–56% of infra).

| Step | Estimated savings | Risk | Speed effect |
|---|---|---|---|
| 1. SpeedInsights sampleRate | ~$20 | None | Neutral |
| 1B. Contentsquare → next/script | $0 | None | + FCP/LCP |
| 2. *(removed — was duplicate cron, but it's intentional redundancy)* | — | — | — |
| 3. refetchIntervalInBackground | ~$3–7 | Low | + device CPU |
| 4. NextAuth interval 5→15min | ~$1 | Low | Neutral |
| 5. Winners cache + DB limit | ~$1–3 | Low | + TTFB |
| 6. next.config.ts (3 changes) | ~$2–4 | Low | + bundle / nav / image cache |
| 7. Middleware matcher | ~$1–3 | Low–Med (security review required) | + static-asset TTFB |
| 8. Functions memory block | ~$1.5 | Low–Med | Neutral / cold-start watch |
| 9. Bot filtering (dashboard) | ~$1–2 | None | Neutral |

---

## Files Touched

| File | Tasks | Domain (per Domain Manifest) |
|---|---|---|
| `src/app/layout.tsx` | T1, T1B | **`tracking`** (after T-DOC adds it to the manifest) |
| `src/hooks/queries/usePromoQueries.ts` | T3 | `client-state` |
| `src/hooks/queries/usePromoBannerTextQueries.ts` | T3 | `client-state` |
| `src/hooks/queries/useAlternatingMultiplierQueries.ts` | T3 | `client-state` |
| `src/hooks/queries/useMajorDrawQueries.ts` | T3 | `client-state` |
| `src/hooks/queries/useUserQueries.ts` | T3 | `client-state` |
| `src/app/providers.tsx` | T4 | **`client-state`** (after T-DOC adds it to the manifest) |
| `src/app/api/winners/all/route.ts` | T5 | `draws` |
| `next.config.ts` | T6 | `security-csp` |
| `src/middleware.ts` | T7 | `security-csp` |
| `vercel.json` | T8 | `infrastructure` |
| Vercel dashboard | T9 | (no code change) |

**Important:** T-DOC.0 (manifest updates) **must run BEFORE** T1, T3, T4 — otherwise the doc-sync hook will treat `layout.tsx` and `providers.tsx` as orphans and block.

---

## Task DOC.0 — Manifest updates (RUN FIRST, before code edits)

**File:** `CLAUDE.md` (worktree copy)

- [ ] **Step DOC.0.1 — Add `src/app/layout.tsx` to `tracking` domain**

In `CLAUDE.md` Domain Manifest JSON block, find the `tracking` domain's `paths` array. Add `"src/app/layout.tsx"` as a new entry. The block currently includes `"src/components/FacebookPixel.tsx"`, etc.

- [ ] **Step DOC.0.2 — Add `src/app/providers.tsx` to `client-state` domain**

In the same manifest, find `client-state.paths`. Add `"src/app/providers.tsx"` as a new entry.

- [ ] **Step DOC.0.3 — Sanity check the manifest**

Run: `node -e "const fs=require('fs'); const c=fs.readFileSync('CLAUDE.md','utf8'); const m=c.match(/<!-- DOMAIN-MANIFEST-START -->[\s\S]+?\`\`\`json\n([\s\S]+?)\n\`\`\`/); JSON.parse(m[1]); console.log('manifest valid')"`
Expected: prints `manifest valid`.

- [ ] **Step DOC.0.4 — Stop checkpoint**

Show diff. Ask: "Manifest updated. Ready to start Step 1?"

---

## Task 1 — Speed Insights sample rate

**Files:**
- Modify: `src/app/layout.tsx:136`

- [ ] **Step 1.1 — Edit the SpeedInsights component**

Change line 136 from:
```tsx
<SpeedInsights />
```
to:
```tsx
<SpeedInsights sampleRate={0.1} />
```

- [ ] **Step 1.2 — Type-check**

Run: `npm run type-check`
Expected: Exits 0 with no errors.

- [ ] **Step 1.3 — Update tracking doc** (required to satisfy doc-sync hook)

Append to `docs/tracking/architecture.md` (under a new `## Observability sampling` section):

```markdown
## Observability sampling

Speed Insights mounted globally in [`src/app/layout.tsx`](../../src/app/layout.tsx) with `sampleRate={0.1}` — beacons 10% of page views. Sufficient for stable Core Web Vitals trends; reduces Vercel Speed Insights data-point billing roughly 10×. Vercel Web Analytics (`<Analytics />`) is currently unsampled — see `docs/superpowers/plans/2026-05-06-vercel-cost-optimization-tier-1.md` for follow-up.
```

- [ ] **Step 1.4 — Stop checkpoint**

No commit. Show diff. Ask: "Step 1 done. Ready for Step 1B?"

---

## Task 1B — Contentsquare via `next/script` (FCP / LCP win)

**Why:** [src/app/layout.tsx:111](../../src/app/layout.tsx#L111) currently injects Contentsquare via a raw `<script src="..." async />` in `<head>`. With `async`, the browser still pauses HTML parsing when the script executes. Switching to Next.js `<Script strategy="afterInteractive">` defers execution until after Next is hydrated/interactive, which removes Contentsquare from the critical render path. UX-analytics products like Contentsquare don't need to capture pre-interactive moments — `afterInteractive` is what their own integration docs recommend for Next.js. Klaviyo and GTM in this codebase already use `next/script`; this aligns Contentsquare with that pattern.

**Files:**
- Modify: `src/app/layout.tsx` (add import; replace lines 110-111)

- [ ] **Step 1B.1 — Add `Script` import**

In `src/app/layout.tsx`, add this import alongside the other top-level imports (after the `SpeedInsights` import on line 12):
```tsx
import Script from "next/script";
```

- [ ] **Step 1B.2 — Replace the raw `<script>` tag**

In `src/app/layout.tsx`, replace lines 110-111:
```tsx
        {/* Contentsquare UX analytics - load in head for accurate tracking */}
        <script src="https://t.contentsquare.net/uxa/80b94ffdd640f.js" async />
```
with:
```tsx
        {/* Contentsquare UX analytics — afterInteractive defers until Next is hydrated, removing it from the critical render path */}
        <Script
          src="https://t.contentsquare.net/uxa/80b94ffdd640f.js"
          strategy="afterInteractive"
          nonce={nonce}
        />
```

The `nonce={nonce}` keeps the script CSP-compliant (the nonce is already computed at line 81). The CSP `script-src` directive in [csp.ts:29](../../src/utils/security/csp.ts#L29) already allowlists `https://t.contentsquare.net`, so no CSP change is required.

- [ ] **Step 1B.3 — Type-check**

Run: `npm run type-check`
Expected: Exits 0.

- [ ] **Step 1B.4 — Dev-server smoke test**

Run: `npm run dev` (background).
Open `http://localhost:3000/` in Chrome. Open DevTools → Network → filter `contentsquare`.
Expected: Contentsquare script loads (status 200 from `t.contentsquare.net`) shortly after page becomes interactive — not before. Confirm no CSP violations in DevTools Console.
Stop the dev server.

- [ ] **Step 1B.5 — Update tracking doc**

Append to the `## Observability sampling` section in `docs/tracking/architecture.md` (added in Step 1.3):

```markdown
Contentsquare UX analytics is loaded via `next/script` with `strategy="afterInteractive"` from [`src/app/layout.tsx`](../../src/app/layout.tsx) — defers execution until after Next is hydrated so it never blocks LCP or competes with the critical render path. Klaviyo and GTM also use `next/script` (`KlaviyoScriptLoader.tsx`, `GoogleTagManager.tsx`).
```

- [ ] **Step 1B.6 — Stop checkpoint**

No commit. Show diff. Ask: "Step 1B done. Ready for Step 3?"

---

## Task 3 — Disable background polling on global hooks

**Files:**
- Modify: `src/hooks/queries/usePromoQueries.ts` (lines ~101, ~111, ~181)
- Modify: `src/hooks/queries/usePromoBannerTextQueries.ts` (~28)
- Modify: `src/hooks/queries/useAlternatingMultiplierQueries.ts` (~31)
- Modify: `src/hooks/queries/useMajorDrawQueries.ts` (~171, ~210)
- Modify: `src/hooks/queries/useUserQueries.ts` (~155, ~169)

- [ ] **Step 3.1 — usePromoQueries.ts**

In `useActivePromos` (around line 95-103), `useAdminActivePromos` (around 105-113), and `useEffectiveForBanner` (around 175-185): change every `refetchIntervalInBackground: true` to `refetchIntervalInBackground: false`.

- [ ] **Step 3.2 — usePromoBannerTextQueries.ts**

Read the file. Find the `refetchIntervalInBackground: true` line and flip to `false`.

- [ ] **Step 3.3 — useAlternatingMultiplierQueries.ts**

Same pattern. Flip to `false`.

- [ ] **Step 3.4 — useMajorDrawQueries.ts**

In `useCurrentMajorDraw` (~143-173) and `useUserMajorDrawStats` (~190-213): flip both `refetchIntervalInBackground: true` to `false`.

- [ ] **Step 3.5 — useUserQueries.ts**

In `useMyAccountData` and `useUserDashboard`: flip `refetchIntervalInBackground: true` to `false`.

- [ ] **Step 3.6 — Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: Both exit 0.

- [ ] **Step 3.7 — Dev-server smoke test**

Run: `npm run dev` (background).
Open `http://localhost:3000/` in Chrome.
Open DevTools → Network tab → filter `/api/promo` and `/api/major-draw`.
Switch to a different browser tab. Wait 90 seconds.
Expected: No `/api/promo/*` or `/api/major-draw` requests fire while the tab is hidden.
Switch back to the tab.
Expected: Requests resume immediately on focus (because `refetchOnWindowFocus: true` is set on these hooks).
Stop the dev server.

- [ ] **Step 3.8 — Update client-state doc**

Append to `docs/client-state/architecture.md` (under a new `## Polling intervals` section):

```markdown
## Polling intervals

Hooks under [`src/hooks/queries/`](../../src/hooks/queries/) that opt into `refetchInterval` use `refetchIntervalInBackground: false` so polling pauses for hidden tabs and resumes on focus (via `refetchOnWindowFocus: true`). This applies to: `usePromoQueries`, `usePromoBannerTextQueries`, `useAlternatingMultiplierQueries`, `useMajorDrawQueries`, `useUserQueries`. Background polling on hidden tabs would inflate Edge Requests + Function Invocations without user-visible benefit.
```

- [ ] **Step 3.9 — Stop checkpoint**

No commit. Show diff. Ask: "Step 3 done. Ready for Step 4?"

---

## Task 4 — Reduce NextAuth session refetch interval

**Files:**
- Modify: `src/app/providers.tsx:88`

- [ ] **Step 4.1 — Edit SessionProvider interval**

Change line 88 from:
```tsx
<SessionProvider refetchOnWindowFocus={false} refetchInterval={5 * 60}>
```
to:
```tsx
<SessionProvider refetchOnWindowFocus={false} refetchInterval={15 * 60}>
```

- [ ] **Step 4.2 — Type-check**

Run: `npm run type-check`
Expected: Exits 0.

- [ ] **Step 4.3 — Update client-state doc**

Append to the `## Polling intervals` section added in Step 3.8 (or create it if Step 3 was skipped):

```markdown
NextAuth `<SessionProvider>` in [`src/app/providers.tsx`](../../src/app/providers.tsx) uses `refetchInterval={15 * 60}` (15 min). Refresh-on-focus is intentionally disabled (`refetchOnWindowFocus={false}`); 15-min server poll bounds the worst-case stale-session UI window without flooding `/api/auth/session` invocations.
```

- [ ] **Step 4.4 — Stop checkpoint**

No commit. Show diff. Ask: "Step 4 done. Ready for Step 5?"

---

## Task 5 — Cache + DB limit on `/api/winners/all`

**Files:**
- Modify: `src/app/api/winners/all/route.ts` (top of file + lines 38, 107, ~172)

- [ ] **Step 5.1 — Add `revalidate` segment config**

Insert at the top of the file, after the imports (before line 14 `void User`):
```ts
export const revalidate = 300;
```

- [ ] **Step 5.2 — Add `.limit(limit)` to major-draw query**

At line 38-46, change:
```ts
      const majorDrawWinners = await Winner.find({ drawType: "major" })
        .sort({ selectedDate: -1 })
        .populate("userId", "firstName lastName state")
        .populate({
          path: "drawId",
          model: "MajorDraw",
          select: "name prize drawDate",
        })
        .lean();
```
to:
```ts
      const majorDrawWinners = await Winner.find({ drawType: "major" })
        .sort({ selectedDate: -1 })
        .limit(limit)
        .populate("userId", "firstName lastName state")
        .populate({
          path: "drawId",
          model: "MajorDraw",
          select: "name prize drawDate",
        })
        .lean();
```

**Correctness reasoning:** Each branch is sorted by `selectedDate` desc. The merged top `limit` cannot contain more than `limit` from any single branch. So `.limit(limit)` per branch is sufficient.

- [ ] **Step 5.3 — Add `.limit(limit)` to mini-draw query**

At line 107-110, change:
```ts
      const miniDrawWinners = await Winner.find({ drawType: "mini" })
        .sort({ selectedDate: -1 })
        .populate("userId", "firstName lastName state")
        .lean();
```
to:
```ts
      const miniDrawWinners = await Winner.find({ drawType: "mini" })
        .sort({ selectedDate: -1 })
        .limit(limit)
        .populate("userId", "firstName lastName state")
        .lean();
```

- [ ] **Step 5.4 — Add Cache-Control header on success response**

At line ~172, change:
```ts
    return NextResponse.json({
      success: true,
      winners: limitedWinners,
    });
```
to:
```ts
    return NextResponse.json(
      {
        success: true,
        winners: limitedWinners,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
```

- [ ] **Step 5.5 — Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: Both exit 0.

- [ ] **Step 5.6 — Functional verify on dev**

Run: `npm run dev` (background).
Hit `http://localhost:3000/api/winners/all?limit=5` → expect JSON with up to 5 winners.
Hit `http://localhost:3000/api/winners/all?limit=20` → expect up to 20 winners, dates sorted desc.
Hit `http://localhost:3000/api/winners/all?drawType=major&limit=10` → expect only major draws.
Confirm response includes header `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`.
Stop the dev server.

- [ ] **Step 5.7 — Update draws doc**

In `docs/draws/api.md`, replace the `/api/winners/**` TODO row with concrete details. Find the table row currently reading:
```
| _TODO_ | `/api/winners/**` | Public winners feed |
```
Replace with:
```
| GET | `/api/winners/all` | Public winners feed (major + mini, optional `?drawType=` filter, `?limit=` default 20). Edge-cached 5min via `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`; `revalidate = 300` segment config. DB queries are pre-`.limit()`ed. |
| GET | `/api/winners/major-draws` | Major-draw winners only (already DB-limited; no edge cache). |
| GET | `/api/winners/latest` | Latest single winner (cached `revalidate=60`). |
```

- [ ] **Step 5.8 — Stop checkpoint**

No commit. Show diff. Ask: "Step 5 done. Ready for Step 6?"

---

## Task 6 — `next.config.ts` (image config + optimizePackageImports + staleTimes)

**Files:**
- Modify: `next.config.ts:34-97` (the `nextConfig` object)

- [ ] **Step 6.1 — Replace the `images` block**

Locate `images: { ... }` in `next.config.ts` (currently lines 44-48). Replace with:
```ts
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 2_592_000,
    deviceSizes: [640, 750, 828, 1080, 1280, 1920, 2048],
    imageSizes: [16, 32, 64, 128, 256, 384],
    remotePatterns: [
      { protocol: "http" as const, hostname: "localhost" },
      ...imageRemotePatterns,
    ],
  },
```

Note: This removes the deprecated `domains` field. `remotePatterns` covers it. Localhost is added defensively for dev.

- [ ] **Step 6.2 — Remove now-unused `imageDomains` variable**

In the top of `next.config.ts`, delete the `imageDomains` declaration at line 11:
```ts
const imageDomains = allowedImageHosts.filter((host) => !host.includes("*") && host.length > 0);
```
Keep `imageRemotePatterns` (lines 12-15).

- [ ] **Step 6.3 — Add `experimental` config block**

Insert this block right after the `images: { ... }` block in `nextConfig`:
```ts
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns", "date-fns-tz"],
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
```

- [ ] **Step 6.4 — Build smoke test**

Run: `npm run build`
Expected: Build succeeds. Watch for any new warnings about `experimental` keys.

If build fails because `experimental.staleTimes` is not recognized in 15.5.9, remove just that key (keep `optimizePackageImports`) and continue. (`staleTimes` was added in 14.2 and remains in `experimental` in 15.x — should be supported.)

- [ ] **Step 6.5 — Dev-server smoke test**

Run: `npm run dev` (background).
Open `http://localhost:3000/`. Confirm page renders.
In DevTools Network tab, click on a Next.js-optimized image (anything served from `/_next/image?url=...`).
Expected: Response includes header `Cache-Control: public, max-age=...` with a 30-day window.
Stop the dev server.

- [ ] **Step 6.6 — Update security-csp doc**

In `docs/security-csp/architecture.md`, append a new section:

```markdown
## next.config.ts — image + experimental settings

[`next.config.ts`](../../next.config.ts) configures, in addition to security headers:
- `images.minimumCacheTTL: 2_592_000` (30 days) so Image Optimization Cache writes don't churn at the 60s default.
- `images.deviceSizes` pruned to `[640, 750, 828, 1080, 1280, 1920, 2048]` (drops 1200, 3840 — defaults emit 8 sizes per image, which inflates transformation count and origin transfer).
- `images.imageSizes` pruned to `[16, 32, 64, 128, 256, 384]`.
- `experimental.optimizePackageImports: ["lucide-react", "date-fns", "date-fns-tz"]` — barrel-tree-shake heavy libraries.
- `experimental.staleTimes: { dynamic: 30, static: 180 }` — restores client-side router cache window (Next 15 reset the dynamic default to 0).

The deprecated `domains` field is removed; `remotePatterns` covers all hosts including `localhost` for dev.
```

- [ ] **Step 6.7 — Stop checkpoint**

No commit. Show diff. Ask: "Step 6 done. Ready for Step 7?"

---

## Task 7 — Tighten middleware matcher  ⚠ SECURITY CHANGE — QA REVIEW REQUIRED

**Per `docs/security-csp/rules.md` Rule R6: "Mandatory QA review for security/auth changes."** Do not proceed past Step 7.4 without explicit user review and approval.

**Files:**
- Modify: `src/middleware.ts:117-126`

- [ ] **Step 7.1 — Replace the matcher**

Change lines 117-126 from:
```ts
export const config = {
  // Match all routes to ensure CSP headers and nonce are set on every request
  // The auth checks inside middleware will still only apply to protected routes
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
```
to:
```ts
export const config = {
  // Match all page routes; exclude static assets so middleware doesn't run
  // (and incur JWT decode + CSP nonce generation) on bytes that don't need them.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|manifest\\.json|sw\\.js|icon\\.ico|apple-icon\\.png|\\.well-known/|images/|fonts/).*)",
    "/((?!.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|ttf|woff|woff2|otf|map|txt|xml|json)).*)",
  ],
};
```

- [ ] **Step 7.2 — Type-check**

Run: `npm run type-check`
Expected: Exits 0.

- [ ] **Step 7.3 — Functional verify on dev (CRITICAL — security path)**

Run: `npm run dev` (background).
Test each URL in a fresh incognito window:

| URL | Expected behavior |
|---|---|
| `http://localhost:3000/` | Homepage loads |
| `http://localhost:3000/winners` | Winners page loads |
| `http://localhost:3000/admin` (logged out) | Redirects to `/` (auth enforced) |
| `http://localhost:3000/my-account` (logged out) | Redirects to `/login` (auth enforced) |
| `http://localhost:3000/sitemap.xml` | Sitemap XML returned |
| `http://localhost:3000/robots.txt` | Robots.txt returned |
| `http://localhost:3000/manifest.json` | Manifest JSON returned |
| `http://localhost:3000/icon.ico` | Icon returned |
| `http://localhost:3000/apple-icon.png` | Icon returned |
| `http://localhost:3000/grand-draw.jpg` | Image returned (matched by extension exclusion) |
| `http://localhost:3000/images/Tools%20Australia%20Logo/Social%20Media%20Profile_Primary.webp` | Image returned |

**If ANY auth-protected URL fails to redirect (e.g. `/admin` loads while logged out): REVERT immediately and stop.**

Stop the dev server.

- [ ] **Step 7.4 — Update security-csp doc**

In `docs/security-csp/architecture.md`, find the `## Middleware matcher` section and update it. Replace existing content under that heading with:

```markdown
## Middleware matcher

Middleware runs on most page routes BUT excludes:
- `/api/**` — API routes (handler-level auth required, see R4)
- `/_next/static/**` and `/_next/image/**` — Next.js build artifacts and optimized images
- Static asset paths in `/public/`: `images/**`, `fonts/**`
- Common static files at root: `robots.txt`, `sitemap.xml`, `manifest.json`, `sw.js`, `favicon.ico`, `icon.ico`, `apple-icon.png`
- `/.well-known/**`
- Any URL ending in a static-asset file extension: `png|jpg|jpeg|gif|webp|avif|svg|ico|ttf|woff|woff2|otf|map|txt|xml|json`

Page routes (`/admin/`, `/login/`, `/my-account/`, etc.) → middleware gates auth.
API routes → handler-level auth checks required.

Excluding static asset paths from middleware avoids JWT decode + CSP nonce generation on bytes that don't need them — this is a meaningful Edge Requests / Edge Additional CPU cost reduction.
```

- [ ] **Step 7.5 — Stop checkpoint (REVIEW GATE)**

**This is a security change.** Show diff. Ask the user explicitly:

> "Step 7 (middleware matcher) is a security/auth change. Per `docs/security-csp/rules.md` R6, this requires QA review. The dev-smoke verify list passed locally, but I want explicit approval before continuing. Approve?"

Wait for approval. Do NOT proceed without it.

---

## Task 8 — `vercel.json` functions block (right-size memory)

**Files:**
- Modify: `vercel.json` (add `functions` block alongside existing `crons`)

**Note:** The existing `crons` array stays unchanged. The duplicate `membership-daily-snapshot` entry is **intentional redundancy** per `docs/infrastructure/architecture.md:46-48` — do not remove it.

- [ ] **Step 8.1 — Add `functions` block**

After the `crons` array in `vercel.json`, add a sibling `functions` object. Final file should be:
```json
{
  "crons": [
    {
      "path": "/api/cron/major-draw-transition",
      "schedule": "0 14 * * *"
    },
    {
      "path": "/api/cron/process-partner-discount-queues",
      "schedule": "0 15 * * *"
    },
    {
      "path": "/api/cron/ab-testing-experiments",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/cron/ab-testing-aggregate-metrics",
      "schedule": "0 3 * * *"
    },
    {
      "path": "/api/cron/sync-meta-spend-by-url",
      "schedule": "30 2 * * *"
    },
    {
      "path": "/api/cron/membership-daily-snapshot",
      "schedule": "0 14 * * *"
    },
    {
      "path": "/api/cron/membership-daily-snapshot",
      "schedule": "0 15 * * *"
    },
    {
      "path": "/api/cron/reconcile-blocked-transactions",
      "schedule": "15 3 * * *"
    }
  ],
  "functions": {
    "src/app/api/**/route.ts": { "memory": 512, "maxDuration": 10 },
    "src/app/api/stripe/webhook/route.ts": { "memory": 1024, "maxDuration": 30 },
    "src/app/api/upload/cloudinary/route.ts": { "memory": 1024, "maxDuration": 30 },
    "src/app/api/upload/route.ts": { "memory": 1024, "maxDuration": 30 },
    "src/app/api/admin/users/export/route.ts": { "memory": 1024, "maxDuration": 60 },
    "src/app/api/admin/major-draw/export/route.ts": { "memory": 1024, "maxDuration": 60 },
    "src/app/api/admin/major-draw/participants/route.ts": { "memory": 1024, "maxDuration": 60 },
    "src/app/api/admin/sync-klaviyo-profiles/route.ts": { "memory": 1024, "maxDuration": 300 },
    "src/app/api/admin/dashboard/recent-activities/route.ts": { "memory": 1024, "maxDuration": 60 },
    "src/app/api/admin/activity-log/route.ts": { "memory": 1024, "maxDuration": 60 },
    "src/app/api/cron/major-draw-transition/route.ts": { "memory": 1024, "maxDuration": 300 },
    "src/app/api/cron/process-partner-discount-queues/route.ts": { "memory": 1024, "maxDuration": 300 },
    "src/app/api/cron/ab-testing-aggregate-metrics/route.ts": { "memory": 1024, "maxDuration": 300 },
    "src/app/api/cron/milestone-rewards-issuance/route.ts": { "memory": 1024, "maxDuration": 300 },
    "src/app/api/cron/monthly-redeemables-issuance/route.ts": { "memory": 1024, "maxDuration": 300 },
    "src/app/api/cron/sync-meta-spend-by-url/route.ts": { "memory": 1024, "maxDuration": 300 },
    "src/app/api/cron/reconcile-blocked-transactions/route.ts": { "memory": 1024, "maxDuration": 300 },
    "src/app/api/admin/klaviyo/**/route.ts": { "memory": 1024, "maxDuration": 300 }
  }
}
```

- [ ] **Step 8.2 — JSON validate**

Run: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"`
Expected: Exits 0.

- [ ] **Step 8.3 — Update infrastructure doc**

In `docs/infrastructure/architecture.md`, append a new section after the existing `## Vercel cron schedules`:

```markdown
## Function memory configuration

[`vercel.json`](../../vercel.json) `functions` block right-sizes memory per route:

- **Default** (`src/app/api/**/route.ts`): `memory: 512MB, maxDuration: 10s` — covers light read-heavy GETs (the majority of the 289 routes).
- **Heavy I/O** (Stripe webhook, Cloudinary upload, admin exports/participants/sync, dashboard recent-activities, activity log): `memory: 1024MB, maxDuration: 30–60s`.
- **Crons** (every `/api/cron/*` plus `/api/admin/klaviyo/**`): `memory: 1024MB, maxDuration: 300s`.

Vercel scales CPU with memory, so 512MB is roughly half the CPU of 1024MB — fine for read-heavy GETs but watch Vercel logs for `FUNCTION_INVOCATION_FAILED` / `Allocation failed` after deploy. Bump individual routes to 1024MB if needed.
```

- [ ] **Step 8.4 — Stop checkpoint**

No commit. Show diff. Ask: "Step 8 done. Ready for Step 9?"

**Post-deploy monitoring (after the user deploys):** Watch Vercel dashboard → Logs → filter for `FUNCTION_INVOCATION_FAILED` / `Allocation failed` / `out of memory` for 24 hours. If any route fails at 512MB, add it to the `functions` block at 1024MB and redeploy.

---

## Task 9 — Vercel Bot Filtering (dashboard)

**No code changes.** This is a Vercel Project setting.

- [ ] **Step 9.1 — Hand off to user**

Tell the user: "Open Vercel Dashboard → this Project → Firewall → enable Bot Filtering. This is free on Pro plans and blocks known-bad crawlers from billable invocations. No code change required."

- [ ] **Step 9.2 — Confirm enabled**

Ask user to confirm they've toggled it. Move on.

---

## Task DOC.END — Final doc-sync verification

- [ ] **Step DOC.END.1 — Trigger doc-sync hook**

Verify all docs were updated for affected domains. If anything is missed, the Stop hook will block.

After all code edits, ensure each affected domain has at least one file edited under `docs/<domain>/`:

| Domain | File expected to change |
|---|---|
| `tracking` | `docs/tracking/architecture.md` (Step 1.3) |
| `client-state` | `docs/client-state/architecture.md` (Steps 3.8, 4.3) |
| `draws` | `docs/draws/api.md` (Step 5.7) |
| `security-csp` | `docs/security-csp/architecture.md` (Steps 6.6, 7.4) |
| `infrastructure` | `docs/infrastructure/architecture.md` (Step 8.3) |

- [ ] **Step DOC.END.2 — Stop checkpoint**

No commit. Ask user: "All docs synced. Ready to commit/PR? (Authorize via 'commit', 'push', 'merge', or 'create a PR'.)"

---

## Self-Review Checklist (verified before marking plan ready)

- [x] **Spec coverage:** All 9 numbered Tier 1 audit steps have either a Task or a documented removal. Step 2 (duplicate cron) was removed because docs/infrastructure/architecture.md explicitly documents it as intentional redundancy.
- [x] **Placeholder scan:** No "TBD", "TODO", "appropriate", "similar to..." — every code block is full and inline.
- [x] **Type consistency:** All variable names, file paths, and function signatures match what's actually in the codebase (verified by reads).
- [x] **No-auto-commit rule:** Every task ends with a "Stop checkpoint — no commit" step. The plan does not run `git commit` / `git push` / `gh pr create` anywhere. Plan obeys `CLAUDE.md` no-auto-commit hard rule.
- [x] **Doc-sync rule:** Every code-touching task includes a doc update step under `docs/<domain>/`. Manifest is updated FIRST (DOC.0) so orphan files are mapped before they're edited.
- [x] **Security review rule:** Step 7 (middleware) is flagged as security/auth per `docs/security-csp/rules.md` R6 and gated on explicit user approval.
- [x] **No CSP unsafe-inline:** Plan does NOT introduce `unsafe-inline` to CSP. Tier 2 deferred work has been re-scoped to avoid this option.
- [x] **No removal of intentional redundancy:** The duplicate `membership-daily-snapshot` cron stays.

---

## Out of Scope (Tier 2 / Tier 3 — explicitly NOT in this plan)

- Removing `force-dynamic` from root + `(site)` layouts (structural fix, biggest savings; needs nonce strategy that respects CSP R1 — only Options B/C in the audit are viable, NOT Option A which would add `unsafe-inline`).
- Deleting the duplicate `membership-daily-snapshot` cron — it's intentional redundancy per docs.
- Converting marketing/winner/draw-results pages to ISR.
- Cloudinary loader to bypass `/_next/image` for already-optimized URLs.
- Sampling Vercel Web Analytics (`<Analytics />`).
- Sitemap pruning (10K URLs in `src/app/sitemap.ts`).
- Deleting the 4.3MB PSD + 30+ photoshoot JPGs from `/public`.
- Partial Prerendering (PPR), `'use cache'`, Edge Config, Vercel KV — too new / over-engineered for this site's scale.
- Fixing the unauthenticated `/api/admin/sync-klaviyo-profiles/route.ts` (security finding, deserves its own ticket).
