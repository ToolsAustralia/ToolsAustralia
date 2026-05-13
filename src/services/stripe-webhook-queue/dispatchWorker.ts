/**
 * Internal helper for dispatching a queue row to the worker route.
 * Used by:
 *   - the receiver's `after()` fan-out (high-frequency, happy path)
 *   - the sweeper cron (catches stuck rows + retries)
 *   - the admin "Replay" button
 *
 * Two operational gotchas that this helper papers over:
 *
 * 1. Vercel Deployment Protection. On Pro tier, the per-deployment URLs
 *    (`*.vercel.app`) are gated by Vercel's auth/protection layer by default.
 *    An internal POST without auth gets `429` from Vercel's edge BEFORE the
 *    function ever runs — no function log appears either way, which makes
 *    this a nightmare to debug.
 *
 *    We mitigate two ways:
 *      a) Prefer `NEXT_PUBLIC_SITE_URL` (your custom domain) over
 *         `VERCEL_URL` (the protected per-deployment URL).
 *      b) If `VERCEL_AUTOMATION_BYPASS_SECRET` is set, include it as
 *         `x-vercel-protection-bypass`. Generate this in Vercel Dashboard →
 *         Settings → Deployment Protection → Protection Bypass for Automation.
 *
 * 2. Silent fetch failures. `fetch()` only throws on network errors; a 4xx
 *    or 5xx response is a normal return value. The original implementation
 *    ignored the status entirely, so a 429-from-protection looked identical
 *    to "everything fine, worker is doing its job." We now log non-2xx
 *    responses with a hint when the status is 429.
 */
export async function dispatchToWorker(eventId: string, source: string): Promise<void> {
  const workerSecret = process.env.STRIPE_WORKER_INTERNAL_SECRET;
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

  // Prefer the public custom domain — it's not behind Vercel Deployment
  // Protection. Fall back to the per-deployment URL only when no public URL
  // is configured (e.g. early bring-up, brand-new deploy without a domain).
  const baseUrl = resolveBaseUrl();

  try {
    const res = await fetch(`${baseUrl}/api/stripe/process-event`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": workerSecret ?? "",
        ...(bypassSecret ? { "x-vercel-protection-bypass": bypassSecret } : {}),
      },
      body: JSON.stringify({ eventId }),
    });

    if (!res.ok) {
      const hint =
        res.status === 429
          ? " — likely Vercel Deployment Protection. Set VERCEL_AUTOMATION_BYPASS_SECRET on this deployment, " +
            "or point NEXT_PUBLIC_SITE_URL at an unprotected custom domain."
          : res.status === 401
            ? " — STRIPE_WORKER_INTERNAL_SECRET mismatch between receiver/sweeper and worker."
            : "";
      console.error(
        `[${source}] dispatchToWorker eventId=${eventId} got HTTP ${res.status} from ${baseUrl}/api/stripe/process-event${hint}`
      );
    }
  } catch (err) {
    console.error(`[${source}] dispatchToWorker eventId=${eventId} threw:`, err);
  }
}

function resolveBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
