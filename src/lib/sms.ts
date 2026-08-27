/**
 * Transactional SMS — Mobile Message gateway adapter.
 *
 * THE ONLY FILE THAT NAMES THE PROVIDER. Everything upstream calls `sendSms()`,
 * so swapping gateways (Cellcast, Twilio, …) is a change to this file plus three
 * env vars — nothing else. Keep it that way: no provider name in routes, services
 * or components (CLAUDE.md — vendor names live in config + one adapter module).
 *
 * WHAT THIS MODULE IS NOT
 * -----------------------
 * It does NOT generate, store, compare or expire one-time codes. That logic lives
 * with the routes that own it, mirroring the existing email-code path
 * (`/api/auth/verify-login-code`): crypto-random code, hashed at rest, short
 * expiry, attempt cap, `timingSafeEqual` compare, distributed rate limiter.
 * This module only puts a string on a handset.
 *
 * MARKETING SMS DOES NOT GO THROUGH HERE. Klaviyo owns marketing (see
 * `src/lib/klaviyo.ts` → `subscribeToSMSList`). This path is transactional only,
 * which is why `ignore_unsubscribes` is hard-set below — see the note on it.
 *
 * @module lib/sms
 */

import { randomUUID } from "crypto";
import { resilientFetch } from "@/lib/http/outbound";

const API_BASE = "https://api.mobilemessage.com.au";
const SEND_PATH = "/v1/messages";

/**
 * 1 credit = 1 SMS up to 160 GSM-7 characters; 161–306 costs 2. We pin
 * `max_parts: 1` on every send so a copy edit can never silently double the bill —
 * an over-long message is rejected by the gateway rather than quietly re-priced.
 */
const MAX_PARTS = 1;

export interface SendSmsResult {
  success: boolean;
  /** Gateway message id — persist it if you need to poll `GET /v1/messages` later. */
  messageId?: string;
  /** Per-message gateway status: `success` | `blocked` | `error`. */
  status?: string;
  /** Credits consumed. Expected to be 1 given `max_parts: 1`. */
  costCredits?: number;
  /** Set whenever `success` is false. Safe to log — never contains the message body. */
  error?: string;
  /** True when the send was skipped because `SMS_ENABLED` is not "true". */
  disabled?: boolean;
}

/**
 * Normalise an Australian mobile to E.164 (`+61…`), or `null` if it is not a
 * valid AU mobile.
 *
 * THE single normaliser. The repo grew six of these with three different
 * behaviours — notably the old `formatMobileNumber` handled a bare 9-digit number
 * starting `4` but not `5`, so a `+615…` number stored by the User pre-save hook
 * was handed to the gateway as `512345678`. This accepts both, matching the
 * model's hook and its validator. New callers MUST use this one.
 */
export function normaliseAuMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Strip everything that is not a digit or a leading plus.
  const cleaned = raw.replace(/[^\d+]/g, "");

  let national: string | null = null;
  if (/^\+61[45]\d{8}$/.test(cleaned)) national = cleaned.slice(3);
  else if (/^61[45]\d{8}$/.test(cleaned)) national = cleaned.slice(2);
  else if (/^0[45]\d{8}$/.test(cleaned)) national = cleaned.slice(1);
  else if (/^[45]\d{8}$/.test(cleaned)) national = cleaned;

  return national ? `+61${national}` : null;
}

/** True when `raw` is a valid Australian mobile in any accepted input form. */
export function isValidAuMobile(raw: string | null | undefined): boolean {
  return normaliseAuMobile(raw) !== null;
}

/**
 * E.164 (`+61412345678`) → the gateway's wire format (`61412345678`).
 * Mobile Message accepts `0412345678` or `61412345678` but NOT a leading `+`.
 */
export function toGatewayNumber(e164: string): string {
  return e164.replace(/^\+/, "");
}

/**
 * Opt-IN, mirroring `EMAIL_ENABLED`. Unset or anything other than "true" means
 * `sendSms` short-circuits — so merging this branch cannot text anyone or spend
 * credits until the flag is deliberately flipped.
 */
export function isSmsEnabled(): boolean {
  return process.env.SMS_ENABLED === "true";
}

/** The exact JSON body posted to the gateway. */
export interface SendPayload {
  max_parts: number;
  shorten_urls: false;
  ignore_unsubscribes: true;
  messages: Array<{ to: string; message: string; sender: string; custom_ref?: string }>;
}

