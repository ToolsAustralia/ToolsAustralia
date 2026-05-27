# Klaviyo Onsite Integration

## Overview

This project uses Klaviyo's onsite JavaScript for client-side tracking alongside server-side Klaviyo APIs. The goal is to:

- Load the Klaviyo script **once globally**.
- Support **SPA page views** in Next.js App Router.
- Provide **clean, reusable helpers** for events and identification.
- Respect the same **consent model** used for other pixels.

## Where the script is loaded

- Root layout: `src/app/layout.tsx`

  - Renders `KlaviyoScriptLoader` in the `<body>` near other tracking components:
    - `PixelTracker`
    - `KlaviyoScriptLoader`
    - `KlaviyoPageTracker`

- Script loader component: `src/components/KlaviyoScriptLoader.tsx`
  - Client component that:
    - Uses `next/script` with `strategy="afterInteractive"`.
    - Injects Klaviyo's recommended proxy/queue snippet.
    - Loads `https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=NEXT_PUBLIC_KLAVIYO_COMPANY_ID`.
  - Props:
    - `companyId?: string` – from `process.env.NEXT_PUBLIC_KLAVIYO_COMPANY_ID`.
    - `disabled?: boolean` – typically `NODE_ENV === "development" && !NEXT_PUBLIC_ENABLE_PIXEL_TESTING`.
    - `nonce?: string` – CSP nonce from `getNonce`.

## SPA page view tracking

- Component: `src/components/KlaviyoPageTracker.tsx`
  - Client component using `usePathname()` to detect route changes.
  - On each pathname change:
    - Checks `hasPixelConsent()` (from `PixelTracker`).
    - If Klaviyo is loaded, calls `window.klaviyo.push(["page"])`.
  - Rendered once in `src/app/layout.tsx` so it is active for all routes.

## Client-side helper API

- Core helpers: `src/utils/tracking/klaviyo-helpers.ts`

  - `identifyKlaviyoUser(email, traits?)`
  - `trackKlaviyoEvent(eventName, properties?)`
  - `trackKlaviyoPageView(properties?)`
  - All helpers:
    - Guard against SSR (`typeof window === "undefined"`).
    - Check that `window.klaviyo` exists.
    - Respect `hasPixelConsent()` so future consent changes automatically apply.

- React hook: `src/hooks/useKlaviyoTracking.ts`
  - High-level helpers for common flows:
    - `identify`
    - `trackPurchase`
    - `trackAddToCart`
    - `trackRemoveFromCart`
    - `trackViewContent`
    - `trackInitiateCheckout`
    - `trackCompleteRegistration`
  - Internally uses the helpers in `klaviyo-helpers.ts`.

## Environment variables

- Defined in `env.example`:
  - `NEXT_PUBLIC_KLAVIYO_COMPANY_ID` – used by `KlaviyoScriptLoader`.
  - `KLAVIYO_PRIVATE_API_KEY`, `KLAVIYO_ENABLED`, `KLAVIYO_MODE`, list IDs – used by server-side Klaviyo integrations.

For local development, set `NEXT_PUBLIC_KLAVIYO_COMPANY_ID` to your Klaviyo company ID and optionally enable pixel testing with `NEXT_PUBLIC_ENABLE_PIXEL_TESTING=true`.

## CSP configuration

- File: `src/utils/security/csp.ts`
  - `script-src` includes `https://static.klaviyo.com` so the onsite script can load under the current Content Security Policy.
  - When a nonce is present, the inline loader snippet uses `nonce={nonce}` via `next/script`.

## How to use in new code

- **React components** (client-side):

  - Use the `useKlaviyoTracking` hook:
    - Identify user after login/registration.
    - Track cart, product views, checkout, and purchases.

- **Non-React code** (utility modules, etc.):
  - Import the helpers directly from `src/utils/tracking/klaviyo-helpers.ts`:
    - `identifyKlaviyoUser(email, traits)`
    - `trackKlaviyoEvent(eventName, properties)`
    - `trackKlaviyoPageView(properties)`

Avoid calling `window.klaviyo` directly so that consent rules and future changes remain centralized.

## Property naming contract — snake_case

All identify traits, event properties, and profile custom properties sent to Klaviyo
must use **snake_case keys** so they merge cleanly with Klaviyo's standard profile
attributes and avoid creating duplicate camelCase shadow properties on profiles.

- Identify traits: `first_name`, `last_name`, `phone_number`, `user_id`, …
  (The TypeScript values often come from session/user objects whose own fields
  are camelCase — that is fine. The Klaviyo-facing **key** is what must be
  snake_case.)
- Event properties: `product_id`, `product_name`, `order_id`, `num_items`,
  `item_count`, `value`, `currency`, `items[]`, …
- Profile custom properties: snake_case across the board. See
  `src/types/klaviyo.ts` for the canonical typed shape.

This contract is enforced by the `KlaviyoIdentifyParams` and `KlaviyoEventParams`
TypeScript interfaces in `src/hooks/useKlaviyoTracking.ts`. To audit existing
Klaviyo templates / flows / segments for stragglers, run
`npm run find:klaviyo-legacy-fields`.
