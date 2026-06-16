/**
 * Outbound third-party HTTP transport (Klaviyo, Meta Conversions API, …).
 *
 * WHY THIS EXISTS — the "TypeError: fetch failed" production incident
 * -------------------------------------------------------------------
 * Node's global `fetch` (undici) keeps a pool of HTTP/1.1 keep-alive sockets.
 * On Vercel the serverless function is FROZEN between invocations. While it is
 * frozen, a remote (a.klaviyo.com, graph.facebook.com, or their load balancer)
 * can close an idle socket that undici still believes is alive. On the next
 * thaw undici grabs that dead socket from the pool, writes the request, and the
 * write fails — surfacing as the generic `TypeError: fetch failed` whose
 * `error.cause.code` is `UND_ERR_SOCKET` ("other side closed") or `ECONNRESET`.
 *
 * Stripe and MongoDB are immune because they use their own keep-alive agents /
 * pooled drivers with dead-socket detection — only raw undici `fetch` is exposed.
 *
 * THE FIX (defense in depth)
 * --------------------------
 *   1. `outboundAgent` — an undici `Agent` whose keep-alive windows are bounded
 *      to ~10s (undici's default `keepAliveMaxTimeout` is 600s, which lets a
 *      socket be reused long after the freeze). This SHRINKS the reuse window.
 *   2. A per-call retry (see `resilientFetch`, or the Klaviyo client's own retry
 *      loop) that obtains a fresh socket — this CLOSES the residual freeze race,
 *      which tuning alone cannot fully eliminate (nodejs/node#47130).
 *   3. `describeFetchError` — surfaces `error.cause.code` so the next incident is
 *      diagnosable instead of an opaque "fetch failed".
 *
 * Scoped via the per-request `dispatcher` option — deliberately NOT
 * `setGlobalDispatcher`, so latency-sensitive internal fetches keep undici's
 * defaults and this change cannot regress unrelated requests.
 *
 * New outbound third-party integrations SHOULD route through `outboundFetch`
 * (or `resilientFetch`) rather than calling global `fetch` directly.
 *
 * @module lib/http/outbound
 */

import { Agent } from "undici";

/**
 * Shared keep-alive-bounded dispatcher for outbound third-party calls.
 * Module-level singleton: created once per cold start, reused across warm
 * invocations (same lifecycle as the clients that use it).
 */
export const outboundAgent = new Agent({
  // Close a client-side idle socket after 4s — covers the common warm-burst case
  // where the remote dropped its end after its own (often ~5s) idle timeout.
  keepAliveTimeout: 4_000,
  // Never honor a server's `Keep-Alive` hint beyond 10s (undici default: 600s).
  // This is the load-bearing tweak: it stops undici from clinging to a socket
  // that outlived the freeze.
  keepAliveMaxTimeout: 10_000,
  // Fail fast if a *fresh* TCP/TLS connection stalls, rather than hanging to the
  // caller's much longer overall timeout.
  connect: { timeout: 10_000 },
});

/** `RequestInit` plus undici's `dispatcher` extension (not in the DOM lib typings). */
type FetchInitWithDispatcher = RequestInit & { dispatcher?: Agent };

/**
 * Global `fetch` routed through {@link outboundAgent}.
 *
 * Uses the GLOBAL `fetch` (not undici's exported `fetch`) on purpose, so the
 * returned value is a global `Response` and `instanceof Response` checks in
 * callers (e.g. the Klaviyo client) keep working.
 */
export function outboundFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, dispatcher: outboundAgent } as FetchInitWithDispatcher);
}

/** Undici cause-code shape (subset we care about for logging/retry classification). */
interface UndiciCause {
  code?: string;
  message?: string;
}

/**
 * Extract the real reason behind an undici `fetch failed`.
 *
 * undici hides the actionable detail in `error.cause` (e.g.
 * `{ code: 'UND_ERR_SOCKET', message: 'other side closed' }`). Log the result so
 * a future incident can be told apart: `UND_ERR_SOCKET`/`ECONNRESET` → keep-alive
 * race; `EAI_AGAIN` → DNS; `UND_ERR_CONNECT_TIMEOUT` → connect stall; `ECONNREFUSED`
 * → egress/host.
 */
export function describeFetchError(error: unknown): {
  message: string;
  code?: string;
  causeMessage?: string;
} {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? (error.cause as UndiciCause | undefined) : undefined;
  return { message, code: cause?.code, causeMessage: cause?.message };
}

/** undici `error.cause.code`s that mean "transient transport fault — a fresh socket should succeed". */
const RETRYABLE_CAUSE_CODES = new Set([
  "UND_ERR_SOCKET", // kept-alive socket closed by remote ("other side closed")
  "ECONNRESET",
  "EPIPE",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EAI_AGAIN", // transient DNS
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

export interface ResilientFetchOptions {
  /** Per-attempt timeout via AbortController. Default 5000ms. */
  timeoutMs?: number;
  /** Additional attempts AFTER the first. Default 2 (so up to 3 total). */
  retries?: number;
  /** Base backoff in ms; grows exponentially with jitter. Default 300ms. */
  baseDelayMs?: number;
  /** Label for log lines. */
  label?: string;
}

/**
 * `outboundFetch` + per-attempt timeout + bounded retry with backoff.
 *
 * Retries ONLY transient faults — network/socket errors, aborts (timeout), and
 * 429/5xx responses. Never retries a 4xx (client error). Safe for endpoints that
 * are idempotent or deduplicate server-side (Klaviyo ingestion is idempotent;
 * Meta CAPI dedups on `event_id`).
 *
 * Returns the final `Response` (including a non-retryable 4xx, so the caller can
 * read the body); throws only if every attempt failed at the transport layer.
 */
export async function resilientFetch(
  url: string,
  init: RequestInit = {},
  opts: ResilientFetchOptions = {}
): Promise<Response> {
  const { timeoutMs = 5_000, retries = 2, baseDelayMs = 300, label = "outbound" } = opts;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await outboundFetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);

      // Transient server error — retry if we have attempts left, else hand it back.
      if ((response.status === 429 || response.status >= 500) && attempt < retries) {
        lastError = new Error(`${label}: HTTP ${response.status}`);
      } else {
        return response;
      }
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      const isAbort = error instanceof Error && error.name === "AbortError";
      const { code } = describeFetchError(error);
      // Unknown-code network errors (bare "fetch failed") are treated as retryable.
      const retryable = isAbort || (code ? RETRYABLE_CAUSE_CODES.has(code) : true);
      if (!retryable || attempt >= retries) {
        throw error;
      }
    }

    // Backoff before the next attempt (a fresh socket almost always succeeds).
    const delay = baseDelayMs * 2 ** attempt + Math.random() * 100;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
