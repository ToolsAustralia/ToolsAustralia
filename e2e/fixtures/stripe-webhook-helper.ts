// e2e/fixtures/stripe-webhook-helper.ts
//
// Posts crafted Stripe webhook events to /api/stripe/webhook using the
// dev-only `test_bypass` signature (see route.ts:4857). NODE_ENV must be
// "development" — playwright.config webServer runs `npm run dev` so this
// is satisfied.

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export interface StripeEventPayload {
  type: string;
  data: { object: Record<string, unknown> };
}

/**
 * POST a fake Stripe event to the local webhook endpoint.
 * Generates a unique event ID per call so ProcessedStripeEvent doesn't dedupe.
 */
export async function postWebhook(
  eventType: string,
  eventData: Record<string, unknown>,
): Promise<Response> {
  const event = {
    id: `evt_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    object: "event",
    type: eventType,
    api_version: "2025-08-27.basil",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: { object: eventData },
  };
  return fetch(`${BASE_URL}/api/stripe/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": "test_bypass",
    },
    body: JSON.stringify(event),
  });
}
