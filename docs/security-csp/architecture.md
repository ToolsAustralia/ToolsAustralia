# Security & CSP — Architecture

## Files

| File | Role |
|---|---|
| [src/middleware.ts](../../src/middleware.ts) | NextAuth gating + CSP nonce injection |
| [src/utils/security/](../../src/utils/security/) | CSP construction (csp.ts) |
| [src/lib/rate-limiting/](../../src/lib/rate-limiting/) | Rate limit primitives |
| [next.config.ts](../../next.config.ts) | Static fallback security headers |

## CSP construction

Per CLAUDE.md:
> `next.config.ts` and `src/middleware.ts` together build CSP via `src/utils/security/csp.ts`. In production a per-request nonce is generated in middleware and attached as `x-nonce`; static fallback headers exist in `next.config.ts` for routes middleware doesn't run for.

## Stripe webhook exception

The Stripe webhook route (`/api/stripe/webhook`) gets a special header set (no COEP) so server-to-server POSTs work. If you change CSP or add inline scripts, update both `csp.ts` and verify the nonce is being read in the relevant server component.

## Middleware matcher

Middleware runs on most page routes BUT excludes:
- `/api/**` — API routes (handler-level auth required, see R4)
- `/_next/static/**` and `/_next/image/**` — Next.js build artifacts and optimized images
- Static asset paths in `/public/`: `images/**`, `fonts/**`
- Common static files at root: `robots.txt`, `sitemap.xml`, `manifest.json`, `sw.js`, `favicon.ico`, `icon.ico`, `apple-icon.png`
- `/.well-known/**`
- Any URL ending in a static-asset file extension: `png|jpg|jpeg|gif|webp|avif|svg|ico|ttf|woff|woff2|otf|map|txt|xml|json`

So:
- Pages (`/admin/`, `/login/`, `/my-account/`, etc.) → middleware gates auth.
- API routes → handler-level auth checks required.

The matcher uses **a single regex** with all exclusions combined inside one negative lookahead — multiple matcher array entries are OR'd by Next.js (include semantics), so we cannot split path-prefix and extension excludes across two entries. Excluding static asset paths and `/api/**` from middleware avoids JWT decode + CSP nonce generation on bytes/handlers that don't need them — meaningful Edge Requests / Edge Additional CPU cost reduction.

**Gotcha to remember:** Splitting exclusions into two matcher entries causes middleware to run on paths that should be excluded. For example, two-entry exclusion of `/api/**` (entry 1) AND non-extension paths (entry 2) would still run middleware on `/api/admin/*` because entry 2's "non-extension" pattern matches it. Always keep all exclusions inside one negative lookahead in a single matcher entry.

## Rate limiting

[src/lib/rate-limiting/](../../src/lib/rate-limiting/) — primitives for per-IP / per-user / global rate limits. Used by:
- Public endpoints (contact, public APIs)
- Admin bulk tools (charge-past-due — 1/admin/5min, 1/global/24h)

## next.config.ts — image + experimental settings

[`next.config.ts`](../../next.config.ts) configures, in addition to security headers:
- `images.minimumCacheTTL: 2_592_000` (30 days) so Image Optimization Cache writes don't churn at the 60s default.
- `images.deviceSizes` pruned to `[640, 750, 828, 1080, 1280, 1920, 2048]` (drops 1200, 3840 from the 8-size default — defaults inflate transformation count and origin transfer).
- `images.imageSizes` pruned to `[16, 32, 64, 128, 256, 384]`.
- `experimental.optimizePackageImports: ["lucide-react", "date-fns", "date-fns-tz"]` — barrel-tree-shake heavy libraries to shrink client bundles.
- `experimental.staleTimes: { dynamic: 30, static: 180 }` — restores client-side router cache window (Next 15 reset the dynamic default to 0s, hurting back/forward nav feel).

The deprecated `domains` field is removed; `remotePatterns` covers all hosts including `localhost` for dev.
