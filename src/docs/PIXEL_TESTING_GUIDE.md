# Pixel & Conversions API Testing Guide

The in-app `/test-pixels` page was removed to prevent accidental **Purchase** events with no `event_id` from polluting production attribution. Use Meta’s official tooling instead.

## Facebook (Meta): Test Events tab

1. Open [Events Manager](https://business.facebook.com/events_manager) → select your **Data source** (Pixel).
2. Go to **Test events**.
3. Copy your **Test server events** code (e.g. `TEST37090`) into your environment:
   - Local: `FACEBOOK_USE_TEST_EVENTS=true` and `FACEBOOK_TEST_EVENT_CODE=<code>` in `.env.local`
   - Staging: same vars on Vercel **Preview**
4. Trigger a real checkout flow on **localhost** or **staging**. **CAPI** events appear under **Test events** only, not the live diagnostics feed.
5. **Browser pixel** is disabled on non-production hostnames (`localhost`, `staging.*`). Do not expect `fbq` calls locally—deduplication is validated on **production** with a small test purchase.

## Verifying server-side (CAPI) locally

- Ensure `FACEBOOK_ACCESS_TOKEN` and `NEXT_PUBLIC_FACEBOOK_PIXEL_ID` are set.
- Complete a test payment (or use Stripe test mode). Check Vercel/server logs for `[CAPI] Purchase sent` (when enabled) or `[Facebook CAPI Dev]` in development.
- In Events Manager → **Test events**, confirm **Purchase** with `event_id` matching the Stripe `payment_intent` id (`pi_…`).

## TikTok

Use TikTok Events Manager **Test events** (or your integration’s test mode) per their docs—same idea: avoid firing revenue events from arbitrary pages without stable IDs.

## Production checklist

- [ ] One real purchase on **toolsaustralia.com.au**: **Live** feed shows **Purchase** once (browser + CAPI deduped via same `event_id`).
- [ ] Staging/preview: no events in **live** diagnostics; Test tab only when `test_event_code` is configured.
