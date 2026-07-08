import { z } from "zod";

/**
 * Single source of truth for the funnel events the browser may mirror to the
 * server CAPI via POST /api/tracking/conversion.
 *
 * That endpoint is intentionally unauthenticated (it must accept guest funnel
 * traffic), so the server MUST constrain what can be constructed through it:
 * value-bearing events (Purchase, Subscribe, StartTrial, …) are excluded — a
 * forged Purchase here would inflate Meta-reported revenue with no server-side
 * record. Purchases reach CAPI only through the Stripe-webhook path
 * (trackPixelPurchase), which is gated on a real, verified payment.
 *
 * Shared (no "use client") so the client mirror helper, the server route's Zod
 * schema, and tests all derive from the same list.
 */
export const MIRROR_EVENT_NAMES = [
  "ViewContent",
  "AddToCart",
  "InitiateCheckout",
  "AddPaymentInfo",
  "Lead",
  "Search",
] as const;

export type MirrorEventName = (typeof MIRROR_EVENT_NAMES)[number];

export const mirrorEventNameSchema = z.enum(MIRROR_EVENT_NAMES);
