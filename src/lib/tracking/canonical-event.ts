// src/lib/tracking/canonical-event.ts
import crypto from "crypto";
import type { CanonicalEvent } from "./types";

/** Unix seconds. */
export function eventTimeNow(): number {
  return Math.floor(Date.now() / 1000);
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
}

/**
 * Build a Purchase CanonicalEvent. Pure — no side effects, no env reads.
 * Callers can build once and pass to both browser and server dispatchers.
 */
export function buildPurchaseEvent(input: BuildPurchaseEventInput): CanonicalEvent {
  return {
    eventName: "Purchase",
    eventId: input.eventId,
    eventTime: eventTimeNow(),
    value: input.value,
    currency: input.currency.toUpperCase(),
    userData: input.userData,
    customData: input.customData,
    eventSourceUrl: input.eventSourceUrl,
  };
}
