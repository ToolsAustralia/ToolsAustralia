# Security & CSP — Frontend

CSP affects the frontend but this domain has no UI.

## Inline scripts

Per-request nonce injected via middleware. Server components reading `headers()` can pull the nonce and pass to `<Script nonce={...}>`. Don't add `unsafe-inline` to CSP.

## Third-party SDKs

Each tracking provider's domain must be in CSP. See [tracking](../tracking/) for provider list.

## Verification

In dev, CSP violations log to the browser console. In production, violations may be rate-limited / suppressed — verify via browser dev tools network tab.
