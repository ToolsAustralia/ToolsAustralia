# Google Tag Manager (GTM) Integration

GTM is loaded in one place and events are pushed via a small helper module so the rest of the app does not touch `window` directly.

## Environment variable

- **`NEXT_PUBLIC_GTM_ID`** – GTM container ID (e.g. `GTM-TBCCQQVZ`). Set per environment; leave empty in dev to disable.
- **`NEXT_PUBLIC_ENABLE_GTM_TESTING`** – Set in dev if you want to load GTM locally (e.g. `true`). Otherwise GTM is disabled in development.

## Where GTM is loaded

- **Component**: `src/components/GoogleTagManager.tsx` (script + noscript).
- **Layout**: Used once in `src/app/layout.tsx` as the first child of `<body>` so the noscript iframe is in the required position.
- **CSP**: `src/utils/security/csp.ts` allows `https://www.googletagmanager.com` in `script-src`, `connect-src`, and `frame-src` (and `https://www.google-analytics.com` in `connect-src` for GA via GTM).

## Pushing events

Use the helpers in **`src/lib/gtm.ts`** instead of `window.dataLayer.push`:

- **`pushToDataLayer(event, payload?)`** – Generic push.
- **`trackPurchase(data)`** – Fires `purchase` event (e.g. transaction_id, value, currency, items).
- **`trackSignUp(data?)`** – Fires `sign_up` event.
- **`trackEvent(name, data?)`** – Fires a custom event by name.

Example:

```ts
import { trackPurchase, trackEvent } from "@/lib/gtm";

// After checkout success
trackPurchase({
  transaction_id: order.id,
  value: order.total,
  currency: "AUD",
  items: order.items,
});

// Custom event
trackEvent("form_submit", { form_name: "contact" });
```

Configure tags in the GTM container to listen for these event names and payloads.

## Types

`Window.dataLayer` is declared in `src/types/global.d.ts` for type-safe usage. Prefer the helpers in `lib/gtm.ts` so consent or feature flags can be added in one place later.
