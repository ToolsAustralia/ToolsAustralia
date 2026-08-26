/**
 * Stripe dashboard deep-links for admin surfaces.
 *
 * MUST be resolved server-side. Live-vs-test mode is only inferrable from the
 * `STRIPE_SECRET_KEY` prefix (`sk_test_` / `sk_live_`) — a server secret the browser
 * cannot read — so the URL is built in the service and shipped in the response
 * payload. Do NOT rebuild it client-side, and do NOT introduce a
 * `NEXT_PUBLIC_STRIPE_MODE` var to work around it.
 *
 * ⚠️ The id you pass is polymorphic. `PaymentEvent.paymentIntentId` holds a real
 * PaymentIntent (`pi_…`) for one-off payments, but a *prefixed invoice id*
 * (`invoice_in_…`) for subscription renewals — one field, two Stripe object types,
 * so every consumer has to branch on the prefix. `src/utils/affiliate/affiliate-attribution.ts`
 * documents the same convention for commission *lookups*; this is the display-side twin
 * (kept separate so a lookup-key change can't silently repoint admin links).
 */

export type StripeDashboardMode = "live" | "test";

const BASE = "https://dashboard.stripe.com";

/**
 * `sk_live_…` → live; anything else (including unset) → test.
 *
 * Fails safe toward `test`: a test id linked into the live dashboard 404s, whereas a
 * live id under /test at least lands on a recognisable "not found in test mode" page.
 */
export function resolveStripeDashboardMode(
  secretKey: string | undefined = process.env.STRIPE_SECRET_KEY
): StripeDashboardMode {
  return secretKey?.startsWith("sk_live_") ? "live" : "test";
}

/**
 * Strip the storage-only `invoice_` prefix so `invoice_in_123` links as invoice `in_123`.
 * Leaves every other id untouched.
 */
export function normalizeStripeObjectId(raw: string): string {
  return raw.startsWith("invoice_") ? raw.slice("invoice_".length) : raw;
}

/**
 * Deep-link for a Stripe object id, or `null` when the id is absent or its prefix is
 * unrecognised. Never guesses a path — a wrong link in a revenue ledger reads to an
 * operator as a missing record, which is worse than no link at all.
 */
export function stripeDashboardUrl(
  id: string | null | undefined,
  mode: StripeDashboardMode
): string | null {
  const raw = id?.trim();
  if (!raw) return null;

  const objectId = normalizeStripeObjectId(raw);
  const prefix = mode === "test" ? `${BASE}/test` : BASE;

  if (objectId.startsWith("pi_")) return `${prefix}/payments/${objectId}`;
  if (objectId.startsWith("in_")) return `${prefix}/invoices/${objectId}`;
  if (objectId.startsWith("cus_")) return `${prefix}/customers/${objectId}`;
  return null;
}
