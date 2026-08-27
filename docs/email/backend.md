# Email — Backend

## Lib

| File | Role |
|---|---|
| [src/lib/email/](../../src/lib/email/) | Email service: render template, build SendGrid payload, send |
| [src/lib/email.ts](../../src/lib/email.ts) | Top-level email facade |
| [src/lib/sms.ts](../../src/lib/sms.ts) | Transactional SMS — the Mobile Message gateway adapter (see [SMS](#sms)) |

## Template files

`*-email-template.html` at repo root. Examples:
- `welcome-email-template.html`
- `payment-receipt-template.html`
- _(others)_

> _TODO: enumerate full template inventory._

When a template is updated, ensure the rendering helper in `src/lib/email/` knows about any new variables. Otherwise template renders blanks.

## Newsletter integration

`/api/newsletter/` — likely a proxy to Klaviyo for opt-in lists. Klaviyo for marketing is documented in [tracking](../tracking/).

## SMS

Transactional SMS only — mobile-verification and sign-in codes. **Marketing SMS does not go through
this path**: Klaviyo owns it (`subscribeToSMSList` / `unsubscribeFromSMSList` in
[src/lib/klaviyo.ts](../../src/lib/klaviyo.ts):954, :1432), the same split R1 draws for email
(SendGrid transactional, Klaviyo marketing).

Design rationale + the routes still to come:
[docs/superpowers/specs/2026-08-25-mobile-verification-and-sms-login-design.md](../superpowers/specs/2026-08-25-mobile-verification-and-sms-login-design.md).
Today only the **adapter** and the **OTP policy** exist — the verification/login routes that will
call them are not built yet, and `SMS_ENABLED` ships `false`.

### The adapter — [src/lib/sms.ts](../../src/lib/sms.ts)

**Mobile Message** (Australian gateway). `POST https://api.mobilemessage.com.au/v1/messages`, HTTP
Basic auth from `MOBILE_MESSAGE_API_USERNAME:MOBILE_MESSAGE_API_PASSWORD`, via `resilientFetch`
([src/lib/http/outbound.ts](../../src/lib/http/outbound.ts):132) with `label: "mobile-message"`,
`timeoutMs: 8_000`, `retries: 2`.

This is **the only file in the repo that names the provider**. Swapping gateways is a change to this
file plus three env vars — no vendor name belongs in a route, service or component (CLAUDE.md
naming rule: vendor names live in config + one adapter module).

| Export | Role |
|---|---|
| `sendSms(mobile, message, { reference })` | Send one message. **Never throws** — every failure returns `{ success: false, error }` so a gateway outage degrades the caller (resend prompt) instead of 500-ing it. `reference` becomes the gateway's `custom_ref` for later lookup. |
| `normaliseAuMobile(raw)` | Any accepted AU form → E.164 (`+61…`), or `null`. **The** single normaliser. |
| `isValidAuMobile(raw)` | `normaliseAuMobile(raw) !== null`. |
| `toGatewayNumber(e164)` | `+61412345678` → `61412345678`. The gateway accepts `04…` or `61…` but **not** a leading `+`. |
| `isSmsEnabled()` | `process.env.SMS_ENABLED === "true"` — nothing looser. |

### What it deliberately is NOT

It does **not** generate, hash, store, compare or expire one-time codes. That policy lives in
[src/utils/auth/mobile-otp.ts](../../src/utils/auth/mobile-otp.ts) (documented in [auth](../auth/)):
expiry, daily send cap, resend cooldown, verify-attempt cap, HMAC-SHA256 hashing keyed with
`NEXTAUTH_SECRET`, `timingSafeEqual` compare. The adapter only puts a string on a handset.

The previous `src/lib/sms.ts` mixed the two and carried a `generateOTP()` built on `Math.random()`
plus an in-memory rate-limit `Map` (and a module-scope `setInterval`) that did nothing across
serverless invocations. All of that is gone, along with the `twilio` dependency.

### Request shape + the three pinned flags

```jsonc
{
  "max_parts": 1,             // src/lib/sms.ts:35, :169
  "shorten_urls": false,      // src/lib/sms.ts:170
  "ignore_unsubscribes": true,// src/lib/sms.ts:175
  "messages": [{ "to": "61412345678", "message": "…", "sender": "…", "custom_ref": "…" }]
}
```

| Flag | Why it is pinned |
|---|---|
| `max_parts: 1` | 1 credit = 1 SMS up to 160 GSM-7 chars; 161–306 costs 2. Pinned so a copy edit can never silently double the bill — an over-long body is **rejected** by the gateway instead of quietly re-priced. |
| `shorten_urls: false` | Nothing on this path carries a link, so there is nothing to shorten. Left on, the gateway could rewrite anything link-shaped in the body — changing what the member reads and adding a redirect hop to a security-sensitive message. |
| `ignore_unsubscribes: true` | **The one that matters most.** A member who once replied STOP to a Klaviyo *marketing* SMS is on the gateway's suppression list. Without this flag the login code they just asked for is **silently dropped** — accepted-looking, never delivered, member locked out with no visible error. This is legitimate only because this path is transactional; never set it on anything promotional. |

`sender` is `MOBILE_MESSAGE_SENDER`, a dedicated **virtual number** (free with credits). Sending
from a number rather than a branded alphanumeric ID deliberately bypasses the ACMA SMS Sender ID
Register (live 2026-07-01), so codes never carry the "Unverified" handset label. The gateway rejects
a message with no `sender`, so `sendSms` fails before spending the call when it is unset.

### Trap: HTTP 200 does not mean accepted

The per-message outcome is `results[0].status` (`success` | `blocked` | `error`), **not** the HTTP
status — a blocked number returns 200 with a failed result. `sendSms` checks the per-message status
and only reports success on `"success"` ([src/lib/sms.ts](../../src/lib/sms.ts):209-214). Any future
gateway adapter must do the same.

### Idempotency + logging

Every send carries a fresh `Idempotency-Key: randomUUID()` header
([src/lib/sms.ts](../../src/lib/sms.ts):166). `resilientFetch` retries twice; without the key a
transport retry would deliver a **second code** and bill twice. With it, the gateway replays the
original response.

The message **body is never logged** — it carries the code. Failure logs use `console.error` (not
`console.log`, which production builds strip) and contain only the gateway's own error string.

### `SMS_ENABLED` is opt-in

Mirrors `EMAIL_ENABLED`. Unset — or anything other than the exact string `"true"` — and `sendSms`
short-circuits with `{ success: false, disabled: true }`. Merging this branch therefore cannot text
anyone or spend a credit until the flag is deliberately flipped. Env block:
[.env.example](../../.env.example) (`SMS_ENABLED`, `MOBILE_MESSAGE_API_USERNAME`,
`MOBILE_MESSAGE_API_PASSWORD`, `MOBILE_MESSAGE_SENDER`).

### Number normalisation

`normaliseAuMobile` accepts `+61412345678`, `61412345678`, `0412345678` and a bare `412345678`, for
both the `4` and `5` mobile prefixes, and returns E.164. It is also the app-side **spend ceiling**:
non-AU and malformed numbers are refused before the gateway is called.

The repo previously grew several normalisers with different behaviour — the old `formatMobileNumber`
handled a bare 9-digit number starting `4` but **not** `5`, so a `+615…` number stored by the `User`
pre-save hook reached the gateway as `512345678`. New callers must use `normaliseAuMobile`.
