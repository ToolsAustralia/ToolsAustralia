/**
 * Extract Stripe PaymentIntent id from a PaymentIntent client secret (pi_xxx_secret_yyy).
 */
export function paymentIntentIdFromClientSecret(clientSecret: string): string | null {
  if (!clientSecret || typeof clientSecret !== "string") return null;
  const marker = "_secret_";
  const idx = clientSecret.indexOf(marker);
  if (idx <= 0) return null;
  const prefix = clientSecret.slice(0, idx);
  return prefix.startsWith("pi_") ? prefix : null;
}
