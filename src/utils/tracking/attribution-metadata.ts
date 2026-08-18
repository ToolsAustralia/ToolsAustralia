/**
 * Utilities to convert AttributionParams to Stripe metadata format.
 * Uses attr_ prefix for attribution keys (Stripe allows 50 keys, 500 chars/value).
 *
 * @see docs/PAYMENT_ATTRIBUTION.md
 */

import type { AttributionParams } from "@/types/tracking";

/**
 * Stripe rejects the whole request if any metadata value exceeds 500 characters.
 *
 * Nothing upstream enforces this: `attributionSchema` declares these as plain
 * `z.string().optional()` with no `.max()`, and the values originate in the URL — so anyone
 * can append `?utm_source=<600 chars>` to a landing link. Every purchase path funnels through
 * this function (create-subscription, create-payment-intent, create-one-time-purchase and its
 * existing-user variant, mini-draw/purchase, upsell/purchase), so an unbounded value here
 * fails the charge itself, not just the reporting.
 *
 * The guard was latent until 2026-08-10: `extractAttributionParams` was silently returning {}
 * for `window.location.search`, so these values were always empty and never tested a limit.
 * Fixing that parser is what made this reachable.
 *
 * TRUNCATE, never reject. Attribution is reporting metadata; a purchase must never fail
 * because a campaign tag was too long. A clipped utm_term costs a little reporting fidelity.
 * A refused PaymentIntent costs the sale.
 */
const STRIPE_METADATA_VALUE_MAX = 500;

function clip(value: string): string {
  return value.length > STRIPE_METADATA_VALUE_MAX ? value.slice(0, STRIPE_METADATA_VALUE_MAX) : value;
}

/**
 * Build Stripe metadata object with attr_* keys from attribution params.
 * Only includes non-empty values, each clipped to Stripe's 500-character limit.
 */
export function buildAttributionMetadata(attribution?: AttributionParams | null): Record<string, string> {
  if (!attribution || typeof attribution !== "object") return {};

  const meta: Record<string, string> = {};
  if (attribution.utm_source) meta.attr_utm_source = clip(attribution.utm_source);
  if (attribution.utm_medium) meta.attr_utm_medium = clip(attribution.utm_medium);
  if (attribution.utm_campaign) meta.attr_utm_campaign = clip(attribution.utm_campaign);
  if (attribution.utm_content) meta.attr_utm_content = clip(attribution.utm_content);
  if (attribution.utm_term) meta.attr_utm_term = clip(attribution.utm_term);
  if (attribution.campaign_id) meta.attr_campaign_id = clip(attribution.campaign_id);
  if (attribution.adset_id) meta.attr_adset_id = clip(attribution.adset_id);
  if (attribution.ad_id) meta.attr_ad_id = clip(attribution.ad_id);
  // Validate the literal so a tampered cookie can't stamp an arbitrary value.
  if (attribution.packages_focus === "one-time") meta.attr_packages_focus = "one-time";

  return meta;
}
