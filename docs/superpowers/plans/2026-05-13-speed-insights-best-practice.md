# Speed Insights — Best-Practice Hardening

**Date:** 2026-05-13
**Domain:** [tracking](../../tracking/)
**Status:** Tier 1 — surgical config tightening
**Predecessor:** [2026-05-06-vercel-cost-optimization-tier-1.md](2026-05-06-vercel-cost-optimization-tier-1.md) introduced `sampleRate={0.1}` and deferred `force-dynamic` removal to Tier 2.

## Goal

Bring the `<SpeedInsights />` integration into strict alignment with Vercel's documented best practice. Audit (2026-05-13) confirmed the integration is already mostly correct; this spec captures the remaining gap and the standing rules that govern future edits.

After Phase 1 implementation revealed an RSC boundary runtime error (see incident note below), the integration was relocated from the root layout into a dedicated Client-Component wrapper at [`src/components/tracking/SpeedInsightsClient.tsx`](../../../src/components/tracking/SpeedInsightsClient.tsx). The root layout now mounts the wrapper instead of `<SpeedInsights>` directly.

## Tech context

- `@vercel/speed-insights@^1.2.0`, `next` subpath import.
- Mounted globally in root layout; sampled at 10%; admin filtered via `beforeSend`.
- TypeScript contract verified directly against installed types: [`node_modules/@vercel/speed-insights/dist/next/index.d.ts:1-16`](../../../node_modules/@vercel/speed-insights/dist/next/index.d.ts#L1-L16) — `beforeSend` receives `{ type: 'vital', url: string }` and may return `null | false | undefined` to drop the event, or the event object to forward it.

## Audit summary (2026-05-13)

| Check | Result | Source |
|---|---|---|
| Framework-specific import (`/next`) | ✅ | `SpeedInsightsClient.tsx:3` |
| Mounted once, via wrapper in root layout | ✅ | `layout.tsx` mounts `<SpeedInsightsClient />` — wraps every route segment incl. admin |
| Wrapper has `"use client"` directive (R7) | ✅ | `SpeedInsightsClient.tsx:1` — keeps the `beforeSend` function on the client side of the RSC boundary |
| Placed inside `<body>`, after `<Providers>` | ✅ | `layout.tsx` `<body>` |
| `sampleRate` is a typed prop in v1.2 | ✅ | `SpeedInsightsProps.sampleRate: number` |
| `beforeSend` return type matches | ✅ | `Event \| null \| undefined \| false` |
| No competing CWV RUM mounted | ✅ | No Sentry browser tracing, Datadog RUM, New Relic browser, or `reportWebVitals` handler in `src/`. Hotjar (loaded via GTM) and Contentsquare are session-replay/UX, not CWV beacons — they do not duplicate Speed Insights' job. |
| CSP allows the beacon | ✅ | Beacon goes to `/_vercel/speed-insights/vitals` (same origin, covered by `connect-src 'self'`) and the script source is same-origin |
| Admin pages excluded | ✅ | Parsed pathname + `startsWith("/admin")` in `SpeedInsightsClient.tsx` (applied 2026-05-13) |

## Standing rules (apply to all future edits in this area)

**R1. Mount once, in `src/app/layout.tsx`.** Root layout is the only correct mount point. Mounting in a route-group layout (e.g. `(site)/layout.tsx`) drops coverage of sibling top-level routes (`/promotions`, `/login`, `/affiliate`).

**R2. Use the framework-specific import path.** `@vercel/speed-insights/next` — not `/react`. The Next.js variant auto-detects the route, so the `route` prop is omitted from `Props` ([type def line 35](../../../node_modules/@vercel/speed-insights/dist/next/index.d.ts#L35)) and must not be passed.

**R3. Filter via `beforeSend`, not by tree placement.** Excluding a route subtree by moving the mount loses coverage of sibling top-level routes and is harder to verify. `beforeSend` runs per-beacon, keeps the mount global, and is the documented filtering hook.

**R4. Path matching uses parsed URL pathname + `startsWith` — never substring `.includes`.** Substring matching has false positives on query strings (`?next=/admin/...`) and any hypothetical future public path that contains the literal admin path as a substring. The robust form parses the URL and tests the pathname prefix.

**R5. `sampleRate` is project-wide.** Do not vary sample rate per route inside `beforeSend` unless there is documented evidence that p75/p95 for low-traffic routes is jittery. Current value `0.1` is intentional and cost-driven; changing it requires updating [`docs/tracking/architecture.md`](../../tracking/architecture.md).

**R6. Do not co-mount a second RUM that measures CWV.** Sentry browser tracing, Datadog RUM, New Relic browser, and custom `reportWebVitals` handlers all measure the same vitals Speed Insights does, double-billing data points and producing divergent dashboards. Session replay (Hotjar, Contentsquare) is fine — different metric class.

**R7. Function-prop callbacks (e.g., `beforeSend`) must live in a Client-Component wrapper, not the root layout.** `<SpeedInsights>` is a Client Component (verify: `"use client"` at [`node_modules/@vercel/speed-insights/dist/next/index.mjs:1`](../../../node_modules/@vercel/speed-insights/dist/next/index.mjs#L1)). `src/app/layout.tsx` is a Server Component (`export default async function RootLayout`). React serializes props across the Server→Client boundary and rejects function values at RUNTIME with `"Functions cannot be passed directly to Client Components"`. Type-check and lint do NOT catch this — it only surfaces when the page renders. The fix is to define the `beforeSend` callback inside a `"use client"` wrapper file (current home: [`src/components/tracking/SpeedInsightsClient.tsx`](../../../src/components/tracking/SpeedInsightsClient.tsx)) and mount the wrapper from the layout. Any future prop that is a function literal — `beforeSend`, custom `route` getters, etc. — must follow this same pattern.

## Changes

### Phase 1 — Pathname-based admin filter (substantive) ✅ APPLIED 2026-05-13

**Why:** Current `data.url.includes("/admin")` matches any URL containing the substring `/admin` anywhere — query string, hash fragment, or a future public path like `/admin-fees-explained`. There are no false positives in today's route tree, but the form is not robust to route additions. Cost of fix is trivial; cost of regression from a future route name collision is silent data loss.

**File (final, after R7 incident):** [`src/components/tracking/SpeedInsightsClient.tsx`](../../../src/components/tracking/SpeedInsightsClient.tsx) — Client-Component wrapper. The root layout simply mounts `<SpeedInsightsClient />`.

**File (originally specced):** ~~`src/app/layout.tsx:149-152`~~ — the initial implementation placed the filter inline in the root layout. This worked at type-check and lint but failed at runtime with the RSC function-prop serialization error. See [Incident note](#incident-note-rsc-function-prop-boundary) below.

**Edit:**

```tsx
<SpeedInsights
  sampleRate={0.1}
  beforeSend={(data) => {
    try {
      const pathname = new URL(data.url).pathname;
      return pathname.startsWith("/admin") ? null : data;
    } catch {
      return data;
    }
  }}
/>
```

Notes:
- `try/catch` wraps `new URL()` to protect against ever-malformed `data.url`. Returning `data` on parse failure errs toward keeping the beacon (false negative on the filter, not data loss).
- `startsWith("/admin")` matches `/admin`, `/admin/users`, `/admin/stripe-webhook-queue/...` — all admin app routes per the manifest.

**Verification:**
1. `npm run type-check` — must pass.
2. Manual: open DevTools Network → filter `vitals`. Visit a public page (`/`) and confirm a `POST /_vercel/speed-insights/vitals` beacon fires (subject to 10% sampling — may need a few reloads). Visit `/admin` (after auth); confirm no `vitals` request fires. Works on production and preview deployments identically. Vercel dashboard reflects the filter within ~15 minutes.

### Phase 2 — Preview-env debug toggle ❌ REJECTED (2026-05-13)

**Initially specced as:** `debug={process.env.NEXT_PUBLIC_VERCEL_ENV === "preview"}` to log beacons to the browser console on preview deployments.

**Why rejected — verified directly against installed SDK source:**

The `debug` prop in `@vercel/speed-insights@1.2.0` does **not** activate debug logging on Vercel previews. Three independent layers each kill it:

1. **SDK gate** — [`node_modules/@vercel/speed-insights/dist/index.mjs:17-29, 68, 109`](../../../node_modules/@vercel/speed-insights/dist/index.mjs#L17-L29): `isDevelopment()` returns `true` only when `NODE_ENV === "development" \| "test"`. Vercel previews build with `NODE_ENV=production`, so the SDK never loads `script.debug.js` and never honours `debug={true}` on previews. The `debug` prop in this SDK version is an opt-OUT switch for local dev, not an opt-IN switch for previews.
2. **Build-time strip** — [`next.config.ts:66-73`](../../../next.config.ts#L66-L73) `compiler.removeConsole` strips `console.log/info/debug/warn` from the bundle whenever `NODE_ENV === "production"` (true on previews). Only `console.error` survives.
3. **Runtime silencer** — [`src/utils/common/silence-logs.ts:130-160`](../../../src/utils/common/silence-logs.ts#L130-L160) reassigns `console.log/info/warn/debug/...` to no-ops on `window.console` whenever `NODE_ENV === "production"`. Defence-in-depth that catches third-party script logs.

Layers 2 and 3 exist intentionally (clean production bundles, no diagnostic leakage to end users) and Layer 1 is fixed SDK behaviour. Bypassing them for one verification task would widen the blast radius of debug logging across every other script on the page (Stripe.js, Klaviyo, GTM, Contentsquare) — disproportionate to the value.

**Replacement verification path:** DevTools Network panel (Phase 1, Verification step 2). Works on production and preview identically, requires zero code change, shows the actual beacon URL — which is the field `beforeSend` filters on, so it directly confirms the filter is correct.

## Incident note: RSC function-prop boundary

**Discovered 2026-05-13 while applying Phase 1.**

The initial Phase 1 implementation placed the `<SpeedInsights beforeSend={(data) => ...} />` element directly in the root layout. `npm run type-check` and `npm run lint` both passed. The runtime dev server then surfaced:

```
Functions cannot be passed directly to Client Components unless you explicitly expose it
by marking it with "use server". Or maybe you meant to call this function rather than
return it.
  <... sampleRate={0.1} beforeSend={function beforeSend}>
                                   ^^^^^^^^^^^^^^^^^^^^^
    at stringify (<anonymous>:1:18)
```

Root cause:
1. `<SpeedInsights>` is a Client Component (`"use client"` directive at [`node_modules/@vercel/speed-insights/dist/next/index.mjs:1`](../../../node_modules/@vercel/speed-insights/dist/next/index.mjs#L1)).
2. `src/app/layout.tsx` is a Server Component (`async function RootLayout`, no `"use client"`).
3. React Server Components serialize props across the boundary and reject function values. The error fires at render time, not build time.

Resolution: Created [`src/components/tracking/SpeedInsightsClient.tsx`](../../../src/components/tracking/SpeedInsightsClient.tsx) with `"use client"` at the top. The `beforeSend` callback now lives inside this file; the layout imports and mounts `<SpeedInsightsClient />` instead of `<SpeedInsights>` directly. The function never crosses the boundary.

Codified as Standing Rule R7 above. Documented in `docs/tracking/architecture.md`. Saved as a permanent memory note so future Claude sessions anticipate this trap.

**Process lesson:** The implementer subagent reported `DONE` based on `npm run type-check` + `npm run lint` passing, without executing Step 5 of the plan ("Smoke-test in dev server"). Spec-compliance and code-quality reviewers also did not run the dev server. The runtime error surfaced only when the user ran `npm run dev`. Future plans that include a runtime verification step must require the implementer's report to explicitly confirm that step ran with the expected output — not just static-analysis passes.

## Out of scope (deferred — do not bundle into this spec)

- **`force-dynamic` removal at [`src/app/layout.tsx:74`](../../../src/app/layout.tsx#L74) and [`src/app/(site)/layout.tsx:8`](../../../src/app/(site)/layout.tsx#L8).** This is the single biggest distortion of Speed Insights numbers — every page is SSR'd on every visit, so TTFB → FCP → LCP all reflect server cold-start, not user experience. Tier 2 plan already owns this work. Mentioned here so the Tier 1 reader understands that **Speed Insights numbers will continue to be partially noise until Tier 2 lands**, regardless of how clean the integration is.
- **Web Analytics (`<Analytics />`) sampling.** Separate product, separate billing line, separate decision. Tier 2 territory.
- **Per-route sampling inside `beforeSend`.** Only justified if Vercel dashboard shows per-route p75/p95 jitter on long-tail routes. No current evidence of that. R5 governs.

## Docs to update when applying

Per the [Domain Manifest](../../../CLAUDE.md) `tracking` entry, when this spec is applied:

- [`src/app/layout.tsx`](../../../src/app/layout.tsx) — edit per Phase 1 (+ optional Phase 2).
- [`docs/tracking/architecture.md`](../../tracking/architecture.md) — update the "Observability sampling" section to describe the pathname-based filter (the current text describes `.includes`). Reference R4 from the standing rules above.
- This spec — mark Phase 1 ✅ once applied.

## Confidence

- **Phase 1 (pathname filter):** high. Verifiable directly against installed package types and current code.
- **Phase 2 rejection:** high. Verified against the SDK's installed bundle source, `next.config.ts`, and `silence-logs.ts` (2026-05-13).
- **R6 (no double-RUM):** high — verified via grep across `src/` for Sentry/Datadog/New Relic/`reportWebVitals` (no matches 2026-05-13).
- **Sample rate (R5):** medium — current value chosen for cost; statistical adequacy depends on traffic per route which is not audited here.
