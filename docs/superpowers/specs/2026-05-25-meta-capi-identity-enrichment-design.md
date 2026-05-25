# Meta CAPI Identity Enrichment — Design Spec

- **Date:** 2026-05-25
- **Status:** Draft (awaiting user review)
- **Branch:** feature/meta-audit
- **Author:** DJ + Claude

## Context

A best-practices audit of the Meta Pixel + Conversions API (CAPI) integration, cross-referenced
against Events Manager screenshots and Meta documentation, surfaced three concrete, verified gaps
that depress Event Match Quality (EMQ) and event coverage:

1. **`AddPaymentInfo` is browser-Pixel-only** — it fires via `trackConversion` (browser-only) from
   `CardFormSection.tsx`, never reaching CAPI. Events Manager shows ~170 browser / ~1 server, no EMQ
   score (EMQ is a CAPI-derived metric), 0% event coverage, and a deduplication warning. It is the
   only funnel event not already mirrored to CAPI.
2. **`InitiateCheckout` carries almost no customer identity** (~1.84% for em/ph/fn/ln/external_id).
   Root cause: Advanced Matching is login-gated, and the CAPI mirror only enriches PII from the
   session. IC fires during the guest signup/checkout flow, where the form already holds
   email/name/phone but none of it is attached to the event.
3. **`CompleteRegistration` sends an empty `fbc` to CAPI** while the browser Pixel has it. The
   register route reads `fbc` only from the `_fbc` cookie on the API request and cannot reconstruct
   it from `fbclid` (the API URL has none). Because registration fires at the earliest point of the
   first session, the cookie is often not written yet; the browser Pixel fires later and has it.

These are independent of two things that were checked and found healthy: **event deduplication**
(event_id keying is correct on every event) and **PageView** (correctly Pixel-only).

## Goals

- `AddPaymentInfo` fires on both the Pixel and CAPI with a shared `event_id` and customer identity.
- `InitiateCheckout` CAPI events carry the guest's form PII (email/name/phone), lifting identifier
  coverage and EMQ.
- `CompleteRegistration` CAPI events receive `fbc`/`fbp` reliably via the request body.
- No regression to the existing logged-in enrichment, dedup keying, or PageView behavior.

## Non-Goals (explicitly out of scope)

- **Browser-side Advanced Matching for guests** — decided against; CAPI carries identity and drives
  EMQ. Browser events still dedupe against the richer CAPI event.
- **Subscribe "same price" (GTM):** no production code fires a standard `Subscribe`; the live events
  originate from the GTM container, fixed in the GTM UI, not this repo.
- **Facebook Login ID (`fb_login_id`):** requires adding a Facebook Login OAuth provider; the app
  uses email + Google. Not implementable without a product change.
- **IPv6 `client_ip_address`:** the server already forwards whatever IP the platform provides; the
  v4/v6 split is a Vercel/proxy artifact with marginal EMQ impact.
- **`fbc` for InitiateCheckout / payment-creation routes:** IC is already ~95% (mirror reads the
  cookie late in the session); the 6 checkout routes fire late enough that the cookie is present and
  Purchase fbc was not flagged. CompleteRegistration is the only materially broken case.
- **`MembershipUpgrade`/`MembershipDowngrade`:** custom events, existing members, not part of Meta's
  standard fbc/EMQ diagnostics.

## Architecture / Data Flow

The server route `/api/tracking/conversion` **already accepts and SHA-256-hashes** a client-supplied
`userData` object (`userDataSchema`, and `...parsed.userData` in the merge), via the centralized
`hashPII`. The gap is purely that the client never sends it. Fixes A and B feed that existing pipe.

```
form / billingDetails PII
        │  (raw, same-origin HTTPS)
        ▼
fireFunnelEvent(name, customData, platforms, userData?)
        ├─► browser Pixel (custom_data only — NO PII; CAPI-only decision)
        └─► mirrorMetaEventToCapi({ …, userData })
                 └─► POST /api/tracking/conversion  → hashPII → sendConversion → FB CAPI
                            (em, ph, fn, ln, … SHA-256 hashed server-side)

CompleteRegistration (Fix C):
client computes fbc/fbp ─► register POST body ─► registerSchema ─► userData.fbc = body.fbc ?? cookie
```

Raw PII travels same-origin over HTTPS and is hashed server-side — consistent with the existing
`hashPII` pattern; no client-side hashing is added.

## Fix A — Route `AddPaymentInfo` through CAPI with identity

**Files:** `src/utils/tracking/meta-capi-mirror.ts`, `src/hooks/usePixelTracking.ts`,
`src/components/modals/PaymentMethodSelector/CardFormSection.tsx`

