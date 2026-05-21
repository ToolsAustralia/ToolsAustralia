# Tracking — Rules

## R1. Server-side events for purchases / cancellations

Canonical purchase / cancel / refund events fire SERVER-SIDE (Meta CAPI, Klaviyo events API). Client-side pixels are best-effort backup. Don't rely on browser pixels for revenue-relevant data — ad-blockers and ITP suppress them.

## R2. Webhook is the single emitter for cancel / paid events

Per [billing-stripe R2](../billing-stripe/rules.md#r2-the-webhook-is-the-only-emitter-of-cancellation-tracking-events): cancel / paid analytics fire from the matching webhook only, not from API paths. Prevents double-counting.

## R3. Honour unsubscribe / GDPR deletion

When a user is suppressed (Klaviyo unsubscribe) or requests deletion, don't send tracking events involving them. Klaviyo / SendGrid suppression lists are checked at send time.

## R4. No PII in pixel events without consent

UTM params, generic user ids OK. Email + phone require Meta CAPI's hashing convention. Don't send raw PII.

## R5. UTM persistence respects same-origin

`useUTMPersistence` writes to localStorage / sessionStorage. Don't try to share UTM across origins (privacy + tech limits).

## R6. CSP must include tracking origins

Adding a new tracking provider requires updating CSP — see [security-csp](../security-csp/). Don't bypass CSP with `unsafe-inline`.
