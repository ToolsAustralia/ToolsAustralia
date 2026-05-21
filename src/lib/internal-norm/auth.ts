// src/lib/internal-norm/auth.ts
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const CLOCK_SKEW_MS = 30_000;
const NONCE_TTL_MS = 5 * 60_000;

type Verdict =
  | { ok: true }
  | {
      ok: false;
      status: number;
      reason:
        | "missing-bearer"
        | "bad-bearer"
        | "missing-headers"
        | "stale-timestamp"
        | "replay"
        | "bad-signature"
        | "misconfigured";
    };

export type NormAuthVerdict = Verdict;

type NormAuthGlobal = typeof globalThis & {
  __normNonceCache?: Map<string, number>;
};

/**
 * Per-process nonce cache. Survives Next.js hot-reload via globalThis.
 *
 * LIMITATION: in a multi-instance deployment (Vercel Lambda, multi-region),
 * each instance has its own cache — a replayed request against a different
 * instance within the 30s skew window would not be rejected. Acceptable for
 * Norm today (low-volume, requires both bearer + signing secret to forge
 * in the first place). If Norm volume or threat model changes, back this
 * with Redis/Mongo and remove the in-memory cache.
 */
function nonceCache(): Map<string, number> {
  const g = globalThis as NormAuthGlobal;
  if (!g.__normNonceCache) g.__normNonceCache = new Map();
  return g.__normNonceCache;
}

function purgeExpired(now: number) {
  const cache = nonceCache();
  for (const [n, ts] of cache) {
    if (ts + NONCE_TTL_MS < now) cache.delete(n);
  }
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function buildSigningString(
  method: string,
  path: string,
  query: string,
  rawBody: string,
  timestamp: string,
  nonce: string,
): string {
  return [method, path, query, sha256(rawBody), timestamp, nonce].join("\n");
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

export async function verifyNormRequest(input: {
  method: string;
  path: string;
  query: string;
  rawBody: string;
  bearer: string | null;
  timestamp: string | null;
  nonce: string | null;
  signature: string | null;
}): Promise<Verdict> {
  const expectedBearer = process.env.NORM_BEARER_TOKEN;
  const signingSecret = process.env.NORM_SIGNING_SECRET;
  if (!expectedBearer || !signingSecret) {
    return { ok: false, status: 500, reason: "misconfigured" };
  }
  if (!input.bearer) return { ok: false, status: 401, reason: "missing-bearer" };
  if (
    input.bearer.length !== expectedBearer.length ||
    !timingSafeEqual(Buffer.from(input.bearer), Buffer.from(expectedBearer))
  ) {
    return { ok: false, status: 401, reason: "bad-bearer" };
  }
  if (!input.timestamp || !input.nonce || !input.signature) {
    return { ok: false, status: 401, reason: "missing-headers" };
  }

  const now = Date.now();
  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > CLOCK_SKEW_MS) {
    return { ok: false, status: 401, reason: "stale-timestamp" };
  }

  purgeExpired(now);
  if (nonceCache().has(input.nonce)) {
    return { ok: false, status: 401, reason: "replay" };
  }

  const signingString = buildSigningString(
    input.method,
    input.path,
    input.query,
    input.rawBody,
    input.timestamp,
    input.nonce,
  );
  const expected = createHmac("sha256", signingSecret).update(signingString).digest("hex");
  if (!safeEqualHex(expected, input.signature)) {
    return { ok: false, status: 401, reason: "bad-signature" };
  }

  nonceCache().set(input.nonce, now);
  return { ok: true };
}
