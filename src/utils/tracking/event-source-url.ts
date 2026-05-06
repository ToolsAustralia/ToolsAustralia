/**
 * Build a `capi_event_source_url` value that fits within the 500-char Stripe
 * metadata limit. Facebook ad referer URLs (fbclid + _aem_ + brid + long UTMs)
 * routinely exceed 500 chars, which would otherwise reject the entire Stripe
 * subscription/payment-intent create call.
 *
 * The query string here is redundant — fbc and utm_* are already captured in
 * separate metadata keys (`capi_fbc`, `attr_utm_*`) — so when the URL is too
 * long we keep just `origin + pathname`, which is what Facebook CAPI's
 * `event_source_url` field actually needs.
 */

const STRIPE_METADATA_MAX_LENGTH = 500;

export function safeEventSourceUrl(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  if (raw.length <= STRIPE_METADATA_MAX_LENGTH) return raw;
  try {
    const u = new URL(raw);
    const stripped = `${u.origin}${u.pathname}`;
    if (stripped.length <= STRIPE_METADATA_MAX_LENGTH) return stripped;
    return stripped.slice(0, STRIPE_METADATA_MAX_LENGTH);
  } catch {
    return raw.slice(0, STRIPE_METADATA_MAX_LENGTH);
  }
}