- **`meta-capi-mirror.ts`** — add a `MirrorUserData` type (the client-supplyable PII subset:
  `email, phone, firstName, lastName, city, state, zipCode, country, birthdate, externalId`), add
  optional `userData` to `MirrorParams`, and include it in the POST body. Add a `stripEmpty()` helper
  that drops `undefined`/`null`/`""` so we never transmit empty fields (prevents clobbering the
  route's session enrichment for logged-in users, given its client-overrides-last merge). Omit the
  `userData` key entirely when nothing survives stripping.
- **`usePixelTracking.ts`** — `fireFunnelEvent` gains an optional `userData` argument passed **only**
  to `mirrorMetaEventToCapi` (never to the browser `trackFacebookEvent` / TikTok pixel — CAPI-only).
  `trackAddPaymentInfo` and `trackInitiateCheckout` forward it.
- **`CardFormSection.tsx`** — replace the browser-only `trackConversion({ eventName:"AddPaymentInfo",
  … })` block with `usePixelTracking().trackAddPaymentInfo(...)` (dual Pixel + CAPI via a shared
  `event_id` from `fireFunnelEvent`). Derive `userData` from the existing `billingDetails` prop
  (`name` → first/last split on first space; `email`; `phone`; `state`; `city`; `postalCode` →
  `zipCode`; `country`). Keep the `addPaymentInfoFiredRef` once-guard. This also gives AddPaymentInfo
  a server twin and therefore a real dedup coverage rate (today it has none).

## Fix B — Attach guest PII to `InitiateCheckout`

**Files:** `src/components/modals/MembershipModal/index.tsx` (+ the `usePixelTracking` change from A)

- At the **guest signup** fire site (`handleRegistration`, ~line 1317): pass
  `userData: { email, firstName, lastName, phone, country: "AU" }` from `formData`. This path is
  inherently guest.
- At the **checkout** fire site (`handleSubmit`, ~line 2643): pass the same `formData`-derived
  `userData` **only when `!isAuthenticated`**. For authenticated users, pass nothing — the route's
  session enrichment already supplies PII and is authoritative.
- `stripEmpty()` in the mirror guarantees only non-empty fields are sent.

## Fix C — Reliable `fbc`/`fbp` for `CompleteRegistration`

**Files:** `src/components/modals/MembershipModal/index.tsx`, `src/app/api/auth/register/route.ts`

- **Client (register call, ~line 1375):** add `fbc` and `fbp` to the POST body, computed with the
  existing helpers `getFBCFromURL()` (reads the `_fbc` cookie or reconstructs from the landing
  `fbclid`) and `getFBPFromCookie()`. The client can reconstruct from `fbclid`; the server cannot.
- **`registerSchema`:** add `fbc: z.string().optional()` and `fbp: z.string().optional()`.
- **Register route (all four CompleteRegistration blocks, ~lines 336, 451, 537, 696):** prefer the
  body value over the cookie — `const fbc = validatedData.fbc ?? ctx.fbc; if (fbc) userData.fbc = fbc`
  (same for `fbp`). This is exactly what Meta's "parameter builder" SDK does; no SDK needed.

## Edge Cases & Decisions

- **Empty-field clobbering:** `stripEmpty()` (Fix A/B) and the `?? ctx` fallback (Fix C) ensure we
  never overwrite good server/session/cookie data with empty client values.
- **Route merge-order note (not changed):** `/api/tracking/conversion` puts `...parsed.userData`
  last (client wins), which contradicts its own comment ("server fields take priority"). Our
  guest-only IC PII + `stripEmpty()` sidesteps any conflict, so we **do not** change the merge order
  (an existing test relies on it). Documented as a known nuance only.
- **`billingDetails.name` split:** single-token names map to `firstName` only; `lastName` omitted.
- **CAPI-only:** `userData` is never attached to the browser Pixel calls, per the agreed decision.
- **Snapchat browser pixel (Fix A):** today AddPaymentInfo uses `trackConversion`, which fires every
  enabled provider's browser pixel (incl. Snapchat). `fireFunnelEvent` fires only the FB + TikTok
  browser pixels (Snapchat is reached server-side via the mirror's provider fan-out). This makes
  AddPaymentInfo consistent with the other funnel events (ViewContent/AddToCart/IC/Lead, which also
  skip the Snap browser pixel) and Snapchat is shell-stage — accepted as an intentional consistency
  change, not a regression.
- **Dead imports (Fix A):** after replacing the `trackConversion` block in `CardFormSection.tsx`,
  `trackConversion` and `eventTimeNow` become unused and must be removed (repo lints unused vars).

## Testing

- Add one `tsx` regression test (with a matching `test:*` entry in `package.json`, per repo
  convention) asserting that when client `userData` (email/phone/firstName/lastName) reaches the
  CAPI path, the outgoing Facebook payload contains **hashed** `em`/`ph`/`fn`/`ln` (64-char hex).
  This locks the behavior that today silently drops client PII. Model it on the existing
  `src/utils/tracking/__tests__/facebook-emq.test.ts` (mocks `fetch`, inspects the payload).
- Re-run `npm run type-check` and `npm run lint`.

## Documentation (doc-sync enforced)

Affected domains per the Domain Manifest:
- **`docs/tracking/`** — `meta-capi-mirror`, `usePixelTracking`, conversion route, event parameter
  matrix + gotchas (AddPaymentInfo now dual-fired w/ PII; IC carries guest PII).
- **`docs/auth/`** — register route now accepts `fbc`/`fbp` in the body.
- **`docs/shared-ui/`** — `MembershipModal` / `CardFormSection` tracking call changes.

The `Stop` doc-sync hook will list the exact files; update them in the same task.

## Rollout & Verification

- No feature flag (commits are the rollback unit, per repo policy).
- After deploy, verify in Events Manager over ~48h: AddPaymentInfo shows server events + an EMQ
  score; InitiateCheckout em/ph coverage rises from ~1.84%; CompleteRegistration server `fbc`
  coverage rises and the diagnostic moves to "Previously detected".
