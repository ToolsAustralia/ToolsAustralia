# Email — Rules

## R1. SendGrid for transactional, Klaviyo for marketing

Per CLAUDE.md. Don't send marketing emails through SendGrid (deliverability + sender-reputation reasons), and don't send urgent transactional through Klaviyo (latency + segmentation overhead).

## R2. Templates at root, helper in `src/lib/email/`

HTML templates and their rendering helpers must change in lockstep. If a template adds a new `{{variable}}`, the helper must populate it.

## R3. Don't persist email content

Sent emails aren't stored in our DB — SendGrid is the system of record. Don't add an `EmailLog` model unless there's a strong reason.

## R4. Unsubscribe must be respected

Klaviyo / SendGrid suppression lists are checked at send time. Don't bypass even for "important" emails.

**Narrow exception — transactional SMS only:** `sendSms()` sets `ignore_unsubscribes: true` (see R7). A STOP sent to a *marketing* SMS must not swallow a sign-in code the member just requested. This never applies to email, and never to promotional SMS.

## R5. Test emails go to a sandbox account

Use the dedicated test email address documented in `docs/SENDGRID_TESTING_GUIDE.md` for test sends. Don't send to real users from dev.

## R6. Customer-facing entry copy says "free entries"

Per spec D9 (`docs/superpowers/specs/2026-05-14-upsell-remap-and-multiplier-design.md`): every **customer-facing** entry count/reward in emails reads "free entries" regardless of source — never bare "entries"/"Entries". Applies to SendGrid templates and Klaviyo templates alike. Exceptions: CSS class names (`.entries-box`), HTML comments, merge-variable names (`{{ event.entries_gained }}`), and **internal/admin** emails showing raw draw totals (e.g. the "select a winner" notice in `src/lib/email/templates.ts`, which shows `totalEntries / minimumEntries`) — those stay "Entries".

## R7. Mobile Message for transactional SMS, Klaviyo for marketing SMS

R1's split, one channel down. `sendSms()` ([src/lib/sms.ts](../../src/lib/sms.ts)) carries
verification and sign-in codes only; marketing SMS goes through Klaviyo (`subscribeToSMSList`).
Two consequences:

- **Never reuse `sendSms()` for anything promotional.** Every send pins `ignore_unsubscribes: true`,
  which is defensible *because* the path is transactional. Put a promo down it and you text people
  who opted out.
- **The provider name stays in `src/lib/sms.ts` + the `MOBILE_MESSAGE_*` env vars.** No vendor name
  in routes, services, components or customer copy.

## R8. No OTP logic in the SMS adapter

Code generation, hashing, expiry, attempt caps and send rate limiting live in
[src/utils/auth/mobile-otp.ts](../../src/utils/auth/mobile-otp.ts). `src/lib/sms.ts` only delivers a
string. The previous version mixed the two, which is how a `Math.random()` code generator and an
in-memory rate limiter that did nothing on serverless survived unnoticed.

## R9. Judge an SMS send by `results[0].status`, not by HTTP 200

The gateway returns 200 with a per-message `blocked` / `error` result. Treating 200 as delivered
means a member sits waiting for a code that was never sent, and the logs say it worked. See
[backend.md — HTTP 200 does not mean accepted](./backend.md#trap-http-200-does-not-mean-accepted).
