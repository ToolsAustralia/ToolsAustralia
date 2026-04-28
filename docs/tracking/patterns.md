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

## Cursor agent

`.cursor/agents/growth-integrations.md` covers this domain.
