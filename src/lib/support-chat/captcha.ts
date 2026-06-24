/**
 * captcha.ts — server-side hCaptcha verifier.
 *
 * Fail-closed: any condition that cannot guarantee a genuine human challenge
 * returns `false`. The caller must treat `false` as "challenge required" and
 * must NOT fall back to allowing the request.
 *
 *   - Missing HCAPTCHA_SECRET → false (can't verify, fail closed).
 *   - Empty/missing token     → false (no challenge presented).
 *   - Fetch/parse throws      → false (network hiccup; console.error for ops;
 *                               do NOT silently allow).
 *   - hCaptcha returns {success:false} → false.
 *   - hCaptcha returns {success:true}  → true.
 *
 * The `fetchFn` dep is injectable so tests can supply a stub without making
 * a real network call. Mirrors the costGuard/escalation injection pattern.
 *
 * Layering: lib/support-chat — no DB, no models, no services.
 */

const SITEVERIFY_URL = "https://api.hcaptcha.com/siteverify";

/**
 * Verify an hCaptcha client token server-side.
 *
 * @param token     The `h-captcha-response` value from the client widget.
 * @param remoteIp  Optional; the client's IP, forwarded to hCaptcha for
 *                  risk scoring. Pass `ctx.ipHash` is NOT appropriate here
 *                  (that is already hashed; pass the raw IP from the request
 *                  header before hashing). Can be omitted safely.
 * @param deps      Injectable fetch (default `globalThis.fetch`). Only used
 *                  in tests.
 */
export async function verifyHcaptcha(
  token: string,
  remoteIp?: string,
  deps?: { fetchFn?: typeof fetch }
): Promise<boolean> {
  const secret = process.env.HCAPTCHA_SECRET;
  if (!secret) {
    // Fail closed — we cannot verify without the secret.
    return false;
  }

  if (!token || token.trim() === "") {
    // No token presented — fail closed.
    return false;
  }

  const fetchFn = deps?.fetchFn ?? globalThis.fetch;

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) {
    body.set("remoteip", remoteIp);
  }

  try {
    const res = await fetchFn(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch (err) {
    // Network/parse error — fail closed; log for ops (console.error survives
    // prod build's removeConsole; console.log/warn do not).
    console.error("[hCaptcha] siteverify request failed", err);
    return false;
  }
}