/**
 * Build the request body. Pure and exported so the smoke script's `--dry-run`
 * previews the REAL payload rather than a hand-written copy that could drift —
 * and so the three load-bearing flags can be pinned by a unit test.
 *
 * @param e164   Already normalised (`+61…`); converted to wire format here.
 */
export function buildSendPayload(
  e164: string,
  message: string,
  sender: string,
  opts: { reference?: string } = {}
): SendPayload {
  return {
    max_parts: MAX_PARTS,
    shorten_urls: false,
    // Transactional ONLY. A member who once replied STOP to a marketing SMS
    // must still receive a login code they just asked for — without this the
    // send is silently dropped and they are locked out with no visible error.
    // Never set this on anything promotional; Klaviyo owns marketing.
    ignore_unsubscribes: true,
    messages: [
      {
        to: toGatewayNumber(e164),
        message,
        sender,
        ...(opts.reference ? { custom_ref: opts.reference } : {}),
      },
    ],
  };
}

interface GatewayResult {
  to?: string;
  status?: string;
  cost?: number;
  message_id?: string;
  error?: string;
}

interface GatewayResponse {
  status?: string;
  results?: GatewayResult[];
  error?: string;
  message?: string;
}

/**
 * Send one transactional SMS to an Australian mobile.
 *
 * Never throws — every failure path returns `{ success: false, error }` so a
 * gateway outage degrades the caller (resend prompt) instead of 500-ing it.
 *
 * @param mobile  Any accepted AU form; normalised internally.
 * @param message Body. Keep under 160 GSM-7 chars (see `MAX_PARTS`).
 * @param opts.reference Optional `custom_ref` for later lookup via `GET /v1/messages`.
 */
export async function sendSms(
  mobile: string,
  message: string,
  opts: { reference?: string } = {}
): Promise<SendSmsResult> {
  if (!isSmsEnabled()) {
    return { success: false, disabled: true, error: "SMS is disabled (SMS_ENABLED is not \"true\")" };
  }

  const username = process.env.MOBILE_MESSAGE_API_USERNAME;
  const password = process.env.MOBILE_MESSAGE_API_PASSWORD;
  const sender = process.env.MOBILE_MESSAGE_SENDER;

  if (!username || !password) {
    console.error("SMS: MOBILE_MESSAGE_API_USERNAME / _PASSWORD are not configured");
    return { success: false, error: "SMS service is not configured" };
  }
  if (!sender) {
    // The gateway rejects a message with no `sender`, so fail before spending a call.
    console.error("SMS: MOBILE_MESSAGE_SENDER is not configured");
    return { success: false, error: "SMS service is not configured" };
  }

  const e164 = normaliseAuMobile(mobile);
  if (!e164) {
    // Refuse non-AU / malformed numbers BEFORE the gateway is called. With no
    // provider-side geo restriction available, this app-side check is the spend
    // ceiling — see the verification spec §10.
    return { success: false, error: "Not a valid Australian mobile number" };
  }

  const auth = Buffer.from(`${username}:${password}`).toString("base64");

  let response: Response;
  try {
    response = await resilientFetch(
      `${API_BASE}${SEND_PATH}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${auth}`,
          // A transport retry must never deliver a second code or bill twice.
          // The gateway replays the original response instead of re-sending.
          "Idempotency-Key": randomUUID(),
        },
        body: JSON.stringify(buildSendPayload(e164, message, sender, opts)),
      },
      { label: "mobile-message", timeoutMs: 8_000, retries: 2 }
    );
  } catch (error) {
    // Transport gave up after retries. Body is never logged — it carries the code.
    console.error("SMS: transport failure", error instanceof Error ? error.message : error);
    return { success: false, error: "Could not reach the SMS service" };
  }

  let body: GatewayResponse | null = null;
  try {
    body = (await response.json()) as GatewayResponse;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const detail = body?.error || body?.message || `HTTP ${response.status}`;
    console.error(`SMS: gateway rejected request — ${detail}`);
    return { success: false, error: detail };
  }

  // A 200 does NOT mean delivered: per-message outcome lives in results[].status,
  // which can be "blocked" or "error" on an otherwise-successful HTTP call.
  const result = body?.results?.[0];
  if (!result || result.status !== "success") {
    const detail = result?.error || result?.status || "unknown gateway error";
    console.error(`SMS: send not accepted — ${detail}`);
    return { success: false, status: result?.status, error: detail };
  }

  return {
    success: true,
    messageId: result.message_id,
    status: result.status,
    costCredits: result.cost,
  };
}
