# Tracking — Patterns

## P1. Pixel components mounted at root

Each provider has a dedicated component loaded in the root layout. Don't load the provider SDK from feature components — it bypasses the root-level lifecycle.

## P2. Meta CAPI as canonical, pixel as backup

Server-side events are the source of truth for conversions. Pixel fires client-side for redundancy. Both should fire on the same conversion — pixel may be blocked, CAPI is reliable.

## P3. Klaviyo profile sync is non-blocking

`ensureUserProfileSynced(user)` — failures logged not thrown. Subscription cancel / refund / signup must not break if Klaviyo is down.

## P4. UTM through-line via persistence hook

`useUTMPersistence` is mounted near root. UTMs captured on landing → localStorage → flow through to attribution data on signup / payment.

## P5. Hash PII for Meta CAPI

Email / phone in CAPI events use SHA-256 hashing. Use the helper in `lib/facebook.ts` — don't roll your own hash.

## P6. Klaviyo invoice line-item descriptions use receipt labels

`src/utils/integrations/klaviyo/klaviyo-invoice-helpers.ts` builds the `item.description` field for Klaviyo invoice emails via `getReceiptLabelByPackageId(packageId, { membership: getPackageById, mini: getMiniDrawPackageById })` rather than the raw `packageName` string. This ensures users who hold multiple member/mini-draw SKUs with the same display name can tell them apart in their email receipt.

**Rule:** The `packageName` field on `InvoiceData` and `PurchaseData` structs (and stored in PaymentEvent documents) continues to use the raw `pkg.name` value — only the rendered `item.description` is label-resolved. Do not change the stored `packageName` value; it is used for reconciliation and Stripe-side reference.

## P7. Klaviyo events: canonical schema for new events, freeze for legacy

Events defined in [klaviyo-events.ts](../../src/utils/integrations/klaviyo/klaviyo-events.ts) as of 2026-05-27 (Subscription Started, Placed Order, Subscription Renewal Failed, etc.) have active Klaviyo flows, templates, segments, and campaigns wired against their exact property names. Renaming would silently break production: flow filters stop matching, template merge tags blank out, no error surfaces.

**Rule:** Do NOT refactor legacy event property names. New events added after 2026-05-27 use the canonical schema in [docs/tracking/KLAVIYO_INTEGRATION.md](./KLAVIYO_INTEGRATION.md) (price as number not string, `tier` not `package_tier`, ISO `*_at` timestamps not locale strings, omit-rather-than-empty-sentinel for missing values).

**Helpers:**
- Legacy events → keep calling `formatPackageDataForKlaviyo` in [klaviyo-helpers.ts](../../src/utils/integrations/klaviyo/klaviyo-helpers.ts).
- NEW events → call `formatCanonicalPackageData` (added 2026-05-28, same file). It emits `price` as number, `package_type` always, `tier` only when present, optional `num_entries`.

**Enforcement:** [`src/utils/integrations/klaviyo/__tests__/canonical-events-shape.test.ts`](../../src/utils/integrations/klaviyo/__tests__/canonical-events-shape.test.ts) snapshot-tests new event builders against the canonical key list. CI fails if a new event drifts. Run via `npm run test:klaviyo-canonical`.

See [docs/tracking/KLAVIYO_INTEGRATION.md](./KLAVIYO_INTEGRATION.md) — section "Canonical property names — new events only (drift containment)" — for the full table and the no-refactor policy.

## Cursor agent

`.cursor/agents/growth-integrations.md` covers this domain.

## Adding a new conversion provider

Three steps:

1. Implement `ConversionProvider` in `src/lib/tracking/providers/<platform>.ts`. The required surface:
   - `enabled()`: read env, return `{ pixel: !!process.env.NEXT_PUBLIC_<X>_PIXEL_ID, capi: !!process.env.<X>_ACCESS_TOKEN }`
   - `productionHostnames()`: return `["toolsaustralia.com.au", "www.toolsaustralia.com.au"]` unless you have a reason to differ.
   - `loadPixel({ nonce })`: inject the platform's inline init script with the nonce. Idempotent.
   - `pixelTrack(event)`: call the platform's `track` SDK with `event.eventId` mapped to the provider's dedup field.
   - `capiSend(event, ctx)`: POST to the platform's Conversions API. Return `false` on any failure — never throw.
2. Export it from [`src/lib/tracking/providers/index.ts`](../../src/lib/tracking/providers/index.ts).
3. Add it to the `ALL_PROVIDERS` array in [`src/lib/tracking/registry.ts`](../../src/lib/tracking/registry.ts), and extend the `ProviderId` union in [`src/lib/tracking/types.ts`](../../src/lib/tracking/types.ts).

Tests in [`src/lib/tracking/__tests__/dispatch.test.ts`](../../src/lib/tracking/__tests__/dispatch.test.ts) use fakes — no provider-specific changes needed.

### Worked example: TikTok Events API

[`providers/tiktok.ts`](../../src/lib/tracking/providers/tiktok.ts) is the second full provider (after Facebook) and the recommended template for the next one:

- `capiSend` stays thin — it maps the `CanonicalEvent` and delegates the payload/HTTP/`code:0` handling to a dedicated sender [`src/lib/tiktok.ts`](../../src/lib/tiktok.ts) (parallel to `src/lib/facebook.ts`). This keeps the provider readable and gives a clean unit-test target ([`__tests__/tiktok-capi.test.ts`](../../src/lib/tracking/__tests__/tiktok-capi.test.ts), `npm run test:tiktok-capi`) that stops at the network boundary.
- Provider-specific match signals (`ttclid`/`_ttp`) get a client-safe helper [`src/utils/tracking/tiktok-helpers.ts`](../../src/utils/tracking/tiktok-helpers.ts) (mirrors `facebook-helpers.ts`); the conversion route enriches them server-side and the per-provider `userData` fields (`ttclid`, `ttp`) are read only by the matching provider.
- Post-login identity (`ttq.identify`) is added to the shared [`ConversionPixelsAdvancedMatching`](../../src/components/tracking/ConversionPixelsAdvancedMatching.tsx) as an independent block — never coupled to another provider's load state.
- **Normalization that must match across pixel + server (e.g. phone E.164) lives in ONE client-safe module** and is imported by both, so the SDK's client hash equals the server hash.

Full details: [TIKTOK_EVENTS_API_IMPLEMENTATION.md](./TIKTOK_EVENTS_API_IMPLEMENTATION.md).
