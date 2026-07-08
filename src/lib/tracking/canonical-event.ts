// src/lib/tracking/canonical-event.ts
import crypto from "crypto";
import type { CanonicalEvent } from "./types";

/** Unix seconds. */
export function eventTimeNow(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Normalize an epoch that may be milliseconds OR seconds into Unix seconds.
 * The webhook layer stores `paymentMetadata.created` in ms (`paymentIntent.created * 1000`)
 * while other paths use seconds — and Meta rejects the ENTIRE /events request when any
 * event_time is out of range, so an ms epoch must never reach the wire. The `> 1e11`
 * cutoff is deterministic: unix seconds stay below 1e11 until year 5138.
 */
export function normalizeEpochToUnixSeconds(value?: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.floor(value > 1e11 ? value / 1000 : value);
}

// Meta accepts event_time up to 7 days in the past; keep a 1h safety margin so an
// event queued near the boundary can't invalidate the request it ships in.
const MAX_EVENT_AGE_SECONDS = 7 * 24 * 60 * 60 - 60 * 60;
const MAX_EVENT_FUTURE_SKEW_SECONDS = 60;

/**
 * Validate a proposed event_time (Unix seconds) against Meta's accepted window,
 * falling back to "now". Guarantees the returned value can never cause Meta to
 * reject the request — the worst case is the pre-fix behavior (send time).
 */
export function resolveEventTime(unixSeconds?: number): number {
  const now = eventTimeNow();
  if (
    typeof unixSeconds !== "number" ||
    !Number.isFinite(unixSeconds) ||
    unixSeconds < now - MAX_EVENT_AGE_SECONDS ||
    unixSeconds > now + MAX_EVENT_FUTURE_SKEW_SECONDS
  ) {
    return now;
  }
  return Math.floor(unixSeconds);
}

/** SHA256 hash for PII — Meta/TikTok/Snap all require lowercase, trimmed, hex SHA256. */
export function hashPII(value: string): string {
  return crypto.createHash("sha256").update(value.toLowerCase().trim()).digest("hex");
}

/**
 * Validate that a CanonicalEvent has the fields required for dual-fire dedup.
 * Throws in development (programmer error). Returns false in production (never break checkout).
 */
export function assertValidEvent(event: CanonicalEvent): boolean {
  const missing: string[] = [];
  if (!event.eventName || typeof event.eventName !== "string") missing.push("eventName");
  if (!event.eventId || typeof event.eventId !== "string" || event.eventId.trim() === "") {
    missing.push("eventId");
  }
  if (typeof event.eventTime !== "number" || !Number.isFinite(event.eventTime)) {
    missing.push("eventTime");
  }
  if (missing.length === 0) return true;

  const msg = `CanonicalEvent missing required fields: ${missing.join(", ")}`;
  if (process.env.NODE_ENV === "development") {
    throw new Error(msg);
  }
  console.error("[tracking]", msg, { event_name: event.eventName });
  return false;
}

export interface BuildPurchaseEventInput {
  /** Decimal dollars (NOT cents). */
  value: number;
  /** ISO 4217 currency code. */
  currency: string;
  /**
   * The id that will dedupe browser pixel ↔ CAPI. Use paymentIntentId or orderId.
   * MUST be the same value passed to both `trackConversion` (browser) and `sendConversion` (server).
   */
  eventId: string;
  userData?: CanonicalEvent["userData"];
  customData?: CanonicalEvent["customData"];
  eventSourceUrl?: string;
  /**
   * Defaults to "website". Set to "system_generated" for Stripe webhook flows
   * where no live browser session exists — Meta's spec makes `event_source_url`
   * optional in that case and treats the event as backend-attributed.
   */
  actionSource?: "website" | "system_generated";
  /**
   * Unix SECONDS when the purchase actually occurred (Stripe charge `created`,
   * invoice `status_transitions.paid_at`). Meta books the conversion at event_time,
   * so defaulting to the send moment shifts purchases paid just before midnight
   * into the next day whenever the webhook lands after it. Values outside Meta's
   * accepted window fall back to "now" (see resolveEventTime) — a bad timestamp
   * can only ever degrade to the old behavior, never reject the event.
   */
  eventTimeUnixSeconds?: number;
}

/**
 * Build a Purchase CanonicalEvent. Pure — no side effects, no env reads.
 * Callers can build once and pass to both browser and server dispatchers.
 */
export function buildPurchaseEvent(input: BuildPurchaseEventInput): CanonicalEvent {
  return {
    eventName: "Purchase",
    eventId: input.eventId,
    eventTime: resolveEventTime(input.eventTimeUnixSeconds),
    value: input.value,
    currency: input.currency.toUpperCase(),
    userData: input.userData,
    customData: input.customData,
    eventSourceUrl: input.eventSourceUrl,
    actionSource: input.actionSource,
  };
}
